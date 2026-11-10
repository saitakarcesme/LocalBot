// Configure a bot: every tab renders, changes save without a Save button.
export default async ({page, api, shot, expect}) => {
  const bot = (await api('state')).bots[0];
  await api('skills/save', {name: 'weekly-report', description: 'Write the weekly report', body: 'Steps…'});
  await api('preferences', {theme: 'dark'});
  await page.locator('.bot-row, .pin').first().click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Configure…'}).click();
  const dialog = page.getByRole('dialog', {name: /Configure/});
  await dialog.waitFor(); await shot('general');
  const name = dialog.getByRole('textbox', {name: 'Name'});
  await name.fill('Atlas'); await name.press('Enter');
  await page.waitForFunction(() => document.querySelector('.title-name')?.textContent === 'Atlas');
  await dialog.getByRole('switch', {name: 'Notifications'}).click();
  for (const tab of ['Personality', 'Abilities', 'Skills', 'Memory']) {
    await dialog.getByRole('button', {name: tab, exact: true}).click();
    await page.waitForTimeout(150); await shot(tab.toLowerCase());
    if (tab === 'Personality') { const area = dialog.getByRole('textbox', {name: 'Personality'}); await area.fill('Calm and precise.'); await dialog.getByRole('textbox', {name: 'Standing instructions'}).click(); }
    if (tab === 'Abilities') { await dialog.getByRole('switch', {name: 'Run commands'}).click(); await dialog.getByRole('combobox', {name: 'Save files'}).selectOption('allow'); }
    if (tab === 'Skills') await dialog.getByRole('switch', {name: 'weekly-report'}).click();
  }
  await page.waitForTimeout(200);
  const saved = (await api('state')).bots.find(b => b.id === bot.id);
  expect(saved.name === 'Atlas' && saved.muted === 1, 'name and mute saved');
  expect(saved.personality === 'Calm and precise.', 'personality saved on blur');
  expect(JSON.parse(saved.tools).includes('run_command') && JSON.parse(saved.rules).files === 'allow', 'abilities saved');
  expect(JSON.parse(saved.skills).length === 1, 'skill enabled');
  const box = await dialog.boundingBox(), over = await dialog.evaluate(el => [...el.querySelectorAll('button, input, select, textarea')].filter(e => { const r = e.getBoundingClientRect(), d = el.getBoundingClientRect(); return r.width && (r.left < d.left - 1 || r.right > d.right + 1); }).length);
  expect(box.width <= 800 && over === 0, 'controls stay inside the dialog');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { document.documentElement.dataset.host = 'mac'; document.documentElement.style.background = 'linear-gradient(120deg,#2b3350,#1c1c1f 60%,#3a2a3f)'; });
  await page.waitForTimeout(100); await shot('glass');
  expect(await page.locator('.sidebar-top button').count() === 3, 'search, new bot and the sidebar toggle');
  await page.getByRole('button', {name: 'Hide sidebar'}).click();
  expect(!(await page.locator('.sidebar').isVisible()), 'toggle inside the sidebar hides it');
  await page.getByRole('button', {name: 'Show sidebar'}).click();
  await page.locator('.sidebar').waitFor({state: 'visible'});
};
