import test from "node:test";
import assert from "node:assert/strict";
import { createRefreshController, canApplyRefresh } from "../web/refresh.mjs";
import {
  gameStateLabel,
  collectionAgeLabel,
  collectionFreshness,
  clockFingerprint,
} from "../web/model.mjs";

test("refresh serializes requests, distinguishes unchanged data and keeps last good data after failures or rollback", async () => {
  let clock = 1000000,
    resolve,
    calls = 0;
  const states = [],
    applied = [];
  const refresh = createRefreshController({
    now: () => clock,
    request: () => {
      calls++;
      return new Promise((r) => (resolve = r));
    },
    onState: (s) => states.push(s),
    onData: (d) => applied.push(d),
  });
  const data = { mode: "live", generated_at: "2026-09-14T10:00:00Z" };
  const first = refresh.refresh();
  assert.equal(await refresh.refresh(), false);
  assert.equal(calls, 1);
  resolve(data);
  await first;
  assert.equal(states.at(-1).phase, "updated");
  const second = refresh.refresh();
  resolve({ ...data });
  await second;
  assert.equal(states.at(-1).phase, "unchanged");
  assert.equal(applied.length, 1);
  const rollback = refresh.refresh();
  resolve({ ...data, generated_at: "2026-09-13T10:00:00Z" });
  await rollback;
  assert.equal(states.at(-1).phase, "error");
  assert.equal(applied.length, 1);
  clock += 300000;
  assert.equal(refresh.due(), false);
  clock += 300000;
  assert.equal(refresh.due(true), false);
  assert.equal(refresh.due(), true);
  const next = refresh.refresh();
  resolve({ ...data, generated_at: "2026-09-14T11:00:00Z" });
  await next;
  assert.equal(applied.length, 2);
  assert.equal(states.at(-1).failures, 0);
});

test("timeouts and rejected response parsing fail clearly and cap retry backoff", async () => {
  let clock = 1000000;
  const states = [];
  const refresh = createRefreshController({
    now: () => clock,
    request: async () => {
      throw new DOMException("deadline", "TimeoutError");
    },
    onData: () => assert.fail(),
    onState: (s) => states.push(s),
  });
  for (let i = 0; i < 7; i++) await refresh.refresh();
  assert.equal(states.at(-1).error, "The request timed out.");
  clock += 3599999;
  assert.equal(refresh.due(), false);
  clock++;
  assert.equal(refresh.due(), true);
});

test("a recent failed browser check does not reset the retained collection or fetch age", async () => {
  const collected = "2026-09-14T10:00:00Z";
  let clock = Date.parse(collected), fail = false;
  const data = { mode: "live", generated_at: collected,
    roster: { retrieved_at: collected, source_updated_at: "2026-09-13T10:00:00Z", reported_at: null } };
  const original = structuredClone(data), applied = [], states = [];
  const refresh = createRefreshController({
    now: () => clock,
    request: async () => { if (fail) throw new Error("unavailable"); return data; },
    onData: value => applied.push(value),
    onState: value => states.push(value),
  });
  assert.equal(await refresh.refresh(), true);
  clock += 7 * 3_600_000;
  fail = true;
  assert.equal(await refresh.refresh(), false);
  assert.equal(states.at(-1).lastCheck, clock);
  assert.equal(states.at(-1).phase, "error");
  assert.equal(applied.length, 1);
  assert.deepEqual(applied[0], original);
  assert.equal(collectionFreshness(applied[0].generated_at, clock).ageHours, 7);
  assert.equal(clock - Date.parse(applied[0].roster.retrieved_at), 7 * 3_600_000);
});

test("pending data waits for dialogs, searches and focused roster/week controls", () => {
  const idle = { popoverOpen: false, searchOpen: false, focusedControl: false };
  assert.equal(canApplyRefresh(idle), true);
  for (const key of Object.keys(idle))
    assert.equal(canApplyRefresh({ ...idle, [key]: true }), false);
});

test("clock transitions never turn elapsed kickoff into confirmed live or final", () => {
  const game = { status: "scheduled", kickoff: "2026-09-14T17:00:00Z" };
  const start = Date.parse(game.kickoff);
  assert.equal(gameStateLabel(game, start - 1), "Upcoming");
  assert.match(gameStateLabel(game, start), /Start passed.*unconfirmed/);
  assert.match(gameStateLabel(game, start + 86400000), /unconfirmed/);
  for (const [status, label] of [
    ["in-progress", "In progress"],
    ["final", "Finished"],
    ["postponed", "Postponed"],
    ["canceled", "Canceled"],
  ])
    assert.equal(gameStateLabel({ ...game, status }, start), label);
  assert.match(gameStateLabel({ ...game, kickoff: null }), /Time TBD/);
});

test("collection age uses separate two-hour and six-hour operational states", () => {
  const generatedAt = "2026-09-14T10:00:00Z";
  const at = (hours) => Date.parse(generatedAt) + hours * 3600000;
  assert.equal(collectionAgeLabel(generatedAt, at(0.5)), "<1h \u00b7 current");
  assert.equal(collectionFreshness(generatedAt, at(1.999)).state, "current");
  assert.equal(collectionAgeLabel(generatedAt, at(2)), "2h \u00b7 delayed");
  assert.equal(collectionFreshness(generatedAt, at(5.999)).state, "delayed");
  assert.equal(collectionAgeLabel(generatedAt, at(6)), "6h \u00b7 old");
});

test("retained data changes its fingerprint with freshness but does not expire observed depth names", () => {
  const now = Date.parse("2026-09-14T10:00:00Z");
  const metadata = {
    reported_at: null,
    reported_date: null,
    retrieved_at: "2026-09-14T10:00:00Z",
    source_updated_at: "2026-09-14T10:00:00Z",
  };
  const feed = {
    generated_at: "2026-09-14T10:00:00Z",
    roster: metadata,
    schedule: metadata,
    reports: [metadata],
    weeks: [],
    games: [],
    depth: { ...metadata, entries: [{ observed_at: "2026-09-13T11:00:00Z" }] },
  };
  const key = clockFingerprint(feed, "week", now);
  assert.equal(clockFingerprint(feed, "week", now + 60000), key);
  assert.notEqual(clockFingerprint(feed, "week", now + 2 * 3600000), key);
  assert.equal(clockFingerprint(feed, "week", now + 3600001), key);
  assert.notEqual(clockFingerprint(feed, "week", now + 86400001), key);
});
