export default async ({page,api,expect}) => {
 const state=await api('state');const bot=state.bots[0];
 await page.locator('.bot-row').first().hover();
 await page.getByRole('button',{name:'More actions for '+bot.name}).click();
 await page.getByRole('menuitem',{name:'Configure…'}).click();
 // The dialog takes focus one frame after it opens; typing starts after that, as it would for a person.
 await page.waitForFunction(()=>document.querySelector('.configure')?.contains(document.activeElement));
 await page.getByLabel('Label',{exact:true}).fill('Research');
 await page.getByLabel('Label',{exact:true}).press('Enter');
 await page.waitForFunction(()=>document.querySelector('.title-label')?.textContent==='Research');
 expect((await api('state')).bots[0].label==='Research','configuration saves without a Save button');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Profile menu'}).click();
 await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Skills',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('summarize');
 await page.getByLabel('Description',{exact:true}).fill('Summarize a document');
 await page.getByLabel('Instructions',{exact:true}).fill('Read and summarize the supplied document.');
 await page.getByRole('button',{name:'Save skill'}).click();
 await page.waitForFunction(()=>document.querySelector('.manage-card')?.textContent.includes('summarize'));
 expect((await api('state')).skills.length===1,'skill persisted');
 await page.getByRole('button',{name:'Routines',exact:true}).click();
 await page.getByRole('button',{name:'New routine'}).click();
 await page.getByLabel('Name',{exact:true}).fill('Morning');
 await page.getByLabel('Task',{exact:true}).fill('Summarize my notes');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.manage-card')?.textContent.includes('Morning'));
 expect((await api('state')).routines.length===1,'routine persisted');
};
