import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeTextIfChanged(filePath, nextText) {
  const currentText = readFileSync(filePath, 'utf8');
  if (currentText === nextText) {
    return false;
  }

  writeFileSync(filePath, nextText, 'utf8');
  return true;
}

function writeJsonIfChanged(filePath, value) {
  const currentText = readFileSync(filePath, 'utf8');
  const eol = currentText.includes('\r\n') ? '\r\n' : '\n';
  let nextText = `${JSON.stringify(value, null, 2)}\n`;
  if (eol === '\r\n') {
    nextText = nextText.replace(/\n/g, '\r\n');
  }

  if (currentText === nextText) {
    return false;
  }

  writeFileSync(filePath, nextText, 'utf8');
  return true;
}

const version = process.argv[2] ?? process.env.VERSION;
if (!version) {
  fail('Missing version argument. Usage: node scripts/sync-version.mjs <version>');
}

if (!VERSION_PATTERN.test(version)) {
  fail(`Invalid version "${version}". Expected SemVer like 1.2.3 or 1.2.3-beta.1`);
}

const packageJsonPath = resolve('package.json');
const packageLockPath = resolve('package-lock.json');
const tauriConfigPath = resolve('src-tauri', 'tauri.conf.json');
const cargoTomlPath = resolve('src-tauri', 'Cargo.toml');
const changedFiles = [];

const packageJson = readJson(packageJsonPath);
packageJson.version = version;
if (writeJsonIfChanged(packageJsonPath, packageJson)) {
  changedFiles.push('package.json');
}

if (existsSync(packageLockPath)) {
  const packageLock = readJson(packageLockPath);
  packageLock.version = version;
  if (packageLock.packages && packageLock.packages['']) {
    packageLock.packages[''].version = version;
  }
  if (writeJsonIfChanged(packageLockPath, packageLock)) {
    changedFiles.push('package-lock.json');
  }
}

const tauriConfig = readJson(tauriConfigPath);
tauriConfig.version = version;
if (writeJsonIfChanged(tauriConfigPath, tauriConfig)) {
  changedFiles.push('src-tauri/tauri.conf.json');
}

const cargoToml = readFileSync(cargoTomlPath, 'utf8');
const packageVersionPattern = /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/m;
if (!packageVersionPattern.test(cargoToml)) {
  fail('Could not find [package] version in src-tauri/Cargo.toml');
}

const updatedCargoToml = cargoToml.replace(packageVersionPattern, `$1${version}$2`);
if (writeTextIfChanged(cargoTomlPath, updatedCargoToml)) {
  changedFiles.push('src-tauri/Cargo.toml');
}

console.log(`Synchronized project versions to ${version}`);
if (changedFiles.length > 0) {
  console.log(`Updated files: ${changedFiles.join(', ')}`);
} else {
  console.log('No file updates were needed.');
}
