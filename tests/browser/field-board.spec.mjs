import { test, expect } from "@playwright/test";
import { normalizeContributions } from "../../scripts/contribution-data.mjs";
import { archiveFixture } from "../fixtures/injury-history.mjs";
import { historyFixture } from "../fixtures/player-history.mjs";
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

async function setup(page, count = 2, fixture = fieldFixture(), history = null, playerHistory = null, archive = null, olderProduction = null, coaching = null) {
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
      return history ? route.fulfill({ json: history })
        : route.fulfill({ status: 404, body: "Optional history unavailable in fixture" });
    if (url.pathname === "/injury-history.json")
      return archive ? route.fulfill({ json: archive })
        : route.fulfill({ status: 404, body: "Optional injury archive unavailable in fixture" });
    if (url.pathname === "/contributions-2024.json")
      return olderProduction ? route.fulfill({ json: olderProduction })
        : route.fulfill({ status: 404, body: "Optional 2024 production unavailable in fixture" });
    if (url.pathname === "/player-history.json")
      return playerHistory ? route.fulfill({ json: playerHistory })
        : route.fulfill({ status: 404, body: "Optional player history unavailable in fixture" });
    if (url.pathname === "/coordinators.json")
      return coaching ? route.fulfill({ json: coaching })
        : route.fulfill({ status: 404, body: "Optional coordinator facts unavailable in fixture" });
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
  // Native details toggle events are queued after the open attribute changes.
  // Wait for the viewport clamp, including repositioning after expansion.
  await expect.poll(async () => {
    const rect = await popup(page).boundingBox();
    return rect ? rect.y + rect.height : Infinity;
  }).toBeLessThanOrEqual(page.viewportSize().height + 1);
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
  await expect(depthRows).toHaveCount(5);
  for (const name of ["Field Fixture Questionable", "Field Fixture Doubtful", "Depth Fixture Reserve", "Field Fixture DNP", "Field Fixture Limited"])
    await expect(row(page, name)).toHaveCount(1);
  for (const name of ["Field Fixture Out", "Field Fixture Unknown", "Field Fixture No Report"])
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
        await expect(tile.locator(".report-notice")).toHaveText("Week 1 injury report missing from this feed");
        await expect(tile.locator(".marker-status, .pill-status")).toHaveCount(0);
      } else {
        await expect(tile.locator(".report-notice")).toHaveCount(0);
        await expect(tile.locator(".defender-marker.state-neutral")).toHaveCount(6);
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
    await expect(tile.locator(".report-notice")).toHaveText("Week 5 injury report missing from this feed");
    await expect(tile.getByText("Week 5 injury report missing from this feed", { exact: true })).toHaveCount(1);
    await expect(tile.locator(".roster-notice")).toHaveCount(0);
    await expect(tile.locator(".depth-panel .pill-status")).toHaveCount(0);
    await expect(tile.locator(".defender-marker")).toHaveCount(11);
    await expect(tile.locator(".defender-marker .marker-status")).toHaveCount(0);
    await expect(tile.locator(".defender-marker.state-out, .defender-marker.state-questionable, .defender-marker.state-doubtful")).toHaveCount(0);
    await expect(tile.locator(".card-source")).toHaveCount(0);
  }
  await expect(marker(page)).toHaveAccessibleName(/availability unknown/i);
  await expect(row(page, "Field Fixture Out")).toHaveAccessibleName(/Availability unknown; injury report missing from this feed/i);
  await evidence(page, testInfo, `missing-week-5-report-${isMobile ? "mobile" : "desktop"}`);
  if (isMobile) await marker(page).tap();
  else await marker(page).click();
  await assertPopupFits(page);
  await expect(popup(page)).toContainText("Availability unknown; injury report missing from this feed");
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
  for (const filter of ["Out", "Uncertain"]) {
    await tab(page, filter).click();
    await expect(firstTile(page).locator(".depth-panel .injury-row")).toHaveCount(0);
    await expect(firstTile(page).locator(".depth-panel")).toContainText("Availability is unknown");
    await expect(firstTile(page).locator(".report-notice")).toHaveText("Week 5 injury report missing from this feed");
    await expect(firstTile(page).locator(".defender-marker")).toHaveCount(11);
    await expect(firstTile(page).locator(".defender-marker .marker-status")).toHaveCount(0);
  }
  await tab(page, "All").click();
  await expect(firstTile(page).locator(".depth-panel .injury-row")).toHaveCount(DEFENDERS.length);
  await expect(firstTile(page).locator(".depth-panel .pill-status")).toHaveCount(0);
});

