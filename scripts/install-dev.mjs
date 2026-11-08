#!/usr/bin/env node
/**
 * Copy plugin/ into a Hermes home for testing (run `npm run build` first):
 *   HERMES_HOME=/path/to/test-home node scripts/install-dev.mjs
 * Refuses to run without an explicit HERMES_HOME so a live profile is never touched by accident.
 */
import {cpSync, rmSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const home = process.env.HERMES_HOME;
if (!home) throw new Error('Set HERMES_HOME to the test profile home');
const source = fileURLToPath(new URL('../plugin', import.meta.url));
if (!existsSync(join(source, 'desktop/plugin.js'))) throw new Error('Run npm run build first');
const target = join(home, 'plugins', 'hermes-voice-lab');
rmSync(target, {recursive: true, force: true});
cpSync(source, target, {recursive: true, filter: s => !s.includes('__pycache__') && !s.endsWith('.DS_Store')});
console.log(`installed → ${target}`);
