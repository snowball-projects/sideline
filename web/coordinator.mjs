// Independently researched manual facts; never used for injuries or rankings.
const SOURCE_URLS = {
  "ARI": [
    "https://www.azcardinals.com/team/coaches-roster/nick-rallis",
    "https://www.azcardinals.com/news/cardinals-officially-name-nick-rallis-drew-petzing-as-new-coordinators",
    "https://www.denverbroncos.com/team/coaches-roster/vance-joseph",
    "https://www.azcardinals.com/news/one-nfl-coaching-job-filled-four-to-go-as-cardinals-continue-interviews"
  ],
  "ATL": [
    "https://www.atlantafalcons.com/team/coaches-roster/jeff-ulbrich",
    "https://www.atlantafalcons.com/news/atlanta-falcons-announce-jeff-ulbrich-as-next-defensive-coordinator",
    "https://www.atlantafalcons.com/news/retain-jeff-ulbrich-defensive-coordinator",
    "https://www.atlantafalcons.com/news/atlanta-falcons-part-ways-with-defensive-coordinator-jimmy-lake-defensive-line-coach-jay-rodgers"
  ],
  "BAL": [
    "https://www.baltimoreravens.com/team/coaches-roster/anthony-weaver",
    "https://www.baltimoreravens.com/news/anthony-weaver-ravens-defensive-coordinator-hire-jesse-minter",
    "https://www.chargers.com/news/zach-orr-defensive-coordinator-search-interview"
  ],
  "BUF": [
    "https://www.buffalobills.com/team/coaches-roster/jim-leonhard",
    "https://www.buffalobills.com/news/bills-hire-former-buffalo-safety-jim-leonhard-as-defensive-coordinator",
    "https://uwbadgers.com/sports/football/roster/coaches/jim-leonhard/1965",
    "https://www.packers.com/team/coaches-roster/bobby-babich",
    "https://www.buffalobills.com/news/buffalo-bills-promote-bobby-babich-to-defensive-coordinator"
  ],
  "CAR": [
    "https://www.panthers.com/team/coaches-roster/ejiro-evero",
    "https://www.panthers.com/news/panthers-agree-to-terms-with-ejiro-evero-to-become-defensive-coordinator",
    "https://www.panthers.com/news/al-holcomb-taking-over-defensive-play-calling"
  ],
  "CHI": [
    "https://www.chicagobears.com/team/coaches/dennis-allen",
    "https://www.chicagobears.com/news/bears-announce-addition-of-coordinators",
    "https://www.chicagobears.com/news/bears-hire-eric-washington-as-defensive-coordinator"
  ],
  "CIN": [
    "https://www.bengals.com/team/coaches-roster/al-golden",
    "https://www.bengals.com/news/bengals-hire-al-golden-as-defensive-coordinator",
    "https://www.bengals.com/news/reports-bengals-part-ways-with-defensive-coordinator-lou-anarumo",
    "https://www.bengals.com/news/al-golden-s-varied-resume-he-s-really-on-the-details"
  ],
  "CLE": [
    "https://www.clevelandbrowns.com/team/coaches-roster/mike-rutenberg",
    "https://www.clevelandbrowns.com/news/browns-name-coordinators-for-the-2026-coaching-staff",
    "https://www.clevelandbrowns.com/news/jim-schwartz-named-browns-defensive-coordinator",
    "https://www.clevelandbrowns.com/news/jim-schwartz-resigns-as-browns-defensive-coordinator"
  ],
  "DAL": [
    "https://www.dallascowboys.com/team/coaches-roster/christian-parker",
    "https://www.dallascowboys.com/news/cowboys-working-towards-hiring-christian-parker-as-defensive-coordinator",
    "https://www.dallascowboys.com/news/christian-parker-cowboys-part-ways-with-several-defensive-coaches",
    "https://www.dallascowboys.com/news/past-present-matt-eberflus-expected-to-join-49ers-staff"
  ],
  "DEN": [
    "https://www.denverbroncos.com/team/coaches-roster/vance-joseph",
    "https://www.denverbroncos.com/news/broncos-announce-series-of-coaching-hires",
    "https://www.denverbroncos.com/video/broncos-country-connected-the-scheme-always-has-to-start-with-the-players-dc-eji",
    "https://www.denverbroncos.com/video/ejiro-evero-a-lot-of-guys-have-done-a-good-job-stepping-up"
  ],
  "DET": [
    "https://www.detroitlions.com/team/coaches-roster/kelvin-sheppard",
    "https://www.detroitlions.com/news/5-things-to-know-about-new-dc-kelvin-sheppard",
    "https://www.detroitlions.com/news/week-3-opponent-what-the-jets-are-saying-glenn-goff-gibbs"
  ],
  "GB": [
    "https://www.packers.com/team/coaches-roster/jonathan-gannon",
    "https://www.packers.com/news/packers-name-jonathan-gannon-defensive-coordinator-feb-2-2026",
    "https://www.packers.com/news/5-things-to-know-about-new-packers-defensive-coordinator-jonathan-gannon-2-2-2026",
    "https://www.packers.com/news/new-formula-same-goals-for-packers-resurgent-defense-dec-17-2025",
    "https://www.packers.com/news/jonathan-gannon-building-new-system-for-packers-defense-2026"
  ],
  "HOU": [
    "https://www.houstontexans.com/team/coaches-roster/matt-burke",
    "https://www.houstontexans.com/news/houston-texans-announce-2026-coaching-staff",
    "https://www.houstontexans.com/news/14-things-to-know-about-head-coach-lovie-smith",
    "https://www.houstontexans.com/podcasts/demeco-ryans-takes-over-defensive-play-calling-as-nick-caserio-ed-ingram-preview-texans-at-titans-texans-all-access",
    "https://www.houstontexans.com/podcasts/",
    "https://www.houstontexans.com/news/houston-texans-announce-2022-coaching-staff",
    "https://www.houstontexans.com/news/texans-hc-lovie-smith-i-will-be-calling-the-defenses"
  ],
  "IND": [
    "https://www.colts.com/team/coaches-roster/lou-anarumo",
    "https://www.colts.com/news/lou-anarumo-defensive-coordinator-hired-cincinnati-bengals-2025-season",
    "https://www.colts.com/news/colts-2025-training-camp-preview-lou-anarumo-defense-kenny-moore-cam-bynum-laiatu-latu",
    "https://www.colts.com/news/lou-anarumo-blitzes-coverage-schemes-tackling-fixes-new-defensive-coordinator-cincinnati-bengals"
  ],
  "JAX": [
    "https://www.jaguars.com/team/coaches-roster/anthony-campanile",
    "https://www.jaguars.com/news/k000156-jaguars-hire-anthony-campanile-as-defensive-coordinator",
    "https://www.jaguars.com/news/k00022-jaguars-retain-offensive-coordinator-grant-udinski-defensive-coordinator-anthony-campanile",
    "https://www.jaguars.com/news/jaguars-hire-ryan-nielsen-as-defensive-coordinator",
    "https://www.jaguars.com/video/k000025-ryan-nielsen-reflects-on-jaguars-defense-in-2024-press-conference"
  ],
  "KC": [
    "https://www.chiefs.com/team/coaches-roster/steve-spagnuolo",
    "https://www.chiefs.com/news/chiefs-hire-steve-spagnuolo-as-defensive-coordinator",
    "https://www.chiefs.com/news/chiefs-name-bob-sutton-as-defensive-coordinator-9342416",
    "https://www.chiefs.com/news/bob-sutton-relieved-of-defensive-coordinator-duties"
  ],
  "LAC": [
    "https://www.chargers.com/team/coaches-roster/chris-o-leary",
    "https://www.chargers.com/news/agree-to-terms-chris-oleary-defensive-coordinator-2026",
    "https://www.chargers.com/news/jesse-minter-ravens-head-coach",
    "https://www.baltimoreravens.com/news/jesse-minter-five-things-to-know-ravens-interview"
  ],
  "LAR": [
    "https://www.therams.com/team/coaches-roster/chris-shula",
    "https://www.therams.com/news/rams-promote-chris-shula-to-defensive-coordinator",
    "https://www.therams.com/news/nfl-head-coaches-react-to-aaron-donald-s-retirement-reflect-on-his-legacy-and-impact"
  ],
  "LV": [
    "https://www.raiders.com/team/coaches-roster/rob-leonard",
    "https://www.raiders.com/news/rob-leonard-named-raiders-defensive-coordinator",
    "https://www.raiders.com/news/rob-leonard-defensive-line-coach-run-game-coordinator-enters-third-year-with-raiders",
    "https://www.steelers.com/team/coaches-roster/patrick-graham"
  ],
  "MIA": [
    "https://www.miamidolphins.com/team/coaches-roster/sean-duggan",
    "https://www.baltimoreravens.com/team/coaches-roster/anthony-weaver"
  ],
  "MIN": [
    "https://www.vikings.com/team/coaches-roster/brian-flores",
    "https://www.vikings.com/news/brian-flores-defensive-coordinator-hired-2023",
    "https://www.vikings.com/news/brian-flores-defensive-coordinator-contract-extension-2026",
    "https://www.vikings.com/video/brian-flores-on-dallas-turner-pass-rush-teaching-defensive-scheme-philosophy-adapting-game-plan",
    "https://www.vikings.com/news/2023-training-camp-preview-defensive-line"
  ],
  "NE": [
    "https://www.patriots.com/team/coaches-roster/zak-kuhr",
    "https://www.patriots.com/news/analysis-patriots-promote-zak-kuhr-to-defensive-coordinator-terrell-williams-named-assistant-head-coach",
    "https://www.patriots.com/news/patriots-announce-new-additions-to-coaching-staff-x8810",
    "https://www.tennesseetitans.com/team/transactions/2020",
    "https://www.patriots.com/team/coaches-roster/terrell-williams"
  ],
  "NO": [
    "https://www.neworleanssaints.com/team/coaches-roster/brandon-staley",
    "https://www.neworleanssaints.com/news/new-orleans-saints-coaching-staff-2025-saints-coordinators-assistant-coaches-kellen-moore",
    "https://www.49ers.com/news/49ers-announce-coaching-staff-moves-ahead-of-2024-season",
    "https://www.neworleanssaints.com/news/las-vegas-raiders-vs-new-orleans-saints-game-preview-2026-nfl-season-week-3-series-history-stats-connections",
    "https://www.neworleanssaints.com/video/joe-woods-defensive-coordinator-interview-1-2-2025-new-orleans-saints-vs-tampa-bay-buccaneers-2024-nfl-week-18"
  ],
  "NYG": [
    "https://www.giants.com/team/coaches-roster/dennard-wilson",
    "https://www.giants.com/news/john-harbaugh-announces-2026-coaching-staff-coordinators-matt-nagy-dennard-wilson-chris-horton",
    "https://www.giants.com/team/coaches-roster/charlie-bullen",
    "https://www.giants.com/news/shane-bowen-relieved-of-duties-charlie-bullen-named-defensive-coordinator"
  ],
  "NYJ": [
    "https://www.newyorkjets.com/team/coaches-roster/brian-duker",
    "https://www.newyorkjets.com/news/brian-duker-jets-defensive-coordinator-01-28-2026",
    "https://www.newyorkjets.com/news/steve-wilks-relieved-of-duties-jets-defensive-coordinator-12-15-2025",
    "https://www.newyorkjets.com/team/coaches-roster/chris-harris",
    "https://www.newyorkjets.com/news/defensive-coordinator-steve-wilks-confident-jets-defenseaaron-glenn-otas-05-29-2025"
  ],
  "PHI": [
    "https://www.philadelphiaeagles.com/team/coaches/vic-fangio",
    "https://www.philadelphiaeagles.com/news/eagles-name-vic-fangio-defensive-coordinator",
    "https://www.philadelphiaeagles.com/news/eagles-name-sean-desai-defensive-coordinator",
    "https://www.philadelphiaeagles.com/news/morning-roundup-i-still-see-light-at-the-end-of-the-tunnel"
  ],
  "PIT": [
    "https://www.steelers.com/team/coaches-roster/patrick-graham",
    "https://www.steelers.com/news/graham-named-steelers-defensive-coordinator",
    "https://www.azcardinals.com/team/coaches-roster/teryl-austin"
  ],
  "SEA": [
    "https://www.seahawks.com/team/coaches-roster/aden-durde",
    "https://www.philadelphiaeagles.com/team/coaches/clint-hurtt"
  ],
  "SF": [
    "https://www.49ers.com/team/coaches-roster/raheem-morris",
    "https://www.49ers.com/news/49ers-announce-coaching-staff-moves-raheem-morris-matt-eberflus-roman-sapolu",
    "https://www.49ers.com/news/49ers-kickoff-preseason-at-home-5-takeaways-from-tenvssf"
  ],
  "TB": [
    "https://www.buccaneers.com/team/coaches-roster/todd-bowles",
    "https://www.buccaneers.com/team/coaches-roster/",
    "https://www.buccaneers.com/news/alex-anzalone-diversified-role-todd-bowles-defense-2026"
  ],
  "TEN": [
    "https://www.tennesseetitans.com/team/coaches-roster/gus-bradley",
    "https://www.tennesseetitans.com/news/titans-hire-gus-bradley-as-defensive-coordinator",
    "https://www.giants.com/team/coaches-roster/dennard-wilson",
    "https://www.tennesseetitans.com/news/new-titans-dc-gus-bradley-preaches-consistency-while-playing-fast-and-violent"
  ],
  "WAS": [
    "https://www.commanders.com/team/coaches-roster/daronte-jones",
    "https://www.steelers.com/team/coaches-roster/joe-whitt-jr",
    "https://www.commanders.com/news/five-things-to-know-about-commanders-defensive-coordinator-joe-whitt-jr",
    "https://www.commanders.com/news/commanders-defensive-coordinator-command-center-podcast",
    "https://www.commanders.com/news/dan-quinn-explains-decision-to-take-over-role-as-defensive-play-caller"
  ]
};
const TITLES = {dc: 'Defensive Coordinator', acting_dc: 'Acting Defensive Coordinator', co_dc: 'Co-Defensive Coordinator', hc_playcaller: 'Head Coach'};
export const MAX_COORDINATOR_BYTES = 192 * 1024;
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...expected].sort().join();
const text = (value, max = 100) => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max && !/[<>\x00-\x1f]/.test(value);
const season = value => Number.isInteger(value) && value >= 1900 && value <= 2026;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
export function validateCoordinators(data, now = Date.now()) {
  const invalid = () => { throw new Error('Invalid defensive coaching facts.'); };
  if (!keys(data, ['schema_version','season','checked_at','maintenance','appointments','history']) || data.schema_version !== 2 || data.season !== 2026 || data.maintenance !== 'manual' ||
      !timestamp(data.checked_at) || Date.parse(data.checked_at) > now + 300000 ||
      !Array.isArray(data.appointments) || data.appointments.length > 64 || !Array.isArray(data.history) || data.history.length > 32) invalid();
  const checked = record => timestamp(record.checked_at) && Date.parse(record.checked_at) <= Date.parse(data.checked_at);
  const sources = (record, team) => Array.isArray(record.sources) && record.sources.length > 0 && record.sources.length <= 4 && new Set(record.sources).size === record.sources.length && record.sources.every(url => SOURCE_URLS[team].includes(url));
  const scope = record => record.scope === null || text(record.scope, 140);
  const range = record => season(record.start_season) && season(record.end_season) && record.start_season <= record.end_season;
  const teams = new Map();
  for (const record of data.appointments) {
    if (!keys(record,['team','name','role','title','start_season','sources','checked_at']) || !Object.hasOwn(SOURCE_URLS,record.team) || !Object.hasOwn(TITLES,record.role) ||
        record.title !== TITLES[record.role] || !text(record.name,80) || !season(record.start_season) || !checked(record) || !sources(record,record.team) ||
        (record.role === 'hc_playcaller' && record.team !== 'TB')) invalid();
    const previous = teams.get(record.team) || [];
    if (previous.some(p => p.name === record.name) || previous.length >= 2 || (previous.length && (record.role !== 'co_dc' || previous[0].role !== 'co_dc'))) invalid();
    teams.set(record.team,[...previous,record]);
  }
  const historicalTeams = new Set();
  for (const history of data.history) {
    if (!keys(history,['team','name','prior_jobs','predecessors','play_callers']) || !teams.get(history.team)?.some(record => record.name === history.name) || historicalTeams.has(history.team) ||
        !Array.isArray(history.prior_jobs) || history.prior_jobs.length > 24 || !Array.isArray(history.predecessors) || history.predecessors.length > 4 || !Array.isArray(history.play_callers) || history.play_callers.length > 4) invalid();
    historicalTeams.add(history.team);
    const signatures = new Set();
    for (const [kind,records] of [['job',history.prior_jobs],['predecessor',history.predecessors],['caller',history.play_callers]]) {
      for (const record of records) {
        const common = text(record.title) && checked(record) && sources(record,history.team) && scope(record);
        if (!common) invalid();
        if (kind === 'job' && (!keys(record,['organization','title','start_season','end_season','scope','sources','checked_at']) || !text(record.organization) || !range(record))) invalid();
        if (kind === 'predecessor' && (!keys(record,['name','title','start_season','end_season','relationship','scope','sources','checked_at']) || !text(record.name,80) || !range(record) ||
            !['immediate','previous_season','previous_formal'].includes(record.relationship) || !/Defensive Coordinator/.test(record.title))) invalid();
        if (kind === 'caller' && (!keys(record,['organization','name','title','season','scope','sources','checked_at']) || !text(record.organization) || !text(record.name,80) || !season(record.season))) invalid();
        const signature = JSON.stringify([kind,record.organization,record.name,record.title,record.start_season || record.season,record.end_season]);
        if (signatures.has(signature)) invalid();
        signatures.add(signature);
      }
    }
    if (history.predecessors.filter(p => p.relationship === 'immediate').length > 1 ||
        (teams.get(history.team)[0].role === 'hc_playcaller' && history.predecessors.some(p => p.relationship === 'immediate'))) invalid();
  }
  return data;
}
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
