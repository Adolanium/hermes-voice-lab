#!/usr/bin/env node
// Bundle the TypeScript tests with esbuild and run them with node:test.
import {build} from 'esbuild';
import {readdirSync, rmSync, mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const out = '.test-build';
rmSync(out, {recursive: true, force: true});
mkdirSync(out);
const entries = readdirSync('tests').filter(f => f.endsWith('.test.ts')).map(f => `tests/${f}`);
await build({entryPoints: entries, outdir: out, bundle: true, platform: 'node', format: 'esm', target: 'node20', outExtension: {'.js': '.mjs'}, logLevel: 'warning', packages: 'external'});
const r = spawnSync(process.execPath, ['--test', ...readdirSync(out).map(f => `${out}/${f}`)], {stdio: 'inherit'});
rmSync(out, {recursive: true, force: true});
process.exit(r.status ?? 1);
