import { test, expect } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import { ALTERNATE_DEFENDERS, DEFENDERS, DENSE_DEFENDERS, NAMED_DEFENDERS, NOW, SELECTED, fieldFixture, selectedIds } from "./field-fixture.mjs";

const firstTile = (page) => page.locator(".player-card").first();
const marker = (page, name = "Field Fixture Out") => firstTile(page)
  .locator(".defense-field").getByRole("button", { name: new RegExp(`^${name}\\b`) });
const row = (page, name) => firstTile(page).locator(".depth-panel .injury-row")
  .filter({ hasText: name });
const popup = (page) => page.locator(".popover[role=dialog]");
const tab = (page, name) => firstTile(page).locator(".status-tabs")
  .getByRole("button", { name: new RegExp(`^${name}\\b`, "i") });
const markerById = (tile, id) => tile.locator(`.defender-marker[data-defender-id="gsis:${id}"]`);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function setup(page, count = 2, fixture = fieldFixture()) {
  const errors = [];
  const externalRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.addInitScript((ids) => {
    localStorage.setItem("sideline.selected.v2", JSON.stringify(ids));
  }, selectedIds(count));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:8787") {
      externalRequests.push(url.origin);
      return route.abort();
    }
    if (url.pathname === "/current.json")
      return route.fulfill({ json: fixture });
    if (url.pathname === "/contributions.json")
      return route.fulfill({ status: 404, body: "Optional history unavailable in fixture" });
    return route.continue();
  });
  await page.goto("/");
  await expect(page.locator("#week")).toHaveValue(fixture.weeks[0].key);
  await expect(page.locator(".player-card")).toHaveCount(count);
  await expect(firstTile(page).locator(".defense-field")).toHaveCount(1);
  return { errors, externalRequests };
}

async function evidence(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  const popupOpen = await popup(page).count() > 0;
  // Full-page capture can temporarily alter the viewport and correctly dismiss
  // an overlay through its resize/scroll listeners. Capture open details in the
  // real viewport so taking evidence does not interrupt the interaction tested.
  await page.screenshot({ path, fullPage: !popupOpen });
  if (popupOpen) await expect(popup(page)).toBeVisible();
  await testInfo.attach(`${name} (synthetic test data)`, { path, contentType: "image/png" });
}

