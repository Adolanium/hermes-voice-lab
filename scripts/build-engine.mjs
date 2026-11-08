#!/usr/bin/env node
// Compile the Rust engine to WebAssembly and copy it into runtime/.
import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const r = spawnSync('cargo', ['build', '--manifest-path', 'engine/Cargo.toml', '--release', '--lib', '--target', 'wasm32-unknown-unknown'], {cwd: root, stdio: 'inherit'});
if (r.error) throw r.error;
if (r.status) process.exit(r.status);
mkdirSync(`${root}runtime`, {recursive: true});
copyFileSync(`${root}engine/target/wasm32-unknown-unknown/release/voice_lab_engine.wasm`, `${root}runtime/voice_lab_engine.wasm`);
console.log('runtime/voice_lab_engine.wasm');
