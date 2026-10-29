import { cardContext, cardRoster, restoreCards, OFFENSIVE_POSITIONS } from "./team-cards.mjs?v=0.9.15";
import { defenseRankings, rankLabel, DEFENSE_STATS_TERMS } from "./defense-stats.mjs?v=0.9.15";
import { defenderContribution } from "./contribution.mjs?v=0.9.15";
import {
  createRefreshController,
  canApplyRefresh,
} from "./refresh.mjs?v=0.9.15";
import {
  fieldLayout,
  compactMarkerName,
  memberHasChartPosition,
  filterDefenders,
  fieldStatus,
  depthSummary,
  STATUS_FILTERS,
} from "./field.mjs?v=0.9.15";
import { coordinatorFor, coordinatorLabel, coachingSeasons } from "./coordinator.mjs?v=0.9.15";
import { bioFacts, playerInjuryRecords } from "./player-details.mjs?v=0.9.15";
import { archivedInjuryRecords } from "./injury-history.mjs?v=0.9.15";
import { playerHistoryFor, observedWeeksLabel, PLAYER_HISTORY_TERMS } from "./player-history.mjs?v=0.9.15";
import {
  searchPlayers,
  memberPills,
  STATUS_LEGEND,
  DEFENSIVE_POSITIONS,
  currentWeek,
  gameStateLabel,
  collectionAgeLabel,
  metricPerspective,
  clockFingerprint,
  MAX_SELECTIONS,
  safeUrl,
  TEAMS,
} from "./model.mjs?v=0.9.15";
import {
  attachPopover,
  dismissPopover,
  isPopoverOpen,
  refreshPopover,
  focusPopoverTrigger,
} from "./popover.mjs?v=0.9.15";

const $ = (id) => document.getElementById(id);
const depthFilters = new Map();
const depthHighlights = new Map();
const STORAGE_KEY = "sideline.teams.v1";
const cardViews = new Map();
let feed = null,
  selected = [],
  weekKey = "",
  activeMode = "live",
  loading = false;
let contributions = null,
  contributionError = "",
  pendingClock = false,
  renderedClockKey = "";
let productionHistory = null, productionHistoryError = "";
let playerHistory = null, playerHistoryError = "";
let injuryHistory = null, injuryHistoryError = "";
let coordinators = null;
let defenseStats = null, defenseStatsError = "";
let defenseRanks = { available: false, reason: "Defensive statistics unavailable", teams: new Map(), leaders: new Map() };
const leaderNames = { tackles: "Combined tackles", sacks: "Sacks", interceptions: "Interceptions" };
function leaderSummary(member) {
  const leader = defenseRanks.leaders.get(member.id);
  return leader?.categories.map((metric) => leaderNames[metric.key] + " " + rankLabel(metric.rank, metric.tied) + ": " + metric.value).join("; ") || "";
}
function appendLeaderStar(control, member) {
  const summary = leaderSummary(member);
  if (!summary) return;
  const star = node("span", "★", "leader-star");
  star.setAttribute("aria-hidden", "true");
  star.title = summary;
  control.append(star);
  control.setAttribute("aria-label", (control.getAttribute("aria-label") || member.name) + ". League top 10. " + summary);
}
function appendDefenseSources(panel) {
  panel.append(facts([["Defensive statistics", defenseRanks.available
    ? defenseRanks.season + " REG · through week " + defenseRanks.throughWeek
    : defenseRanks.reason]]));
  if (defenseStatsError) panel.append(facts([["Statistics refresh", defenseStatsError]]));
  if (!defenseStats) return;
  panel.append(facts([
    ["YPG allowed", "Opponent net passing + rushing yards / recorded games"],
    ["Takeaways", "Interceptions + opponent fumbles recovered"],
    ["Combined tackles", "Solo + tackles with assist + tackle assists"],
    ["Rank", "Competition rank; T marks ties; all rank-10 ties qualify"],
    ["Window", "Prior regular-season weeks only; 24-hour settlement guard"],
    ["History", "Reconstructed with current source corrections"],
    ["Player coverage", defenseRanks.available && !defenseRanks.playerCoverage ? "Incomplete · stars unavailable" : "Reconciled team-game totals required"],
  ]));
  for (const source of defenseStats.sources) panel.append(link(source.label, source.url), facts([
    ["File updated", time(source.source_updated_at)], ["Collected", time(source.retrieved_at)],
  ]));
  panel.append(link("nflverse defensive statistics · CC BY 4.0", DEFENSE_STATS_TERMS));
}
function renderDefenseMetrics(result) {
  const metrics = node("div", undefined, "defense-metrics"), totals = defenseRanks.teams.get(result.opponent);
  metrics.setAttribute("role", "group");
  metrics.setAttribute("aria-label", result.opponent + " defensive statistics, " + (totals
    ? defenseRanks.season + " regular season through week " + defenseRanks.throughWeek + ", " + totals.games + " recorded games"
    : defenseRanks.reason));
  for (const [key, short, label] of [["ypg", "YPG", "Yards allowed per game"], ["sacks", "Sacks", "Sacks"], ["takeaways", "Takeaways", "Takeaways"]]) {
    const value = totals ? (key === "ypg" ? totals[key].toFixed(1) : String(totals[key])) : "?";
    const rank = totals ? rankLabel(totals.ranks[key], totals.ties[key]) : "?";
    const metric = node("div", undefined, "defense-metric");
    metric.setAttribute("role", "group");
    metric.setAttribute("aria-label", label + ": " + (totals ? value + ", " + (totals.ties[key] ? "tied " : "") + "rank " + totals.ranks[key] : "unavailable"));
    metric.append(node("span", value + " " + short, "metric-value"), node("span", rank, "metric-rank"));
    for (const child of metric.children) child.setAttribute("aria-hidden", "true");
    metrics.append(metric);
  }
  return metrics;
}
let pendingFeed = null,
  refreshPhase = "loading";
let lastCheck = 0,
  autoWeek = true,
  lastError = "",
  teamAssets = {};
