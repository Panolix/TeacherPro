#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const failures = [];

function toPosixPath(filePath) {
  return filePath.replaceAll(path.sep, "/");
}

function expectRegex({ content, regex, file, description }) {
  if (!regex.test(content)) {
    failures.push(`${file}: missing ${description}`);
  }
}

async function readText(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  return readFile(absolutePath, "utf8");
}

async function collectFiles(startDir, extensions, collected = []) {
  const entries = await readdir(startDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(absolutePath, extensions, collected);
      continue;
    }

    if (extensions.has(path.extname(entry.name))) {
      collected.push(absolutePath);
    }
  }

  return collected;
}

function validateCoreScrollbarRules(indexHtml, indexCss) {
  expectRegex({
    content: indexHtml,
    regex: /:root\s*\{\s*color-scheme:\s*dark;\s*\}/,
    file: "index.html",
    description: "dark color-scheme root fallback",
  });

  expectRegex({
    content: indexHtml,
    regex: /::-webkit-scrollbar-track\s*\{\s*background:\s*#161616\s*!important;\s*\}/,
    file: "index.html",
    description: "dark WebKit scrollbar track fallback",
  });

  expectRegex({
    content: indexHtml,
    regex: /scrollbar-color:\s*#3a3a3a\s+#161616;/,
    file: "index.html",
    description: "non-transparent fallback scrollbar-color",
  });

  expectRegex({
    content: indexCss,
    regex: /--tp-scrollbar-track:\s*#161616;/,
    file: "src/index.css",
    description: "scrollbar track variable",
  });

  expectRegex({
    content: indexCss,
    regex: /--tp-scrollbar-thumb:\s*#3a3a3a;/,
    file: "src/index.css",
    description: "scrollbar thumb variable",
  });

  expectRegex({
    content: indexCss,
    regex: /\*\s*\{[^}]*scrollbar-width:\s*thin;[^}]*scrollbar-color:\s*var\(--tp-scrollbar-thumb\)\s+var\(--tp-scrollbar-track\);/s,
    file: "src/index.css",
    description: "global thin scrollbar rule",
  });

  expectRegex({
    content: indexCss,
    regex: /\*::-webkit-scrollbar-track\s*\{[^}]*background-color:\s*var\(--tp-scrollbar-track\);/s,
    file: "src/index.css",
    description: "global dark WebKit track rule",
  });

  expectRegex({
    content: indexCss,
    regex: /html,\s*body,\s*#root\s*\{[^}]*scrollbar-color:\s*var\(--tp-scrollbar-thumb\)\s+var\(--tp-scrollbar-track\);/s,
    file: "src/index.css",
    description: "root scrollbar override",
  });
}

async function validateNoTransparentOverrides() {
  const transparentPattern = /scrollbar-color:[^\]]*transparent/i;
  const sourceDir = path.join(rootDir, "src");
  const files = await collectFiles(sourceDir, new Set([".tsx"]));

  for (const absolutePath of files) {
    const relativePath = toPosixPath(path.relative(rootDir, absolutePath));
    const content = await readFile(absolutePath, "utf8");
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (transparentPattern.test(line)) {
        failures.push(`${relativePath}:${index + 1} contains transparent scrollbar-color override`);
      }
    });
  }
}

async function main() {
  try {
    const indexHtml = await readText("index.html");
    const indexCss = await readText("src/index.css");

    validateCoreScrollbarRules(indexHtml, indexCss);
    await validateNoTransparentOverrides();

    if (failures.length > 0) {
      console.error("Scrollbar style verification failed:\n");
      failures.forEach((failure) => {
        console.error(`- ${failure}`);
      });
      process.exit(1);
    }

    console.log("Scrollbar style verification passed.");
  } catch (error) {
    console.error("Unable to verify scrollbar styles:", error);
    process.exit(1);
  }
}

void main();
