export default async({page,api,shot,expect})=>{
 const desktop=['General','Appearance','Model','Permissions','Skills','Vault','Tasks','Connections','Routines','Data','Diagnostics','About'];
 for(const theme of ['dark','light']){
  await api('preferences',{theme});await page.reload();await page.waitForSelector('.composer');
  await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);
  await page.waitForTimeout(200);
  await page.evaluate(()=>document.documentElement.dataset.host='mac');
  await shot('mac-'+theme+'-chat');
  await page.getByRole('button',{name:'Profile menu'}).click();await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
  for(const name of desktop){await page.getByRole('button',{name,exact:true}).click();await shot('mac-'+theme+'-'+name.toLowerCase());if(name==='General'){await page.locator('.settings-content').evaluate(e=>e.scrollTop=e.scrollHeight);await shot('mac-'+theme+'-general-bottom');}}
  await page.keyboard.press('Escape');
  await page.evaluate(()=>document.documentElement.dataset.host='web');await page.setViewportSize({width:393,height:852});await page.waitForSelector('.mobile-home');
  await shot('phone-'+theme+'-home');
  await page.getByRole('button',{name:'New Bot',exact:true}).click();await shot('phone-'+theme+'-create');await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await shot('phone-'+theme+'-settings');
  for(const name of ['General','Appearance','Permissions','Vault','Tasks','Routines','About','Connect apps']){
   await page.getByRole('button',{name:new RegExp(name),exact:true}).click();await shot('phone-'+theme+'-'+name.toLowerCase().replaceAll(' ','-'));
   expect(await page.locator('.mobile-sheet-body').evaluate(e=>e.scrollWidth<=e.clientWidth),'no overflow '+name);
   expect(await page.locator('.mobile-sheet-body').evaluate(e=>{const c=e.querySelector('.settings-group');if(!c)return true;const r=c.getBoundingClientRect(),b=e.getBoundingClientRect();return Math.abs((r.left-b.left)-(b.right-r.right))<2;}),'symmetric settings cards '+name);
   if(name==='Permissions'){await page.locator('.mobile-sheet-body').evaluate(e=>e.scrollTop=e.scrollHeight);await shot('phone-'+theme+'-permissions-bottom');}
   await page.getByRole('button',{name:'Back',exact:true}).click();
  }
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('.mobile-main-bot').click();await shot('phone-'+theme+'-chat');
  await page.getByRole('button',{name:'LocalBot details',exact:true}).click();await shot('phone-'+theme+'-details');
  await page.getByRole('button',{name:'Close details'}).click();
  await page.setViewportSize({width:1280,height:820});await page.waitForSelector('.sidebar');
 }
};
