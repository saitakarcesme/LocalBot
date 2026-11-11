// Visual check of the plain sidebar: pins, a section, unread, a running task, the menus.
export default async ({page, api, shot, expect, idle}) => {
  const first = (await api('state')).bots[0];
  await api('bots/update', {id: first.id, pinned: true});
  const ids = [];
  for (const name of ['Daily', 'ShopBot', 'Mivo', 'Lumo', 'Scout']) ids.push((await api('bots', {name})).id);
  const {sections} = await api('sections', {sections: [{id: 'work-1234', name: 'Work'}]});
  await api('bots/update', {id: ids[0], section: sections[0].id});
  await api('bots/update', {id: ids[1], section: sections[0].id, muted: true});
  await api('send', {bot: ids[2], prompt: 'table'}); await api('send', {bot: ids[2], prompt: 'code'});
  await api('ui', {key: 'draft:' + ids[3], value: 'half written thought'});
  await page.waitForFunction(() => document.querySelectorAll('.bot-row').length === 5);
  await idle(); await page.waitForTimeout(400);
  await shot('plain');
  const top = await page.locator('.sidebar-top button').count();
  expect(top === 3, 'search, new bot and toggle in the top bar, got ' + top);
  expect(await page.locator('.sidebar input, .sidebar select').count() === 0, 'no form controls in the resting sidebar');
  await page.locator('.bot-row', {hasText: 'Lumo'}).click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Mute'}).waitFor();
  await shot('row-menu'); await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Profile menu'}).click();
  await shot('profile-menu');
  expect(await page.getByRole('menuitem',{name:'Compact sidebar'}).count()===0,'no duplicate compact option');
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:700,height:820});
  await page.waitForTimeout(200); await shot('compact');
};
