export default async ({page,api,expect})=>{
 const state=await api('state'),bot=state.bots[0];
 await api('import',{bot:bot.id,name:'notes.txt',data:Buffer.from('Searchable local document').toString('base64')});
 await page.getByRole('button',{name:bot.name+' details'}).click();
 await page.getByRole('radio',{name:'Library',exact:true}).click();
 await page.getByRole('button',{name:/notes.txt/}).click();
 await page.getByText('Searchable local document',{exact:true}).waitFor();
 expect(await page.getByRole('button',{name:'Find in file'}).count()===1,'file find available');
 await page.getByRole('button',{name:'Close preview'}).click();
 await page.getByRole('button',{name:'Profile menu'}).click();await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'General',exact:true}).click();
 await page.getByRole('button',{name:'Restart guide'}).click();
 await page.getByLabel('What should I call you?').fill('Tester');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('button',{name:'Set up later'}).click();
 await page.getByLabel('First task').waitFor();
 await page.getByRole('button',{name:'Start',exact:true}).click();
 await page.locator('.sidebar').waitFor();
};
