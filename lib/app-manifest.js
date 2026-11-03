// mariowOS app manifest: the optional `mariowos.json` at the root of a Store app's repository.
//
//   { "permissions": ["files.documents", "theme"], "category": "productivity", "widgets": [] }
//
// Everything here is pure (no I/O) so the kernel, the Store and the tests share one rule.
// Anything not on the allowlists below is dropped, never guessed: a manifest can only ask for
// what the desktop knows how to mediate (desktop/assets/sdk-host.js). See docs/app-sdk.md.

// Every permission an app can ask for. `implicit` ones are always granted and never stored.
// risk: "low" (cosmetic, nothing leaves the app), "medium" (touches the user's data or
// another part of the system). There is deliberately no "high": the SDK never offers
// shell, settings, other apps' data or the whole file system.
const PERMISSIONS = Object.freeze({
  notifications: Object.freeze({ implicit: true, risk: "low", icon: "notifications",
    key: "store.sdkperm.notifications", text: "Show notifications" }),
  "files.documents": Object.freeze({ risk: "medium", icon: "description",
    key: "store.sdkperm.files-documents", text: "Read and save files in your Documents folder" }),
  "files.pictures": Object.freeze({ risk: "medium", icon: "photo_library",
    key: "store.sdkperm.files-pictures", text: "Read and save pictures in your Pictures folder" }),
  theme: Object.freeze({ risk: "low", icon: "palette",
    key: "store.sdkperm.theme", text: "Follow your accent color and theme" }),
  storage: Object.freeze({ risk: "low", icon: "database",
    key: "store.sdkperm.storage", text: "Keep its own data on this computer" }),
  "clipboard.write": Object.freeze({ risk: "medium", icon: "content_paste",
    key: "store.sdkperm.clipboard-write", text: "Copy text to your clipboard" }),
  "open-url": Object.freeze({ risk: "low", icon: "open_in_browser",
    key: "store.sdkperm.open-url", text: "Open web pages in the Browser" })
});
const PERMISSION_IDS = Object.freeze(Object.keys(PERMISSIONS));
const GRANTABLE_IDS = Object.freeze(PERMISSION_IDS.filter(id => !PERMISSIONS[id].implicit));

const CATEGORIES = Object.freeze(["productivity", "utilities", "games", "education", "entertainment",
  "social", "graphics", "developer", "lifestyle", "other"]);
const WIDGET_SIZES = Object.freeze(["small", "medium", "large"]);

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_WIDGETS = 4;

// Only ids on the allowlist, deduplicated, in the allowlist's order. Implicit ones are left
// out: they are not something the user approves or revokes.
function sanitizePermissions(list) {
  if (!Array.isArray(list)) return [];
  const wanted = new Set(list.filter(item => typeof item === "string").map(item => item.trim()));
  return GRANTABLE_IDS.filter(id => wanted.has(id));
}

function sanitizeCategory(value) {
  const category = typeof value === "string" ? value.trim().toLowerCase() : "";
  return CATEGORIES.includes(category) ? category : "other";
}

// A widget is a page of the app itself, shown in a fixed size. Reserved for the desktop's
// widget area: parsed and validated today so manifests written now keep working.
function sanitizeWidgets(list) {
  if (!Array.isArray(list)) return [];
  const widgets = [];
  const ids = new Set();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const page = typeof item.page === "string" ? item.page.trim() : "";
    if (!/^[a-z0-9_-]{1,40}$/i.test(id) || ids.has(id)) continue;
    // A relative .html file inside the app: no scheme, no "..", no absolute path.
    if (!/^[\w./-]{1,120}\.html$/i.test(page) || page.startsWith("/") || page.split("/").includes("..")) continue;
    ids.add(id);
    widgets.push({
      id,
      page,
      title: typeof item.title === "string" ? item.title.trim().slice(0, 40) : id,
      size: WIDGET_SIZES.includes(item.size) ? item.size : "small"
    });
    if (widgets.length >= MAX_WIDGETS) break;
  }
  return widgets;
}

// jsonText: the raw mariowos.json. Never throws: a missing, broken or hostile manifest gives
// the safest result (no permissions, category "other"). `errors` says what was dropped.
function parseAppManifest(jsonText) {
  const result = { permissions: [], category: "other", widgets: [], errors: [] };
  if (jsonText == null || jsonText === "") return result;
  const text = String(jsonText);
  if (Buffer.byteLength(text, "utf8") > MAX_MANIFEST_BYTES) { result.errors.push("manifest-too-large"); return result; }
  let data;
  try { data = JSON.parse(text.replace(/^﻿/, "")); } catch (e) { result.errors.push("invalid-json"); return result; }
  if (!data || typeof data !== "object" || Array.isArray(data)) { result.errors.push("not-an-object"); return result; }

  if (data.permissions !== undefined) {
    if (!Array.isArray(data.permissions)) result.errors.push("permissions-not-a-list");
    else {
      result.permissions = sanitizePermissions(data.permissions);
      const unknown = data.permissions.filter(item => typeof item !== "string" || !PERMISSIONS[item.trim()]);
      if (unknown.length) result.errors.push("unknown-permissions");
    }
  }
  if (data.category !== undefined) {
    result.category = sanitizeCategory(data.category);
    if (result.category === "other" && String(data.category).trim().toLowerCase() !== "other") result.errors.push("unknown-category");
  }
  if (data.widgets !== undefined) {
    result.widgets = sanitizeWidgets(data.widgets);
    if (!Array.isArray(data.widgets) || result.widgets.length !== data.widgets.length) result.errors.push("invalid-widgets");
  }
  return result;
}

// What the Store shows for a permission. Unknown ids describe themselves as unknown, so the
// UI never has to guess.
function describePermission(id) {
  const permission = Object.prototype.hasOwnProperty.call(PERMISSIONS, id) ? PERMISSIONS[id] : null;
  if (!permission) return { id: String(id), known: false, key: "store.sdkperm.unknown", text: "Unknown permission", risk: "medium", icon: "help", implicit: false };
  return { id, known: true, key: permission.key, text: permission.text, risk: permission.risk, icon: permission.icon, implicit: !!permission.implicit };
}

// The permissions an app may hold: what the user approved, limited to what the app declares.
function grantablePermissions(requested, declared) {
  const allowed = new Set(sanitizePermissions(declared));
  return sanitizePermissions(requested).filter(id => allowed.has(id));
}

module.exports = {
  PERMISSION_IDS,
  GRANTABLE_IDS,
  CATEGORIES,
  MAX_MANIFEST_BYTES,
  parseAppManifest,
  describePermission,
  sanitizePermissions,
  sanitizeCategory,
  sanitizeWidgets,
  grantablePermissions
};
