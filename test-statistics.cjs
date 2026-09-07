const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Stats=require('./statistics.js');
const {sources,adapt}=require('./map-data.js');

test('population statistics handle ties, empty selections, and single records',()=>{
  const d=Stats.describe([2,4,4,4,5,5,7,9]);
  assert.equal(d.mean,5);assert.equal(d.median,4.5);
  assert.deepEqual(d.modes,[4]);assert.equal(d.variance,4);assert.equal(d.standardDeviation,2);
  assert.deepEqual(Stats.describe([1,1,3,3]).modes,[1,3]);
  assert.deepEqual(Stats.describe([1,2,3]).modes,[]);
  assert.equal(Stats.describe([5]).variance,0);assert.equal(Stats.describe([]),null);
});

test('diameters require explicit, unambiguous units',()=>{
  const record=value=>({source:'city-plantings',p:{dbh:value}});
  for(const value of ['2.5"','2.5 inches','2.5 inch','2.5 in.','2.5″'])assert.equal(Stats.diameter(record(value)).value,2.5);
  for(const value of [2.5,'2.5','50""',"105'",'12 ft','3-1" multi','>1"','0"','-2 inches',null,'','2 inches at planting'])assert.equal(Stats.diameter(record(value)).value,undefined,String(value));
  assert.equal(Stats.diameter({source:'omni',p:{dbh:'2"'}}).reason,'Not collected');
});

test('source groups do not mix incompatible inventories and exclusions reconcile',()=>{
  const all=sources.flatMap(s=>JSON.parse(fs.readFileSync(s.path)).features.map(f=>adapt(f,s.id)).filter(Boolean));
  const selected=all.filter(r=>sources.find(s=>s.id===r.source).checked);
  const d=Stats.summarize(selected);
  assert.equal(d.count,15013);
  assert.equal(d.species.reduce((n,s)=>n+s.count,0),d.count);
  assert.equal(d.conditions.reduce((n,s)=>n+s.count,0),d.count);
  assert.equal(d.sources.find(s=>s.source==='city').diameter,null);
  assert(d.sources.find(s=>s.source==='city-plantings').diameter.n>0);
  for(const s of d.sources)assert.equal((s.diameter?.n||0)+Object.values(s.excluded).reduce((n,v)=>n+v,0),s.count);
  const one=Stats.summarize(selected.filter(r=>r.source==='omni'));
  assert.equal(one.count,97);assert.equal(one.sources.length,1);assert.equal(one.sources[0].diameter,null);
  assert.deepEqual(Stats.summarize([]),{count:0,species:[],conditions:[],sources:[]});
  console.log(d.sources.map(s=>`${s.source}: ${s.diameter?.n||0}/${s.count} usable diameters`).join('; '));
});

test('recorded circumference stays separate from diameter-derived estimates',()=>{
  const r={source:'heritage',p:{dia_:'10"',cir_:'32 inches'}};
  const s=Stats.summarize([r]).sources[0];
  assert.equal(s.circumference.mean,32);
  assert.equal(s.estimatedCircumference.mean,Math.PI*10);
  assert.equal(Stats.circumference({source:'heritage',p:{cir_:'113""'}}).value,undefined);
  assert.equal(Stats.circumference({source:'city',p:{cir_:'32"'}}).reason,'Not collected');
  const d=Stats.describe([2,4,6]),c=Stats.describe([2,4,6].map(v=>v*Math.PI));
  assert(Math.abs(c.variance-d.variance*Math.PI**2)<1e-10);
});

test('view density uses a fixed spherical area, supports empty data and longitude wrap',()=>{
  const bounds={south:0,north:1,west:0,east:1};
  const acres=Stats.viewAcres(bounds);
  assert(Math.abs(acres*4046.8564224-12363718145.18)<1);
  assert.equal(Stats.density([],bounds).perAcre,0);
  assert.equal(Stats.density([{},{}],bounds).perAcre,2/acres);
  assert.equal(Stats.density([{}],bounds).acres,acres,'Filtering changes numerator, not area');
  assert.equal(Stats.viewAcres({...bounds,east:0}),null);
  assert.equal(Stats.viewAcres({...bounds,north:0}),null);
  assert.equal(Stats.viewAcres({...bounds,north:NaN}),null);
  assert.equal(Stats.viewAcres({...bounds,west:179,east:-180}),acres);
  assert(Stats.viewAcres({...bounds,south:60,north:61})<acres);
});
