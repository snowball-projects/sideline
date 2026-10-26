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
