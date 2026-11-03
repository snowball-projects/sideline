import { test, expect } from "@playwright/test";
import { fixture } from "../fixture.mjs";

const injury = (game = "Not listed", practice = "Not listed", badges = [], body = "Ankle") => ({
  injury:body, game, practice, badges,
});
function playerFeed() {
  const data = fixture();
  data.weeks.shift(); // The earliest displayed week has one completed week of stats.
  const own = data.weeks[0].teams.ARI;
  own.report = true;
  const qb = own.offense[0].players[0];
  qb.injury = injury("Questionable", "Limited Participation in Practice", ["Q", "LP"], "Knee");
  qb.star = true;
  qb.stats = {
    passing_yards:{value:1234, rank:10, tied:true, star:true},
    passing_tds:{value:5, rank:12},
  };
  own.offense[0].players[1].injury = injury("Out", "Did Not Participate In Practice", ["OUT", "DNP"], "Shoulder");
  own.offense[0].players.push({id:"gsis:third-ARI", name:"third-ARI", order:3, injury:null});
  return data;
}
async function open(page, data = playerFeed()) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    expect(new URL(route.request().url()).hostname).toBe("127.0.0.1");
    if (route.request().url().endsWith("/current.json")) await route.fulfill({json:data});
    else await route.continue();
  });
  await page.clock.install({time:new Date("2026-09-10T18:00:00Z")});
  await page.addInitScript(() => localStorage.setItem("sideline.compare", '["ARI"]'));
  await page.goto("/");
  await expect(page.locator("#week")).toBeEnabled();
  if (page.viewportSize().width < 600) {
    await page.locator('#cards .wallet-strip[data-team="ARI"]').click();
    await expect(page.locator("#wallet-view")).toBeVisible();
  }
  return errors;
}
const ownField = page => page.viewportSize().width < 600
  ? page.locator("#wallet-view .field-half").first()
  : page.getByRole("article", {name:"ARI offense", exact:true}).locator(".field-half");
const playerAt = (page, slot) => ownField(page).locator(`.player[data-slot="${slot}"]`);
async function close(page, player) {
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toBeHidden();
  await expect(player).toBeFocused();
}
async function expectNoOldRows(page) {
  expect(await page.locator("dialog dt").allTextContents()).not.toEqual(expect.arrayContaining(["Injury"]));
  expect(await page.locator("dialog dt").allTextContents()).not.toEqual(expect.arrayContaining(["Game status"]));
  expect(await page.locator("dialog dt").allTextContents()).not.toEqual(expect.arrayContaining(["Practice status"]));
  await expect(page.locator("dialog")).not.toContainText(/No injury report yet|Not listed|Game status|Practice status|Full participation|No game designation|★ League top 10/);
}

