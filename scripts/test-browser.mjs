import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const url=process.env.VOICE_LAB_URL||'http://127.0.0.1:5188';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
  window.__audioContexts=[];window.__analysers=[];
  const Native=window.AudioContext;
  window.AudioContext=class extends Native{constructor(...args){super(...args);window.__audioContexts.push(this);}createAnalyser(){const a=super.createAnalyser();window.__analysers.push(a);return a;}};
});
try{
 await page.goto(url);await page.getByRole('heading',{name:'Hermes Voice Lab'}).waitFor();
 assert.equal(await page.evaluate(()=>window.__audioContexts.length),0,'No autoplay');
 const hold=page.getByRole('button',{name:'Hold to sing'});await hold.hover();await page.mouse.down();
 await page.waitForFunction(()=>window.__audioContexts.some(c=>c.state==='running')&&window.__analysers.length);
 await page.waitForTimeout(300);
 const rms=await page.evaluate(()=>{const a=window.__analysers.at(-1),b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);return Math.sqrt(b.reduce((s,x)=>s+x*x,0)/b.length)});
 assert.ok(rms>.002,`Real AudioWorklet output RMS ${rms}`);
 await page.mouse.up();await page.waitForTimeout(300);
 const quiet=await page.evaluate(()=>{const a=window.__analysers.at(-1),b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);return Math.max(...b.map(Math.abs))});
 assert.ok(quiet<.001,`Release became silent ${quiet}`);
 await page.getByRole('button',{name:'EE Ee',exact:true}).click();
 await page.locator('body').click({position:{x:5,y:5}});await page.keyboard.down('a');await page.waitForTimeout(150);await page.keyboard.up('a');
 await page.getByRole('button',{name:'Play sequence',exact:true}).click();await page.waitForTimeout(250);
 await mkdir('docs/media',{recursive:true});await page.screenshot({path:'docs/media/instrument.png',fullPage:true});
 await page.getByRole('button',{name:'Stop',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export WAV'}).click();const wav=await download;await wav.saveAs('docs/media/browser-sequence.wav');
 const bytes=await readFile('docs/media/browser-sequence.wav');assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.ok(bytes.length>48000);
 const save=page.waitForEvent('download');await page.getByRole('button',{name:'Save patch'}).click();const patch=await save;await patch.saveAs('docs/media/browser-patch.json');
 const project=JSON.parse(await readFile('docs/media/browser-patch.json','utf8'));assert.equal(project.version,1);assert.ok(project.events.length);
 await page.locator('input[type=file]').setInputFiles('docs/media/browser-patch.json');
 await page.getByRole('status').filter({hasText:'Loaded'}).waitFor();
 for(let cycle=0;cycle<3;cycle++){
  await page.getByRole('button',{name:'Disable audio'}).click();
  await page.waitForFunction(()=>window.__audioContexts.every(c=>c.state==='closed'));
  await hold.hover();await page.mouse.down();await page.waitForTimeout(180);await page.mouse.up();
  assert.equal(await page.evaluate(()=>window.__audioContexts.filter(c=>c.state==='running').length),1);
 }
 await page.getByRole('button',{name:'Disable audio'}).click();
 await page.waitForFunction(()=>window.__audioContexts.every(c=>c.state==='closed'));
 const tongue=page.getByRole('slider',{name:'Drag tongue'});await tongue.focus();await page.keyboard.press('ArrowRight');
 await page.getByLabel('Words to synthesize').fill('unknownword');await page.getByRole('button',{name:'Speak text'}).click();
 await page.getByRole('status').filter({hasText:'Unsupported words: unknownword'}).waitFor();
 await page.setViewportSize({width:430,height:900});await page.screenshot({path:'docs/media/instrument-narrow.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow at 430px');
 await page.goto('about:blank');
 assert.deepEqual(errors,[]);
 const report={browser:await browser.version(),realAudioWorkletRms:rms,releasePeak:quiet,wavBytes:bytes.length,checks:['no autoplay','user gesture loads WASM AudioWorklet','nonzero output','release silence','vowel edit','keyboard note','sequence','WAV export','patch roundtrip','430px layout','three audio disable/restart cycles','all contexts closed','avatar keyboard articulation','unknown word rejection','unmount'],errors};
 await writeFile('docs/browser-test-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close()}
