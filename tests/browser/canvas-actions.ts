import type { Page } from '@playwright/test';

/** A narrow method canvas uses an overlay panel; close it before pointing at a node. */
export async function selectCanvasNode(page: Page, id: string) {
  const close = page.getByRole('button', { name: '收起侧栏', exact: true });
  if (await close.isVisible()) await close.click();
  await page.locator('.react-flow__controls-fitview').click();
  await page.locator(`.react-flow__node[data-id="${id}"]`).click();
}
