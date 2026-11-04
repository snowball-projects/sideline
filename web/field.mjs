export function shortName(name) {
  const words = name.split(" ");
  return words.length === 1 ? name : `${words[0][0]}. ${words.slice(1).join(" ")}`;
}
export const statLabels = {
  offense: ["Points / game", "Yards / game", "Sacks taken", "Turnovers lost"],
  defense: ["Points allowed / game", "Yards allowed / game", "Sacks", "Turnovers forced"],
};
export function starters(unit, side) {
  return side === "offense" ? unit.filter((group) => group.position !== "FB") : unit;
}
export function rows(unit, side) {
  const lines = side === "offense"
    ? ["QB RB FB HB", "WR", "LT LG C RG RT OL OT OG G T TE"]
    : ["S SS FS SAF", "LB ILB OLB MLB WLB SLB LOLB ROLB LILB RILB NB NCB", "DE DT NT DL EDGE LDE RDE LDT RDT DB CB LCB RCB"];
  const depth = (position) => lines.findIndex((line) => line.split(" ").includes(position));
  const observed = starters(unit, side).toSorted((a, b) => a.slot - b.slot);
  const placed = observed.map((group) => ({ ...group, depth: depth(group.position) }));
  // Keep holes inside observed depth slots visible. The source does not supply
  // the missing player's identity or position, so neither is invented here.
  if (side === "defense") for (let slot = 1; slot < (observed.at(-1)?.slot || 0); slot++) {
    if (observed.some((group) => group.slot === slot)) continue;
    const next = observed.find((group) => group.slot > slot);
    placed.push({ slot, position: `Slot ${slot}`, unavailable: true, depth: depth(next.position) });
  }
  const horizontal = (group) => group.position === "LCB" ? -1 : group.position === "RCB" ? Infinity : group.slot;
  // Each side's final line borders scrimmage. Wide corners flank the defensive
  // line; the nickel is inside them with the linebackers, behind scrimmage.
  return lines.map((_, index) => placed.filter((group) => group.depth === index)
    .toSorted((a, b) => horizontal(a) - horizontal(b)));
}
export const statusMarks = {
  out: ["OUT", "Out"],
  doubtful: ["D", "Doubtful"],
  questionable: ["Q", "Questionable"],
  dnp: ["DNP", "Did not practice"],
  limited: ["LP", "Limited in practice"],
};
export function playerStatus(player) {
  const badges = player.injury?.badges || [];
  for (const [status, [code, label]] of Object.entries(statusMarks))
    if (badges.includes(code)) return { status, label };
  return { status: "neutral", label: "" };
}
export function recordText(record) {
  return record ? `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}` : "";
}
// Count listed Out designations, never infer a missing report or unit is zero.
export function outCount(team, side) {
  const unit = starters(team[side], side);
  if (!team.report || unit.length !== (side === "offense" ? 11 : 12)) return null;
  return unit.filter((group) => playerStatus(group.players[0]).status === "out").length;
}
export function sortTeams(teams, week, side, sort, direction = "best") {
  const score = (team) => {
    const own = week.teams[team];
    if (sort === "out") {
      const count = outCount(own, side);
      return count === null ? null : -count;
    }
    if (sort.startsWith("stat-")) return own.stats?.[side][+sort.slice(5)].rank ?? null;
    const record = own.record;
    const games = record && record.wins + record.losses + record.ties;
    return record ? (games ? -(record.wins + record.ties / 2) / games : 0) : null;
  };
  return [...teams].sort((a, b) => {
    const left = score(a), right = score(b);
    if (left === null || right === null)
      return left === right ? a.localeCompare(b) : left === null ? 1 : -1;
    return (left - right) * (direction === "worst" ? -1 : 1) || a.localeCompare(b);
  });
}
