// Exact source identities only. Weekly report rows are observations, not
// distinct injuries, daily revisions, or a reconstruction of healthy weeks.
export function playerInjuryRecords(feed, playerId, selectedWeekKey) {
  const selected = feed.weeks.find((week) => week.key === selectedWeekKey);
  if (!selected) return [];
  const weeks = new Map(feed.weeks.filter((week) =>
    week.season === selected.season && Date.parse(week.starts_at) <= Date.parse(selected.starts_at)
  ).map((week) => [week.key, week]));
  return feed.reports.flatMap((report) => {
    const week = weeks.get(report.week_key);
    if (!week) return [];
    return report.entries.filter((entry) => entry.id === playerId).map((entry) => ({
      week, report, entry,
    }));
  }).sort((a, b) => Date.parse(b.week.starts_at) - Date.parse(a.week.starts_at) || a.report.team.localeCompare(b.report.team));
}

export function ageOnDate(birthDate, now = Date.now()) {
  const date = new Date(now).toISOString().slice(0, 10);
  return Number(date.slice(0, 4)) - Number(birthDate.slice(0, 4)) -
    (date.slice(5) < birthDate.slice(5) ? 1 : 0);
}

export function bioFacts(bio, now = Date.now()) {
  if (!bio) return [];
  const rows = [];
  if (bio.birth_date) rows.push(["Age / born", ageOnDate(bio.birth_date, now) + " · " + bio.birth_date]);
  if (bio.years_exp !== undefined) rows.push(["League experience", bio.years_exp + (bio.years_exp === 1 ? " year" : " years")]);
  // entry_year is first NFL eligibility, not a debut, draft, or rookie season.
  if (bio.entry_year !== undefined) rows.push(["NFL eligible since", String(bio.entry_year)]);
  if (bio.college) rows.push(["College", bio.college]);
  if (bio.draft_club || bio.draft_number) rows.push(["Draft", [bio.draft_club, bio.draft_number ? "#" + bio.draft_number : null].filter(Boolean).join(" · ")]);
  return rows;
}
