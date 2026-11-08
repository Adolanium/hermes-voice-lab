#!/usr/bin/env node
/**
 * Copy the packaged plugin into a Hermes home for testing:
 *   HERMES_HOME=/path/to/test-home node scripts/install-dev.mjs
 * Refuses to run without an explicit HERMES_HOME so a live profile is never touched by accident.
 */
import {cpSync, rmSync, existsSync} from 'node:fs';
import {join} from 'node:path';
const home = process.env.HERMES_HOME;
if (!home) throw new Error('Set HERMES_HOME to the test profile home');
if (!existsSync('release/hermes-voice-lab')) throw new Error('Run node scripts/package.mjs first');
const target = join(home, 'plugins', 'hermes-voice-lab');
rmSync(target, {recursive: true, force: true});
cpSync('release/hermes-voice-lab', target, {recursive: true});
console.log(`installed → ${target}`);
