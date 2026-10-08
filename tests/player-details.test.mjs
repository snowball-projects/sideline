import test from "node:test";
import assert from "node:assert/strict";
import { ageOnDate, bioFacts, playerInjuryRecords } from "../web/player-details.mjs";
import { fieldFixture } from "./browser/field-fixture.mjs";

test("age uses UTC birthdays, including leap days, rather than source experience or season year", () => {
  for (const [date, age] of [["2026-09-12T23:59:59Z", 24], ["2026-09-13T00:00:00Z", 25]])
    assert.equal(ageOnDate("2001-09-13", Date.parse(date)), age);
  assert.equal(ageOnDate("2000-02-29", Date.parse("2025-02-28T12:00:00Z")), 24);
  assert.equal(ageOnDate("2000-02-29", Date.parse("2025-03-01T00:00:00Z")), 25);
});

test("bio keeps source eligibility distinct from rookie season and omits unavailable facts", () => {
  assert.deepEqual(bioFacts(undefined), []);
  assert.deepEqual(bioFacts({ years_exp: 0, entry_year: 2026 }), [
    ["League experience", "0 years"], ["NFL eligible since", "2026"],
  ]);
  const rows = bioFacts({ college: "College Fixture", draft_club: "TEN", draft_number: 146 });
  assert.deepEqual(rows, [["College", "College Fixture"], ["Draft", "TEN · #146"]]);
  assert.ok(rows.every(([label]) => !/tenure|rookie|healthy/i.test(label)));
});

test("weekly injury history joins exact IDs across teams without counting absent or future weeks", () => {
  const feed = fieldFixture({ week: 5 });
  const report = feed.reports.find((report) => report.team === "CAR");
  const id = report.entries[0].id;
  const selected = feed.weeks[0];
  const previous = { ...selected, key: "2026-REG-4", label: "Earlier week", week: 4,
    starts_at: "2026-09-01T00:00:00Z" };
  feed.weeks.push(previous, { ...previous, key: "2025-REG-4", season: 2025 });
  feed.reports.push(
    { ...report, team: "DEN", week_key: previous.key, entries: [{ ...report.entries[0], injury: "Ankle; Wrist" }] },
    { ...report, week_key: feed.weeks[1].key },
    { ...report, week_key: "2025-REG-4" },
  );
  report.entries.push({ ...report.entries[0], id: "different-id", name: report.entries[0].name });
  const records = playerInjuryRecords(feed, id, selected.key);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(({ report }) => report.team), ["CAR", "DEN"]);
  assert.equal(records[1].entry.injury, "Ankle; Wrist");
  assert.equal(records[0].report.reported_at, null);
  assert.deepEqual(playerInjuryRecords(feed, "gsis:fixture-no-report", selected.key), []);
  assert.deepEqual(playerInjuryRecords(feed, id, "missing-week"), []);
});
