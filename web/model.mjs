import { TEAMS, POSITIONS, safeUrl } from "./feed.mjs?v=0.9.15";

export { TEAMS, POSITIONS, safeUrl };
export const MAX_SELECTIONS = 6;
export const DEFENSIVE_POSITIONS = new Set([
  "DE",
  "EDGE",
  "DT",
  "NT",
  "DI",
  "DL",
  "LB",
  "MLB",
  "ILB",
  "OLB",
  "CB",
  "S",
  "FS",
  "SS",
  "DB",
]);
export const REPORT_MAX_AGE_HOURS = 48;
export const FEED_MAX_AGE_HOURS = 24;
export const COLLECTION_DELAY_HOURS = 2;
export const COLLECTION_OLD_HOURS = 6;

const RELEVANCE = {
  QB: {
    CB: "Coverage",
    S: "Coverage",
    FS: "Coverage",
    SS: "Coverage",
    DB: "Coverage",
    EDGE: "Pass rush",
    DE: "Pass rush",
    OLB: "Pressure or coverage",
    DT: "Interior pressure",
    NT: "Interior pressure",
    DI: "Interior pressure",
    DL: "Pressure",
  },
  WR: {
    CB: "Coverage",
    S: "Deep coverage",
    FS: "Deep coverage",
    SS: "Coverage",
    DB: "Coverage",
    EDGE: "Time for routes to develop",
    DE: "Time for routes to develop",
  },
  RB: {
    DI: "Run defense",
    DT: "Run defense",
    NT: "Run defense",
    DL: "Run defense",
    DE: "Edge containment",
    EDGE: "Edge containment",
    LB: "Run defense or receiving coverage",
    ILB: "Run defense or receiving coverage",
    MLB: "Run defense or receiving coverage",
    OLB: "Run defense or receiving coverage",
    S: "Run support or receiving coverage",
    SS: "Run support or receiving coverage",
    FS: "Run support or receiving coverage",
  },
  FB: {
    DL: "Run defense",
    DT: "Run defense",
    LB: "Run defense or receiving coverage",
  },
  TE: {
    LB: "Receiving coverage",
    ILB: "Receiving coverage",
    MLB: "Receiving coverage",
    OLB: "Receiving coverage",
    S: "Receiving coverage",
    SS: "Receiving coverage",
    FS: "Receiving coverage",
    DB: "Receiving coverage",
    CB: "Receiving coverage",
  },
};

const normalizeSearch = (value) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Current roster membership includes injured and reserve players. Game
// participation never determines eligibility for search.
export function searchPlayers(feed, query) {
  const words = normalizeSearch(String(query ?? ""))
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];
  return feed.players
    .filter((player) => {
      const haystack = normalizeSearch(
        `${player.name} ${player.team} ${player.position}`,
      );
      return words.every((word) => haystack.includes(word));
    })
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        a.team.localeCompare(b.team) ||
        a.id.localeCompare(b.id),
    );
}

export function currentWeek(feed, now = Date.now()) {
  return (
    feed.weeks.find(
      (week) =>
        Date.parse(week.starts_at) <= now && now < Date.parse(week.ends_at),
    ) ?? null
  );
}

export function vintage(
  metadata,
  now = Date.now(),
  maxAgeHours = REPORT_MAX_AGE_HOURS,
) {
  const exact = metadata.reported_at ? Date.parse(metadata.reported_at) : null;
  const date = metadata.reported_date
    ? Date.parse(`${metadata.reported_date}T00:00:00Z`)
    : null;
  const ageHours = exact === null ? null : Math.max(0, (now - exact) / 3600000);
  const ageDays =
    date === null
      ? null
      : Math.floor(now / 86400000) - Math.floor(date / 86400000);
  const sourceFileAgeHours = metadata.source_updated_at
    ? Math.max(0, (now - Date.parse(metadata.source_updated_at)) / 3600000)
    : null;
  return {
    vintagePrecision:
      exact !== null ? "time" : date !== null ? "date" : "unknown",
    ageHours,
    ageDays,
    // A date has no timezone or time. Its last possible instant is next-day
    // noon UTC, so only flag dates safely beyond the chosen age threshold.
    stale:
      ageHours !== null
        ? ageHours > maxAgeHours
        : ageDays !== null && ageDays >= Math.ceil((maxAgeHours + 36) / 24),
    retrievalStale:
      now - Date.parse(metadata.retrieved_at) > FEED_MAX_AGE_HOURS * 3600000,
    sourceFileAgeHours,
    sourceFileStale:
      sourceFileAgeHours !== null && sourceFileAgeHours > FEED_MAX_AGE_HOURS,
    sourceFileUnknown: sourceFileAgeHours === null,
  };
}

