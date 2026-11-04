import { rows, shortName, statCategories, statLabels, statusMarks, playerStatus, recordText, outCount, sortTeams } from "./field.mjs";
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
function pill(label, pressed, action) {
  const control = button(undefined, action, "choice-pill"), check = node("span", "✓", "pill-check");
  check.setAttribute("aria-hidden", "true");
  control.setAttribute("aria-label", label);
  control.setAttribute("aria-pressed", String(pressed));
  control.append(node("span", label, "pill-label"), check);
  return control;
}
const link = (text, url) => {
  const el = node("a", text); el.href = url; el.target = "_blank"; el.rel = "noreferrer";
  return el;
};
const localTime = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault(); (phone.matches ? ($("wallet-scroll") || $("cards")) : $("main")).focus();
});
for (const [status, [code, label]] of Object.entries(statusMarks)) {
  const item = node("li"), badge = node("span", code, `injury-badge status-${status}`);
  badge.setAttribute("role", "img"); badge.setAttribute("aria-label", label); item.append(badge);
  $("status-key-list").append(item);
}
const storageKey = "sideline.compare";
const phone = matchMedia("(width < 600px)");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
history.scrollRestoration = "manual";
let data, week, side = "offense", selected = [], opener, sortBy = "record", sortDirection = "best";
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
  if (!$("popup").open && document.activeElement === document.body) {
    if (opener?.isConnected) opener.focus(); else focusRoute();
  }
});
const playerStatLabels = {
  passing_yards: "Passing yards", passing_tds: "Passing TDs",
  rushing_yards: "Rushing yards", rushing_tds: "Rushing TDs",
  receiving_yards: "Receiving yards", receiving_tds: "Receiving TDs",
  tackles: "Tackles", sacks: "Sacks", interceptions: "Interceptions",
};
const ordinalRules = new Intl.PluralRules("en", { type: "ordinal" });
function playerRankText(key, metric, position) {
  const ending = { one: "st", two: "nd", few: "rd", other: "th" }[ordinalRules.select(metric.rank)];
  const scope = ["tackles", "sacks", "interceptions"].includes(key) ? "defenders" : `${position}s`;
  return `${metric.tied ? "Tied " : ""}${metric.rank}${ending} among ${scope}`;
}
const injuryBody = (player) => player.injury?.injury && player.injury.injury !== "Not specified" ? player.injury.injury : "";
function injurySummary(player) {
  const status = playerStatus(player), detail = injuryBody(player), line = node("p", undefined, "player-injury");
  if (statusMarks[status.status]) line.append(node("span", status.label, `injury-badge status-${status.status}`));
  const designation = player.injury?.game;
  if (designation && designation !== "Not listed" && designation !== status.label) line.append(node("span", designation));
  if (detail) line.append(node("span", detail, "injury-body"));
  return line;
}
function playerPopup(group, control) {
  const player = group.players[0], content = node("div"), injury = injurySummary(player);
  if (injury.childElementCount) content.append(injury);
  if (player.stats) {
    content.append(node("h3", `Stats through week ${week.stats_through}`));
    const stats = node("dl", undefined, "player-stats");
    for (const [key, metric] of Object.entries(player.stats)) {
      const row = node("div", undefined, `player-stat${metric.star ? " star-stat" : ""}`);
      const value = node("dd"); value.append(node("strong", metric.value.toLocaleString()), node("span", playerRankText(key, metric, group.position), "rank"));
      if (metric.star) {
        const star = node("span", "★", "stat-star"); star.setAttribute("role", "img"); star.setAttribute("aria-label", "League top 10"); value.append(star);
      }
      row.append(node("dt", playerStatLabels[key]), value); stats.append(row);
    }
    content.append(stats);
  }
  if (group.players.length > 1 && ["out", "doubtful", "questionable"].includes(playerStatus(player).status)) {
    content.append(node("h3", "Next on the depth chart"));
    const list = node("ol");
    for (const backup of group.players.slice(1)) {
      const item = node("li"); item.append(node("span", `${backup.name} · ${group.position}`));
      const summary = injurySummary(backup); if (summary.childElementCount) item.append(summary); list.append(item);
    }
    content.append(list);
  }
  popup(`${player.name} · ${group.position}`, content, control);
}
function field(unit, unitSide, below = false, team) {
  const half = node("section", undefined, `field-half ${unitSide}${below ? " below" : ""}`);
  half.setAttribute("aria-label", `${team ? `${data.teams[team].name} ` : ""}${unitSide === "offense" ? "Offense" : "Defense"} starters`);
  for (const groups of rows(unit, unitSide)) {
    const row = node("div", undefined, "field-row");
    for (const group of groups) {
      if (group.unavailable) {
        const missing = node("div", undefined, "player-unavailable");
        missing.setAttribute("aria-hidden", "true");
        row.append(missing);
        continue;
      }
      const player = group.players[0], status = playerStatus(player), mark = statusMarks[status.status], detail = injuryBody(player);
      const description = [player.name, group.position, status.label, detail, player.star ? "league top 10" : ""].filter(Boolean);
      const control = button(undefined, () => playerPopup(group, control), mark ? `player status-${status.status}` : "player");
      control.setAttribute("aria-label", description.join(", "));
      control.dataset.slot = group.slot;
      control.title = description.join(" · ");
      const meta = node("span", undefined, "player-meta");
      meta.append(node("span", group.position, "position"));
      if (mark) {
        const code = node("span", mark[0], "status-mark"); code.setAttribute("aria-hidden", "true"); meta.append(code);
        if (detail) {
          const body = node("span", detail, "injury-body"); body.setAttribute("aria-hidden", "true"); meta.append(body);
        }
      }
      control.append(node("span", shortName(player.name), "player-name"), meta);
      if (player.star) {
        const star = node("span", "★", "star"); star.setAttribute("aria-label", "League top 10"); control.append(star);
      }
      row.append(control);
    }
    half.append(row);
  }
  if (team) {
    const backfield = half.firstElementChild, label = node("span", undefined, "backfield-label");
    backfield.classList.add("backfield-row");
    if (backfield.childElementCount > 2) backfield.classList.add("crowded-backfield");
    label.setAttribute("role", "img"); label.setAttribute("aria-label", `${data.teams[team].name} ${unitSide}`);
    label.append(logo(team, 16), node("span", unitSide.toUpperCase()));
    backfield.append(label);
  }
  return half;
}
function placeBackfieldLabels() {
  for (const label of document.querySelectorAll(".backfield-label")) {
    const row = label.parentElement, box = row.getBoundingClientRect();
    const players = [...row.querySelectorAll(".player, .player-unavailable")].map(el => el.getBoundingClientRect()).sort((a,b) => a.left-b.left);
    const boundaries = [box.left, ...players.flatMap(player => [player.left, player.right]), box.right];
    const gaps = [];
    for (let i = 0; i < boundaries.length; i += 2) gaps.push({left:boundaries[i], right:boundaries[i+1]});
    gaps.sort((a,b) => (b.right-b.left)-(a.right-a.left) || Math.abs((a.left+a.right)/2-(box.left+box.right)/2)-Math.abs((b.left+b.right)/2-(box.left+box.right)/2));
    const gap = gaps[0];
    label.style.left = `${((gap.left+gap.right)/2-box.left)/box.width*100}%`;
    label.style.setProperty("--label-scale", Math.min(1, Math.max(0, gap.right-gap.left-16)/label.offsetWidth));
    label.style.visibility = "visible";
  }
}
window.addEventListener("resize", placeBackfieldLabels);
function logo(team, size = 36) {
  const image = node("img"); image.src = data.teams[team].url; image.alt = ""; image.width = size; image.height = size;
  return image;
}
function teamHeading(team, unitSide, navigable = false) {
  const section = node("div", undefined, "team-heading"), own = week.teams[team];
  const labels = node("div", undefined, "team-labels"), heading = node("h2");
  if (navigable) {
    const a = node("a", data.teams[team].name); a.href = `#team=${team}`;
    a.addEventListener("click", event => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); openTeam(team, a);
    });
    heading.append(a);
  }
  else heading.textContent = data.teams[team].name;
  labels.append(heading, node("span", [recordText(own.record), unitSide === "offense" ? "Offense" : "Defense"].filter(Boolean).join(" · "), "record"));
  section.append(logo(team), labels);
  return section;
}
function stats(record, unitSide) {
  const section = node("section", undefined, `stats ${unitSide}-stats`);
  section.setAttribute("aria-label", `${unitSide === "offense" ? "Offense" : "Defense"} statistics`);
  statLabels[unitSide].forEach((label, index) => {
    const metric = record?.[unitSide][index], item = node("div", undefined, `metric${sortBy === `stat-${index}` ? " sorted-stat" : ""}`);
    item.append(node("span", label, "metric-label"), node("strong", metricValue(metric, index)), node("span", metricRank(metric), "rank"));
    section.append(item);
  });
  return section;
}
function visibleTeams() {
  return sortTeams(selected.length ? selected : Object.keys(data.teams), week, side, sortBy, sortDirection);
}
function currentTeam() {
  const team = new URLSearchParams(location.hash.slice(1)).get("team");
  return Object.hasOwn(data.teams, team) ? team : null;
}
function walletStrip(team, expanded = false) {
  const own = week.teams[team], count = outCount(own, side);
  const opponentName = own.opponent ? data.teams[own.opponent].name : own.bye ? "Bye" : "";
  const control = button(undefined, () => expanded ? closeTeam() : openTeam(team, control), "wallet-strip");
  control.dataset.team = team;
  control.setAttribute("aria-expanded", String(expanded));
  control.setAttribute("aria-controls", "wallet-view");
  control.setAttribute("aria-label", [data.teams[team].name, recordText(own.record), opponentName, own.opponent && recordText(week.teams[own.opponent].record), count !== null && `${count} starters listed Out`].filter(Boolean).join(", "));
  const labels = node("span", undefined, "wallet-labels"), detail = node("span", undefined, "wallet-record");
  detail.append(node("span", recordText(own.record)));
  if (count) {
    const dots = node("span", undefined, "out-dots");
    dots.setAttribute("aria-hidden", "true"); dots.append(node("span", "Out", "out-label"));
    for (let i = 0; i < count; i++) dots.append(node("span", undefined, "out-dot"));
    detail.append(dots);
  }
  labels.append(node("span", data.teams[team].name, "wallet-name"), detail);
  const opponent = node("span", undefined, "wallet-opponent-logo");
  if (own.opponent) opponent.append(node("span", recordText(week.teams[own.opponent].record)), logo(own.opponent, 22));
  opponent.setAttribute("aria-hidden", "true");
  control.append(logo(team, 36), labels, opponent);
  return control;
}
function renderCards() {
  const teams = visibleTeams(), scrollTop = $("cards").scrollTop;
  $("cards").tabIndex = phone.matches ? 0 : -1;
  $("sort").textContent = `${sortOptions().find(([value]) => value === sortBy)[1]} · ${directionLabel(sortDirection)}`;
  $("cards").replaceChildren();
  $("message").textContent = [`${teams.length} teams`, week.stats_through && `Stats through week ${week.stats_through}`].filter(Boolean).join(" · ");
  $("compare").textContent = selected.length ? `Compare (${selected.length})` : "Compare";
  $("clear-compare").hidden = !selected.length;
  for (const [index, team] of teams.entries()) {
    const own = week.teams[team], card = node("article", undefined, "card");
    card.dataset.team = team;
    card.style.setProperty("--stack-index", index);
    card.setAttribute("aria-label", `${data.teams[team].name} ${side}`);
    if (phone.matches) card.append(walletStrip(team));
    else {
      card.addEventListener("click", event => { if (!event.target.closest("button, a")) openTeam(team); });
      const heading = teamHeading(team, side, true), opponent = node("span", undefined, "opponent");
      if (own.opponent) { opponent.append(node("span", "vs"), logo(own.opponent, 24)); opponent.setAttribute("aria-label", `Opponent ${data.teams[own.opponent].name}`); opponent.setAttribute("role", "img"); }
      else opponent.textContent = own.bye ? "Bye" : "";
      heading.append(opponent);
      card.append(heading, stats(own.stats, side), field(own[side], side), node("div", "Line of scrimmage", "scrimmage"));
    }
    $("cards").append(card);
  }
  $("cards").scrollTop = scrollTop;
}
function metricValue(metric, index) {
  return metric ? metric.value.toLocaleString(undefined, {maximumFractionDigits:index < 2 ? 1 : 0}) : "";
}
function metricRank(metric) { return metric ? `${metric.tied ? "T" : ""}#${metric.rank}` : ""; }
function matchupStats(team, unit) {
  const own = week.teams[team], other = week.teams[own.opponent], otherUnit = unit === "offense" ? "defense" : "offense";
  const table = node("table", undefined, "matchup-stats"), head = node("thead"), headings = node("tr"), body = node("tbody");
  table.append(node("caption", "Head-to-head statistics", "sr-only"));
  for (const [code, role] of [[team,unit], [null,null], [own.opponent,otherUnit]]) {
    const cell = node("th"); cell.scope = "col";
    if (code) cell.append(node("span", data.teams[code].name), node("span", role === "offense" ? "Offense" : "Defense", "rank"));
    else if (!role) cell.append(node("span", "Category", "sr-only"));
    headings.append(cell);
  }
  head.append(headings);
  statCategories.forEach((category,index) => {
    const row = node("tr", undefined, sortBy === `stat-${index}` ? "sorted-stat" : undefined);
    const ownMetric = own.stats?.[unit][index], otherMetric = other?.stats?.[otherUnit][index];
    for (const [metric,opposing,role] of [[ownMetric,otherMetric,unit], [null,null,null], [otherMetric,ownMetric,otherUnit]]) {
      if (!role) { const label = node("th", category); label.scope = "row"; row.append(label); continue; }
      const cell = node("td");
      if (metric) {
        const value = node("strong", metricValue(metric,index));
        cell.append(node("span", statLabels[role][index], "sr-only"), value, node("span", metricRank(metric), "rank"));
        if (opposing && metric.rank < opposing.rank) {
          cell.className = "rank-edge"; cell.append(node("span", "League-rank edge", "sr-only"));
        }
      }
      row.append(cell);
    }
    body.append(row);
  });
  table.append(head,body);
  return table;
}
function matchupContent(team, unit, heading) {
  const own = week.teams[team], otherUnit = unit === "offense" ? "defense" : "offense";
  const content = document.createDocumentFragment(), opponent = node("section", undefined, "opponent-half");
  content.append(heading, matchupStats(team, unit), field(own[unit], unit, false, team), node("div", undefined, "scrimmage matchup-line"));
  if (own.opponent) opponent.append(field(week.teams[own.opponent][otherUnit], otherUnit, true, own.opponent));
  content.append(opponent);
  return content;
}
function walletPile(team) {
  const remaining = visibleTeams().filter(value => value !== team);
  const pile = button(undefined, closeTeam, "wallet-pile"); pile.id = "wallet-pile";
  pile.setAttribute("aria-label", `Team stack, ${remaining.length} other teams`); pile.setAttribute("aria-controls", "cards");
  for (const other of (remaining.length ? remaining.slice(0, 3) : [team]).toReversed()) {
    const layer = node("span", undefined, "pile-layer"); layer.setAttribute("aria-hidden", "true");
    layer.append(logo(other, 26), node("span", data.teams[other].name, "pile-name")); pile.append(layer);
  }
  const count = node("span", `${remaining.length} other ${remaining.length === 1 ? "team" : "teams"}`, "pile-count");
  count.setAttribute("aria-hidden", "true"); pile.append(count);
  return pile;
}
function renderTeam() {
  const team = currentTeam(), wallet = Boolean(team && phone.matches);
  const scrollTop = $("wallet-view").dataset.team === team ? ($("wallet-scroll")?.scrollTop || 0) : 0;
  $("cards").hidden = Boolean(team); $("cards").inert = Boolean(team);
  $("team-view").hidden = !team || phone.matches;
  $("wallet-view").hidden = !wallet;
  $("wallet-view").dataset.team = wallet ? team : "";
  $("wallet-view").replaceChildren(); $("team-view").replaceChildren();
  if (!team) return;
  if (wallet) {
    const scroll = node("div"); scroll.id = "wallet-scroll"; scroll.tabIndex = 0;
    scroll.setAttribute("role", "region"); scroll.setAttribute("aria-label", "Matchup details");
    const card = node("article", undefined, "card wallet-lift"); card.id = "wallet-card";
    card.setAttribute("aria-label", `${data.teams[team].name} ${side}`);
    card.append(matchupContent(team, side, walletStrip(team, true)));
    scroll.append(card);
    $("wallet-view").append(scroll, walletPile(team)); scroll.scrollTop = scrollTop;
  } else {
    const toolbar = node("div", undefined, "team-toolbar"), back = node("a", "All teams"); back.href = "#";
    back.addEventListener("click", event => { event.preventDefault(); closeTeam(); });
    const toggle = node("div", undefined, "unit-switch"); toggle.setAttribute("role", "group"); toggle.setAttribute("aria-label", "Team matchup unit");
    for (const unit of ["offense", "defense"]) {
      const control = button(unit === "offense" ? "Offense" : "Defense", () => { setSide(unit); $("team-view").querySelector('[aria-pressed="true"]').focus(); });
      control.setAttribute("aria-pressed", String(unit === side)); toggle.append(control);
    }
    toolbar.append(back, toggle);
    const match = node("article", undefined, "matchup"); match.append(matchupContent(team, side, teamHeading(team, side)));
    $("team-view").append(toolbar, match);
  }
  requestAnimationFrame(placeBackfieldLabels);
}
function baseURL() { const url = new URL(location.href); url.hash = ""; return url; }
function preparePhoneLink() {
  const team = currentTeam();
  if (phone.matches && team && history.state?.sidelineTeam !== team) {
    const target = location.href;
    history.replaceState({stackY:0, pageY:0, focusTeam:team}, "", baseURL());
    history.pushState({sidelineTeam:team}, "", target);
  }
}
function exposedStackStrip(control) {
  const box = control.getBoundingClientRect(), port = $("cards").getBoundingClientRect();
  return box.top >= port.top && box.bottom <= port.bottom && control.contains(
    document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
}
function revealStackStrip(control) {
  const cards = $("cards");
  if (exposedStackStrip(control)) return;
  let top = 0;
  for (const card of cards.children) {
    const style = getComputedStyle(card);
    top += parseFloat(style.marginTop);
    if (card.contains(control)) break;
    top += card.offsetHeight + parseFloat(style.marginBottom);
  }
  cards.scrollTop = top - cards.clientHeight / 3;
}
$("cards").addEventListener("focusin", event => {
  if (phone.matches && event.target.matches(".wallet-strip:focus-visible")) revealStackStrip(event.target);
});
function focusRoute() {
  if (!data) return;
  const team = currentTeam();
  if (team) {
    const target = phone.matches ? $("wallet-view").querySelector(".wallet-strip") : $("team-view").querySelector("a");
    target?.focus({preventScroll:true});
  } else {
    const target = phone.matches && history.state?.focusTeam
      ? ($("cards").querySelector(`[data-team="${history.state.focusTeam}"] .wallet-strip`) || $("cards")) : $("cards");
    if (phone.matches) {
      $("cards").scrollTop = history.state?.stackY || 0;
      // Keep an edge tap's original offset; focus the region if its strip is buried.
      const exposed = target === $("cards") || exposedStackStrip(target);
      (exposed ? target : $("cards")).focus({preventScroll:true});
    } else {
      target.focus({preventScroll:true}); window.scrollTo(0, history.state?.pageY || 0);
    }
  }
}
function animateRoute(origin) {
  if (!phone.matches || reducedMotion.matches) return;
  const options = {duration:240, easing:"cubic-bezier(.2,.8,.2,1)"};
  if (currentTeam()) {
    const card = $("wallet-card");
    card.animate([{transform:`translateY(${origin ? origin.top - card.getBoundingClientRect().top : 24}px)`, opacity:.8}, {transform:"none", opacity:1}], options);
    for (const layer of $("wallet-pile").querySelectorAll(".pile-layer"))
      layer.animate([{transform:"translateY(-72px)", opacity:.2}, {transform:"none", opacity:1}], options);
  }
}
function routeChanged(origin) {
  if ($("popup").open) $("popup").close();
  preparePhoneLink(); renderTeam(); window.scrollTo(0, phone.matches || currentTeam() ? 0 : (history.state?.pageY || 0));
  focusRoute(); animateRoute(origin);
}
function openTeam(team, control) {
  const origin = control?.getBoundingClientRect();
  history.replaceState({stackY:$("cards").scrollTop, pageY:window.scrollY, focusTeam:team}, "", location.href);
  history.pushState({sidelineTeam:team}, "", `#team=${team}`);
  routeChanged(origin);
}
function closeTeam() {
  if (history.state?.sidelineTeam === currentTeam()) history.back();
  else { history.replaceState(null, "", baseURL()); routeChanged(); }
}
function render() { preparePhoneLink(); renderCards(); renderTeam(); }
phone.addEventListener("change", () => {
  if (!data) return;
  render(); focusRoute();
});
function sortOptions() {
  return [["record", "Record"], ...statCategories.map((label, index) => [`stat-${index}`, label])];
}
function directionLabel(direction) {
  return direction === "best" ? "Best first" : "Worst first";
}
$("sort").addEventListener("click", () => {
  const content = node("div"), metrics = node("div", undefined, "choice-options"), directions = node("div", undefined, "choice-options");
  metrics.setAttribute("role", "group"); metrics.setAttribute("aria-label", "Sort statistic");
  directions.setAttribute("role", "group"); directions.setAttribute("aria-label", "Sort direction");
  const choices = sortOptions().map(([value, label]) => {
    const control = pill(label, value === sortBy, () => { sortBy = value; refresh(); render(); });
    control.dataset.sort = value; metrics.append(control); return control;
  });
  const order = ["best", "worst"].map((value) => {
    const control = pill(directionLabel(value), value === sortDirection, () => { sortDirection = value; refresh(); render(); });
    control.dataset.direction = value; directions.append(control); return control;
  });
  function refresh() {
    for (const control of choices) control.setAttribute("aria-pressed", String(control.dataset.sort === sortBy));
    for (const control of order) {
      const label = directionLabel(control.dataset.direction);
      control.setAttribute("aria-pressed", String(control.dataset.direction === sortDirection));
      control.setAttribute("aria-label", label); control.querySelector(".pill-label").textContent = label;
    }
  }
  content.append(metrics, node("h3", "Order"), directions);
  popup("Sort teams", content, $("sort"));
});
function setSide(unit) {
  side = unit;
  for (const name of ["offense", "defense"]) $(name).setAttribute("aria-pressed", String(side === name));
  render();
}
for (const unit of ["offense", "defense"]) $(unit).addEventListener("click", () => setSide(unit));
$("week").addEventListener("change", () => { week = data.weeks.find((entry) => entry.week === +$("week").value); render(); });
window.addEventListener("hashchange", () => { if (data) routeChanged(); });
$("compare").addEventListener("click", () => {
  const content = node("div", undefined, "compare-options choice-options");
  content.setAttribute("role", "group"); content.setAttribute("aria-label", "Compare teams");
  for (const [team, asset] of Object.entries(data.teams)) {
    const control = pill(asset.name, selected.includes(team), () => {
      selected = selected.includes(team) ? selected.filter((item) => item !== team) : [...selected, team];
      control.setAttribute("aria-pressed", String(selected.includes(team))); save(); render();
    });
    control.dataset.team = team; control.prepend(logo(team, 24)); content.append(control);
  }
  popup("Compare teams", content, $("compare"));
});
$("clear-compare").addEventListener("click", () => { selected = []; save(); render(); $("compare").focus(); });
$("info").addEventListener("click", () => {
  const content = node("div");
  if (data) {
    content.append(node("p", [data.generated_at && `Collected ${localTime(data.generated_at)}`, data.injury_updated_at && `Injury file updated ${localTime(data.injury_updated_at)}`].filter(Boolean).join(" · ")), node("p", "Statistics and records use complete regular-season weeks before the selected week. Ranks preserve ties. ★ marks league top 10 within an offensive position for yards or touchdowns, or among defenders for tackles, sacks or interceptions."), node("p", "Missing injury entries do not establish health. The source supplies no report publication dates. Starters are first in each observed depth slot; a depth chart does not confirm participation."));
    for (const source of data.sources) {
      const section = node("section"); section.append(link(source.label, source.url), node("p", [source.source_updated_at && `File updated ${localTime(source.source_updated_at)}`, source.retrieved_at && `Collected ${localTime(source.retrieved_at)}`, source.checked_on && `Checked ${source.checked_on}`].filter(Boolean).join(" · "))); content.append(section);
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
    render(); if (currentTeam()) { focusRoute(); animateRoute(); }
  } catch { $("message").textContent = ""; }
}
load();
