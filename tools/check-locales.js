#!/usr/bin/env node
// Checks the system-app translations in desktop/assets/locales/ (see TRANSLATING.md).
//   node tools/check-locales.js
// Errors (exit code 1): invalid JSON, a language listed in languages.json without its
// <code>.json or the other way round, bad language codes, non-text or empty translations,
// keys the system does not use. Warnings: keys not translated yet (they show in English).
//
// The keys the system uses are read from the pages themselves: data-i18n,
// data-i18n-placeholder and data-i18n-title attributes, and mariowOSI18n.t("key") calls.

const fs = require("fs");
const path = require("path");

const systemDir = path.resolve(__dirname, "..");
const desktopDir = path.join(systemDir, "desktop");
const localesDir = path.join(desktopDir, "assets", "locales");
const CODE = /^[a-z]{2,3}(-[a-z0-9]{2,4})?$/;
const SKIP_DIRS = new Set(["vendor", "node_modules"]);
const SKIP_FILES = new Set(["i18n.js"]); // its comments show example keys

const inActions = !!process.env.GITHUB_ACTIONS;
let errors = 0;
let warnings = 0;
function report(kind, file, message) {
  if (kind === "error") errors++; else warnings++;
  const rel = path.relative(systemDir, file);
  console.log(inActions ? `::${kind} file=${rel}::${message}` : `${kind.toUpperCase()} ${rel}: ${message}`);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { report("error", file, `not valid JSON (${error.message})`); return null; }
}

function usedKeys(dir, keys = new Set()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) usedKeys(full, keys); continue; }
    if (!/\.(html|js)$/.test(entry.name) || SKIP_FILES.has(entry.name)) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const match of text.matchAll(/data-i18n(?:-placeholder|-title)?="([^"]+)"/g)) keys.add(match[1]);
    for (const match of text.matchAll(/mariowOSI18n\.t\(\s*["']([^"']+)["']/g)) keys.add(match[1]);
  }
  return keys;
}

const keys = usedKeys(desktopDir);
const manifestFile = path.join(localesDir, "languages.json");
const languages = readJson(manifestFile) || {};

for (const [code, name] of Object.entries(languages)) {
  if (!CODE.test(code)) report("error", manifestFile, `"${code}" is not a valid language code (lowercase, e.g. "fr" or "pt-br")`);
  if (typeof name !== "string" || !name.trim()) report("error", manifestFile, `"${code}" needs its name, written in that language`);
  if (code !== "en" && !fs.existsSync(path.join(localesDir, `${code}.json`))) report("error", manifestFile, `"${code}" is listed but ${code}.json is missing`);
}

const files = fs.readdirSync(localesDir).filter(name => name.endsWith(".json") && name !== "languages.json");
for (const name of files) {
  const file = path.join(localesDir, name);
  const code = name.slice(0, -".json".length);
  if (code === "en") { report("error", file, "English lives in the pages themselves; remove en.json"); continue; }
  if (!Object.hasOwn(languages, code)) report("error", file, `add "${code}" to languages.json`);
  const dictionary = readJson(file);
  if (!dictionary) continue;
  if (typeof dictionary !== "object" || Array.isArray(dictionary)) { report("error", file, 'must be an object of "key": "translation"'); continue; }
  for (const [key, value] of Object.entries(dictionary)) {
    if (!keys.has(key)) report("error", file, `"${key}" is not used by the system (typo, or translate the key instead of the value?)`);
    else if (typeof value !== "string" || !value.trim()) report("error", file, `"${key}" must be non-empty text`);
  }
  const missing = [...keys].filter(key => !Object.hasOwn(dictionary, key));
  missing.forEach(key => report("warning", file, `"${key}" is not translated yet (shown in English)`));
  console.log(`${code}: ${keys.size - missing.length}/${keys.size} keys translated`);
}

console.log(`${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
