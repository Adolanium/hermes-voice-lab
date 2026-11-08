import {mkdir,rm,cp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
const dest='release/hermes-voice-lab';await rm(dest,{recursive:true,force:true});await mkdir(dest,{recursive:true});
for(const entry of ['plugin.yaml','__init__.py','voice_backend.py','dashboard','desktop','audio','scripts/render.mjs','README.md','LICENSE','NOTICE.md','docs','examples']){
  await mkdir(`${dest}/${entry.includes('/')?entry.slice(0,entry.lastIndexOf('/')):''}`,{recursive:true});
  await cp(entry,`${dest}/${entry}`,{recursive:true,filter:s=>!s.includes('__pycache__')});
}
// Node treats the renderer files as ESM without shipping development dependencies.
await cp('package.json',`${dest}/package.json`);
execFileSync('tar',['-czf','release/hermes-voice-lab-0.1.0.tar.gz','-C','release','hermes-voice-lab'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
console.log('release/hermes-voice-lab-0.1.0.tar.gz');
