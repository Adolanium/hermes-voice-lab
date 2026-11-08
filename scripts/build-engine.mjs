#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=spawnSync('cargo',['build','--manifest-path','engine/Cargo.toml','--release','--target','wasm32-unknown-unknown'],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status)process.exit(result.status);
await copyFile(new URL('../engine/target/wasm32-unknown-unknown/release/hermes_tract.wasm',import.meta.url),new URL('../audio/hermes_tract.wasm',import.meta.url));
