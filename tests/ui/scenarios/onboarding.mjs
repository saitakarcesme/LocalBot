export default async ({page,api,expect,shot})=>{
 await api('preferences',{onboarded:false,restart:true});await page.reload();
 await page.getByRole('heading',{name:'Enter Your Name'}).waitFor();
 await page.getByLabel('Your name',{exact:true}).fill('İbrahim');
 const font=await page.locator('#welcome-name').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));expect(font>=38,'large name entry');
 await shot('name');
 await page.getByRole('button',{name:'Start with LocalBot'}).click();await page.waitForSelector('.conversation');
 const state=await api('state');expect(state.preferences.user==='İbrahim','name saved');
 expect(state.bots.find(b=>b.id===state.preferences.mainBot)?.name==='LocalBot','LocalBot is main bot');
 expect(await page.getByText('Hi İbrahim, I’m LocalBot. What would you like to do?',{exact:true}).count()===1,'welcome message');
 await page.reload();await page.waitForSelector('.conversation');expect(await page.locator('.onboarding').count()===0,'relaunch stays onboarded');
};
