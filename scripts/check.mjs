/**
 * Static validation for the MeetNote extension: the extension loads unbundled,
 * so "build" means verifying the manifest, the files it points at, and that
 * every script parses.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = join(root, 'extension');
const errors = [];
const checked = [];

function fail(message) {
  errors.push(message);
}

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/* 1. manifest ------------------------------------------------------- */

const manifestPath = join(extensionDir, 'manifest.json');
if (!exists(manifestPath)) {
  fail('extension/manifest.json is missing.');
} else {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    checked.push('extension/manifest.json (JSON parse)');
  } catch (error) {
    fail(`extension/manifest.json is not valid JSON: ${error.message}`);
  }

  if (manifest) {
    if (manifest.manifest_version !== 3) fail('manifest_version must be 3.');
    for (const field of ['name', 'version', 'action', 'background']) {
      if (!manifest[field]) fail(`manifest.json is missing "${field}".`);
    }

    const referenced = [
      manifest.background?.service_worker,
      manifest.action?.default_popup,
      ...(manifest.content_scripts ?? []).flatMap((entry) => [...(entry.js ?? []), ...(entry.css ?? [])])
    ].filter(Boolean);

    for (const ref of referenced) {
      if (!exists(join(extensionDir, ref))) fail(`manifest.json references missing file: ${ref}`);
    }
    checked.push(`manifest references (${referenced.length} files)`);

    const required = ['tabCapture', 'offscreen', 'storage', 'downloads'];
    for (const permission of required) {
      if (!(manifest.permissions ?? []).includes(permission)) {
        fail(`manifest.json is missing the "${permission}" permission.`);
      }
    }
  }
}

/* 2. script syntax --------------------------------------------------- */

const jsFiles = exists(extensionDir) ? walk(extensionDir).filter((file) => file.endsWith('.js')) : [];
if (jsFiles.length === 0) fail('No extension JavaScript files were found.');

for (const file of jsFiles) {
  const rel = relative(root, file).replace(/\\/g, '/');
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    checked.push(`${rel} (syntax)`);
  } catch (error) {
    fail(`${rel} failed to parse:\n${String(error.stderr || error.message).trim()}`);
  }
}

/* 3. html asset references ------------------------------------------- */

const htmlFiles = exists(extensionDir) ? walk(extensionDir).filter((file) => file.endsWith('.html')) : [];
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  for (const ref of refs) {
    if (/^(https?:)?\/\//.test(ref)) continue;
    if (!exists(resolve(dirname(file), ref))) {
      fail(`${relative(root, file).replace(/\\/g, '/')} references missing asset: ${ref}`);
    }
  }
  checked.push(`${relative(root, file).replace(/\\/g, '/')} (${refs.length} asset refs)`);
}

/* 4. report ----------------------------------------------------------- */

for (const item of checked) console.log(`  ok  ${item}`);

if (errors.length > 0) {
  console.error('\nCheck failed:');
  for (const error of errors) console.error(`  x  ${error}`);
  process.exit(1);
}

console.log(`\nAll checks passed (${checked.length} items).`);
