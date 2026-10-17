#!/usr/bin/env node
/**
 * fetch-engines.mjs — downloads the pinned llama.cpp engine for the current
 * platform into src-tauri/resources/engines/<variant>/ and verifies its SHA-256.
 *
 * Modes:
 *   node scripts/fetch-engines.mjs            # verify + fetch for current platform
 *   node scripts/fetch-engines.mjs --print-hashes <asset-name>...
 *                                            # download listed assets to a temp dir,
 *                                            # print sha256 (used to pin new releases)
 *
 * The pin lives in scripts/engine-config.json. CI runs this before tauri-action.
 * Local dev: `npm run fetch:engines` (one-time per app release).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, createReadStream } from "node:fs";
import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(path.join(root, "scripts", "engine-config.json"), "utf8"));
const enginesRoot = path.join(root, "src-tauri", "resources", "engines");

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

function download(url, dest) {
  // curl: universally available on win10+/macos/linux CI runners; -L follows HF/GitHub redirects.
  const res = spawnSync("curl", ["-sSL", "--fail", "--retry", "4", "--retry-delay", "2", "-o", dest, "-A", "teacherpro-fetch", url], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (res.status !== 0) throw new Error(`download failed (${res.status}): ${url}`);
}

function unpack(assetPath, destDir, entry) {
  mkdirSync(destDir, { recursive: true });
  if (assetPath.endsWith(".zip")) {
    const res = spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${
      assetPath.replace(/'/g, "''")
    }' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`], { stdio: "inherit" });
    if (res.status !== 0) throw new Error(`unzip failed: ${assetPath}`);
  } else {
    // tar.gz — built-in on macOS/Linux; bsdtar ships with Windows 10+ too.
    const res = spawnSync("tar", ["-xzf", assetPath, "-C", destDir], { stdio: "inherit" });
    if (res.status !== 0) throw new Error(`untar failed: ${assetPath}`);
  }
  flattenTopLevel(destDir, entry);
}

/**
 * llama.cpp release archives may nest everything under one directory
 * (`llama-b11669/...`), while the Windows zip keeps files at the root.
 * Normalize so `<destDir>/<entry>` always exists (dylibs must stay siblings).
 */
function flattenTopLevel(destDir, entry) {
  if (existsSync(path.join(destDir, entry))) return;
  const findEntry = (dir, depth) => {
    if (depth > 3) return null;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isFile() && e.name === entry) return p;
      if (e.isDirectory()) {
        const found = findEntry(p, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  const found = findEntry(destDir, 0);
  if (!found) return;
  const parent = path.dirname(found);
  if (parent === destDir) return;
  // Move every sibling (binary + dylibs + data) up, then drop the nested dir.
  for (const name of readdirSync(parent)) {
    renameSync(path.join(parent, name), path.join(destDir, name));
  }
  rmSync(parent, { recursive: true, force: true });
  // Remove the now-empty intermediate wrapper directory if one remains.
  for (const e of readdirSync(destDir, { withFileTypes: true })) {
    if (e.isDirectory() && readdirSync(path.join(destDir, e.name)).length === 0) {
      rmSync(path.join(destDir, e.name), { recursive: true, force: true });
    }
  }
}

function chmodExecDeep(dir) {
  if (process.platform === "win32") return;
  spawnSync("chmod", ["-R", "u+rx", dir], { stdio: "ignore" });
}

// ---- print-hashes mode -----------------------------------------------------
const args = process.argv.slice(2);
if (args[0] === "--print-hashes") {
  const tmp = path.join(os.tmpdir(), "teacherpro-engine-hashes");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  for (const asset of args.slice(1)) {
    const dest = path.join(tmp, asset);
    process.stdout.write(`fetching ${asset}... `);
    download(`${config.downloadBase}/${config.pin}/${asset}`, dest);
    console.log(`sha256: ${await sha256(dest)}  (${asset})`);
  }
  process.exit(0);
}

// ---- normal mode: pick current platform variant ----------------------------
const plat = process.platform; // win32 | darwin | linux
const arch = os.arch(); // x64 | arm64
const variantKey = config.platformToVariant[`${plat}-${arch}`];
if (!variantKey) {
  console.error(`No engine variant mapped for ${plat}-${arch} (config: platformToVariant).`);
  process.exit(1);
}
const variant = config.engines[variantKey];
const destDir = path.join(enginesRoot, variantKey);
const entryPath = path.join(destDir, variant.entry);
if (existsSync(entryPath)) {
  console.log(`engine already present: ${entryPath}`);
  process.exit(0);
}
if (!existsSync(enginesRoot)) mkdirSync(enginesRoot, { recursive: true });

const tmp = path.join(enginesRoot, ".tmp-fetch");
mkdirSync(tmp, { recursive: true });
const assetPath = path.join(tmp, variant.asset);
console.log(`fetching engine ${variantKey}: ${config.pin}/${variant.asset}`);
download(`${config.downloadBase}/${config.pin}/${variant.asset}`, assetPath);

const actual = await sha256(assetPath);
if (variant.sha256 && actual !== variant.sha256) {
  console.error(`SHA-256 mismatch for ${variant.asset}\n  expected ${variant.sha256}\n  actual   ${actual}`);
  process.exit(1);
}
if (!variant.sha256) {
  console.warn(`NOTE: no pinned sha256 for ${variant.asset}; computed ${actual} — commit it into engine-config.json`);
}

unpack(assetPath, destDir, variant.entry);
rmSync(tmp, { recursive: true, force: true });
chmodExecDeep(destDir);

if (!existsSync(entryPath)) {
  console.error(`entry binary missing after unpack: ${entryPath}`);
  console.error(`contents: ${JSON.stringify(existingFiles(destDir))}`);
  process.exit(1);
}
console.log(`engine ready: ${entryPath} (${(statSync(entryPath).size / 1e6).toFixed(1)} MB)`);

function existingFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      e.isDirectory() ? walk(p) : out.push(path.relative(destDir, p));
    }
  };
  try { walk(dir); } catch { /* ignore */ }
  return out;
}
