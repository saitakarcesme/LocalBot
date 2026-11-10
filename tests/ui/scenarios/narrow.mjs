// Messages must stay readable as the window shrinks: nothing clipped, nothing wider than the column.
export default async ({page, api, shot, expect, idle}) => {
  const bot = (await api('state')).bots[0];
  await api('preferences', {theme: 'dark'});
  for (const prompt of ['code', 'table', 'Kısacası: 0xSero, "yerel GPU\'da büyük model çalıştır + coding agent\'larla kullan" ekosisteminin altyapısını tek başına inşa eden bir geliştirici. https://example.com/a/very/long/path/that/keeps/going/and/going/without/any/break/at/all/for/a/while', 'long']) { await api('send', {bot: bot.id, prompt}); await page.waitForTimeout(250); }
  await page.waitForFunction(() => document.querySelector('.transcript')?.textContent.includes('Paragraph 40.') && !document.querySelector('.send-button.is-stop'), null, {timeout: 20000});
  await page.waitForTimeout(300);
  const check = async label => {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const bad = await page.evaluate(() => {
      const col = document.querySelector('.transcript').getBoundingClientRect();
      return [...document.querySelectorAll('.bubble, .md-code, .md-table, .turn-avatar, .message-actions, .composer, .title-pill, .header-actions')].filter(e => e.getClientRects().length).map(e => ({c: e.className, r: e.getBoundingClientRect()}))
        .filter(x => x.r.left < col.left - 1 || x.r.right > col.right + 1 || x.r.width < 40 && /bubble/.test(x.c)).map(x => `${x.c} ${Math.round(x.r.left)}–${Math.round(x.r.right)} (column ${Math.round(col.left)}–${Math.round(col.right)})`);
    });
    // Hidden tooltips may extend the scrollable width; what matters is that the chat cannot actually move sideways.
    const scrollX = await page.evaluate(() => { const t = document.querySelector('.transcript'); t.scrollLeft = 80; const moved = t.scrollLeft; t.scrollLeft = 0; return moved; });
    expect(!bad.length, label + ': ' + bad.slice(0, 4).join(' | '));
    expect(scrollX <= 1, label + ': transcript scrolls sideways by ' + scrollX);
  };
  for (const [w, h] of [[1280, 820], [900, 700], [760, 600], [660, 500]]) { await page.setViewportSize({width: w, height: h}); await page.evaluate(() => { const t = document.querySelector('.transcript'); t.scrollTop = 0; }); await shot('w' + w + '-top'); await page.evaluate(() => { const t = document.querySelector('.transcript'); t.scrollTop = t.scrollHeight; }); await shot('w' + w); }
  for (const [w, h] of [[1280, 820], [900, 700], [760, 600], [660, 500]]) { await page.setViewportSize({width: w, height: h}); await check('width ' + w); }
};
