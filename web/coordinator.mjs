export function coordinatorFor(data, team, {mode,season,now = Date.now()} = {}) {
  if (!data || mode !== 'live' || season !== data.season) return null;
  const records = data.appointments.filter(record => record.team === team && now >= Date.parse(record.checked_at));
  return records.length ? records : null;
}
export function coordinatorLabel(records) {
  return records.map(record => record.role === 'hc_playcaller' ? `HC ${record.name} · calls defense` :
    `${{dc:'DC',acting_dc:'Acting DC',co_dc:'Co-DC'}[record.role]} ${record.name} · since ${record.start_season}`).join(' / ');
}
export function coachingSeasons(record) {
  return record.start_season === record.end_season ? String(record.start_season) : `${record.start_season}–${record.end_season}`;
}
