#!/usr/bin/env node
/* Copy the static TimeWise web app into www/ for the Capacitor WebView.
   The project root stays the single source of truth — no build/transform step. */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEST = path.join(ROOT, 'www');
const FILES = [
  'manifest.webmanifest',
  'sw.js',
  ...fs.readdirSync(ROOT).filter((name) => name.endsWith('.html'))
];
const DIRS = ['assets'];

function copyFile(name) {
  const source = path.join(ROOT, name);
  if (!fs.existsSync(source)) throw new Error('Missing source file: ' + name);
  fs.copyFileSync(source, path.join(DEST, name));
}

function main() {
  fs.rmSync(DEST, { recursive: true, force: true });
  fs.mkdirSync(DEST, { recursive: true });

  FILES.forEach(copyFile);
  DIRS.forEach((name) => {
    fs.cpSync(path.join(ROOT, name), path.join(DEST, name), { recursive: true });
  });

  const copied = fs.readdirSync(DEST).sort();
  console.log('Synced ' + copied.length + ' entries into www/');
  console.log(copied.join('\n'));
}

main();
