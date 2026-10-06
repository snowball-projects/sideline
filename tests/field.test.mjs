import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fieldGroups,
  fieldLayout,
  fieldStatus,
  filterDefenders,
  depthSummary,
  compactMarkerName,
  memberHasChartPosition,
} from "../web/field.mjs";
import { normalizeDepthCsv } from "../scripts/source-adapter.mjs";

const member = (id, position = "DB", options = {}) => ({
  id,
  name: id,
  position,
  roster_status: "active",
  depth: [],
  injury: null,
  ...options,
});
const first = (id, position, options = {}) =>
  member(id, position, {
    depth: [{ position, rank: 1 }],
    ...options,
  });
const flatten = (layout) => layout.flatMap((family) => family.groups);

test("field bands retain source positions in DB, LB, DL relative order", () => {
  const members = [
    member("line", "DL"),
    member("backer", "LB"),
    member("back", "DB"),
    member("corner", "CB"),
  ];
  const groups = fieldGroups(members);
  assert.deepEqual(
    groups.map((group) => group.position),
    ["DB", "LB", "DL"],
  );
  assert.deepEqual(
    groups[0].members.map((value) => value.position),
    ["DB", "CB"],
  );
  assert.deepEqual(
    groups
      .flatMap((group) => group.members)
      .sort((a, b) => a.id.localeCompare(b.id)),
    [...members].sort((a, b) => a.id.localeCompare(b.id)),
  );
  assert.equal(members[2].position, "DB");
});

test("missing first-depth evidence uses anonymous actual-position stacks, never guessed players", () => {
  const members = [
    member("a", "DB"),
    member("b", "DB"),
    member("c", "LB"),
    member("d", "DL"),
  ];
  const groups = flatten(fieldLayout(members));
  assert.deepEqual(
    groups.map((group) => [group.position, group.members.length]),
    [
      ["DB", 2],
      ["LB", 1],
      ["DL", 1],
    ],
  );
  assert.ok(groups.every((group) => group.representatives.length === 0));
  assert.deepEqual(
    groups.flatMap((group) => group.members),
    [members[0], members[1], members[2], members[3]],
  );
});

test("source first-depth is retained without replacing Out or promoting reserves and backups", () => {
  const members = [
    first("out-first", "DB", { injury: { game_status: "Out" } }),
    member("backup", "DB", { depth: [{ position: "RCB", rank: 2 }] }),
    first("reserve", "DB", { roster_status: "injured-reserve" }),
    first("squad", "DB", { roster_status: "practice-squad" }),
    member("out-backup", "DB", { injury: { game_status: "Out" } }),
    first("line", "DL"),
  ];
  const groups = flatten(fieldLayout(members));
  const backs = groups.find((group) => group.position === "DB");
  assert.deepEqual(
    backs.representatives.map((value) => value.id),
    ["out-first"],
  );
  assert.equal(backs.members.length, 4);
  assert.equal(backs.outCount, 2);
  assert.equal(backs.representatives[0].position, "DB");
  const rightCorners = groups.find((group) => group.position === "RCB");
  assert.deepEqual(rightCorners.members, [members[1]]);
  assert.equal(rightCorners.representatives.length, 0);
  assert.deepEqual(new Set(groups.flatMap((group) => group.members)), new Set(members));
});

test("more than eleven first-depth members all remain named without truncating the published chart", () => {
  const members = Array.from({ length: 12 }, (_, index) =>
    first(String(index), index < 6 ? "DB" : "DL"),
  );
  const groups = flatten(fieldLayout(members));
  assert.deepEqual(new Set(groups.flatMap((group) => group.representatives)), new Set(members));
  assert.equal(
    groups.reduce((total, group) => total + group.members.length, 0),
    12,
  );
  assert.equal(
    flatten(fieldLayout(members.slice(0, 11))).reduce(
      (total, group) => total + group.representatives.length,
      0,
    ),
    11,
  );
});

