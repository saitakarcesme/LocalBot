export default async({page,api,expect})=>{
 await page.getByRole('button',{name:'Profile menu'}).click();
 await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Connections',exact:true}).click();
 const picker=page.locator('.file-picker').first();
 await picker.locator('input').setInputFiles({name:'connections.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({mcpServers:{Audit:{url:'http://127.0.0.1:19999/mcp'}}}))});
 await page.getByRole('button',{name:'Import connections',exact:true}).click();
 await page.getByRole('heading',{name:'Audit',exact:true}).waitFor();
 expect((await api('state')).connections.some(c=>c.name==='Audit'),'file contents reach API and persist');
 expect(await picker.locator('.file-picker-name').textContent()==='connections.json','chosen filename rendered');
 await page.setViewportSize({width:390,height:844});
 const r=await picker.boundingBox();
 expect(!r||r.x>=0&&r.x+r.width<=390,'file picker stays within mobile width');
};
