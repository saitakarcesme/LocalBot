export default async({page,api,expect,shot,idle})=>{
 const initial=(await api('state')).bots[0];
 await api('bots/update',{id:initial.id,pinned:true});
 for(const name of ['Daily','ShopBot','Mivo','Lumo'])await api('bots',{name});
 await page.waitForFunction(()=>document.querySelectorAll('.bot-row').length===4);
 await page.locator('.bot-row').first().click({button:'right'});
 await page.getByRole('menuitem',{name:'Select…'}).click();
 await page.locator('.selection-bar').waitFor();
 const compactToggle=async name=>{await page.getByRole('button',{name:'Profile menu'}).click();await page.getByRole('menuitem',{name}).click();};
 const verify=async(label)=>{
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const geometry=await page.evaluate(()=>{
   const sidebar=document.querySelector('.sidebar').getBoundingClientRect();
   const header=document.querySelector('.chat-header').getBoundingClientRect(),transcript=document.querySelector('.transcript').getBoundingClientRect();
   const overflow=[...document.querySelectorAll('.sidebar button,.sidebar input,.sidebar select')].filter(e=>e.getClientRects().length).filter(e=>{const r=e.getBoundingClientRect();return r.left<sidebar.left-1||r.right>sidebar.right+1;}).map(e=>({label:e.getAttribute('aria-label'),rect:e.getBoundingClientRect().toJSON(),sidebar:sidebar.toJSON()}));
   const overlap=[...document.querySelectorAll('.sidebar-top button')].some(e=>{const r=e.getBoundingClientRect();return r.x<80&&r.y<48;});
   return {overflow,overlap,contentUnderHeader:transcript.top<header.bottom-1};
  });
  expect(!geometry.overflow.length,'sidebar controls contained '+label+': '+JSON.stringify(geometry.overflow));expect(!geometry.overlap,'native titlebar clearance');expect(!geometry.contentUnderHeader,'chat header separated from transcript');
 };
 await api('preferences',{theme:'dark'});await api('send',{bot:initial.id,prompt:'long'});await page.locator('.transcript').getByText('Paragraph 40.',{exact:false}).waitFor();await idle();
 await verify('expanded');
 await shot('expanded');
 await page.getByRole('button',{name:'Done'}).click();
 const centered=await page.locator('.profile-row').evaluate(e=>{const a=e.querySelector('.user-avatar').getBoundingClientRect(),n=e.querySelector('.bot-row-name').getBoundingClientRect();return Math.abs(a.y+a.height/2-n.y-n.height/2)<2;});
 expect(centered,'profile name vertically centered with avatar');
await shot('plain');
 await page.setViewportSize({width:700,height:820});
 expect(await page.locator('.selection-bar').count()===0,'no selection bar in compact mode');
 await verify('compact');await shot('compact');
 await page.setViewportSize({width:660,height:500});await verify('compact-small');await shot('compact-small');
 // In a small window the icon rail is automatic; it returns to the full sidebar when there is room again.
 expect(await page.evaluate(()=>document.querySelector('.app').classList.contains('sidebar-compact')),'small window keeps the icon rail');
 await page.setViewportSize({width:1100,height:700});await page.waitForFunction(()=>!document.querySelector('.app').classList.contains('sidebar-compact'));await verify('expanded-again');
 await api('preferences',{zoom:140});await page.waitForFunction(()=>document.documentElement.style.zoom==='1.4');await verify('zoom');
};
