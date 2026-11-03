import { rows, shortName, statLabels, statusMarks, playerStatus, recordText, sortTeams } from "./field.mjs";
const $ = (id) => document.getElementById(id);
const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
const button = (text, action, className) => {
  const el = node("button", text, className);
  el.type = "button";
  el.addEventListener("click", action);
  return el;
};
const link = (text, url) => {
  const el = node("a", text); el.href = url; el.target = "_blank"; el.rel = "noreferrer";
  return el;
};
const localTime = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Not supplied";
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault(); $("main").focus();
});
for (const [code, label] of Object.values(statusMarks)) {
  const item = node("li"); item.append(node("strong", code), document.createTextNode(` ${label}`));
  $("status-key-list").append(item);
}
const storageKey = "sideline.compare";
let data, week, side = "offense", selected = [], opener, teamSide = "offense";
function save() { try { localStorage.setItem(storageKey, JSON.stringify(selected)); } catch {} }
function popup(title, content, control) {
  opener = control;
  const heading = node("h2", title); heading.id = "popup-title";
  $("popup-content").replaceChildren(heading, content);
  $("popup").showModal();
}
$("close-popup").addEventListener("click", () => $("popup").close());
$("popup").addEventListener("click", (event) => {
  if (event.target !== $("popup")) return;
  const box = $("popup").getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) $("popup").close();
});
$("popup").addEventListener("close", () => {
  if (!$("popup").open && document.activeElement === document.body && opener?.isConnected) opener.focus();
});
function playerPopup(group, control, report) {
  const player = group.players[0], content = node("div"), details = node("dl");
  const absent = report ? "Not listed" : "No injury report yet";
  for (const [label, value] of [
    ["Injury", player.injury?.injury || absent], ["Game status", player.injury?.game || absent],
    ["Practice status", player.injury?.practice || absent],
  ]) details.append(node("dt", label), node("dd", value));
  content.append(details);
  if (player.star) content.append(node("p", "★ League top 10"));
  if (player.injury) {
    content.append(node("h3", "Next on the depth chart"));
    const list = node("ol");
    for (const backup of group.players.slice(1)) list.append(node("li", `${backup.name} · ${group.position} · ${playerStatus(backup, report).label}`));
    content.append(group.players.length > 1 ? list : node("p", "None listed"));
  }
  popup(`${player.name} · ${group.position}`, content, control);
}
function field(unit, unitSide, report, below = false) {
  const half = node("section", undefined, `field-half ${unitSide}${below ? " below" : ""}`);
  half.setAttribute("aria-label", `${unitSide === "offense" ? "Offense" : "Defense"} starters`);
  if (!unit.length) half.append(node("p", "Starters unavailable", "field-empty"));
  for (const groups of rows(unit, unitSide)) {
    const row = node("div", undefined, "field-row");
    for (const group of groups) {
      if (group.unavailable) {
        const missing = node("div", undefined, "player-unavailable");
        missing.setAttribute("aria-label", `${group.position} unavailable`);
        missing.append(node("span", group.position, "position"), node("span", "Unavailable", "player-name"));
        row.append(missing);
        continue;
      }
      const player = group.players[0], status = playerStatus(player, report);
      const control = button(undefined, () => playerPopup(group, control, report), `player status-${status.status}`);
      control.setAttribute("aria-label", `${player.name}, ${group.position}, ${status.label}${player.star ? ", league top 10" : ""}`);
      control.dataset.slot = group.slot;
      control.title = `${player.name} · ${group.position} · ${status.label}`;
      const meta = node("span", undefined, "player-meta");
      const mark = node("span", statusMarks[status.status][0], "status-mark");
      mark.setAttribute("aria-hidden", "true");
      meta.append(node("span", group.position, "position"), mark);
      control.append(node("span", shortName(player.name), "player-name"), meta);
      if (player.star) {
        const star = node("span", "★", "star"); star.setAttribute("aria-label", "League top 10"); control.append(star);
      }
      row.append(control);
    }
    half.append(row);
  }
  return half;
}
function logo(team, size = 36) {
  const image = node("img"); image.src = data.teams[team].url; image.alt = ""; image.width = size; image.height = size;
  return image;
}
function teamHeading(team, unitSide, navigable = false) {
  const section = node("div", undefined, "team-heading"), own = week.teams[team];
  const labels = node("div", undefined, "team-labels"), heading = node("h2");
  if (navigable) { const a = node("a", data.teams[team].name); a.href = `#team=${team}`; heading.append(a); }
  else heading.textContent = data.teams[team].name;
  labels.append(heading, node("span", `${recordText(own.record)} · ${unitSide === "offense" ? "Offense" : "Defense"}`, "record"));
  section.append(logo(team), labels);
  return section;
}
function stats(record, unitSide) {
  const section = node("section", undefined, `stats ${unitSide}-stats`);
  section.setAttribute("aria-label", `${unitSide === "offense" ? "Offense" : "Defense"} statistics`);
  statLabels[unitSide].forEach((label, index) => {
    const metric = record?.[unitSide][index], item = node("div", undefined, "metric");
    item.append(node("span", label, "metric-label"), node("strong", metric ? metric.value.toLocaleString(undefined, { maximumFractionDigits: index < 2 ? 1 : 0 }) : "–"), node("span", metric ? `${metric.tied ? "T" : ""}#${metric.rank}` : "Unavailable", "rank"));
    section.append(item);
  });
  return section;
}
function reportNotice(own) { return node("p", own.report ? "" : "No injury report yet", "report-notice"); }
function renderCards() {
  const teams = sortTeams(selected.length ? selected : Object.keys(data.teams), week, side, $("sort").value);
  $("cards").replaceChildren();
  $("message").textContent = `${teams.length} teams · ${week.stats_through ? `Stats through week ${week.stats_through}` : week.week === 1 ? "No prior games" : "Stats unavailable"}`;
  $("compare").textContent = selected.length ? `Compare (${selected.length})` : "Compare";
  $("clear-compare").hidden = !selected.length;
  for (const team of teams) {
    const own = week.teams[team], card = node("article", undefined, "card");
    card.setAttribute("aria-label", `${data.teams[team].name} ${side}`);
    card.addEventListener("click", (event) => { if (!event.target.closest("button, a")) location.hash = `team=${team}`; });
    const heading = teamHeading(team, side, true), opponent = node("span", undefined, "opponent");
    if (own.opponent) { opponent.append(node("span", "vs"), logo(own.opponent, 24)); opponent.setAttribute("aria-label", `Opponent ${data.teams[own.opponent].name}`); opponent.setAttribute("role", "img"); }
    else opponent.textContent = own.bye ? "Bye" : "Opponent unavailable";
    heading.append(opponent);
    card.append(heading, stats(own.stats, side), reportNotice(own), field(own[side], side, own.report), node("div", "Line of scrimmage", "scrimmage"));
    $("cards").append(card);
  }
}
function renderTeam() {
  const team = new URLSearchParams(location.hash.slice(1)).get("team");
  const shown = Object.hasOwn(data.teams, team);
  $("cards").hidden = shown; $("team-view").hidden = !shown;
  if (!shown) return;
  const own = week.teams[team], otherSide = teamSide === "offense" ? "defense" : "offense";
  const toolbar = node("div", undefined, "team-toolbar"), back = node("a", "All teams"); back.href = "#";
  const toggle = node("div", undefined, "unit-switch"); toggle.setAttribute("role", "group"); toggle.setAttribute("aria-label", "Team matchup unit");
  for (const unit of ["offense", "defense"]) {
    const control = button(unit === "offense" ? "Offense" : "Defense", () => { teamSide = unit; renderTeam(); $("team-view").querySelector(`[aria-pressed="true"]`).focus(); });
    control.setAttribute("aria-pressed", String(unit === teamSide)); toggle.append(control);
  }
  toolbar.append(back, toggle);
  const match = node("article", undefined, "matchup");
  match.append(teamHeading(team, teamSide), stats(own.stats, teamSide), reportNotice(own), field(own[teamSide], teamSide, own.report), node("div", "Line of scrimmage", "scrimmage"));
  if (own.opponent) {
    const other = week.teams[own.opponent];
    match.append(field(other[otherSide], otherSide, other.report, true), reportNotice(other), stats(other.stats, otherSide), teamHeading(own.opponent, otherSide));
  } else match.append(node("p", own.bye ? "Bye" : "Opponent unavailable", "bye"));
  $("team-view").replaceChildren(toolbar, match);
}
function render() { renderCards(); renderTeam(); }
function sortOptions() {
  const previous = $("sort").value || "record";
  $("sort").replaceChildren();
  for (const [value, label] of [["record", "Record"], ...statLabels[side].map((label, index) => [`stat-${index}`, label]), ["out", "Starters listed Out"]]) {
    const option = node("option", label); option.value = value; $("sort").append(option);
  }
  $("sort").value = previous;
}
for (const unit of ["offense", "defense"]) $(unit).addEventListener("click", () => {
  side = unit;
  for (const name of ["offense", "defense"]) $(name).setAttribute("aria-pressed", String(side === name));
  sortOptions(); renderCards();
});
$("sort").addEventListener("change", renderCards);
$("week").addEventListener("change", () => { week = data.weeks.find((entry) => entry.week === +$("week").value); render(); });
window.addEventListener("hashchange", () => { if (data) { renderTeam(); ( $("team-view").hidden ? $("cards") : $("team-view").querySelector("a") ).focus(); } });
$("compare").addEventListener("click", () => {
  const content = node("div", undefined, "compare-options");
  for (const [team, asset] of Object.entries(data.teams)) {
    const label = node("label"), input = node("input"); input.type = "checkbox"; input.checked = selected.includes(team); input.value = team;
    input.addEventListener("change", () => { selected = input.checked ? [...selected, team] : selected.filter((item) => item !== team); save(); renderCards(); });
    label.append(input, logo(team, 24), node("span", asset.name)); content.append(label);
  }
  popup("Compare teams", content, $("compare"));
});
$("clear-compare").addEventListener("click", () => { selected = []; save(); renderCards(); $("compare").focus(); });
$("info").addEventListener("click", () => {
  const content = node("div");
  if (!data) content.append(node("p", "Weekly data unavailable"));
  else {
    content.append(node("p", `Collected ${localTime(data.generated_at)}. Injury file updated ${localTime(data.injury_updated_at)}.`), node("p", "Statistics and records use complete regular-season weeks before the selected week. Ranks preserve ties. ★ marks league top 10 within an offensive position for yards or touchdowns, or among defenders for tackles, sacks or interceptions."), node("p", "Missing injury entries do not establish health. Out sorting counts listed designations when a full observed unit and a team report are available; other counts are unavailable. The source supplies no report publication dates. Starters are first in each observed depth slot; a depth chart does not confirm participation."));
    for (const source of data.sources) {
      const section = node("section"); section.append(link(source.label, source.url), node("p", `File updated ${localTime(source.source_updated_at)} · collected ${localTime(source.retrieved_at)} · checked ${source.checked_on}`)); content.append(section);
    }
    content.append(link("nflverse data · CC BY 4.0", data.sources[0].terms_url), node("p", "sideline filters and joins nflverse records and calculates pre-week statistics. Software: MIT. Original data: CC0. Team marks retain their owners’ rights."));
    const logos = node("details"); logos.append(node("summary", "Team logo sources and licenses"));
    for (const asset of Object.values(data.teams)) { const item = node("p"); item.append(link(asset.name, asset.source), node("span", ` · ${asset.license} · checked ${asset.reviewed_at} · `), link("License", asset.license_url)); logos.append(item); }
    content.append(logos, link("Full credits", "THIRD-PARTY-NOTICES.md"), document.createTextNode(" · "), link("Software license", "LICENSE"));
  }
  popup("Sources and licenses", content, $("info"));
});
async function load() {
  try {
    const response = await fetch("./current.json"); if (!response.ok) throw new Error("Data unavailable"); data = await response.json();
    const now = Date.now();
    week = data.weeks.find((entry) => Date.parse(entry.starts_at) <= now && now < Date.parse(entry.ends_at)) || data.weeks.find((entry) => Date.parse(entry.starts_at) > now) || data.weeks.at(-1);
    try { selected = JSON.parse(localStorage.getItem(storageKey)) || []; } catch {}
    $("week").replaceChildren();
    for (const entry of data.weeks) { const option = node("option", entry.label); option.value = entry.week; $("week").append(option); }
    $("week").value = week.week;
    for (const id of ["week", "offense", "defense", "sort", "compare"]) $(id).disabled = false;
    sortOptions(); render();
  } catch { $("message").textContent = "Weekly data unavailable"; }
}
load();
