#!/usr/bin/env node
/**
 * Assemble the installable plugin folder and archive:
 *   release/hermes-voice-lab/          (copy into $HERMES_HOME/plugins/)
 *   release/hermes-voice-lab-<ver>.tar.gz
 * Only runtime files ship; users need neither Rust nor npm. Node 20+ on the
 * Hermes host is needed for agent-side rendering.
 */
import {cpSync, mkdirSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (!process.argv.includes('--no-build')) execFileSync(process.execPath, ['scripts/build.mjs'], {stdio: 'inherit'});
const version = readFileSync('plugin.yaml', 'utf8').match(/version:\s*"?([\d.]+)/)[1];
const dest = 'release/hermes-voice-lab';
rmSync('release', {recursive: true, force: true});
mkdirSync(dest, {recursive: true});
const ship = ['plugin.yaml', '__init__.py', 'voice_backend.py', 'tts.py', 'dashboard', 'desktop/plugin.js', 'runtime/render.mjs', 'runtime/voice_lab_engine.wasm',
  'runtime/lexicon.txt.gz', 'runtime/catalog.json', 'assets/CMUDICT-LICENSE', 'README.md', 'LICENSE', 'NOTICE.md', 'docs'];
for (const entry of ship) {
  if (!existsSync(entry)) throw new Error(`missing ${entry} — run the build first`);
  cpSync(entry, `${dest}/${entry}`, {recursive: true, filter: s => !s.includes('__pycache__') && !s.endsWith('.DS_Store')});
}
const archive = `release/hermes-voice-lab-${version}.tar.gz`;
execFileSync('tar', ['-czf', archive, '-C', 'release', 'hermes-voice-lab'], {env: {...process.env, COPYFILE_DISABLE: '1'}});
console.log(archive);
