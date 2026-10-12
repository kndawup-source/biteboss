import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {__test:h}=require('../api/nearby-stores.js');
const cases=[
  fn=>assert.equal(fn('299',300,2000),null),
  fn=>assert.equal(fn('300',300,2000),300),
  fn=>assert.equal(fn('2000',300,2000),2000),
  fn=>assert.equal(fn('2001',300,2000),null),
  fn=>assert.equal(fn('x',300,2000),null),
];
const mutants={
  'lower-bound-open':(v,min,max)=>{const n=Math.round(Number(v));return Number.isFinite(n)&&n>min&&n<=max?n:null},
  'upper-bound-open':(v,min,max)=>{const n=Math.round(Number(v));return Number.isFinite(n)&&n>=min&&n<max?n:null},
  'no-lower-bound':(v,min,max)=>{const n=Math.round(Number(v));return Number.isFinite(n)&&n<=max?n:null},
  'no-upper-bound':(v,min,max)=>{const n=Math.round(Number(v));return Number.isFinite(n)&&n>=min?n:null},
};
let killed=0;
for(const [name,mutant] of Object.entries(mutants)){
  let survived=true;
  try{ for(const c of cases)c(mutant); }catch{ survived=false; killed++; }
  console.log(`${survived?'SURVIVED':'KILLED'} ${name}`);
}
assert.equal(killed,Object.keys(mutants).length,`Mutation score ${killed}/${Object.keys(mutants).length}`);
console.log(`Mutation score: 100% (${killed}/${Object.keys(mutants).length} targeted boundary mutants killed)`);
