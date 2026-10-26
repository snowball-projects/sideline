import { test, expect } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { fieldFixture, NAMED_DEFENDERS, NOW, selectedIds } from './field-fixture.mjs';
import { defenseFixture, leaderId } from '../fixtures/defense-stats.mjs';
import { validateFeed } from '../../scripts/validate-feed.mjs';
const initial=[{team:'BUF',side:'opponent',unit:'defense',focusId:''},{team:'CAR',side:'own',unit:'defense',focusId:''}];
const tile=page=>page.locator('.team-card').first();
const popup=page=>page.locator('.popover[role=dialog]');
const unit=(card,label)=>card.getByRole('group',{name:/^Unit for/}).getByRole('button',{name:label,exact:true});
const side=(card,label)=>card.getByRole('group',{name:/^View for/}).getByRole('button',{name:label,exact:true});

function sourceFixture(){
 const feed=fieldFixture({defenders:NAMED_DEFENDERS});
 // Synthetic source-shaped BUF offense and injury evidence, never production.
 for(const [id,position] of [[selectedIds(1)[0],'QB'],[selectedIds(2)[1],'WR']]){
  const player=feed.players.find(player=>player.id===id);
  feed.depth.entries.push({player_id:id,team:'BUF',position,rank:1,name:player.name,observed_at:feed.generated_at,week_key:feed.weeks[0].key});
 }
 const quarterback=feed.players.find(player=>player.id===selectedIds(1)[0]);
 feed.reports.push({...feed.reports[0],team:"BUF",entries:[{id:quarterback.id,name:quarterback.name,position:"QB",injury:"Shoulder",game_status:"Questionable",practice_status:"Limited",roster_status:"active",status_source:"official"}]});
 return validateFeed(feed,Date.parse(NOW));
}
async function setup(page,{feed=sourceFixture(),cards=initial,stats=null,now=NOW}={}){
 const errors=[],external=[];page.on('pageerror',error=>errors.push(error.message));
 await page.clock.setFixedTime(new Date(now));
 await page.addInitScript(cards=>localStorage.setItem('sideline.teams.v1',JSON.stringify(cards)),cards);
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='http://127.0.0.1:8787'){external.push(url.href);return route.abort();}
  if(url.pathname==='/current.json')return route.fulfill({json:feed});
  if(url.pathname==='/defense-stats.json')return stats?route.fulfill({json:stats}):route.fulfill({status:404});
  if(/\/(?:contributions(?:-2024)?|injury-history|player-history|coordinators)\.json$/.test(url.pathname))return route.fulfill({status:404});
  return route.continue();
 });
 await page.goto('/');await expect(page.locator('.team-card')).toHaveCount(cards.length);
 return {errors,external,feed};
}
async function fits(page){
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
 expect(overflow).toBe(false);
 for(const card of await page.locator('.team-card').all()){
  const clipped=await card.locator('.card-switch button,.defender-name').evaluateAll(nodes=>nodes.some(node=>node.scrollWidth>node.clientWidth+1));
  expect(clipped).toBe(false);
 }
}
async function screenshot(page,testInfo,name){
 const path=testInfo.outputPath(name+'.png');await page.screenshot({path,fullPage:true});
 await testInfo.attach(name+' · rendered with synthetic source data',{path,contentType:'image/png'});
}

test('each card retains both independent switches across units, views, weeks and refresh',async({page})=>{
 const {errors,external}=await setup(page);let first=tile(page),second=page.locator('.team-card').nth(1);
 await expect(first.locator('h2')).toHaveText('Carolina Panthers');
 await unit(first,'Offense').click();await expect(unit(first,'Offense')).toHaveAttribute('aria-pressed','true');
 await expect(unit(second,'Defense')).toHaveAttribute('aria-pressed','true');
 await expect(first.locator('.injury-name')).toContainText(['Offense Fixture Excluded']);
 await side(first,'Own team').click();await expect(first.locator('h2')).toHaveText('Buffalo Bills');
 await expect(first.locator('.injury-name')).toContainText(['Browser Fixture One','Browser Fixture Two']);
 await page.locator('#week').selectOption('2026-REG-2');
 await expect(unit(first,'Offense')).toHaveAttribute('aria-pressed','true');await expect(side(first,'Own team')).toHaveAttribute('aria-pressed','true');
 await page.locator('#refresh').click();await expect(page.locator('#refresh-state')).not.toContainText('Checking');
 await expect(side(first,'Own team')).toHaveAttribute('aria-pressed','true');
 expect(errors).toEqual([]);expect(external).toEqual([]);
});

