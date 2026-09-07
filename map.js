/* global L, TreeData, TreeStats */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), number=n=>n.toLocaleString('en-US'), status=$('status');
  if(!window.L||!L.markerClusterGroup||!window.TreeData||!window.TreeStats){status.textContent='The map library could not load. Please reload.';return;}
  const map=L.map('map',{zoomControl:false,maxZoom:20}).setView([30.61,-81.45],12);
  L.control.zoom({position:'bottomright'}).addTo(map);
  const street=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxNativeZoom:19,maxZoom:20}).addTo(map);
  const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',maxNativeZoom:19,maxZoom:20});
  L.control.layers({'Street map':street,'Satellite':satellite},{},{position:'topright'}).addTo(map);
  const sources=TreeData.sources,groups={},failures=[],records=[];
  let shown=[],boundary,forest,timer,overlap;
  const text=v=>v==null||v===''?'Not recorded':String(v);
  const el=(tag,value,className)=>{const n=document.createElement(tag);if(value!=null)n.textContent=value;if(className)n.className=className;return n;};
  const safeURL=url=>{try{const p=new URL(url,location.href);return p.protocol==='https:'||p.origin===location.origin?p.href:null;}catch{return null;}};
  async function json(path){const r=await fetch(path);if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);return r.json();}
  function photoGallery(photos){
    const gallery=el('section',null,'photo-gallery'),image=el('img'),credit=el('small'),link=el('a','Open source image ↗'),nav=el('div',null,'photo-nav');
    const prev=el('button','←'),next=el('button','→'),count=el('span');let index=0;
    prev.type=next.type='button';prev.setAttribute('aria-label','Previous photo');next.setAttribute('aria-label','Next photo');
    link.target='_blank';link.rel='noopener';image.loading='lazy';image.decoding='async';
    nav.append(prev,count,next);gallery.append(image,nav,credit,link);
    function update(){const p=photos[index];image.alt=`Attached image ${index+1} of ${photos.length}`;image.hidden=false;image.src=safeURL(p.url)||'';link.href=safeURL(p.url)||'#';credit.textContent=p.attribution||p.credit||'Public GIS attachment; no reuse license specified.';count.textContent=`${index+1} / ${photos.length}`;prev.disabled=index===0;next.disabled=index===photos.length-1;}
    image.onerror=()=>{image.hidden=true;credit.textContent='Image unavailable here. Try the source image link.';};
    prev.onclick=()=>{index--;update();};next.onclick=()=>{index++;update();};update();return gallery;
  }
  function popup(r){
    const root=el('div'),source=sources.find(s=>s.id===r.source);root.append(el('div',source.label,'source-label'),el('h2',r.name||r.species));
    if(r.name)root.append(el('div',r.species,'species-subtitle'));
    if(r.scientific)root.append(el('div',r.scientific,'scientific'));if(r.location)root.append(el('div',r.location));
    const dl=el('dl');r.rows.forEach(([k,v])=>dl.append(el('dt',k),el('dd',text(v))));root.append(dl,el('small',r.note));
    if(r.details?.length){const extra=el('details',null,'record-details');extra.append(el('summary','More recorded details'));const list=el('dl');r.details.forEach(([k,v])=>list.append(el('dt',k),el('dd',text(v))));extra.append(list);root.append(extra);}
    if(r.links?.length){const links=el('div',null,'record-links');for(const link of r.links){const url=safeURL(link.url);if(!url)continue;const a=el('a',link.label);a.href=url;a.target='_blank';a.rel='noopener';links.append(a);}root.append(links);}
    const nearby=overlap?.sources?.[r.source]?.candidates?.[r.id];
    if(nearby?.length){const section=el('details',null,'record-details');section.append(el('summary','Nearby city inventory records'),el('p','Within 5 m; possible overlap, not a verified match. Records remain separate.'));
      for(const candidate of nearby){const button=el('button',`Tree ${candidate.tree_number} · ${candidate.distance_m} m`);button.type='button';button.onclick=()=>{const other=records.find(x=>x.source==='city'&&x.id===candidate.city_object_id);if(!other)return;map.setView([other.lat,other.lng],19);L.popup({maxWidth:310,maxHeight:440}).setLatLng([other.lat,other.lng]).setContent(popup(other)).openOn(map);};section.append(button);}root.append(section);}
    if(r.url&&safeURL(r.url)){const a=el('a','View original observation ↗');a.href=safeURL(r.url);a.target='_blank';a.rel='noopener';root.append(el('br'),a);}
    if(r.photos.length)root.append(photoGallery(r.photos));return root;
  }
  for(const source of sources){
    const label=el('label',null,'source-option'),input=el('input'),dot=el('span',null,'source-dot'),count=el('small','Loading…');
    input.type='checkbox';input.id=`source-${source.id}`;input.checked=source.checked;input.defaultChecked=source.checked;input.disabled=true;
    dot.style.background=source.color;count.id=`count-${source.id}`;label.append(input,dot,el('span',source.label),count);$('sources').append(label);input.addEventListener('change',filter);
    groups[source.id]=L.markerClusterGroup({maxClusterRadius:48,showCoverageOnHover:false,removeOutsideVisibleBounds:true,spiderfyOnMaxZoom:true,
      iconCreateFunction(cluster){const n=cluster.getChildCount(),size=n>=1000?58:n>=100?49:39;const span=el('span',number(n));span.style.background=source.color;return L.divIcon({html:span,className:'tree-cluster',iconSize:[size,size]});}}).addTo(map);
  }
  function renderStatistics(){
    if(!$('statistics').open)return;
    const inView=$('statistics-scope').value==='view',bounds=map.getBounds();
    const viewRecords=shown.filter(r=>bounds.contains([r.lat,r.lng]));
    const result=TreeStats.summarize(inView?viewRecords:shown),root=$('statistics-results');root.replaceChildren();
    root.append(el('h3',`${number(result.count)} records`),el('small',inView?'Within the current map bounds':'Across all filtered records'));
    if(failures.length)root.append(el('p',`Some data are unavailable: ${failures.join(', ')}. Results may be incomplete.`));
    function table(rows,headers){const t=el('table'),head=el('thead'),hr=el('tr'),body=el('tbody');headers.forEach(v=>{const th=el('th',v);th.scope='col';hr.append(th);});head.append(hr);rows.forEach(row=>{const tr=el('tr');row.forEach(v=>tr.append(el('td',v)));body.append(tr);});t.append(head,body);return t;}
    const label=id=>sources.find(s=>s.id===id)?.label||id;
    const area=TreeStats.density(viewRecords,{south:bounds.getSouth(),north:bounds.getNorth(),west:bounds.getWest(),east:bounds.getEast()});
    const rate=n=>n==null?'Unavailable':n===0?'0':n<.0001?'<0.0001':n.toLocaleString('en-US',{maximumFractionDigits:4});
    root.append(el('h3','Record density · current map view'));
    if(area.acres){
      root.append(el('p',`${number(viewRecords.length)} filtered records / ${area.acres.toLocaleString('en-US',{maximumFractionDigits:2})} acres = ${rate(area.perAcre)} records per acre.`));
      const densities=TreeStats.summarize(viewRecords).sources;
      if(densities.length)root.append(table(densities.map(s=>[label(s.source),rate(s.count/area.acres)]),['Source','Records / acre']));
    }else root.append(el('p','Zoom to a map area to calculate density.'));
    root.append(el('small','Density always uses the current rectangular map view, including water and areas without inventory coverage. It follows tree filters, excludes habitat polygons, and is not an estimate of actual tree density. Zero means no matching records, not no trees. Pan or zoom to change the area.'));
    if(!result.count){root.append(el('p','No matching records for the statistics scope. Change the filters or map view.'));return;}
    root.append(el('h3','By source'),table(result.sources.map(s=>[label(s.source),number(s.count)]),['Source','Records']));
    root.append(el('h3','Species / plant labels'),el('small','Labels as recorded; spelling variants are kept separate.'));
    const chart=el('div',null,'species-chart');
    for(const item of result.species.slice(0,8)){const row=el('div',null,'species-bar'),caption=el('div',`${item.label} · ${number(item.count)} (${item.percentage.toFixed(1)}%)`),track=el('div',null,'bar-track'),bar=el('span');bar.style.width=`${item.percentage}%`;track.setAttribute('aria-hidden','true');track.append(bar);row.append(caption,track);chart.append(row);}root.append(chart);
    const species=el('details');species.append(el('summary',`All ${result.species.length} species / plant labels`),table(result.species.map(s=>[s.label,number(s.count),`${s.percentage.toFixed(1)}%`]),['Label','Records','Share']));root.append(species);
    root.append(el('h3','Recorded condition'),table(result.conditions.map(c=>[c.label,number(c.count),`${c.percentage.toFixed(1)}%`]),['Condition','Records','Share']));

    const decimal=n=>n.toLocaleString('en-US',{maximumFractionDigits:2});
    for(const [key,title,exclusions] of [['diameter','Recorded trunk diameter','excluded'],['circumference','Recorded trunk circumference','circumferenceExcluded'],['estimatedCircumference','Estimated circumference from diameter','excluded']]){
    root.append(el('h3',title));
    if(key==='estimatedCircumference')root.append(el('small','Calculated as π × diameter, assuming a circular trunk. These are estimates, kept separate from recorded circumference.'));
    if(key==='circumference')root.append(el('small','Source circumference values; the source does not establish whether they were measured directly or calculated.'));
    for(const group of result.sources){const section=el('details',null,'diameter-stats'),d=group[key];section.append(el('summary',`${label(group.source)} · ${d?.n||0} usable / ${number(group.count)}`));
      if(d){const modes=d.modes.length?d.modes.map(decimal).join(', '):'None (no repeated value)';section.append(table([['Mean',decimal(d.mean)+' in'],['Median',decimal(d.median)+' in'],['Mode',modes+(d.modes.length?' in':'')],['Standard deviation',decimal(d.standardDeviation)+' in'],['Variance',decimal(d.variance)+' in²']],['Statistic','Value']));}
      else section.append(el('p','No usable values for this statistic in this selection.'));
      const excluded=Object.entries(group[exclusions]);section.append(el('small',excluded.length?'Excluded — '+excluded.map(([reason,n])=>`${reason}: ${number(n)}`).join('; '):'No records excluded.'));root.append(section);
    }
  }
  }
  $('statistics').addEventListener('toggle',renderStatistics);$('statistics-scope').addEventListener('change',renderStatistics);
  function visibleCount(){const b=map.getBounds();$('visible').textContent=`${number(shown.filter(r=>b.contains(r.marker.getLatLng())).length)} records in this view`;renderStatistics();}
  function filter(){
    const f={sources:new Set(sources.filter(s=>$(`source-${s.id}`).checked).map(s=>s.id)),query:$('search').value.trim().toLowerCase(),species:$('species').value,condition:$('condition').value,historical:$('historical').checked,photos:$('photos').checked};
    shown=records.filter(r=>TreeData.matches(r,f));map.closePopup();
    for(const source of sources){groups[source.id].clearLayers();groups[source.id].addLayers(shown.filter(r=>r.source===source.id).map(r=>r.marker));}
    $('total').textContent=number(shown.length);$('extent').disabled=!shown.length;
    status.textContent=failures.length?`Unavailable: ${failures.join(', ')}. Other layers remain usable.`:shown.length?'':'No records match these filters. Select a layer or reset filters.';visibleCount();
  }
  function fit(){if(shown.length)map.fitBounds(L.latLngBounds(shown.map(r=>r.marker.getLatLng())),{padding:[45,65],maxZoom:18});}
  function toggleForest(){if(!forest)return;if($('forest').checked)forest.addTo(map);else map.removeLayer(forest);}
  function toggleBoundary(){if(!boundary)return;if($('boundary').checked)boundary.addTo(map);else map.removeLayer(boundary);}
  $('filters').addEventListener('submit',e=>e.preventDefault());$('search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(filter,180);});
  ['species','condition','historical','photos'].forEach(id=>$(id).addEventListener('change',filter));$('boundary').addEventListener('change',toggleBoundary);$('forest').addEventListener('change',toggleForest);
  $('fort-clinch').onclick=()=>{if(!forest)return;$('forest').checked=true;toggleForest();map.fitBounds(forest.getBounds(),{padding:[35,55]});};
  $('filters').addEventListener('reset',()=>{clearTimeout(timer);setTimeout(()=>{filter();toggleBoundary();toggleForest();},0);});$('extent').onclick=fit;$('south').onclick=()=>map.fitBounds([[30.53,-81.485],[30.585,-81.425]]);
  map.on('moveend',visibleCount);new ResizeObserver(()=>map.invalidateSize()).observe($('map'));
  async function load(){
    const attachments={city:{},planting:{},'city-plantings':{}};
    const photoResults=await Promise.allSettled([json('data/fernandina-attachments.json'),json('data/south-island/aipca-planting-locations/attachments.json'),json('data/city-supplements/city-plantings.attachments.json'),json('data/city-supplements/overlap-audit.json')]);
    if(photoResults[0].status==='fulfilled')for(const g of photoResults[0].value.attachmentGroups||[])attachments.city[g.parentObjectId]=(g.attachmentInfos||[]).filter(a=>(a.contentType||'').startsWith('image/'));
    if(photoResults[1].status==='fulfilled')for(const a of photoResults[1].value)if((a.contentType||'').startsWith('image/'))(attachments.planting[a.parent_object_id]??=[]).push(a);
    if(photoResults[2].status==='fulfilled')for(const a of photoResults[2].value)if((a.contentType||'').startsWith('image/'))(attachments['city-plantings'][a.parent_object_id]??=[]).push(a);
    if(photoResults[3].status==='fulfilled')overlap=photoResults[3].value;
    photoResults.forEach((r,i)=>{if(r.status==='rejected')failures.push(['city photo index','AIPCA photo index','city planting photo index','overlap index'][i]);});
    const results=await Promise.allSettled(sources.map(s=>json(s.path)));
    results.forEach((result,i)=>{
      const source=sources[i],count=$(`count-${source.id}`);if(result.status==='rejected'||!Array.isArray(result.value?.features)){failures.push(source.label);count.textContent='Unavailable';return;}
      let mapped=0,skipped=0;
      for(const feature of result.value.features){const r=TreeData.adapt(feature,source.id);if(!r){skipped++;continue;}r.photos=[...r.photos,...(attachments[source.id]?.[r.id]||[])];
        const iconNode=el('span',null,'point-core');iconNode.style.background=r.historical?'#aa754b':source.color;
        r.marker=L.marker([r.lat,r.lng],{icon:L.divIcon({html:iconNode,className:'source-point',iconSize:[15,15],iconAnchor:[7.5,7.5]}),title:`${r.name||r.species} · ${source.label}`,alt:r.name||r.species});r.marker.bindPopup(()=>popup(r),{maxWidth:310,maxHeight:440});records.push(r);mapped++;
      }
      count.textContent=number(mapped);if(skipped)count.title=`${skipped} records have no valid public point location`;$(`source-${source.id}`).disabled=mapped===0;
    });
    for(const [id,values] of [['species',records.map(r=>r.species)],['condition',records.map(r=>r.condition)]]){[...new Set(values)].sort().forEach(value=>$(id).add(new Option(value,value)));$(id).disabled=false;}
    $('reset').disabled=false;filter();fit();
  }
  load().catch(e=>{status.textContent='Unable to prepare the map. Reload to try again.';console.error(e);});
  json('data/fort-clinch/maritime-hammock.geojson').then(data=>{
    if(!data.features?.length)throw new Error('No forest polygons');
    map.createPane('forestPane');map.getPane('forestPane').style.zIndex=350;
    forest=L.geoJSON(data,{pane:'forestPane',style:{color:'#397652',weight:1.2,fillColor:'#65a66b',fillOpacity:.24},
      attribution:'Habitat: <a href="https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/PARKS_BOUNDARIES/MapServer/5">Florida DEP / DRP</a>',
      onEachFeature:(feature,layer)=>{
        const p=feature.properties,root=el('div');root.append(el('div','FORT CLINCH STATE PARK','source-label'),el('h2','Maritime forest'),el('p','Maritime hammock · coastal evergreen hardwood forest'));
        const dl=el('dl');[['Habitat area ID',p.OBJECTID],['Recorded acres',p.ACREAGE],['Community code',p.EC_CODE]].forEach(([k,v])=>dl.append(el('dt',k),el('dd',text(v))));root.append(dl,el('p','Mapped habitat extent, not individual tree locations or measured canopy cover.'),el('small','Florida DEP / Division of Recreation and Parks. Downloaded September 2026; survey date not specified.'));
        const a=el('a','View DEP habitat source ↗');a.href='https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/PARKS_BOUNDARIES/MapServer/5';a.target='_blank';a.rel='noopener';root.append(el('br'),a);layer.bindPopup(root,{maxWidth:310});
      }});
    const acres=data.features.reduce((sum,f)=>sum+(Number(f.properties.ACREAGE)||0),0);
    $('forest-note').textContent=`Fort Clinch maritime forest · ${number(Math.round(acres))} acres`;
    $('forest').disabled=false;$('fort-clinch').disabled=false;toggleForest();
  }).catch(()=>{$('forest-note').textContent='Fort Clinch forest unavailable';});
  json('data/south-island/aipca-boundary/features.geojson').then(data=>{boundary=L.geoJSON(data,{style:{color:'#927342',weight:2,dashArray:'6 5',fillOpacity:.025},onEachFeature:(_,layer)=>layer.bindPopup('Amelia Island Plantation Community Association boundary — public AIPCA GIS layer.')});$('boundary').disabled=false;toggleBoundary();}).catch(()=>{$('boundary-note').textContent='Boundary unavailable';});
  json('data/south-island/rcoast/graphics.json').then(graphics=>{graphics.forEach((g,i)=>{const url=safeURL(g.url);if(!url)return;const a=el('a',`Report graphic ${i+1} ↗`);a.href=url;a.target='_blank';a.rel='noopener';$('report-graphics').append(a);});}).catch(()=>{$('report-graphics').textContent='Report graphics unavailable. Use the report link above.';});
})();
