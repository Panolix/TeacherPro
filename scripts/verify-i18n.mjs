#!/usr/bin/env node
/**
 * Verifies that the English and German dictionaries expose identical key sets
 * and that every statically referenced `t("literal.key")` exists in both.
 * Dynamic keys (template strings) are not checked.
 */
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import { readdirSync, readFileSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const tmp = mkdtempSync(join(tmpdir(), "tp-i18n-"));

for (const lang of ["en", "de"]) {
  buildSync({
    entryPoints: [resolve("src", "i18n", `${lang}.ts`)],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile: join(tmp, `${lang}.cjs`),
    logLevel: "silent",
  });
}

const en = require(join(tmp, "en.cjs")).default;
const de = require(join(tmp, "de.cjs")).default;

function flatten(obj, prefix = "", out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") {
      flatten(value, fullKey, out);
    } else {
      out.add(fullKey);
    }
  }
  return out;
}

const enKeys = flatten(en);
const deKeys = flatten(de);

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(filePath);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(filePath);
    }
  }
})("src");

const used = new Set();
for (const filePath of files) {
  const text = readFileSync(filePath, "utf8");
  for (const match of text.matchAll(/\bt\(\s*["']([A-Za-z0-9_.]+)["']/g)) {
    const key = match[1];
    // Skip dynamic concatenations like t("mindmap.nodeColors." + id).
    if (key.endsWith(".")) {
      continue;
    }
    used.add(key);
  }
}

const onlyEn = [...enKeys].filter((key) => !deKeys.has(key)).sort();
const onlyDe = [...deKeys].filter((key) => !enKeys.has(key)).sort();
const missingEn = [...used].filter((key) => !enKeys.has(key)).sort();
const missingDe = [...used].filter((key) => !deKeys.has(key)).sort();

let failed = false;

function report(label, keys) {
  if (keys.length === 0) {
    return;
  }
  failed = true;
  console.error(`✗ ${label} (${keys.length}):`);
  for (const key of keys) {
    console.error(`    ${key}`);
  }
}

report("Keys present only in en", onlyEn);
report("Keys present only in de", onlyDe);
report("Keys used in code but missing from en", missingEn);
report("Keys used in code but missing from de", missingDe);

if (failed) {
  process.exit(1);
}

console.log(`i18n verification passed (${enKeys.size} keys).`);
