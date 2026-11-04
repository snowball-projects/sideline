import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixture } from "../fixture.mjs";

const root = page => page.locator("#wallet-card, .matchup");
const categories = ["Points", "Yards", "Sacks", "Turnovers"];
function matchupFeed() {
  const data=fixture(), teams=data.weeks[1].teams;
  const metrics=items=>items.map(([value,rank,tied])=>({value,rank,...(tied ? {tied:true}:{})}));
  teams.ARI.opponent="ATL"; teams.ARI.bye=false;
  teams.ARI.stats={offense:metrics([[28.5,3],[400.2,2],[5,7,true],[4,4]]),defense:metrics([[18.2,6],[300.8,8],[12,5],[9,2]])};
  teams.ATL.stats={offense:metrics([[31.3,1],[390.4,4],[6,7],[4,6]]),defense:metrics([[20.1,9],[250.3,1],[12,2],[7,4]])};
  return data;
}
async function open(page, data=matchupFeed()) {
  const errors=[]; page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/current.json",route=>route.fulfill({json:data}));
  await page.clock.install({time:new Date("2026-09-10T18:00:00Z")});
  await page.goto("/#team=ARI");
  await expect(page.locator("#week")).toBeEnabled();
  await page.locator("#week").selectOption("2");
  return errors;
}
async function chooseSort(page, value) {
  await page.locator("#sort").click();
  await page.locator(`[data-sort="${value}"]`).click();
  await page.keyboard.press("Escape");
}
async function geometry(page) {
  // Installed fixture clocks pause animation frames. Advance one frame after rendering.
  await page.clock.runFor(32);
  return root(page).locator(".backfield-row").evaluateAll(rows=>rows.flatMap(row=>{
    const label=row.querySelector(".backfield-label"), b=label.getBoundingClientRect(), outer=row.getBoundingClientRect();
    const issues=[];
    if (getComputedStyle(label).visibility!=="visible" || parseFloat(getComputedStyle(label).fontSize)*parseFloat(label.style.getPropertyValue("--label-scale"))<7.5 || b.height<8) issues.push("unreadable label");
    if (b.left<outer.left || b.right>outer.right || b.top<outer.top || b.bottom>outer.bottom) issues.push("outside backfield");
    for(const player of row.querySelectorAll(".player, .player-unavailable")) {
      const p=player.getBoundingClientRect();
      if(Math.min(b.right,p.right+3)-Math.max(b.left,p.left-3)>0 && Math.min(b.bottom,p.bottom+3)-Math.max(b.top,p.top-3)>0) issues.push(`label overlaps ${player.dataset.slot}`);
    }
    return issues;
  }));
}

test("head-to-head table keeps four categories and compares opposing units with ranked edges", async ({page},info)=>{
  const errors=await open(page), table=root(page).getByRole("table");
  await expect(table).toHaveAccessibleName("Head-to-head statistics");
  await expect(table.locator("tbody th")).toHaveText(categories);
  await expect(table.locator("thead th").first()).toContainText("Offense");
  await expect(table.locator("thead th").last()).toContainText("Defense");
  await expect(table.locator("tbody td strong")).toHaveText(["28.5","20.1","400.2","250.3","5","12","4","7"]);
  await expect(table.locator("tbody td .rank")).toHaveText(["#3","#9","#2","#1","T#7","#2","#4","#4"]);
  expect(await table.locator("tbody tr").evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll("td")].findIndex(td=>td.classList.contains("rank-edge"))))).toEqual([0,1,1,-1]);
  await expect(table.locator(".rank-edge .sr-only").filter({hasText:"League-rank edge"})).toHaveCount(3);
  await expect(root(page).locator(".stats, .opponent-half .team-heading")).toHaveCount(0);
  expect(await root(page).evaluate(el=>[...el.children].slice(0,4).map(child=>child.className))).toEqual([info.project.use.isMobile ? "wallet-strip":"team-heading","matchup-stats","field-half offense","scrimmage matchup-line"]);
  await expect(root(page).locator(".scrimmage")).toHaveText("");
  expect(await geometry(page)).toEqual([]);
  await chooseSort(page,"stat-2");
  await expect(table.locator("tbody .sorted-stat th")).toHaveText("Sacks");
  await page.locator("#defense").click();
  await expect(page.locator("#sort")).toHaveText("Sacks · Best first");
  await expect(table.locator("tbody td strong")).toHaveText(["18.2","31.3","300.8","390.4","12","6","9","4"]);
  expect(await table.locator("tbody tr").evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll("td")].findIndex(td=>td.classList.contains("rank-edge"))))).toEqual([1,1,0,0]);
  await expect(root(page).locator(".field-half")).toHaveClass(["field-half defense","field-half offense below"]);
  await expect(root(page).locator(".backfield-label").first()).toHaveAccessibleName("ARI defense");
  await expect(root(page).locator(".backfield-label").last()).toHaveAccessibleName("ATL offense");
  if (!info.project.use.isMobile) {
    await page.locator("#team-view").getByRole("button",{name:"Offense",exact:true}).click();
    await expect(page.locator("#offense")).toHaveAttribute("aria-pressed","true");
    await expect(table.locator("thead th").first()).toContainText("Offense");
  }
  await chooseSort(page,"record");
  await expect(table.locator(".sorted-stat")).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({path:info.outputPath("matchup-table.png")});
});