test("Uncertain contains only Questionable and Doubtful; Out requires its exact game designation", () => {
  const members = [
    member("out", "DB", { injury: { game_status: "Out" } }),
    member("q", "DB", { injury: { game_status: "Questionable" } }),
    member("d", "LB", { injury: { game_status: "Doubtful" } }),
    member("unknown", "DL", { injury: { game_status: "Unknown" } }),
    member("inactive", "DL", { roster_status: "inactive" }),
    member("limited", "DB", {
      injury: { game_status: "Not listed", practice_status: "Limited" },
    }),
  ];
  assert.deepEqual(filterDefenders(members, "all"), members);
  assert.notEqual(filterDefenders(members, "all"), members);
  assert.deepEqual(
    filterDefenders(members, "out").map((value) => value.id),
    ["out"],
  );
  assert.deepEqual(
    filterDefenders(members, "uncertain").map((value) => value.id),
    ["q", "d"],
  );
  assert.equal(fieldStatus(members[1]).text, "Q");
  assert.equal(fieldStatus(members[2]).text, "D");
  assert.equal(fieldStatus(members[3]).key, "unknown");
  assert.equal(fieldStatus(members[4]).text, "");
});

test("report-only and unknown-depth context stays in All and the position stack", () => {
  const source = member("report-only", "LB", {
    roster_status: "unknown",
    reportOnly: true,
    injury: { game_status: "Unknown" },
  });
  const group = flatten(fieldLayout([source]))[0];
  assert.equal(group.members[0], source);
  assert.equal(group.representatives.length, 0);
  assert.equal(depthSummary(source), "Roster unknown · Depth unknown");
  assert.deepEqual(filterDefenders([source], "uncertain"), []);
  assert.deepEqual(filterDefenders([source], "out"), []);
});

test("missing report coverage never becomes no injury or health and never changes source depth", () => {
  const source = first("a", "DB");
  assert.deepEqual(fieldStatus(source, false), {
    text: "",
    key: "neutral",
    label: "Availability unknown; injury report unavailable",
  });
  assert.equal(
    fieldStatus(source, true).label,
    "No game designation; availability unconfirmed",
  );
  assert.equal(flatten(fieldLayout([source]))[0].representatives[0], source);
});

test("partial reports distinguish a missing injury entry from an entry with no game designation", () => {
  const unlisted = first("unlisted", "DB");
  const listed = first("listed", "DB", {
    injury: { game_status: "Not listed", practice_status: "Limited" },
  });
  for (const coverage of ["partial", "unknown"])
    assert.deepEqual(fieldStatus(unlisted, true, coverage), {
      text: "?",
      key: "unknown",
      label: "No matching injury entry; availability unknown",
    });
  assert.deepEqual(fieldStatus(unlisted, false, "partial"), {
    text: "",
    key: "neutral",
    label: "Availability unknown; injury report unavailable",
  });
  assert.deepEqual(fieldStatus(listed, true, "partial"), {
    text: "",
    key: "neutral",
    label: "No game designation; availability unconfirmed",
  });
  assert.equal(fieldStatus(unlisted).key, "neutral");
  assert.equal(fieldStatus(unlisted, true, "complete").key, "neutral");
});

test("depth summary preserves actual source detail as secondary context", () => {
  assert.equal(
    depthSummary(
      first("a", "DB", {
        depth: [
          { position: "LCB", rank: 1 },
          { position: "RCB", rank: 2 },
        ],
      }),
    ),
    "Source depth: LCB #1, RCB #2",
  );
  assert.equal(
    depthSummary(member("b", "LB", { roster_status: "inactive" })),
    "Inactive · Depth unknown",
  );
});

test("unexpected unknown position inputs remain unknown stacks rather than being assigned a defensive role", () => {
  const source = first("unknown-source-position", "UNK");
  const groups = fieldGroups([source]);
  assert.equal(groups.at(-1).position, "Unknown");
  assert.equal(groups.at(-1).members[0], source);
  const layout = fieldLayout([source]).at(-1);
  assert.equal(layout.position, "Unknown");
  assert.equal(layout.groups[0].position, "UNK");
  assert.equal(layout.groups[0].members[0], source);
  assert.equal(layout.groups[0].representatives.length, 0);
});

