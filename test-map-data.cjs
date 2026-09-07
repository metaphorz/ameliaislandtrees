// Run with: node --test test-map-data.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {sources,adapt,matches}=require('./map-data.js');
const datasets=Object.fromEntries(sources.map(s=>[s.id,JSON.parse(fs.readFileSync(s.path)).features]));
const records=Object.entries(datasets).flatMap(([source,features])=>features.map(f=>adapt(f,source)).filter(Boolean));
const filters={sources:new Set(sources.map(s=>s.id)),historical:true,photos:false,query:'',species:'',condition:''};

test('Kate’s Tree uses its recorded name and is searchable with either apostrophe',()=>{
  const kate=records.find(r=>r.source==='city'&&r.p.tree_no===459);
  assert.equal(kate.name,"Kate's Tree");
  assert.equal(kate.species,'Live Oak');
  for(const query of ["Kate's Tree",'Kate’s Tree','Kates Tree','715 ASH ST','459'])assert(matches(kate,{...filters,query}));
  assert(kate.rows.some(([k,v])=>k==='Name / location notes'&&v==="Kate's Tree"));
  assert(kate.details.some(([k,v])=>k==='notes'&&v==='Heritage Tree 2009 perhaps'));
  const street=records.find(r=>r.source==='city'&&r.p.tree_no===1308);
  assert.equal(street.name,null,'A reference to a nearby place is not an individual tree name');
});

test('all mapped records retain their public coordinates in popup rows',()=>{
  for(const r of records){
    assert.equal(r.rows.find(([k])=>k==='Latitude')[1],r.lat.toFixed(6));
    assert.equal(r.rows.find(([k])=>k==='Longitude')[1],r.lng.toFixed(6));
  }
  const obscured=adapt({geometry:{type:'Point',coordinates:[-81.45,30.6]},properties:{obscured:true}},'omni');
  assert.match(obscured.note,/approximate/);
  assert.equal(adapt({geometry:null,properties:{}},'omni'),null);
});

test('new layers retain source distinctions, names, documents, and media types',()=>{
  for(const [id,n] of [['heritage',84],['city-plantings',743],['nominations',24]])assert.equal(records.filter(r=>r.source===id).length,n);
  for(const r of records.filter(r=>r.source==='heritage')){
    assert.equal(r.condition,'Not recorded');
    assert(r.photos.every(p=>!p.url.toLowerCase().includes('.pdf')));
  }
  assert(records.some(r=>r.source==='heritage'&&r.links.some(l=>l.url.toLowerCase().includes('.pdf'))));
  assert(records.some(r=>r.source==='city-plantings'&&r.photos.length));
  const nomination=records.find(r=>r.source==='nominations'&&r.p.heritage_tree_nomination==='No');
  assert(nomination.rows.some(([k,v])=>k==='Nomination recommendation'&&v==='No'));
  assert.match(nomination.note,/not a confirmed heritage designation/);
});

test('unknown planting codes never imply planting and source filters remain independent',()=>{
  const unknown=records.find(r=>r.source==='planting'&&r.p.planted==='Choice 2');
  assert(unknown.rows.some(([k,v])=>k==='Planting status'&&v==='Planting status unknown'));
  assert.equal(records.filter(r=>matches(r,{...filters,sources:new Set(['omni']),condition:'Good'})).length,0);
  assert.equal(records.filter(r=>matches(r,{...filters,sources:new Set(['omni']),photos:true})).length,97);
  assert.equal(records.filter(r=>matches(r,{...filters,sources:new Set(sources.filter(s=>s.checked).map(s=>s.id))})).length,15013);
});

test('overlap candidates reference existing records without conflating namespaces',()=>{
  const audit=JSON.parse(fs.readFileSync('data/city-supplements/overlap-audit.json'));
  const cityIDs=new Set(records.filter(r=>r.source==='city').map(r=>r.id));
  for(const [source,data] of Object.entries(audit.sources)){
    const ids=new Set(records.filter(r=>r.source===source).map(r=>String(r.id)));
    for(const [id,candidates] of Object.entries(data.candidates)){
      assert(ids.has(id));
      for(const c of candidates){assert(cityIDs.has(c.city_object_id));assert(c.distance_m>=0&&c.distance_m<=5);}
    }
  }
  assert.match(audit.method,/no identity match/);
});