test("player popup shows earned statistics and ordered designated backups without absent-report prose", async ({page}, info) => {
  const errors = await open(page), qb = playerAt(page, 1);
  await qb.focus(); await page.keyboard.press("Enter");
  const dialog = page.locator("dialog");
  await expect(dialog.getByRole("heading", {level:2})).toHaveText("qb-ARI · QB");
  await expect(dialog).toContainText("Questionable");
  await expect(dialog).toContainText("Knee");
  await expect(dialog).not.toContainText("Limited in practice");
  const stats = dialog.locator(".player-stats");
  await expect(dialog.getByRole("heading", {name:"Stats through week 1", exact:true})).toBeVisible();
  await expect(stats.locator(".player-stat")).toHaveCount(2);
  const yards = stats.locator(".player-stat").filter({hasText:"Passing yards"});
  await expect(yards).toContainText("1,234");
  await expect(yards).toContainText("Tied 10th among QBs");
  const touchdowns = stats.locator(".player-stat").filter({hasText:"Passing TDs"});
  await expect(touchdowns).toContainText("5");
  await expect(touchdowns).toContainText("12th among QBs");
  await expect(touchdowns).not.toContainText("★");
  await expect(stats.locator(".star-stat")).toHaveCount(1);
  await expect(stats.locator(".star-stat")).toContainText("Passing yards");
  await expect(stats.locator(".star-stat")).toContainText("★");
  const backups = dialog.locator("ol li");
  await expect(backups).toHaveCount(2);
  await expect(backups.nth(0)).toContainText("backup-ARI");
  await expect(backups.nth(0)).toContainText("Out");
  await expect(backups.nth(0)).toContainText("Shoulder");
  await expect(backups.nth(1)).toHaveText("third-ARI · QB");
  await expectNoOldRows(page);
  await page.screenshot({path:info.outputPath("player-popup-stats.png")});
  await close(page, qb);
  if (page.viewportSize().width < 600) await expect(page).toHaveURL(/#team=ARI$/);
  expect(errors).toEqual([]);
});

test("each offensive stat names its position scope and ordinal ties explicitly", async ({page}, info) => {
  const data = playerFeed(), own = data.weeks[0].teams.ARI;
  const cases = [
    {slot:1, stats:{passing_yards:{value:1234,rank:11,tied:true},passing_tds:{value:5,rank:21}}, labels:["Tied 11th among QBs", "21st among QBs"]},
    {slot:2, stats:{rushing_yards:{value:456,rank:12,tied:true},rushing_tds:{value:2,rank:22}}, labels:["Tied 12th among RBs", "22nd among RBs"]},
    {slot:3, stats:{receiving_yards:{value:789,rank:3,star:true},receiving_tds:{value:1,rank:23,tied:true}}, labels:["3rd among WRs", "Tied 23rd among WRs"]},
    {slot:11, stats:{receiving_yards:{value:315,rank:13,tied:true},receiving_tds:{value:4,rank:1,star:true}}, labels:["Tied 13th among TEs", "1st among TEs"]},
  ];
  for (const entry of cases) own.offense.find(group => group.slot === entry.slot).players[0].stats = entry.stats;
  await open(page, data);
  for (const entry of cases) {
    const player = playerAt(page, entry.slot); await player.click();
    await expect(page.locator("dialog .player-stat .rank")).toHaveText(entry.labels);
    expect(await page.locator("dialog").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (entry.slot === 11) await page.screenshot({path:info.outputPath("player-rank-scopes.png")});
    await close(page, player);
  }
});

test("nothing to report leaves just the player's name and position", async ({page}) => {
  await open(page);
  const rb = playerAt(page, 2);
  await rb.click();
  await expect(page.locator("#popup-content")).toHaveText("rb-ARI · RB");
  await expect(page.locator("dialog ol, dialog .player-stats, dialog .status-mark")).toHaveCount(0);
  await expectNoOldRows(page);
  await close(page, rb);
  // A team without a report also gets no per-player absence message.
  await page.locator("#week").selectOption("3");
  const unknown = ownField(page).locator(".player").first();
  await unknown.click();
  await expect(page.locator("#popup-content")).toHaveText("qb-ARI · QB");
  await expectNoOldRows(page);
});

test("only the five report statuses are marked; bodies remain available without a badge", async ({page}, info) => {
  const data = playerFeed(), own = data.weeks[0].teams.ARI;
  const cases = [
    [injury("Out", "Limited Participation in Practice", ["OUT", "LP"]), "OUT", "Out", true],
    [injury("Doubtful", "Not listed", ["D"]), "D", "Doubtful", true],
    [injury("Questionable", "Not listed", ["Q"]), "Q", "Questionable", true],
    [injury("Not listed", "Did Not Participate In Practice", ["DNP"]), "DNP", "Did not practice", false],
    [injury("Not listed", "Limited Participation in Practice", ["LP"]), "LP", "Limited in practice", false],
    [injury("Not listed", "Full Participation in Practice", []), null, null, false],
    [injury(), null, null, false],
  ];
  for (const [i, [report]] of cases.entries()) {
    const group = own.offense[i];
    group.players[0].injury = report;
    delete group.players[0].stats; delete group.players[0].star;
    if (group.players.length === 1) group.players.push({id:`gsis:reserve-${i}`,name:`reserve-${i}`,order:2,injury:null});
  }
  await open(page, data);
  for (const [i, [, code, label, hasBackups]] of cases.entries()) {
    const player = playerAt(page, i + 1);
    if (code) await expect(player.locator(".status-mark")).toHaveText(code);
    else { await expect(player.locator(".status-mark")).toHaveCount(0); await expect(player).toHaveClass("player"); }
    await expect(player).toHaveAttribute("aria-label", /Ankle/);
    await expect(player).toHaveAttribute("title", /Ankle/);
    await player.click();
    await expect(page.locator("dialog")).toContainText("Ankle");
    if (label) await expect(page.locator("dialog")).toContainText(label);
    await expect(page.locator("dialog h3").filter({hasText:"Next on the depth chart"})).toHaveCount(hasBackups ? 1 : 0);
    await expectNoOldRows(page);
    await close(page, player);
  }
  await page.emulateMedia({forcedColors:"active"});
  for (let i = 0; i < 5; i++) await expect(playerAt(page, i + 1).locator(".status-mark")).toBeVisible();
  await page.screenshot({path:info.outputPath("player-status-forced-colors.png")});
});

test("injury detail follows card width, clips long bodies and stays available to assistive technology", async ({page}, info) => {
  const data = playerFeed(), longBody = "Left knee, right shoulder, elbow, hamstring and lower back";
  data.weeks[0].teams.ARI.offense[0].players[0].injury.injury = longBody;
  data.weeks[0].teams.ARI.offense[1].players[0].injury = injury("Questionable", "Not listed", ["Q"], "Knee");
  await open(page, data);
  const qb = playerAt(page, 1), rb = playerAt(page, 2);
  await expect(qb).toHaveAttribute("aria-label", new RegExp(`Questionable.*${longBody}`));
  await expect(qb).toHaveAttribute("title", new RegExp(longBody));
  const renderedBody = player => player.evaluate(el => {
    const body = el.querySelector(".injury-body"), box = body.getBoundingClientRect();
    if (getComputedStyle(body).display === "none" || !box.width || !box.height) return false;
    let left = box.left, right = box.right, top = box.top, bottom = box.bottom;
    for (let ancestor = body.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if ([style.overflowX, style.overflowY].some(value => ["hidden", "clip", "auto", "scroll"].includes(value))) {
        const clip = ancestor.getBoundingClientRect();
        left = Math.max(left, clip.left); right = Math.min(right, clip.right);
        top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom);
      }
    }
    return right - left > 1 && bottom - top > 1;
  });
  const geometry = await qb.evaluate(el => {
    const box = el.getBoundingClientRect();
    return {width:box.width,height:box.height,name:getComputedStyle(el.querySelector(".player-name")).display};
  });
  if (geometry.name === "none") {
    expect(geometry.width).toBeCloseTo(40, 3); expect(geometry.height).toBeCloseTo(40, 3);
    await expect(qb).toHaveCSS("width", "40px"); await expect(qb).toHaveCSS("height", "40px");
    expect(await renderedBody(qb)).toBe(false);
  }
  await expect(qb.locator(".status-mark")).toBeVisible();
  if (page.viewportSize().width >= 600) {
    const card = page.getByRole("article", {name:"ARI offense",exact:true});
    await card.evaluate(el => el.style.width="700px");
    expect(await renderedBody(qb)).toBe(false);
    expect(await renderedBody(rb)).toBe(true);
    await card.evaluate(el => el.style.width="300px");
    expect(await renderedBody(rb)).toBe(false);
    expect((await rb.boundingBox()).width).toBe(40);
  }
  await qb.click(); await expect(page.locator("dialog")).toContainText(longBody);
  await page.screenshot({path:info.outputPath("player-long-body-popup.png")});
});

test("defensive popup preserves fractional values and multiple star-earning metrics", async ({page}) => {
  const data = playerFeed(), defender = data.weeks[0].teams.ARI.defense[0].players[0];
  defender.star = true;
  defender.stats = {tackles:{value:31,rank:9,star:true},sacks:{value:3.5,rank:7,tied:true,star:true},interceptions:{value:0,rank:34,tied:true}};
  await open(page, data);
  await page.locator("#defense").click();
  const field = page.viewportSize().width < 600 ? page.locator("#wallet-view .field-half").first() : page.getByRole("article", {name:"ARI defense",exact:true}).locator(".field-half");
  await field.locator('.player[data-slot="1"]').click();
  const stats = page.locator("dialog .player-stats");
  await expect(stats.locator(".player-stat")).toHaveCount(3);
  await expect(stats.locator(".player-stat").filter({hasText:"Tackles"})).toContainText("31");
  const sacks = stats.locator(".player-stat").filter({hasText:"Sacks"});
  await expect(sacks).toContainText("3.5");
  await expect(sacks).toContainText("Tied 7th among defenders");
  const interceptions = stats.locator(".player-stat").filter({hasText:"Interceptions"});
  await expect(interceptions).toContainText("0");
  await expect(interceptions).toContainText("Tied 34th among defenders");
  await expect(interceptions).not.toContainText("★");
  await expect(stats.locator(".star-stat")).toHaveCount(2);
  await expectNoOldRows(page);
});
