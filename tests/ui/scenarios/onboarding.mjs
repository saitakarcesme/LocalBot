export default async ({page,api,expect,shot})=>{
 await api('preferences',{onboarded:false,restart:true});await page.reload();
 await page.getByRole('status',{name:'LocalBot is typing'}).waitFor();
 await page.getByText('Hi, I’m LocalBot. What should I call you?',{exact:true}).waitFor();
 await page.getByLabel('Your name',{exact:true}).fill('İbrahim');
 const font=await page.locator('#welcome-name').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));expect(font<30,'normal message entry');
 const before=await page.locator('.welcome-composer').boundingBox();
 await shot('name');
 await page.getByRole('button',{name:'Start with LocalBot'}).click();await page.waitForSelector('.conversation');
 await page.waitForTimeout(1000);
 const after=await page.locator('.composer').boundingBox();expect(Math.abs(before.width-after.width)<3,'welcome and chat composer have matching widths');
 await shot('completed');
 const state=await api('state');expect(state.preferences.user==='İbrahim','name saved');
 expect(state.bots.find(b=>b.id===state.preferences.mainBot)?.name==='LocalBot','LocalBot is main bot');
 expect(await page.getByText('Nice to meet you, İbrahim. What would you like to do?',{exact:true}).count()===1,'welcome message');
 await page.reload();await page.waitForSelector('.conversation');expect(await page.locator('.onboarding').count()===0,'relaunch stays onboarded');
};
