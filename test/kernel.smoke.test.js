// Boots a real kernel on a clean copy of system/ (no user data) and walks the first-run
// and login flow over HTTP. Needs system/node_modules (npm install in system/).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const SYSTEM = path.join(__dirname, "..");
const PORT = 39000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const APPS = `http://127.0.0.1:${PORT + 1}`;
// Never copy the developer's own data into the test install.
const SKIP = [/^node_modules/, /^\.rollback/, /^test[\\/]/, /^desktop[\\/]home/, /\.log$/,
  /^(config\.json|keys\.json|session\.key|\.env|spotify-token\.json|desktop[\\/]notes-db\.json)$/];

let kernel;
let root;
let output = "";

test.before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mariowos-kernel-test-"));
  fs.cpSync(SYSTEM, root, {
    recursive: true,
    filter: source => {
      const relative = path.relative(SYSTEM, source);
      return !relative || !SKIP.some(pattern => pattern.test(relative));
    }
  });
  // One third-party Store app and one from the mariowOS team.
  fs.mkdirSync(path.join(root, "desktop", "apps", "evilapp"), { recursive: true });
  fs.writeFileSync(path.join(root, "desktop", "apps", "evilapp", "index.html"), "<h1>third party</h1>");
  fs.writeFileSync(path.join(root, "config.json"), JSON.stringify({ installedApps: [
    { appId: "evilapp", title: "Evil", url: "apps/evilapp/index.html", repoUrl: "https://github.com/someone/evilapp.git" },
    { appId: "sandbox", title: "Sandbox", url: "apps/sandbox/index.html", repoUrl: "https://github.com/mariowOS/sandbox.git" }
  ] }));
  kernel = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      MARIOWOS_PORT: String(PORT),
      NODE_PATH: path.join(SYSTEM, "node_modules"),
      MARIOWOS_MAIL_RELAY_URL: "http://127.0.0.1:9" // never reach the real mail relay
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  kernel.stdout.on("data", chunk => { output += chunk; });
  kernel.stderr.on("data", chunk => { output += chunk; });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/system/health`);
      if (response.ok) return;
    } catch (e) {}
    if (kernel.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`kernel did not start:\n${output}`);
});

test.after(async () => {
  if (kernel && kernel.exitCode === null) {
    const exited = new Promise(resolve => kernel.once("exit", resolve));
    kernel.kill();
    await exited;
  }
  // Windows can hold the files for a moment after the process exits.
  if (root) fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

const post = (route, body, headers = {}) => fetch(BASE + route, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
  redirect: "manual"
});
const sessionCookie = response => (response.headers.get("set-cookie") || "").split(";")[0];

test("health endpoint answers", async () => {
  const health = await (await fetch(`${BASE}/api/system/health`)).json();
  assert.equal(health.status, "ok");
});

test("first run, then the API needs a session", async () => {
  const setup = await post("/set-password", { username: "tester", newPassword: "test1234" });
  assert.equal(setup.status, 200);
  assert.match(sessionCookie(setup), /^mw_session=/);

  const anonymous = await post("/api/preferences", { sendReports: false });
  assert.equal(anonymous.status, 401);

  const wrong = await post("/login", { password: "nope" });
  assert.equal(wrong.status, 401);

  const login = await post("/login", { password: "test1234" });
  assert.equal(login.status, 200);
  const cookie = sessionCookie(login);
  assert.match(cookie, /^mw_session=/);

  const authed = await post("/api/preferences", { sendReports: false }, { Cookie: cookie });
  assert.equal(authed.status, 200);
});

test("email features answer cleanly when the mail relay is unreachable", async () => {
  const response = await post("/api/email/send-code", { email: "someone@example.com" });
  const body = await response.json();
  assert.equal(body.success, false);
  assert.match(body.error, /mail service/i);
});

test("third-party Store apps run on their own origin", async () => {
  const settings = await (await fetch(`${BASE}/get-settings`)).json();
  const evil = settings.installedApps.find(app => app.appId === "evilapp");
  const official = settings.installedApps.find(app => app.appId === "sandbox");
  assert.equal(evil.isolated, true);
  assert.equal(evil.url, `${APPS}/apps/evilapp/index.html`);
  assert.equal(official.isolated, undefined);
  assert.equal(official.url, "apps/sandbox/index.html");

  assert.equal((await fetch(`${BASE}/desktop/apps/evilapp/index.html`)).status, 403, "not served on the shell origin");
  const isolated = await fetch(evil.url);
  assert.equal(isolated.status, 200);
  assert.ok(isolated.headers.get("content-security-policy").includes(`frame-ancestors ${BASE}`));
  assert.equal(isolated.headers.get("access-control-allow-origin"), null);
  assert.equal((await fetch(`${APPS}/apps/sandbox/index.html`)).status, 404, "system apps are not on the apps origin");
  assert.equal((await fetch(`${APPS}/apps/evilapp/index.html`, { method: "POST" })).status, 405);
});

test("writes from other origins are refused", async () => {
  const foreign = await post("/api/preferences", { sendReports: false }, { Origin: `${APPS}` });
  assert.equal(foreign.status, 403);
  const web = await post("/login", { password: "x" }, { Origin: "https://evil.example" });
  assert.equal(web.status, 403);
  const shell = await post("/login", { password: "x" }, { Origin: BASE });
  assert.notEqual(shell.status, 403);
});