test('team and player search open team cards; player focus is separate and never duplicates a team',async({page})=>{
 const {errors}=await setup(page,{cards:[]});
 await page.locator('#search').fill('Buffalo');await page.getByRole('button',{name:'Open Buffalo Bills team'}).click();
 await expect(page.locator('.team-card')).toHaveCount(1);await expect(side(tile(page),'Own team')).toHaveAttribute('aria-pressed','true');
 await expect(tile(page).getByRole('combobox',{name:'Player focus for BUF'})).toHaveValue('');
 await page.locator('#search').fill('Browser Fixture One');await page.getByRole('button',{name:/^Focus Browser Fixture One/}).click();
 await expect(page.locator('.team-card')).toHaveCount(1);await expect(tile(page).getByRole('combobox',{name:'Player focus for BUF'})).toHaveValue(selectedIds(1)[0]);
 await side(tile(page),'Opponent').click();await expect(tile(page).locator('.player-relevant')).not.toHaveCount(0);
 await unit(tile(page),'Offense').click();await side(tile(page),'Own team').click();
 await expect(tile(page).locator('.injury-row.player-focused')).toContainText('Browser Fixture One');
 await tile(page).getByRole('combobox',{name:'Player focus for BUF'}).selectOption('');
 await expect(tile(page).locator('.player-focused,.player-relevant')).toHaveCount(0);expect(errors).toEqual([]);
});

test('named first depth and injuries are combined, including old observed charts; all data sections show dates',async({page},testInfo)=>{
 const {errors}=await setup(page);const first=tile(page);
 const row=first.locator('.injury-row').filter({hasText:"Avery O'Malley-Smith-Williams"});
 await expect(row).toContainText('1st');await expect(row).toContainText('OUT');
 await expect(first.locator('.defender-marker')).toHaveCount(11);
 await expect(first.locator('.field-wrap .as-of').first()).toContainText('as of Sep 13, 2026');
 await expect(first.locator('.depth-panel')).toContainText('Injuries · as of Sep 13, 2026');
 await expect(first.locator('.team-matchup')).toContainText('Schedule · as of Sep 13, 2026');
 await page.clock.setFixedTime(new Date('2026-09-14T16:00:00Z'));
 await page.locator('#refresh').click();await expect(first.locator('.defender-marker')).toHaveCount(11);
 await first.getByRole('combobox',{name:'Player focus for BUF'}).selectOption(selectedIds(1)[0]);
 const second=page.locator('.team-card').nth(1);await unit(second,'Offense').click();await side(second,'Opponent').click();
 await screenshot(page,testInfo,'team-cards-'+testInfo.project.name);await fits(page);expect(errors).toEqual([]);
});

test('historical cards join named weekly starters and injuries without current roster facts',async({page})=>{
 const feed=sourceFixture();feed.players.find(player=>player.id==='gsis:fixture-out').team='DEN';
 const {errors}=await setup(page,{feed,now:'2026-09-21T12:00:00Z'});
 await page.locator('#week').selectOption('2026-REG-1');
 const row=tile(page).locator('.injury-row').filter({hasText:"Avery O'Malley-Smith-Williams"});
 await expect(row).toContainText('1st');await expect(row).toContainText('OUT');
 await expect(tile(page).locator('.defender-marker')).toHaveCount(11);
 await row.click();await expect(popup(page)).toContainText('Out');await expect(popup(page)).toContainText('as of');
 await page.keyboard.press('Escape');await expect(popup(page)).toHaveCount(0);expect(errors).toEqual([]);
});

