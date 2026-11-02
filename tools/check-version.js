// Checks version.json before a release goes out (see .github/workflows/check-version.yml).
//
//   node tools/check-version.js [previous-version.json]
//
// Refuses: a version that is not X.Y.Z (optionally -prerelease), an empty changelog, a
// rollout outside 0-100, and a version that is not newer than the previous one, unless
// the previous one is listed in "replaces" (a deliberate way back, see lib/validation.js).
// The previous file defaults to the version.json of the parent commit (git show HEAD~1:).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { SEMVER_PATTERN, compareVersions } = require("../lib/validation");

const errors = [];
const warnings = [];
const root = path.join(__dirname, "..");
let release;
try { release = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8")); }
catch (error) { console.error(`ERROR version.json: ${error.message}`); process.exit(1); }

function readPrevious() {
  const file = process.argv[2];
  try {
    if (file) return JSON.parse(fs.readFileSync(file, "utf8"));
    return JSON.parse(execFileSync("git", ["show", "HEAD~1:version.json"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch { return null; }
}

const version = String(release.version || "");
// "1.5" (two parts) is kept as a warning: the updater offers it to every install with a
// different version, newer or not, which is the only way back for installs whose updater
// predates "replaces" (e.g. the ones that received 2.0.0 by mistake).
if (/^\d+\.\d+$/.test(version)) warnings.push(`"${version}" is not X.Y.Z: every install with another version is offered it, even newer ones. Use it only to bring installs back, then move to X.Y.Z`);
else if (!SEMVER_PATTERN.test(version)) errors.push(`"version" must look like 1.6.0 (got "${version}"): the updater cannot order other forms`);
if (typeof release.changelog !== "string" || release.changelog.trim().length < 20) errors.push('"changelog" must say what changed, in at least a sentence');
if (release.rollout !== undefined && !(Number.isInteger(release.rollout) && release.rollout >= 0 && release.rollout <= 100)) errors.push('"rollout" must be a whole number from 0 to 100');
if (release.replaces !== undefined) {
  if (!Array.isArray(release.replaces) || release.replaces.some(item => typeof item !== "string")) errors.push('"replaces" must be a list of version strings');
  else release.replaces.filter(item => compareVersions(item, version) !== null && compareVersions(item, version) <= 0)
    .forEach(item => errors.push(`"replaces" lists ${item}, which is not newer than ${version}: installs on it would get the update anyway`));
}

const previous = readPrevious();
if (previous && previous.version && SEMVER_PATTERN.test(version)) {
  const order = compareVersions(version, previous.version);
  const replaced = Array.isArray(release.replaces) && release.replaces.includes(previous.version);
  if (order !== null && order <= 0 && !replaced) {
    errors.push(`${version} is not newer than the previous ${previous.version}: installs would never be offered it. To go back on purpose, add "replaces": ["${previous.version}"]`);
  }
}

for (const warning of warnings) console.warn(`WARNING version.json: ${warning}`);
for (const error of errors) console.error(`ERROR version.json: ${error}`);
console.log(errors.length ? `${errors.length} error(s)` : `version.json ${version} is ready${previous ? ` (previous: ${previous.version})` : ""}`);
process.exit(errors.length ? 1 : 0);