test("a partial report uses neutral markers, one notice and honest missing-entry details", async ({ page, isMobile }, testInfo) => {
  await setup(page);
  await expect(firstTile(page).locator(".report-notice")).toHaveCount(0);
  await expect(row(page, "Field Fixture Unknown").locator(".pill-status")).toHaveCount(0);
  await expect(marker(page, "Field Fixture Unknown").locator(".marker-status")).toHaveCount(0);
  for (const name of ["Field Fixture No Report", "Field Fixture Corner", "Field Fixture Safety", "Depth Fixture Squad"]) {
    await expect(row(page, name).locator(".pill-status")).toHaveCount(0);
    await expect(row(page, name)).toHaveAccessibleName(/No matching injury entry in partial report; availability unknown/);
  }
  for (const name of ["Field Fixture No Report", "Field Fixture Corner", "Field Fixture Safety"]) {
    await expect(marker(page, name).locator(".marker-status")).toHaveCount(0);
    await expect(marker(page, name)).toHaveAccessibleName(/availability unknown/i);
  }
  await expect(firstTile(page).locator(".defender-marker.state-neutral")).toHaveCount(6);
  await expect(marker(page, "Field Fixture Out").locator(".marker-status")).toHaveText("OUT");
  await expect(marker(page, "Field Fixture Questionable").locator(".marker-status")).toHaveText("Q");
  await expect(marker(page, "Field Fixture Doubtful").locator(".marker-status")).toHaveText("D");
  const depthRows = firstTile(page).locator(".depth-rows");
  await depthRows.evaluate((node) => { node.scrollTop = 0; });
  await expect.poll(() => depthRows.evaluate((node) => node.scrollTop)).toBe(0);
  // This offscreen row requires list scrolling before its activation. A scroll
  // event queued by that movement may arrive after the click opens details.
  if (isMobile) await row(page, "Field Fixture No Report").tap();
  else await row(page, "Field Fixture No Report").click();
  await assertPopupFits(page);
  await expect.poll(() => depthRows.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  // Reproduce late event delivery at the opening offset deterministically,
  // without moving either the trigger or its scroll container again.
  await depthRows.evaluate((node) => node.dispatchEvent(new Event("scroll")));
  await expect(popup(page)).toBeVisible();
  await expect(row(page, "Field Fixture No Report")).toHaveAttribute("aria-expanded", "true");
  await expect(popup(page)).toContainText("No matching injury entry in partial report; availability unknown");
  await evidence(page, testInfo, `partial-report-unknown-details-${isMobile ? "mobile" : "desktop"}`);
  // Actual movement after opening still dismisses pinned details. Ignoring an
  // already-accounted-for event must not disable ordinary scroll dismissal.
  const openedScrollTop = await depthRows.evaluate((node) => node.scrollTop);
  await depthRows.evaluate((node) => { node.scrollTop = Math.max(0, node.scrollTop - 40); });
  await expect.poll(() => depthRows.evaluate((node) => node.scrollTop)).toBeLessThan(openedScrollTop);
  await expect(popup(page)).toHaveCount(0);
  await expect(row(page, "Field Fixture No Report")).toHaveAttribute("aria-expanded", "false");
  for (const filter of ["Out", "Uncertain"]) {
    await tab(page, filter).click();
    await expect(row(page, "Field Fixture Unknown")).toHaveCount(0);
    await expect(row(page, "Field Fixture No Report")).toHaveCount(0);
  }
});

test("an empty partial report keeps all defenders neutral and coverage unconfirmed", async ({ page }) => {
  const fixture = fieldFixture();
  fixture.reports.find((report) => report.team === "CAR").entries = [];
  await setup(page, 2, fixture);
  await expect(firstTile(page).locator(".report-notice")).toHaveCount(0);
  await expect(firstTile(page).locator(".depth-panel .injury-row")).toHaveCount(DEFENDERS.length);
  await expect(firstTile(page).locator(".depth-panel .pill-status")).toHaveCount(0);
  await expect(firstTile(page).locator(".defender-marker.state-neutral")).toHaveCount(11);
  await expect(firstTile(page).locator(".defender-marker .marker-status")).toHaveCount(0);
  await expect(row(page, "Field Fixture Out")).toHaveAccessibleName(/No matching injury entry in partial report; availability unknown/);
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
  await expect(firstTile(page).locator(".report-notice")).toHaveText("Week 5 injury report missing from this feed");
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


test("practice badges sit at top-right and keep game-designation precedence", async ({ page }) => {
  await setup(page);
  for (const [name, text] of [["Field Fixture Limited", "LP"], ["Field Fixture DNP", "DNP"],
    ["Field Fixture Out", "OUT"], ["Field Fixture Questionable", "Q"], ["Field Fixture Doubtful", "D"]]) {
    const target = marker(page, name);
    const badge = target.locator(".marker-status");
    await expect(badge).toHaveText(text);
    const m = await target.boundingBox(), b = await badge.boundingBox();
    expect(b.y).toBeLessThan(m.y + 2);
    expect(b.x + b.width).toBeGreaterThan(m.x + m.width - 2);
    expect(b.x).toBeGreaterThan(m.x + m.width / 2);
  }
  for (const name of ["Field Fixture Full", "Field Fixture Not Listed", "Field Fixture No Report"])
    await expect(marker(page, name).locator(".marker-status")).toHaveCount(0);
  await marker(page, "Field Fixture Limited").click();
  await expect(popup(page)).toContainText("Limited");
  await expect(popup(page)).toContainText("No designation");
  await expect(popup(page)).not.toContainText("guarantee");
  await expect(popup(page).locator("p")).toHaveCount(0);
});

test("complete-report omission differs from absent coverage and a report-only identity", async ({ page }) => {
  const fixture = fieldFixture();
  const report = fixture.reports.find((value) => value.team === "CAR");
  report.coverage = "complete";
  report.entries.push({ ...report.entries[0], id: "gsis:fixture-report-only", name: "Field Fixture Corner" });
  await setup(page, 2, fixture);
  await expect(firstTile(page).locator(".report-notice")).toHaveCount(0);
  const target = row(page, "Field Fixture No Report");
  await expect(target).toHaveAccessibleName(/Not listed in complete team report; availability unconfirmed/);
  await target.click();
  await expect(popup(page)).toContainText("Not listed in complete team report; availability unconfirmed");
  await expect(popup(page)).not.toContainText("Full");
  await page.keyboard.press("Escape");
  const rosterIdentity = firstTile(page).locator('.injury-row[data-defender-id="gsis:fixture-corner"]');
  await expect(rosterIdentity).toHaveAccessibleName(/Report\/roster IDs differ for this name; availability unknown/);
  await rosterIdentity.click();
  await expect(popup(page)).toContainText("Report/roster IDs differ for this name; availability unknown");
  await expect(popup(page).locator("dt").filter({ hasText: /^Game$/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await firstTile(page).locator('.injury-row[data-defender-id="gsis:fixture-report-only"]').click();
  await expect(popup(page)).toContainText("Report only · absent from current team roster");
  await expect(popup(page)).toContainText("Out");
});

test("compact popup keeps historical teams, half sacks and keyboard-accessible sources", async ({ page, isMobile }, testInfo) => {
  const history = normalizeContributions([
    "player_id,position_group,season,season_type,week,game_id,team,opponent_team,def_sacks,def_qb_hits,def_pass_defended,def_interceptions",
    "00-0012345,DL,2025,REG,1,2025_01_ARI_NO,ARI,NO,0.5,2,1,0",
    "00-0012345,DL,2025,REG,2,2025_02_CAR_BUF,CAR,BUF,1,3,0,1",
  ].join("\n"), { retrieved_at: NOW, source_updated_at: "2026-08-13T16:51:22.000Z" });
  const defenders = DEFENDERS.map((entry) => entry[0] === "fixture-out"
    ? ["00-0012345", ...entry.slice(1)] : entry);
  await setup(page, 2, fieldFixture({ defenders }), history);
  if (isMobile) await marker(page).tap();
  else await marker(page).click();
  await assertPopupFits(page);
  await expect(popup(page)).toContainText("2025 REG · recorded production");
  await expect(popup(page)).toContainText("ARI / CAR · 1.5 sacks · 5 QB hits · 1 PD · 1 INT");
  await expect(popup(page)).toContainText("ARI: 0.5 sacks");
  await expect(popup(page).locator("p")).toHaveCount(0);
  await expect(popup(page).locator("details").filter({ has: page.getByText("Sources and timestamps", { exact: true }) })).not.toHaveAttribute("open", "");
  const summary = popup(page).getByText("Sources and timestamps", { exact: true });
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(popup(page).locator("details").filter({ has: page.getByText("Sources and timestamps", { exact: true }) })).toHaveAttribute("open", "");
  await assertPopupFits(page);
  await expect(popup(page)).toContainText("Injury file");
  await expect(popup(page)).toContainText("Stats file");
  await expect(popup(page).getByRole("link", { name: "nflverse 2025 stats", exact: true })).toHaveAttribute("href", /stats_player_week_2025/);
  await page.keyboard.press("Tab");
  await expect(popup(page).getByRole("link").first()).toBeFocused();
  await evidence(page, testInfo, `compact-production-sources-${isMobile ? "mobile" : "desktop"}`);
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
  await expect(marker(page)).toBeFocused();
});

test("optional player details lazily show bio and source weekly injury text with accessible dismissal", async ({ page, isMobile }, testInfo) => {
  const fixture = fieldFixture({ week: 5 });
  const defender = fixture.players.find((player) => player.id === "gsis:fixture-out");
  defender.bio = { birth_date: "2001-09-13", years_exp: 0, entry_year: 2026,
    college: "College Fixture", draft_club: "TEN", draft_number: 146 };
  const current = fixture.reports.find((report) => report.team === "CAR");
  const entry = current.entries.find((entry) => entry.id === defender.id);
  for (let week = 1; week < 5; week++) {
    const start = Date.parse(fixture.weeks[0].starts_at) - (5 - week) * 7 * 86400000;
    const key = `2026-REG-${week}`;
    fixture.weeks.push({ ...fixture.weeks[0], key, week, label: `Week ${week}`,
      starts_at: new Date(start).toISOString(), ends_at: new Date(start + 7 * 86400000).toISOString() });
    const game = { ...fixture.games[0], id: `prior-week-${week}`, week_key: key,
      kickoff: new Date(start + 5 * 86400000).toISOString(), status: "final" };
    fixture.games.push(game);
    fixture.reports.push({ ...current, game_id: game.id, week_key: key,
      entries: [{ ...entry, injury: `Ankle; Wrist ${week}`, game_status: "Not listed", practice_status: "Limited" }] });
  }
  const { errors, externalRequests } = await setup(page, 2, fixture);
  if (isMobile) await marker(page).tap();
  else await marker(page).click();
  await expect(popup(page).locator(".player-details h3")).toHaveCount(0);
  await expect(popup(page)).not.toContainText("College Fixture");
  await expect(popup(page)).not.toContainText("Historical data unavailable");
  const summary = popup(page).getByText("Player details", { exact: true });
  if (isMobile) await summary.tap();
  else { await summary.focus(); await page.keyboard.press("Enter"); }
  await expect(popup(page)).toContainText("25 · 2001-09-13");
  await expect(popup(page)).toContainText("0 years");
  await expect(popup(page)).toContainText("NFL eligible since");
  await expect(popup(page)).toContainText("TEN · #146");
  await expect(popup(page)).not.toContainText("Rookie season");
  await expect(popup(page)).not.toContainText("Team tenure");
  await expect(popup(page).locator(".injury-history")).not.toHaveAttribute("open", "");
  const history = popup(page).getByText("2026 injury records · 5 reported weeks", { exact: true });
  if (isMobile) await history.tap();
  else { await history.focus(); await page.keyboard.press("Enter"); }
  await expect(popup(page).locator(".injury-record")).toHaveCount(5);
  await expect(popup(page).locator(".injury-record").first()).toContainText("Week 5 · CAR");
  await expect(popup(page).locator(".injury-record").last()).toContainText("Ankle; Wrist 1");
  await expect(popup(page)).toContainText("Practice · undated");
  await assertPopupFits(page);
  expect(await popup(page).evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
  await history.click();
  await history.click();
  await expect(popup(page).locator(".injury-record")).toHaveCount(5);
  await evidence(page, testInfo, `player-bio-weekly-records-${isMobile ? "mobile" : "desktop"}`);
  if (isMobile) await popup(page).getByRole("button", { name: "Close details" }).tap();
  else await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
  await expect(marker(page)).toBeFocused();
  await marker(page).click();
  await expect(popup(page).locator(".player-details h3")).toHaveCount(0);
  await page.locator("#search").click();
  await expect(popup(page)).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test("unreported defender without bio has no empty optional section", async ({ page }) => {
  await setup(page);
  await marker(page, "Field Fixture No Report").click();
  await expect(popup(page).getByText("Player details", { exact: true })).toHaveCount(0);
  await expect(popup(page).locator(".injury-history")).toHaveCount(0);
  await expect(popup(page)).not.toContainText("2025 REG");
});

test("earlier weekly records retain injury provenance when current team coverage is missing", async ({ page }) => {
  const fixture = fieldFixture({ week: 5 });
  const report = fixture.reports.find((report) => report.team === "CAR");
  const start = Date.parse(fixture.weeks[0].starts_at) - 7 * 86400000;
  const week = { ...fixture.weeks[0], key: "2026-REG-4", week: 4, label: "Week 4",
    starts_at: new Date(start).toISOString(), ends_at: fixture.weeks[0].starts_at };
  fixture.weeks.push(week);
  const game = { ...fixture.games[0], id: "earlier-week", week_key: week.key,
    kickoff: new Date(start + 5 * 86400000).toISOString(), status: "final" };
  fixture.games.push(game);
  fixture.reports = fixture.reports.filter((value) => value !== report);
  fixture.reports.push({ ...report, game_id: game.id, week_key: week.key });
  await setup(page, 2, fixture);
  await expect(marker(page).locator(".marker-status")).toHaveCount(0);
  await marker(page).click();
  await expect(popup(page)).toContainText("Availability unknown; injury report missing from this feed");
  await popup(page).getByText("Player details", { exact: true }).click();
  await expect(popup(page)).toContainText("2026 injury records · 1 reported week");
  await popup(page).getByText("Sources and timestamps", { exact: true }).click();
  await expect(popup(page).getByRole("link", { name: /nflverse.*injur/i })).toHaveAttribute("href", /injuries_2026.csv/);
  await expect(popup(page)).toContainText("History injury file");
  await expect(popup(page).locator("dt").filter({ hasText: /^Coverage$/ })).toHaveCount(0);
  await assertPopupFits(page);
});

function browserPlayerHistory() {
  const data = historyFixture();
  data.players = data.players.map((player) => ({ ...player, id: ({
    "gsis:fixture-a": "gsis:fixture-out", "gsis:fixture-b": "gsis:fixture-limited", "gsis:fixture-c": "gsis:fixture-dnp",
  })[player.id] }));
  return data;
}

test("explicit rookie season and observed roster teams remain compact, lazy and accessible without tenure claims", async ({ page, isMobile }, testInfo) => {
  const fixture = fieldFixture();
  fixture.players.find((player) => player.id === "gsis:fixture-out").bio = { birth_date: "2000-01-01", entry_year: 2023, draft_number: 20 };
  const { errors, externalRequests } = await setup(page, 2, fixture, null, browserPlayerHistory());
  if (isMobile) await marker(page).tap(); else await marker(page).click();
  await expect(popup(page).locator(".roster-history")).toHaveCount(0);
  const details = popup(page).getByText("Player details", { exact: true });
  if (isMobile) await details.tap(); else { await details.focus(); await page.keyboard.press("Enter"); }
  await expect(popup(page).locator("dt").filter({ hasText: /^Rookie season$/ })).toHaveCount(1);
  await expect(popup(page).locator("dt").filter({ hasText: /^Rookie season$/ }).locator("+ dd")).toHaveText("2024");
  await expect(popup(page)).toContainText("NFL eligible since");
  const rosters = popup(page).getByText("Observed rosters · 2025–2026", { exact: true });
  if (isMobile) await rosters.tap(); else { await rosters.focus(); await page.keyboard.press("Enter"); }
  await expect(popup(page).locator(".roster-observation")).toHaveText([
    "2026 REG · NYJ · W1, W3", "2025 REG · TEN · W1–2, W4", "2025 REG · NYJ · W5",
  ]);
  await expect(popup(page)).not.toContainText("W1–4");
  await expect(popup(page)).not.toContainText("Team tenure");
  await expect(popup(page)).not.toContainText("Joined");
  await expect(popup(page).locator("p")).toHaveCount(0);
  await assertPopupFits(page);
  await evidence(page, testInfo, `rookie-observed-rosters-${isMobile ? "mobile" : "desktop"}`);
  await popup(page).getByText("Sources and timestamps", { exact: true }).click();
  await expect(popup(page).getByRole("link", { name: "nflverse player reference", exact: true })).toHaveAttribute("href", /players.csv.gz$/);
  for (const season of [2025, 2026])
    await expect(popup(page).getByRole("link", { name: `nflverse ${season} weekly rosters`, exact: true })).toHaveAttribute("href", new RegExp(`roster_weekly_${season}\\.csv\\.gz$`));
  await assertPopupFits(page);
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
  await expect(marker(page)).toBeFocused();
  await marker(page, "Field Fixture Limited").click();
  await popup(page).getByText("Player details", { exact: true }).click();
  await expect(popup(page).locator("dt").filter({ hasText: /^Rookie season$/ })).toHaveCount(0);
  await popup(page).getByText("Observed rosters · 2025–2026", { exact: true }).click();
  await expect(popup(page).locator(".roster-observation")).toHaveText(["2026 REG · NYJ · W1", "2025 REG · BUF · W2"]);
  await popup(page).getByRole("button", { name: "Close details" }).click();
  await expect(popup(page)).toHaveCount(0);
  expect(errors).toEqual([]); expect(externalRequests).toEqual([]);
});

test("failed or older optional history retains validated facts while fresh injury data still updates", async ({ page }) => {
  const fixture = fieldFixture(), data = browserPlayerHistory();
  await setup(page, 2, fixture, null, data);
  const next = structuredClone(fixture);
  next.generated_at = "2026-09-13T12:00:01.000Z";
  next.reports.find((report) => report.team === "CAR").entries.find((entry) => entry.id === "gsis:fixture-limited").practice_status = "Did not practice";
  await page.route("**/current.json", (route) => route.fulfill({ json: next }));
  await page.route("**/player-history.json", (route) => route.fulfill({ json: { schema_version: 1 } }));
  await page.getByRole("button", { name: "Refresh shared data", exact: true }).click();
  await expect(marker(page, "Field Fixture Limited").locator(".marker-status")).toHaveText("DNP");
  const retainedRookie = async () => {
    await marker(page).click();
    await popup(page).getByText("Player details", { exact: true }).click();
    await expect(popup(page).locator("dt").filter({ hasText: /^Rookie season$/ }).locator("+ dd")).toHaveText("2024");
    await page.keyboard.press("Escape");
  };
  await retainedRookie();
  const older = structuredClone(data);
  older.generated_at = "2026-09-12T12:00:00.000Z";
  for (const source of older.sources) { source.retrieved_at = older.generated_at; source.source_updated_at = "2026-09-12T11:00:00.000Z"; }
  older.players.find((player) => player.id === "gsis:fixture-out").rookie_season = 2022;
  await page.route("**/player-history.json", (route) => route.fulfill({ json: older }));
  await page.getByRole("button", { name: "Refresh shared data", exact: true }).click();
  await expect(page.locator("#refresh-state")).toContainText("history check failed");
  await retainedRookie();
});

test("unmatched player history never joins a same-name defender or creates an empty roster section", async ({ page }) => {
  const data = browserPlayerHistory(); data.players[0].id = "gsis:other-identity";
  await setup(page, 2, fieldFixture(), null, data);
  await marker(page).click();
  await popup(page).getByText("Player details", { exact: true }).click();
  await expect(popup(page).locator(".roster-history")).toHaveCount(0);
  await expect(popup(page).locator("dt").filter({ hasText: /^Rookie season$/ })).toHaveCount(0);
});


test("injury history defaults to current season and switches to original 2025 reports without changing live status", async ({ page, isMobile }, testInfo) => {
  const { errors, externalRequests } = await setup(page, 2, fieldFixture(), null, null, archiveFixture());
  await marker(page).click();
  await expect(popup(page).locator(".injury-history")).toHaveCount(0);
  await popup(page).getByText("Player details", { exact: true }).click();
  const block = popup(page).locator(".injury-history");
  await expect(block).not.toHaveAttribute("open", "");
  await expect(block.locator("summary")).toHaveText("2026 injury records · 1 reported week");
  await block.locator("summary").click();
  const season = block.getByRole("combobox", { name: "Injury record season" });
  await expect(season).toHaveValue("2026");
  await expect(block.locator(".injury-record")).toHaveCount(1);
  await season.selectOption("2025");
  await expect(block.locator("summary")).toHaveText("2025 injury records · 3 reported weeks");
  await expect(block.locator(".injury-record")).toHaveCount(3);
  await expect(block.locator(".injury-record").first()).toContainText("WC · Week 19 · NYJ");
  await expect(block.locator(".injury-record").last()).toContainText("Week 1 · TEN");
  await expect(block).toContainText("Ankle; Wrist");
  await expect(block).toContainText("Limited Participation in Practice");
  await expect(block).toContainText("Did Not Participate In Practice");
  await expect(block).toContainText("Practice · undated");
  await expect(block).not.toContainText("Week 2");
  await expect(block).not.toContainText("healthy");
  await expect(popup(page).locator("p")).toHaveCount(0);
  await assertPopupFits(page);
  expect(await popup(page).evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
  await evidence(page, testInfo, `2025-injury-history-${isMobile ? "mobile" : "desktop"}`);
  await season.focus();
  await page.keyboard.press("Home"); await page.keyboard.press("Enter");
  await expect(season).toHaveValue("2026");
  await expect(block.locator(".injury-record")).toHaveCount(1);
  await popup(page).getByText("Sources and timestamps", { exact: true }).click();
  await expect(popup(page).getByRole("link", { name: "nflverse 2025 injury records", exact: true })).toHaveAttribute("href", /injuries_2025.csv$/);
  await expect(popup(page)).toContainText("Archive file");
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
  await expect(marker(page)).toBeFocused();
  await expect(marker(page).locator(".marker-status")).toHaveText("OUT");
  await marker(page).click(); await popup(page).getByText("Player details", { exact: true }).click();
  await expect(popup(page).locator(".injury-history > summary")).toHaveText("2026 injury records · 1 reported week");
  await popup(page).getByRole("button", { name: "Close details" }).click();
  expect(errors).toEqual([]); expect(externalRequests).toEqual([]);
});

test("archive-only history stays optional and never supplies current badges or a healthy missing report", async ({ page }) => {
  const fixture = fieldFixture(); fixture.reports = [];
  await setup(page, 2, fixture, null, null, archiveFixture());
  await expect(marker(page).locator(".marker-status")).toHaveCount(0);
  await expect(firstTile(page).locator(".report-notice")).toHaveCount(1);
  await marker(page).click();
  await expect(popup(page)).toContainText("Availability unknown");
  await popup(page).getByText("Player details", { exact: true }).click();
  await expect(popup(page).locator(".injury-history > summary")).toHaveText("2025 injury records · 3 reported weeks");
  await expect(popup(page).getByRole("combobox", { name: "Injury record season" })).toHaveCount(0);
  await popup(page).locator(".injury-history > summary").click();
  await expect(popup(page).locator(".injury-history")).toContainText("Out");
  await assertPopupFits(page); await page.keyboard.press("Escape");
  await tab(page, "Uncertain").click();
  await expect(firstTile(page).locator(".injury-row")).toHaveCount(0);
});

test("failed or older archive retains validated history while fresh current injuries update", async ({ page }) => {
  const fixture = fieldFixture(), archive = archiveFixture();
  await setup(page, 2, fixture, null, null, archive);
  const next = structuredClone(fixture); next.generated_at = "2026-09-13T12:00:01.000Z";
  next.reports.find(r => r.team === "CAR").entries.find(e => e.id === "gsis:fixture-limited").practice_status = "Did not practice";
  await page.route("**/current.json", route => route.fulfill({ json: next }));
  await page.route("**/injury-history.json", route => route.fulfill({ status: 503, body: "Archive unavailable" }));
  await page.getByRole("button", { name: "Refresh shared data", exact: true }).click();
  await expect(marker(page, "Field Fixture Limited").locator(".marker-status")).toHaveText("DNP");
  const checkRetained = async () => {
    await marker(page).click(); await popup(page).getByText("Player details", { exact: true }).click();
    await popup(page).locator(".injury-history > summary").click();
    await popup(page).getByRole("combobox", { name: "Injury record season" }).selectOption("2025");
    await expect(popup(page).locator(".injury-record")).toHaveCount(3);
    await page.keyboard.press("Escape");
  };
  await checkRetained();
  const older = structuredClone(archive); older.generated_at = "2026-09-12T12:00:00.000Z"; older.source.retrieved_at = older.generated_at;
  older.players[0].records = older.players[0].records.slice(0, 1);
  await page.route("**/injury-history.json", route => route.fulfill({ json: older }));
  await page.getByRole("button", { name: "Refresh shared data", exact: true }).click();
  await checkRetained();
  await page.route("**/injury-history.json", route => route.fulfill({ json: { season: 2025 } }));
  await page.getByRole("button", { name: "Refresh shared data", exact: true }).click();
  await checkRetained();
});

test("archive joins never borrow same-name records or create empty history for an unmatched identity", async ({ page }) => {
  const archive = archiveFixture(); archive.players.find(p => p.id === "gsis:fixture-out").id = "gsis:other-identity";
  const fixture = fieldFixture(); fixture.reports = [];
  await setup(page, 2, fixture, null, null, archive);
  await marker(page).click();
  await expect(popup(page).getByText("Player details", { exact: true })).toHaveCount(0);
  await expect(popup(page).getByRole("link", { name: "nflverse 2025 injury records", exact: true })).toHaveCount(0);
});

const production2024Fixture = () => normalizeContributions([
  "player_id,position_group,season,season_type,week,game_id,team,opponent_team,def_sacks,def_qb_hits,def_pass_defended,def_interceptions",
  "00-0012345,DL,2024,REG,1,2024_01_TEN_NYJ,TEN,NYJ,0.5,2,1,0",
  "00-0012345,DL,2024,REG,2,2024_02_NYJ_TEN,NYJ,TEN,2,7,2,1",
  "00-0012346,DB,2024,REG,1,2024_01_TEN_NYJ,TEN,NYJ,0,0,0,0",
].join("\n"), { retrieved_at: NOW, source_updated_at: "2026-08-13T16:49:10.000Z" }, Date.parse(NOW), 2024);
const productionDefenders = () => DEFENDERS.map(entry => entry[0] === "fixture-out"
  ? ["00-0012345", ...entry.slice(1)] : entry[0] === "fixture-limited" ? ["00-0012346", ...entry.slice(1)] : entry);

test("optional 2024 production is lazy, season-labelled and independent of current badges and 2025 counts", async ({ page, isMobile }, testInfo) => {
  const baseline = normalizeContributions([
    "player_id,position_group,season,season_type,week,game_id,team,opponent_team,def_sacks,def_qb_hits,def_pass_defended,def_interceptions",
    "00-0012345,DL,2025,REG,1,2025_01_ARI_NO,ARI,NO,0.5,2,1,0",
  ].join("\n"), { retrieved_at: NOW, source_updated_at: "2026-08-13T16:51:22.000Z" });
  const { errors, externalRequests } = await setup(page, 2, fieldFixture({ defenders: productionDefenders() }), baseline, null, null, production2024Fixture());
  const badge = await marker(page).locator(".marker-status").innerText();
  if (isMobile) await marker(page).tap(); else await marker(page).click();
  await expect(popup(page)).toContainText("2025 REG · recorded production");
  await expect(popup(page)).toContainText("ARI · 0.5 sacks · 2 QB hits · 1 PD · 0 INT");
  await expect(popup(page).locator(".production-history")).toHaveCount(0);
  await popup(page).getByText("Player details", { exact: true }).click();
  const production = popup(page).locator(".production-history");
  await expect(production).not.toHaveAttribute("open", "");
  const summary = production.locator("summary");
  await expect(summary).toHaveText("2024 REG · recorded production");
  if (isMobile) await summary.tap(); else { await summary.focus(); await page.keyboard.press("Enter"); }
  await expect(production).toHaveAttribute("open", "");
  await expect(production).toContainText("NYJ / TEN · 2.5 sacks · 9 QB hits · 3 PD · 1 INT");
  await expect(production).toContainText("TEN: 0.5 sacks · 2 QB hits");
  await expect(production).toContainText("NYJ: 2 sacks · 7 QB hits");
  await assertPopupFits(page);
  expect(await popup(page).evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
  await expect(popup(page).locator("p")).toHaveCount(0);
  await evidence(page, testInfo, `2024-production-${isMobile ? "mobile" : "desktop"}`);
  await popup(page).getByText("Sources and timestamps", { exact: true }).click();
  await expect(popup(page).getByRole("link", { name: "nflverse 2024 stats", exact: true })).toHaveAttribute("href", /stats_player_week_2024\.csv\.gz$/);
  await expect(popup(page)).toContainText("2024 stat rows");
  await expect(popup(page)).toContainText("2024 stats file");
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0); await expect(marker(page)).toBeFocused();
  await expect(marker(page).locator(".marker-status")).toHaveText(badge);
  await marker(page).click();
  await expect(popup(page)).toContainText("ARI · 0.5 sacks · 2 QB hits · 1 PD · 0 INT");
  await expect(popup(page).locator(".player-details")).not.toHaveAttribute("open", "");
  expect(errors).toEqual([]); expect(externalRequests).toEqual([]);
});

test("2024 history preserves reported zero, omits missing IDs and cannot substitute for an unavailable 2025 baseline", async ({ page }) => {
  const fixture = fieldFixture({ defenders: productionDefenders() });
  fixture.reports = fixture.reports.filter(report => report.team !== "CAR");
  await setup(page, 2, fixture, null, null, null, production2024Fixture());
  await row(page, "Field Fixture Out").click();
  await expect(popup(page).locator("h3").filter({ hasText: "2025 REG" })).toHaveCount(0);
  await expect(popup(page)).toContainText("Availability unknown");
  await popup(page).getByText("Player details", { exact: true }).click();
  await popup(page).locator(".production-history summary").click();
  await expect(popup(page).locator(".production-history")).toContainText("2.5 sacks");
  await page.keyboard.press("Escape");
  await expect(marker(page).locator(".marker-status")).toHaveCount(0);
  await tab(page, "Uncertain").click(); await expect(firstTile(page).locator(".injury-row")).toHaveCount(0);
  await tab(page, "All").click();
  await row(page, "Field Fixture Limited").click();
  await popup(page).getByText("Player details", { exact: true }).click();
  await popup(page).locator(".production-history summary").click();
  await expect(popup(page).locator(".production-history")).toContainText("TEN · 0 sacks · 0 QB hits · 0 PD · 0 INT");
  await page.keyboard.press("Escape");
  await row(page, "Field Fixture Unknown").click();
  await expect(popup(page).locator(".player-details")).toHaveCount(0);
  await expect(popup(page).locator(".production-history")).toHaveCount(0);
});

test("failed, malformed or older 2024 history retains valid counts while fresh current injuries still update", async ({ page }) => {
  const older = production2024Fixture();
  const fixture = fieldFixture({ defenders: productionDefenders() });
  await setup(page, 2, fixture, null, null, null, older);
  const fresh = structuredClone(fixture); fresh.generated_at = "2026-09-13T12:01:00.000Z";
  fresh.reports.find(r => r.team === "CAR").entries.find(e => e.id === "gsis:00-0012346").practice_status = "Did not practice";
  await page.route("**/current.json", route => route.fulfill({ json: fresh }));
  const stale = structuredClone(older); stale.source.retrieved_at = "2026-09-13T11:59:00.000Z";
  stale.players.find(p => p.id === "gsis:00-0012345").sacks = 0;
  stale.players.find(p => p.id === "gsis:00-0012345").teams.forEach(t => t.sacks = 0);
  for (const response of [{ status: 503, body: "Unavailable" }, { json: { season: 2024 } }, { json: stale }]) {
    await page.route("**/contributions-2024.json", route => route.fulfill(response));
    await page.locator("#refresh").click();
    await expect(page.locator("#refresh-state")).toContainText("history check failed");
    await expect(row(page, "Field Fixture Limited")).toContainText("DNP");
    await row(page, "Field Fixture Out").click();
    await popup(page).getByText("Player details", { exact: true }).click();
    await popup(page).locator(".production-history summary").click();
    await expect(popup(page).locator(".production-history")).toContainText("2.5 sacks");
    await page.keyboard.press("Escape");
  }
});

const coordinatorPilot = JSON.parse(await readFile(new URL('../../web/coordinators.json', import.meta.url), 'utf8'));
function coachingFixture(team = 'NE') {
  return JSON.parse(JSON.stringify(fieldFixture()).replaceAll('"CAR"', JSON.stringify(team)));
}
function coachingFacts() {
  // Metadata is synthetic so this offline test runs at the fixture clock.
  return {...structuredClone(coordinatorPilot), checked_at: NOW};
}

test('coordinator pilot adds one compact formal-role line with keyboard sources and unchanged practice filters', async ({page, isMobile}, testInfo) => {
  const {errors, externalRequests} = await setup(page, 2, coachingFixture(), null, null, null, null, coachingFacts());
  const tile = firstTile(page);
  await expect(tile.locator('.coordinator-context')).toHaveText('DC Zak Kuhr · since 2026');
  await expect(tile.locator('.coordinator-context')).toHaveCount(1);
  await expect(tile.locator('.coordinator-context')).not.toContainText('2025');
  await tab(page,'Uncertain').click();
  // Existing fixture has five uncertain defenders; practice DNP remains distinct from game Out.
  await expect(tile.locator('.injury-row')).toHaveCount(5);
  await expect(marker(page,'Field Fixture DNP').locator('.marker-status')).toHaveText('DNP');
  await expect(marker(page).locator('.marker-status')).toHaveText('OUT');
  const info=tile.getByRole('button',{name:'NE report source and freshness'});
  await info.focus();await page.keyboard.press('Enter');
  const details=popup(page).locator('details').filter({has:page.locator('summary',{hasText:'Coordinator · Zak Kuhr'})});
  await expect(details).toBeVisible();
  await details.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(details).toContainText(/Since season\s*2026/);
  await expect(details.getByRole('link',{name:'Team biography'})).toHaveAttribute('href','https://www.patriots.com/team/coaches-roster/zak-kuhr');
  await expect(details).toContainText('Checked');
  await assertPopupFits(page);
  await evidence(page,testInfo,`coordinator-sources-${isMobile?'mobile':'desktop'}`);
  await page.keyboard.press('Escape');await expect(popup(page)).toHaveCount(0);
  await page.getByRole('button',{name:'Sources and information'}).click();
  const scope=popup(page).getByText('Coordinator pilot · 6 / 32 teams',{exact:true});
  await expect(scope).toBeVisible();
  await page.keyboard.press('Escape');
  await tab(page,'All').click();
  await evidence(page,testInfo,`coordinator-context-${isMobile?'mobile':'desktop'}`);
  expect(errors).toEqual([]);expect(externalRequests).toEqual([]);
});

test('head-coach exceptions, absent or invalid optional facts do not create a coordinator or change injury rows', async ({page}) => {
  const {errors} = await setup(page, 2, coachingFixture('TB'), null, null, null, null, coachingFacts());
  await expect(page.locator('.coordinator-context')).toHaveCount(0);
  const original=await firstTile(page).locator('.injury-row').count();
  await page.route('**/coordinators.json',route=>route.fulfill({json:{...coachingFacts(),appointments:[{...coachingFacts().appointments[0],team:'TB',name:'Synthetic Head Coach',role:'head_coach',title:'Head Coach'}]}}));
  await page.reload();
  await expect(firstTile(page).locator('.injury-row')).toHaveCount(original);
  await expect(page.locator('.coordinator-context')).toHaveCount(0);
  await page.route('**/coordinators.json',route=>route.fulfill({status:404,body:'Optional facts missing'}));
  await page.route('**/current.json',route=>route.fulfill({json:coachingFixture()}));
  await page.reload();
  await expect(firstTile(page).locator('.opponent-name')).toHaveText('NE defense');
  await expect(firstTile(page).locator('.injury-row')).toHaveCount(original);
  await expect(page.locator('.coordinator-context')).toHaveCount(0);
  await tab(page,'Uncertain').click();await expect(firstTile(page).locator('.injury-row')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('six comparison tiles align with mixed coordinator coverage and wrap safely on narrow screens', async ({page,isMobile},testInfo) => {
  const fixture=JSON.parse(JSON.stringify(fieldFixture({alternateDefenders:ALTERNATE_DEFENDERS})).replaceAll('"CAR"','"NE"'));
  const {errors}=await setup(page,6,fixture,null,null,null,null,coachingFacts());
  if(isMobile) await page.setViewportSize({width:320,height:740});
  await expect(page.locator('.coordinator-context')).toHaveCount(3);
  const tiles=await page.locator('.player-card').all();
  const lines=[];
  for(const tile of tiles) lines.push(await assertFieldGeometry(tile));
  if(!isMobile) expect(Math.max(...lines)-Math.min(...lines)).toBeLessThanOrEqual(1);
  else {
    for(const tile of tiles) {
      const b=await tile.boundingBox();
      expect(b.width).toBeLessThanOrEqual(320);
      const line=tile.locator('.coordinator-context');
      if(await line.count()) {
        const l=await line.boundingBox();
        expect(l.x+l.width).toBeLessThanOrEqual(b.x+b.width);
      }
    }
  }
  await tiles.at(-1).scrollIntoViewIfNeeded();
  await evidence(page,testInfo,`six-coordinator-coverage-${isMobile?'mobile':'desktop'}`);
  expect(errors).toEqual([]);
});

test('coordinator pilot expires on the page clock while current injury data remains usable', async ({page}) => {
  const facts={...coachingFacts(),checked_at:new Date(Date.parse(NOW)-7*86400000+1000).toISOString()};
  const {errors}=await setup(page,2,coachingFixture(),null,null,null,null,facts);
  await expect(firstTile(page).locator('.coordinator-context')).toHaveCount(1);
  await page.locator('#reports').focus();
  await page.clock.setFixedTime(new Date(Date.parse(NOW)+1001));
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.coordinator-context')).toHaveCount(0);
  await expect(firstTile(page).locator('.injury-row')).toHaveCount(DEFENDERS.length);
  await tab(page,'Uncertain').click();await expect(firstTile(page).locator('.injury-row')).toHaveCount(5);
  expect(errors).toEqual([]);
});
