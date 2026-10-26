import test from 'node:test';
import assert from 'node:assert/strict';
import { cardContext, cardRoster, restoreCards } from '../web/team-cards.mjs';
import { fieldFixture, NOW, selectedIds } from './browser/field-fixture.mjs';
import { normalizeDepthCsv } from '../scripts/source-adapter.mjs';
import { validateFeed } from '../scripts/validate-feed.mjs';
import { defenseFixture } from './fixtures/defense-stats.mjs';
import { defenseRankings } from '../web/defense-stats.mjs';
const now=Date.parse(NOW), state={team:'BUF',side:'opponent',unit:'defense',focusId:selectedIds(1)[0]};

test('card origin, viewed team, unit and optional focus are independent; exact team/week report joins',()=>{
 const feed=fieldFixture(), week=feed.weeks[0].key;
 const opponent=cardContext(feed,state,week,now);assert.equal(opponent.team,'CAR');assert.equal(opponent.focus.position,'QB');
 const own=cardContext(feed,{...state,side:'own',unit:'offense'},week,now);
 assert.equal(own.team,'BUF');assert.equal(own.report,undefined);assert.equal(own.focus.id,state.focusId);
 assert(cardRoster(feed,own,week,now).some(member=>member.focused));
 const defense=cardRoster(feed,opponent,week,now);
 assert(defense.some(member=>member.starter && member.injury?.game_status==='Out'));
 assert(defense.some(member=>member.relevant));
 assert(cardRoster(feed,cardContext(feed,{...state,focusId:''},week,now),week,now).every(member=>!member.focused&&!member.relevant));
 const later=cardContext(feed,state,feed.weeks[1].key,now);assert.equal(later.team,'CHI');assert(later.entries.every(entry=>entry.name.includes('Next Week')));
});

test('historic first-depth names and matching injuries survive roster transfers and stale chart collection',()=>{
 const feed=fieldFixture(), week=feed.weeks[0].key;
 const id='gsis:fixture-out';
 const oldName=feed.depth.entries.find(entry=>entry.player_id===id).name;
 feed.players.find(player=>player.id===id).team='DEN';feed.players.find(player=>player.id===id).name='Different current name';
 const later=Date.parse('2026-09-21T12:00:00Z');
 const context=cardContext(feed,state,week,later), members=cardRoster(feed,context,week,later);
 const player=members.find(member=>member.id===id);
 assert.equal(player.name,oldName);assert(player.historical);assert(player.starter);assert.equal(player.injury.game_status,'Out');
 feed.depth.entries=[];
 assert(cardRoster(feed,context,week,later).every(member=>!member.starter));
});

test('weekly producer snapshots never borrow a future observation or carry a chart into an unobserved week',()=>{
 const metadata={source_id:'depth',retrieved_at:'2026-09-30T00:00:00Z'};
 const weeks=[{key:'w1',starts_at:'2026-09-01T00:00:00Z'},{key:'w2',starts_at:'2026-09-08T00:00:00Z'},{key:'w3',starts_at:'2026-09-15T00:00:00Z'}];
 const games=weeks.map((week,index)=>({week_key:week.key,home:'BUF',away:'CAR',kickoff:`2026-09-${String(6+index*7).padStart(2,'0')}T17:00:00Z`}));
 const csv=['dt,team,player_name,gsis_id,espn_id,pos_abb,pos_rank',
 '2026-09-04T12:00:00Z,BUF,Earlier Starter,old,,QB,1',
 '2026-09-07T12:00:00Z,BUF,After Kickoff,future,,QB,1',
 '2026-09-11T12:00:00Z,BUF,Second Starter,new,,QB,1',
 '2026-09-11T12:00:00Z,BUF,Backup,backup,,QB,2'].join('\n');
 const depth=normalizeDepthCsv(csv,metadata,games,weeks);
 assert.deepEqual(depth.entries.filter(entry=>entry.week_key==='w1').map(entry=>entry.name),['Earlier Starter']);
 assert.deepEqual(depth.entries.filter(entry=>entry.week_key==='w2').map(entry=>entry.name),['Second Starter']);
 assert.equal(depth.entries.filter(entry=>entry.week_key==='w3').length,0);
 const feed=fieldFixture(); feed.depth.entries.push({...feed.depth.entries[0],week_key:'not-a-week'});
 assert.throws(()=>validateFeed(feed,now),/unknown week/);
});

