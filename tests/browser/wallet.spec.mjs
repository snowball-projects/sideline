import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixture } from "../fixture.mjs";
import { outCount } from "../../web/field.mjs";

function walletFeed() {
  const data = fixture();
  const positions = ["LDE", "NT", "RDE", "WLB", "LILB", "RILB", "SLB", "LCB", "SS", "FS", "RCB", "NB"];
  for (const week of data.weeks) for (const [team, own] of Object.entries(week.teams)) {
    if (!own.defense.length) continue;
    own.defense = positions.map((position, i) => ({ position, slot: i + 1,
      players: [{id:`gsis:wallet-${team}-${i}`, name:`${position}-${team}`, order:1, injury:null}],
    }));
  }
  const injury = {injury:"Knee", game:"Out", practice:"Limited Participation in Practice", badges:["OUT", "LP"]};
  const teams = data.weeks[0].teams;
  for (const team of ["ARI", "ATL", "BUF"]) teams[team].report = true;
  for (const index of [1, 2]) teams.ARI.offense[index].players[0].injury = {...injury};
  teams.ATL.offense[0].players[0].injury = {...injury};
  teams.ARI.defense[0].players[0].injury = {...injury};
  for (const index of [0, 1]) teams.ATL.defense[index].players[0].injury = {...injury};
  return data;
}
const feed = walletFeed();
const strip = (page, team) => page.locator(`#cards .wallet-strip[data-team="${team}"]`);
const liftedStrip = (page) => page.locator("#wallet-view .wallet-strip");

async function open(page, {data = feed, selections = [], week = 1, hash = ""} = {}) {
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    expect(new URL(route.request().url()).hostname).toBe("127.0.0.1");
    if (route.request().url().endsWith("/current.json")) {
      requests.push(route.request().url()); await route.fulfill({json:data});
    } else await route.continue();
  });
  await page.clock.install({time:new Date("2026-09-10T18:00:00Z")});
  await page.addInitScript(value => {
    if (!localStorage.getItem("sideline.compare")) localStorage.setItem("sideline.compare", JSON.stringify(value));
  }, selections);
  await page.goto(`/${hash}`);
  await expect(page.locator("#week")).toBeEnabled();
  await page.locator("#week").selectOption(String(week));
  return {errors, requests};
}
async function chooseSort(page, value, direction = "best") {
  await page.locator("#sort").click();
  await page.locator(`[data-sort="${value}"]`).click();
  await page.locator(`[data-direction="${direction}"]`).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toBeHidden();
}
async function revealStrip(page, team) {
  // Sticky geometry describes the painted pile, not the strip's normal-flow slot.
  // Scroll that slot into the open middle of the native stack before tapping it.
  await strip(page, team).evaluate(el => {
    const cards = el.closest("#cards"), articles = [...cards.children];
    let offset = parseFloat(getComputedStyle(cards).paddingTop) || 0;
    for (const article of articles) {
      const css = getComputedStyle(article);
      offset += parseFloat(css.marginTop) || 0;
      if (article.contains(el)) break;
      offset += article.offsetHeight + (parseFloat(css.marginBottom) || 0);
    }
    cards.scrollTop = Math.max(0, offset - cards.clientHeight / 3);
  });
}
async function lift(page, team) {
  await revealStrip(page, team);
  await strip(page, team).click();
  await expect(page).toHaveURL(new RegExp(`#team=${team}$`));
  await expect(page.locator("#wallet-view")).toBeVisible();
}
async function collapsed(page) {
  await expect(page).not.toHaveURL(/#team=/);
  await expect(page.locator("#wallet-view")).toBeHidden();
  await expect(page.locator("#cards")).toBeVisible();
}
async function swipeDown(page, target, distance = 100) {
  // Raw CDP touches bypass Playwright actionability, so measure after the lift settles.
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("Swipe target is not visible");
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {type:"touchStart", touchPoints:[{x,y}]});
  for (const step of [1, 2, 3, 4]) await session.send("Input.dispatchTouchEvent", {
    type:"touchMove", touchPoints:[{x,y:y + distance * step / 4}],
  });
  await session.send("Input.dispatchTouchEvent", {type:"touchEnd", touchPoints:[]});
  await session.detach();
}

