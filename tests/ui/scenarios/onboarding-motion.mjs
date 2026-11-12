export default async({page,api,expect,shot})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await api('preferences',{onboarded:false,restart:true});await page.reload();
 await page.getByLabel('Your name',{exact:true}).fill('Sait');
 await page.evaluate(()=>{
  window.transitionEvents=[];
  const original=Element.prototype.animate;
  Element.prototype.animate=function(...args){const animation=original.apply(this,args);window.transitionEvents.push(this.className);return animation;};
 });
 await page.getByRole('button',{name:'Start with LocalBot'}).click();
 await page.waitForFunction(()=>window.transitionEvents.length>=2,null,{timeout:10000});
 expect(await page.locator('.onboarding').count()===0,'old welcome surface removed; no ghost overlay');
 await shot('moving');
 await page.waitForFunction(()=>!document.documentElement.dataset.welcomeTransition,null,{timeout:5000});
 expect(await page.locator('.composer').count()===1,'one composer after transition');
 await shot('complete');
};
