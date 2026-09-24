import { test, expect } from "@playwright/test";
test("unconfigured workspace is explicit, navigable, and fits the screen", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready to connect." }),
  ).toBeVisible();
  await expect(
    page.getByText("No live notifications are being sent.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/settings/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("cron rejects unauthenticated requests", async ({ request }) => {
  expect((await request.get("/api/cron")).status()).toBe(401);
  expect(
    (
      await request.get("/api/cron", {
        headers: { authorization: "Bearer wrong" },
      })
    ).status(),
  ).toBe(401);
});