test('before first report status stays visibly unknown and timing bubble states Wednesday',async({page},testInfo)=>{
 const feed=sourceFixture();feed.reports=[];
 const {errors}=await setup(page,{feed});
 await expect(tile(page).locator('.report-notice')).toHaveText('Injury status unknown');
 await expect(tile(page).locator('.injury-row .pill-status')).toHaveText(Array(14).fill('?'));
 await expect(tile(page).locator('.depth-panel')).not.toContainText(/healthy/i);
 await tile(page).getByRole('button',{name:'Injury report timing',exact:true}).click();
 await expect(popup(page).locator('p')).toHaveText('Injury reports usually arrive Wednesday.');
 const path=testInfo.outputPath('unknown-report.png');await page.screenshot({path});await testInfo.attach('Unknown before first report',{path,contentType:'image/png'});
 await page.keyboard.press('Escape');expect(errors).toEqual([]);
});

test('missing historic depth never invents named starters or copies current roster into that week',async({page})=>{
 const feed=sourceFixture();feed.depth.entries=[];
 const {errors}=await setup(page,{feed,now:'2026-09-21T12:00:00Z'});await page.locator('#week').selectOption('2026-REG-1');
 await expect(tile(page).locator('.starter-label')).toHaveCount(0);await expect(tile(page).locator('.defender-marker')).toHaveCount(0);
 await expect(tile(page).locator('.depth-panel')).toContainText('Avery');await expect(tile(page).locator('.field-wrap .as-of').first()).toContainText('as of unknown');
 expect(errors).toEqual([]);
});

function rankedFixture(){
 const {data,feed:window}=defenseFixture();
 let feed=JSON.parse(JSON.stringify(fieldFixture({week:2})).replaceAll('gsis:fixture-out',leaderId));
 feed.schedule.coverage='complete';
 feed.weeks.unshift({...feed.weeks[0],key:'2026-REG-1',label:'Week 1',week:1,starts_at:'2026-09-01T04:00:00Z',ends_at:'2026-09-08T04:00:00Z'});
 feed.games.unshift(...window.games.filter(game=>game.week_key==='2026-REG-1'));
 return {feed:validateFeed(feed,Date.parse(NOW)),stats:data};
}

test('last settled week keeps defense ranks and stars through settlement; absent statistics stay unknown',async({page})=>{
 const {feed,stats}=rankedFixture();
 const selected=feed.games.find(game=>game.week_key==='2026-REG-2');selected.kickoff='2026-09-13T01:00:00Z';
 const {errors}=await setup(page,{feed,stats});
 await page.locator('#week').selectOption('2026-REG-3');
 await expect(tile(page).locator('.stats-window')).toContainText('Last settled');
 await expect(tile(page).locator('.stats-window')).toContainText('through week 1');
 await expect(tile(page).locator('.metric-rank').first()).not.toHaveText('—');
 // The rank window is preserved even when selected-week roster/depth coverage is absent.
 await page.locator('#week').selectOption('2026-REG-2');
 await expect(tile(page).locator('.leader-star')).not.toHaveCount(0);
 await page.route('**/defense-stats.json',route=>route.fulfill({status:503}));await page.locator('#refresh').click();
 await expect(tile(page).locator('.metric-rank').first()).not.toHaveText('—');
 expect(errors).toEqual([]);
});

test('filters, keyboard details and interrupted refresh retain working injury flows',async({page})=>{
 const {errors}=await setup(page);const first=tile(page);
 await first.getByRole('button',{name:'Out',exact:true}).click();await expect(first.locator('.injury-row')).toHaveCount(2);
 const row=first.locator('.injury-row').first();await row.focus();await page.keyboard.press('Enter');
 await expect(popup(page)).toBeVisible();await expect(popup(page)).toContainText('Game');
 await page.keyboard.press('Escape');await expect(popup(page)).toHaveCount(0);
 await first.getByRole('button',{name:'Uncertain',exact:true}).click();await expect(first.locator('.injury-row')).toHaveCount(5);
 await page.route('**/current.json',route=>route.fulfill({status:503}));await page.locator('#refresh').click();
 await expect(page.locator('#refresh-state')).toContainText('previous data kept');await expect(first.locator('.injury-row')).toHaveCount(5);
 expect(errors).toEqual([]);
});

