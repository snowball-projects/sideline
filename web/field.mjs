// Schematic position families, not game assignments, a formation or a lineup.
// Keep source position labels intact and every supplied defensive identity.
const FAMILIES = {
  DB: new Set(["DB", "CB", "S", "FS", "SS"]),
  LB: new Set(["LB", "MLB", "ILB", "OLB"]),
  DL: new Set(["DL", "DE", "EDGE", "DT", "NT", "DI"]),
};

export const STATUS_FILTERS = [
  ["all", "All"],
  ["out", "Out"],
  ["uncertain", "Uncertain"],
];

export function fieldGroups(members) {
  const groups = Object.entries(FAMILIES).map(([position, positions]) => ({
    position,
    members: members.filter((member) => positions.has(member.position)),
  }));
  // Production already excludes unclassified/non-defensive positions. Preserve
  // an unexpected supplied row here without pretending to know its family.
  const unknown = members.filter(
    (member) =>
      !Object.values(FAMILIES).some((positions) =>
        positions.has(member.position),
      ),
  );
  if (unknown.length) groups.push({ position: "Unknown", members: unknown });
  return groups;
}

export function filterDefenders(members, filter = "all") {
  if (filter === "out")
    return members.filter((member) => member.injury?.game_status === "Out");
  if (filter === "uncertain")
    return members.filter((member) =>
      ["Questionable", "Doubtful"].includes(member.injury?.game_status),
    );
  return [...members];
}

export function fieldStatus(member, reportAvailable = true) {
  if (!reportAvailable)
    return { text: "?", key: "unknown", label: "Availability unknown" };
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
      Unknown: { text: "?", key: "unknown", label: "Availability unknown" },
    }[gameStatus] || {
      text: "",
      key: "neutral",
      label: "No game designation; availability unconfirmed",
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
// Unknown depth and unexpectedly large first-depth sets use position stacks;
// neither a count limit nor an Out designation selects a replacement player.
export function fieldLayout(members) {
  const firstDepth = members.filter(
    (member) =>
      Object.values(FAMILIES).some((positions) =>
        positions.has(member.position),
      ) &&
      member.roster_status === "active" &&
      member.depth?.some((entry) => entry.rank === 1),
  );
  const individuals = firstDepth.length <= 11;
  return fieldGroups(members).map((family) => {
    const positions = [
      ...new Set(family.members.map((member) => member.position)),
    ];
    return {
      position: family.position,
      groups: positions.map((position) => {
        const sourceMembers = family.members.filter(
          (member) => member.position === position,
        );
        const representatives = individuals
          ? firstDepth.filter((member) => member.position === position)
          : [];
        return {
          position,
          members: sourceMembers,
          representatives,
          outCount: filterDefenders(sourceMembers, "out").length,
        };
      }),
    };
  });
}
