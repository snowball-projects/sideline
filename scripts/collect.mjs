import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

export const TEAMS =
  "ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS".split(
    " ",
  );
const ROOT = "https://github.com/nflverse/nflverse-data/releases/download";
const TERMS = "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md";
const MAX_CSV_BYTES = 160 * 1024 * 1024;
const fail = (message) => {
  throw new Error(message);
};
const check = (ok, message) => {
  if (!ok) fail(message);
};
const clean = (value) => (!value || value === "NA" ? "" : value.trim());
const club = (value) => {
  const team = { LA: "LAR", JAC: "JAX", WSH: "WAS" }[value] || value;
  check(TEAMS.includes(team), `Unknown team: ${value}`);
  return team;
};
const identity = (row) =>
  clean(row.gsis_id || row.player_id)
    ? `gsis:${row.gsis_id || row.player_id}`
    : clean(row.espn_id)
      ? `espn:${row.espn_id}`
      : null;
function number(row, key, min = 0, max = 1000) {
  check(/^-?\d+(?:\.\d+)?$/.test(row[key]), `Missing or invalid ${key}`);
  const value = Number(row[key]);
  check(
    Number.isFinite(value) && value >= min && value <= max,
    `Out of range ${key}`,
  );
  return value;
}
function columns(row, fields, label) {
  if (Array.isArray(row))
    row = row[0] || Object.fromEntries(row.columns.map((key) => [key, ""]));
  check(
    row && fields.every((key) => Object.hasOwn(row, key)),
    `${label} missing required columns: ${fields.join(", ")}`,
  );
}
export function sourceDefinitions(season) {
  check(
    Number.isInteger(season) && season >= 2026 && season <= 2100,
    "Unsupported season",
  );
  return [
    ["roster", "Season roster", `rosters/roster_${season}.csv`],
    ["schedule", "Schedule and scores", "schedules/games.csv"],
    ["injuries", "Weekly injuries", `injuries/injuries_${season}.csv`],
    [
      "depth",
      "Depth observations",
      `depth_charts/depth_charts_${season}.csv.gz`,
    ],
    [
      "teamStats",
      "Weekly team statistics",
      `stats_team/stats_team_week_${season}.csv`,
    ],
    [
      "playerStats",
      "Weekly player statistics",
      `stats_player/stats_player_week_${season}.csv`,
    ],
  ].map(([key, label, path]) => ({
    key,
    label,
    url: `${ROOT}/${path}`,
    terms_url: TERMS,
    checked_on: "2026-10-30",
  }));
}
// Bounded downloads, fixed datasets and HTTPS redirect hosts. A failed run leaves
// the published snapshot intact; the four-hour workflow supplies the next try.
export async function fetchSource(
  source,
  { fetchImpl = fetch, now = () => new Date() } = {},
) {
  check(
    sourceDefinitions(
      Number(source.url.match(/_(\d{4})\.csv/)?.[1] || 2026),
    ).some((entry) => entry.url === source.url),
    "Unexpected source URL",
  );
  let url = source.url,
    response;
  const signal = AbortSignal.timeout(60000);
  for (let count = 0; count <= 3; count++) {
    const target = new URL(url);
    check(
      target.protocol === "https:" &&
        !target.username &&
        !target.password &&
        !target.port &&
        [
          "github.com",
          "release-assets.githubusercontent.com",
          "objects.githubusercontent.com",
        ].includes(target.hostname),
      "Unexpected redirect",
    );
    response = await fetchImpl(url, { signal, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    await response.body?.cancel();
    check(
      count < 3 && response.headers.get("location"),
      "Redirect limit or missing location",
    );
    url = new URL(response.headers.get("location"), url).href;
  }
  check(response.ok, `${source.key}: HTTP ${response.status}`);
  check(
    !/text\/html|application\/(json|xml)/i.test(
      response.headers.get("content-type") || "",
    ),
    "Unexpected source content",
  );
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    check(bytes <= 20 * 1024 * 1024, "Source download too large");
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  const csv = new TextDecoder("utf-8", { fatal: true }).decode(
    source.url.endsWith(".gz")
      ? gunzipSync(body, { maxOutputLength: MAX_CSV_BYTES })
      : body,
  );
  const retrieved_at = now().toISOString(),
    modified = Date.parse(response.headers.get("last-modified"));
  check(
    !Number.isFinite(modified) || modified <= Date.parse(retrieved_at) + 300000,
    "Future source timestamp",
  );
  return {
    csv,
    metadata: {
      retrieved_at,
      source_updated_at: Number.isFinite(modified)
        ? new Date(modified).toISOString()
        : null,
    },
  };
}
/** Small bounded RFC 4180 parser: quoted commas/newlines/escaped quotes, no coercion. */
export function parseCsv(
  text,
  { maxBytes = MAX_CSV_BYTES, maxRows = 40000, onRow } = {},
) {
  if (typeof text !== "string" || Buffer.byteLength(text) > maxBytes)
    fail("CSV exceeds the input limit.");
  text = text.replace(/^\uFEFF/, "");
  const records = [];
  let header,
    count = 0;
  let row = [],
    cell = "",
    quoted = false,
    afterQuote = false;
  const addCell = () => {
    row.push(cell);
    cell = "";
    afterQuote = false;
  };
  const addRow = () => {
    addCell();
    if (row.some((value) => value !== "")) {
      if (!header) {
        header = row.map((name) => name.trim());
        if (
          header.some((name) => !name) ||
          new Set(header).size !== header.length
        )
          fail("CSV headers are empty or duplicated.");
      } else {
        if (++count > maxRows) fail("CSV exceeds the row limit.");
        if (row.length !== header.length)
          fail(`CSV row ${count + 1} has an unexpected column count.`);
        const record = Object.fromEntries(
          header.map((name, i) => [name, row[i]]),
        );
        if (onRow) onRow(record);
        else records.push(record);
      }
    }
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        afterQuote = true;
      } else cell += c;
    } else if (c === ",") addCell();
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      addRow();
    } else if (afterQuote)
      fail("Unexpected character after CSV closing quote.");
    else if (c === '"') {
      if (cell) fail("Unexpected CSV quote.");
      quoted = true;
    } else cell += c;
    if (cell.length > 10000 || row.length > 200)
      fail("CSV field or column limit exceeded.");
  }
  if (quoted) fail("Unterminated CSV quote.");
  if (cell || row.length || afterQuote) addRow();
  if (!header) fail("CSV headers are empty or duplicated.");
  Object.defineProperty(records, "columns", { value: header });
  return records;
}