test('desktop and 320px mobile keep named targets, controls and popovers in bounds',async({page,isMobile},testInfo)=>{
 const {errors}=await setup(page);
 if(isMobile)await page.setViewportSize({width:320,height:740});
 await fits(page);
 const marker=tile(page).locator('.defender-marker').first();await marker.click();await expect(popup(page)).toBeVisible();
 const box=await popup(page).boundingBox(),viewport=page.viewportSize();
 expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width+1);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height+1);
 await page.keyboard.press('Escape');await screenshot(page,testInfo,'team-cards-narrow-'+testInfo.project.name);expect(errors).toEqual([]);
});

test('source information contains facts and dates without operating instructions; build excludes fixtures',async({page})=>{
 const {errors}=await setup(page);
 await page.getByRole('button',{name:'Sources and information'}).click();await expect(popup(page)).not.toContainText(/Hover or focus|click or tap|Choose up to|Use Tab/);
 await expect(popup(page)).toContainText('Collected');await page.keyboard.press('Escape');
 const entries=await readdir(new URL('../../dist/',import.meta.url),{recursive:true});expect(entries.some(entry=>/test|fixture|review|playwright/.test(entry))).toBe(false);
 const app=await readFile(new URL('../../dist/app.mjs',import.meta.url),'utf8');expect(app).not.toContain('readResponseText');expect(errors).toEqual([]);
});

test('own offense combines named source depth, injury and optional focus without claiming health',async({page})=>{
 const {errors}=await setup(page,{cards:[{team:'BUF',side:'own',unit:'offense',focusId:selectedIds(1)[0]}]});
 const first=tile(page),row=first.locator('.injury-row.player-focused');
 await expect(row).toContainText('Browser Fixture One');await expect(row).toContainText('1st');await expect(row).toContainText('Q');
 await row.focus();await page.keyboard.press('Enter');await expect(popup(page)).toContainText('Shoulder');await expect(popup(page)).toContainText('Limited');
 await expect(popup(page)).toContainText('as of');await page.keyboard.press('Escape');expect(errors).toEqual([]);
});

test('six team cards and cards with no schedule retain all local controls; team limit releases on removal',async({page})=>{
 const {errors}=await setup(page,{cards:[]});
 for(const team of ['BUF','CAR','CHI','DEN','MIA','NE']){
  await page.locator('#search').fill(team);await page.locator('#search-results button').first().click();
 }
 await expect(page.locator('.team-card')).toHaveCount(6);
 await expect(page.locator('.card-switch')).toHaveCount(12);
 await page.locator('#search').fill('NYJ');await expect(page.locator('#search-results button').first()).toBeDisabled();
 await page.getByRole('button',{name:'Remove NE',exact:true}).click();
 await page.locator('#search').fill('NYJ');await page.locator('#search-results button').first().click();
 const last=page.locator('[data-team="NYJ"]');await expect(last.locator('.card-switch')).toHaveCount(2);
 await side(last,'Opponent').click();await expect(last.locator('h2')).toHaveText('Opponent unknown');
 await expect(unit(last,'Defense')).toHaveAttribute('aria-pressed','true');expect(errors).toEqual([]);
});

test('background refresh waits for open player details, then updates without resetting card switches',async({page})=>{
 const {errors,feed}=await setup(page);
 const first=tile(page),row=first.locator('.injury-row').filter({hasText:"Avery O'Malley-Smith-Williams"});
 await row.click();await expect(popup(page)).toContainText('Out');
 const next=structuredClone(feed);next.generated_at='2026-09-13T12:00:01.000Z';
 next.reports.find(report=>report.team==='CAR').entries.find(entry=>entry.id==='gsis:fixture-out').game_status='Questionable';
 await page.clock.setFixedTime(new Date('2026-09-13T12:00:02.000Z'));
 await page.route('**/current.json',route=>route.fulfill({json:next}));
 // Trigger the same refresh path without scrolling the open dialog out of view.
 await page.locator('#refresh').evaluate(button=>button.click());
 await expect(page.locator('#refresh-state')).toContainText('Update pending');await expect(popup(page)).toContainText('Out');
 await page.keyboard.press('Escape');await page.locator('#refresh').focus();
 await expect(row.locator('.pill-status')).toHaveText('Q');
 await expect(side(first,'Opponent')).toHaveAttribute('aria-pressed','true');expect(errors).toEqual([]);
});
