import { test, expect } from "@playwright/test";
import { fixture } from "../fixture.mjs";

const data = fixture();
const cards = page => page.locator("#cards");
const strips = page => page.locator("#cards > .card > .wallet-strip");

async function open(page) {
  await page.route("**/*", async route => {
    expect(new URL(route.request().url()).hostname).toBe("127.0.0.1");
    if (route.request().url().endsWith("/current.json")) await route.fulfill({json:data});
    else await route.continue();
  });
  await page.clock.install({time:new Date("2026-09-10T18:00:00Z")});
  await page.goto("/");
  await expect(page.locator("#week")).toBeEnabled();
  await expect(page.locator("main")).not.toContainText("No injury report yet");
  await page.locator("#week").selectOption("1");
  await expect(strips(page)).toHaveCount(32);
}
async function scrollStack(page, top) {
  await cards(page).evaluate((el, top) => { el.scrollTop = top; }, top);
  // Scroll timelines are sampled while rendering, after the scroll offset changes.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function reveal(page, index) {
  await strips(page).nth(index).evaluate(el => {
    const container = el.closest("#cards");
    let offset = parseFloat(getComputedStyle(container).paddingTop) || 0;
    for (const article of container.children) {
      const css = getComputedStyle(article);
      offset += parseFloat(css.marginTop) || 0;
      if (article.contains(el)) break;
      offset += article.offsetHeight + (parseFloat(css.marginBottom) || 0);
    }
    container.scrollTop = Math.max(0, offset - container.clientHeight / 3);
  });
}
async function documentPosition(page) {
  return page.evaluate(() => ({x:scrollX, y:scrollY, document:document.scrollingElement.scrollTop}));
}
async function appearance(locator) {
  return locator.evaluate(el => {
    const css = getComputedStyle(el);
    const scale = css.scale !== "none" ? parseFloat(css.scale)
      : css.transform !== "none" ? new DOMMatrix(css.transform).a : 1;
    return {opacity:Number(css.opacity), scale};
  });
}

test("the native stack scrolls under a pinned header and never chains to the page", async ({page}, info) => {
  await open(page);
  const header = await page.locator("header").boundingBox();
  const region = await cards(page).boundingBox();
  expect(region.height).toBeGreaterThan(100);
  expect(region.y).toBeGreaterThanOrEqual(header.y + header.height);
  await expect(cards(page)).toHaveCSS("overflow-y", "auto");
  expect(await cards(page).evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.mouse.move(region.x + region.width / 2, region.y + region.height / 2);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => cards(page).evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await documentPosition(page)).toEqual({x:0, y:0, document:0});
  expect(await page.locator("header").boundingBox()).toEqual(header);
  await page.screenshot({path:info.outputPath("native-scrolling-header.png")});
  await scrollStack(page, 100000);
  const end = await cards(page).evaluate(el => el.scrollTop);
  await page.mouse.wheel(0, 700);
  await expect.poll(() => cards(page).evaluate(el => el.scrollTop)).toBe(end);
  expect(await documentPosition(page)).toEqual({x:0, y:0, document:0});
  expect(await page.locator("header").boundingBox()).toEqual(header);
});

test("an actual touch drag scrolls the stack without lifting a strip", async ({page, browserName}) => {
  test.skip(browserName !== "chromium", "CDP dispatch checks Chromium touch input; supplemental engines use native wheel and layout checks.");
  await open(page);
  const box = await cards(page).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height * .8;
  const distance = Math.min(240, box.height * .5);
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {type:"touchStart", touchPoints:[{x,y}]});
  for (let step = 1; step <= 8; step++) {
    await session.send("Input.dispatchTouchEvent", {type:"touchMove", touchPoints:[{x,y:y - distance * step / 8}]});
    await page.waitForTimeout(16);
  }
  await session.send("Input.dispatchTouchEvent", {type:"touchEnd", touchPoints:[]});
  await session.detach();
  await expect.poll(() => cards(page).evaluate(el => el.scrollTop)).toBeGreaterThan(30);
  await expect(page).not.toHaveURL(/#team=/);
  await expect(page.locator("dialog")).toBeHidden();
  expect(await documentPosition(page)).toEqual({x:0, y:0, document:0});
});

