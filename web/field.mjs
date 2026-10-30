export const defensePositions = new Set(
  "DE DT NT DL EDGE LB ILB OLB MLB WLB SLB LDE RDE LDT RDT LOLB ROLB LILB RILB DB CB S SS FS LCB RCB NB NCB SAF".split(
    " ",
  ),
);
export function shortName(name) {
  const words = name.split(" ");
  return words.length === 1
    ? name
    : words[0][0] + ". " + words.slice(1).join(" ");
}
export function rows(unit, side) {
  const order =
    side === "offense"
      ? [
          ["QB", "RB", "FB", "HB"],
          ["WR", "TE"],
          ["LT", "LG", "C", "RG", "RT", "OL", "OT", "OG", "G", "T"],
        ]
      : [
          ["DE", "DT", "NT", "DL", "EDGE", "LDE", "RDE", "LDT", "RDT"],
          [
            "LB",
            "ILB",
            "OLB",
            "MLB",
            "WLB",
            "SLB",
            "LOLB",
            "ROLB",
            "LILB",
            "RILB",
          ],
          ["DB", "CB", "S", "SS", "FS", "LCB", "RCB", "NB", "NCB", "SAF"],
        ];
  return order.map((positions) =>
    unit.filter((group) => positions.includes(group.position)),
  );
}
export function searchTeam(player, week) {
  return defensePositions.has(player.position)
    ? week.teams[player.team]?.opponent
    : player.team;
}
export function restoreSelections(value, teams) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item : item?.team))
        .filter((team) => Object.hasOwn(teams, team)),
    ),
  ].slice(0, 6);
}
