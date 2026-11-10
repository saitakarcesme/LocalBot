import {writeFile,mkdir} from 'node:fs/promises';
export default async ({page,api,base,expect}) => {
 const path=new URL('../../../artifacts/orb/',import.meta.url);await mkdir(path,{recursive:true});
 await page.waitForFunction(()=>[...document.querySelectorAll('.localbot-orb canvas')].some(c=>Number(c.dataset.frames)>0),null,{timeout:5000});
 // Exercise every settings page at narrow width, including controls formerly overflowing.
 await page.setViewportSize({width:660,height:700});
 await page.getByRole('button',{name:'Profile menu'}).click();
 await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
 for(const name of ['General','Appearance','Model','Permissions','Skills','Vault','Tasks','Connections','Routines','Data','Diagnostics','About']){
  await page.locator('.settings-nav').getByRole('button',{name,exact:true}).click();
  const over=await page.locator('.settings-content').evaluate(el=>el.scrollWidth-el.clientWidth);
  expect(over<=1,`${name} settings overflow ${over}`);
 }
 await page.locator('.settings-nav').getByRole('button',{name:'Appearance',exact:true}).click();
 expect(await page.getByRole('combobox',{name:'Color palette'}).count()===0,'color themes removed');
 expect(await page.getByRole('radio',{name:'System',exact:true}).count()===0,'only light and dark themes');
 await page.keyboard.press('Escape');
 // Plus/file input must return to the app after cancel, then work again.
 for(let i=0;i<2;i++){
  const add=page.locator('.composer .composer-button').first();
  if(await add.getAttribute('aria-label')==='Add'){
   await add.click();
   const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('menuitem',{name:'Add files…'}).click()]);await chooser.setFiles([]);
  }else{
   const [chooser]=await Promise.all([page.waitForEvent('filechooser'),add.click()]);await chooser.setFiles([]);
  }
  await page.locator('.composer textarea').fill('responsive');
 }
 await page.keyboard.press('Control+n');
 await page.getByRole('textbox',{name:'Bot name'}).fill('Orb test');
 await page.getByRole('button',{name:'Create',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.title-name')?.textContent==='Orb test');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.setViewportSize({width:1100,height:850});await page.goto(base+'/orb-preview.html');
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.frames>1);
 for(const theme of ['dark','light']){
  await page.selectOption('#theme',theme);await page.waitForTimeout(300);await page.screenshot({path:new URL(theme+'.png',path).pathname});
 }
 for(const state of ['thinking','generating','listening','success','error','idle']){await page.selectOption('#state',state);await page.waitForTimeout(180);expect(await page.locator('canvas[data-state="'+state+'"]').count()===12,state+' propagated');}
 const png=await page.evaluate(()=>window.orbExport(1024));await writeFile(new URL('LocalBot.png',path),Buffer.from(png.split(',')[1],'base64'));
 // Record the actual three animated prototype canvases together, no synthetic audio.
 await page.selectOption('#theme','dark');await page.selectOption('#state','thinking');
 const video=await page.evaluate(async()=>{
  if(!HTMLCanvasElement.prototype.captureStream||!window.MediaRecorder)return null;
  const c=document.createElement('canvas');c.width=960;c.height=360;const g=c.getContext('2d');
  const stream=c.captureStream(24),rec=new MediaRecorder(stream),chunks=[];rec.ondataavailable=e=>chunks.push(e.data);rec.start();
  let running=true;function draw(){g.fillStyle='#17181b';g.fillRect(0,0,960,360);document.querySelectorAll('.stage canvas').forEach((src,i)=>{g.drawImage(src,i*320+40,30,240,240);g.fillStyle='#eee';g.font='18px sans-serif';g.fillText(['Fluid Marble','Light Core','Chromatic Flow'][i],i*320+40,310)});if(running)requestAnimationFrame(draw)}draw();
  await new Promise(r=>setTimeout(r,5000));running=false;const done=new Promise(r=>rec.onstop=r);rec.stop();await done;stream.getTracks().forEach(t=>t.stop());
  const blob=new Blob(chunks,{type:rec.mimeType});return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(blob)});
 });if(video)await writeFile(new URL('concepts.webm',path),Buffer.from(video.split(',')[1],'base64'));
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(300);
 const frames=await page.locator('canvas').first().getAttribute('data-frames');await page.waitForTimeout(400);
 expect(frames===await page.locator('canvas').first().getAttribute('data-frames'),'reduced motion stops scheduler');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('.card').first().evaluate(el=>el.style.display='none');await page.waitForTimeout(300);
 const hiddenFrames=await page.locator('canvas').first().getAttribute('data-frames');await page.waitForTimeout(400);
 expect(hiddenFrames===await page.locator('canvas').first().getAttribute('data-frames'),'hidden orb stops rendering');
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:original.call(this,type,...args)}});
 await page.reload();await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.frames>0);await page.waitForTimeout(300);
 const fallbackFrames=await page.locator('canvas').first().getAttribute('data-frames');await page.waitForTimeout(300);
 expect(fallbackFrames===await page.locator('canvas').first().getAttribute('data-frames'),'WebGL failure uses a static fallback');

};