async function assertPopupFits(page) {
  await expect(popup(page)).toBeVisible();
  const rect = await popup(page).boundingBox();
  const viewport = page.viewportSize();
  expect(rect.width).toBeGreaterThan(200);
  expect(rect.height).toBeGreaterThan(50);
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function assertFieldGeometry(tile) {
  await expect(tile.locator(".line-of-scrimmage")).toHaveCount(1);
  await expect(tile.locator(".offense-marker")).toHaveCount(1);
  const geometry = await tile.locator(".defense-field").evaluate((field) => {
    const box = (node) => {
      const { left, right, top, bottom, width, height } = node.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    return {
      field: box(field),
      line: box(field.querySelector(".line-of-scrimmage")),
      offense: box(field.querySelector(".offense-marker")),
      markers: [...field.querySelectorAll(".defender-marker, .defender-stack")].map((node) => ({
        ...box(node),
        name: node.querySelector(".defender-name") && box(node.querySelector(".defender-name")),
        position: box(node.querySelector(".defender-position")),
        clippedName: [...node.querySelectorAll(".defender-name")].some((label) =>
          label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1),
      })),
      controls: [...field.querySelectorAll("button")].map(box),
    };
  });
  expect(geometry.offense.top).toBeGreaterThanOrEqual(geometry.line.bottom);
  for (const control of geometry.controls) {
    expect(control.width).toBeGreaterThanOrEqual(24);
    expect(control.height).toBeGreaterThanOrEqual(24);
  }
  for (const [index, marker] of geometry.markers.entries()) {
    expect(marker.width).toBeGreaterThanOrEqual(24);
    expect(marker.height).toBeGreaterThanOrEqual(24);
    expect(marker.left).toBeGreaterThanOrEqual(geometry.field.left);
    expect(marker.right).toBeLessThanOrEqual(geometry.field.right);
    expect(marker.top).toBeGreaterThanOrEqual(geometry.field.top);
    expect(marker.bottom).toBeLessThanOrEqual(geometry.line.top);
    if (marker.name) {
      expect(marker.width).toBeGreaterThanOrEqual(44);
      expect(marker.height).toBeGreaterThanOrEqual(44);
      expect(marker.clippedName, "The full compact player name must fit without clipping").toBe(false);
      expect(marker.name.left).toBeGreaterThanOrEqual(marker.left);
      expect(marker.name.right).toBeLessThanOrEqual(marker.right);
      expect(marker.name.top).toBeGreaterThanOrEqual(marker.top);
      expect(marker.name.bottom).toBeLessThanOrEqual(marker.position.top + 1);
      expect(marker.position.bottom).toBeLessThanOrEqual(marker.bottom);
    }
    for (const other of geometry.markers.slice(index + 1)) {
      const overlapX = Math.min(marker.right, other.right) - Math.max(marker.left, other.left);
      const overlapY = Math.min(marker.bottom, other.bottom) - Math.max(marker.top, other.top);
      expect(overlapX > 0.5 && overlapY > 0.5, "Named defender and position-stack targets must not overlap").toBe(false);
    }
  }
  return geometry.line.top;
}

for (const count of [2, 6]) {
  test(`${count} selected players have equal field/depth tiles and scroll safely`, async ({ page, isMobile }, testInfo) => {
    const observed = await setup(page, count);
    const tiles = page.locator(".player-card");
    const boxes = await tiles.evaluateAll((nodes) => nodes.map((node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    }));
    expect(Math.max(...boxes.map((box) => box.width)) - Math.min(...boxes.map((box) => box.width))).toBeLessThanOrEqual(1);
    if (!isMobile)
      expect(Math.max(...boxes.map((box) => box.height)) - Math.min(...boxes.map((box) => box.height))).toBeLessThanOrEqual(1);
    expect(boxes.every((box) => box.width >= 320)).toBe(true);
    if (isMobile) {
      expect(boxes[0].width).toBeLessThanOrEqual(page.viewportSize().width);
      for (let index = 1; index < boxes.length; index++)
        expect(boxes[index].y).toBeGreaterThanOrEqual(boxes[index - 1].y + boxes[index - 1].height);
    }
    const lineHeights = [];
    for (let index = 0; index < count; index++) {
      const tile = tiles.nth(index);
      await expect(tile.locator(".defense-field")).toHaveCount(1);
      await expect(tile.locator(".depth-panel")).toHaveCount(1);
      await expect(tile.locator(".defender-marker")).toHaveCount(11);
      const field = await tile.locator(".defense-field").boundingBox();
      const depth = await tile.locator(".depth-panel").boundingBox();
      expect(depth.y).toBeGreaterThanOrEqual(field.y + field.height - 1);
      await expect(tile).not.toContainText("Offense Fixture Excluded");
      lineHeights.push(await assertFieldGeometry(tile));
    }
    if (!isMobile)
      expect(Math.max(...lineHeights) - Math.min(...lineHeights)).toBeLessThanOrEqual(1);
    await expect(page.locator("#selection-count")).toHaveText(`${count} of 6 players selected`);
    await evidence(page, testInfo, `${count}-tiles-${isMobile ? "mobile" : "desktop"}`);
    if (isMobile || count === 6) {
      const board = page.locator("#reports");
      const overflow = await board.evaluate((node) => node.scrollWidth > node.clientWidth);
      expect(overflow).toBe(!isMobile);
      await tiles.last().scrollIntoViewIfNeeded();
      await expect(tiles.last()).toBeInViewport();
      await expect(tiles.last().locator(".defense-field")).toBeInViewport();
      await evidence(page, testInfo, `${count}-tiles-scrolled-last-${isMobile ? "mobile" : "desktop"}`);
    }
    expect(observed.errors).toEqual([]);
    expect(observed.externalRequests).toEqual([]);
  });
}

for (const firstDepthCount of [11, 12]) {
  test(`320px mobile fits ${firstDepthCount} named targets above one LOS without overlap`, async ({ page, isMobile }, testInfo) => {
    test.skip(!isMobile, "Narrow touch layout regression.");
    await page.setViewportSize({ width: 320, height: 740 });
    const fixture = fieldFixture({ defenders: NAMED_DEFENDERS });
    if (firstDepthCount === 12)
      fixture.depth.entries.find((entry) => entry.player_id === "gsis:fixture-backup").rank = 1;
    await setup(page, 2, fixture);
    for (const tile of await page.locator(".player-card").all()) {
      await expect(tile.locator(".defender-marker")).toHaveCount(firstDepthCount);
      await assertFieldGeometry(tile);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    await evidence(page, testInfo, `320px-mobile-${firstDepthCount}-named-defenders`);
  });
}

for (const count of [2, 6]) {
  test(`${count} tiles fit compact names, collisions and source chart positions`, async ({ page, isMobile }, testInfo) => {
    const observed = await setup(page, count, fieldFixture({ defenders: NAMED_DEFENDERS }));
    const tiles = page.locator(".player-card");
    const firstDepth = NAMED_DEFENDERS.filter(([, , , , , rank]) => rank === 1);
    for (const tile of await tiles.all()) {
      await expect(tile.locator(".defender-marker")).toHaveCount(firstDepth.length);
      await expect(tile.locator(".defender-marker .defender-x")).toHaveCount(0);
      for (const [id, name, , , , , , chartPosition] of firstDepth) {
        const target = markerById(tile, id);
        const compactName = `${name[0]}. ${name.slice(name.indexOf(" ") + 1)}`;
        await expect(target.locator(".defender-name")).toHaveText(compactName);
        await expect(target.locator(".defender-name")).toHaveAttribute("aria-hidden", "true");
        await expect(target).toHaveAccessibleName(new RegExp(`^${escapeRegex(name)},`));
        await expect(target.locator(".defender-position")).toHaveText(chartPosition);
      }
      await expect(tile.locator(".defender-name").filter({ hasText: /^J\. Johnson$/ })).toHaveCount(2);
      await expect(tile.locator(".band-dl .defender-marker")).toHaveCount(4);
      await expect(tile.locator(".band-lb .defender-marker")).toHaveCount(2);
      await expect(tile.locator(".band-db .defender-marker")).toHaveCount(5);
      await assertFieldGeometry(tile);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await evidence(page, testInfo, `${count}-named-tiles-${isMobile ? "mobile" : "desktop"}`);
    await tiles.last().locator(".defender-name").first().scrollIntoViewIfNeeded();
    await expect(tiles.last().locator(".defender-name").first()).toBeInViewport();
    await evidence(page, testInfo, `${count}-named-tiles-last-${isMobile ? "mobile" : "desktop"}`);
    expect(observed.errors).toEqual([]);
    expect(observed.externalRequests).toEqual([]);
  });
}

test("matching abbreviated names keep distinct accessible identities and details", async ({ page, isMobile }, testInfo) => {
  await setup(page, 2, fieldFixture({ defenders: NAMED_DEFENDERS }));
  const activate = async (target) => isMobile ? target.tap() : target.click();
  const jamal = markerById(firstTile(page), "fixture-not-listed");
  const jordan = markerById(firstTile(page), "fixture-questionable");
  await expect(jamal.locator(".defender-name")).toHaveText("J. Johnson");
  await expect(jordan.locator(".defender-name")).toHaveText("J. Johnson");
  for (const [target, fullName, otherName] of [[jamal, "Jamal Johnson", "Jordan Johnson"], [jordan, "Jordan Johnson", "Jamal Johnson"]]) {
    await expect(target).toHaveAccessibleName(new RegExp(`^${fullName},`));
    await activate(target);
    await assertPopupFits(page);
    await expect(popup(page)).toHaveCount(1);
    await expect(popup(page).getByRole("heading").first()).toContainText(fullName);
    await expect(popup(page)).not.toContainText(otherName);
  }
  await expect(jamal).toHaveAttribute("aria-expanded", "false");
  await expect(jordan).toHaveAttribute("aria-expanded", "true");
  await evidence(page, testInfo, `matching-names-details-${isMobile ? "mobile" : "desktop"}`);
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
  await expect(jordan).toBeFocused();
});

test("source-position depth controls highlight the matching coarse-roster identities", async ({ page, isMobile }) => {
  await setup(page, 2, fieldFixture({ defenders: NAMED_DEFENDERS }));
  await tab(page, "Out").click();
  for (const [position, names] of [["RCB", ["Jordan Johnson", "Nico Robinson"]], ["LDE", ["Avery O'Malley-Smith-Williams"]]]) {
    const control = firstTile(page).getByRole("button", { name: new RegExp(`^${position} depth,`) });
    if (isMobile) await control.tap();
    else await control.click();
    await expect(tab(page, "All")).toHaveAttribute("aria-pressed", "true");
    await expect(firstTile(page).locator(".depth-panel .injury-row")).toHaveCount(NAMED_DEFENDERS.length);
    const highlighted = firstTile(page).locator(".depth-row.position-highlight");
    await expect(highlighted).toHaveCount(names.length);
    for (const name of names) await expect(highlighted.filter({ hasText: name })).toHaveCount(1);
    await expect(popup(page)).toHaveCount(0);
  }
});

test("missing chart evidence keeps coarse positions without inventing specific roles", async ({ page }, testInfo) => {
  const fixture = fieldFixture({ defenders: NAMED_DEFENDERS });
  delete fixture.depth;
  await setup(page, 2, fixture);
  await expect(firstTile(page).locator(".defender-marker")).toHaveCount(0);
  await expect(firstTile(page).locator(".defender-stack .defender-position")).toHaveText(["DB", "LB", "DT"]);
  await expect(firstTile(page).locator(".depth-panel .injury-row")).toHaveCount(NAMED_DEFENDERS.length);
  await assertFieldGeometry(firstTile(page));
  await evidence(page, testInfo, "coarse-positions-without-chart");
});

test("All, Out and Uncertain filter depth rows without hiding field context", async ({ page }) => {
  await setup(page);
  const depthRows = firstTile(page).locator(".depth-panel .injury-row");
  const fieldMarkers = firstTile(page).locator(".defender-marker");
  await expect(depthRows).toHaveCount(DEFENDERS.length);
  await expect(row(page, "Field Fixture Unknown")).toHaveCount(1);
  await expect(row(page, "Field Fixture No Report")).toHaveCount(1);

  await tab(page, "Out").click();
  await expect(depthRows).toHaveCount(2);
  await expect(row(page, "Field Fixture Out")).toHaveCount(1);
  await expect(row(page, "Depth Fixture Backup")).toHaveCount(1);
  await expect(row(page, "Field Fixture Unknown")).toHaveCount(0);
  await expect(row(page, "Field Fixture Questionable")).toHaveCount(0);
  await expect(fieldMarkers).toHaveCount(11);

  await tab(page, "Uncertain").click();
  await expect(depthRows).toHaveCount(3);
  for (const name of ["Field Fixture Questionable", "Field Fixture Doubtful", "Depth Fixture Reserve"])
    await expect(row(page, name)).toHaveCount(1);
  for (const name of ["Field Fixture Out", "Field Fixture Unknown", "Field Fixture No Report", "Field Fixture DNP", "Field Fixture Limited"])
    await expect(row(page, name)).toHaveCount(0);
  await expect(fieldMarkers).toHaveCount(11);

  await tab(page, "All").click();
  await expect(depthRows).toHaveCount(DEFENDERS.length);
  await expect(row(page, "Field Fixture Unknown")).toHaveCount(1);
  // Each player's filters are independent and repeated tab changes are stable.
  await expect(page.locator(".player-card").nth(1).locator(".depth-panel .injury-row")).toHaveCount(DEFENDERS.length);
  for (const name of ["Out", "Uncertain", "All"]) await tab(page, name).click();
  await expect(depthRows).toHaveCount(DEFENDERS.length);
  await expect(popup(page)).toHaveCount(0);
});

test("position counts highlight every matching defender and restore All", async ({ page, isMobile }) => {
  await setup(page);
  await tab(page, "Out").click();
  const count = firstTile(page).getByRole("button", { name: /^CB depth, 3 defenders, 1 reported Out/ });
  if (isMobile) await count.tap();
  else await count.click();
  await expect(tab(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expect(firstTile(page).locator(".depth-panel .injury-row")).toHaveCount(DEFENDERS.length);
  const highlighted = firstTile(page).locator(".depth-row.position-highlight");
  await expect(highlighted).toHaveCount(3);
  for (const name of ["Field Fixture Questionable", "Field Fixture Corner", "Depth Fixture Backup"])
    await expect(highlighted.filter({ hasText: name })).toHaveCount(1);
  await expect(popup(page)).toHaveCount(0);
  await firstTile(page).getByRole("button", { name: "Clear highlight", exact: true }).click();
  await expect(highlighted).toHaveCount(0);
  await expect(firstTile(page).locator(".depth-panel .injury-row")).toHaveCount(DEFENDERS.length);
});

test("missing depth uses anonymous position stacks without inventing individuals", async ({ page, isMobile }, testInfo) => {
  const fixture = fieldFixture();
  delete fixture.depth;
  await setup(page, 2, fixture);
  await expect(firstTile(page).locator(".defender-marker")).toHaveCount(0);
  await expect(firstTile(page).locator(".defender-stack")).toHaveCount(5);
  await assertFieldGeometry(firstTile(page));
  await expect(firstTile(page).locator(".position-stack")).toHaveCount(5);
  await expect(firstTile(page).locator(".depth-panel .injury-row")).toHaveCount(DEFENDERS.length);
  const group = firstTile(page).locator(".defender-stack").first();
  await expect(group).toHaveAccessibleName(/No individual first-depth assignment shown/);
  if (isMobile) await group.tap();
  else await group.click();
  await expect(popup(page)).toHaveCount(0);
  await expect(firstTile(page).locator(".depth-row.position-highlight")).not.toHaveCount(0);
  await expect(firstTile(page).locator(".depth-panel .injury-row")).toHaveCount(DEFENDERS.length);
  await evidence(page, testInfo, `missing-depth-${isMobile ? "mobile" : "desktop"}`);
});

for (const count of [2, 6]) {
  test(`${count} tiles retain forty-defender charts and align mixed matchup evidence`, async ({ page, isMobile }, testInfo) => {
    const fixture = fieldFixture({ defenders: DENSE_DEFENDERS, alternateDefenders: ALTERNATE_DEFENDERS });
    fixture.reports = fixture.reports.filter((report) => report.team !== "CAR");
    await setup(page, count, fixture);
    const tiles = page.locator(".player-card");
    for (const [index, tile] of (await tiles.all()).entries()) {
      const dense = index < 3;
      const namedCount = dense ? 12 : 11;
      await expect(tile.locator(".defender-marker")).toHaveCount(namedCount);
      await expect(tile.locator(".defender-marker .defender-name")).toHaveCount(namedCount);
      await expect(tile.locator(".depth-panel .injury-row")).toHaveCount(dense ? 40 : 14);
      await expect(tile.locator(".defender-count")).toHaveText(`${dense ? 40 : 14} in source`);
      if (dense) {
        await expect(markerById(tile, "fixture-backup").locator(".defender-name")).toHaveText("N. Robinson");
        for (const position of ["DB", "LB", "DL", "FS/SS"])
          await expect(tile.locator(".defender-stack .defender-position").filter({ hasText: new RegExp(`^${escapeRegex(position)}$`) })).toHaveCount(1);
        await expect(tile.locator(".report-notice")).toHaveText("Week 1 injury report not available yet");
        await expect(tile.locator(".marker-status, .pill-status")).toHaveCount(0);
      } else {
        await expect(tile.locator(".report-notice")).toHaveCount(0);
        await expect(tile.locator(".defender-marker.state-unknown")).toHaveCount(4);
      }
      const identities = await tile.locator(".defender-marker").evaluateAll((markers) => markers.map((marker) => marker.dataset.defenderId));
      expect(new Set(identities).size).toBe(namedCount);
      await assertFieldGeometry(tile);
      expect(await tile.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(false);
    }
    if (!isMobile) {
      await expect.poll(async () => {
        const tops = await tiles.locator(".line-of-scrimmage").evaluateAll((lines) => lines.map((line) => line.getBoundingClientRect().top));
        return Math.max(...tops) - Math.min(...tops);
      }).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await evidence(page, testInfo, `${count}-dense-mixed-tiles-${isMobile ? "mobile" : "desktop"}`);
    if (count === 6) {
      await tiles.last().locator(".defender-name").first().scrollIntoViewIfNeeded();
      await expect(tiles.last().locator(".defender-name").first()).toBeInViewport();
      await evidence(page, testInfo, `six-dense-mixed-tiles-last-${isMobile ? "mobile" : "desktop"}`);
    }
  });
}

test("multiple first-depth chart roles label one named person without duplicating the identity", async ({ page, isMobile }, testInfo) => {
  const fixture = fieldFixture({ defenders: NAMED_DEFENDERS });
  const assignment = fixture.depth.entries.find((entry) => entry.player_id === "gsis:fixture-not-listed");
  fixture.depth.entries.push({ ...assignment, position: "NB" });
  await setup(page, 2, fixture);
  const target = markerById(firstTile(page), "fixture-not-listed");
  await expect(firstTile(page).locator(".defender-marker")).toHaveCount(11);
  await expect(target).toHaveCount(1);
  await expect(target.locator(".defender-name")).toHaveText("J. Johnson");
  await expect(target.locator(".defender-position")).toContainText("LCB");
  await expect(target.locator(".defender-position")).toContainText("NB");
  await expect(target).toHaveAccessibleName(/Jamal Johnson.*LCB.*NB/);
  await expect(row(page, "Jamal Johnson")).toContainText("LCB #1");
  await expect(row(page, "Jamal Johnson")).toContainText("NB #1");
  await assertFieldGeometry(firstTile(page));
  if (isMobile) await target.tap();
  else await target.click();
  await assertPopupFits(page);
  await expect(popup(page)).toContainText("LCB #1");
  await expect(popup(page)).toContainText("NB #1");
  await evidence(page, testInfo, `one-person-multiple-chart-roles-${isMobile ? "mobile" : "desktop"}`);
});

test("missing Week 5 report has one shared notice and keeps unknown details without repeated badges", async ({ page, isMobile }, testInfo) => {
  const fixture = fieldFixture({ week: 5 });
  fixture.reports = fixture.reports.filter((report) => report.team !== "CAR");
  await setup(page, 2, fixture);
  for (const tile of await page.locator(".player-card").all()) {
    await expect(tile.locator(".report-notice")).toHaveCount(1);
    await expect(tile.locator(".report-notice")).toHaveText("Week 5 injury report not available yet");
    await expect(tile.getByText("Week 5 injury report not available yet", { exact: true })).toHaveCount(1);
    await expect(tile.locator(".roster-notice")).toHaveCount(0);
    await expect(tile.locator(".depth-panel .pill-status")).toHaveCount(0);
    await expect(tile.locator(".defender-marker")).toHaveCount(11);
    await expect(tile.locator(".defender-marker .marker-status")).toHaveCount(0);
    await expect(tile.locator(".defender-marker.state-out, .defender-marker.state-questionable, .defender-marker.state-doubtful")).toHaveCount(0);
    await expect(tile.locator(".card-source")).toHaveCount(0);
  }
  await expect(marker(page)).toHaveAccessibleName(/availability unknown/i);
  await expect(row(page, "Field Fixture Out")).toHaveAccessibleName(/Report unavailable; availability unknown/);
  await evidence(page, testInfo, `missing-week-5-report-${isMobile ? "mobile" : "desktop"}`);
  if (isMobile) await marker(page).tap();
  else await marker(page).click();
  await assertPopupFits(page);
  await expect(popup(page)).toContainText("Injury report unavailable. Game availability is unknown.");
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
  for (const filter of ["Out", "Uncertain"]) {
    await tab(page, filter).click();
    await expect(firstTile(page).locator(".depth-panel .injury-row")).toHaveCount(0);
    await expect(firstTile(page).locator(".depth-panel")).toContainText("Availability is unknown");
    await expect(firstTile(page).locator(".report-notice")).toHaveText("Week 5 injury report not available yet");
    await expect(firstTile(page).locator(".defender-marker")).toHaveCount(11);
    await expect(firstTile(page).locator(".defender-marker .marker-status")).toHaveCount(0);
  }
  await tab(page, "All").click();
  await expect(firstTile(page).locator(".depth-panel .injury-row")).toHaveCount(DEFENDERS.length);
  await expect(firstTile(page).locator(".depth-panel .pill-status")).toHaveCount(0);
});

test("an available partial report retains Unknown badges and unconfirmed missing-entry details", async ({ page, isMobile }, testInfo) => {
  await setup(page);
  await expect(firstTile(page).locator(".report-notice")).toHaveCount(0);
  await expect(row(page, "Field Fixture Unknown").locator(".pill-status")).toHaveText("Unknown");
  await expect(marker(page, "Field Fixture Unknown").locator(".marker-status")).toHaveText("?");
  for (const name of ["Field Fixture No Report", "Field Fixture Corner", "Field Fixture Safety", "Depth Fixture Squad"]) {
    await expect(row(page, name).locator(".pill-status")).toHaveText("Unknown");
    await expect(row(page, name)).toHaveAccessibleName(/No matching injury entry; health and availability unconfirmed/);
    await expect(row(page, name)).toContainText("health unconfirmed");
  }
  for (const name of ["Field Fixture No Report", "Field Fixture Corner", "Field Fixture Safety"]) {
    await expect(marker(page, name).locator(".marker-status")).toHaveText("?");
    await expect(marker(page, name)).toHaveAccessibleName(/availability unknown/i);
  }
  await expect(firstTile(page).locator(".defender-marker.state-unknown")).toHaveCount(4);
  await expect(marker(page, "Field Fixture Out").locator(".marker-status")).toHaveText("OUT");
  await expect(marker(page, "Field Fixture Questionable").locator(".marker-status")).toHaveText("Q");
  await expect(marker(page, "Field Fixture Doubtful").locator(".marker-status")).toHaveText("D");
  if (isMobile) await row(page, "Field Fixture No Report").tap();
  else await row(page, "Field Fixture No Report").click();
  await assertPopupFits(page);
  await expect(popup(page)).toContainText("No matching injury entry in the available report. This does not establish health or game availability.");
  await evidence(page, testInfo, `partial-report-unknown-details-${isMobile ? "mobile" : "desktop"}`);
  await page.keyboard.press("Escape");
  for (const filter of ["Out", "Uncertain"]) {
    await tab(page, filter).click();
    await expect(row(page, "Field Fixture Unknown")).toHaveCount(0);
    await expect(row(page, "Field Fixture No Report")).toHaveCount(0);
  }
});

test("a present but empty partial report does not suppress each defender's Unknown status", async ({ page }) => {
  const fixture = fieldFixture();
  fixture.reports.find((report) => report.team === "CAR").entries = [];
  await setup(page, 2, fixture);
  await expect(firstTile(page).locator(".report-notice")).toHaveCount(0);
  await expect(firstTile(page).locator(".depth-panel .injury-row")).toHaveCount(DEFENDERS.length);
  await expect(firstTile(page).locator(".depth-panel .pill-status")).toHaveCount(DEFENDERS.length);
  for (const badge of await firstTile(page).locator(".depth-panel .pill-status").all())
    await expect(badge).toHaveText("Unknown");
  await expect(firstTile(page).locator(".defender-marker.state-unknown")).toHaveCount(11);
  await expect(firstTile(page).locator(".defender-marker .marker-status")).toHaveText(Array(11).fill("?"));
  await expect(row(page, "Field Fixture Out")).toHaveAccessibleName(/No matching injury entry; health and availability unconfirmed/);
  for (const filter of ["Out", "Uncertain"]) {
    await tab(page, filter).click();
    await expect(firstTile(page).locator(".depth-panel .injury-row")).toHaveCount(0);
  }
});

test("a missing report after kickoff does not promise that its publication is still upcoming", async ({ page }) => {
  const fixture = fieldFixture({ week: 5 });
  fixture.games[0].kickoff = new Date(Date.parse(NOW) - 60_000).toISOString();
  fixture.reports = fixture.reports.filter((report) => report.team !== "CAR");
  await setup(page, 2, fixture);
  await expect(firstTile(page).locator(".report-notice")).toHaveCount(1);
  await expect(firstTile(page).locator(".report-notice")).toHaveText("Week 5 injury report unavailable");
  await expect(firstTile(page).locator(".kickoff")).toContainText("Start passed");
  await expect(firstTile(page).locator(".depth-panel .pill-status")).toHaveCount(0);
  await expect(marker(page)).toHaveAccessibleName(/availability unknown/i);
});

test("desktop hover previews survive entry into details and dismiss on leaving", async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, "Touch activation is exercised separately.");
  await setup(page);
  const trigger = marker(page);
  const before = await firstTile(page).boundingBox();
  await trigger.hover();
  await assertPopupFits(page);
  await expect(popup(page)).toContainText("Field Fixture Out");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await popup(page).hover();
  await expect(popup(page)).toBeVisible();
  const after = await firstTile(page).boundingBox();
  expect(after.height).toBe(before.height);
  await evidence(page, testInfo, "desktop-hover-preview");
  await page.locator("#search").hover();
  await expect(popup(page)).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.hover();
  await expect(popup(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
});

test("keyboard focus previews, Escape and moving focus away dismiss cleanly", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop keyboard behavior has a dedicated project.");
  await setup(page);
  const trigger = marker(page);
  await trigger.focus();
  await assertPopupFits(page);
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.locator("#search").focus();
  await trigger.focus();
  await expect(popup(page)).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(popup(page)).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(popup(page)).toBeVisible();
  expect(await popup(page).evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.locator("#week").focus();
  await expect(popup(page)).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press("Space");
  await expect(popup(page)).toHaveCount(1);
  await popup(page).getByRole("button", { name: /^Close(?: details)?$/ }).click();
  await expect(popup(page)).toHaveCount(0);
});

test("click or tap pins one popup, closes repeatedly, and stays within viewport", async ({ page, isMobile }, testInfo) => {
  await setup(page);
  const trigger = marker(page);
  const activate = async (target) => isMobile ? target.tap() : target.click();
  for (let iteration = 0; iteration < 3; iteration++) {
    await activate(trigger);
    await assertPopupFits(page);
    await expect(popup(page)).toHaveCount(1);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    if (iteration === 0) await evidence(page, testInfo, `${isMobile ? "mobile-tap" : "desktop-pinned"}-details`);
    if (!isMobile) {
      await page.locator("#search").hover();
      await expect(popup(page)).toBeVisible();
    }
    await activate(trigger);
    await expect(popup(page)).toHaveCount(0);
  }
  await activate(trigger);
  await activate(firstTile(page).locator(".player-name"));
  await expect(popup(page)).toHaveCount(0);
  await activate(trigger);
  await activate(popup(page).getByRole("button", { name: /^Close(?: details)?$/ }));
  await expect(popup(page)).toHaveCount(0);
  await activate(trigger);
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
});

test("switching defenders, filters, weeks and selections leaves no orphan dialogs", async ({ page, isMobile }) => {
  await setup(page);
  const activate = async (target) => isMobile ? target.tap() : target.click();
  await activate(marker(page));
  await activate(marker(page, "Field Fixture Limited"));
  await expect(popup(page)).toHaveCount(1);
  await expect(popup(page)).toContainText("Field Fixture Limited");
  await expect(marker(page)).toHaveAttribute("aria-expanded", "false");
  await tab(page, "Out").click();
  await expect(popup(page)).toHaveCount(0);
  await activate(marker(page));
  await page.locator("#week").selectOption("2026-REG-2");
  await expect(popup(page)).toHaveCount(0);
  await expect(page.locator("[aria-expanded=true]")).toHaveCount(0);
  await expect(firstTile(page)).not.toContainText("Field Fixture Out");
  await expect(firstTile(page)).toContainText("Next Week Fixture Defender");
  await page.locator("#week").selectOption("2026-REG-1");
  await activate(marker(page));
  await firstTile(page).getByRole("button", { name: `Remove ${SELECTED[0][1]}`, exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect(page.locator(".player-card")).toHaveCount(1);
  await expect(page.locator("[aria-expanded=true]")).toHaveCount(0);
  await page.locator("#search").fill(SELECTED[0][1]);
  await page.getByRole("button", { name: new RegExp(`^Add ${SELECTED[0][1]},`) }).click();
  await expect(page.locator(".player-card")).toHaveCount(2);
  await expect(popup(page)).toHaveCount(0);
});

for (const hours of [1, 25]) {
  test(`Escape applies a deferred ${hours}h clock change without reviving details`, async ({ page }) => {
    const fixture = fieldFixture();
    // Crossing a kickoff creates a real clock fingerprint change while +1h
    // keeps source depth fresh; +25h additionally removes expired markers.
    fixture.games[0].kickoff = new Date(Date.parse(NOW) + 30 * 60_000).toISOString();
    await setup(page, 2, fixture);
    await page.locator("#week").selectOption("2026-REG-1");
    await marker(page).focus();
    await expect(popup(page)).toHaveCount(1);
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + hours * 3_600_000));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.locator("#refresh-state")).toContainText("Updates ready");
    await expect(popup(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("#refresh-state")).not.toContainText("Updates ready");
    await expect(popup(page)).toHaveCount(0);
    await expect(page.locator("[aria-expanded=true]")).toHaveCount(0);
    await expect(firstTile(page).locator(".kickoff")).toContainText("Start passed");
    if (hours === 1) {
      await expect(marker(page)).toBeFocused();
      await expect(firstTile(page).locator(".defender-marker")).toHaveCount(11);
    } else {
      await expect(firstTile(page).locator(".defender-marker")).toHaveCount(0);
      await expect(firstTile(page).locator(".defender-stack")).toHaveCount(5);
      await expect(firstTile(page).getByRole("button", { name: `Remove ${SELECTED[0][1]}`, exact: true })).toBeFocused();
    }
  });
}

test("synthetic assets cannot silently masquerade as live NFL data", async ({ page }) => {
  const exampleRequests = [];
  await page.route("**/current.json", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/example.json")) exampleRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("#data-status")).toContainText("Refresh unavailable");
  await expect(page.locator(".player-card")).toHaveCount(0);
  await expect(page.locator("#search")).toBeDisabled();
  expect(exampleRequests).toEqual([]);
  await page.getByRole("button", { name: "Sources and information", exact: true }).click();
  await page.getByRole("button", { name: "Try fictional example", exact: true }).click();
  await expect(page.locator("#data-status")).toContainText("Fictional example");
  await expect(page.locator("#search")).toHaveAttribute("placeholder", "Search example players");
  expect(exampleRequests).toHaveLength(1);
  await page.locator("#data-status").getByRole("button", { name: "Exit", exact: true }).click();
  await expect(page.locator("#data-status")).toContainText("Fictional example");
  await expect(page.locator("#search")).toHaveAttribute("placeholder", "Search example players");
});

test("public build excludes browser fixtures and keeps its example explicitly fictional", async () => {
  const dist = new URL("../../dist/", import.meta.url);
  const entries = await readdir(dist, { recursive: true });
  expect(entries.some((entry) => /(?:test|fixture|playwright|package|node_modules)/i.test(entry))).toBe(false);
  const example = JSON.parse(await readFile(new URL("example.json", dist), "utf8"));
  expect(example.mode).toBe("example");
  for (const entry of entries.filter((entry) => /\.(?:mjs|json|html|css)$/.test(entry))) {
    const content = await readFile(new URL(entry, dist), "utf8");
    expect(content, entry).not.toContain("Browser Fixture One");
    expect(content, entry).not.toContain("Field Fixture Out");
    expect(content, entry).not.toContain("fixture-selected-1");
  }
});