test("source-shaped published LDE evidence places a roster LB in the defensive-line band", () => {
  // Synthetic source rows reproduce the coarse-LB/chart-LDE mismatch without
  // fetching a provider or claiming this fixture is a current game lineup.
  const observed = "2026-10-06T07:00:00.000Z";
  const depth = normalizeDepthCsv([
    "dt,team,player_name,espn_id,gsis_id,pos_grp_id,pos_grp,pos_id,pos_name,pos_abb,pos_slot,pos_rank",
    "2026-10-05T07:00:00.000Z,NYJ,David Bailey,,fixture-bailey,2,Defense,1,Left Defensive End,LDE,1,2",
    `${observed},NYJ,David Bailey,,fixture-bailey,2,Defense,1,Left Defensive End,LDE,1,1`,
    `${observed},NYJ,David Bailey,,fixture-bailey,2,Defense,2,Right Defensive End,RDE,2,2`,
  ].join("\n"), {
    source_id: "nflverse-depth",
    reported_at: null,
    source_updated_at: "2026-10-06T09:00:00.000Z",
    retrieved_at: "2026-10-06T10:00:00.000Z",
  });
  const player = member("gsis:fixture-bailey", "LB", {
    name: "David Bailey",
    team: "NYJ",
    depth: depth.entries,
  });
  const original = structuredClone(player);
  const layout = fieldLayout([player]);
  assert.equal(layout.find((family) => family.position === "LB").groups.length, 0);
  const line = layout.find((family) => family.position === "DL").groups;
  assert.deepEqual(line.map((group) => group.position), ["LDE"]);
  assert.equal(line[0].role, "end");
  assert.equal(line[0].side, "left");
  assert.equal(line[0].source, "depth");
  assert.deepEqual(line[0].representatives, [player]);
  assert.deepEqual(line[0].assignments.map(({ entry }) => entry), depth.entries);
  assert.equal(line[0].assignments[0].member, player);
  assert.equal(line[0].assignments[0].entry, depth.entries[0]);
  assert.equal(line[0].assignments[0].entry.observed_at, observed);
  assert.deepEqual(player, original);
  assert.equal(player.position, "LB");
  assert.equal(memberHasChartPosition(player, "LDE"), true);
  assert.equal(memberHasChartPosition(player, "RDE"), false);
  assert.equal(memberHasChartPosition(player, "LB"), false);
  assert.equal(compactMarkerName(player), "D. Bailey");
});

test("every supported published defensive chart position has an explicit conservative family and role", () => {
  const cases = [
    ["LCB", "DB", "corner", "left"],
    ["RCB", "DB", "corner", "right"],
    ["CB", "DB", "corner", null],
    ["NB", "DB", "nickel", null],
    ["NCB", "DB", "nickel", null],
    ["FS", "DB", "safety", null],
    ["SS", "DB", "safety", null],
    ["S", "DB", "safety", null],
    ["DB", "DB", "defensive-back", null],
    ["LDE", "DL", "end", "left"],
    ["RDE", "DL", "end", "right"],
    ["DE", "DL", "end", null],
    ["EDGE", "DL", "edge", null],
    ["NT", "DL", "nose", null],
    ["DT", "DL", "interior", null],
    ["DI", "DL", "interior", null],
    ["LDT", "DL", "interior", "left"],
    ["RDT", "DL", "interior", "right"],
    ["DL", "DL", "defensive-line", null],
    ["LB", "LB", "linebacker", null],
    ["WLB", "LB", "linebacker", "weak"],
    ["SLB", "LB", "linebacker", "strong"],
    ["MLB", "LB", "linebacker", "middle"],
    ["ILB", "LB", "linebacker", null],
    ["LILB", "LB", "linebacker", "left"],
    ["RILB", "LB", "linebacker", "right"],
    ["OLB", "LB", "linebacker", null],
    ["LOLB", "LB", "linebacker", "left"],
    ["ROLB", "LB", "linebacker", "right"],
  ];
  for (const [position, family, role, side] of cases) {
    const player = first("fixture-" + position, family, {
      depth: [{ position, rank: 1, observed_at: "2026-10-06T07:00:00.000Z" }],
    });
    const groups = flatten(fieldLayout([player]));
    assert.equal(groups.length, 1, position);
    assert.deepEqual(
      [groups[0].position, groups[0].family, groups[0].role, groups[0].side],
      [position, family, role, side],
      position,
    );
    assert.deepEqual(groups[0].representatives, [player], position);
    assert.deepEqual(fieldGroups([player]).find((group) => group.position === family).members, [player]);
  }
});

