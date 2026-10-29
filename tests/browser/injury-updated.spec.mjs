import { test, expect } from "@playwright/test";
import { fieldFixture, NOW } from "./field-fixture.mjs";

const UPDATED = "2026-09-12T23:30:00Z";
function sourceFixture() {
  const feed = fieldFixture();
  for (const report of feed.reports) report.source_updated_at = UPDATED;
  return feed;
}
async function setup(page, feed) {
  await page.clock.setFixedTime(new Date(NOW));
  await page.route("**/current.json", (route) => route.fulfill({ json: feed }));
  await page.route(/\/(?:contributions(?:-2024)?|defense-stats|injury-history|player-history|coordinators)\.json$/, (route) => route.fulfill({ status: 404 }));
  await page.goto("/");
  await expect(page.locator("#week")).toBeEnabled();
}

for (const [timezoneId, localTime] of [
  ["America/Chicago", /^Injury data updated Sep 12, 6:30 PM (CDT|GMT-5)$/],
  ["Europe/London", /^Injury data updated Sep 13, 12:30 AM (BST|GMT\+1)$/],
  ["Asia/Tokyo", /^Injury data updated Sep 13, 8:30 AM (JST|GMT\+9)$/],
]) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    test("injury source update uses local time across weeks and refreshes", async ({ page }) => {
      const feed = sourceFixture();
      await setup(page, feed);
      const label = page.locator("#injury-updated");
      await expect(label).toBeVisible();
      await expect(label).toHaveText(localTime);
      // Collection, roster and browser times differ from the injury file time.
      expect(feed.generated_at).not.toBe(UPDATED);
      expect(feed.roster.source_updated_at).not.toBe(UPDATED);
      await page.locator("#week").selectOption("2026-REG-2");
      await expect(label).toHaveText(localTime);
      await page.locator("#refresh").click();
      await expect(page.locator("#refresh-state")).not.toContainText("Checking");
      await expect(label).toHaveText(localTime);
      await expect(page.locator("#week")).toHaveValue("2026-REG-2");
      for (const report of feed.reports) report.source_updated_at = null;
      await page.locator("#refresh").click();
      await expect(label).toHaveText("Injury data updated not supplied");
      await expect(page.locator("#week")).toHaveValue("2026-REG-2");
    });
  });
}

for (const missing of ["null", "omitted", "no reports"]) {
  test(`missing source timestamp (${missing}) never substitutes another date`, async ({ page }) => {
    const feed = sourceFixture();
    if (missing === "no reports") feed.reports = [];
    else for (const report of feed.reports) {
      if (missing === "null") report.source_updated_at = null;
      else delete report.source_updated_at;
    }
    await setup(page, feed);
    await expect(page.locator("#injury-updated")).toHaveText("Injury data updated not supplied");
  });
}

test("injury update stays on one line beside the week controls at 320px", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await setup(page, sourceFixture());
  const label = page.locator("#injury-updated");
  await expect(label).toHaveText("Injury data updated Sep 12, 11:30 PM UTC");
  expect(await label.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getClientRects().length;
  })).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const week = await page.locator("#week").boundingBox();
  const updated = await label.boundingBox();
  expect(updated.y).toBeGreaterThanOrEqual(week.y + week.height);
  expect(updated.y - week.y - week.height).toBeLessThan(10);
  await page.screenshot({ path: testInfo.outputPath("injury-updated-320px.png"), fullPage: true });
});
