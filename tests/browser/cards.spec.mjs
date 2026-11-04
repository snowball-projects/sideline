import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixture } from "../fixture.mjs";
const feed = fixture();
async function open(page, {data = feed, selections = [], week = 1} = {}) {
  const errors = [], requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    expect(new URL(route.request().url()).hostname).toBe("127.0.0.1");
    if (route.request().url().endsWith("/current.json")) { requests.push(route.request().url()); await route.fulfill({json:data}); }
    else await route.continue();
  });
  await page.clock.install({time:new Date("2026-09-10T18:00:00Z")});
  await page.addInitScript((value) => { if (!localStorage.getItem("sideline.compare")) localStorage.setItem("sideline.compare",JSON.stringify(value)); },selections);
  await page.goto("/"); await expect(page.locator("#week")).toBeEnabled();
  await page.locator("#week").selectOption(String(week));
  return {errors,requests};
}
async function chooseSort(page, value, direction) {
  await page.locator("#sort").click();
  await page.locator(`[data-sort="${value}"]`).click();
  if(direction) await page.locator(`[data-direction="${direction}"]`).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toBeHidden();
}
const cardFor = (page, team) => page.getByRole("article", {name:`${team} offense`,exact:true});
test("all teams, one selected unit, exact player target, popup and keyboard focus", async ({page},info) => {
  const {errors, requests} = await open(page);
  await expect(page.locator(".card")).toHaveCount(32);
  const card = cardFor(page,"ARI");
  await expect(card.locator(".player")).toHaveCount(11);
  await expect(card.locator(".opponent")).toHaveAttribute("aria-label","Opponent ATL");
  const qb = card.locator('.player[data-slot="1"]');
  await qb.focus(); await page.keyboard.press("Enter");
  await expect(page.locator("dialog")).toContainText("Knee");
  await expect(page.locator("dialog")).toContainText("backup-ARI");
  await page.keyboard.press("Escape"); await expect(qb).toBeFocused();
  const size = await qb.evaluate((el) => {const box=el.getBoundingClientRect(); return {width:box.width,height:box.height,name:getComputedStyle(el.querySelector(".player-name")).display};});
  if ((await card.boundingBox()).width >= 680) expect(size.name).not.toBe("none");
  else { expect(size.width).toBe(40); expect(size.height).toBe(40); expect(size.name).toBe("none"); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath("all-teams.png")});
  const visibility=await page.locator(".card").evaluateAll((cards)=>cards.map((card)=>card.getBoundingClientRect()).filter((b)=>b.top<innerHeight).map((b)=>({top:b.top,bottom:b.bottom,width:b.width,height:b.height,whole:b.bottom<=innerHeight})));
  console.log(`${info.project.name} visible cards: ${JSON.stringify(visibility)}`);
  expect(errors).toEqual([]); expect(requests).toHaveLength(1);
});
test("player representation follows card width rather than the viewport", async ({page}) => {
  await open(page,{selections:["ARI"]});
  const card=cardFor(page,"ARI"), player=card.locator(".player").first();
  await card.evaluate((el)=>el.style.width="300px");
  expect(await player.evaluate((el)=>getComputedStyle(el.querySelector(".player-name")).display)).toBe("none");
  expect(await player.evaluate((el)=>el.getBoundingClientRect().width)).toBe(40);
  await card.evaluate((el)=>el.style.width="700px");
  expect(await player.evaluate((el)=>getComputedStyle(el.querySelector(".player-name")).display)).not.toBe("none");
});
test("team pills apply immediately, persist more than six selections and clear", async ({page},info) => {
  await open(page);
  await page.locator("#compare").click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  const first=page.locator('.compare-options button[data-team="ARI"]');
  await first.focus(); await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-pressed","true");
  await expect(first.locator(".pill-check")).toBeVisible();
  await expect(page.locator(".card")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-pressed","false");
  await expect(page.locator(".card")).toHaveCount(32);
  for (const team of ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE"]) {
    const control=page.locator(`.compare-options button[data-team="${team}"]`);
    if(info.project.use.hasTouch) await control.tap(); else await control.click();
    await expect(control).toHaveAttribute("aria-pressed","true");
    await expect(control.locator("img")).toBeVisible();
  }
  await expect(page.locator(".card")).toHaveCount(8);
  await page.screenshot({path:info.outputPath("compare-pills.png")});
  await page.keyboard.press("Escape");
  await expect(page.locator(".card")).toHaveCount(8);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("sideline.compare")).length)).toBe(8);
  // Reload retains the user's current choices, without reapplying the init fixture.
  await page.evaluate(()=>location.reload()); await expect(page.locator("#week")).toBeEnabled();
  await expect(page.locator(".card")).toHaveCount(8);
  await page.locator("#clear-compare").click();
  await expect(page.locator(".card")).toHaveCount(32); await expect(page.locator("#compare")).toBeFocused();
});
test("global unit and stat sort, historical bye and unobserved weeks", async ({page}) => {
  await open(page,{selections:["ARI"],week:2});
  await expect(page.locator(".opponent")).toHaveText("Bye");
  await page.locator("#defense").click();
  await expect(page.locator(".defense-stats")).toContainText("Turnovers forced");
  await page.locator("#sort").click();
  await expect(page.locator('[role="group"][aria-label="Sort statistic"] .pill-label')).toHaveText(["Record","Points","Yards","Sacks","Turnovers"]);
  await page.keyboard.press("Escape");
  await chooseSort(page,"stat-0");
  await page.locator("#week").selectOption("4");
  await expect(page.locator(".field-empty")).toHaveCount(0);
  await expect(page.locator(".player")).toHaveCount(0);
  await page.locator("#week").selectOption("3");
  await expect(page.locator(".report-notice")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("No injury report yet");
  await expect(page.locator(".status-mark")).toHaveCount(0);
  await expect(page.locator(".player")).toHaveClass(["player","player","player"]);
});
test("record and stat sorts are best first, and keyboard opens the same team page", async ({page}) => {
  await open(page,{week:2});
  await expect(page.locator(".card").first()).toHaveAttribute("aria-label","ATL offense");
  await chooseSort(page,"stat-0");
  await expect(page.locator(".card").first()).toHaveAttribute("aria-label","WAS offense");
  const heading=page.locator(".card").first().getByRole("link");
  await heading.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".matchup .team-heading h2").first()).toHaveText("WAS");
  await page.locator(".skip-link").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await expect(page).toHaveURL(/#team=WAS$/);
  await page.getByRole("link",{name:"All teams",exact:true}).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#cards")).toBeVisible();
  await page.locator("#defense").click();
  await expect(page.locator(".card").first()).toHaveAttribute("aria-label","ATL defense");
});
test("full participation has no field badge, keeps its body part and gaps stay unavailable", async ({page}) => {
  const data=structuredClone(feed);
  data.weeks[0].teams.ARI.offense[0].players[0].injury={injury:"Ankle",game:"Not listed",practice:"Full Participation in Practice",badges:[]};
  data.weeks[1].stats_through=0; data.weeks[1].teams.ARI.stats=null;
  await open(page,{data,selections:["ARI"]});
  const player=cardFor(page,"ARI").locator('.player[data-slot="1"]');
  await expect(player).toHaveClass("player");
  await expect(player.locator(".status-mark")).toHaveCount(0);
  await player.click();
  await expect(page.locator("dialog")).toContainText("Ankle");
  await expect(page.locator("dialog")).not.toContainText("backup-ARI");
  await expect(page.locator("dialog")).not.toContainText("Full participation");
  await page.keyboard.press("Escape");
  await page.locator("#week").selectOption("2");
  await expect(page.locator("#message")).not.toContainText(/unavailable/i);
  await expect(page.locator(".rank")).toHaveText(["","","",""]);
});
test("card opens a team matchup, independent switch retains team sides and pills", async ({page},info) => {
  const {errors}=await open(page,{selections:["ARI"]});
  await cardFor(page,"ARI").getByRole("link",{name:"ARI",exact:true}).click();
  await expect(page.locator("#cards")).toBeHidden();
  await expect(page.locator(".matchup .team-heading h2")).toHaveText(["ARI","ATL"]);
  await expect(page.locator(".matchup .field-half")).toHaveClass(["field-half offense","field-half defense below"]);
  await page.locator("#team-view").getByRole("button",{name:"Defense",exact:true}).click();
  await expect(page.locator(".matchup .team-heading h2")).toHaveText(["ARI","ATL"]);
  await expect(page.locator(".matchup .field-half")).toHaveClass(["field-half defense","field-half offense below"]);
  expect(await page.locator(".matchup .player-name").first().evaluate((el)=>getComputedStyle(el).display)).not.toBe("none");
  await page.screenshot({path:info.outputPath("team-matchup.png")});
  await page.locator("#week").selectOption("2");
  await expect(page.locator(".matchup .field-half")).toHaveCount(1);
  await expect(page.locator(".bye")).toHaveText("Bye");
  await page.getByRole("link",{name:"All teams",exact:true}).click();
  await expect(page.locator(".card")).toHaveCount(1);
  expect(errors).toEqual([]);
});
test("source credits remain available and no external browser data calls", async ({page}) => {
  const {requests}=await open(page);
  await page.locator("#info").click();
  await expect(page.locator("dialog")).toContainText("nflverse data · CC BY 4.0");
  await expect(page.locator("dialog")).toContainText("no report publication dates");
  await page.getByRole("button",{name:"Close popup"}).click(); await expect(page.locator("#info")).toBeFocused();
  await page.clock.fastForward("00:12:00"); expect(requests).toHaveLength(1);
});
let real;
try { real=JSON.parse(await readFile(new URL("../../web/current.json",import.meta.url),"utf8")); } catch {}
test("real collected snapshot renders all observed slots and stars for both units", async ({page},info)=>{
  test.skip(!real,"CI uses synthetic source fixtures.");
  const {errors}=await open(page,{data:real,week:9});
  await expect(page.locator(".card")).toHaveCount(32);
  for (const side of ["offense","defense"]) {
    await page.locator(`#${side}`).click();
    const source=real.weeks.find((w)=>w.week===9);
    for (const team of Object.keys(real.teams)) {
      const card=page.getByRole("article",{name:`${real.teams[team].name} ${side}`,exact:true});
      await expect(card.locator(".player")).toHaveCount(source.teams[team][side].filter((group)=>side!=="offense"||group.position!=="FB").length);
      const problems=await card.locator(".field-half").evaluate((half)=>{
        const outer=half.getBoundingClientRect(), controls=[...half.querySelectorAll(".player,.player-unavailable")];
        const boxes=controls.map((el)=>el.getBoundingClientRect());
        return boxes.flatMap((box,i)=>{
          const issues=[];
          const label=controls[i].querySelector(".player-name");
          if(controls[i].classList.contains("player") && getComputedStyle(label).display!=="none" && label.scrollWidth>label.clientWidth+1) issues.push(`truncated ${label.textContent}`);
          if(box.left<outer.left || box.right>outer.right+1) issues.push(`outside slot ${controls[i].dataset.slot}`);
          for(let j=0;j<i;j++) if(Math.min(box.right,boxes[j].right)-Math.max(box.left,boxes[j].left)>1 && Math.min(box.bottom,boxes[j].bottom)-Math.max(box.top,boxes[j].top)>1) issues.push(`overlap ${i}/${j}`);
          return issues;
        });
      });
      expect(problems,`${team} ${side} player geometry`).toEqual([]);
    }
  }
  const philly=page.getByRole("article",{name:`${real.teams.PHI.name} defense`,exact:true});
  if(sourceMissingPhilly(real)) await expect(philly.locator(".player-unavailable")).toHaveAttribute("aria-hidden","true");
  await page.screenshot({path:info.outputPath("real-week9.png")});
  await page.locator("#compare").click();
  const teamPills=page.locator(".compare-options .choice-pill");
  await expect(teamPills).toHaveCount(32);
  const overflow=await teamPills.evaluateAll(pills=>pills.filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.textContent));
  expect(overflow).toEqual([]);
  await page.screenshot({path:info.outputPath("real-compare-pills.png")});
  await page.keyboard.press("Escape"); expect(errors).toEqual([]);
});