test("multiple chart assignments retain every position and provenance without selecting a primary role", () => {
  const player = member("fixture-multiple", "DB", {
    depth: [
      { position: "LCB", rank: 1, observed_at: "2026-10-06T07:00:00.000Z" },
      { position: "NB", rank: 1, observed_at: "2026-10-06T07:00:00.000Z" },
      { position: "RCB", rank: 2, observed_at: "2026-10-06T07:00:00.000Z" },
    ],
    injury: { game_status: "Out" },
  });
  const groups = flatten(fieldLayout([player]));
  assert.deepEqual(groups.map((group) => group.position), ["LCB/NB"]);
  assert.deepEqual(groups[0].positions, ["LCB", "NB"]);
  assert.deepEqual(groups[0].representatives, [player]);
  assert.deepEqual(groups[0].members, [player]);
  assert.equal(groups[0].role, "defensive-back");
  assert.equal(groups[0].side, null);
  for (const [index, assignment] of groups[0].assignments.entries())
    assert.equal(assignment.entry, player.depth[index]);
  assert.equal(groups[0].outCount, 1);
  assert.equal(memberHasChartPosition(player, "LCB/NB"), true);
  assert.equal(memberHasChartPosition(player, "LCB"), false);
  assert.equal(memberHasChartPosition(player, "DB"), false);
  assert.equal(memberHasChartPosition(player, "CB"), false);
  assert.deepEqual(fieldGroups([player])[0].members, [player]);
  assert.equal(depthSummary(player), "Source depth: LCB #1, NB #1, RCB #2");
});

test("every roster identity remains in chart stacks including reserves, unknown depth and report-only rows", () => {
  const members = [
    member("first", "LB", { depth: [{ position: "LDE", rank: 1 }] }),
    member("backup", "LB", { depth: [{ position: "LDE", rank: 2 }], injury: { game_status: "Out" } }),
    member("reserve", "DL", { depth: [{ position: "LDE", rank: 1 }], roster_status: "injured-reserve" }),
    member("squad", "DB", { depth: [{ position: "NB", rank: 1 }], roster_status: "practice-squad" }),
    member("unknown-depth", "LB"),
    member("report-only", "CB", { roster_status: "unknown", reportOnly: true }),
    member("unknown-position", "UNK"),
  ];
  const groups = flatten(fieldLayout(members));
  assert.deepEqual(new Set(groups.flatMap((group) => group.members)), new Set(members));
  assert.deepEqual(groups.flatMap((group) => group.representatives), [members[0]]);
  const line = groups.find((group) => group.position === "LDE");
  assert.deepEqual(line.members, members.slice(0, 3));
  assert.equal(line.outCount, 1);
  assert.deepEqual(members.filter((player) => memberHasChartPosition(player, "LDE")), line.members);
  assert.deepEqual(members.filter((player) => memberHasChartPosition(player, "LB")), [members[4]]);
});

test("ambiguous roster and unsupported depth labels never imply edge, off-ball, corner or safety assignments", () => {
  const members = [
    member("generic-back", "DB"),
    member("generic-line", "DL"),
    member("generic-backer", "LB"),
    member("outside-backer", "OLB"),
    member("unsupported-chart", "LB", { depth: [{ position: "SAM", rank: 1 }] }),
    member("invalid-rank", "LB", { depth: [{ position: "LDE", rank: 0 }] }),
    member("string-rank", "LB", { depth: [{ position: "LDE", rank: "1" }] }),
  ];
  const groups = flatten(fieldLayout(members));
  assert.deepEqual(new Set(groups.map((group) => group.position)), new Set(["DB", "DL", "LB", "OLB"]));
  assert.ok(groups.every((group) => group.source === "roster"));
  assert.ok(groups.every((group) => group.representatives.length === 0));
  assert.equal(groups.find((group) => group.position === "LB").role, "linebacker");
  assert.equal(groups.find((group) => group.position === "OLB").role, "linebacker");
  assert.equal(memberHasChartPosition(members[4], "SAM"), false);
  assert.equal(memberHasChartPosition(members[4], "LB"), true);
});

test("a secondary-rank role in another family stays evidence without duplicating a first-depth identity", () => {
  const player = member("hybrid", "LB", {
    depth: [{ position: "LDE", rank: 1 }, { position: "SLB", rank: 2 }],
  });
  const layout = fieldLayout([player]);
  assert.equal(layout.find((family) => family.position === "LB").groups.length, 0);
  assert.equal(layout.find((family) => family.position === "DL").groups[0].representatives[0], player);
  assert.deepEqual(flatten(layout)[0].assignments.map(({ entry }) => entry), player.depth);
  assert.deepEqual(fieldGroups([player]).map((group) => group.members.length), [0, 0, 1]);
});

