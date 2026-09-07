/* global L, TreeData */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), number=n=>n.toLocaleString('en-US'), status=$('status');
  if(!window.L||!L.markerClusterGroup||!window.TreeData){status.textContent='The map library could not load. Please reload.';return;}
  const map=L.map('map',{zoomControl:false,maxZoom:20}).setView([30.61,-81.45],12);
  L.control.zoom({position:'bottomright'}).addTo(map);
  const street=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxNativeZoom:19,maxZoom:20}).addTo(map);
  const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',maxNativeZoom:19,maxZoom:20});
  L.control.layers({'Street map':street,'Satellite':satellite},{},{position:'topright'}).addTo(map);
  const sources=TreeData.sources,groups={},failures=[],records=[];
  let shown=[],boundary,timer,overlap;
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
  function visibleCount(){const b=map.getBounds();$('visible').textContent=`${number(shown.filter(r=>b.contains(r.marker.getLatLng())).length)} records in this view`;}
  function filter(){
    const f={sources:new Set(sources.filter(s=>$(`source-${s.id}`).checked).map(s=>s.id)),query:$('search').value.trim().toLowerCase(),species:$('species').value,condition:$('condition').value,historical:$('historical').checked,photos:$('photos').checked};
    shown=records.filter(r=>TreeData.matches(r,f));map.closePopup();
    for(const source of sources){groups[source.id].clearLayers();groups[source.id].addLayers(shown.filter(r=>r.source===source.id).map(r=>r.marker));}
    $('total').textContent=number(shown.length);$('extent').disabled=!shown.length;
    status.textContent=failures.length?`Unavailable: ${failures.join(', ')}. Other layers remain usable.`:shown.length?'':'No records match these filters. Select a layer or reset filters.';visibleCount();
  }
  function fit(){if(shown.length)map.fitBounds(L.latLngBounds(shown.map(r=>r.marker.getLatLng())),{padding:[45,65],maxZoom:18});}
  function toggleBoundary(){if(!boundary)return;if($('boundary').checked)boundary.addTo(map);else map.removeLayer(boundary);}
  $('filters').addEventListener('submit',e=>e.preventDefault());$('search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(filter,180);});
  ['species','condition','historical','photos'].forEach(id=>$(id).addEventListener('change',filter));$('boundary').addEventListener('change',toggleBoundary);
  $('filters').addEventListener('reset',()=>{clearTimeout(timer);setTimeout(()=>{filter();toggleBoundary();},0);});$('extent').onclick=fit;$('south').onclick=()=>map.fitBounds([[30.53,-81.485],[30.585,-81.425]]);
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
  json('data/south-island/aipca-boundary/features.geojson').then(data=>{boundary=L.geoJSON(data,{style:{color:'#927342',weight:2,dashArray:'6 5',fillOpacity:.025},onEachFeature:(_,layer)=>layer.bindPopup('Amelia Island Plantation Community Association boundary — public AIPCA GIS layer.')});$('boundary').disabled=false;toggleBoundary();}).catch(()=>{$('boundary-note').textContent='Boundary unavailable';});
  json('data/south-island/rcoast/graphics.json').then(graphics=>{graphics.forEach((g,i)=>{const url=safeURL(g.url);if(!url)return;const a=el('a',`Report graphic ${i+1} ↗`);a.href=url;a.target='_blank';a.rel='noopener';$('report-graphics').append(a);});}).catch(()=>{$('report-graphics').textContent='Report graphics unavailable. Use the report link above.';});
})();
