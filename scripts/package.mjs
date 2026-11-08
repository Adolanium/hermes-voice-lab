#!/usr/bin/env node
/**
 * Build plugin/ and archive it:
 *   release/hermes-voice-lab-<ver>.tar.gz   (unpacks to hermes-voice-lab/)
 * plugin/ is exactly what Hermes installs (`hermes plugins install Adolanium/hermes-voice-lab/plugin`);
 * the archive is for copying into $HERMES_HOME/plugins/ by hand. Users need neither Rust nor npm.
 * Node 20+ on the Hermes host is needed for agent-side rendering.
 */
import {cpSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (!process.argv.includes('--no-build')) execFileSync(process.execPath, ['scripts/build.mjs'], {stdio: 'inherit'});
const version = readFileSync('plugin/plugin.yaml', 'utf8').match(/version:\s*"?([\d.]+)/)[1];
rmSync('release', {recursive: true, force: true});
mkdirSync('release');
cpSync('plugin', 'release/hermes-voice-lab', {recursive: true, filter: s => !s.includes('__pycache__') && !s.endsWith('.DS_Store')});
const archive = `release/hermes-voice-lab-${version}.tar.gz`;
execFileSync('tar', ['-czf', archive, '-C', 'release', 'hermes-voice-lab'], {env: {...process.env, COPYFILE_DISABLE: '1'}});
rmSync('release/hermes-voice-lab', {recursive: true});
console.log(archive);
