export default async({page,api,expect,shot})=>{
 await page.setViewportSize({width:393,height:852});await page.waitForSelector('.mobile-home');
 await page.evaluate(()=>{
  const v=visualViewport;window.mockHeight=852;Object.defineProperty(v,'height',{get:()=>window.mockHeight,configurable:true});Object.defineProperty(v,'offsetTop',{get:()=>0,configurable:true});
  window.keyboard=(height)=>{window.mockHeight=height;v.dispatchEvent(new Event('resize'));};
 });
 await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('searchbox',{name:'Search'}).fill('Local');
 await page.evaluate(()=>keyboard(390));await shot('search-open');
 let box=await page.locator('.mobile-search-bar').boundingBox();expect(box.y+box.height<=390&&box.y+box.height>=380,'search rests immediately above keyboard');
 expect(await page.evaluate(()=>document.scrollingElement.scrollHeight<=innerHeight),'document cannot scroll');
 await page.evaluate(async()=>{const {html,render}=await import('/src/lib.js');const {PhonePairing}=await import('/src/mobile.js');render(html`<${PhonePairing}/>`,document.getElementById('root'));await new Promise(r=>setTimeout(r,100));const {installMobileViewport}=await import('/src/mobile-viewport.js');installMobileViewport();});
 await page.getByLabel('Pairing code',{exact:true}).fill('1234');await page.evaluate(()=>keyboard(390));await shot('pairing-open');
 box=await page.getByLabel('Pairing code',{exact:true}).boundingBox();expect(box.y>=0&&box.y+box.height<390,'pairing input visible with keyboard');
 await page.evaluate(()=>keyboard(852));await shot('pairing-closed');
};