test("missing stats and byes leave empty table cells and keep formation spaces", async ({page})=>{
  const data=matchupFeed(), own=data.weeks[1].teams.ARI;
  own.stats.offense[0]=null; data.weeks[1].teams.ATL.stats.defense[1]=null;
  data.weeks[0].teams.ARI.opponent=null; data.weeks[0].teams.ARI.bye=true;
  await open(page,data);
  const table=root(page).locator("table");
  await expect(table.locator("tbody tr").nth(0).locator("td").first()).toBeEmpty();
  await expect(table.locator("tbody tr").nth(1).locator("td").last()).toBeEmpty();
  await expect(table.locator("tbody tr").nth(0).locator(".rank-edge")).toHaveCount(0);
  await expect(table.locator("tbody tr").nth(1).locator(".rank-edge")).toHaveCount(0);
  await page.locator("#week").selectOption("1");
  // A real bye has no opposing heading, data or field.
  await expect(root(page).locator(".field-half")).toHaveCount(1);
  await expect(root(page).locator(".opponent-half")).toBeEmpty();
  for(const row of await table.locator("tbody tr").all()) await expect(row.locator("td").last()).toBeEmpty();
  await page.locator("#week").selectOption("2");
  await page.locator("#week").selectOption("4");
  await expect(root(page).locator(".field-half")).toHaveCount(2);
  await expect(root(page).locator(".player")).toHaveCount(0);
  await expect(root(page)).not.toContainText(/unavailable|unknown|not supplied|–/i);
  expect(await geometry(page)).toEqual([]);
});

test("backfield labels fit between players, move around a middle player and survive resize", async ({page})=>{
  const data=matchupFeed(), teams=data.weeks[1].teams;
  const group=(position,i)=>({position,slot:i+1,players:[{name:position,star:true}]});
  for(const code of ["ARI","ATL"]) {
    teams[code].offense=["QB","RB"].map(group);
    teams[code].defense=["SS","FS"].map(group);
  }
  // Give successive weeks empty, lone, and center-occupied deepest rows.
  for(const [index,offense,defense] of [[0,["QB"],["FS"]],[2,["QB","RB","HB"],["SS","FS","SAF"]],[3,[],[]]]) {
    const week=data.weeks[index];
    week.teams.ARI.opponent="ATL"; week.teams.ARI.bye=false;
    for(const code of ["ARI","ATL"]) {week.teams[code].offense=offense.map(group);week.teams[code].defense=defense.map(group);}
  }
  await open(page,data);
  // Cover wider fallback font metrics as well as the local system font.
  for(const fontFamily of ["system-ui, sans-serif","Arial, sans-serif"]) {
    await page.evaluate(font=>document.documentElement.style.fontFamily=font,fontFamily);
    for(const week of [2,1,3,4]) {
      await page.locator("#week").selectOption(String(week));
      for(const unit of ["offense","defense"]) {
        await page.locator(`#${unit}`).click();
        for(const width of [320,390,599,600,768,1440]) {
          await page.setViewportSize({width,height:1000});
          await expect(page.locator(width < 600 ? "#wallet-view" : "#team-view")).toBeVisible();
          await expect.poll(()=>geometry(page),{message:`${week} ${unit} ${width}`}).toEqual([]);
          if (width >= 600) expect(await root(page).locator(".backfield-row > .player").evaluateAll(els=>els.every(el=>el.getBoundingClientRect().width<=160))).toBe(true);
          if (week === 1 || week === 2) {
            const placement=async () => {
              await page.clock.runFor(32);
              return root(page).locator(".backfield-row").evaluateAll(rows=>rows.map(row=>{
                const b=row.getBoundingClientRect(), label=row.querySelector(".backfield-label").getBoundingClientRect();
                const players=[...row.querySelectorAll(".player")].map(el=>el.getBoundingClientRect());
                const center=(label.left+label.right)/2;
                return players.length===2 ? Math.abs(center-(players[0].right+players[1].left)/2)<1 : Math.abs(center-(b.left+b.right)/2)>20 && Math.abs((players[0].left+players[0].right)/2-(b.left+b.right)/2)<1;
              }));
            };
            await expect.poll(placement,{message:`center or side gap: ${week} ${unit} ${width}`}).toEqual([true,true]);
          }
        }
      }
    }
  }
});

let real;
try { real=JSON.parse(await readFile(new URL("../../web/current.json",import.meta.url),"utf8")); } catch {}
test("every observed real matchup keeps labels clear of players in both unit arrangements", async ({page})=>{
  test.skip(!real,"CI uses synthetic source fixtures.");
  await open(page,real);
  await page.locator("#week").selectOption("9");
  for(const code of Object.keys(real.teams)) {
    await page.evaluate(code=>location.hash=`team=${code}`,code);
    for(const unit of ["offense","defense"]) {
      await page.locator(`#${unit}`).click();
      expect(await geometry(page),`${code} ${unit}`).toEqual([]);
    }
  }
});