function sourceMissingPhilly(data) { const groups=data.weeks.find((w)=>w.week===9).teams.PHI.defense; return groups.length && !groups.some((g)=>g.slot===2); }

test("only report entries carry visible status codes; unlisted players stay plain", async ({page},info) => {
  const data=structuredClone(feed), own=data.weeks[0].teams.ARI;
  const values=[
    {badges:["OUT","LP"],game:"Out"}, {badges:["D"],game:"Doubtful"},
    {badges:["Q"],game:"Questionable"}, {badges:["DNP"],practice:"Did Not Participate In Practice"},
    {badges:["LP"],practice:"Limited Participation in Practice"},
    {badges:[],game:"Not listed",practice:"Full Participation in Practice"},
    null, {badges:[],game:"Not listed",practice:"Not listed"},
  ];
  values.forEach((injury,i)=>own.offense[i].players[0].injury=injury && {injury:"Ankle",game:"Not listed",practice:"Not listed",...injury});
  own.offense[0].players[0].star=true;
  await open(page,{data,selections:["ARI","ATL"]});
  for(const [i,code] of ["OUT","D","Q","DNP","LP",null,null,null].entries()) {
    const player=cardFor(page,"ARI").locator(`.player[data-slot="${i+1}"]`);
    if (code === null) {
      await expect(player.locator(".status-mark")).toHaveCount(0);
      await expect(player).toHaveClass("player");
      continue;
    }
    await expect(player.locator(".status-mark")).toBeVisible();
    await expect(player.locator(".status-mark")).toHaveText(code);
    const contrast=await player.evaluate((el)=>{
      const style=getComputedStyle(el);
      const lum=(color)=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((total,v,i)=>total+v*[.2126,.7152,.0722][i],0);
      const a=lum(style.color),b=lum(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    expect(contrast,`${code} text contrast`).toBeGreaterThanOrEqual(4.5);
    expect(await player.evaluate((el)=>{
      const box=el.getBoundingClientRect(), mark=el.querySelector(".status-mark").getBoundingClientRect();
      return mark.left>=box.left && mark.right<=box.right && mark.top>=box.top && mark.bottom<=box.bottom;
    })).toBe(true);
  }
  const unknown=cardFor(page,"ATL").locator(".player").first();
  await expect(unknown.locator(".status-mark")).toHaveCount(0);
  await expect(unknown).toHaveClass("player");
  await expect(unknown).toHaveCSS("background-color","rgb(25, 51, 45)");
  const unlisted=cardFor(page,"ARI").locator('.player[data-slot="7"]');
  await expect(unlisted).toHaveClass("player");
  await expect(unlisted).toHaveCSS("background-color","rgb(25, 51, 45)");
  const full=cardFor(page,"ARI").locator('.player[data-slot="6"]');
  await expect(full).toHaveClass("player");
  await expect(full).toHaveCSS("background-color","rgb(25, 51, 45)");
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.locator("#status-key summary").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#status-key-list")).toBeVisible();
  await expect(page.locator("#status-key-list li")).toHaveText(["OUT","D","Q","DNP","LP"]);
  for (const [status,label] of [["out","Out"],["doubtful","Doubtful"],["questionable","Questionable"],["dnp","Did not practice"],["limited","Limited in practice"]]) {
    const badge=page.locator("#status-key-list").getByRole("img",{name:label,exact:true});
    await expect(badge).toBeVisible();
    const colors=await cardFor(page,"ARI").locator(`.player.status-${status}`).evaluate(el=>{
      const css=getComputedStyle(el);return [css.color,css.backgroundColor,css.borderColor];
    });
    for (const [index,property] of ["color","background-color","border-color"].entries()) await expect(badge).toHaveCSS(property,colors[index]);
  }
  await page.screenshot({path:info.outputPath("status-key.png")});
  await page.keyboard.press("Enter");
  await expect(page.locator("#status-key-list")).toBeHidden();
  if(info.project.use.hasTouch) {
    await page.locator("#status-key summary").tap();
    await expect(page.locator("#status-key-list")).toBeVisible();
    await page.locator("#status-key summary").tap();
    await expect(page.locator("#status-key-list")).toBeHidden();
  }
});

test("matchup pages keep ordinary players unmarked and preserve their popup facts", async ({page}) => {
  await open(page,{selections:["ARI"]});
  await cardFor(page,"ARI").getByRole("link",{name:"ARI",exact:true}).click();
  const own=page.locator(".matchup .field-half").first(), other=page.locator(".matchup .field-half").last();
  await expect(own.locator(".status-mark")).toHaveText(["Q"]);
  await expect(other.locator(".status-mark")).toHaveCount(0);
  await expect(page.locator("#status-key-list")).not.toContainText("NL");
  await expect(page.locator("#status-key-list")).not.toContainText("No injury report");
  const normal=own.locator('.player[data-slot="2"]');
  await expect(normal).toHaveClass("player");
  await normal.click();
  await expect(page.locator("dialog h2")).toHaveText("rb-ARI · RB");
  await expect(page.locator("dialog dl")).toHaveCount(0);
  await expect(page.locator("dialog")).not.toContainText(/Not listed|No injury report yet|Next on the depth chart/);
  await page.keyboard.press("Escape");
  await other.locator(".player").first().click();
  await expect(page.locator("dialog dl")).toHaveCount(0);
  await expect(page.locator("dialog")).not.toContainText(/Not listed|No injury report yet|Next on the depth chart/);
});

test("sort pills reverse known values while missing records and ranks stay last", async ({page},info) => {
  const data=structuredClone(feed), teams=data.weeks[1].teams;
  for(const [team,wins,losses,rank,out] of [["ATL",0,5,3,0],["BAL",4,0,1,2],["BUF",2,2,2,1],["CAR",2,2,2,1]]) {
    teams[team].record={wins,losses,ties:0};teams[team].stats.offense.forEach(metric=>metric.rank=rank);
    teams[team].report=true;teams[team].offense.forEach((g,i)=>g.players[0].injury=i<out ? {injury:"Knee",game:"Out",practice:"Not listed",badges:["OUT"]}:null);
  }
  teams.ARI.record=null;teams.ARI.stats=null;teams.ARI.report=false;
  await open(page,{data,selections:["ARI","ATL","BAL","BUF","CAR"],week:2});
  for(const sort of ["record","stat-0"]) {
    await chooseSort(page,sort,"worst");
    await expect(page.locator(".card h2")).toHaveText(["ATL","BUF","CAR","BAL","ARI"]);
    await expect(page.locator("#sort")).toContainText("Worst first");
    await chooseSort(page,sort,"best");
    await expect(page.locator(".card h2")).toHaveText(["BAL","BUF","CAR","ATL","ARI"]);
    await expect(page.locator("#sort")).toContainText("Best first");
  }
  await page.locator("#sort").click();
  await expect(page.locator('[data-sort="out"]')).toHaveCount(0);
  await expect(page.locator('[data-direction="best"]')).toHaveAttribute("aria-pressed","true");
  await page.locator('[data-sort="stat-0"]').focus();await page.keyboard.press("Enter");
  await expect(page.locator('[data-direction="worst"]')).toHaveAttribute("aria-label","Worst first");
  await page.locator('[data-direction="worst"]').focus();await page.keyboard.press("Enter");
  await expect(page.locator("#sort")).toHaveText("Points · Worst first");
  await page.screenshot({path:info.outputPath("sort-pills.png")});
  await page.keyboard.press("Escape");await expect(page.locator("#sort")).toBeFocused();
  await page.locator("#defense").click();await expect(page.locator("#sort")).toHaveText("Points · Worst first");
  expect(await page.locator("#sort").evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});
test("forest palette stays dark under both system preferences", async ({page}) => {
  await open(page);
  for(const colorScheme of ["light","dark"]) {
    await page.emulateMedia({colorScheme});
    await expect(page.locator("html")).toHaveCSS("background-color","rgb(16, 35, 31)");
    await expect(page.locator("html")).toHaveCSS("color-scheme","dark");
    await expect(page.locator(".card").first()).toHaveCSS("background-color","rgb(25, 51, 45)");
    await expect(page.locator(".field-half").first()).toHaveCSS("background-color","rgb(35, 67, 56)");
    await expect(page.locator("#offense")).toHaveCSS("color","rgb(229, 238, 231)");
  }
});

test("fresh team links and browser back keep the larger-screen matchup page", async ({page}) => {
  await open(page);
  await page.goto("/#team=ARI");
  await expect(page.locator("#team-view")).toBeVisible();
  await expect(page.locator("#wallet-view")).toBeHidden();
  await expect(page.locator("#team-view .team-heading h2")).toHaveText(["ARI","ATL"]);
  await page.reload(); await expect(page.locator("#week")).toBeEnabled();
  await expect(page.locator("#team-view")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#cards")).toBeVisible();
  await expect(page.locator("#team-view")).toBeHidden();
});


test("larger screens restore document scroll after opening a deep team card", async ({page}) => {
  await open(page);
  const heading = page.locator("#cards .card").last().getByRole("link");
  await heading.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  expect(before).toBeGreaterThan(0);
  await heading.click(); await expect(page.locator("#team-view")).toBeVisible();
  await page.goBack(); await expect(page.locator("#cards")).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(before, 0);
});


test("missing depth slots stay blank and preserve formation geometry", async ({page}) => {
  const data=structuredClone(feed), own=data.weeks[0].teams.ARI;
  own.defense=["LDE","NT","RDE","WLB","SS","FS","RCB"].map((position,i)=>({position,slot:i+1,players:[{name:position}]}));
  own.defense=own.defense.filter(group=>group.slot!==2);
  own.record=null; own.opponent=null; own.stats=null;
  await open(page,{data,selections:["ARI"]});
  await page.locator("#defense").click();
  const card=page.locator("#cards .card"), gap=card.locator(".player-unavailable");
  await expect(gap).toHaveCount(1);
  await expect(gap).toBeEmpty();
  await expect(gap).toHaveAttribute("aria-hidden","true");
  expect(await gap.evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(0);
  expect(await gap.evaluate(el=>getComputedStyle(el).visibility)).toBe("hidden");
  await expect(card).not.toContainText(/unavailable|unknown|Slot 2|–/i);
  await expect(card.locator(".metric strong")).toHaveText(["","","",""]);
});


test("every category follows unit ranks, keeps its label and marks only its stat", async ({page}) => {
  const data=structuredClone(feed), teams=data.weeks[1].teams;
  for(const [code,rank] of [["ARI",1],["ATL",2],["BAL",2],["BUF",3]]) {
    teams[code].stats={offense:Array.from({length:4},()=>({value:10,rank})),defense:Array.from({length:4},()=>({value:20,rank:4-rank}))};
  }
  teams.CAR.stats=null;
  await open(page,{data,selections:["ARI","ATL","BAL","BUF","CAR"],week:2});
  await expect(page.locator(".sorted-stat")).toHaveCount(0);
  for(const [index,label] of ["Points","Yards","Sacks","Turnovers"].entries()) {
    for(const direction of ["best","worst"]) {
      await page.locator("#offense").click();
      await chooseSort(page,`stat-${index}`,direction);
      const buttonLabel=`${label} · ${direction==="best" ? "Best first":"Worst first"}`;
      await expect(page.locator("#sort")).toHaveText(buttonLabel);
      const order=()=>page.locator("#cards .card").evaluateAll(els=>els.map(el=>el.dataset.team));
      expect(await order()).toEqual(direction==="best" ? ["ARI","ATL","BAL","BUF","CAR"]:["BUF","ATL","BAL","ARI","CAR"]);
      expect(await page.locator("#cards .sorted-stat").evaluateAll(els=>els.map(el=>[...el.parentElement.children].indexOf(el)))).toEqual(Array(5).fill(index));
      await page.locator("#defense").click();
      await expect(page.locator("#sort")).toHaveText(buttonLabel);
      expect(await order()).toEqual(direction==="best" ? ["BUF","ATL","BAL","ARI","CAR"]:["ARI","ATL","BAL","BUF","CAR"]);
    }
  }
  await chooseSort(page,"record");
  await expect(page.locator(".sorted-stat")).toHaveCount(0);
  await page.locator("#info").click();
  await expect(page.locator("dialog")).not.toContainText(/Out sorting/);
});
