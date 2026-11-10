export default async ({page, expect}) => {
  expect(await page.locator('.sidebar').count() === 1, 'sidebar renders');
  expect(await page.locator('.conversation').count() === 1, 'conversation renders');
};
