import { expect, test } from '@playwright/test';

test('app mounts and exposes the core UI', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('board-canvas')).toBeVisible();
  await expect(page.getByTestId('next-canvas')).toBeVisible();
  await expect(page.getByTestId('new-game-button')).toBeVisible();
  await expect(page.getByTestId('reroll-button')).toBeDisabled();
  await expect(page.getByTestId('clear-board-button')).toBeDisabled();
  await expect(page.getByTestId('score')).toHaveText('0');
  await expect(page.getByTestId('moves')).toHaveText('0');

  const boardSize = await page.getByTestId('board-canvas').evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }));

  expect(boardSize.width).toBeGreaterThan(0);
  expect(boardSize.height).toBeGreaterThan(0);

  await page.getByTestId('new-game-button').click();
  await expect(page.getByTestId('game-over-overlay')).not.toBeVisible();
});
