import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { fieldFixture, selectedIds } from "./field-fixture.mjs";
import { defenseFixture, leaderId, STATS_NOW } from "../fixtures/defense-stats.mjs";
import { validateFeed } from "../../web/feed.mjs";

async function setup(page, count = 2, missing = false) {
  const errors = [], external = [], { data, feed: window } = defenseFixture();
  let feed = JSON.parse(JSON.stringify(fieldFixture({ week: 2 })).replaceAll('gsis:fixture-out', leaderId));
  feed.schedule.coverage = "complete";
  feed.weeks.unshift({ ...feed.weeks[0], key: '2026-REG-1', label: 'Week 1', week: 1,
    starts_at: '2026-09-01T04:00:00Z', ends_at: '2026-09-08T04:00:00Z' });
  feed.games.unshift(...window.games.filter(game => game.week_key === '2026-REG-1'));
  feed = validateFeed(feed, Date.parse(STATS_NOW));
  const coaching = JSON.parse(readFileSync(new URL('../../web/coordinators.json', import.meta.url), 'utf8'));
  const reset = value => { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { if (key === 'checked_at') value[key] = STATS_NOW; else reset(child); } };
  reset(coaching);
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date(STATS_NOW));
  await page.addInitScript(ids => localStorage.setItem('sideline.selected.v2', JSON.stringify(ids)), selectedIds(count));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:8787') { external.push(url.origin); return route.abort(); }
    if (url.pathname === '/current.json') return route.fulfill({ json: feed });
    if (url.pathname === '/defense-stats.json') return missing ? route.fulfill({status:404}) : route.fulfill({ json: data });
    if (url.pathname === '/coordinators.json') return route.fulfill({json:coaching});
    if (/\/(?:contributions(?:-2024)?|injury-history|player-history|coordinators)\.json$/.test(url.pathname)) return route.fulfill({status:404});
    return route.continue();
  });
  await page.goto('/');
  await expect(page.locator('#week')).toHaveValue('2026-REG-2');
  return { errors, external };
}

test('defensive header pairs, accessible top-10 star and multiple leader totals fit two and six tiles', async ({page}, testInfo) => {
  const { errors, external } = await setup(page);
  const card = page.locator('.player-card').first();
  await expect(card.locator('.defense-metric')).toHaveCount(3);
  await expect(card.locator('.defense-metrics')).toHaveAttribute('aria-label', /through week 1, 1 recorded games/);
  await expect(card.locator('.defense-metric').nth(0)).toHaveText('205.0 YPG#6');
  const marker = card.locator(`.defender-marker[data-defender-id="${leaderId}"]`);
  await expect(marker.locator('.leader-star')).toHaveText('★');
  await expect(marker).toHaveAttribute('aria-label', /League top 10.*Combined tackles.*Sacks.*Interceptions/);
  // Existing hover preview and click/tap detail use the same qualifying facts.
  if (!testInfo.project.name.includes('mobile')) {
    await marker.hover();
    await expect(page.locator('.popover')).toContainText('Combined tackles');
    await expect(page.locator('.popover')).toContainText('Interceptions');
  }
  await marker.click();
  await expect(page.locator('.popover')).toContainText('2026 REG · through week 1');
  await expect(page.locator('.popover')).toContainText('T#8 · 28');
  await expect(page.locator('.popover')).toContainText('Recorded teams');
  await page.keyboard.press('Escape');
  await marker.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.popover')).toContainText('Combined tackles');
  await page.keyboard.press('Escape');
  await card.locator('.report-info').click();
  await expect(page.locator('.popover')).toContainText('Interceptions + opponent fumbles recovered');
  await expect(page.locator('.popover')).toContainText('Reconstructed with current source corrections');
  await page.keyboard.press('Escape');
  const assertGeometry = async () => {
    const boxes = await card.locator('.opponent-info, .defense-metrics, .report-info').evaluateAll(nodes => nodes.map(node => {const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
    expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].left);
    expect(boxes[1].right).toBeLessThanOrEqual(boxes[2].left);
    const clipping = await card.locator('.defense-metrics, .defense-metric').evaluateAll(nodes => nodes.some(n => n.scrollWidth > n.clientWidth + 1));
    expect(clipping).toBe(false);
  };
  await assertGeometry();
  await page.screenshot({path:testInfo.outputPath('defense-two-tiles.png')});
  for (let index=2; index<6; index++) {
    await page.locator('#search').fill(['Browser Fixture Three','Browser Fixture Four','Browser Fixture Five','Browser Fixture Six'][index-2]);
    await page.locator('#search-results button').first().click();
  }
  await expect(page.locator('.player-card')).toHaveCount(6);
  if (testInfo.project.name.includes('mobile')) await page.setViewportSize({width:320,height:740});
  await expect(card.locator('.coordinator-context')).toBeVisible();
  await assertGeometry();
  await page.screenshot({path:testInfo.outputPath('defense-six-tiles.png')});
  await page.locator('#week').selectOption('2026-REG-1');
  await expect(page.locator('.leader-star')).toHaveCount(0);
  await expect(page.locator('.defense-metrics').first()).toHaveAttribute('aria-label', /No prior regular-season games/);
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test('missing defensive statistics keep roster usable without false ranks or stars', async ({page}) => {
  const {errors} = await setup(page, 2, true);
  await expect(page.locator('.leader-star')).toHaveCount(0);
  await expect(page.locator('.defense-metric').first()).toHaveAttribute('aria-label', /unavailable/);
  await expect(page.locator('.defense-field').first()).toBeVisible();
  expect(errors).toEqual([]);
});