test("multiple first-depth slots do not duplicate identities or hide them at an arbitrary chart size", () => {
  const members = Array.from({ length: 11 }, (_, index) => first("fixture-" + index, "DB"));
  members[0].depth.push({ position: "NB", rank: 1 });
  const groups = flatten(fieldLayout(members));
  assert.equal(groups.reduce((count, group) => count + group.assignments.length, 0), 12);
  assert.deepEqual(new Set(groups.flatMap((group) => group.representatives)), new Set(members));
  assert.equal(groups.flatMap((group) => group.representatives).length, 11);
  assert.deepEqual(new Set(groups.flatMap((group) => group.members)), new Set(members));
  assert.equal(groups.find((group) => group.position === "DB/NB").members[0], members[0]);
});

test("cross-family first-depth ambiguity uses one coarse stack and preserves every chart assignment", () => {
  const player = member("hybrid", "LB", {
    depth: [{ position: "LDE", rank: 1 }, { position: "SLB", rank: 1 }],
  });
  const groups = flatten(fieldLayout([player]));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].family, "LB");
  assert.equal(groups[0].position, "LB");
  assert.equal(groups[0].role, "linebacker");
  assert.equal(groups[0].side, null);
  assert.equal(groups[0].ambiguous, true);
  assert.deepEqual(groups[0].members, [player]);
  assert.deepEqual(groups[0].representatives, []);
  assert.deepEqual(groups[0].assignments.map(({ entry }) => entry), player.depth);
  assert.equal(memberHasChartPosition(player, "LB"), true);
  assert.deepEqual(fieldGroups([player]).map((group) => group.members.length), [0, 1, 0]);
});

test("matching same-family roles use a deterministic combined label and a single named marker", () => {
  const player = member("both-corners", "DB", {
    depth: [{ position: "RCB", rank: 1 }, { position: "LCB", rank: 1 }],
  });
  const group = flatten(fieldLayout([player]))[0];
  assert.equal(group.position, "LCB/RCB");
  assert.equal(group.role, "corner");
  assert.equal(group.side, null);
  assert.deepEqual(group.representatives, [player]);
  assert.deepEqual(group.assignments.map(({ entry }) => entry), player.depth);
});

test("multiple backup chart roles retain a combined stack without promoting a named replacement", () => {
  const player = member("both-backups", "DB", {
    depth: [{ position: "RCB", rank: 3 }, { position: "LCB", rank: 2 }],
  });
  const group = flatten(fieldLayout([player]))[0];
  assert.equal(group.position, "LCB/RCB");
  assert.deepEqual(group.members, [player]);
  assert.deepEqual(group.representatives, []);
  assert.deepEqual(group.assignments.map(({ entry }) => entry), player.depth);
});

test("mixed roster/depth groups distinguish provenance without promoting unknown-depth members", () => {
  const charted = first("first", "DB");
  const uncharted = member("uncharted", "DB");
  const group = flatten(fieldLayout([charted, uncharted]))[0];
  assert.equal(group.source, "mixed");
  assert.deepEqual(group.members, [charted, uncharted]);
  assert.deepEqual(group.representatives, [charted]);
  assert.deepEqual(group.assignments, [{ member: charted, entry: charted.depth[0] }]);
});

test("compact marker names preserve surnames, suffixes, punctuation and compound names", () => {
  for (const [name, compact] of [
    ["David Bailey", "D. Bailey"],
    ["Patrick Surtain II", "P. Surtain II"],
    ["Joey Porter Jr.", "J. Porter Jr."],
    ["T.J. Watt", "T. Watt"],
    ["Jeremiah Owusu-Koramoah", "J. Owusu-Koramoah"],
    ["Amon-Ra St. Brown", "A. St. Brown"],
    ["John Michael Smith", "J. Smith"],
    ["Émile van der Test", "É. van der Test"],
    ["  D'Andre   Swift  ", "D. Swift"],
    ["Solo", "Solo"],
    ["", ""],
  ]) assert.equal(compactMarkerName(name), compact, name);
  assert.equal(compactMarkerName({ name: "David Bailey" }), "D. Bailey");
  assert.equal(compactMarkerName(null), "");
});