test("collapsed strips overlap, show opponents and match selected-unit Out counts", async ({page}, info) => {
  const {errors, requests} = await open(page);
  await expect(page.locator("#cards .wallet-strip")).toHaveCount(32);
  await expect(page.locator("#cards .player:visible")).toHaveCount(0);
  await expect(page.locator("#cards .stats:visible")).toHaveCount(0);
  await expect(strip(page, "ARI").locator(".out-dot")).toHaveCount(2);
  await expect(strip(page, "ATL").locator(".out-dot")).toHaveCount(1);
  await expect(strip(page, "BUF").locator(".out-dot")).toHaveCount(0);
  const unknown = strip(page, "BAL");
  await expect(unknown.locator(".out-dot")).toHaveCount(0);
  expect((await unknown.getAttribute("aria-label") || "") + (await unknown.getAttribute("title") || "") + await unknown.textContent()).not.toMatch(/unavailable|unknown/i);
  const images = await strip(page, "ARI").locator("img").evaluateAll(els => els.map(el => el.getBoundingClientRect().width));
  expect(images).toHaveLength(2); expect(images[1]).toBeLessThan(images[0]);
  const boxes = await page.locator("#cards .wallet-strip").evaluateAll(els => els.slice(0, 2).map(el => {const b=el.getBoundingClientRect(); return {top:b.top,bottom:b.bottom};}));
  expect(boxes[1].top).toBeGreaterThan(boxes[0].top);
  expect(boxes[1].top).toBeLessThan(boxes[0].bottom);
  const red = await strip(page, "ARI").locator(".out-dot").first().evaluate(el => getComputedStyle(el).backgroundColor.match(/[\d.]+/g).slice(0,3).map(Number));
  expect(red[0]).toBeGreaterThan(red[1]); expect(red[0]).toBeGreaterThan(red[2]);
  await page.locator("#defense").click();
  await expect(strip(page, "ARI").locator(".out-dot")).toHaveCount(1);
  await expect(strip(page, "ATL").locator(".out-dot")).toHaveCount(2);
  await chooseSort(page, "record");
  await expect(page.locator("#cards .wallet-strip").first()).toHaveAttribute("data-team", "ARI");
  await page.locator("#week").selectOption("2");
  await chooseSort(page, "record");
  await expect(page.locator("#cards .wallet-strip").first()).toHaveAttribute("data-team", "ATL");
  await page.screenshot({path:info.outputPath("wallet-stack.png")});
  expect(errors).toEqual([]); expect(requests).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Out dots retain a visible count in forced-colors mode", async ({page}, info) => {
  await page.emulateMedia({forcedColors:"active"});
  await open(page, {selections:["ARI", "ATL", "BUF", "BAL"]});
  await expect(strip(page, "ARI").locator(".out-dot")).toHaveCount(2);
  await expect(strip(page, "ATL").locator(".out-dot")).toHaveCount(1);
  const dot = strip(page, "ARI").locator(".out-dot").first();
  await expect(dot).toHaveCSS("outline-style", "solid");
  await expect(dot).toHaveCSS("outline-width", "1px");
  const colors = await dot.evaluate(el => ({
    outline:getComputedStyle(el).outlineColor,
    surface:getComputedStyle(el.closest(".wallet-strip")).backgroundColor,
  }));
  expect(colors.outline).not.toBe(colors.surface);
  await page.screenshot({path:info.outputPath("wallet-forced-colors.png")});
  await page.locator("#defense").click();
  await expect(strip(page, "ARI").locator(".out-dot")).toHaveCount(1);
  await expect(strip(page, "ATL").locator(".out-dot")).toHaveCount(2);
  await lift(page, "ARI");
  const liftedDots = liftedStrip(page).locator(".out-dot");
  await expect(liftedDots).toHaveCount(1);
  await expect(liftedDots).toHaveCSS("outline-style", "solid");
});

