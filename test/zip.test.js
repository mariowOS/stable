const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createZip, readZip, crc32 } = require("../lib/zip");

test("crc32 matches the standard value", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});

test("an archive reads back exactly what was written", () => {
  const entries = [
    { name: "Documents/notes.txt", data: Buffer.from("hello mariowOS\n".repeat(50)) },
    { name: "Pictures/tiny.bin", data: Buffer.from([0, 1, 2, 3, 255]) },
    { name: "Musica/città.txt", data: Buffer.from("àèìòù") },
    { name: "empty.txt", data: Buffer.alloc(0) }
  ];
  const back = readZip(createZip(entries));
  assert.deepEqual(back.map(e => e.name), entries.map(e => e.name));
  back.forEach((entry, i) => assert.ok(entry.data.equals(entries[i].data), entry.name));
});

test("other tools can open the archive", t => {
  let tool;
  try { execFileSync("tar", ["--version"], { stdio: "ignore" }); tool = "tar"; } catch { t.skip("no tar on this system"); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mariowos-zip-"));
  try {
    fs.writeFileSync(path.join(dir, "a.zip"), createZip([{ name: "x/y.txt", data: Buffer.from("ok") }]));
    execFileSync(tool, ["-xf", "a.zip"], { cwd: dir, stdio: "ignore" });
    assert.equal(fs.readFileSync(path.join(dir, "x", "y.txt"), "utf8"), "ok");
  } catch (error) {
    if (/bsdtar|zip/i.test(String(error.message))) t.skip("this tar cannot read ZIP"); else throw error;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("not a ZIP is refused", () => {
  assert.throws(() => readZip(Buffer.from("not a zip at all, sorry")), /Not a ZIP/);
});
