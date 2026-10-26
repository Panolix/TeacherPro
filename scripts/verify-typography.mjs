#!/usr/bin/env node
/**
 * Enforces the universal minimum UI font size: no `text-[Npx]` utility below
 * 11px anywhere in the app. The document/paper typography uses pt units and is
 * intentionally out of scope.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIN_PX = 11;
const offenders = [];

(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(filePath);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      const lines = readFileSync(filePath, "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const match of line.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
          const size = Number(match[1]);
          if (Number.isFinite(size) && size < MIN_PX) {
            offenders.push(`${filePath}:${index + 1}  ${match[0]}`);
          }
        }
      });
    }
  }
})("src");

// Also check plain CSS rules. The previous version only looked at Tailwind
// arbitrary values, so a 10px `.tp-cm-section` could pass unnoticed.
const css = readFileSync(join("src", "index.css"), "utf8");
const cssLines = css.split("\n");
cssLines.forEach((line, index) => {
  for (const match of line.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
    const size = Number(match[1]);
    if (Number.isFinite(size) && size < MIN_PX) {
      offenders.push(`src/index.css:${index + 1}  ${match[0]}`);
    }
  }
});

if (offenders.length > 0) {
  console.error(`✗ Found ${offenders.length} text utilities below ${MIN_PX}px:`);
  for (const offender of offenders) {
    console.error(`    ${offender}`);
  }
  process.exit(1);
}

console.log(`Typography verification passed (no text below ${MIN_PX}px).`);