const dateTime = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
const kickoffTime = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const day = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const mobile = () => matchMedia("(max-width: 720px)").matches;
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function button(text, action, className) {
  const el = node("button", text, className);
  el.type = "button";
  if (action) el.addEventListener("click", action);
  return el;
}
function link(label, url) {
  const el = node("a", label);
  if (safeUrl(url)) {
    el.href = url;
    el.rel = "noopener noreferrer";
  }
  return el;
}
function time(value) {
  return value ? dateTime.format(new Date(value)) : "not supplied";
}
function vintage(item) {
  if (item.reported_at) return time(item.reported_at);
  if (item.reported_date)
    return (
      day.format(new Date(item.reported_date + "T00:00:00Z")) +
      " (time not supplied)"
    );
  return "not supplied";
}
function facts(pairs) {
  const list = node("dl");
  for (const [label, value] of pairs)
    list.append(node("dt", label), node("dd", value));
  return list;
}
function announce(text) {
  $("message").textContent = text;
}
function readSelection() {
  try {
    const cards = restoreCards(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    for (const card of cards) cardViews.set(card.team, card);
    return cards.map((card) => card.team);
  } catch { return []; }
}
function saveSelection() {
  if (activeMode !== "live") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selected.map((team) => cardViews.get(team)))); }
  catch { /* Optional browser storage. */ }
}
function teamName(team) { return teamAssets[team]?.name || team; }
function asOf(meta, label = "") {
  const observed = meta?.observed_at || meta?.reported_at || meta?.reported_date;
  const updated = observed || meta?.source_updated_at || meta?.checked_at;
  return (label ? label + " · " : "") + "as of " + (updated ? day.format(new Date(updated)) : "unknown") +
    (!observed && !meta?.checked_at ? " · file update" : "") +
    (meta?.retrieved_at ? " · collected " + day.format(new Date(meta.retrieved_at)) : "") +
    (label === "Injuries" && meta && !meta.reported_at && !meta.reported_date ? " · report date unknown" : "");
}
function stamp(meta, label) { return node("p", asOf(meta, label), "as-of"); }
function sourceFor(id) {
  return feed.sources.find((source) => source.id === id);
}
function openSearch() {
  dismissPopover();
  $("search").focus();
}
function teamMark(team) {
  const asset = teamAssets[team];
  const mark = node(
    "span",
    undefined,
    "team-mark" + (asset ? "" : " team-monogram"),
  );
  mark.setAttribute("aria-hidden", "true");
  if (asset) {
    const img = document.createElement("img");
    img.src = asset.url;
    img.alt = "";
    img.width = 64;
    img.height = 64;
    img.addEventListener(
      "error",
      () => {
        mark.replaceChildren(document.createTextNode(team));
        mark.classList.add("team-monogram");
      },
      { once: true },
    );
    mark.append(img);
  } else mark.textContent = team;
  return mark;
}
function closeSearch() {
  $("search-results").hidden = true;
}
function renderSearch() {
  const list = $("search-results"), query = $("search").value.trim().toLowerCase();
  list.replaceChildren();
  if (!feed || !query) { closeSearch(); return; }
  list.hidden = false;
  const teams = TEAMS.filter((team) => (team + " " + teamName(team)).toLowerCase().includes(query))
    .sort((a, b) => Number(b === query.toUpperCase()) - Number(a === query.toUpperCase()));
  for (const team of teams) {
    const choice = button("", () => addTeam(team), "search-choice");
    choice.disabled = selected.length >= MAX_SELECTIONS && !selected.includes(team);
    choice.setAttribute("aria-label", "Open " + teamName(team) + " team");
    choice.append(teamMark(team), node("strong", teamName(team)), node("small", team));
    list.append(choice);
  }
  const matches = searchPlayers(feed, query).slice(0, 24);
  for (const player of matches) {
    const choice = button("", () => addTeam(player.team, player.id), "search-choice");
    choice.disabled = selected.length >= MAX_SELECTIONS && !selected.includes(player.team);
    choice.setAttribute("aria-label", "Focus " + player.name + ", " + player.team + ", " + player.position);
    const info = node("span", undefined, "player-info");
    info.append(node("strong", player.name), node("small", player.team + " · " + player.position));
    choice.append(info, node("span", "+", "add")); list.append(choice);
  }
  if (!teams.length && !matches.length) list.append(node("p", "No matches", "search-empty"));
  $("search-status").textContent = teams.length + " teams and " + matches.length + " players";
}
function addTeam(team, focusId = "") {
  if (!selected.includes(team)) {
    if (selected.length >= MAX_SELECTIONS) return;
    selected.push(team);
    cardViews.set(team, { team, side:focusId ? "opponent" : "own", unit:"defense", focusId });
  } else if (focusId) cardViews.get(team).focusId = focusId;
  saveSelection(); $("search").value = ""; closeSearch(); dismissPopover(); renderCards();
  announce(teamName(team) + " open");
  if (mobile()) document.querySelector('[data-team="' + team + '"]')?.scrollIntoView({block:"nearest"});
  else $("search").focus();
}
function removePlayer(team) {
  selected = selected.filter((value) => value !== team); cardViews.delete(team);
  saveSelection(); dismissPopover(); renderCards(); announce(teamName(team) + " removed");
  document.querySelector(".remove")?.focus();
}
function renderWeeks() {
  const select = $("week"),
    current = currentWeek(feed);
  if (activeMode === "example") {
    if (!weekKey) weekKey = feed.weeks.at(-1)?.key || "";
  } else if (autoWeek || !feed.weeks.some((week) => week.key === weekKey))
    weekKey = current?.key || "";
  const expected =
    feed.weeks.map((week) => week.key).join("|") + "|" + Boolean(weekKey);
  if (select.dataset.options !== expected) {
    select.replaceChildren();
    if (!weekKey) {
      const option = node("option", "Week unavailable");
      option.value = "";
      select.append(option);
    }
    for (const week of feed.weeks) {
      const option = node("option", week.label + " · " + week.season);
      option.value = week.key;
      select.append(option);
    }
    select.dataset.options = expected;
  }
  select.value = weekKey;
  select.disabled = !feed.weeks.length;
  const injuryUpdated = $("injury-updated");
  const injurySource = feed.reports.find(
    (report) => report.source_id === "nflverse-injuries",
  );
  injuryUpdated.hidden = activeMode !== "live";
  injuryUpdated.textContent = "Injury data updated " + time(injurySource?.source_updated_at);
}
function renderStatus() {
  const status = $("data-status");
  const stateKey = JSON.stringify([
    lastError,
    activeMode,
    Boolean(feed && Date.now() - Date.parse(feed.generated_at) > 86400000),
  ]);
  if (status.dataset.state === stateKey) return;
  status.dataset.state = stateKey;
  status.replaceChildren();
  status.hidden =
    !lastError &&
    activeMode !== "example" &&
    (!feed || Date.now() - Date.parse(feed.generated_at) <= 86400000);
  $("info").classList.toggle(
    "stale",
    Boolean(
      lastError ||
        (feed && Date.now() - Date.parse(feed.generated_at) > 86400000),
    ),
  );
  if (status.hidden) return;
  status.append(
    node(
      "span",
      activeMode === "example"
        ? "Fictional example"
        : lastError
          ? "Refresh unavailable"
          : "Old collection",
    ),
  );
  if (lastError) status.append(button("Retry", () => loadFeed("live")));
  else if (activeMode === "example")
    status.append(button("Exit", () => loadFeed("live")));
}
function teamCoordinators(team) {
  return coordinatorFor(coordinators, team, {
    mode: activeMode, season: feed?.weeks.find(week => week.key === weekKey)?.season,
  });
}
function appendCoachingEvidence(panel, record) {
  const source = node("p");
  for (const [index, url] of record.sources.entries()) {
    if (index) source.append(document.createTextNode(" · "));
    source.append(link("Source " + (index + 1), url));
  }
  panel.append(source, stamp({checked_at:record.checked_at}, "Coaching"), facts([["Checked", time(record.checked_at)]]));
}
function appendCoordinatorSources(panel, team) {
  const records = teamCoordinators(team);
  if (!records) return;
  const details = node("details", undefined, "source-block");
  const exception = records[0].role === "hc_playcaller";
  details.append(node("summary", (exception ? "Defensive leadership" : "Coordinator") + " · " + records.map(record => record.name).join(" / ")));
  for (const record of records) {
    details.append(facts([["Role", record.title], ["Since season", String(record.start_season)], ["Checked", time(record.checked_at)], ["Maintenance", "Manual"]]));
    for (const [index, url] of record.sources.entries()) {
      const source = node("p");
      source.append(link(index ? "Role source" : "Team biography", url));
      details.append(source);
    }
  }
  const history = coordinators.history.find(record => record.team === team);
  if (history) {
    if (history.predecessors.length) {
      const predecessors = node("details", undefined, "source-block");
      predecessors.append(node("summary", "Prior coordinators"));
      for (const record of history.predecessors) {
        const label = {immediate:"Predecessor", previous_season:"Previous season", previous_formal:"Earlier formal role"}[record.relationship];
        predecessors.append(node("h3", label + " · " + record.name));
        predecessors.append(node("p", record.title + " · " + coachingSeasons(record) + (record.scope ? " · " + record.scope : "")));
        appendCoachingEvidence(predecessors, record);
      }
      details.append(predecessors);
    }
    if (history.prior_jobs.length) {
      const jobs = node("details", undefined, "source-block");
      jobs.append(node("summary", "Prior jobs · selected records"));
      for (const record of history.prior_jobs) {
        jobs.append(node("h3", record.organization + " · " + coachingSeasons(record)));
        jobs.append(node("p", record.title + (record.scope ? " · " + record.scope : "")));
        appendCoachingEvidence(jobs, record);
      }
      details.append(jobs);
    }
    if (history.play_callers.length) {
      const callers = node("details", undefined, "source-block");
      callers.append(node("summary", "Defensive play-calling · recorded seasons"));
      for (const record of history.play_callers) {
        callers.append(node("h3", record.name + " · " + record.organization + " · " + record.season));
        callers.append(node("p", record.title + (record.scope ? " · " + record.scope : "")));
        appendCoachingEvidence(callers, record);
      }
      details.append(callers);
    }
  }
  panel.append(details);
}
function sourceDetails() {
  const panel = node("div");
  panel.append(node("h2", "Sources & information"));
  if (lastError)
    panel.append(
      node(
        "p",
        (activeMode === "example" && feed
          ? "Fictional data remains on screen. "
          : feed
            ? "Previously loaded data remains on screen. "
            : "Current NFL data is unavailable. ") + lastError,
      ),
    );
  if (activeMode === "example")
    panel.append(
      node(
        "p",
        "Fictional example: every player, matchup and injury is invented.",
      ),
    );
  panel.append(
    node(
      "p",
      "Refresh checks the latest shared file on this site; it cannot force an upstream injury update. Visible tabs check every five minutes, backing off after failures. Browser last checked: " +
        (lastCheck ? time(new Date(lastCheck).toISOString()) : "not yet") +
        ".",
    ),
  );
  if (feed) {
    panel.append(
      node(
        "p",
        activeMode === "example"
          ? "Fictional source data. These are not NFL reports."
          : "nflverse injury, roster and depth-chart files normally update daily. sideline checks every four hours; GitHub runs can be delayed. Report timestamps are not supplied by the current injury source.",
      ),
    );
    panel.append(
      facts([
        ["Collected", time(feed.generated_at)],
        ["Collection age", collectionAgeLabel(feed.generated_at)],
        ["Selections", selected.length + " / " + MAX_SELECTIONS],
      ]),
    );
    for (const [label, meta] of [
      ["Roster", feed.roster],
      ["Schedule", feed.schedule],
      ...(feed.depth ? [["Depth chart", feed.depth]] : []),
    ]) {
      const block = node("div", undefined, "source-block"),
        source = sourceFor(meta.source_id);
      block.append(
        link(label + " · " + source.label, source.url),
        facts([
          ["Report vintage", vintage(meta)],
          ["File updated", time(meta.source_updated_at)],
          ["Collected", time(meta.retrieved_at)],
        ]),
      );
      panel.append(block);
    }
    const block = node("div", undefined, "source-block");
    for (const source of feed.sources) {
      const p = node("p");
      p.append(
        link(source.label, source.url),
        document.createTextNode(" · "),
        link(
          activeMode === "example" ? "License" : "CC BY 4.0",
          source.terms_url,
        ),
      );
      block.append(p);
    }
    panel.append(
      block,
      node(
        "p",
        activeMode === "example"
          ? "The example is a static fictional fixture and does not update."
          : "nflverse data are filtered, normalized and joined by sideline. Source-file updates and collection times are not report publication times. Team roster, first-depth observations and injury entries are shown; independent completeness and current availability are not established.",
        "small",
      ),
    );
  }
  panel.append(
    node(
      "p",
      "Selections stay in this browser. No accounts, analytics or per-visitor provider requests.",
      "small",
    ),
  );
  panel.append(
    node(
      "p",
      "Defender details include recorded 2025 regular-season events and optional 2024 history for their historical team(s), not current defensive quality or snap share. QB hits and sacks describe passing disruption; PD means passes defended and INT interceptions. Coverage events do not measure coverage efficiency. Any highest-available-total comparison is for a named measure, including ties and excluding missing records. Counts have no exposure denominator. Missing history stays unknown; there is no validated injury-advantage score.",
      "small",
    ),
  );
  if (contributionError)
    panel.append(
      node(
        "p",
        contributionError +
          (contributions
            ? " Previously loaded historical counts remain visible."
            : ""),
        "small",
      ),
    );
  if (contributions || productionHistory)
    panel.append(
      link("Historical event data · CC BY 4.0", (contributions || productionHistory).source.terms_url),
    );
  if (injuryHistoryError) panel.append(facts([["Injury archive", injuryHistoryError]]));
  if (injuryHistory) panel.append(link("Injury archive · CC BY 4.0", injuryHistory.source.terms_url));
  if (playerHistoryError) panel.append(facts([["Player history", playerHistoryError]]));
  if (playerHistory) panel.append(link("Player history data · CC BY 4.0", PLAYER_HISTORY_TERMS));
  const coveredTeams = [...new Set(coordinators?.appointments.map(record => record.team))]
    .filter(team => teamCoordinators(team));
  if (coveredTeams.length) {
    const details = node("details", undefined, "source-block");
    details.append(node("summary", "Defensive coaching · " + coveredTeams.length + " / 32 teams"));
    for (const team of coveredTeams) appendCoordinatorSources(details, team);
    panel.append(details);
  }
  if (productionHistoryError) panel.append(facts([["2024 production", productionHistoryError]]));
  const links = node("div", undefined, "info-links");
  for (const [label, url] of [
    ["snowball", "https://snowball-projects.github.io/"],
    ["Source", "https://github.com/snowball-projects/sideline"],
    ["Data and image credits", "https://snowball-projects.github.io/sideline/THIRD-PARTY-NOTICES.md"],
    ["Operations", "https://snowball-projects.github.io/operations/#sideline"],
    ["MIT", "https://snowball-projects.github.io/sideline/LICENSE"],
  ])
    links.append(link(label, url));
  panel.append(links);
  const legend = node("div", undefined, "status-legend");
  for (const [key, short, label] of STATUS_LEGEND.filter(([key]) =>
    ["questionable", "doubtful", "out", "limited", "dnp", "unknown"].includes(
      key,
    ),
  ))
    legend.append(
      node("span", short + " · " + label, "legend-item state-" + key),
    );
  panel.append(
    legend,
  );
  if (!feed)
    panel.append(
      button("Try fictional example", () => {
        dismissPopover();
        loadFeed("example");
      }),
    );
  return panel;
}
function reportDetails(result) {
  const panel = node("div"),
    report = result.report;
  panel.append(node("h2", (result.opponent || "Opponent") + " report"));
  if (result.unit === "defense") {
    appendCoordinatorSources(panel, result.team);
    if (result.team) appendDefenseSources(panel);
  }
  if (!report) {
    panel.append(node("p", result.message));
    return panel;
  }
  const source = sourceFor(report.source_id);
  panel.append(
    link(source.label, source.url),
    facts([
      [
        result.unit === "offense" ? "Offensive injury entries" : "Defensive injury entries",
        String(
          report.entries.filter((entry) =>
            (result.unit === "offense" ? OFFENSIVE_POSITIONS : DEFENSIVE_POSITIONS).has(entry.position),
          ).length,
        ),
      ],
      ["Coverage", report.coverage],
      ["Original report date", vintage(report)],
      ["Source injury file updated", time(report.source_updated_at)],
      ["sideline collected", time(report.retrieved_at)],
      ["Collection age", collectionAgeLabel(feed.generated_at)],
      [
        "Browser checked",
        lastCheck ? time(new Date(lastCheck).toISOString()) : "not yet",
      ],
    ]),
  );
  if (!report.reported_at && !report.reported_date)
    panel.append(
      node(
        "p",
        "Report date and time are not supplied. Current game availability cannot be confirmed from this file.",
      ),
    );
  const warnings = [];
  if (result.rosterStale)
    warnings.push("Roster context is old; team membership may have changed.");
  if (result.scheduleStale)
    warnings.push(
      "Schedule context is old; the opponent or kickoff may have changed.",
    );
  if (result.stale || result.sourceFileStale || result.retrievalStale)
    warnings.push(
      "Report, source file or collection is old. Newer information may be missing.",
    );
  if (result.sourceFileUnknown)
    warnings.push("Source-file update time is unknown.");
  if (result.started)
    warnings.push(
      "The source marks this game in progress or finished; this is not a preserved pre-game recommendation.",
    );
  if (!result.started && result.kickoffPassed)
    warnings.push(
      "Scheduled start has passed; the source does not confirm whether the game is in progress or finished.",
    );
  if (result.reportedAfterKickoff)
    warnings.push("Report issued at or after kickoff.");
  for (const warning of warnings) panel.append(node("p", warning));
  panel.append(
    node(
      "p",
      "Roster and injury coverage may be partial. First depth does not confirm game participation. Missing reports never establish health.",
      "small",
    ),
  );
  return panel;
}
function appendProductionCounts(block, history) {
  block.append(node("div",
    history.record.teams.map((team) => team.team).join(" / ") + " · " +
    history.allMetrics.map((metric) => metric.value + " " + metric.short).join(" · "),
    "production-counts"));
  if (history.record.teams.length > 1)
    for (const team of history.record.teams)
      block.append(node("div", team.team + ": " + team.sacks + " sacks · " +
        team.qb_hits + " QB hits · " + team.passes_defended + " PD · " +
        team.interceptions + " INT", "small"));
}
function memberDetails(member, result) {
  const panel = node("div");
  panel.append(node("h2", member.name + " · " + member.position), stamp(result.report, "Injuries"));
  if (member.relevant) panel.append(node("p", member.relevance + " · broad position context; individual assignment unknown", "small"));
  const leagueLeader = defenseRanks.leaders.get(member.id);
  if (leagueLeader) {
    panel.append(node("h3", defenseRanks.season + " REG · through week " + defenseRanks.throughWeek), stamp({source_updated_at:defenseStats?.sources[0]?.source_updated_at, retrieved_at:defenseStats?.generated_at}, "Statistics"));
    panel.append(facts(leagueLeader.categories.map((metric) => [leaderNames[metric.key], rankLabel(metric.rank, metric.tied) + " · " + metric.value])));
    panel.append(facts([["Recorded teams", leagueLeader.teams.join(" / ")]]));
  }
  if (member.depth.length)
    panel.append(node("div", member.depth.map((entry) =>
      entry.position + " #" + entry.rank).join(" · "), "small"));
  if (member.injury) {
    const entry = member.injury;
    panel.append(facts([
      ["Injury", entry.injury],
      ["Game", entry.game_status === "Not listed" ? "No designation" : entry.game_status],
      ["Practice · undated", entry.practice_status === "Not listed" ? "Not reported" : entry.practice_status],
    ]));
    // Retain unrecognized source values, without repeating the source's generic
    // report-date caveat in every defender popup.
    const note = entry.note?.replace(
      "Source supplies no report date; the designation may predate the dataset update.",
      "",
    ).trim();
    if (note) panel.append(node("div", note, "small"));
  } else {
    panel.append(facts([["Status", fieldStatus(member, Boolean(result.report),
      result.report?.coverage).label]]));
  }
  if (member.reportOnly)
    panel.append(facts([["Identity", member.historical ? "Report identity · historical roster membership unknown" : "Report only · absent from current team roster"]]));

  const history = defenderContribution(contributions, member.id,
    metricPerspective(result.player.position, member.position));
  if (history) {
    const historyBlock = node("div", undefined, "source-block");
    historyBlock.append(node("h3", "2025 REG · recorded production"), stamp(contributions.source, "Production"));
    appendProductionCounts(historyBlock, history);
    panel.append(historyBlock);
  }

  const bio = bioFacts(member.bio);
  const rosterHistory = playerHistoryFor(playerHistory, member.id);
  if (rosterHistory?.rookie_season !== null && rosterHistory?.rookie_season !== undefined) {
    const duplicate = bio.findIndex(([label, value]) => label === "NFL eligible since" && value === String(rosterHistory.rookie_season));
    if (duplicate >= 0) bio.splice(duplicate, 1);
    bio.splice(bio[0]?.[0] === "Age / born" ? 1 : 0, 0, ["Rookie season", String(rosterHistory.rookie_season)]);
  }
  const records = playerInjuryRecords(feed, member.id, weekKey);
  const archiveRecords = archivedInjuryRecords(injuryHistory, member.id);
  const olderProduction = defenderContribution(productionHistory, member.id,
    metricPerspective(result.player.position, member.position));
  if (bio.length || records.length || archiveRecords.length || olderProduction || rosterHistory?.rosters.length) {
    const details = node("details", undefined, "source-block player-details");
    details.append(node("summary", "Player details"));
    let rendered = false;
    details.addEventListener("toggle", () => {
      if (!details.open || rendered) return;
      rendered = true;
      if (bio.length) {
        details.append(node("h3", "Bio"), stamp(feed.roster, "Bio"), facts(bio));
      }
      if (olderProduction) {
        const production = node("details", undefined, "production-history");
        production.append(node("summary", "2024 REG · recorded production"), stamp(productionHistory.source, "Production"));
        appendProductionCounts(production, olderProduction);
        details.append(production);
      }
      if (rosterHistory?.rosters.length) {
        const rosters = node("details", undefined, "roster-history");
        rosters.append(node("summary", "Observed rosters · 2025–2026"));
        for (const source of playerHistory.sources) rosters.append(stamp(source, source.label));
        for (const record of rosterHistory.rosters)
          rosters.append(node("div", record.season + " " + record.game_type + " · " +
            record.team + " · " + observedWeeksLabel(record.weeks), "roster-observation"));
        details.append(rosters);
      }
      if (records.length || archiveRecords.length) {
        const historyBlock = node("details", undefined, "injury-history");
        const summary = node("summary");
        const contents = node("div", undefined, "injury-records");
        const seasons = new Map();
        if (records.length) seasons.set(String(records[0].week.season), records);
        if (archiveRecords.length) seasons.set("2025", archiveRecords);
        let selectedSeason = seasons.keys().next().value;
        historyBlock.append(summary);
        const renderRecords = () => {
          const chosen = seasons.get(selectedSeason);
          const weeks = new Set(chosen.map(({ week }) => week.key)).size;
          summary.textContent = selectedSeason + " injury records · " + weeks + " reported " + (weeks === 1 ? "week" : "weeks");
          contents.replaceChildren();
          for (const { week, report, entry } of chosen) {
            const record = node("div", undefined, "injury-record");
            record.append(node("h3", week.label + " · " + report.team), stamp(report.source_updated_at ? report : week.season === 2025 ? injuryHistory?.source : report, "Injuries"), facts([
              ["Injury", entry.injury],
              ["Practice · undated", entry.practice_status === "Not listed" ? "Not reported" : entry.practice_status],
              ["Game", entry.game_status === "Not listed" ? "No designation" : entry.game_status],
            ]));
            const note = entry.note?.replace("Source supplies no report date; the designation may predate the dataset update.", "").trim();
            if (note) record.append(node("div", note, "small"));
            contents.append(record);
          }
          refreshPopover();
        };
        if (seasons.size > 1) {
          const label = node("label", "Season ", "injury-season");
          const select = node("select"); select.setAttribute("aria-label", "Injury record season");
          for (const season of seasons.keys()) { const option = node("option", season); option.value = season; select.append(option); }
          select.value = selectedSeason;
          select.addEventListener("change", () => { selectedSeason = select.value; renderRecords(); });
          label.append(select); historyBlock.append(label);
        }
        historyBlock.append(contents);
        renderRecords(); details.append(historyBlock);
      }
      refreshPopover();
    });
    panel.append(details);
  }

  const sources = node("details", undefined, "source-block");
  sources.append(node("summary", "Sources and timestamps"));
  sources.append(facts([["Site collection age", collectionAgeLabel(feed.generated_at)]]));
  if (result.report) {
    const source = sourceFor(result.report.source_id);
    sources.append(link(source.label, source.url), facts([
      ["Coverage", result.report.coverage],
      ["Report time", vintage(result.report)],
      ["Injury file", time(result.report.source_updated_at)],
      ["Collected", time(result.report.retrieved_at)],
    ]));
  }
  if (!result.report && records.length) {
    const report = records[0].report;
    const source = sourceFor(report.source_id);
    sources.append(link(source.label, source.url), facts([
      ["History injury file", time(report.source_updated_at)],
      ["History collected", time(report.retrieved_at)],
    ]));
  }
  if (archiveRecords.length) sources.append(link(injuryHistory.source.label, injuryHistory.source.url), facts([
    ["Archive file", time(injuryHistory.source.source_updated_at)], ["Archive collected", time(injuryHistory.source.retrieved_at)],
  ]));
  if (history) {
    sources.append(link("nflverse 2025 stats", contributions.source.url), facts([
      ["Stat rows", String(history.record.recorded_games)],
      ["Stats file", time(contributions.source.source_updated_at)],
      ["Collected", time(contributions.source.retrieved_at)],
    ]));
  }
  if (olderProduction) sources.append(link("nflverse 2024 stats", productionHistory.source.url), facts([
    ["2024 stat rows", String(olderProduction.record.recorded_games)],
    ["2024 stats file", time(productionHistory.source.source_updated_at)],
    ["Collected", time(productionHistory.source.retrieved_at)],
  ]));
  const rosterSource = sourceFor(feed.roster.source_id);
  sources.append(link(rosterSource.label, rosterSource.url), facts([
    ["Roster collected", time(feed.roster.retrieved_at)],
  ]));
  if (rosterHistory) {
    const sourceIds = new Set(rosterHistory.rosters.map((record) => `nflverse-weekly-roster-${record.season}`));
    if (rosterHistory.rookie_season !== null) sourceIds.add("nflverse-player-reference");
    for (const source of playerHistory.sources.filter((source) => sourceIds.has(source.id)))
      sources.append(link(source.label, source.url), facts([
        ["History file", time(source.source_updated_at)], ["Collected", time(source.retrieved_at)],
      ]));
  }
  if (member.depth.length) {
    const depthSource = sourceFor(feed.depth.source_id);
    sources.append(link(depthSource.label, depthSource.url), facts([
      ["Chart observed", time(member.depth[0].observed_at)],
    ]));
  }
  panel.append(sources);
  return panel;
}
function attachMemberDetails(control, member, result, preview = false) {
  attachPopover(
    control,
    () => {
      // Re-resolve on every activation so a deferred clock/feed update cannot
      // revive stale source depth or a previous opponent's defender.
      const card = cardViews.get(result.cardTeam);
      const current = card && cardContext(feed, card, weekKey);
      const memberNow = current && cardRoster(feed, current, weekKey).find((entry) => entry.id === member.id);
      return memberNow ? memberDetails(memberNow, current) : node("p", "Player details unavailable");
    },
    { label: member.name + " roster and injury details", preview },
  );
}
function renderMember(member, result) {
  const pills = memberPills(member);
  const status = fieldStatus(member, Boolean(result.report), result.report?.coverage);
  const key = status.key;
  const item = node("li", undefined, "injury depth-row"),
    row = button("", null, "injury-row state-" + key);
  row.dataset.focusKey = "injury:" + member.id;
  row.dataset.defenderId = member.id;
  row.classList.toggle("player-focused", member.focused);
  row.classList.toggle("player-relevant", member.relevant);
  row.setAttribute(
    "aria-label",
    member.name +
      ", " +
      member.position +
      ". " +
      depthSummary(member) +
      ". " +
      (member.injury
        ? "Injury: " +
          member.injury.injury +
          ". Game: " +
          member.injury.game_status +
          ". Practice: " +
          member.injury.practice_status
        : status.label) +
      ".",
  );
  const identity = node("span", undefined, "member-identity");
  identity.append(
    node("span", member.name, "injury-name"),
    node("span", member.position, "member-position"),
  );
  row.append(identity);
  if (member.starter) identity.append(node("span", "1st", "starter-label"));
  if (pills.injury || status.text) {
    const badges = node("span", undefined, "member-pills");
    badges.setAttribute("aria-hidden", "true");
    if (pills.injury)
      badges.append(node("span", pills.injury, "member-pill pill-injury"));
    if (status.text)
      badges.append(
        node(
          "span",
          status.text,
          "member-pill pill-status",
        ),
      );
    row.append(badges);
  }
  row.append(
    node(
      "span",
      depthSummary(member),
      "member-depth",
    ),
  );
  if (member.relevant) row.append(node("span", member.relevance, "member-relevance"));
  appendLeaderStar(row, member);
  attachMemberDetails(row, member, result);
  item.append(row);
  return item;
}
function renderField(members, result, showDepth) {
  const field = node("section", undefined, "defense-field");
  field.setAttribute(
    "aria-label",
    result.team + " " + result.unit + " position schematic, source depth only",
  );
  const caption = node(
    "p",
    "First depth · game lineup unconfirmed",
    "field-caption",
  );
  const observed = members.flatMap((member) => member.depth).map((entry) => entry.observed_at).sort().at(-1);
  const dated = stamp({observed_at:observed}, "Depth chart");
  const pitch = node("div", undefined, "defender-grid");
  for (const family of fieldLayout(members, result.unit)) {
    const band = node(
      "div",
      undefined,
      "defender-band band-" + family.position.toLowerCase(),
    );
    for (const group of family.groups) {
      const cluster = node("div", undefined, "position-cluster");
      const markers = node("div", undefined, "position-markers");
      for (const columns of [3, 4, 5, 7])
        markers.style.setProperty(
          "--markers-" + columns,
          Math.min(columns, Math.max(1, group.representatives.length)),
        );
      for (const member of group.representatives) {
        const status = fieldStatus(member, Boolean(result.report), result.report?.coverage);
        const marker = button("", null, "defender-marker state-" + status.key);
        marker.dataset.focusKey = "defender:" + member.id;
        marker.dataset.defenderId = member.id;
        marker.classList.toggle("player-focused", member.focused);
        marker.classList.toggle("player-relevant", member.relevant);
        marker.setAttribute(
          "aria-label",
          member.name +
            ", " +
            group.position +
            " published chart position. " +
            status.label +
            ". " +
            depthSummary(member),
        );
        marker.append(
          node("span", compactMarkerName(member.name), "defender-name"),
          node("span", group.position, "defender-position"),
        );
        if (status.text)
          marker.append(node("span", status.text, "marker-status"));
        for (const child of marker.children)
          child.setAttribute("aria-hidden", "true");
        appendLeaderStar(marker, member);
        attachMemberDetails(marker, member, result, true);
        markers.append(marker);
      }
      if (!group.representatives.length) {
        const stack = button(
          "",
          () => showDepth(group.position),
          "defender-stack",
        );
        stack.dataset.focusKey = "stack:" + group.position;
        stack.setAttribute(
          "aria-label",
          group.position +
            " position group, " +
            group.members.length +
            " players. First-depth identities unavailable.",
        );
        stack.append(
          node("span", String(group.members.length), "defender-x"),
          node("span", group.position, "defender-position"),
        );
        for (const child of stack.children)
          child.setAttribute("aria-hidden", "true");
        markers.append(stack);
      }
      const count = button(
        group.position +
          " depth · " +
          group.members.length +
          (group.outCount ? " · " + group.outCount + " OUT" : ""),
        () => showDepth(group.position),
        "position-stack" + (group.outCount ? " has-out" : ""),
      );
      count.dataset.focusKey = "depth:" + group.position;
      count.setAttribute(
        "aria-label",
        group.position +
          " depth, " +
          group.members.length +
          " defenders" +
          (group.outCount ? ", " + group.outCount + " reported Out" : "") +
          ".",
      );
      cluster.append(markers, count);
      band.append(cluster);
    }
    pitch.append(band);
  }
  const line = node("div", "Line of scrimmage", "line-of-scrimmage");
  line.setAttribute("aria-hidden", "true");
  const reference = node("p", result.focus ? "Focus · " + result.focus.name + " · " + result.focus.position : "No player focus", "field-reference" + (result.focus ? " player-focused" : ""));
  field.append(caption, dated, pitch, line, reference);
  return field;
}
function renderDepth(members, result) {
  const panel = node("section", undefined, "depth-panel");
  panel.setAttribute(
    "aria-label",
    result.team + " starters and injuries",
  );
  const header = node("div", undefined, "depth-heading");
  header.append(
    node("h3", "Starters & injuries"),
    node("span", members.length + " in source", "defender-count"),
  );
  const tabs = node("div", undefined, "status-tabs");
  tabs.setAttribute("role", "group");
  tabs.setAttribute("aria-label", "Availability filters");
  const entries = node("div", undefined, "injury-list depth-rows");
  entries.id = "depth-" + result.player.id;
  const filterKey = result.cardTeam + ":" + result.team + ":" + result.unit + ":" + weekKey;
  const highlightNotice = node("div", undefined, "depth-highlight");
  const applyFilter = (key) => {
    depthFilters.set(filterKey, key);
    for (const tab of tabs.children)
      tab.setAttribute("aria-pressed", String(tab.dataset.filter === key));
    const ordered = members;
    const shown = filterDefenders(ordered, key);
    entries.replaceChildren();
    const list = node("ul", undefined, "roster-rows");
    const highlighted = depthHighlights.get(filterKey);
    for (const member of shown) {
      const row = renderMember(member, result);
      row.classList.toggle(
        "position-highlight",
        memberHasChartPosition(member, highlighted),
      );
      list.append(row);
    }
    highlightNotice.replaceChildren();
    highlightNotice.hidden = !highlighted;
    if (highlighted) {
      const clear = button(
        "Clear highlight",
        () => {
          depthHighlights.delete(filterKey);
          applyFilter("all");
          tabs.firstElementChild.focus({ preventScroll: true });
        },
        "depth-reset",
      );
      clear.dataset.focusKey = "clear-highlight";
      highlightNotice.append(
        node("span", "Highlighted: " + highlighted + " depth"),
        clear,
      );
    }
    entries.append(list);
    if (!shown.length)
      entries.append(
        node(
          "p",
          result.report
            ? "No reported " +
                (key === "out" ? "Out" : "uncertain") +
                " players."
            : "Injury status unknown",
          "depth-empty",
        ),
      );
  };
  for (const [key, label] of STATUS_FILTERS) {
    const tab = button(label, () => {
      dismissPopover();
      applyFilter(key);
      entries.scrollTop = 0;
      announce(label + " defenders shown for " + result.player.name + ".");
    });
    tab.dataset.filter = key;
    tab.dataset.focusKey = "filter:" + key;
    tab.setAttribute("aria-controls", entries.id);
    tabs.append(tab);
  }
  applyFilter(depthFilters.get(filterKey) || "all");
  panel.append(header, stamp(result.report, "Injuries"), stamp(result.historical ? null : feed.roster, "Roster"), tabs);
  panel.append(highlightNotice, entries);
  const showDepth = (position) => {
    dismissPopover();
    depthHighlights.set(filterKey, position);
    applyFilter("all");
    const row = entries.querySelector(".position-highlight");
    if (row) entries.scrollTop = row.offsetTop - entries.offsetTop;
    panel.querySelector(".depth-reset")?.focus({ preventScroll: true });
    announce(
      position +
        " depth highlighted for " +
        result.player.name +
        ". All defenders remain in the list.",
    );
  };
  return { panel, showDepth };
}
function emptySlot() {
  const slot = node("div", undefined, "empty-slot"),
    add = button("+", openSearch, "empty-add");
  add.setAttribute("aria-label", "Search for a player");
  slot.append(add);
  return slot;
}
function cardSwitch(card, key, choices, label) {
  const group = node("div", undefined, "card-switch"); group.setAttribute("role", "group");
  group.setAttribute("aria-label", label + " for " + card.team);
  for (const [value, text] of choices) {
    const control = button(text, () => { card[key] = value; saveSelection(); renderCards(); });
    control.setAttribute("aria-pressed", String(card[key] === value)); control.dataset.focusKey = key + ":" + value;
    group.append(control);
  }
  return group;
}
function renderCards() {
  defenseRanks = defenseRankings(defenseStats, feed, weekKey);
  if (feed) renderedClockKey = clockFingerprint(feed, weekKey);
  pendingClock = false;
  const cards = $("cards"), focused = document.activeElement;
  const focusTeam = focused.closest("article")?.dataset.team, focusKey = focused.dataset.focusKey;
  const scrolls = new Map([...cards.querySelectorAll("article")].map((card) => [card.dataset.team, card.querySelector(".injury-list")?.scrollTop || 0]));
  dismissPopover(); cards.replaceChildren(); cards.style.setProperty("--tile-count", Math.max(2, selected.length));
  $("selection-count").textContent = selected.length + " of " + MAX_SELECTIONS + " teams open";
  if (!feed) { cards.append(emptySlot(), emptySlot()); return; }
  for (const team of selected) {
    const state = cardViews.get(team), result = cardContext(feed, state, weekKey), members = cardRoster(feed, result, weekKey);
    result.historical = Boolean(result.week && Date.parse(result.week.ends_at) <= Date.now());
    const card = node("article", undefined, "player-card team-card"); card.dataset.team = team; card.dataset.playerId = team;
    card.setAttribute("aria-label", team + " team card");
    const remove = button("×", () => removePlayer(team), "remove"); remove.dataset.focusKey = "remove"; remove.setAttribute("aria-label", "Remove " + team);
    const header = node("div", undefined, "player-header");
    if (result.team) header.append(teamMark(result.team));
    header.append(node("h2", result.team ? teamName(result.team) : "Opponent unknown", "player-name"),
      node("p", team + " · " + (state.side === "own" ? "Own team" : "Opponent") + " · " + state.unit, "player-team"));
    const controls = node("div", undefined, "card-controls");
    controls.append(cardSwitch(state, "unit", [["offense","Offense"],["defense","Defense"]], "Unit"),
      cardSwitch(state, "side", [["own","Own team"],["opponent","Opponent"]], "View"));
    const focusLabel = node("label", "Player focus", "player-focus");
    const focus = node("select"); focus.setAttribute("aria-label", "Player focus for " + team); focus.dataset.focusKey = "player-focus";
    const empty = node("option", "No player focus"); empty.value = ""; focus.append(empty);
    for (const player of feed.players.filter((player) => player.team === team).sort((a,b) => a.name.localeCompare(b.name))) {
      const option = node("option", player.name + " · " + player.position); option.value = player.id; focus.append(option);
    }
    focus.value = result.focus?.id || "";
    focus.addEventListener("change", () => { state.focusId = focus.value; saveSelection(); renderCards(); }); focusLabel.append(focus);
    card.append(remove, header, controls, focusLabel, stamp(feed.roster, "Focus roster"));
    const matchup = node("section", undefined, "matchup team-matchup");
    const schedule = node("div", undefined, "opponent-info");
    schedule.append(node("p", result.game ? result.game.away + " at " + result.game.home : result.message, "opponent-name"));
    if (result.game) schedule.append(node("p", gameStateLabel(result.game) + (result.game.kickoff ? " · " + kickoffTime.format(new Date(result.game.kickoff)) : ""), "kickoff"));
    schedule.append(stamp(feed.schedule, "Schedule"));
    if (state.unit === "defense") {
      const coaching = teamCoordinators(result.team);
      if (coaching) schedule.append(node("p", coordinatorLabel(coaching), "coordinator-context"), stamp({checked_at:coaching[0].checked_at}, "Coaching"));
    }
    const info = button("i", null, "report-info"); info.dataset.focusKey = "report-info"; info.setAttribute("aria-label", (result.team || team) + " report source and freshness");
    attachPopover(info, () => reportDetails(result), {label:"Report source and freshness"});
    matchup.append(schedule, info); card.append(matchup);
    const statisticsSlot = node("div", undefined, "statistics-slot");
    if (state.unit === "defense" && result.team) {
      const statistics = node("section", undefined, "card-statistics"); statistics.setAttribute("aria-label", "Defense statistics");
      statistics.append(renderDefenseMetrics(result), node("p", defenseRanks.available ?
        (defenseRanks.fallback ? "Last settled · " : "") + defenseRanks.season + " · through week " + defenseRanks.throughWeek : defenseRanks.reason, "stats-window"));
      const updated = defenseStats?.sources.map((source) => source.source_updated_at).filter(Boolean).sort().at(0);
      statistics.append(stamp({source_updated_at:updated, retrieved_at:defenseStats?.generated_at}, "Statistics")); statisticsSlot.append(statistics);
    }
    card.append(statisticsSlot);
    const notice = node("div", undefined, "report-notice-slot");
    if (!result.report) {
      notice.append(node("p", result.state === "bye" ? "Bye week · no game injury report" : "Injury status unknown", "report-notice"));
      const unknown = button("i", null, "report-info injury-unknown-info"); unknown.setAttribute("aria-label", "Injury report timing");
      if (result.game && result.state !== "canceled") {
        attachPopover(unknown, () => node("p", "Injury reports usually arrive Wednesday."), {label:"Injury report timing"}); notice.append(unknown);
      }
    }
    card.append(notice);
    if (members.length) {
      const wrap = node("div", undefined, "field-wrap"), depth = renderDepth(members, result);
      wrap.append(renderField(members, result, depth.showDepth), depth.panel); card.append(wrap);
    } else card.append(node("p", result.historical ? "Historical roster and starters unknown" : "Roster and starters unavailable", "report-empty"), stamp(null, "Roster"));
    cards.append(card);
    const list = card.querySelector(".injury-list"); if (list) list.scrollTop = scrolls.get(team) || 0;
    if (focusTeam === team && focusKey) [...card.querySelectorAll("[data-focus-key]")].find((element) => element.dataset.focusKey === focusKey)?.focus({preventScroll:true});
  }
  for (let i = selected.length; i < 2; i++) cards.append(emptySlot());
  alignComparisonFields(); renderRefreshState();
}
// Different opponents can have different source roles, long names, missing
// reports and wrapping. Align actual rendered bands rather than assuming a
// marker count always predicts their height. Mobile tiles keep natural height.
function alignComparisonFields() {
  const selectors = [".player-header", ".matchup", ".statistics-slot", ".report-notice-slot", ".defender-grid",
    ".field-caption", ".band-db", ".band-lb", ".band-dl", ".band-unknown"];
  const groups = selectors.map((selector) =>
    [...document.querySelectorAll(".player-card " + selector)]);
  for (const nodes of groups)
    for (const element of nodes) element.style.minHeight = "";
  if (window.matchMedia("(max-width: 720px)").matches) return;
  const heights = groups.map((nodes) => Math.max(0,
    ...nodes.map((element) => element.getBoundingClientRect().height)));
  groups.forEach((nodes, index) => {
    for (const element of nodes) element.style.minHeight = heights[index] + "px";
  });
}
let alignmentFrame;
window.addEventListener("resize", () => {
  cancelAnimationFrame(alignmentFrame);
  alignmentFrame = requestAnimationFrame(alignComparisonFields);
});