test("sticky strips have capped increasing offsets, later paint order and unclipped ancestors", async ({page}, info) => {
  await open(page);
  const styles = await page.locator("#cards > .card").evaluateAll(els => els.map(el => {
    const css = getComputedStyle(el);
    return {position:css.position, top:parseFloat(css.top), z:Number(css.zIndex)};
  }));
  expect(styles.map(s => s.position)).toEqual(Array(32).fill("sticky"));
  expect(styles[0].top).toBe(0);
  for (let i = 1; i < styles.length; i++) {
    expect(styles[i].top).toBeGreaterThanOrEqual(styles[i - 1].top);
    expect(styles[i].top).toBeLessThanOrEqual(32);
    expect(styles[i].z).toBeGreaterThan(styles[i - 1].z);
  }
  expect(styles[1].top).toBeGreaterThan(styles[0].top);
  expect(styles.at(-1).top).toBe(styles.at(-2).top);
  const ancestors = await strips(page).first().evaluate(el => {
    const result = [];
    for (let node = el.parentElement; node; node = node.parentElement) {
      const css = getComputedStyle(node);
      result.push({node:node.id || node.tagName, x:css.overflowX, y:css.overflowY});
    }
    return result;
  });
  for (const ancestor of ancestors) {
    expect(["hidden", "clip"], `${ancestor.node} overflow-x`).not.toContain(ancestor.x);
    expect(["hidden", "clip"], `${ancestor.node} overflow-y`).not.toContain(ancestor.y);
  }
  await scrollStack(page, 700);
  const overlap = await page.locator("#cards > .card").evaluateAll(els => {
    const before = els[0].getBoundingClientRect(), after = els[1].getBoundingClientRect();
    const x = Math.max(before.left, after.left) + Math.min(before.width, after.width) / 2;
    const y = Math.max(before.top, after.top) + 1;
    return {overlaps:y < Math.min(before.bottom, after.bottom), team:document.elementFromPoint(x, y)?.closest("article")?.dataset.team,
      later:els[1].dataset.team};
  });
  expect(overlap.overlaps).toBe(true); expect(overlap.team).toBe(overlap.later);
  await page.screenshot({path:info.outputPath("native-sticky-stack.png")});
});

test("the Status key remains visible above deeply scrolled sticky strips", async ({page}, info) => {
  await open(page);
  await scrollStack(page, 1300);
  const position = await cards(page).evaluate(el => el.scrollTop);
  await page.locator("#status-key summary").click();
  const key = page.locator("#status-key-list");
  await expect(key).toBeVisible();
  const rows = key.locator("li");
  await expect(rows).toHaveText(["OUT","D","Q","DNP","LP"]);
  for (const name of ["Out","Doubtful","Questionable","Did not practice","Limited in practice"])
    await expect(key.getByRole("img",{name,exact:true})).toBeVisible();
  for (const row of await rows.all()) {
    expect(await row.evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && el.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
    })).toBe(true);
  }
  expect(await cards(page).evaluate(el => el.scrollTop)).toBe(position);
  expect(await documentPosition(page)).toEqual({x:0, y:0, document:0});
  await page.screenshot({path:info.outputPath("native-status-key.png")});
});

test("tapping an exposed sticky edge lifts that team and Back restores the exact stack offset", async ({page}) => {
  await open(page);
  await scrollStack(page, 700);
  const first = strips(page).first(), team = await first.getAttribute("data-team");
  const position = await cards(page).evaluate(el => el.scrollTop);
  const point = await first.evaluate(el => {
    const box = el.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + 1;
    return {x, y, exposed:el.contains(document.elementFromPoint(x, y))};
  });
  expect(point.exposed, "the first strip has a tappable edge above the later sticky strips").toBe(true);
  await page.touchscreen.tap(point.x, point.y);
  await expect(page).toHaveURL(new RegExp(`#team=${team}$`));
  await expect(page.locator("#wallet-view .wallet-strip")).toHaveAttribute("data-team", team);
  await page.goBack();
  await expect(cards(page)).toBeVisible();
  await expect.poll(() => cards(page).evaluate(el => el.scrollTop)).toBeCloseTo(position, 0);
  await expect.poll(() => page.evaluate(team => {
    const active = document.activeElement;
    if (active.id === "cards") return true;
    if (!active.matches(`.wallet-strip[data-team="${team}"]`)) return false;
    const box = active.getBoundingClientRect(), port = active.closest("#cards").getBoundingClientRect();
    const y = box.top + box.height / 2;
    return y >= port.top && y <= port.bottom && active.contains(document.elementFromPoint(box.left + box.width / 2, y));
  }, team)).toBe(true);
  expect(await documentPosition(page)).toEqual({x:0, y:0, document:0});
});

test("supported scroll timelines shrink and dim strips as they join the pile", async ({page}) => {
  await page.emulateMedia({reducedMotion:"no-preference"});
  await open(page);
  test.skip(!await page.evaluate(() => CSS.supports("animation-timeline: scroll()") && CSS.supports("animation-range: 0px 60px")), "This engine keeps the static native sticky stack without scroll-animation support.");
  const strip = strips(page).first();
  await expect.poll(() => appearance(strip)).toEqual({opacity:1, scale:1});
  await scrollStack(page, 90);
  await expect.poll(async () => (await appearance(strip)).opacity).toBeLessThanOrEqual(.73);
  await expect.poll(async () => (await appearance(strip)).scale).toBeLessThanOrEqual(.961);
  await scrollStack(page, 0);
  await expect.poll(() => appearance(strip)).toEqual({opacity:1, scale:1});
});

