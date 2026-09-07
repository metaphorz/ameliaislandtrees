/* global L */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const number = n => n.toLocaleString('en-US');
  const status = $('status');
  if (!window.L || !L.markerClusterGroup) {
    status.textContent = 'The map library could not load. Please reload the page.';
    return;
  }
  const map = L.map('map', {zoomControl: false, maxZoom: 20}).setView([30.648, -81.448], 13);
  L.control.zoom({position: 'bottomright'}).addTo(map);
  const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxNativeZoom: 19, maxZoom: 20
  }).addTo(map);
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community', maxNativeZoom: 19, maxZoom: 20
  });
  L.control.layers({'Street map': street, 'Satellite': satellite}, {}, {position:'topright'}).addTo(map);
  const clusters = L.markerClusterGroup({
    maxClusterRadius: 48, showCoverageOnHover: false, removeOutsideVisibleBounds: true,
    spiderfyOnMaxZoom: true,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      const size = count >= 1000 ? 58 : count >= 100 ? 49 : 39;
      return L.divIcon({html: `<span>${number(count)}</span>`, className: `tree-cluster${count >= 1000 ? ' large' : ''}`, iconSize:[size,size]});
    }
  }).addTo(map);
  let records = [], shown = [], timer;
  const text = value => value === null || value === undefined || value === '' ? 'Not recorded' : String(value);
  const species = p => p.commonname || p.common || 'Unknown species';
  const historical = p => p.condition2 === 'Dead' || p.treefound === 'NO';
  const icon = isHistorical => L.divIcon({className:`tree-point${isHistorical ? ' historical' : ''}`, iconSize:[13,13], iconAnchor:[6.5,6.5]});
  const icons = [icon(false), icon(true)];
  function popup(p) {
    const root = document.createElement('div');
    const add = (tag, content, className) => {const e=document.createElement(tag);e.textContent=content;if(className)e.className=className;root.append(e);return e;};
    add('h2', species(p));
    add('div', p.scientificname || p.sci_name || 'Scientific name not recorded', 'scientific');
    add('div', [p.address,p.street].filter(Boolean).join(' ') || 'Location not recorded');
    const dl=add('dl','');
    for (const [label,value] of [['Tree number',p.tree_no],['Condition',p.condition2],['Trunk diameter',p.dbh],['Height',p.height],['Spread',p.spread],['Found on revisit',p.treefound]]) {
      const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=text(value);dl.append(dt,dd);
    }
    add('small','Source measurements shown as recorded; units unverified. Historical inventory, not a current inspection.');
    return root;
  }
  function visibleCount() {
    const bounds=map.getBounds();
    $('visible').textContent=`${number(shown.filter(r=>bounds.contains(r.marker.getLatLng())).length)} records in this view`;
  }
  function filter() {
    const query=$('search').value.trim().toLowerCase(), chosen=$('species').value, condition=$('condition').value;
    shown=records.filter(r=>(!chosen || r.species===chosen) && (!condition || r.p.condition2===condition) && ($('historical').checked || !historical(r.p)) && (!query || r.search.includes(query)));
    map.closePopup();clusters.clearLayers();clusters.addLayers(shown.map(r=>r.marker));
    $('total').textContent=number(shown.length);
    $('extent').disabled=!shown.length;
    status.textContent=shown.length ? '' : 'No trees match these filters. Try another species or reset filters.';
    visibleCount();
  }
  function fit() {if(shown.length)map.fitBounds(L.latLngBounds(shown.map(r=>r.marker.getLatLng())),{padding:[45,65],maxZoom:18});}
  $('filters').addEventListener('submit',e=>e.preventDefault());
  $('search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(filter,180);});
  ['species','condition','historical'].forEach(id=>$(id).addEventListener('change',filter));
  $('filters').addEventListener('reset',()=>{clearTimeout(timer);setTimeout(filter,0);});
  $('extent').addEventListener('click',fit);
  map.on('moveend',visibleCount);
  new ResizeObserver(()=>map.invalidateSize()).observe($('map'));
  fetch('data/fernandina-trees.geojson').then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}).then(data=>{
    if(data.type!=='FeatureCollection' || !Array.isArray(data.features))throw new Error('Invalid inventory');
    records=data.features.filter(f=>f.geometry?.type==='Point' && f.geometry.coordinates.slice(0,2).every(Number.isFinite)).map(f=>{
      const p=f.properties, [lng,lat]=f.geometry.coordinates;
      const name=species(p);
      const marker=L.marker([lat,lng],{icon:icons[Number(historical(p))],title:`${name}, tree ${text(p.tree_no)}`,alt:name});
      marker.bindPopup(()=>popup(p));
      return {p,species:name,marker,search:[name,p.common,p.sci_name,p.scientificname,p.street,p.address,p.tree_no].filter(v=>v!=null).join(' ').toLowerCase()};
    });
    for(const [id,values] of [['species',records.map(r=>r.species)],['condition',records.map(r=>r.p.condition2).filter(Boolean)]]) {
      [...new Set(values)].sort().forEach(value=>$(id).add(new Option(value,value)));$(id).disabled=false;
    }
    $('reset').disabled=false;filter();fit();
  }).catch(error=>{status.textContent='The inventory could not load. Reload to try again.';$('visible').textContent='Inventory unavailable';console.error(error);});
})();
