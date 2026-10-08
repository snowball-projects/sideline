// Published depth-chart positions are schematic context, not snap alignments,
// coverage/shadow assignments or a confirmed lineup. Keep source labels intact.
// Side means the published chart side, never an inferred viewer coordinate.
const POSITIONS = {
  DB: ["DB", "defensive-back"],
  CB: ["DB", "corner"],
  LCB: ["DB", "corner", "left"],
  RCB: ["DB", "corner", "right"],
  NB: ["DB", "nickel"],
  NCB: ["DB", "nickel"],
  S: ["DB", "safety"],
  FS: ["DB", "safety"],
  SS: ["DB", "safety"],
  LB: ["LB", "linebacker"],
  MLB: ["LB", "linebacker", "middle"],
  ILB: ["LB", "linebacker"],
  LILB: ["LB", "linebacker", "left"],
  RILB: ["LB", "linebacker", "right"],
  OLB: ["LB", "linebacker"],
  LOLB: ["LB", "linebacker", "left"],
  ROLB: ["LB", "linebacker", "right"],
  WLB: ["LB", "linebacker", "weak"],
  SLB: ["LB", "linebacker", "strong"],
  DL: ["DL", "defensive-line"],
  DE: ["DL", "end"],
  LDE: ["DL", "end", "left"],
  RDE: ["DL", "end", "right"],
  EDGE: ["DL", "edge"],
  DT: ["DL", "interior"],
  DI: ["DL", "interior"],
  LDT: ["DL", "interior", "left"],
  RDT: ["DL", "interior", "right"],
  NT: ["DL", "nose"],
};
const FAMILIES = ["DB", "LB", "DL"];

function positionContext(position) {
  const [family, role, side = null] = Object.hasOwn(POSITIONS, position)
    ? POSITIONS[position]
    : ["Unknown", "unknown"];
  return { family, role, side };
}

// opponentRoster already checks freshness, team and player identity before
// supplying depth. Never reconstruct expired chart context from the roster.
function chartPosition(member) {
  const assignments = (member.depth || []).filter(
    (entry) =>
      Object.hasOwn(POSITIONS, entry.position) &&
      Number.isInteger(entry.rank) &&
      entry.rank > 0,
  );
  const firstDepth = assignments.filter((entry) => entry.rank === 1);
  const positions = [
    ...new Set(
      (firstDepth.length ? firstDepth : assignments).map((entry) => entry.position),
    ),
  ].sort();
  const contexts = positions.map(positionContext);
  const families = new Set(contexts.map((context) => context.family));
  // One player gets one marker. Preserve all equally supported first-depth
  // positions in its label; secondary chart ranks remain in source evidence.
  // A cross-family chart does not establish a single schematic placement.
  if (!positions.length || families.size > 1)
    return {
      position: member.position,
      positions: [member.position],
      ...positionContext(member.position),
      source: assignments.length ? "depth" : "roster",
      ambiguous: families.size > 1,
      firstDepth: false,
    };
  const family = contexts[0].family;
  const roles = new Set(contexts.map((context) => context.role));
  const sides = new Set(contexts.map((context) => context.side));
  return {
    position: positions.join("/"),
    positions,
    family,
    role: roles.size === 1 ? contexts[0].role : positionContext(family).role,
    side: sides.size === 1 ? contexts[0].side : null,
    source: "depth",
    ambiguous: false,
    firstDepth: firstDepth.length > 0,
  };
}

export function memberHasChartPosition(member, position) {
  return chartPosition(member).position === position;
}

