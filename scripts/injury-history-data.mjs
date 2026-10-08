import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseCsv } from "./source-adapter.mjs";
import { fetchSource } from "./refresh-data.mjs";
import { parseFeed } from "../web/feed.mjs";
import { DEFENSIVE_POSITIONS } from "../web/model.mjs";
import { INJURY_HISTORY_SOURCE, INJURY_FIELDS, validateInjuryHistory, validArchiveWeek } from "../web/injury-history.mjs";

export const INJURY_HISTORY_POLICY = Object.freeze({
  verified: true, checked_on: "2026-10-08",
  reason: "nflverse-data releases the 2025 injury archive under CC BY 4.0. sideline selects current defenders by exact GSIS ID and preserves reported season/week/team, body-part text and practice/game statuses. These are stored weekly observations, not daily practice dates, distinct injury counts or proof of health in omitted weeks. See docs/DATA_SOURCES.md.",
});
const OUTPUT = new URL("../web/injury-history.json", import.meta.url);
const clean = (value) => String(value ?? "").trim();
function requireValue(ok, message) { if (!ok) throw new Error(message); }
export function normalizeInjuryHistory(csv, currentPlayers, source, generatedAt) {
  const rows = parseCsv(csv, { maxBytes: 4 * 1024 * 1024, maxRows: 20000 });
  requireValue(rows.length && ["season", "game_type", "week", "team", "gsis_id", ...INJURY_FIELDS].every((key) => Object.hasOwn(rows[0], key)), "Archive missing required rows/columns.");
  const ids = new Set(currentPlayers.filter((player) => DEFENSIVE_POSITIONS.has(player.position) && player.id.startsWith("gsis:")).map((player) => player.id));
  const players = new Map();
  for (const row of rows) {
    requireValue(clean(row.season) === "2025", "Unexpected archive season.");
    const id = "gsis:" + clean(row.gsis_id);
    if (!ids.has(id)) continue;
    const gameType = clean(row.game_type), weekText = clean(row.week), week = Number(weekText);
    requireValue(/^\d{1,2}$/.test(weekText) && validArchiveWeek(gameType, week), "Invalid archive phase/week.");
    const record = { game_type: gameType, week, team: clean(row.team) };
    for (const field of INJURY_FIELDS) { const value = clean(row[field]); record[field] = value && value !== "NA" ? value : null; }
    if (!players.has(id)) players.set(id, { id, records: [] });
    players.get(id).records.push(record);
  }
  return validateInjuryHistory({ schema_version: 1, season: 2025, generated_at: generatedAt, source,
    players: [...players.values()].sort((a, b) => a.id.localeCompare(b.id)).map((player) => ({ ...player,
      records: player.records.sort((a, b) => b.week - a.week || a.team.localeCompare(b.team)),
    })),
  }, Date.parse(generatedAt));
}
export async function collectInjuryHistory({ feed, fetchImpl = fetch, now = () => new Date() } = {}) {
  requireValue(INJURY_HISTORY_POLICY.verified && feed.mode === "live", "Archive requires reviewed live data.");
  const input = await fetchSource(INJURY_HISTORY_SOURCE, { fetchImpl, now, maxBytes: 4 * 1024 * 1024 });
  return normalizeInjuryHistory(input.csv, feed.players, { ...INJURY_HISTORY_SOURCE,
    permission: "verified", permission_note: INJURY_HISTORY_POLICY.reason,
    source_updated_at: input.metadata.source_updated_at, retrieved_at: input.metadata.retrieved_at,
  }, now().toISOString());
}
export async function refreshInjuryHistory({ output = OUTPUT, collect } = {}) {
  const temporary = new URL("./injury-history.json.pending", output);
  try {
    const artifact = validateInjuryHistory(await collect());
    await writeFile(temporary, JSON.stringify(artifact) + "\n", { flag: "wx" });
    await rename(temporary, output); return { status: "updated", artifact };
  } catch (error) {
    await rm(temporary, { force: true });
    try { const artifact = validateInjuryHistory(JSON.parse(await readFile(output, "utf8"))); return { status: "retained", artifact, error: error.message }; }
    catch { await rm(output, { force: true }); return { status: "unavailable", error: error.message }; }
  }
}
async function main() {
  const args = process.argv.slice(2);
  requireValue(args.length <= 1 && args.every((arg) => arg === "--optional"), "Usage: node scripts/injury-history-data.mjs [--optional]");
  const result = await refreshInjuryHistory({ collect: async () => collectInjuryHistory({ feed: parseFeed(await readFile(new URL("../web/current.json", import.meta.url), "utf8")) }) });
  if (result.error) { console.warn(`Injury archive ${result.status}: ${result.error}`); if (!args.includes("--optional")) process.exitCode = 1; }
  console.log(JSON.stringify({ status: result.status, generated_at: result.artifact?.generated_at, season: result.artifact?.season,
    players: result.artifact?.players.length, records: result.artifact?.players.reduce((count, player) => count + player.records.length, 0), source: result.artifact?.source }, null, 2));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  main().catch((error) => { console.error(`Injury archive failed: ${error.message}`); process.exitCode = 1; });
