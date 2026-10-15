import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {__test:h}=require('../api/nearby-stores.js');

test('numberInRange accepts valid coordinates and rejects invalid values',()=>{
  assert.equal(h.numberInRange('37.5',-90,90),37.5);
  assert.equal(h.numberInRange('91',-90,90),null);
  assert.equal(h.numberInRange('x',-90,90),null);
});

test('integerInRange enforces radius range',()=>{
  assert.equal(h.integerInRange('1000',300,2000),1000);
  assert.equal(h.integerInRange('299',300,2000),null);
  assert.equal(h.integerInRange('2001',300,2000),null);
});

test('cell key is stable on ~100m grid',()=>{
  assert.equal(h.makeCellKey(37.12349,127.12349,1000),'kakao:37.123:127.123:1000');
});

test('Kakao normalization drops invalid rows and maps cafe category',()=>{
  const rows=h.normalizePlaces([{id:'1',place_name:'Cafe',y:'37.5',x:'127.0',category_group_code:'CE7',address_name:'서울 강남구'}]);
  assert.equal(rows.length,1); assert.equal(rows[0].category,'cafe'); assert.equal(rows[0].provider,'kakao');
  assert.equal(h.normalizePlaces([{id:'',place_name:'bad',y:'x',x:'127'}]).length,0);
});


function loadBattleHelpers(){
  const source=require('node:fs').readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const start=source.indexOf('  function classifyBattleResult');
  const end=source.indexOf('\n  function renderPlayerProfile',start);
  assert.ok(start>=0 && end>start,'battle helper block should exist');
  const block=source.slice(start,end);
  return new Function(`${block}\nreturn {classifyBattleResult,battleRecordFromActivity,getPlayerBattleRecord};`)();
}

test('battle activity classifies challenger wins and losses and ignores defender rows',()=>{
  const {battleRecordFromActivity}=loadBattleHelpers();
  assert.deepEqual(battleRecordFromActivity([
    {as_challenger:true,result:'boss_win'},
    {as_challenger:1,result:'crew'},
    {as_challenger:'true',result:'boss_defense'},
    {as_challenger:false,result:'crew'},
    {as_challenger:true,result:'boss_visit'}
  ]),{total:3,wins:1,losses:2});
});

test('battle aggregate never hides a newer logged win or loss',()=>{
  const {getPlayerBattleRecord}=loadBattleHelpers();
  const recent=[
    {as_challenger:true,result:'boss_win'},
    {as_challenger:true,result:'crew'}
  ];
  assert.deepEqual(
    getPlayerBattleRecord({battle_record:{total:1,wins:1,losses:0}},recent),
    {total:2,wins:1,losses:1}
  );
});

test('battle record derives historical losses from total minus wins',()=>{
  const {getPlayerBattleRecord}=loadBattleHelpers();
  assert.deepEqual(
    getPlayerBattleRecord({battle_record:{total:7,wins:5,losses:0}},[]),
    {total:7,wins:5,losses:2}
  );
});
