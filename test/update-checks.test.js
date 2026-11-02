const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const checks = require("../lib/update-checks");

function makeRelease(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mariowos-release-test-"));
  for (const [file, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), contents);
  }
  const entries = () => Object.keys(files).map(relativePath => ({
    relativePath,
    blobHash: checks.gitBlobHash(fs.readFileSync(path.join(root, relativePath)))
  }));
  return { root, entries, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("git blob hashes match git and tolerate CRLF checkouts", () => {
  // `printf 'hello\n' | git hash-object --stdin`
  assert.equal(checks.gitBlobHash(Buffer.from("hello\n")), "ce013625030ba8dba906f756967f9e9ca394464a");
  assert.equal(checks.matchesGitBlob(Buffer.from("hello\r\n"), "ce013625030ba8dba906f756967f9e9ca394464a"), true);
  assert.equal(checks.matchesGitBlob(Buffer.from("bye\n"), "ce013625030ba8dba906f756967f9e9ca394464a"), false);
});

test("a release missing a required file is refused", t => {
  const release = makeRelease({ "server.js": 'require("./lib/validation");' });
  t.after(release.cleanup);
  assert.throws(() => checks.validateStagedRuntime(release.root, release.entries(), null),
    /requires missing file \.\/lib\/validation/);
});

test("a release missing a package is refused", t => {
  const release = makeRelease({ "server.js": 'require("multer"); require("fs"); require("node:path");' });
  t.after(release.cleanup);
  assert.throws(() => checks.validateStagedRuntime(release.root, release.entries(), null), /missing package multer/);
});

test("a complete release passes, following requires through local modules", t => {
  const release = makeRelease({
    "server.js": 'require("./lib/a");',
    "launcher.js": 'require("electron"); require("./lib/a");',
    "lib/a.js": 'require("@scope/pkg/sub");',
    "node_modules/@scope/pkg/package.json": "{}"
  });
  t.after(release.cleanup);
  assert.doesNotThrow(() => checks.validateStagedRuntime(release.root, release.entries(), null));
});

test("files already installed on the device count as present", t => {
  const release = makeRelease({ "server.js": 'require("./lib/validation");' });
  const install = makeRelease({ "lib/validation.js": "module.exports = {};" });
  t.after(() => { release.cleanup(); install.cleanup(); });
  assert.doesNotThrow(() => checks.validateStagedRuntime(release.root, release.entries(), install.root));
});

test("signed releases verify, and any change is rejected", t => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const release = makeRelease({
    "version.json": JSON.stringify({ version: "1.3.6" }),
    "server.js": "console.log('ok')"
  });
  t.after(release.cleanup);
  const manifest = checks.buildReleaseManifest("1.3.6", release.entries());
  fs.writeFileSync(path.join(release.root, checks.RELEASE_MANIFEST), manifest.replace(/\n/g, "\r\n")); // CRLF checkout
  fs.writeFileSync(path.join(release.root, checks.RELEASE_SIGNATURE), checks.signReleaseManifest(manifest, privateKey));

  assert.deepEqual(checks.verifyReleaseSignature(release.root, release.entries(), publicKey), { ok: true, version: "1.3.6" });
  assert.equal(checks.verifyReleaseSignature(release.root, release.entries(),
    crypto.generateKeyPairSync("ed25519").publicKey).reason, "invalid release signature");

  const tampered = release.entries().map(entry => entry.relativePath === "server.js" ? { ...entry, blobHash: "0".repeat(40) } : entry);
  assert.match(checks.verifyReleaseSignature(release.root, tampered, publicKey).reason, /server\.js is not part/);

  const missing = release.entries().filter(entry => entry.relativePath !== "server.js");
  assert.match(checks.verifyReleaseSignature(release.root, missing, publicKey).reason, /server\.js is missing/);

  fs.writeFileSync(path.join(release.root, "version.json"), JSON.stringify({ version: "9.9.9" }));
  const withNewVersion = release.entries();
  assert.equal(checks.verifyReleaseSignature(release.root, withNewVersion, publicKey).ok, false);
});

test("an unsigned release is reported as such", t => {
  const release = makeRelease({ "version.json": "{}" });
  t.after(release.cleanup);
  assert.equal(checks.verifyReleaseSignature(release.root, release.entries(), "unused").reason, "this release is not signed");
});
