export default async ({page,api,base,expect,shot}) => {
 await page.waitForSelector('.localbot-figure svg');
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
 await page.getByRole('textbox',{name:'Bot name'}).fill('Figure test');
 await page.getByRole('button',{name:'Create',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.title-name')?.textContent==='Figure test');
 await page.goto(base+'/identity-preview.html');
 expect(await page.locator('main .figure').count()===10,'all ten animations');
 await page.emulateMedia({reducedMotion:'no-preference'});
 const before=await page.locator('.state-typing .figure-body').evaluate(el=>getComputedStyle(el).transform);
 await page.waitForTimeout(220);
 const after=await page.locator('.state-typing .figure-body').evaluate(el=>getComputedStyle(el).transform);
 expect(before!==after,'typing animates');await shot('dark');
 await page.click('#theme');await shot('light');
 await page.selectOption('#size','24');await page.waitForFunction(()=>document.querySelector('article .figure').clientWidth===24);
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await page.locator('.state-typing .figure-body').evaluate(el=>getComputedStyle(el).animationName)==='none','reduced motion');
};
