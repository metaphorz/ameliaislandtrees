/* Pure adapters shared by the map and data validation. */
(function(root){
  'use strict';
  const sources=[
    {id:'city',label:'Fernandina inventory',color:'#315b40',path:'data/fernandina-trees.geojson',checked:true},
    {id:'omni',label:'Omni woody-plant observations',color:'#3c77a0',path:'data/south-island/omni-inaturalist/observations.geojson',checked:true},
    {id:'planting',label:'AIPCA planting locations',color:'#9b7131',path:'data/south-island/aipca-planting-locations/features.geojson',checked:true},
    {id:'county',label:'County inventory · includes mainland',color:'#7d5798',path:'data/county-trees.geojson',checked:false},
    {id:'invasive',label:'AIPCA invasive-plant reports',color:'#ac4f68',path:'data/south-island/aipca-invasive-plant-reports/features.geojson',checked:true}
  ];
  const date=v=>v==null?'Not recorded':typeof v==='number'?new Date(v).toISOString().slice(0,10):v;
  const clean=v=>typeof v==='string'?v.trim():v;
  function adapt(feature,source){
    const p=feature.properties||{},g=feature.geometry;
    if(g?.type!=='Point'||g.coordinates.length<2)return null;
    const [lng,lat]=g.coordinates;
    if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>90)return null;
    const r={source,p,lat,lng,id:p.objectid??p.id??feature.id,photos:[],historical:false,condition:'Not recorded',species:'Unknown species',rows:[],note:''};
    if(source==='city'||source==='county'){
      r.species=clean(p.commonname||p.common)||'Unknown species';r.scientific=p.scientificname||p.sci_name;
      r.condition=p.condition2||p.condition||'Not recorded';r.historical=r.condition==='Dead'||p.treefound==='NO';
      r.location=source==='city'?[p.address,p.street].filter(Boolean).join(' '):p.location;
      r.rows=[['Tree number',p.tree_no??p.treeid],['Condition',r.condition],['Trunk diameter',p.dbh],['Height',p.height],['Spread',p.spread??p.crownwidth]];
      if(source==='city')r.rows.push(['Found on revisit',p.treefound]);
      r.note='Historical inventory. Measurements shown as recorded; units unverified. Not a current inspection.';
      if(source==='county')r.note+=' County coverage includes mainland locations.';
    }else if(source==='omni'){
      r.species=p.common_name||p.scientific_name||'Unknown woody plant';r.scientific=p.scientific_name;r.photos=p.photos||[];r.url=p.uri;
      r.rows=[['Observed',date(p.observed_on)],['Quality grade',p.quality_grade],['Observer',p.observer],['Observation license',p.license_code||'Not specified'],['Location accuracy',p.positional_accuracy==null?'Not recorded':p.positional_accuracy+' m']];
      r.note='A tree or woody-plant observation, not a unique-tree inventory. Multiple observations may represent the same plant.';
      if(p.obscured||p.geoprivacy==='obscured')r.note+=' Location is obscured; this point is approximate.';
    }else if(source==='planting'){
      r.species=clean(p.what_kind_of_tree==='other'?p.wt_kind_of_tree_other:p.what_kind_of_tree)||clean(p.species)||'Unspecified planting';r.location=p.location;
      const planted=p.planted==='Yes'?'Reported planted':p.planted==='No'?'Reported not planted':'Planting status unknown';
      r.rows=[['Planting status',planted],['Source status value',p.planted],['Submitted',date(p._date)],['When planted',date(p.when_planted)],['Year planted',p.year_planted]];
      r.note='A planting-program location. Only explicit Yes values confirm reported planting. Other values, including Choice 2, do not confirm an existing tree.';
    }else{
      r.species=p.type_of_issue||'Invasive-plant report';r.rows=[['Reported',date(p.incident_date)],['Severity',p.severity],['Comments',p.comments]];r.note='An environmental report, not a tree inventory.';
    }
    r.search=[r.species,r.scientific,r.location,r.id,p.tree_no,p.treeid,p.common].filter(v=>v!=null).join(' ').toLowerCase();return r;
  }
  function matches(r,f){return f.sources.has(r.source)&&(!f.species||r.species===f.species)&&(!f.condition||r.condition===f.condition)&&(f.historical||!r.historical)&&(!f.photos||r.photos.length>0)&&(!f.query||r.search.includes(f.query));}
  const api={sources,adapt,matches};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TreeData=api;
})(typeof window==='undefined'?globalThis:window);
