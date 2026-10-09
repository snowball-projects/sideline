import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { coordinatorFor, coordinatorLabel, validateCoordinators, COORDINATOR_RECHECK_MS } from '../web/coordinator.mjs';
const pilot = JSON.parse(await readFile(new URL('../web/coordinators.json', import.meta.url), 'utf8'));
const now = Date.parse(pilot.checked_at);
const context = {mode:'live', season:2026, now};

test('reviewed pilot preserves formal coordinator role and season, rather than consultancy, head-coach title or earlier play-calling', () => {
  const data = validateCoordinators(structuredClone(pilot), now);
  assert.deepEqual(data.appointments.map(r=>r.team).sort(), ['CLE','MIA','NE','NYJ','PHI','WAS']);
  assert.equal(coordinatorLabel(coordinatorFor(data, 'PHI', context)), 'DC Vic Fangio · since 2024');
  assert.equal(coordinatorLabel(coordinatorFor(data, 'NE', context)), 'DC Zak Kuhr · since 2026');
  assert.equal(coordinatorFor(data, 'TB', context), null);
  assert.equal(coordinatorFor(data, 'CAR', context), null);
  assert.equal(coordinatorFor(data, 'NE', {...context, season:2025}), null);
  assert.equal(coordinatorFor(data, 'NE', {...context, mode:'example'}), null);
  assert.equal(coordinatorFor(null, 'NE', context), null);
});

test('manual observations never become current facts before checking or beyond their recheck window', () => {
  assert.equal(coordinatorFor(pilot,'PHI',{...context, now:now-1}),null);
  assert.ok(coordinatorFor(pilot,'PHI',{...context, now:now+COORDINATOR_RECHECK_MS}));
  assert.equal(coordinatorFor(pilot,'PHI',{...context, now:now+COORDINATOR_RECHECK_MS+1}),null);
  assert.throws(()=>validateCoordinators(pilot,now-300001));
});

test('optional facts reject unrelated source paths, metadata, conflicting roles and invented head-coach assignments', () => {
  for (const mutate of [
    d=>d.appointments[0].sources=['https://www.philadelphiaeagles.com/team/injury-report/'],
    d=>d.appointments[0].sources=['javascript:alert(1)'],
    d=>d.appointments[0].team='TB',
    d=>d.appointments[0].role='head_coach',
    d=>d.appointments[0].title='Head Coach',
    d=>d.appointments[0].start_season=2027,
    d=>d.appointments.push({...d.appointments[0],name:'Conflicting Synthetic DC'}),
    d=>d.appointments[0].play_caller=true,
    d=>d.raw_biography='unreviewed content',
    d=>d.checked_at='not a timestamp',
  ]) {
    const changed=structuredClone(pilot);mutate(changed);
    assert.throws(()=>validateCoordinators(changed,now));
  }
});

test('explicitly sourced shared roles remain an array and acting roles retain their title', () => {
  const base=structuredClone(pilot.appointments.find(r=>r.team==='NE'));
  const shared={schema_version:1,season:2026,checked_at:pilot.checked_at,appointments:[
    {...base,name:'Synthetic Coach One',role:'co_dc',title:'Co-Defensive Coordinator'},
    {...base,name:'Synthetic Coach Two',role:'co_dc',title:'Co-Defensive Coordinator'},
  ]};
  validateCoordinators(shared,now);
  assert.equal(coordinatorFor(shared,'NE',context).length,2);
  assert.match(coordinatorLabel(shared.appointments),/^Co-DC Synthetic Coach One.*Co-DC Synthetic Coach Two/);
  shared.appointments=[{...base,name:'Synthetic Acting Coach',role:'acting_dc',title:'Acting Defensive Coordinator'}];
  validateCoordinators(shared,now);
  assert.equal(coordinatorLabel(shared.appointments),'Acting DC Synthetic Acting Coach · since 2026');
});
