import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateFeed, parseFeed, safeUrl, MAX_FEED_BYTES } from "../scripts/validate-feed.mjs";
import {
  searchPlayers,
} from "../web/model.mjs";

const fixture = () =>
  JSON.parse(readFileSync(new URL("../web/example.json", import.meta.url)));
const now = Date.parse("2026-09-13T12:00:00Z");
function rejects(mutate, match) {
  const data = fixture();
  mutate(data);
  assert.throws(() => validateFeed(data, now), match);
}

test("optional roster bio accepts old feeds and rejects malformed dates, numbers and unsupported claims", () => {
  assert.doesNotThrow(() => validateFeed(fixture(), now));
  const data = fixture();
  data.players[0].bio = { birth_date: "2000-02-29", years_exp: 0, entry_year: 2026, college: "College Fixture", draft_club: "TEN", draft_number: 146 };
  assert.equal(validateFeed(data, now).players[0].bio.years_exp, 0);
  for (const draft_club of ["AZ", "OAK", "SD", "STL"]) {
    data.players[0].bio.draft_club = draft_club;
    assert.equal(validateFeed(data, now).players[0].bio.draft_club, draft_club);
  }
  for (const bio of [{}, { birth_date: "2001-02-29" }, { birth_date: "2027-01-01" }, { years_exp: -1 }, { years_exp: "2" }, { entry_year: 1910 }, { draft_club: "unknown" }, { draft_number: 0 }, { team_tenure: 8 }, { college: "x".repeat(201) }])
    rejects((feed) => { feed.players[0].bio = bio; }, /bio|Birth date|College|draft team/i);
});

test("search matches names, accents, team and position without filtering injured current members", () => {
  const data = validateFeed(fixture(), now);
  assert.equal(searchPlayers(data, "eli")[0].roster_status, "injured-reserve");
  assert.equal(searchPlayers(data, "sam")[0].roster_status, "pup");
  assert.equal(searchPlayers(data, "drew")[0].roster_status, "practice-squad");
  assert.equal(searchPlayers(data, "river")[0].roster_status, "exempt");
  assert.equal(searchPlayers(data, "renee BUF")[0].id, "demo-renee");
  assert.equal(searchPlayers(data, "BUF wr").length, 1);
  assert.equal(searchPlayers(data, "Kai Mercer").length, 2);
  assert.deepEqual(searchPlayers(data, "  "), []);
});

test("strict parsing rejects malformed JSON, impossible dates, unbounded arrays and unsupported fields", () => {
  assert.throws(() => parseFeed("{", now), /not valid JSON/);
  assert.throws(() => parseFeed(" ".repeat(MAX_FEED_BYTES + 1), now), /8 MB/);
  rejects((data) => {
    data.players = Array(6001).fill(data.players[0]);
  }, /6000/);
  rejects((data) => {
    data.generated_at = "2026-02-30T12:00:00Z";
  }, /invalid date/);
  rejects((data) => {
    data.roster.reported_date = "2026-02-30";
  }, /calendar date/);
  rejects((data) => {
    data.players[0].fantasy_points = 14;
  }, /unsupported field/);
  rejects((data) => {
    data.reports[0].entries[0].game_status = "Probably fine";
  }, /Invalid/);
});

test("provenance validation prevents fabricated exact freshness and accidental live fixture use", () => {
  rejects((data) => {
    data.roster.reported_at = "2026-09-14T12:00:00Z";
  }, /newer than retrieval/);
  rejects((data) => {
    data.roster.source_updated_at = "2026-09-14T12:00:00Z";
  }, /newer than retrieval/);
  rejects((data) => {
    data.schedule.retrieved_at = "2026-09-14T12:00:00Z";
  }, /newer than the feed/);
  rejects((data) => {
    data.reports[0].reported_at = undefined;
  }, /timestamp or null/);
  rejects((data) => {
    data.reports[0].source_id = "unverified-source";
  }, /unknown source/);
  rejects((data) => {
    data.mode = "live";
  }, /mode must match/);
  rejects((data) => {
    data.mode = "live";
    data.sources[0].permission = "verified";
    data.generated_at = "2027-01-01T00:00:00Z";
  }, /future/);
  rejects((data) => {
    data.reports[0].reported_at = "2026-09-12T21:00:00";
  }, /timezone/);
});

test("ambiguous identities, game assignments and reports fail clearly", () => {
  rejects((data) => {
    data.players.push(data.players[0]);
  }, /Duplicate player/);
  rejects((data) => {
    data.games.push({ ...data.games[0], id: "another-game" });
  }, /same week/);
  rejects((data) => {
    data.reports.push(data.reports[0]);
  }, /Duplicate team injury/);
  rejects((data) => {
    data.reports[0].entries.push(data.reports[0].entries[0]);
  }, /Duplicate injury player/);
});

test("source links reject script URLs, cleartext, credentials and control characters", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://example.org",
    "https://name:secret@example.org",
    "https://example.org/\ninjuries",
  ]) {
    assert.equal(safeUrl(url), false);
    rejects((data) => {
      data.sources[0].url = url;
    }, /HTTPS/);
  }
  assert.equal(safeUrl("https://example.org/injuries"), true);
});
