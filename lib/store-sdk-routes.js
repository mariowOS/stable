// Store routes for the app SDK: an app's manifest (mariowos.json) before installing it, and
// the permissions the user granted to installed apps. The permissions themselves are enforced
// by the desktop (desktop/assets/sdk-host.js), which reads them from /get-settings.
//
// Wiring (server.js):
//   const { registerStoreSdkRoutes } = require("./store-sdk-routes");
//   registerStoreSdkRoutes(app, { getConfig: () => config, saveConfig, appsDir: path.join(__dirname, "desktop/apps") });
//
// deps:
//   getConfig()  -> the live config object (reads config.installedApps)
//   saveConfig() -> persists it
//   appsDir      -> folder that holds the installed apps (desktop/apps)
//   fetch        -> optional, defaults to the global fetch (tests pass a fake)
//   isAdmin(req) -> optional, defaults to req.user.admin; only admins change permissions

const fs = require("fs");
const path = require("path");
const { isAllowedRepoUrl, getRepoRawUrls } = require("./validation");
const { parseAppManifest, grantablePermissions, sanitizePermissions, MAX_MANIFEST_BYTES } = require("./app-manifest");

const MANIFEST_FILE = "mariowos.json";
const CACHE_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const TRUSTED_OWNERS = new Set(["mariowos", "mariowstech"]);

const isValidAppId = appId => typeof appId === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(appId);

// Same rule as server.js isThirdPartyApp: apps of the mariowOS team run with the system.
function isTrustedRepo(repoUrl) {
  if (!repoUrl) return true; // built into the OS
  const owner = String(repoUrl).match(/^https:\/\/(?:raw\.githubusercontent\.com|github\.com)\/([^/]+)\//i);
  return !!owner && TRUSTED_OWNERS.has(owner[1].toLowerCase());
}

// The manifest shipped with an installed app (null when it has none or it is unreadable).
function readLocalManifest(appsDir, appId) {
  if (!appsDir || !isValidAppId(appId)) return null;
  const file = path.join(appsDir, appId, MANIFEST_FILE);
  try {
    if (fs.statSync(file).size > MAX_MANIFEST_BYTES) return parseAppManifest("x".repeat(MAX_MANIFEST_BYTES + 1));
    return parseAppManifest(fs.readFileSync(file, "utf8"));
  } catch (e) { return null; }
}

// For the install route: what the user approved in the Store (`requested`), limited to what
// the freshly installed app declares in its own mariowos.json.
function resolveGrantedPermissions(requested, appDir) {
  let declared = [];
  try {
    const file = path.join(appDir, MANIFEST_FILE);
    if (fs.statSync(file).size <= MAX_MANIFEST_BYTES) declared = parseAppManifest(fs.readFileSync(file, "utf8")).permissions;
  } catch (e) {}
  return grantablePermissions(requested, declared);
}

function describeInstalled(installed, appsDir) {
  const manifest = readLocalManifest(appsDir, installed.appId);
  const trusted = isTrustedRepo(installed.repoUrl);
  return {
    appId: installed.appId,
    title: typeof installed.title === "string" ? installed.title : installed.appId,
    icon: typeof installed.icon === "string" ? installed.icon : null,
    repoUrl: typeof installed.repoUrl === "string" ? installed.repoUrl : null,
    trusted,
    category: manifest ? manifest.category : null,
    declared: manifest ? manifest.permissions : [],
    granted: sanitizePermissions(installed.grantedPermissions)
  };
}

function registerStoreSdkRoutes(app, deps) {
  const { getConfig, saveConfig, appsDir } = deps || {};
  if (typeof getConfig !== "function" || typeof saveConfig !== "function") throw new Error("registerStoreSdkRoutes needs getConfig and saveConfig");
  const doFetch = deps.fetch || ((...args) => fetch(...args));
  const isAdmin = deps.isAdmin || (req => !!(req.user && req.user.admin));
  const manifestCache = new Map();

  async function fetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await doFetch(url, { signal: controller.signal, headers: { "User-Agent": "mariowOS-Store" } });
      if (!response.ok) return null;
      const text = await response.text();
      return text;
    } finally { clearTimeout(timer); }
  }

  // GET /api/store/manifest?repo=<github repo url>  ->  { success, manifest: {...} | null }
  app.get("/api/store/manifest", async (req, res) => {
    const repoUrl = String(req.query.repo || "");
    if (!isAllowedRepoUrl(repoUrl)) return res.status(400).json({ success: false, error: "Not a GitHub repository" });
    const cached = manifestCache.get(repoUrl);
    if (cached && Date.now() - cached.at < CACHE_MS) return res.json({ success: true, manifest: cached.manifest });
    let manifest = null;
    let reachable = false;
    for (const url of getRepoRawUrls(repoUrl, MANIFEST_FILE)) {
      try {
        const text = await fetchText(url);
        reachable = true;
        if (text == null) continue;
        manifest = parseAppManifest(text);
        break;
      } catch (e) {}
    }
    // A network failure is not cached, so the next visit tries again.
    if (reachable) {
      if (manifestCache.size > 500) manifestCache.clear();
      manifestCache.set(repoUrl, { at: Date.now(), manifest });
    }
    res.json({ success: true, manifest });
  });

  // GET /api/store/app-permissions            -> { success, apps: [...] }
  // GET /api/store/app-permissions?appId=<id> -> { success, app }
  app.get("/api/store/app-permissions", (req, res) => {
    const installedApps = Array.isArray(getConfig().installedApps) ? getConfig().installedApps : [];
    if (req.query.appId !== undefined) {
      const installed = installedApps.find(item => item && item.appId === req.query.appId);
      if (!installed) return res.status(404).json({ success: false, error: "App not installed" });
      return res.json({ success: true, app: describeInstalled(installed, appsDir) });
    }
    res.json({ success: true, apps: installedApps.filter(item => item && isValidAppId(item.appId)).map(item => describeInstalled(item, appsDir)) });
  });

  // POST /api/store/app-permissions { appId, grantedPermissions: [...] } -> { success, granted }
  // Only permissions the installed app declares can be granted; anything can be revoked.
  app.post("/api/store/app-permissions", (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ success: false, code: "ADMIN_ONLY", error: "Only an administrator can do this." });
    const { appId, grantedPermissions } = req.body || {};
    if (!isValidAppId(appId)) return res.status(400).json({ success: false, error: "Invalid app ID" });
    if (!Array.isArray(grantedPermissions)) return res.status(400).json({ success: false, error: "grantedPermissions must be a list" });
    const config = getConfig();
    const installed = (config.installedApps || []).find(item => item && item.appId === appId);
    if (!installed) return res.status(404).json({ success: false, error: "App not installed" });
    const manifest = readLocalManifest(appsDir, appId);
    const current = sanitizePermissions(installed.grantedPermissions);
    const declared = new Set([...(manifest ? manifest.permissions : []), ...current]);
    installed.grantedPermissions = sanitizePermissions(grantedPermissions).filter(id => declared.has(id));
    saveConfig();
    res.json({ success: true, granted: installed.grantedPermissions });
  });
}

module.exports = { registerStoreSdkRoutes, resolveGrantedPermissions, readLocalManifest, isTrustedRepo };
