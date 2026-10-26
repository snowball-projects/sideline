import { unitHasChartPosition } from "./field.mjs?v=0.9.15";
import { TEAMS, DEFENSIVE_POSITIONS, vintage, defenderRole } from "./model.mjs?v=0.9.15";
export const OFFENSIVE_POSITIONS = new Set(["QB", "RB", "FB", "WR", "TE", "C", "G", "T", "OL", "OT", "OG"]);
const rosterPosition = (position) => ({ LDE:"DE", RDE:"DE", LDT:"DT", RDT:"DT", WLB:"LB", SLB:"LB", MLB:"LB", LOLB:"OLB", ROLB:"OLB", LILB:"ILB", RILB:"ILB", LCB:"CB", RCB:"CB", NB:"CB", NCB:"CB", LT:"T", RT:"T", LG:"G", RG:"G" })[position] || position;

export function restoreCards(value) {
  if (!Array.isArray(value)) return [];
  const teams = new Set();
  return value.filter((card) => {
    if (!card || !TEAMS.includes(card.team) || teams.has(card.team)) return false;
    teams.add(card.team); return true;
  }).slice(0, 6).map(({team, side, unit, focusId}) => ({team,
    side: side === "opponent" ? "opponent" : "own",
    unit: unit === "offense" ? "offense" : "defense",
    focusId: typeof focusId === "string" ? focusId : "" }));
}

export function cardContext(feed, card, weekKey, now = Date.now()) {
  const week = feed.weeks.find((entry) => entry.key === weekKey);
  const game = feed.games.find((entry) => entry.week_key === weekKey && [entry.home, entry.away].includes(card.team));
  const other = game && (game.home === card.team ? game.away : game.home);
  const team = card.side === "opponent" ? other : card.team;
  const focus = feed.players.find((player) => player.id === card.focusId && player.team === card.team) || null;
  const report = feed.reports.find((entry) => entry.week_key === weekKey && entry.game_id === game?.id && entry.team === team);
  const freshness = report ? vintage(report, now) : { vintagePrecision:"unknown", stale:false, retrievalStale:false, sourceFileStale:false, sourceFileUnknown:true };
  const roster = vintage(feed.roster, now), schedule = vintage(feed.schedule, now);
  const state = !week ? "no-week" : !game ? (week.byes.includes(card.team) ? "bye" : "missing-schedule") : game.status === "canceled" ? "canceled" : report ? "report" : "missing-report";
  return { cardTeam: card.team, unit: card.unit, team, opponent: team, focus, week, game, report, state,
    player: focus || { id: card.team, name: card.team, team: card.team, position:"UNK" },
    entries: report?.entries || [], ...freshness,
    rosterStale: roster.stale || roster.retrievalStale || roster.sourceFileStale,
    scheduleStale: schedule.stale || schedule.retrievalStale || schedule.sourceFileStale,
    started: ["in-progress","final"].includes(game?.status), kickoffPassed: Boolean(game?.kickoff && Date.parse(game.kickoff) <= now),
    reportedAfterKickoff: Boolean(report?.reported_at && game?.kickoff && Date.parse(report.reported_at) >= Date.parse(game.kickoff)),
    message: state === "bye" ? "Confirmed bye" : state === "missing-report" ? "Injury report unavailable. Availability unknown." : state === "no-week" ? "Week unavailable" : "Schedule or report unavailable",
  };
}

export function cardRoster(feed, result, weekKey, now = Date.now()) {
  if (!result.team || !result.week) return [];
  const historical = Date.parse(result.week.ends_at) <= now;
  const cutoff = Math.min(now, result.game?.kickoff ? Date.parse(result.game.kickoff) : now);
  const matching = feed.depth?.entries.filter((entry) => entry.team === result.team && Date.parse(entry.observed_at) <= cutoff &&
    (entry.week_key === weekKey || (!entry.week_key && Date.parse(entry.observed_at) >= Date.parse(result.week.starts_at) && Date.parse(entry.observed_at) < Date.parse(result.week.ends_at)))) || [];
  // An explicit weekly snapshot wins over the generic latest chart.
  const snapshot = matching.some((entry) => entry.week_key === weekKey) ? matching.filter((entry) => entry.week_key === weekKey) : matching;
  const depth = snapshot.filter((entry) => unitHasChartPosition(result.unit, entry.position));
  const members = new Map();
  if (!historical) for (const player of feed.players.filter((player) => player.team === result.team)) members.set(player.id, player);
  for (const entry of depth) {
    if (members.has(entry.player_id)) continue;
    const current = feed.players.find((player) => player.id === entry.player_id && player.team === entry.team);
    const name = entry.name || current?.name;
    if (name) members.set(entry.player_id, { id:entry.player_id, name, team:entry.team,
      position:rosterPosition(entry.position), roster_status:historical ? "unknown" : current?.roster_status || "unknown", bio:current?.bio });
  }
  const rosterIds = new Set(members.keys());
  for (const entry of result.entries) if (!members.has(entry.id)) members.set(entry.id, { ...entry, team:result.team, roster_status:"unknown" });
  const positions = result.unit === "offense" ? OFFENSIVE_POSITIONS : DEFENSIVE_POSITIONS;
  return [...members.values()].filter((member) => positions.has(member.position)).map((member) => {
    const injury = result.entries.find((entry) => entry.id === member.id) || null;
    const chart = depth.filter((entry) => entry.player_id === member.id);
    const role = result.focus && result.focus.team !== result.team && result.unit === "defense" ? defenderRole(result.focus.position, member.position) : "Role effect unmeasured";
    const starter = chart.some((entry) => entry.rank === 1);
    return { ...member, injury, depth:chart, starter, historical,
      status:{ key:injury?.game_status === "Out" ? "out" : starter ? "starter" : "unknown" },
      reportOnly:!rosterIds.has(member.id), reportIdentityConflict:false,
      focused:member.id === result.focus?.id, relevant:role !== "Role effect unmeasured", relevance:role };
  }).sort((a,b) => Number(b.starter)-Number(a.starter) || a.position.localeCompare(b.position) || a.name.localeCompare(b.name));
}
