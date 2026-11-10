export default async({page,context,open,expect,api})=>{
 await context.addInitScript(()=>{
  window.dockCalls=[];
  Object.defineProperty(window,'webkit',{configurable:true,value:{messageHandlers:{localbot:{postMessage(message){window.dockCalls.push(message);queueMicrotask(()=>window.nativeResult(message.id,true,null));}}}}});
 });
 await page.goto('about:blank');
 await open();
 expect(await page.locator('.computer-dock').count()===0,'dock hidden while idle');
 const bot=(await api('state')).bots[0];
 await api('permissions',{browser:'allow'});
 const run=await api('send',{bot:bot.id,prompt:'computer'});
 const dock=page.getByRole('region',{name:/computer$/});await dock.waitFor();
 await page.waitForFunction(()=>window.dockCalls.some(c=>c.action==='computerDock'&&!c.hidden&&c.width>300&&c.radius>0));
 expect(await dock.locator('*').count()===0,'the dock is a bare window: no bar, title or buttons');
 // The minimize button is native (it sits on the window corner, above the page); it reports back with this event.
 await page.evaluate(()=>window.dispatchEvent(new Event('localbot:computer-minimize')));
 await page.locator('.computer-dock').waitFor({state:'detached'});
 await page.waitForFunction(()=>window.dockCalls.filter(c=>c.action==='computerDock').at(-1)?.hidden);
 await page.getByRole('button',{name:/^Show .*computer$/}).click();
 await dock.waitFor();
 await page.getByRole('button',{name:'Profile menu'}).click();
 await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
 await page.waitForFunction(()=>window.dockCalls.filter(c=>c.action==='computerDock').at(-1)?.hidden);
 await api('cancel',{id:run.id});
 await page.locator('.computer-dock').waitFor({state:'detached'});
 expect((await api('state')).computer===null,'computer state cleared on stop');
 await page.getByRole('button',{name:'Close',exact:true}).click();
 const chat=await api('send',{bot:bot.id,prompt:'slow ordinary chat'});
 expect((await api('state')).computer===null,'ordinary model work does not show computer');
 await api('cancel',{id:chat.id});
 await api('send',{bot:bot.id,prompt:'computer again'});
 await page.locator('.computer-dock').waitFor();
 const request=await api('native/claim',{});
 expect(!!request,'browser action pending');
 await api('native/complete',{id:request.id,result:'Opened example page'});
 await page.locator('.computer-dock').waitFor({state:'detached'});
 expect((await api('state')).computer===null,'computer hidden on normal completion');
 expect(!await page.evaluate(()=>window.dockCalls.some(c=>c.action==='browser')),'never opens a separate browser window');
};
