/* Pure statistics for filtered inventory records. */
(function(root){
  'use strict';
  const diameterFields={city:'dbh',county:'dbh',heritage:'dia_','city-plantings':'dbh',nominations:'dbh'};
  function diameter(record){
    const field=diameterFields[record.source];
    if(!field)return {reason:'Not collected'};
    return inches(record.p[field]);
  }
  function circumference(record){
    return record.source==='heritage'?inches(record.p.cir_):{reason:'Not collected'};
  }
  function inches(raw){
    if(raw==null||String(raw).trim()==='')return {reason:'Missing'};
    const value=String(raw).trim();
    // Require an explicit inch unit and a single positive measurement. Do not
    // repair malformed quotes, interpret ranges, or infer units from neighbors.
    const match=value.match(/^(\d+(?:\.\d+)?)\s*(?:"|″|inches|inch|in\.?)$/i);
    if(match&&Number(match[1])>0)return {value:Number(match[1])};
    return {reason:/^\d+(?:\.\d+)?$/.test(value)?'Units unverified / zero':'Ambiguous or unsupported value'};
  }
  function describe(values){
    if(!values.length)return null;
    const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;
    const mean=sorted.reduce((sum,v)=>sum+v,0)/n;
    const variance=sorted.reduce((sum,v)=>sum+(v-mean)**2,0)/n;
    const counts=new Map();for(const v of sorted)counts.set(v,(counts.get(v)||0)+1);
    const frequency=Math.max(...counts.values());
    return {n,mean,median:n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2,
      modes:frequency>1?[...counts].filter(([,count])=>count===frequency).map(([v])=>v):[],
      modeFrequency:frequency,variance,standardDeviation:Math.sqrt(variance)};
  }
  function frequencies(records,key){
    const counts=new Map();for(const r of records){const label=r[key]||'Not recorded';counts.set(label,(counts.get(label)||0)+1);}
    return [...counts].map(([label,count])=>({label,count,percentage:count/records.length*100}))
      .sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
  }
  function summarize(records){
    const bySource=new Map();
    for(const r of records){
      if(!bySource.has(r.source))bySource.set(r.source,{source:r.source,count:0,values:[],circumferences:[],excluded:{},circumferenceExcluded:{}});
      const group=bySource.get(r.source);group.count++;
      const c=circumference(r);if(c.value!=null)group.circumferences.push(c.value);else group.circumferenceExcluded[c.reason]=(group.circumferenceExcluded[c.reason]||0)+1;
      const d=diameter(r);if(d.value!=null)group.values.push(d.value);else group.excluded[d.reason]=(group.excluded[d.reason]||0)+1;
    }
    return {count:records.length,species:frequencies(records,'species'),conditions:frequencies(records,'condition'),
      sources:[...bySource.values()].map(({values,circumferences,...group})=>({...group,diameter:describe(values),circumference:describe(circumferences),estimatedCircumference:describe(values.map(v=>Math.PI*v))}))};
  }
  // Spherical surface area of a latitude/longitude rectangle, including water.
  function viewAcres({south,north,west,east}){
    if(![south,north,west,east].every(Number.isFinite)||north<=south)return null;
    const radians=Math.PI/180,span=east-west;
    const width=Math.min(360,span<0?((span%360)+360)%360:span);
    const area=6371008.8**2*width*radians*(Math.sin(Math.min(90,north)*radians)-Math.sin(Math.max(-90,south)*radians))/4046.8564224;
    return area>0?area:null;
  }
  function density(records,bounds){
    const acres=viewAcres(bounds);return {acres,count:records.length,perAcre:acres?records.length/acres:null};
  }
  const api={diameter,circumference,describe,summarize,viewAcres,density};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TreeStats=api;
})(typeof window==='undefined'?globalThis:window);
