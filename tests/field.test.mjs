import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fieldGroups,
  fieldLayout,
  fieldStatus,
  filterDefenders,
  depthSummary,
} from "../web/field.mjs";

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
  assert.equal(backs.members.length, 5);
  assert.equal(backs.outCount, 2);
  assert.equal(backs.representatives[0].position, "DB");
});

test("more than eleven first-depth members falls back to complete stacks instead of truncating", () => {
  const members = Array.from({ length: 12 }, (_, index) =>
    first(String(index), index < 6 ? "DB" : "DL"),
  );
  const groups = flatten(fieldLayout(members));
  assert.ok(groups.every((group) => group.representatives.length === 0));
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
    text: "?",
    key: "unknown",
    label: "Availability unknown",
  });
  assert.equal(
    fieldStatus(source, true).label,
    "No game designation; availability unconfirmed",
  );
  assert.equal(flatten(fieldLayout([source]))[0].representatives[0], source);
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
