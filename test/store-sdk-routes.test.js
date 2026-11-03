const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { registerStoreSdkRoutes, resolveGrantedPermissions, isTrustedRepo } = require("../lib/store-sdk-routes");

// A tiny stand-in for express: records the handlers and calls them with fake req/res.
function fakeApp() {
  const routes = {};
  return {
    routes,
    get: (route, handler) => { routes["GET " + route] = handler; },
    post: (route, handler) => { routes["POST " + route] = handler; },
    async call(method, route, { query = {}, body = {}, user = { admin: true } } = {}) {
      let status = 200, payload;
      const res = { status(code) { status = code; return res; }, json(data) { payload = data; return res; } };
      await routes[method + " " + route]({ query, body, user }, res);
      return { status, body: payload };
    }
  };
}

function setup({ fetchImpl } = {}) {
  const appsDir = fs.mkdtempSync(path.join(os.tmpdir(), "mw-sdk-"));
  fs.mkdirSync(path.join(appsDir, "todo"));
  fs.writeFileSync(path.join(appsDir, "todo", "mariowos.json"), JSON.stringify({ permissions: ["theme", "files.documents"], category: "productivity" }));
  fs.mkdirSync(path.join(appsDir, "plain"));
  const config = { installedApps: [
    { appId: "todo", title: "Todo", repoUrl: "https://github.com/someone/todo.git", grantedPermissions: ["theme"] },
    { appId: "plain", title: "Plain", repoUrl: "https://github.com/mariowOS/plain.git" }
  ] };
  let saves = 0;
  const app = fakeApp();
  let fetchCalls = 0;
  registerStoreSdkRoutes(app, {
    getConfig: () => config, saveConfig: () => { saves++; }, appsDir,
    fetch: async url => { fetchCalls++; return fetchImpl(url); }
  });
  return { app, config, appsDir, saves: () => saves, fetchCalls: () => fetchCalls };
}

const response = (status, text) => ({ ok: status === 200, status, text: async () => text });

test("manifest route fetches mariowos.json from main, then master, and caches it", async () => {
  const seen = [];
  const env = setup({ fetchImpl: url => { seen.push(url); return url.includes("/main/") ? response(404, "") : response(200, '{"permissions":["theme","system"],"category":"games"}'); } });
  const first = await env.app.call("GET", "/api/store/manifest", { query: { repo: "https://github.com/someone/app.git" } });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.manifest.permissions, ["theme"]);
  assert.equal(first.body.manifest.category, "games");
  assert.deepEqual(seen, ["https://raw.githubusercontent.com/someone/app/main/mariowos.json", "https://raw.githubusercontent.com/someone/app/master/mariowos.json"]);
  await env.app.call("GET", "/api/store/manifest", { query: { repo: "https://github.com/someone/app.git" } });
  assert.equal(env.fetchCalls(), 2, "second call served from the cache");
});

test("manifest route refuses anything but GitHub and survives network errors", async () => {
  const env = setup({ fetchImpl: () => { throw new Error("offline"); } });
  assert.equal((await env.app.call("GET", "/api/store/manifest", { query: { repo: "file:///etc" } })).status, 400);
  const offline = await env.app.call("GET", "/api/store/manifest", { query: { repo: "https://github.com/a/b.git" } });
  assert.equal(offline.body.manifest, null);
  await env.app.call("GET", "/api/store/manifest", { query: { repo: "https://github.com/a/b.git" } });
  assert.equal(env.fetchCalls(), 4, "failures are not cached");
});

test("app-permissions lists declared and granted permissions", async () => {
  const env = setup({ fetchImpl: () => response(404, "") });
  const all = await env.app.call("GET", "/api/store/app-permissions");
  const todo = all.body.apps.find(a => a.appId === "todo");
  assert.deepEqual(todo.declared, ["files.documents", "theme"]);
  assert.deepEqual(todo.granted, ["theme"]);
  assert.equal(todo.trusted, false);
  assert.equal(all.body.apps.find(a => a.appId === "plain").trusted, true);
  assert.equal((await env.app.call("GET", "/api/store/app-permissions", { query: { appId: "nope" } })).status, 404);
});

test("only declared permissions can be granted, anything can be revoked", async () => {
  const env = setup({ fetchImpl: () => response(404, "") });
  const grant = await env.app.call("POST", "/api/store/app-permissions", { body: { appId: "todo", grantedPermissions: ["files.documents", "theme", "clipboard.write", "system"] } });
  assert.deepEqual(grant.body.granted, ["files.documents", "theme"]);
  assert.deepEqual(env.config.installedApps[0].grantedPermissions, ["files.documents", "theme"]);
  assert.equal(env.saves(), 1);
  const revoke = await env.app.call("POST", "/api/store/app-permissions", { body: { appId: "todo", grantedPermissions: [] } });
  assert.deepEqual(revoke.body.granted, []);
  const plain = await env.app.call("POST", "/api/store/app-permissions", { body: { appId: "plain", grantedPermissions: ["theme"] } });
  assert.deepEqual(plain.body.granted, [], "an app without a manifest cannot be granted anything");
});

test("changing permissions is for administrators, with valid input", async () => {
  const env = setup({ fetchImpl: () => response(404, "") });
  assert.equal((await env.app.call("POST", "/api/store/app-permissions", { body: { appId: "todo", grantedPermissions: [] }, user: { admin: false } })).status, 403);
  assert.equal((await env.app.call("POST", "/api/store/app-permissions", { body: { appId: "../x", grantedPermissions: [] } })).status, 400);
  assert.equal((await env.app.call("POST", "/api/store/app-permissions", { body: { appId: "todo", grantedPermissions: "theme" } })).status, 400);
  assert.equal((await env.app.call("POST", "/api/store/app-permissions", { body: { appId: "ghost", grantedPermissions: [] } })).status, 404);
  assert.equal(env.saves(), 0);
});

test("install grants are limited to the installed app's own manifest", () => {
  const env = setup({ fetchImpl: () => response(404, "") });
  assert.deepEqual(resolveGrantedPermissions(["theme", "open-url", "files.documents"], path.join(env.appsDir, "todo")), ["files.documents", "theme"]);
  assert.deepEqual(resolveGrantedPermissions(["theme"], path.join(env.appsDir, "plain")), []);
  assert.deepEqual(resolveGrantedPermissions(undefined, path.join(env.appsDir, "todo")), []);
});

test("trusted repositories follow the kernel's isolation rule", () => {
  assert.equal(isTrustedRepo("https://github.com/mariowOS/x.git"), true);
  assert.equal(isTrustedRepo("https://github.com/mariowstech/x.git"), true);
  assert.equal(isTrustedRepo("https://github.com/someone/x.git"), false);
  assert.equal(isTrustedRepo("https://github.com.evil/mariowOS/x.git"), false);
});
