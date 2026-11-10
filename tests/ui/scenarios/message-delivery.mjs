export default async ({page,api,send,idle,expect}) => {
 await page.emulateMedia({reducedMotion:'no-preference'});
 await send('long');
 await page.waitForSelector('.send-button.is-stop');
 await page.waitForTimeout(250);
 expect(await page.locator('.turn-bot .bubble').count()===0,'partial streamed prose stays out of the transcript');
 await idle();
 expect((await page.locator('.turn-bot .bubble').last().innerText()).includes('Paragraph 40.'),'complete response appears together');
 await api('permissions',{files:'allow'});
 await send('write notes');await idle();
 expect(await page.locator('.steps,.steps-summary').count()===0,'tool activity is absent from the conversation');
};
