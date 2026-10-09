import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {coordinatorFor,coordinatorLabel,coachingSeasons,validateCoordinators,MAX_COORDINATOR_BYTES} from '../web/coordinator.mjs';
import {TEAMS} from '../web/feed.mjs';
const facts=JSON.parse(await readFile(new URL('../web/coordinators.json',import.meta.url),'utf8'));
const now=Date.parse(facts.checked_at);
const context={mode:'live',season:2026,now};
const history=team=>facts.history.find(h=>h.team===team);

test('all-team reviewed context preserves 31 formal coordinators and a separately titled head-coach playcaller',()=>{
 validateCoordinators(facts,now);
 assert.deepEqual(facts.appointments.map(r=>r.team).sort(),[...TEAMS].sort());
 assert.equal(facts.appointments.filter(r=>r.role==='dc').length,31);
 assert.equal(coordinatorLabel(coordinatorFor(facts,'PHI',context)),'DC Vic Fangio · since 2024');
 assert.equal(coordinatorLabel(coordinatorFor(facts,'NE',context)),'DC Zak Kuhr · since 2026');
 assert.equal(coordinatorLabel(coordinatorFor(facts,'TB',context)),'HC Todd Bowles · calls defense');
 assert.equal(coordinatorFor(facts,'HOU',context)[0].name,'Matt Burke');
 assert.equal(history('HOU').play_callers.find(r=>r.season===2026).name,'DeMeco Ryans');
 assert.equal(history('TEN').play_callers[0].name,'Robert Saleh');
 assert.equal(coordinatorFor(facts,'ZZZ',context),null);
 assert.equal(coordinatorFor(facts,'NE',{...context,season:2025}),null);
 assert.equal(coordinatorFor(facts,'NE',{...context,mode:'example'}),null);
 assert.equal(coordinatorFor(null,'NE',context),null);
 assert.ok(Buffer.byteLength(JSON.stringify(facts))<MAX_COORDINATOR_BYTES);
});

test('manual facts preserve individual verification dates across durable refreshes and separate history research',()=>{
 const philly=coordinatorFor(facts,'PHI',context)[0];
 const checked=Date.parse(philly.checked_at);
 assert.equal(philly.checked_at,'2026-10-09T03:48:05.346Z');
 assert.equal(coordinatorFor(facts,'PHI',{...context,now:checked-1}),null);
 assert.ok(coordinatorFor(facts,'PHI',{...context,now:now+30*86400000}));
 assert.ok(coordinatorFor(facts,'PHI',{...context,now:now+365*86400000}));
 assert.ok(Date.parse(history('PHI').prior_jobs[0].checked_at)>checked);
 assert.equal(facts.maintenance,'manual');
 assert.throws(()=>validateCoordinators(facts,now-300001));
});

test('predecessors preserve interim and head-coach exceptions without manufacturing complete succession',()=>{
 assert.equal(history('NYG').predecessors[0].name,'Charlie Bullen');
 assert.equal(history('NYG').predecessors[0].title,'Interim Defensive Coordinator');
 assert.equal(history('NYG').predecessors[0].scope,'final five games');
 assert.equal(history('NYJ').predecessors[0].name,'Chris Harris');
 assert.equal(history('NE').predecessors[0].name,'Terrell Williams');
 assert.equal(history('NE').play_callers[0].name,'Zak Kuhr');
 assert.equal(history('NE').play_callers[0].season,2025);
 assert.equal(history('MIN').play_callers[0].organization,'NE');
 assert.equal(history('MIN').play_callers[0].season,2018);
 assert.deepEqual(history('TB').predecessors,[]);
 assert.equal(history('HOU').predecessors[0].relationship,'previous_formal');
 assert.equal(history('HOU').predecessors[0].end_season,2021);
 assert.equal(history('DEN').predecessors[0].relationship,'previous_season');
 assert.equal(history('JAX').predecessors[0].relationship,'previous_season');
});

test('selected job records preserve separate stints, college titles and limited season scopes',()=>{
 assert.equal(facts.history.reduce((n,h)=>n+h.prior_jobs.length,0),255);
 const den=history('DEN').prior_jobs;
 assert.ok(den.some(r=>r.title==='Head Coach'&&r.start_season===2017&&r.end_season===2018));
 assert.ok(den.some(r=>r.organization==='Wyoming'&&r.scope==='spring only'));
 assert.ok(history('PHI').prior_jobs.some(r=>r.title==='Consultant'&&r.start_season===2022));
 assert.ok(history('MIA').prior_jobs.some(r=>r.title.includes('Co-Defensive')&&r.organization==='Boston College'));
 assert.equal(coachingSeasons({start_season:2023,end_season:2023}),'2023');
 assert.equal(coachingSeasons({start_season:2021,end_season:2024}),'2021–2024');
});

test('optional facts reject unreviewed source paths, broken joins, contradictory seasons and invented titles',()=>{
 for(const mutate of [
  d=>d.appointments[0].sources=['https://www.azcardinals.com/team/injury-report/'],
  d=>d.appointments[0].sources=['javascript:alert(1)'],
  d=>d.appointments[0].team='ZZZ',
  d=>d.appointments[0].role='head_coach',
  d=>d.appointments[0].title='Head Coach',
  d=>d.appointments[0].start_season=2027,
  d=>d.appointments.push({...d.appointments[0],name:'Conflicting Synthetic DC'}),
  d=>d.appointments[0].checked_at='2026-10-10T00:00:00Z',
  d=>d.raw_biography='unreviewed content',
  d=>d.history[0].name='Broken coach join',
  d=>d.history[0].prior_jobs[0].end_season=1900,
  d=>d.history[0].prior_jobs.push({...d.history[0].prior_jobs[0]}),
  d=>d.history[0].predecessors[0].relationship='complete_career',
  d=>d.history[0].play_callers.push({name:'Synthetic caller'}),
 ]){const changed=structuredClone(facts);mutate(changed);assert.throws(()=>validateCoordinators(changed,now));}
});

test('explicitly supported acting and shared roles retain their distinct titles and people',()=>{
 const base=structuredClone(facts.appointments.find(r=>r.team==='NE'));
 const shared={...structuredClone(facts),history:[],appointments:[
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
