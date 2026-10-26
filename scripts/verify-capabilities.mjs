#!/usr/bin/env node
/**
 * Guards the Tauri filesystem capability against regressions:
 * every fs plugin command used by the frontend must be granted explicitly
 * (fs:default only covers app-specific directories), and convertFileSrc must
 * not be used while the asset protocol is disabled.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REQUIRED_PERMISSIONS = {
  readFile: "fs:allow-read-file",
  readTextFile: "fs:allow-read-text-file",
  writeFile: "fs:allow-write-file",
  writeTextFile: "fs:allow-write-text-file",
  exists: "fs:allow-exists",
  readDir: "fs:allow-read-dir",
  mkdir: "fs:allow-mkdir",
  remove: "fs:allow-remove",
  rename: "fs:allow-rename",
  copyFile: "fs:allow-copy-file",
  stat: "fs:allow-stat",
  lstat: "fs:allow-lstat",
  fstat: "fs:allow-fstat",
};

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(path);
    }
  }
})("src");

const usedCommands = new Set();
let usesConvertFileSrc = false;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (/\bconvertFileSrc\s*\(/.test(text)) {
    usesConvertFileSrc = true;
  }

  const importPattern = /import\s*\{([^}]+)\}\s*from\s*["']@tauri-apps\/plugin-fs["']/g;
  for (const match of text.matchAll(importPattern)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (REQUIRED_PERMISSIONS[name]) {
        usedCommands.add(name);
      }
    }
  }
}

const capability = JSON.parse(
  readFileSync(join("src-tauri", "capabilities", "default.json"), "utf8"),
);
const granted = new Set(
  capability.permissions.filter((permission) => typeof permission === "string"),
);

const missing = [];
for (const command of usedCommands) {
  const permission = REQUIRED_PERMISSIONS[command];
  if (!granted.has(permission)) {
    missing.push(`${command} requires ${permission}`);
  }
}

if (usesConvertFileSrc) {
  const tauriConfig = JSON.parse(
    readFileSync(join("src-tauri", "tauri.conf.json"), "utf8"),
  );
  const assetProtocolEnabled =
    tauriConfig?.app?.security?.assetProtocol?.enable === true;
  if (!assetProtocolEnabled) {
    missing.push(
      "convertFileSrc is used but app.security.assetProtocol.enable is not true",
    );
  }
}

if (missing.length > 0) {
  console.error("Capability verification failed:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log(
  `Capability verification passed (${usedCommands.size} fs commands checked).`,
);
