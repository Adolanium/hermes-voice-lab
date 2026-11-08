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
console.log('runtime/render.mjs');