export const STATUS_LEGEND = [
  ["starter", "1st", "First string on the current depth chart"],
  ["active", "ACT", "Active roster; starting role unconfirmed"],
  ["questionable", "Q", "Questionable"],
  ["doubtful", "D", "Doubtful"],
  ["out", "OUT", "Out"],
  ["limited", "LP", "Limited practice"],
  ["dnp", "DNP", "Did not practice"],
  ["reserve", "RES", "Reserve, inactive or suspended"],
  ["squad", "PS", "Practice squad"],
  ["unknown", "?", "Availability or roster context unknown"],
];
const STATUS = Object.fromEntries(
  STATUS_LEGEND.map(([key, short, label]) => [key, { key, short, label }]),
);

const INJURY_PILLS = {
  ankle: "Ankle",
  knee: "Knee",
  foot: "Foot",
  toe: "Toe",
  hamstring: "Ham.",
  shoulder: "Shldr",
  groin: "Groin",
  calf: "Calf",
  quadricep: "Quad",
  quadriceps: "Quad",
  quad: "Quad",
  achilles: "Achil.",
  neck: "Neck",
  back: "Back",
  hip: "Hip",
  ribs: "Ribs",
  rib: "Rib",
  chest: "Chest",
  abdomen: "Abd.",
  abdominal: "Abd.",
  oblique: "Obliq.",
  elbow: "Elbow",
  wrist: "Wrist",
  hand: "Hand",
  finger: "Finger",
  thumb: "Thumb",
  biceps: "Biceps",
  triceps: "Tricep",
  concussion: "Conc.",
  head: "Head",
  illness: "Ill",
  "not specified": "?",
  "not injury related - resting player": "Rest",
  "not injury related - personal matter": "Pers.",
};

export function memberPills(member) {
  if (!member.injury) return { injury: null, status: null, key: "neutral" };
  const entry = member.injury;
  const parts = [
    ...new Set(
      entry.injury
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
  const injury =
    parts.length > 1
      ? "Multi"
      : INJURY_PILLS[parts[0]?.toLowerCase()] || "Other";
  let key = {
    Out: "out",
    Doubtful: "doubtful",
    Questionable: "questionable",
  }[entry.game_status];
  if (!key && entry.practice_status === "Did not practice") key = "dnp";
  if (!key && entry.practice_status === "Limited") key = "limited";
  return {
    injury,
    status: key ? STATUS[key].short : null,
    key: key || "reported",
  };
}
export function gameStateLabel(game, now = Date.now()) {
  if (game.status === "final") return "Finished";
  if (game.status === "in-progress") return "In progress";
  if (game.status === "postponed") return "Postponed";
  if (game.status === "canceled") return "Canceled";
  if (!game.kickoff) return "Time TBD · status unconfirmed";
  return Date.parse(game.kickoff) <= now
    ? "Start passed · status unconfirmed"
    : "Upcoming";
}

export function collectionFreshness(generatedAt, now = Date.now()) {
  const ageHours = Math.max(0, (now - Date.parse(generatedAt)) / 3600000);
  const age = ageHours < 1 ? "<1h" : Math.floor(ageHours) + "h";
  const state = ageHours >= COLLECTION_OLD_HOURS
    ? "old"
    : ageHours >= COLLECTION_DELAY_HOURS
      ? "delayed"
      : "current";
  return { ageHours, state, label: age + " \u00b7 " + state };
}

export function collectionAgeLabel(generatedAt, now = Date.now()) {
  return collectionFreshness(generatedAt, now).label;
}

export function defenderRole(selectedPosition, defenderPosition) {
  return (
    RELEVANCE[selectedPosition]?.[defenderPosition] || "Role effect unmeasured"
  );
}
export function metricPerspective(selectedPosition, defenderPosition) {
  if (!["QB", "WR", "TE"].includes(selectedPosition)) return selectedPosition;
  if (["CB", "S", "FS", "SS", "DB"].includes(defenderPosition)) return "WR";
  if (["DL", "DI", "DT", "NT", "DE", "EDGE"].includes(defenderPosition))
    return "QB";
  // Coarse linebacker positions do not establish a rush or coverage assignment.
  return "MIXED";
}

export function clockFingerprint(feed, weekKey, now = Date.now()) {
  const age = (item) => {
    const v = vintage(item, now);
    return [v.stale, v.retrievalStale, v.sourceFileStale, v.sourceFileUnknown];
  };
  return JSON.stringify([
    collectionFreshness(feed.generated_at, now).state,
    currentWeek(feed, now)?.key,
    weekKey,
    age(feed.roster),
    age(feed.schedule),
    feed.reports.map(age),
    feed.depth ? age(feed.depth) : null,
    feed.games.map((game) => gameStateLabel(game, now)),
  ]);
}
