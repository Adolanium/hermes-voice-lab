#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {renderWav} from '../audio/offline.js';
const args=process.argv.slice(2);const get=name=>args[args.indexOf(name)+1];
try{
 if(!args.includes('--project')||!args.includes('--output'))throw new Error('Usage: node scripts/render.mjs --project project.json --output render.wav');
 const project=JSON.parse(await readFile(get('--project'),'utf8'));
 const bytes=await readFile(new URL('../audio/hermes_tract.wasm',import.meta.url));
 const {wav,samples,...metadata}=renderWav(bytes,project);
 await writeFile(get('--output'),Buffer.from(wav));
 process.stdout.write(JSON.stringify({output:get('--output'),...metadata,bytes:wav.byteLength})+'\n');
}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