export function compactMarkerName(nameOrMember) {
  const name =
    typeof nameOrMember === "string" ? nameOrMember : nameOrMember?.name;
  const parts = (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return parts[0] || "";
  let surname = parts.length - 1;
  // Retain source suffixes and common compound-surname particles. This is a
  // display abbreviation only; full names and stable IDs remain unchanged.
  while (surname > 1 && /^(?:jr\.?|sr\.?|ii|iii|iv|v|vi)$/i.test(parts[surname]))
    surname--;
  while (
    surname > 1 &&
    /^(?:st\.?|de|del|der|den|da|di|du|la|le|van|von)$/i.test(parts[surname - 1])
  )
    surname--;
  return Array.from(parts[0])[0] + ". " + parts.slice(surname).join(" ");
}

export const STATUS_FILTERS = [
  ["all", "All"],
  ["out", "Out"],
  ["uncertain", "Uncertain"],
];

export function fieldGroups(members) {
  const entries = members.map((member) => ({
    member,
    family: chartPosition(member).family,
  }));
  const groups = FAMILIES.map((position) => ({
    position,
    members: entries
      .filter((entry) => entry.family === position)
      .map((entry) => entry.member),
  }));
  // Production already excludes unclassified/non-defensive positions. Preserve
  // an unexpected supplied row here without pretending to know its family.
  const unknown = entries
    .filter((entry) => entry.family === "Unknown")
    .map((entry) => entry.member);
  if (unknown.length) groups.push({ position: "Unknown", members: unknown });
  return groups;
}

export function filterDefenders(members, filter = "all") {
  if (filter === "out")
    return members.filter((member) => member.injury?.game_status === "Out");
  if (filter === "uncertain")
    return members.filter((member) =>
      member.injury?.game_status !== "Out" &&
      (["Questionable", "Doubtful"].includes(member.injury?.game_status) ||
        ["Limited", "Did not practice"].includes(member.injury?.practice_status)),
    );
  return [...members];
}

export function fieldStatus(
  member,
  reportAvailable = true,
  reportCoverage = "unknown",
) {
  if (!reportAvailable)
    return {
      text: "",
      key: "neutral",
      label: "Availability unknown; injury report missing from this feed",
    };
  if (!member.injury)
    return {
      text: "",
      key: "neutral",
      label: member.reportIdentityConflict
        ? "Report/roster IDs differ for this name; availability unknown"
        : reportCoverage === "complete"
        ? "Not listed in complete team report; availability unconfirmed"
        : "No matching injury entry in partial report; availability unknown",
    };
  const gameStatus = member.injury?.game_status;
  return (
    {
      Out: { text: "OUT", key: "out", label: "Reported Out" },
      Questionable: {
        text: "Q",
        key: "questionable",
        label: "Reported Questionable",
      },
      Doubtful: { text: "D", key: "doubtful", label: "Reported Doubtful" },
    }[gameStatus] || {
      "Did not practice": { text: "DNP", key: "dnp", label: "Reported did not practice; game availability unconfirmed" },
      Limited: { text: "LP", key: "limited", label: "Reported limited practice; game availability unconfirmed" },
    }[member.injury.practice_status] || {
      text: "",
      key: "neutral",
      label: gameStatus === "Unknown"
        ? "Game designation unknown; availability unconfirmed"
        : "No game designation; availability unconfirmed",
    }
  );
}

export function depthSummary(member) {
  const roster = {
    "practice-squad": "Practice squad",
    inactive: "Inactive",
    suspended: "Suspended",
    exempt: "Exempt",
    reserve: "Reserve",
    "injured-reserve": "Injured reserve",
    pup: "PUP",
    nfi: "NFI",
    unknown: "Roster unknown",
  }[member.roster_status];
  const depth = member.depth?.length
    ? "Source depth: " +
      member.depth.map((entry) => entry.position + " #" + entry.rank).join(", ")
    : "Depth unknown";
  return [roster, depth].filter(Boolean).join(" · ");
}

// Only current, valid first-depth context can name individuals on the field.
// Every identity appears once; multiple same-family first-depth positions use
// a combined chart label instead of an invented primary role. Members retain
// their original roster position and all depth evidence. The UI uses
// group.position for the chart label, group.positions for its component labels,
// and assignments [{ member, entry }] for every unchanged source depth entry.
// Missing or cross-family-ambiguous depth uses complete anonymous stacks.
// Chart size and Out designations never truncate or select replacement players.
export function fieldLayout(members) {
  const groups = new Map();
  for (const member of members) {
    const { firstDepth, source, ...placement } = chartPosition(member);
    if (!groups.has(placement.position))
      groups.set(placement.position, {
        ...placement,
        members: [],
        representatives: [],
        assignments: [],
        sources: new Set(),
      });
    const group = groups.get(placement.position);
    group.sources.add(source);
    group.ambiguous ||= placement.ambiguous;
    if (!group.members.includes(member)) group.members.push(member);
    for (const entry of member.depth || [])
      group.assignments.push({ member, entry });
    if (
      firstDepth &&
      member.roster_status === "active" &&
      !group.representatives.includes(member)
    )
      group.representatives.push(member);
  }
  const positions = [...groups.values()];
  const families = [...FAMILIES];
  if (positions.some((group) => group.family === "Unknown"))
    families.push("Unknown");
  return families.map((position) => ({
    position,
    groups: positions
      .filter((group) => group.family === position)
      .map(({ sources, ...group }) => ({
        ...group,
        source: sources.size === 1 ? [...sources][0] : "mixed",
        outCount: filterDefenders(group.members, "out").length,
      })),
  }));
}
