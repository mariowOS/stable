// mariowOS builder note: user accounts.
//
// The account created at first setup is the OWNER: always an administrator, it keeps
// its password, home folder and notes where they always were (config.passwordHash,
// desktop/home, desktop/notes-db.json), so single-user installs are unchanged.
// Anyone else lives in config.users with their own password hash, admin flag and home
// under user-homes/<id>/. The signed-in user travels with each request (AsyncLocalStorage),
// so the file, trash and notes routes resolve "/home" to that user's own folder without
// every route having to pass it along.
//
// The GUEST account exists while an administrator turns it on (config.guestEnabled): a
// standard account with no password whose home starts empty and is wiped on sign-out.
// Standard accounts can have LIMITS set by an administrator (parental controls):
// { blockedApps: [app ids], from: "HH:MM", to: "HH:MM" } — apps they cannot open and the
// hours they may be signed in.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");

const OWNER_ID = "owner";
const GUEST_ID = "guest";
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Keeps only what the limits may hold; null when nothing is limited.
function cleanLimits(input) {
  if (!input || typeof input !== "object") return null;
  const blockedApps = Array.isArray(input.blockedApps)
    ? [...new Set(input.blockedApps.filter(id => typeof id === "string" && /^[\w-]{1,40}$/.test(id)))].slice(0, 60) : [];
  const hours = TIME_RE.test(input.from) && TIME_RE.test(input.to) && input.from !== input.to;
  if (!blockedApps.length && !hours) return null;
  return { blockedApps, from: hours ? input.from : null, to: hours ? input.to : null };
}

// Whether `limits` allow being signed in at `date` (hours may cross midnight: 20:00-07:00).
function withinHours(limits, date = new Date()) {
  if (!limits || !limits.from || !limits.to) return true;
  const minutes = date.getHours() * 60 + date.getMinutes();
  const [from, to] = [limits.from, limits.to].map(time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3)));
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}
const HOME_FOLDERS = ["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos"];
const USERNAME_RE = /^[\p{L}\p{N} ._-]{1,32}$/u;

function createUsers({ baseDir, getConfig, saveConfig }) {
  const context = new AsyncLocalStorage();
  const homesDir = path.join(baseDir, "user-homes");
  const ownerHome = path.join(baseDir, "desktop", "home");

  const records = () => {
    const config = getConfig();
    if (!Array.isArray(config.users)) config.users = [];
    return config.users;
  };
  const owner = () => {
    const config = getConfig();
    return { id: OWNER_ID, username: config.username || "Owner", admin: true, owner: true, passwordHash: config.passwordHash || null };
  };
  const guest = () => {
    const config = getConfig();
    return config.guestEnabled === true
      ? { id: GUEST_ID, username: "Guest", admin: false, owner: false, guest: true, passwordHash: null, limits: cleanLimits(config.guestLimits) }
      : null;
  };
  // Full records, password hashes included: never send these to a client.
  const all = () => [owner(), ...records().map(user => ({ ...user, admin: !!user.admin, owner: false })), ...(guest() ? [guest()] : [])];
  const find = id => all().find(user => user.id === id) || null;
  const toPublic = user => user && {
    id: user.id, username: user.username, admin: !!user.admin, owner: !!user.owner, guest: !!user.guest,
    limits: user.admin ? null : cleanLimits(user.limits)
  };

  const homeOf = user => (!user || user.id === OWNER_ID) ? ownerHome : path.join(homesDir, user.id);
  const notesFileOf = user => (!user || user.id === OWNER_ID) ? path.join(baseDir, "desktop", "notes-db.json") : path.join(homeOf(user), ".notes-db.json");
  const avatarOf = user => (!user || user.id === OWNER_ID) ? path.join(baseDir, "desktop", "assets", "avatar.user.png") : path.join(homeOf(user), ".avatar.png");

  function ensureHome(user) {
    const home = homeOf(user);
    HOME_FOLDERS.forEach(folder => fs.mkdirSync(path.join(home, folder), { recursive: true }));
    return home;
  }

  // Express middleware: run the rest of the request as the session's user.
  // No session (fresh install, public GETs) behaves as before: the owner.
  // A session for an account that was removed is over: it never falls back to anyone.
  function middleware(readSession, clearSession) {
    return (req, res, next) => {
      const session = readSession(req);
      if (session && session.uid && !find(session.uid)) {
        clearSession(res);
        return res.status(401).json({ success: false, error: "This account no longer exists. Sign in again." });
      }
      const user = (session && session.uid && find(session.uid)) || owner();
      req.user = toPublic(user);
      context.run({ user }, next);
    };
  }
  const current = () => context.getStore()?.user || owner();

  function validateName(username, exceptId) {
    const name = String(username || "").trim();
    if (!USERNAME_RE.test(name)) return { error: "Names can be 1-32 letters, numbers, spaces, dots, dashes or underscores." };
    if (all().some(user => user.id !== exceptId && user.username.toLowerCase() === name.toLowerCase())) return { error: "Another account already has this name." };
    return { name };
  }

  function create({ username, passwordHash, admin }) {
    const id = "u" + crypto.randomBytes(6).toString("hex");
    const record = { id, username, passwordHash, admin: !!admin, createdAt: Date.now() };
    records().push(record);
    saveConfig();
    ensureHome(record);
    return toPublic({ ...record, owner: false });
  }

  function update(id, patch) {
    const record = records().find(user => user.id === id);
    if (!record) return null;
    Object.assign(record, patch);
    saveConfig();
    return toPublic({ ...record, owner: false });
  }

  function remove(id, { deleteFiles = false } = {}) {
    const list = records();
    const index = list.findIndex(user => user.id === id);
    if (index < 0) return false;
    const [record] = list.splice(index, 1);
    saveConfig();
    if (deleteFiles) fs.rmSync(homeOf(record), { recursive: true, force: true });
    return true;
  }

  const adminCount = () => all().filter(user => user.admin).length;

  // The guest's home is emptied when the guest signs in and when they sign out.
  function resetGuest() {
    fs.rmSync(homeOf({ id: GUEST_ID }), { recursive: true, force: true });
    ensureHome({ id: GUEST_ID });
  }
  function setGuest(enabled) {
    getConfig().guestEnabled = !!enabled;
    saveConfig();
    if (!enabled) fs.rmSync(homeOf({ id: GUEST_ID }), { recursive: true, force: true });
  }
  function setLimits(id, limits) {
    if (id === GUEST_ID) { getConfig().guestLimits = cleanLimits(limits); saveConfig(); return find(GUEST_ID); }
    return update(id, { limits: cleanLimits(limits) });
  }

  return { OWNER_ID, GUEST_ID, homesDir, all, find, toPublic, current, middleware, homeOf, notesFileOf, avatarOf, ensureHome, validateName, create, update, remove, adminCount, resetGuest, setGuest, setLimits };
}

module.exports = { createUsers, OWNER_ID, GUEST_ID, HOME_FOLDERS, cleanLimits, withinHours };
