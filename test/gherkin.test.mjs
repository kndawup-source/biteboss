import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const feature=read('features/core.feature');
const app=read('app.js');

test('Gherkin release feature contains all critical acceptance scenarios',()=>{
  for(const name of ['Guest browses nearby stores','Member challenges a store','Crew invitation by QR','Native build uses the canonical web bundle','Admin pages are excluded from search indexing','Live takeover countdown holds outside the store','Retake and hot stores surface the next action','Store conquest history is visible','Seasonal territory ranking preserves lifetime records']){
    assert.match(feature,new RegExp(`Scenario: ${name.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}`));
  }
});

test('Gherkin challenge and crew contracts remain wired to production RPCs',()=>{
  assert.match(app,/biteboss_store_game_board_v631/);
  assert.match(app,/biteboss_join_crew_by_qr_v624/);
  assert.match(app,/biteboss_create_crew_qr_invite_v624/);
  assert.match(app,/biteboss_takeover_session_ping_v7514/);
  assert.match(app,/biteboss_store_history_v71/);
  assert.match(app,/biteboss_period_rank_v8160/);
});
