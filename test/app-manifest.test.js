const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const m = require("../lib/app-manifest");

test("a valid manifest keeps its permissions, category and widgets", () => {
  const manifest = m.parseAppManifest(JSON.stringify({
    permissions: ["theme", "files.documents", "clipboard.write"],
    category: "Productivity",
    widgets: [{ id: "today", page: "widgets/today.html", title: "Today", size: "medium" }]
  }));
  assert.deepEqual(manifest.permissions, ["files.documents", "theme", "clipboard.write"]);
  assert.equal(manifest.category, "productivity");
  assert.deepEqual(manifest.widgets, [{ id: "today", page: "widgets/today.html", title: "Today", size: "medium" }]);
  assert.deepEqual(manifest.errors, []);
});

test("unknown permissions are dropped, never guessed", () => {
  const manifest = m.parseAppManifest(JSON.stringify({ permissions: ["system", "files", "files.*", "theme", 42, " open-url ", "theme"] }));
  assert.deepEqual(manifest.permissions, ["theme", "open-url"]);
  assert.ok(manifest.errors.includes("unknown-permissions"));
});

test("notifications is implicit: accepted but never stored as a grant", () => {
  assert.deepEqual(m.parseAppManifest('{"permissions":["notifications"]}').permissions, []);
  assert.equal(m.describePermission("notifications").implicit, true);
});

test("broken or hostile manifests give the safest result", () => {
  for (const text of [null, "", "{", "[]", "null", "42", '"x"', '{"permissions":"theme"}', '{"__proto__":{"permissions":["theme"]}}']) {
    const manifest = m.parseAppManifest(text);
    assert.deepEqual(manifest.permissions, [], String(text));
    assert.equal(manifest.category, "other");
    assert.deepEqual(manifest.widgets, []);
  }
  const huge = JSON.stringify({ permissions: ["theme"], pad: "x".repeat(m.MAX_MANIFEST_BYTES) });
  assert.deepEqual(m.parseAppManifest(huge).permissions, []);
  assert.ok(m.parseAppManifest(huge).errors.includes("manifest-too-large"));
});

test("a BOM at the start is tolerated", () => {
  assert.deepEqual(m.parseAppManifest('﻿{"permissions":["theme"]}').permissions, ["theme"]);
});

test("unknown categories fall back to other", () => {
  assert.equal(m.parseAppManifest('{"category":"weapons"}').category, "other");
  assert.ok(m.parseAppManifest('{"category":"weapons"}').errors.includes("unknown-category"));
  assert.equal(m.parseAppManifest('{"category":"games"}').category, "games");
  assert.equal(m.sanitizeCategory(undefined), "other");
});

test("widgets must be relative html pages inside the app", () => {
  const widgets = m.sanitizeWidgets([
    { id: "ok", page: "w.html" },
    { id: "abs", page: "/etc/passwd.html" },
    { id: "up", page: "../x.html" },
    { id: "url", page: "https://evil.example/x.html" },
    { id: "js", page: "w.js" },
    { id: "bad id!", page: "w.html" },
    { id: "ok", page: "dup.html" },
    null, "x"
  ]);
  assert.deepEqual(widgets.map(w => w.id), ["ok"]);
  assert.equal(widgets[0].size, "small");
  const many = Array.from({ length: 10 }, (_, i) => ({ id: "w" + i, page: "w.html" }));
  assert.equal(m.sanitizeWidgets(many).length, 4);
});

test("describePermission gives an i18n key, English text and a risk level", () => {
  for (const id of m.PERMISSION_IDS) {
    const info = m.describePermission(id);
    assert.equal(info.known, true);
    assert.match(info.key, /^store\.sdkperm\./);
    assert.ok(info.text.length > 5);
    assert.ok(["low", "medium"].includes(info.risk), id);
  }
  const unknown = m.describePermission("system");
  assert.equal(unknown.known, false);
  assert.equal(m.describePermission("__proto__").known, false);
  assert.equal(m.describePermission("constructor").known, false);
});

test("granted permissions are limited to what the app declares", () => {
  assert.deepEqual(m.grantablePermissions(["theme", "files.pictures", "bogus"], ["theme", "open-url"]), ["theme"]);
  assert.deepEqual(m.grantablePermissions("theme", ["theme"]), []);
  assert.deepEqual(m.grantablePermissions(["theme"], undefined), []);
});

test("the Store, the desktop host and the app SDK know every permission", () => {
  const root = path.join(__dirname, "..", "desktop");
  const store = fs.readFileSync(path.join(root, "apps", "store", "index.html"), "utf8");
  const host = fs.readFileSync(path.join(root, "assets", "sdk-host.js"), "utf8");
  for (const id of m.PERMISSION_IDS) {
    const info = m.describePermission(id);
    assert.ok(store.includes(`"${info.key}"`), `store shows ${id}`);
    if (!info.implicit && id !== "storage") assert.ok(host.includes(`'${id}'`), `host enforces ${id}`);
  }
  for (const category of m.CATEGORIES) assert.ok(store.includes(`"store.category.${category}"`), `store names category ${category}`);
});
