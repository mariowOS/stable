const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createZip } = require("../lib/zip");
const { gitBlobHash } = require("../lib/update-checks");
const { stageReleaseZip } = require("../lib/release-zip");

const stage = () => fs.mkdtempSync(path.join(os.tmpdir(), "mariowos-zip-stage-"));

test("a release ZIP is staged without its top folder, with Git blob hashes", () => {
  const dir = stage();
  try {
    const server = Buffer.from("console.log('kernel');\n");
    const index = stageReleaseZip(createZip([
      { name: "stable-main/server.js", data: server },
      { name: "stable-main/lib/a.js", data: Buffer.from("module.exports = 1;\n") }
    ]), dir);
    const records = index.split("\0").filter(Boolean);
    assert.deepEqual(records, [
      `100644 ${gitBlobHash(server)} 0\tserver.js`,
      `100644 ${gitBlobHash(Buffer.from("module.exports = 1;\n"))} 0\tlib/a.js`
    ]);
    assert.equal(fs.readFileSync(path.join(dir, "lib", "a.js"), "utf8"), "module.exports = 1;\n");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a ZIP without a single top folder is refused", () => {
  const dir = stage();
  try {
    assert.throws(() => stageReleaseZip(createZip([
      { name: "a/server.js", data: Buffer.from("1") },
      { name: "b/server.js", data: Buffer.from("2") }
    ]), dir), /single top folder/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a path that climbs out of the stage folder is refused", () => {
  const dir = stage();
  try {
    assert.throws(() => stageReleaseZip(createZip([
      { name: "stable-main/../../evil.js", data: Buffer.from("x") }
    ]), dir), /Unsafe update path/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a damaged file inside the ZIP is refused", () => {
  const dir = stage();
  try {
    const zip = createZip([{ name: "stable-main/server.js", data: Buffer.from("console.log(1);") }]);
    const at = zip.indexOf(Buffer.from("stable-main/server.js")) + "stable-main/server.js".length;
    zip[at + 2] ^= 0xff; // flip a byte of the (stored or deflated) body
    assert.throws(() => stageReleaseZip(zip, dir));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
