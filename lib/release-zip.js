// mariowOS builder note: download a release as a ZIP instead of cloning it with Git, so an
// installed mariowOS updates on a PC that has no Git. GitHub serves every branch as a ZIP
// (https://codeload.github.com/<owner>/<repo>/zip/refs/heads/<branch>) whose files sit in
// one top folder ("stable-main/…").
//
//   stageReleaseZip(buffer, stagePath) -> index text in the `git ls-files -s -z` format
//
// The updater then runs the very same checks it runs on a Git clone (safe paths, file
// types, Git blob hashes, release signature, rollback point): only the download changes.

const fs = require("fs");
const path = require("path");
const { readZip } = require("./zip");
const { gitBlobHash } = require("./update-checks");

const MAX_RELEASE_BYTES = 300 * 1024 * 1024;

function releaseZipUrl(owner, repo, branch = "main") {
  return `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`;
}

async function downloadReleaseZip(url, { fetchImpl = fetch, onProgress } = {}) {
  const response = await fetchImpl(url, { headers: { "User-Agent": "mariowOS-Updater" } });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const total = Number(response.headers.get("content-length")) || 0;
  const chunks = [];
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.length;
    if (received > MAX_RELEASE_BYTES) throw new Error("The update is too large");
    chunks.push(Buffer.from(chunk));
    if (onProgress) onProgress(received, total);
  }
  return Buffer.concat(chunks);
}

function stageReleaseZip(buffer, stagePath) {
  const entries = readZip(buffer);
  if (!entries.length) throw new Error("The update contains no files");
  const top = entries[0].name.split("/")[0];
  if (!top || entries.some(entry => !entry.name.startsWith(top + "/"))) {
    throw new Error("The update ZIP does not have a single top folder");
  }
  let index = "";
  for (const entry of entries) {
    const relativePath = entry.name.slice(top.length + 1);
    if (!relativePath) continue;
    const type = entry.mode & 0o170000;
    // Git archives mark symbolic links; the Git updater refuses them too.
    if (type === 0o120000) throw new Error(`Update entry is not a regular file: ${relativePath}`);
    const mode = entry.mode & 0o111 ? "100755" : "100644";
    // The path itself is checked by the updater, exactly like a Git index entry; here it
    // only has to stay inside the stage folder while it is written.
    const target = path.resolve(stagePath, ...relativePath.split("/"));
    if (!target.startsWith(path.resolve(stagePath) + path.sep)) throw new Error(`Unsafe update path: ${relativePath}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.data);
    index += `${mode} ${gitBlobHash(entry.data)} 0\t${relativePath}\0`;
  }
  return index;
}

module.exports = { releaseZipUrl, downloadReleaseZip, stageReleaseZip, MAX_RELEASE_BYTES };