test("lifting automatically pairs units and player taps preserve the lifted team", async ({page}, info) => {
  const {errors} = await open(page);
  await lift(page, "ARI");
  await expect(page.locator("#cards")).toBeHidden();
  await expect(page.locator("#team-view")).toBeHidden();
  await expect(liftedStrip(page)).toHaveAttribute("data-team", "ARI");
  await expect(page.locator("#wallet-view .field-half")).toHaveClass(["field-half offense", "field-half defense below"]);
  await expect(page.locator("#wallet-view .scrimmage")).toHaveCount(1);
  await expect(page.locator("#wallet-view .stats")).toHaveCount(2);
  await expect(page.locator(".wallet-opponent")).toContainText("ATL");
  const player = page.locator('#wallet-view .player[data-slot="1"]').first();
  expect((await player.boundingBox()).width).toBe(40);
  await player.tap();
  await expect(page.locator("dialog")).toContainText("Knee");
  await expect(page.locator("dialog")).toContainText("backup-ARI");
  await expect(page.locator("dialog dl")).toHaveCount(0);
  await expect(page.locator("dialog")).not.toContainText(/No injury report yet|Not listed|Game status|Practice status/);
  await expect(page).toHaveURL(/#team=ARI$/);
  await page.keyboard.press("Escape"); await expect(player).toBeFocused();
  await expect(page.locator("#wallet-view")).toBeVisible();
  await page.locator("#defense").click();
  await expect(liftedStrip(page)).toHaveAttribute("data-team", "ARI");
  await expect(page.locator("#wallet-view .field-half")).toHaveClass(["field-half defense", "field-half offense below"]);
  await page.locator("#week").selectOption("2");
  await expect(page.locator("#wallet-view .field-half")).toHaveCount(1);
  await expect(page.locator("#wallet-view .bye")).toHaveText("Bye");
  await page.locator("#week").selectOption("4");
  await expect(page.locator("#wallet-view .field-empty")).toHaveCount(0);
  await expect(page.locator("#wallet-view .player")).toHaveCount(0);
  await page.screenshot({path:info.outputPath("wallet-matchup.png")});
  expect(errors).toEqual([]);
});

test("native back and forward restore the lift and its exact stack position", async ({page}) => {
  await open(page);
  await revealStrip(page, "WAS");
  const position = await page.locator("#cards").evaluate(el => ({page:scrollY, stack:el.scrollTop}));
  const order = await page.locator("#cards .wallet-strip").evaluateAll(els => els.map(el => el.dataset.team));
  await lift(page, "WAS");
  await page.goBack(); await collapsed(page);
  await expect(strip(page, "WAS")).toBeFocused();
  const restored = await page.locator("#cards").evaluate(el => ({page:scrollY, stack:el.scrollTop}));
  expect(position.stack).toBeGreaterThan(0);
  expect(restored.page).toBe(0); expect(restored.stack).toBeCloseTo(position.stack, 0);
  expect(await page.locator("#cards .wallet-strip").evaluateAll(els => els.map(el => el.dataset.team))).toEqual(order);
  await page.goForward(); await expect(page.locator("#wallet-view")).toBeVisible();
  await expect(liftedStrip(page)).toHaveAttribute("data-team", "WAS");
  await liftedStrip(page).click(); await collapsed(page);
  await expect(strip(page, "WAS")).toBeFocused();
});

test("fresh phone deep links and reloads lift the team, and back collapses inside sideline", async ({page}) => {
  await open(page, {hash:"#team=ARI"});
  await expect(page.locator("#wallet-view")).toBeVisible();
  await expect(liftedStrip(page)).toHaveAttribute("data-team", "ARI");
  await page.reload(); await expect(page.locator("#week")).toBeEnabled();
  await expect(page.locator("#wallet-view")).toBeVisible();
  await page.goBack(); await collapsed(page);
  await expect(strip(page, "ARI")).toBeFocused();
  await page.goForward(); await expect(page.locator("#wallet-view")).toBeVisible();
  await expect(liftedStrip(page)).toHaveAttribute("data-team", "ARI");
});

test("the bottom pile stays fixed while the lifted matchup scrolls and dismisses on tap", async ({page}, info) => {
  await page.setViewportSize({width:page.viewportSize().width, height:500});
  await open(page); await lift(page, "ARI");
  const region = page.locator("#wallet-scroll"), pile = page.locator("#wallet-pile");
  await expect(pile).toBeVisible();
  const before = await pile.boundingBox();
  await region.evaluate(el => el.scrollTop = el.scrollHeight);
  expect(await region.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  const after = await pile.boundingBox();
  expect(after.y).toBeCloseTo(before.y, 0); expect(after.y + after.height).toBeLessThanOrEqual(500);
  await page.screenshot({path:info.outputPath("wallet-scrolling-pile.png")});
  await pile.tap(); await collapsed(page);
  await expect(strip(page, "ARI")).toBeFocused();
});

test("native downward gestures preserve the lifted team, including on players", async ({page, browserName}) => {
  test.skip(browserName !== "chromium", "Raw touch dispatch uses Chromium's CDP; native scrolling is checked separately in every engine.");
  await open(page); await lift(page, "ARI");
  await swipeDown(page, liftedStrip(page));
  await expect(page.locator("#wallet-view")).toBeVisible(); await expect(page).toHaveURL(/#team=ARI$/);
  await swipeDown(page, page.locator('#wallet-view .player[data-slot="1"]').first(), 70);
  await expect(page.locator("#wallet-view")).toBeVisible(); await expect(page).toHaveURL(/#team=ARI$/);
  if (await page.locator("dialog").isVisible()) await page.keyboard.press("Escape");
  await page.locator("#wallet-pile").tap(); await collapsed(page);
});

test("keyboard opening, dismissal and dialogs never expose the collapsed background", async ({page}) => {
  await open(page, {selections:["ARI","ATL"]});
  await strip(page, "ARI").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#wallet-view")).toBeVisible();
  await expect(page.locator("#cards")).toBeHidden();
  await expect(liftedStrip(page)).toBeFocused();
  await expect(page.locator("#cards")).toHaveJSProperty("inert", true);
  await strip(page, "ATL").evaluate(el => el.focus());
  await expect(liftedStrip(page)).toBeFocused();
  await page.locator('#wallet-view .player[data-slot="1"]').first().focus(); await page.keyboard.press("Enter");
  await expect(page.locator("dialog")).toBeVisible(); await page.keyboard.press("Escape");
  await page.locator("#wallet-pile").focus(); await page.keyboard.press("Enter"); await collapsed(page);
  await expect(strip(page, "ARI")).toBeFocused();
  await page.locator("#sort").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("dialog")).toContainText("Sort teams");
  await page.keyboard.press("Escape"); await expect(page.locator("#sort")).toBeFocused();
});

test("Sort, Compare and week controls update the stack and keep an included team lifted", async ({page}) => {
  await open(page, {selections:["ARI"]}); await lift(page, "ARI");
  await page.locator("#compare").click();
  await page.locator('.compare-options [data-team="ATL"]').tap();
  await expect(page.locator("#compare")).toHaveText("Compare (2)");
  await page.keyboard.press("Escape");
  await expect(page.locator("#wallet-view")).toBeVisible();
  await page.locator("#week").selectOption("2");
  await chooseSort(page, "stat-0", "worst");
  await expect(page.locator("#sort")).toHaveText("Points · Worst first");
  await page.locator("#defense").click();
  await expect(page.locator("#sort")).toHaveText("Points · Worst first");
  await page.locator("#offense").click();
  await expect(page.locator("#wallet-view")).toBeVisible();
  await page.locator("#wallet-pile").tap(); await collapsed(page);
  await expect(page.locator("#cards .wallet-strip")).toHaveCount(2);
  await expect(page.locator("#cards .wallet-strip").first()).toHaveAttribute("data-team", "ARI");
  await page.reload(); await expect(page.locator("#week")).toBeEnabled();
  await expect(page.locator("#cards .wallet-strip")).toHaveCount(2);
  await page.locator("#clear-compare").click();
  await expect(page.locator("#cards .wallet-strip")).toHaveCount(32);
});

test("599px lifts the linked team, while 600px, tablet and desktop use the separate page", async ({page}) => {
  await page.setViewportSize({width:599, height:900});
  await open(page, {hash:"#team=ARI"});
  await expect(page.locator("#wallet-view")).toBeVisible();
  await expect(page.locator("#team-view")).toBeHidden();
  await page.locator("#defense").click();
  for (const width of [600, 768, 1440]) {
    await page.setViewportSize({width, height:1000});
    await expect(page.locator("#wallet-view")).toBeHidden();
    await expect(page.locator("#team-view")).toBeVisible();
    await expect(page.locator("#team-view .team-heading h2")).toHaveText(["ARI","ATL"]);
    await expect(page.locator("#team-view .field-half")).toHaveClass(["field-half defense", "field-half offense below"]);
    await expect(page.locator("#team-view .player-name").first()).not.toHaveCSS("display", "none");
  }
  await page.getByRole("group", {name:"Team matchup unit"}).getByRole("button", {name:"Offense", exact:true}).click();
  await expect(page.locator("#team-view .field-half")).toHaveClass(["field-half offense", "field-half defense below"]);
  await page.setViewportSize({width:599, height:900});
  await expect(page.locator("#wallet-view")).toBeVisible();
  await expect(liftedStrip(page)).toHaveAttribute("data-team", "ARI");
  await expect(page.locator("#offense")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#wallet-view .field-half")).toHaveClass(["field-half offense", "field-half defense below"]);
  await page.locator("#wallet-pile").click(); await collapsed(page);
  await page.setViewportSize({width:600, height:1000});
  await expect(page.locator("#cards .player").first()).toBeVisible();
  await expect(page.locator("#cards .wallet-strip:visible")).toHaveCount(0);
});

test("Compare can exclude a lifted team without interrupting selection, then return to the filtered stack", async ({page}) => {
  await open(page, {selections:["ARI","ATL"]}); await lift(page, "ARI");
  await page.locator("#compare").click();
  await page.locator('.compare-options [data-team="ARI"]').tap();
  await expect(page.locator("dialog")).toBeVisible();
  await expect(page.locator("#wallet-view")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("#wallet-pile").tap();
  await collapsed(page);
  await expect(page.locator("dialog")).toBeHidden();
  await expect(page.locator("#cards .wallet-strip")).toHaveCount(1);
  await expect(page.locator("#cards .wallet-strip")).toHaveAttribute("data-team", "ATL");
  await expect(page.locator("#cards")).toHaveJSProperty("inert", false);
  await expect.poll(() => page.evaluate(() => {
    const active = document.activeElement;
    return active !== document.body && !active.closest("[hidden],[inert]") && active.getClientRects().length > 0;
  })).toBe(true);
});

let real;
try { real = JSON.parse(await readFile(new URL("../../web/current.json", import.meta.url), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }

test("real collected teams fit the phone stack and pair observed units without player navigation", async ({page}, info) => {
  test.skip(!real, "CI uses synthetic source fixtures.");
  const source = real.weeks.findLast(week => Object.values(week.teams).some(own =>
    own.report && own.opponent && own.offense.length && week.teams[own.opponent].defense.length));
  expect(source, "collected snapshot includes an observed matchup and injury reports").toBeTruthy();
  const teams = Object.keys(real.teams);
  const team = teams.find(team => {
    const own = source.teams[team], opponent = source.teams[own.opponent];
    return own.report && opponent && own.offense.length && own.defense.length && opponent.offense.length && opponent.defense.length;
  });
  expect(team, "collected snapshot includes both observed units for the matchup").toBeTruthy();
  const {errors} = await open(page, {data:real, week:source.week});
  await expect(page.locator("#cards .wallet-strip")).toHaveCount(32);
  for (const side of ["offense", "defense"]) {
    await page.locator(`#${side}`).click();
    for (const code of teams) {
      const own = source.teams[code], unit = own[side].filter(group => side !== "offense" || group.position !== "FB");
      // Count source designations directly, independently of the rendering helper.
      const expected = own.report && unit.length === (side === "offense" ? 11 : 12)
        ? unit.filter(group => group.players[0].injury?.badges.includes("OUT")).length : null;
      expect(outCount(own, side), `${code} ${side} source Out count`).toBe(expected);
      await expect(strip(page, code).locator(".wallet-name")).toHaveText(real.teams[code].name);
      await expect(strip(page, code).locator(".out-dot")).toHaveCount(expected ?? 0);
      if (expected === null) await expect(strip(page, code)).not.toHaveAccessibleName(/Out count unavailable/);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await lift(page, team);
    const otherSide = side === "offense" ? "defense" : "offense", opponent = source.teams[team].opponent;
    const fields = page.locator("#wallet-view .field-half");
    await expect(fields).toHaveClass([`field-half ${side}`, `field-half ${otherSide} below`]);
    await expect(page.locator("#wallet-view .scrimmage")).toHaveCount(1);
    await expect(page.locator(".wallet-opponent .team-heading h2")).toHaveText(real.teams[opponent].name);
    for (const [index, code, unitSide] of [[0, team, side], [1, opponent, otherSide]]) {
      const count = source.teams[code][unitSide].filter(group => unitSide !== "offense" || group.position !== "FB").length;
      await expect(fields.nth(index).locator(".player")).toHaveCount(count);
    }
    const player = fields.first().locator(".player").first();
    await player.tap(); await expect(page.locator("dialog")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#team=${team}$`));
    await expect(liftedStrip(page)).toHaveAttribute("data-team", team);
    await page.keyboard.press("Escape"); await expect(player).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (side === "offense") await page.screenshot({path:info.outputPath("real-wallet-matchup.png")});
    await page.locator("#wallet-pile").tap(); await collapsed(page);
  }
  expect(errors).toEqual([]);
});


test("phone strips show plain opponent records and leave missing data and byes blank", async ({page}) => {
  const data = structuredClone(feed), teams = data.weeks[1].teams;
  teams.ARI.opponent = "ATL"; teams.ARI.bye = false;
  teams.ARI.record = {wins:2,losses:3,ties:1};
  teams.ATL.record = {wins:4,losses:2,ties:0};
  teams.BAL.record = null; teams.BAL.opponent = null; teams.BAL.bye = false;
  data.weeks[2].teams.ARI.opponent = null; data.weeks[2].teams.ARI.bye = true;
  await open(page, {data,selections:["ARI","BAL"],week:2});
  await expect(strip(page,"ARI").locator(".wallet-record > span").first()).toHaveText("2-3-1");
  await expect(strip(page,"ARI").locator(".wallet-opponent-logo")).toHaveText("4-2");
  await expect(strip(page,"ARI")).toHaveAccessibleName(/ATL, 4-2/);
  const styles = await strip(page,"ARI").evaluate(el => [el.querySelector(".wallet-record"),el.querySelector(".wallet-opponent-logo")].map(x => {
    const s=getComputedStyle(x); return [s.fontSize,s.lineHeight,s.color,s.fontWeight];
  }));
  expect(styles[0]).toEqual(styles[1]);
  await expect(strip(page,"BAL").locator(".wallet-record")).toHaveText("");
  await expect(strip(page,"BAL").locator(".wallet-opponent-logo")).toBeEmpty();
  await expect(strip(page,"BAL")).not.toHaveAccessibleName(/unavailable|unknown/i);
  await page.locator("#week").selectOption("1");
  await page.locator("#week").selectOption("2");
  // A known bye leaves the opponent side blank too.
  await page.locator("#week").selectOption("3");
  await expect(strip(page,"ARI").locator(".wallet-opponent-logo")).toBeEmpty();
});