function interactionActive({ allowFocusedRow = false } = {}) {
  return !canApplyRefresh({
    popoverOpen: isPopoverOpen(),
    searchOpen: !$("search-results").hidden,
    focusedControl: Boolean(
      document.activeElement.closest(
        allowFocusedRow
          ? "#week, .search-area"
          : ".injury-row, .defender-marker, .defender-stack, .position-stack, .depth-reset, .status-tabs, .player-focus, .card-switch, #week, .search-area",
      ),
    ),
  });
}
function applyFeed(bundle) {
  const next = bundle.current;
  const initial = !feed || next.mode !== activeMode;
  if (!initial && interactionActive()) {
    pendingFeed = bundle;
    return;
  }
  pendingFeed = null;
  if (initial) {
    cardViews.clear();
    selected = next.mode === "live" ? readSelection() : [];
    weekKey = "";
    autoWeek = true;
    $("search").value = "";
    closeSearch();
  }
  activeMode = next.mode;
  feed = next;
  contributions = bundle.contributions;
  contributionError = bundle.contributionError;
  productionHistory = bundle.productionHistory;
  productionHistoryError = bundle.productionHistoryError;
  playerHistory = bundle.playerHistory;
  playerHistoryError = bundle.playerHistoryError;
  injuryHistory = bundle.injuryHistory;
  injuryHistoryError = bundle.injuryHistoryError;
  coordinators = bundle.coordinators;
  defenseStats = bundle.defenseStats;
  defenseStatsError = bundle.defenseStatsError;
  $("search").disabled = false;
  $("search").placeholder =
    activeMode === "example" ? "Search fictional teams or players" : "Search teams or players";
  document.querySelector('label[for="search"]').textContent =
    activeMode === "example" ? "Fictional teams or players" : "NFL teams or players";
  $("search-help").textContent =
    activeMode === "example"
      ? "Fictional source data."
      : "Current roster, including injured players.";
  renderWeeks();
  renderCards();
}
function renderRefreshState() {
  const label =
    refreshPhase === "loading"
      ? "Checking shared data…"
      : refreshPhase === "error"
        ? feed
          ? "Check failed · previous data kept"
          : "Check failed · data unavailable"
        : pendingFeed || pendingClock
          ? "Update pending"
          : contributionError || productionHistoryError || playerHistoryError || injuryHistoryError
            ? "Current data checked · history check failed"
            : refreshPhase === "unchanged"
              ? "Checked · no newer shared data"
              : "Shared data updated";
  $("refresh-state").textContent =
    label +
    (lastCheck && refreshPhase !== "loading"
      ? " · " +
        new Date(lastCheck).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })
      : "");
  $("refresh").setAttribute("aria-disabled", String(loading));
  $("refresh").setAttribute("aria-busy", String(loading));
}
async function loadOptionalArtifact(url, previous) {
  try {
    const response = await fetch(url, { cache: "no-cache", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Optional data unavailable.");
    const candidate = await response.json();
    const timestamp = (data) => data?.generated_at || data?.source?.retrieved_at || data?.checked_at;
    if (timestamp(candidate) && timestamp(previous) &&
        Date.parse(timestamp(candidate)) < Date.parse(timestamp(previous)))
      throw new Error("Older optional data returned.");
    return { data: candidate, failed: false };
  } catch { return { data: previous, failed: true }; }
}
const refresher = createRefreshController({
  async request(mode) {
    const response = await fetch(
      mode === "example" ? "./example.json" : "./current.json",
      { cache: "no-cache", signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok)
      throw new Error("The shared data file could not be retrieved.");
    const next = await response.json();
    const [historical, rosterHistory, archive, olderProduction, coaching, defensive] = mode === "live"
      ? await Promise.all([
          loadOptionalArtifact("./contributions.json", contributions),
          loadOptionalArtifact("./player-history.json", playerHistory),
          loadOptionalArtifact("./injury-history.json", injuryHistory),
          loadOptionalArtifact("./contributions-2024.json", productionHistory),
          loadOptionalArtifact("./coordinators.json", coordinators),
          loadOptionalArtifact("./defense-stats.json", defenseStats),
        ])
      : Array.from({ length: 6 }, () => ({ data: null, failed: false }));
    return {
      mode: next.mode,
      generated_at: next.generated_at,
      current: next,
      coordinators: coaching.data,
      defenseStats: defensive.data,
      defenseStatsError: defensive.failed ? "Check failed" + (defensive.data ? " · previous file kept" : "") : "",
      contributions: historical.data,
      contributionError: historical.failed ? "Historical production could not be refreshed." : "",
      productionHistory: olderProduction.data,
      productionHistoryError: olderProduction.failed ? "History check failed" + (olderProduction.data ? " · previous file kept" : "") : "",
      injuryHistory: archive.data,
      injuryHistoryError: archive.failed ? "Archive check failed" + (archive.data ? " · previous file kept" : "") : "",
      playerHistory: rosterHistory.data,
      playerHistoryError: rosterHistory.failed ? "History check failed" + (rosterHistory.data ? " · previous file kept" : "") : "",
    };
  },
  onData: applyFeed,
  onState(state) {
    refreshPhase = state.phase;
    loading = state.phase === "loading";
    lastCheck = state.lastCheck;
    lastError = state.error || "";
    renderStatus();
    renderRefreshState();
    if (!feed && state.phase === "error") {
      $("search").disabled = true;
      $("week").disabled = true;
    }
  },
});
function loadFeed(mode) {
  return refresher.refresh(mode);
}
function flushPending({ allowFocusedRowClock = false } = {}) {
  if (pendingFeed && !interactionActive()) {
    applyFeed(pendingFeed);
    renderRefreshState();
  }
  if (
    pendingClock &&
    !interactionActive({ allowFocusedRow: allowFocusedRowClock })
  ) {
    renderCards();
    renderRefreshState();
  }
}
async function loadTeamAssets() {
  try {
    const response = await fetch("./team-assets.json", {
      cache: "no-cache",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return;
    Object.assign(teamAssets, await response.json());
    if (feed && !isPopoverOpen()) renderCards();
    if ($("search").value.trim()) renderSearch();
  } catch {
    /* Team abbreviations remain usable without images. */
  }
}
$("search").addEventListener("input", renderSearch);
$("search").addEventListener("focus", renderSearch);
$("search").addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    renderSearch();
    const first = $("search-results").querySelector("button:not(:disabled)");
    if (first) {
      event.preventDefault();
      first.focus();
    }
  }
  if (event.key === "Escape") closeSearch();
});
$("search-results").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSearch();
    $("search").focus();
    closeSearch();
    return;
  }
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  event.preventDefault();
  const choices = [
      ...$("search-results").querySelectorAll("button:not(:disabled)"),
    ],
    index = choices.indexOf(document.activeElement),
    next = event.key === "ArrowDown" ? index + 1 : index - 1;
  if (next < 0) $("search").focus();
  else choices[Math.min(next, choices.length - 1)]?.focus();
});
$("week").addEventListener("change", () => {
  weekKey = $("week").value;
  autoWeek = false;
  renderCards();
  announce("Opponent reports updated.");
});
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".search-area, .refresh-bar")) closeSearch();
});
document.addEventListener("focusin", (event) => {
  if (!event.target.closest(".search-area, .refresh-bar")) closeSearch();
});
function updateClock() {
  if (!feed) return;
  renderStatus();
  refreshPopover();
  if (!interactionActive()) {
    flushPending();
    const previousWeek = weekKey;
    renderWeeks();
    if (
      previousWeek !== weekKey ||
      renderedClockKey !== clockFingerprint(feed, weekKey) || defenseRankings(defenseStats, feed, weekKey).throughWeek !== defenseRanks.throughWeek
    )
      renderCards();
  } else if (renderedClockKey !== clockFingerprint(feed, weekKey) || defenseRankings(defenseStats, feed, weekKey).throughWeek !== defenseRanks.throughWeek) {
    pendingClock = true;
    renderRefreshState();
  }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && activeMode === "live") {
    updateClock();
    if (refresher.due(document.hidden)) loadFeed("live");
  }
});
setInterval(() => {
  if (document.hidden) return;
  updateClock();
  if (activeMode === "live" && refresher.due(document.hidden)) loadFeed("live");
}, 60000);
$("refresh").addEventListener("click", () => loadFeed(activeMode));
for (const type of ["focusin", "click", "keydown"])
  document.addEventListener(type, (event) =>
    setTimeout(
      () =>
        flushPending({
          allowFocusedRowClock: type === "keydown" && event.key === "Escape",
        }),
      0,
    ),
  );
attachPopover($("info"), sourceDetails, {
  id: "source-popover",
  label: "Sources and information",
});
renderCards();
await Promise.all([loadFeed("live"), loadTeamAssets()]);
