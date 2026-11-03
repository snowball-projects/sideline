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
export function playerStatus(player, report) {
  const badges = player.injury?.badges || [];
  for (const [badge, status, label] of [
    ["OUT", "out", "Out"], ["D", "doubtful", "Doubtful"],
    ["Q", "questionable", "Questionable"], ["DNP", "dnp", "Did not practise"],
    ["LP", "limited", "Limited in practice"],
  ]) if (badges.includes(badge)) return { status, label };
  if (player.injury) return {
    status: "healthy",
    label: `${player.injury.practice === "Full Participation in Practice" ? "Full participation" : "Injury listed"} · ${player.injury.game === "Not listed" ? "No game designation" : player.injury.game}`,
  };
  return report
    ? { status: "healthy", label: "No injury listed" }
    : { status: "unknown", label: "No injury report yet" };
}
export function recordText(record) {
  return record ? `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}` : "Record unavailable";
}
export function sortTeams(teams, week, side, sort) {
  const score = (team) => {
    const own = week.teams[team];
    if (sort === "out") return -starters(own[side], side).filter((group) => playerStatus(group.players[0], own.report).status === "out").length;
    if (sort.startsWith("stat-")) return own.stats?.[side][+sort.slice(5)].rank ?? Infinity;
    const record = own.record;
    const games = record && record.wins + record.losses + record.ties;
    return record ? (games ? -(record.wins + record.ties / 2) / games : 0) : Infinity;
  };
  return [...teams].sort((a, b) => score(a) - score(b) || a.localeCompare(b));
}
