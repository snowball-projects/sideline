// A manually reviewed, optional facts pilot. This never enters injury logic.
const SOURCE_URLS = {
  PHI: ["https://www.philadelphiaeagles.com/team/coaches/vic-fangio", "https://www.philadelphiaeagles.com/news/eagles-name-vic-fangio-defensive-coordinator"],
  NYJ: ["https://www.newyorkjets.com/team/coaches-roster/brian-duker", "https://www.newyorkjets.com/news/brian-duker-jets-defensive-coordinator-01-28-2026"],
  CLE: ["https://www.clevelandbrowns.com/team/coaches-roster/mike-rutenberg", "https://www.clevelandbrowns.com/news/browns-name-coordinators-for-the-2026-coaching-staff"],
  WAS: ["https://www.commanders.com/team/coaches-roster/daronte-jones"],
  NE: ["https://www.patriots.com/team/coaches-roster/zak-kuhr", "https://www.patriots.com/news/analysis-patriots-promote-zak-kuhr-to-defensive-coordinator-terrell-williams-named-assistant-head-coach"],
  MIA: ["https://www.miamidolphins.com/team/coaches-roster/sean-duggan"],
};
const TITLES = { dc: "Defensive Coordinator", acting_dc: "Acting Defensive Coordinator", co_dc: "Co-Defensive Coordinator" };
export const MAX_COORDINATOR_BYTES = 16384;
export function validateCoordinators(data, now = Date.now()) {
  const invalid = () => { throw new Error("Invalid coordinator facts pilot."); };
  const keys = (value, expected) => value && Object.keys(value).sort().join() === [...expected].sort().join();
  if (!keys(data, ["schema_version", "season", "checked_at", "maintenance", "appointments"]) || data.schema_version !== 1 || data.season !== 2026 || data.maintenance !== "manual" ||
      typeof data.checked_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(data.checked_at) || !Number.isFinite(Date.parse(data.checked_at)) ||
      Date.parse(data.checked_at) > now + 300000 ||
      !Array.isArray(data.appointments) || data.appointments.length > 12) invalid();
  const teams = new Map();
  for (const record of data.appointments) {
    if (!keys(record, ["team", "name", "role", "title", "start_season", "sources"]) || !Object.hasOwn(SOURCE_URLS, record.team) || !Object.hasOwn(TITLES, record.role) ||
        record.title !== TITLES[record.role] || typeof record.name !== "string" ||
        !record.name.trim() || record.name.length > 80 || /[<>\x00-\x1f]/.test(record.name) ||
        !Number.isInteger(record.start_season) || record.start_season < 1900 || record.start_season > data.season ||
        !Array.isArray(record.sources) || !record.sources.length || record.sources.length > 2 ||
        new Set(record.sources).size !== record.sources.length ||
        record.sources.some((url, index) => url !== SOURCE_URLS[record.team][index])) invalid();
    const previous = teams.get(record.team) || [];
    if (previous.some(p => p.name === record.name) || previous.length >= 2 ||
        (previous.length && (record.role !== "co_dc" || previous[0].role !== "co_dc"))) invalid();
    teams.set(record.team, [...previous, record]);
  }
  return data;
}
export function coordinatorFor(data, team, { mode, season, now = Date.now() } = {}) {
  if (!data || mode !== "live" || season !== data.season ||
      now < Date.parse(data.checked_at)) return null;
  const appointments = data.appointments.filter(record => record.team === team);
  return appointments.length ? appointments : null;
}
export function coordinatorLabel(records) {
  return records.map(record => {
    const title = { dc: "DC", acting_dc: "Acting DC", co_dc: "Co-DC" }[record.role];
    return `${title} ${record.name} · since ${record.start_season}`;
  }).join(" / ");
}
