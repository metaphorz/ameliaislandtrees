(() => {
  'use strict';
  const $=id=>document.getElementById(id),grid=$('grid'),number=n=>n.toLocaleString('en-US');
  const el=(tag,value,className)=>{const n=document.createElement(tag);if(value!=null)n.textContent=value;if(className)n.className=className;return n;};
  const normalize=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’‘']/g,'');
  const sourceNames={city:'city inventory',heritage:'heritage',  'city-plantings':'city plantings',nominations:'nominations',omni:'Omni',unincorporated:'iNaturalist',planting:'AIPCA',county:'county'};
  let trees=[];

  // External links open in one reusable window the viewer can move and resize, not a tab.
  function openWindow(url,name='tree-atlas-info'){
    const width=Math.min(1000,screen.availWidth-60),height=Math.min(760,screen.availHeight-60);
    const win=window.open(url,name,`popup=yes,resizable=yes,scrollbars=yes,width=${width},height=${height},left=${window.screenX+70},top=${window.screenY+50}`);
    if(!win)return false;
    try{win.opener=null;}catch{}
    win.focus();return true;
  }
  document.addEventListener('click',e=>{
    const a=e.target.closest?.('a[target="_blank"]');
    if(!a||e.defaultPrevented||e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
    if(openWindow(a.href))e.preventDefault();
  });
  const link=(label,url)=>{const a=el('a',label);a.href=url;a.target='_blank';a.rel='noopener';return a;};

  // Ask an open map window to show the species; open the map if none answers.
  const channel='BroadcastChannel' in window?new BroadcastChannel('tree-atlas'):null;
  function showOnMap(tree){
    const url='index.html?q='+encodeURIComponent(tree.scientific);
    if(!channel){openWindow(url,'tree-atlas-map');return;}
    let answered=false;const listen=e=>{if(e.data?.type==='shown')answered=true;};
    channel.addEventListener('message',listen);channel.postMessage({type:'search',q:tree.scientific});
    setTimeout(()=>{channel.removeEventListener('message',listen);if(!answered)openWindow(url,'tree-atlas-map');},400);
  }

  function summary(tree){
    const sentence=(tree.extract||'').match(/^.*?[.!?](\s|$)/)?.[0]?.trim();
    return sentence||tree.description||'';
  }
  function card(tree){
    const article=el('article',null,'card'),figure=el('figure'),frame=el('button',null,'photo'),image=el('img'),credit=el('figcaption');
    const title=tree.common||tree.scientific;let index=0;
    frame.type='button';image.loading='lazy';image.decoding='async';frame.append(image);figure.append(frame);
    const nav=el('div',null,'photo-nav'),prev=el('button','<'),next=el('button','>'),count=el('span');
    prev.type=next.type='button';prev.setAttribute('aria-label',`Previous photo of ${title}`);next.setAttribute('aria-label',`Next photo of ${title}`);
    if(tree.photos.length>1){nav.append(prev,count,next);figure.append(nav);}
    figure.append(credit);
    function show(){
      const p=tree.photos[index];
      image.src=p.thumbnail;image.alt=`${title} (${tree.scientific}), photo ${index+1} of ${tree.photos.length}${p.caption?': '+p.caption:''}`;
      frame.setAttribute('aria-label',`Open the full-size photo of ${title}`);
      count.textContent=`${index+1} / ${tree.photos.length}`;
      credit.replaceChildren(el('span',`Photo: ${p.credit} · `),link(p.license,p.license_url||p.page),el('span',' · '),link(p.source,p.page));
      if(p.caption)credit.prepend(el('em',p.caption+' '));
    }
    prev.onclick=()=>{index=(index-1+tree.photos.length)%tree.photos.length;show();};
    next.onclick=()=>{index=(index+1)%tree.photos.length;show();};
    frame.onclick=()=>openWindow(tree.photos[index].url);
    image.onerror=()=>{tree.photos.splice(index,1);if(!tree.photos.length){article.remove();return;}index%=tree.photos.length;show();};
    show();

    const body=el('div',null,'card-body');
    body.append(el('h2',title),el('p',tree.scientific,'scientific'),el('p',summary(tree),'description'));
    const sources=Object.entries(tree.sources).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${sourceNames[k]||k} ${number(v)}`).join(' · ');
    const stat=el('p',null,'records');stat.append(el('strong',`${number(tree.records)} record${tree.records===1?'':'s'}`),el('span',` on the map · ${sources}`));body.append(stat);
    const actions=el('div',null,'actions'),map=el('button','Show on map');map.type='button';map.onclick=()=>showOnMap(tree);actions.append(map);
    if(tree.wikipedia)actions.append(link('Wikipedia ↗',tree.wikipedia));
    actions.append(link('iNaturalist ↗','https://www.inaturalist.org/taxa/search?q='+encodeURIComponent(tree.scientific)));
    body.append(actions);article.append(figure,body);
    return article;
  }

  function render(){
    const words=normalize($('search').value).split(/\s+/).filter(Boolean),sort=$('sort').value;
    const matching=trees.filter(t=>words.every(w=>t.search.includes(w)));
    const name=t=>t.common||t.scientific;
    matching.sort(sort==='common'?(a,b)=>name(a).localeCompare(name(b)):sort==='scientific'?(a,b)=>a.scientific.localeCompare(b.scientific):(a,b)=>b.records-a.records);
    grid.replaceChildren(...matching.map(t=>t.card));
    $('count').textContent=words.length?`${matching.length} of ${trees.length} species match`:`${trees.length} species`;
    if(!matching.length)grid.append(el('p','No trees match. Try a common or scientific name.','empty'));
  }

  fetch('data/gallery.json').then(r=>{if(!r.ok)throw new Error(r.status);return r.json();}).then(data=>{
    trees=data.items.filter(t=>t.photos?.length).map(t=>({...t,search:normalize([t.common,t.scientific,...t.recorded_as,t.description,t.extract].join(' '))}));
    for(const t of trees)t.card=card(t);
    const q=new URLSearchParams(location.search).get('q');if(q)$('search').value=q;
    render();
  }).catch(()=>{$('count').textContent='The tree gallery could not load. Please reload.';});
  let timer;$('search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(render,120);});$('sort').addEventListener('change',render);
})();
