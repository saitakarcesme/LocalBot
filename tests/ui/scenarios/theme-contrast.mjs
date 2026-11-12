export default async({page,api,expect})=>{
 for(const theme of ['light','dark']){
  await api('preferences',{theme});await page.reload();await page.waitForSelector('.composer');
  const expected=theme==='light'?'rgb(28, 28, 28)':'rgb(236, 236, 236)';
  await page.waitForFunction(c=>['.profile-row','.empty-chat h1'].every(s=>getComputedStyle(document.querySelector(s)).color===c),expected);
  expect(await page.locator('.empty-chat h1').evaluate((e,c)=>getComputedStyle(e).color===c,expected),'readable heading in '+theme);
 }
};