test("reduced motion keeps the sticky stack static while native scrolling works", async ({page}) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  await open(page);
  const strip = strips(page).first();
  expect(await appearance(strip)).toEqual({opacity:1, scale:1});
  await scrollStack(page, 300);
  expect(await cards(page).evaluate(el => el.scrollTop)).toBe(300);
  expect(await appearance(strip)).toEqual({opacity:1, scale:1});
  await expect(strip).toHaveCSS("animation-name", "none");
});

test("the skip link focuses the active native scroll region", async ({page}) => {
  await open(page);
  const header = await page.locator("header").boundingBox();
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(cards(page)).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect.poll(() => cards(page).evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await documentPosition(page)).toEqual({x:0, y:0, document:0});
  expect(await page.locator("header").boundingBox()).toEqual(header);
  await reveal(page, 4);
  const strip = strips(page).nth(4), team = await strip.getAttribute("data-team");
  await strip.click();
  await expect(page).toHaveURL(new RegExp(`#team=${team}$`));
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#wallet-scroll")).toBeFocused();
  expect(await documentPosition(page)).toEqual({x:0, y:0, document:0});
  await page.locator("#wallet-pile").tap();
  await expect(cards(page)).toBeVisible();
  await expect(page).not.toHaveURL(/#team=/);
  expect(await documentPosition(page)).toEqual({x:0, y:0, document:0});
});

test("keyboard focus reveals covered strips instead of leaving focus under the pile", async ({page}) => {
  await open(page);
  await scrollStack(page, 1200);
  await strips(page).first().focus();
  for (let i = 0; i < 24; i++) {
    const current = strips(page).nth(i);
    await expect(current).toBeFocused();
    await expect.poll(() => current.evaluate(el => {
      const box = el.getBoundingClientRect(), region = el.closest("#cards").getBoundingClientRect();
      const y = box.top + box.height / 2;
      return y >= region.top && y <= region.bottom && el.contains(document.elementFromPoint(box.left + box.width / 2, y));
    })).toBe(true);
    await page.keyboard.press("Tab");
  }
  expect(await documentPosition(page)).toEqual({x:0, y:0, document:0});
});

test("deep stack positions survive lift and Back after sort, unit, week and Compare changes", async ({page}) => {
  await open(page);
  await page.locator("#sort").click();
  await page.locator('[data-sort="record"]').click();
  await page.locator('[data-direction="worst"]').click();
  await page.keyboard.press("Escape");
  await page.locator("#defense").click();
  await page.locator("#week").selectOption("2");
  await page.locator("#compare").click();
  for (const team of ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC"])
    await page.locator(`.compare-options [data-team="${team}"]`).click();
  await page.keyboard.press("Escape");
  await expect(strips(page)).toHaveCount(16);
  const index = 14;
  await reveal(page, index);
  const strip = strips(page).nth(index), team = await strip.getAttribute("data-team");
  const position = await cards(page).evaluate(el => el.scrollTop);
  expect(position).toBeGreaterThan(0);
  await strip.click();
  await expect(page).toHaveURL(new RegExp(`#team=${team}$`));
  await expect(page.locator("#wallet-view")).toBeVisible();
  await expect(page.locator("#wallet-view .field-half").first()).toHaveClass("field-half defense");
  await page.goBack();
  await expect(cards(page)).toBeVisible();
  await expect.poll(() => cards(page).evaluate(el => el.scrollTop)).toBeCloseTo(position, 0);
  await expect(page.locator(`#cards .wallet-strip[data-team="${team}"]`)).toBeFocused();
  expect(await documentPosition(page)).toEqual({x:0, y:0, document:0});
});

test("320px has no horizontal page overflow, and 599px to 600px changes the scroll owner", async ({page}) => {
  await page.setViewportSize({width:320, height:760});
  await open(page);
  await scrollStack(page, 900);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({width:599, height:900});
  await expect(cards(page)).toHaveCSS("overflow-y", "auto");
  await expect(page.locator("body")).toHaveCSS("position", "fixed");
  await page.setViewportSize({width:600, height:900});
  await expect(page.locator("body")).not.toHaveCSS("position", "fixed");
  await expect(cards(page)).toHaveCSS("display", "grid");
  await expect(page.locator("#cards .player").first()).toBeVisible();
  await expect(page.locator("#cards .wallet-strip:visible")).toHaveCount(0);
});