export function easternTimestamp(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    fail("Invalid schedule date or Eastern time.");
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (
    !Number.isFinite(naive) ||
    new Date(naive).toISOString().slice(0, 16) !== `${date}T${time}`
  )
    fail("Invalid calendar date or clock time.");
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let resolved = naive;
  for (let iteration = 0; iteration < 3; iteration++) {
    const parts = Object.fromEntries(
      format
        .formatToParts(new Date(resolved))
        .map(({ type, value }) => [type, value]),
    );
    const local = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
    );
    resolved += naive - local;
  }
  const parts = Object.fromEntries(
    format
      .formatToParts(new Date(resolved))
      .map(({ type, value }) => [type, value]),
  );
  if (
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` !==
    `${date}T${time}`
  )
    fail("Schedule clock time does not exist in Eastern time.");
  return new Date(resolved).toISOString();
}

function tuesdayBefore(date) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 5) % 7));
  return day.toISOString().slice(0, 10);
}
function nextTuesday(date) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + (7 - ((day.getUTCDay() + 5) % 7)));
  return day.toISOString().slice(0, 10);
}

// Competition ranks preserve all ties, including every player tied at rank 10.
export function rank(values, value, lower = false) {
  return {
    rank:
      1 +
      values.filter((other) => (lower ? other < value : other > value)).length,
    tied: values.filter((other) => other === value).length > 1,
  };
}
function defensiveCounts(row) {
  return [
    number(row, "def_tackles_solo") +
      number(row, "def_tackles_with_assist") +
      number(row, "def_tackle_assists"),
    number(row, "def_sacks", 0, 30),
    number(row, "def_interceptions", 0, 20),
  ];
}
function parseSchedule(csv, season) {
  const rows = parseCsv(csv);
  columns(
    rows,
    [
      "season",
      "game_type",
      "game_id",
      "week",
      "gameday",
      "gametime",
      "home_team",
      "away_team",
      "home_score",
      "away_score",
    ],
    "Schedule",
  );
  const ids = new Set(),
    joins = new Set();
  const games = rows
    .filter(
      (row) =>
        +row.season === season &&
        ["REG", "WC", "DIV", "CON", "SB"].includes(row.game_type),
    )
    .map((row) => {
      const home = club(row.home_team),
        away = club(row.away_team),
        week = number(row, "week", 1, 22);
      check(
        home !== away && !ids.has(row.game_id) && Number.isInteger(week),
        "Invalid or duplicate game",
      );
      ids.add(row.game_id);
      for (const team of [home, away]) {
        const key = `${week}:${team}`;
        check(!joins.has(key), "Duplicate team-week game");
        joins.add(key);
      }
      return {
        id: row.game_id,
        type: row.game_type,
        week,
        home,
        away,
        date: row.gameday,
        kickoff: clean(row.gametime)
          ? easternTimestamp(row.gameday, row.gametime)
          : null,
        scores:
          clean(row.home_score) && clean(row.away_score)
            ? {
                [home]: number(row, "home_score", 0, 100),
                [away]: number(row, "away_score", 0, 100),
              }
            : null,
      };
    });
  check(games.length, "No season schedule");
  const regular = games.filter((game) => game.type === "REG");
  const complete =
    regular.length === 272 &&
    TEAMS.every(
      (team) =>
        regular.filter((game) => [game.home, game.away].includes(team))
          .length === 17,
    );
  const weeks = [...new Set(games.map((game) => game.week))]
    .sort((a, b) => a - b)
    .map((week) => {
      const dates = games
        .filter((game) => game.week === week)
        .map((game) => game.date)
        .sort();
      const type = games.find((game) => game.week === week).type;
      return {
        week,
        type,
        label:
          {
            WC: "Wild card",
            DIV: "Divisional round",
            CON: "Conference championships",
            SB: "Super Bowl",
          }[type] || `Week ${week}`,
        starts_at: easternTimestamp(tuesdayBefore(dates[0]), "00:00"),
        ends_at: easternTimestamp(nextTuesday(dates.at(-1)), "00:00"),
      };
    });
  for (let i = 1; i < weeks.length; i++)
    check(
      weeks[i].starts_at >= weeks[i - 1].ends_at,
      "Overlapping schedule weeks",
    );
  return { games, weeks, complete };
}
function statistics(inputs, games, season) {
  const teams = new Map(),
    players = [];
  for (const [key, target] of [
    ["teamStats", teams],
    ["playerStats", players],
  ]) {
    const rows = parseCsv(inputs[key].csv);
    columns(
      rows,
      [
        "season",
        "season_type",
        "game_id",
        "week",
        "team",
        "opponent_team",
        "def_tackles_solo",
        "def_tackles_with_assist",
        "def_tackle_assists",
        "def_sacks",
        "def_interceptions",
        ...(key === "teamStats"
          ? [
              "passing_yards",
              "rushing_yards",
              "sack_yards_lost",
              "sacks_suffered",
              "passing_interceptions",
              "fumbles_lost_total",
              "fumble_recovery_opp",
            ]
          : ["player_id"]),
      ],
      key,
    );
    const seen = new Set();
    for (const row of rows) {
      check(
        +row.season === season && ["REG", "POST"].includes(row.season_type),
        "Unexpected statistics season/type",
      );
      if (row.season_type !== "REG") continue;
      const team = club(row.team),
        opponent = club(row.opponent_team),
        game = games.find((game) => game.id === row.game_id);
      check(
        game &&
          game.week === +row.week &&
          [game.home, game.away].includes(team) &&
          (team === game.home ? game.away : game.home) === opponent,
        "Statistics game mismatch",
      );
      const counts = defensiveCounts(row),
        join = `${game.id}:${team}`;
      const id = key === "playerStats" ? identity(row) : team;
      if (!id && counts.every((value) => value === 0)) continue; // Unattributed zero-event rows carry no defensive facts.
      check(
        id && !seen.has(`${join}:${id}`),
        "Duplicate or unidentified statistics row",
      );
      seen.add(`${join}:${id}`);
      if (key === "teamStats")
        target.set(join, {
          counts,
          offense: [
            game.scores?.[team],
            number(row, "passing_yards", -200) +
              number(row, "rushing_yards", -200) +
              number(row, "sack_yards_lost", -200, 0),
            number(row, "sacks_suffered", 0, 30),
            number(row, "passing_interceptions", 0, 20) +
              number(row, "fumbles_lost_total", 0, 20),
          ],
          forced:
            number(row, "def_interceptions", 0, 20) +
            number(row, "fumble_recovery_opp", 0, 20),
        });
      else target.push({ join, id, counts });
    }
  }
  return { teams, players };
}
function preWeekStats(week, games, stats, now) {
  let through = 0;
  const accepted = [];
  // Only complete league weeks with scores and both team records qualify.
  // The source has no final flag; retain the previous 24-hour settlement guard.
  for (let prior = 1; prior < Math.min(week, 19); prior++) {
    const candidates = games.filter((game) => game.week === prior);
    if (
      !candidates.length ||
      candidates.some(
        (game) =>
          !game.scores ||
          !game.kickoff ||
          Date.parse(game.kickoff) + 86400000 > now ||
          !stats.teams.has(`${game.id}:${game.home}`) ||
          !stats.teams.has(`${game.id}:${game.away}`),
      )
    )
      break;
    accepted.push(...candidates);
    through = prior;
  }
  const totals = Object.fromEntries(
    TEAMS.map((team) => [
      team,
      { games: 0, offense: [0, 0, 0, 0], defense: [0, 0, 0, 0] },
    ]),
  );
  const keys = new Set();
  for (const game of accepted)
    for (const team of [game.home, game.away]) {
      const other = team === game.home ? game.away : game.home,
        key = `${game.id}:${team}`;
      const own = stats.teams.get(key),
        opponent = stats.teams.get(`${game.id}:${other}`),
        total = totals[team];
      total.games++;
      keys.add(key);
      own.offense.forEach((value, index) => (total.offense[index] += value));
      [
        opponent.offense[0],
        opponent.offense[1],
        own.counts[1],
        own.forced,
      ].forEach((value, index) => (total.defense[index] += value));
    }
  if (!through || Object.values(totals).some((total) => !total.games))
    return { through: 0, totals: null, stars: new Set() };
  for (const side of ["offense", "defense"]) {
    for (const total of Object.values(totals))
      for (const index of [0, 1]) total[side][index] /= total.games;
    for (let index = 0; index < 4; index++) {
      const values = Object.values(totals).map((total) => total[side][index]);
      for (const total of Object.values(totals)) {
        const value = total[side][index];
        total[side][index] = {
          value,
          ...rank(values, value, side === "offense" ? index >= 2 : index < 2),
        };
      }
    }
  }
  const sums = new Map(),
    reconciled = new Map();
  for (const row of stats.players.filter((row) => keys.has(row.join))) {
    if (!sums.has(row.id)) sums.set(row.id, [0, 0, 0]);
    if (!reconciled.has(row.join)) reconciled.set(row.join, [0, 0, 0]);
    row.counts.forEach((value, index) => {
      sums.get(row.id)[index] += value;
      reconciled.get(row.join)[index] += value;
    });
  }
  const stars = new Set();
  const coverage = [...keys].every((key) =>
    stats.teams
      .get(key)
      .counts.every(
        (value, index) => value === (reconciled.get(key)?.[index] || 0),
      ),
  );
  if (coverage)
    for (const [id, counts] of sums)
      if (
        counts.some(
          (value, index) =>
            value > 0 &&
            rank(
              [...sums.values()].map((other) => other[index]),
              value,
            ).rank <= 10,
        )
      )
        stars.add(id);
  return { through, totals, stars };
}
const BADGES = {
  Out: "OUT",
  Doubtful: "D",
  Questionable: "Q",
  "Did Not Participate In Practice": "DNP",
  "Limited Participation in Practice": "LP",
};
function injuryRecords(csv, season, games) {
  const rows = parseCsv(csv),
    reports = new Map();
  columns(
    rows,
    [
      "season",
      "week",
      "team",
      "gsis_id",
      "report_primary_injury",
      "report_status",
      "practice_status",
    ],
    "Injuries",
  );
  for (const row of rows) {
    if (
      +row.season !== season ||
      !["REG", "POST", "WC", "DIV", "CON", "SB"].includes(
        row.game_type || row.season_type,
      )
    )
      continue;
    const team = club(row.team),
      game = games.find(
        (game) =>
          game.week === +row.week && [game.home, game.away].includes(team),
      );
    check(game, "Injury cannot join a scheduled game");
    const key = `${row.week}:${team}`,
      id = identity(row);
    if (!reports.has(key)) reports.set(key, new Map());
    if (!id) continue; // The row still proves report availability for this team.
    check(!reports.get(key).has(id), "Duplicate injury without a report date");
    const gameStatus = clean(row.report_status),
      practice = clean(row.practice_status);
    reports.get(key).set(id, {
      injury:
        [
          ...new Set(
            [
              "report_primary_injury",
              "report_secondary_injury",
              "practice_primary_injury",
              "practice_secondary_injury",
            ]
              .map((key) => clean(row[key]))
              .filter(Boolean),
          ),
        ].join("; ") || "Not specified",
      game: gameStatus || "Not listed",
      practice: practice || "Not listed",
      badges: [BADGES[gameStatus], BADGES[practice]].filter(Boolean),
    });
  }
  return reports;
}
function depthSnapshots(csv, weeks, games, now) {
  const snapshots = new Map();
  const windows = Object.fromEntries(
    TEAMS.map((team) => [
      team,
      weeks.map((week) => {
        const game = games.find(
          (game) =>
            game.week === week.week && [game.home, game.away].includes(team),
        );
        return {
          week: week.week,
          start: Date.parse(week.starts_at),
          end: Math.min(
            now,
            Date.parse(week.ends_at) - 1,
            game
              ? game.kickoff
                ? Date.parse(game.kickoff) - 1
                : -Infinity
              : Infinity,
          ),
        };
      }),
    ]),
  );
  const parsed = parseCsv(csv, {
    maxRows: 2000000,
    onRow(row) {
      const team = club(row.team),
        instant = Date.parse(row.dt);
      check(
        Number.isFinite(instant) && instant <= now,
        "Invalid depth timestamp",
      );
      if (row.pos_grp === "Special Teams") return;
      check(
        row.pos_grp === "3WR 1TE" || /^Base .* D$/.test(row.pos_grp),
        "Unknown depth formation",
      );
      for (const window of windows[team])
        if (instant >= window.start && instant <= window.end) {
          const key = `${window.week}:${team}`,
            previous = snapshots.get(key);
          if (!previous || instant > previous.instant)
            snapshots.set(key, { instant, rows: [row] });
          else if (instant === previous.instant) previous.rows.push(row);
        }
    },
  });
  columns(
    parsed,
    [
      "dt",
      "team",
      "player_name",
      "gsis_id",
      "espn_id",
      "pos_grp",
      "pos_abb",
      "pos_slot",
      "pos_rank",
    ],
    "Depth",
  );
  return snapshots;
}
export function normalize(inputs, { season, now = new Date(), assets = {} }) {
  const instant = +now,
    { games, weeks, complete } = parseSchedule(inputs.schedule.csv, season);
  const roster = parseCsv(inputs.roster.csv);
  columns(
    roster,
    ["season", "team", "full_name", "gsis_id", "position", "status"],
    "Roster",
  );
  const players = new Map();
  const addPlayer = (player) => {
    players.set(`${player.team}:${player.id}`, player);
    return player;
  };
  for (const row of roster)
    if (
      +row.season === season &&
      !["CUT", "RET", "UFA", "FA"].includes(row.status)
    ) {
      const id = identity(row);
      if (id && clean(row.full_name))
        addPlayer({
          id,
          name: clean(row.full_name),
          team: club(row.team),
          position: clean(row.position),
        });
    }
  check(players.size > 0, "Roster has no identified current players");
  const reports = injuryRecords(inputs.injuries.csv, season, games),
    snapshots = depthSnapshots(inputs.depth.csv, weeks, games, instant);
  const stats = statistics(inputs, games, season);
  const outputWeeks = weeks.map((week) => {
    const pre = complete
      ? preWeekStats(week.week, games, stats, instant)
      : { through: 0, totals: null, stars: new Set() };
    const teams = Object.fromEntries(
      TEAMS.map((team) => {
        const game = games.find(
            (game) =>
              game.week === week.week && [game.home, game.away].includes(team),
          ),
          snapshot = snapshots.get(`${week.week}:${team}`),
          report = reports.get(`${week.week}:${team}`);
        const groups = new Map();
        for (const row of snapshot?.rows || []) {
          const id = identity(row),
            name = clean(row.player_name) || players.get(`${team}:${id}`)?.name;
          if (!id || !name) continue;
          const side = row.pos_grp === "3WR 1TE" ? "offense" : "defense",
            position = clean(row.pos_abb),
            slot = number(row, "pos_slot", 1, 20),
            order = number(row, "pos_rank", 1, 30),
            key = `${side}:${slot}`;
          check(
            position && Number.isInteger(slot) && Number.isInteger(order),
            "Invalid depth position/order",
          );
          const player = addPlayer({ id, name, team, position });
          if (!groups.has(key))
            groups.set(key, { side, slot, position, players: [] });
          const group = groups.get(key);
          check(
            group.position === position &&
              !group.players.some(
                (item) => item.id === id || item.order === order,
              ),
            "Conflicting depth slot",
          );
          group.players.push({
            id: player.id,
            name: player.name,
            order,
            injury: report?.get(id) || null,
            ...(side === "defense" && pre.stars.has(id) ? { star: true } : {}),
          });
        }
        const unit = (side) =>
          [...groups.values()]
            .filter((group) => group.side === side)
            .sort((a, b) => a.slot - b.slot)
            .map(({ position, slot, players }) => ({
              position,
              slot,
              players: players.sort((a, b) => a.order - b.order),
            }));
        return [
          team,
          {
            opponent: game
              ? game.home === team
                ? game.away
                : game.home
              : null,
            bye: !game && complete && week.type === "REG",
            report: Boolean(report),
            observed_at: snapshot
              ? new Date(snapshot.instant).toISOString()
              : null,
            offense: unit("offense"),
            defense: unit("defense"),
            stats: pre.totals?.[team] || null,
          },
        ];
      }),
    );
    return { ...week, stats_through: pre.through, teams };
  });
  const sources = sourceDefinitions(season).map((source) => ({
    ...source,
    ...inputs[source.key].metadata,
  }));
  return {
    schema_version: 1,
    season,
    generated_at: now.toISOString(),
    injury_updated_at: inputs.injuries.metadata.source_updated_at,
    sources,
    teams: assets,
    players: [...players.values()].sort((a, b) => a.name.localeCompare(b.name)),
    weeks: outputWeeks,
  };
}
export async function collect({
  season,
  fetchImpl = fetch,
  now = () => new Date(),
} = {}) {
  const startedAt = now();
  // Keep January through March attached to the NFL season that began last year.
  season ??= startedAt.getUTCFullYear() - (startedAt.getUTCMonth() < 3 ? 1 : 0);
  const sources = sourceDefinitions(season);
  const outcomes = await Promise.allSettled(
    sources.map((source) => fetchSource(source, { fetchImpl, now })),
  );
  const failures = outcomes.flatMap((result, index) =>
    result.status === "rejected"
      ? [`${sources[index].key}: ${result.reason.message}`]
      : [],
  );
  check(!failures.length, failures.join("\n"));
  const inputs = Object.fromEntries(
    sources.map((source, index) => [source.key, outcomes[index].value]),
  );
  const assets = JSON.parse(
    await readFile(new URL("../web/team-assets.json", import.meta.url), "utf8"),
  );
  return normalize(inputs, { season, now: now(), assets });
}
export async function publish({
  output = new URL("../web/current.json", import.meta.url),
  collectImpl = collect,
} = {}) {
  const pending = new URL("./current.json.pending", output);
  try {
    const data = await collectImpl();
    await writeFile(pending, JSON.stringify(data) + "\n", { flag: "wx" });
    await rename(pending, output);
    return data;
  } finally {
    await rm(pending, { force: true });
  }
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const data = await publish();
  console.log(
    `${data.season}: ${data.weeks.length} weeks, ${data.players.length} searchable players`,
  );
}
