#!/usr/bin/env node
// Build the Node runtime used by agent tools: runtime/render.mjs (+ WASM, lexicon).
import {build} from 'esbuild';
import {copyFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
mkdirSync('runtime', {recursive: true});
copyFileSync('assets/lexicon.txt.gz', 'runtime/lexicon.txt.gz');
await build({entryPoints: ['src/cli/render.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: 'runtime/render.mjs', logLevel: 'warning', legalComments: 'none'});
const catalog = await build({entryPoints: ['src/cli/catalog.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node20', write: false, logLevel: 'warning'});
const tmp = 'runtime/.catalog.mjs';
const {writeFileSync, rmSync} = await import('node:fs');
writeFileSync(tmp, catalog.outputFiles[0].text);
const {execFileSync} = await import('node:child_process');
execFileSync(process.execPath, [tmp, 'runtime/catalog.json']);
rmSync(tmp);
console.log('runtime/render.mjs, runtime/catalog.json');
