import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixture } from "../fixture.mjs";
const feed = fixture();
async function open(
  page,
  { data = feed, selections = ["ARI"], week = 1 } = {},
) {
  const errors = [],
    requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    expect(url.hostname).toBe("127.0.0.1");
    if (url.pathname.endsWith("/current.json")) {
      requests.push(url.pathname);
      await route.fulfill({ json: data });
    } else await route.continue();
  });
  await page.clock.install({
    time: new Date(
      data === feed ? "2026-09-10T18:00:00Z" : "2026-10-30T02:48:30Z",
    ),
  });
  await page.addInitScript(
    (value) => localStorage.setItem("sideline.teams.v1", JSON.stringify(value)),
    selections,
  );
  await page.goto("/");
  await expect(page.locator("#search")).toBeEnabled();
  await page.locator("#week").selectOption(String(week));
  return { errors, requests };
}
async function choose(page, text) {
  await page.locator("#search").fill(text);
  await page.locator("#results button:enabled").first().click();
}
test("single card order, mirrored stats, ordered field, popup content and focus return", async ({
  page,
}, testInfo) => {
  const { errors, requests } = await open(page);
  const card = page.locator(".card");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".team-heading h2")).toHaveText(["ARI", "ATL"]);
  expect(
    await card.evaluate((el) =>
      [...el.children].map((child) => child.className),
    ),
  ).toEqual([
    "team-heading",
    "stats offense-stats",
    "report-notice",
    "field-half offense",
    "scrimmage",
    "field-half defense",
    "stats defense-stats",
    "team-heading",
  ]);
  await expect(
    card.locator(".offense .field-row").first().locator(".position"),
  ).toHaveText(["QB", "RB"]);
  await expect(
    card.locator(".offense .field-row").nth(1).locator(".position"),
  ).toHaveText(["WR", "WR", "WR", "TE"]);
  const quarterback = card.getByRole("button", {
    name: "qb-ARI, QB, Q, LP",
    exact: true,
  });
  await quarterback.click();
  await expect(page.locator("dialog")).toBeVisible();
  await expect(page.locator("dialog dl")).toContainText("Knee");
  await expect(page.locator("dialog")).toContainText("backup-ARI");
  await expect(page.locator("dialog")).not.toContainText("rookie");
  await page.keyboard.press("Escape");
  await expect(quarterback).toBeFocused();
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("card.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(requests).toHaveLength(1);
});
test("historical, bye and pre-report weeks keep only supported starters and statuses", async ({
  page,
}, testInfo) => {
  const { requests } = await open(page);
  await page.locator("#week").selectOption("2");
  await expect(page.locator(".bye")).toHaveText("Bye");
  await expect(page.locator(".defense")).toHaveCount(0);
  await expect(page.locator(".offense .player")).toHaveCount(11);
  await page.locator("#week").selectOption("3");
  await expect(page.locator(".report-notice")).toHaveText(
    "No injury report yet",
  );
  await expect(page.locator(".badge")).toHaveCount(0);
  await expect(page.locator(".offense .player")).toHaveCount(11);
  await page.locator("#week").selectOption("4");
  await expect(page.locator(".field-empty")).toHaveCount(2);
  await expect(page.locator(".player")).toHaveCount(0);
  await page.locator("#week").selectOption("1");
  await expect(page.locator(".badge")).toHaveText(["Q", "LP"]);
  await page.clock.fastForward("00:12:00");
  expect(requests).toHaveLength(1);
  await page.screenshot({
    path: testInfo.outputPath("historical.png"),
    fullPage: true,
  });
});
test("unified search routes defenders to opposing offense, both game cards, cap six and minimal saved selections", async ({
  page,
}) => {
  await open(page, {
    selections: [
      { team: "ARI", side: "opponent", unit: "defense", focusId: "unused" },
    ],
  });
  await choose(page, "def-ARI");
  await expect(page.locator(".card")).toHaveCount(2);
  await expect(page.locator(".card .team-heading h2")).toHaveText([
    "ARI",
    "ATL",
    "ATL",
    "ARI",
  ]);
  for (const team of ["BAL", "BUF", "CAR", "CHI"]) await choose(page, team);
  await expect(page.locator(".card")).toHaveCount(6);
  await page.locator("#search").fill("CIN");
  await expect(page.locator("#results button").first()).toBeDisabled();
  await page.locator("#search").fill("");
  await page.getByRole("button", { name: "Remove ARI", exact: true }).click();
  await expect(page.locator(".card")).toHaveCount(5);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sideline.teams.v1")),
    ),
  ).toEqual(["ATL", "BAL", "BUF", "CAR", "CHI"]);
  await page.locator("#week").selectOption("3");
  await page.locator("#search").fill("def-BAL");
  await expect(page.locator("#results button").first()).toHaveText(/Bye/);
  await expect(page.locator("#results button").first()).toBeDisabled();
});
test("keyboard search, sources, updated local time, dark mode and dialog close controls", async ({
  page,
}, testInfo) => {
  await open(page, { selections: [] });
  await page.locator("#search").fill("ARI");
  await page.locator("#search").press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator(".card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Sources and licenses", exact: true })
    .click();
  await expect(page.locator("dialog")).toContainText(
    "nflverse data · CC BY 4.0",
  );
  await expect(page.locator("dialog")).toContainText(
    "no report publication dates",
  );
  await expect(page.locator("dialog")).toContainText("Depth observations");
  await expect(page.locator("#injury-updated")).toHaveText(
    "Injury data updated: Sep 24, 2026, 12:00 PM",
  );
  await page.getByRole("button", { name: "Close popup" }).click();
  await expect(page.locator("#info")).toBeFocused();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    path: testInfo.outputPath("dark.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
let real;
try {
  real = JSON.parse(
    await readFile(new URL("../../web/current.json", import.meta.url), "utf8"),
  );
} catch {}
test("real collected data: current, historical, bye, future and no omitted field positions", async ({
  page,
}, testInfo) => {
  test.skip(
    !real,
    "Real source snapshot is exercised locally; CI uses the collector fixture.",
  );
  const { errors, requests } = await open(page, {
    data: real,
    selections: ["BUF", "HOU"],
    week: 8,
  });
  await expect(page.locator(".card")).toHaveCount(2);
  await expect(page.locator(".bye")).toHaveText("Bye");
  const buf = real.weeks.find((week) => week.week === 8).teams.BUF;
  await expect(
    page.locator(".card").first().locator(".offense .player"),
  ).toHaveCount(buf.offense.length);
  await page.locator("#week").selectOption("1");
  await expect(page.locator(".rank").first()).toHaveText("No prior games");
  await page.locator("#week").selectOption("9");
  await expect(page.locator(".report-notice")).toHaveText([
    "No injury report yet",
    "No injury report yet",
  ]);
  await expect(page.locator(".badge")).toHaveCount(0);
  await page.locator("#week").selectOption("8");
  await page.screenshot({
    path: testInfo.outputPath("real-week8.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(requests).toHaveLength(1);
});
