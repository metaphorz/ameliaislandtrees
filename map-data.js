/* Pure adapters shared by the map and data validation. */
(function(root){
  'use strict';
  const sources=[
    {id:'city',label:'Fernandina inventory',color:'#315b40',path:'data/fernandina-trees.geojson',checked:true},
    {id:'heritage',label:'Designated heritage trees',color:'#825126',path:'data/city-supplements/heritage.geojson',checked:true},
    {id:'city-plantings',label:'City-planted trees',color:'#478b78',path:'data/city-supplements/city-plantings.geojson',checked:true},
    {id:'nominations',label:'Heritage nomination assessments',color:'#936079',path:'data/city-supplements/nominations.geojson',checked:false},
    {id:'omni',label:'Omni woody-plant observations',color:'#3c77a0',path:'data/south-island/omni-inaturalist/observations.geojson',checked:true},
    {id:'planting',label:'AIPCA planting locations',color:'#9b7131',path:'data/south-island/aipca-planting-locations/features.geojson',checked:true},
    {id:'county',label:'County inventory · includes mainland',color:'#7d5798',path:'data/county-trees.geojson',checked:false},
    {id:'invasive',label:'AIPCA invasive-plant reports',color:'#ac4f68',path:'data/south-island/aipca-invasive-plant-reports/features.geojson',checked:true}
  ];
  const date=v=>v==null?'Not recorded':typeof v==='number'?new Date(v).toISOString().slice(0,10):v;
  const clean=v=>typeof v==='string'?v.trim():v;
  const present=v=>v!=null&&clean(v)!==''&&!/^(?:none|null|n\/a|unknown|[,\s])+$/i.test(String(v));
  const normalize=v=>String(v??'').toLowerCase().replace(/[’‘']/g,'');
  function recordedName(value){
    const s=clean(value)||'';
    const parenthetical=s.match(/\(([^()]{1,80}\b(?:tree|oak))\)/i);
    if(parenthetical)return parenthetical[1];
    return /^[^,;]{1,70}['’]s\s+(?:tree|oak)$/i.test(s)?s:null;
  }
  function addMedia(r,url,label){
    if(typeof url!=='string'||!/^https?:\/\//i.test(url.trim()))return;
    url=url.trim();
    if(/\.(?:jpg|jpeg|png|webp|gif)(?:[?#]|$)/i.test(url))r.photos.push({url,credit:label+' · City of Fernandina Beach GIS'});
    else r.links.push({url,label});
  }
  const base='https://maps.ncpafl.com/ncflpa_arcgis/rest/services/Hosted/';
  const services={city:'COFBTreeInventy2023Updates/FeatureServer/0',county:'CountyTreeInventory/FeatureServer/1',heritage:'HeritageTrees/FeatureServer/0','city-plantings':'PlantedTrees/FeatureServer/0',nominations:'HeritageTreeNominationEvaluation/FeatureServer/0'};
  function finish(r){
    const p=r.p;
    r.rows.push(['Latitude',r.lat.toFixed(6)],['Longitude',r.lng.toFixed(6)]);
    r.name=recordedName(p.location)||recordedName(p.location_of_tree)||clean(p.tree_name)||null;
    // Keep all meaningful source fields available without exposing editor-tracking internals.
    const excluded=/^(?:objectid|globalid|oid_|origional_id|id|f_|created_.*|last_edited_.*|creationdate|creator|editdate|editor|lat|long|latitude|longitude|photos|observer|uri|jabigosgmailcom)$/i;
    r.details=Object.entries(p).filter(([k,v])=>!excluded.test(k)&&present(v)&&typeof v!=='object'&&!/^https?:\/\//i.test(String(v))).map(([k,v])=>[k.replace(/_/g,' ').replace(/\s+/g,' ').trim(),v]);
    r.search=normalize([r.name,r.species,r.scientific,r.location,r.id,p.tree_no,p.treeid,p.common,...r.details.map(([,v])=>v)].filter(v=>v!=null).join(' '));
    if(services[r.source])r.links.push({label:'Original GIS record ↗',url:base+services[r.source]+'/query?objectIds='+encodeURIComponent(r.id)+'&outFields=*&f=pjson'});
    return r;
  }
  function adapt(feature,source){
    const p=feature.properties||{},g=feature.geometry;
    if(g?.type!=='Point'||g.coordinates.length<2)return null;
    const [lng,lat]=g.coordinates;
    if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>90)return null;
    const r={source,p,lat,lng,id:p.objectid??p.id??feature.id,photos:[],links:[],historical:false,condition:'Not recorded',species:'Unknown species',rows:[],note:''};
    if(source==='city'||source==='county'){
      r.species=clean(p.commonname||p.common)||'Unknown species';r.scientific=p.scientificname||p.sci_name;
      r.condition=p.condition2||p.condition||'Not recorded';r.historical=r.condition==='Dead'||p.treefound==='NO';
      r.location=source==='city'?[p.address,p.street].filter(Boolean).join(' '):p.location;
      r.rows=[['Tree number',p.tree_no??p.treeid],['Condition',r.condition],['Trunk diameter',p.dbh],['Height',p.height],['Spread',p.spread??p.crownwidth]];
      if(source==='city')r.rows.push(['Found on revisit',p.treefound]);
      for(const [label,key] of [['Name / location notes','location'],['Recorded notes','notes'],['Volunteer notes','volunteernotes'],['Site','site'],['Number of stems','stems'],['Recorded GPS date','gpsdate']])if(present(p[key]))r.rows.push([label,clean(p[key])]);
      r.note='Historical inventory. Measurements shown as recorded; units unverified. Not a current inspection.';
      if(source==='county')r.note+=' County coverage includes mainland locations.';
    }else if(source==='heritage'){
      r.species=clean(p.commonname)||'Unknown species';r.scientific=p.scientificname;r.location=p.location_of_tree;
      r.rows=[['Designation','Designated heritage tree'],['Resolution',p.id_resolution_number],['Property type',({PB:'Public',PV:'Private',TBD:'To be determined'})[p.private__pv__or_public__pb_]||p.private__pv__or_public__pb_],['Diameter (as recorded)',p.dia_],['Circumference (as recorded)',p.cir_]];
      addMedia(r,p.document_link,'Designation document ↗');addMedia(r,p.photolink,'Source photo document ↗');
      r.note='A separate designation record that may overlap the city inventory. A heritage designation is not a current condition assessment. Source documents and photo links are provided as recorded.';
    }else if(source==='city-plantings'){
      r.species=clean(p.commonname)||'Unknown species';r.scientific=p.spieces;r.location=p.fulladdress;
      r.rows=[['Planting date',date(p.dateofplanting)],['Height (as recorded)',p.height],['Trunk diameter (as recorded)',p.dbh],['Parcel',p.parcelnumber],['Property owner (as recorded)',p.propertyowner]];
      for(const [key,value] of Object.entries(p))if(/^picture\d{4}$/.test(key))addMedia(r,value,'Planting photo '+key.slice(-4));
      r.note='City planting record, not a current inspection. May represent a tree also recorded in another layer.';
    }else if(source==='nominations'){
      r.species=clean(p.common_name)||'Unknown species';r.scientific=p.scientific_name;r.location=p.address;r.condition=clean(p.condition)||'Not recorded';r.historical=normalize(p.status)==='dead'||normalize(p.condition)==='dead';
      r.rows=[['Assessment tree ID',p.tree_id],['Nomination recommendation',p.heritage_tree_nomination],['Recorded status',p.status],['Recorded condition',r.condition],['Significance / recommendation notes',p.heritage_tree_significance_note],['Observation comments',p.observation_comments],['DBH (as recorded)',p.dbh],['Height (as recorded)',p.tree_height__estimated_],['Crown spread (as recorded)',p.crown_spread]];
      r.note='Historical nomination assessment, not a confirmed heritage designation or current safety assessment. Inspection date numbers are retained as recorded; their encoding is unverified.';
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
    return finish(r);
  }
  function matches(r,f){return f.sources.has(r.source)&&(!f.species||r.species===f.species)&&(!f.condition||r.condition===f.condition)&&(f.historical||!r.historical)&&(!f.photos||r.photos.length>0)&&(!f.query||r.search.includes(normalize(f.query)));}
  const api={sources,adapt,matches,recordedName,normalize};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TreeData=api;
})(typeof window==='undefined'?globalThis:window);
