const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createUsers, cleanLimits, withinHours, GUEST_ID } = require("../lib/users");

const at = (h, m) => new Date(2026, 0, 1, h, m);

test("allowed hours, also across midnight", () => {
  assert.equal(withinHours(null, at(3, 0)), true, "no limits: always");
  const day = { from: "08:00", to: "20:00" };
  assert.equal(withinHours(day, at(8, 0)), true);
  assert.equal(withinHours(day, at(19, 59)), true);
  assert.equal(withinHours(day, at(20, 0)), false);
  assert.equal(withinHours(day, at(7, 59)), false);
  const night = { from: "20:00", to: "07:00" };
  assert.equal(withinHours(night, at(23, 0)), true);
  assert.equal(withinHours(night, at(6, 30)), true);
  assert.equal(withinHours(night, at(12, 0)), false);
});

test("limits keep only valid values", () => {
  assert.equal(cleanLimits({}), null);
  assert.equal(cleanLimits({ blockedApps: [], from: "08:00", to: "08:00" }), null, "same start and end is no limit");
  assert.deepEqual(cleanLimits({ blockedApps: ["popup8", "popup8", "../x", 5], from: "25:00", to: "07:00" }), { blockedApps: ["popup8"], from: null, to: null });
  assert.deepEqual(cleanLimits({ from: "21:30", to: "06:00" }), { blockedApps: [], from: "21:30", to: "06:00" });
});

test("the guest exists only while enabled and starts empty", t => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "mariowos-users-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));
  const config = {};
  const users = createUsers({ baseDir, getConfig: () => config, saveConfig: () => {} });
  assert.equal(users.find(GUEST_ID), null);
  users.setGuest(true);
  const guest = users.find(GUEST_ID);
  assert.equal(guest.guest, true);
  assert.equal(guest.admin, false);
  users.resetGuest();
  const file = path.join(users.homeOf(guest), "Documents", "left-behind.txt");
  fs.writeFileSync(file, "x");
  users.resetGuest();
  assert.equal(fs.existsSync(file), false, "a new guest session does not see the last one's files");
  users.setLimits(GUEST_ID, { blockedApps: ["popup7"] });
  assert.deepEqual(users.toPublic(users.find(GUEST_ID)).limits.blockedApps, ["popup7"]);
  users.setGuest(false);
  assert.equal(users.find(GUEST_ID), null);
});
