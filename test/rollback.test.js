const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const rollback = require("../lib/rollback");

function makeInstall() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mariowos-rollback-test-"));
  const write = (file, contents) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), contents);
  };
  const read = file => fs.readFileSync(path.join(root, file), "utf8");
  write("version.json", JSON.stringify({ version: "1.3.5" }));
  write("server.js", "old server");
  write("same.js", "unchanged");
  write("config.json", "user config");
  return { root, write, read, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

const UPDATE = ["version.json", "server.js", "same.js", "lib/new.js", "config.json"].map(relativePath => ({ relativePath }));
const OPTIONS = {
  toVersion: "1.3.6",
  isProtected: file => file === "config.json",
  isUnchanged: (contents, file) => file.relativePath === "same.js"
};

test("a rollback point records replaced and created files only", t => {
  const install = makeInstall();
  t.after(install.cleanup);
  const point = rollback.createRollbackPoint(install.root, UPDATE, OPTIONS);
  assert.equal(point.fromVersion, "1.3.5");
  assert.equal(point.toVersion, "1.3.6");
  assert.deepEqual(point.replaced, ["version.json", "server.js"]);
  assert.deepEqual(point.created, ["lib/new.js"]);
  assert.equal(rollback.canRollback(install.root), true);
});

test("restoring brings the old files back and removes new ones", t => {
  const install = makeInstall();
  t.after(install.cleanup);
  rollback.createRollbackPoint(install.root, UPDATE, OPTIONS);
  install.write("version.json", JSON.stringify({ version: "1.3.6" }));
  install.write("server.js", "broken server");
  install.write("lib/new.js", "new module");

  const restored = rollback.restoreRollbackPoint(install.root);
  assert.equal(restored.rolledBack, true);
  assert.equal(install.read("server.js"), "old server");
  assert.equal(JSON.parse(install.read("version.json")).version, "1.3.5");
  assert.equal(fs.existsSync(path.join(install.root, "lib")), false, "empty folders created by the update are removed");
  assert.equal(install.read("config.json"), "user config");
  assert.equal(rollback.canRollback(install.root), false, "a rollback point is used once");
  assert.throws(() => rollback.restoreRollbackPoint(install.root), /No update to roll back/);
});

test("a verified update stays restorable by hand but is marked", t => {
  const install = makeInstall();
  t.after(install.cleanup);
  rollback.createRollbackPoint(install.root, UPDATE, OPTIONS);
  rollback.markRollbackVerified(install.root);
  assert.equal(rollback.readRollbackPoint(install.root).verified, true);
  assert.equal(rollback.canRollback(install.root), true);
});

test("no rollback point means nothing to restore", t => {
  const install = makeInstall();
  t.after(install.cleanup);
  assert.equal(rollback.readRollbackPoint(install.root), null);
  assert.equal(rollback.canRollback(install.root), false);
});
