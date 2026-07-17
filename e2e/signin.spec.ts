import { expect, test } from '@playwright/test';

test.describe('登录页', () => {
  test('渲染邮箱输入框和提交按钮', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('访问 /admin 未登录时重定向到登录页', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/signin/);
  });
});

test.describe('健康检查', () => {
  test('GET /api/health 返回 200', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });
});