test('settlement retains the last complete window and stars without selected-week or future leakage',()=>{
 const {data,feed}=defenseFixture();
 const prior=defenseRankings(data,feed,'2026-REG-2',now);
 feed.weeks.push({key:'2026-REG-3',season:2026,week:3,starts_at:'2026-09-15T04:00:00Z'});
 feed.games.push({id:'third',week_key:'2026-REG-3',home:'BUF',away:'CAR',kickoff:'2026-09-20T17:00:00Z'});
 feed.games.find(game=>game.week_key==='2026-REG-2').kickoff='2026-09-13T01:00:00Z';
 const result=defenseRankings(data,feed,'2026-REG-3',now);
 assert(result.available);assert(result.fallback);assert.equal(result.throughWeek,1);
 assert.deepEqual(result.teams,prior.teams);assert.deepEqual(result.leaders,prior.leaders);
 assert.equal(defenseRankings(null,feed,'2026-REG-3',now).available,false);
});

test('stored cards deduplicate teams and accept only the two local switch values',()=>{
 assert.deepEqual(restoreCards([{team:'BUF',side:'wrong',unit:'wrong'},{team:'BUF'},{team:'not-a-team'}]),[{team:'BUF',side:'own',unit:'defense',focusId:''}]);
});

test('special-teams first depth never becomes an offensive starting role',()=>{
 const feed=fieldFixture(),week=feed.weeks[0].key,id=selectedIds(2)[1];
 feed.depth.entries.push({player_id:id,team:'BUF',position:'KR',rank:1,name:'Browser Fixture Two',observed_at:NOW,week_key:week});
 const result=cardContext(feed,{team:'BUF',side:'own',unit:'offense'},week,now);
 const member=cardRoster(feed,result,week,now).find(player=>player.id===id);
 assert.equal(member.starter,false);assert.deepEqual(member.depth,[]);
});

test('exact report coverage cannot borrow a fresh report for another game, week or team',()=>{
 for(const key of ['game_id','week_key','team']){
  const feed=fieldFixture(),week=feed.weeks[0].key;
  feed.reports=feed.reports.map(report=>report.team==='CAR'?{...report,[key]:'different'}:report);
  const context=cardContext(feed,state,week,now);
  assert.equal(context.state,'missing-report');assert.equal(context.report,undefined);assert.deepEqual(context.entries,[]);
  assert(cardRoster(feed,context,week,now).every(member=>member.injury===null));
 }
});

test('week rollover never carries earlier Out status, and a bye does not manufacture an opponent',()=>{
 const feed=fieldFixture(),week=feed.weeks[1];feed.reports=feed.reports.filter(report=>report.week_key!==week.key);
 const context=cardContext(feed,state,week.key,Date.parse(week.starts_at)+1000);
 assert.equal(context.state,'missing-report');assert.equal(context.team,'CHI');assert.equal(context.entries.length,0);
 feed.games=feed.games.filter(game=>game.week_key!==week.key);week.byes=['BUF'];
 assert.equal(cardContext(feed,state,week.key,now).state,'bye');
 assert.equal(cardContext(feed,state,week.key,now).team,undefined);
 assert.equal(cardContext(feed,{...state,side:'own'},week.key,now).team,'BUF');
});

test('stale and unknown original report dates remain separate from file updates and collection',()=>{
 const feed=fieldFixture(),week=feed.weeks[0].key;
 const report=feed.reports.find(report=>report.team==='CAR');
 const fresh=cardContext(feed,state,week,now);assert.equal(fresh.vintagePrecision,'unknown');assert.equal(fresh.stale,false);
 report.reported_at='2026-09-01T00:00:00Z';const old=cardContext(feed,state,week,now);
 assert(old.stale);assert.equal(old.retrievalStale,false);assert.equal(old.vintagePrecision,'time');
 report.reported_at=null;report.source_updated_at='2026-09-01T00:00:00Z';
 assert(cardContext(feed,state,week,now).sourceFileStale);
});

test('optional focus uses observed chart roles as well as coarse roster positions',()=>{
 const feed=fieldFixture(),week=feed.weeks[0].key,id='gsis:fixture-out';
 feed.players.find(player=>player.id===id).position='LB';
 for(const entry of feed.depth.entries.filter(entry=>entry.player_id===id))entry.position='LDE';
 const result=cardContext(feed,state,week,now),member=cardRoster(feed,result,week,now).find(player=>player.id===id);
 assert(member.relevant);assert.match(member.relevance,/Pass rush/);assert(member.starter);
});
