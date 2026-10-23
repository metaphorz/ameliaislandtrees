// Builds data/gallery.json: one card per tree species recorded on Amelia Island,
// illustrated with a high-resolution Wikimedia Commons image and its credit.
// Run with: node build-gallery.cjs (after refreshing any source data).
const fs=require('node:fs');
const {sources,adapt}=require('./map-data.js');
const AGENT='AmeliaIslandTreeAtlas/1.0 (https://metaphorz.github.io/ameliaislandtrees/)';
const MIN_SIDE=1200,MAX_PHOTOS=5;
// Recorded plants that are shrubs, vines, ferns, or cycads rather than trees.
const NOT_TREES=new Set(['Baccharis halimifolia','Camellia japonica','Camellia sasanqua','Cycas revoluta','Cyrtomium falcatum',
  'Fatsia japonica','Ficus pumila','Forestiera segregata','Hydrangea quercifolia','Ilex glabra','Itea virginica','Loropetalum chinense',
  'Nandina domestica','Nerium oleander','Pittosporum tobira','Pleopeltis michauxiana','Rhaphiolepis indica','Rhododendron indicum',
  'Rhododendron simsii','Senna polyphylla','Serenoa repens','Thaumatophyllum bipinnatifidum','Trachelospermum asiaticum',
  'Viburnum suspensum','Zamia furfuracea']);

async function get(url,options={}){
  for(let attempt=0;;attempt++){
    const response=await fetch(url,{...options,headers:{'User-Agent':AGENT,...options.headers},signal:AbortSignal.timeout(60000)});
    if(response.ok)return response.json();
    if(attempt>=3||response.status<429)throw new Error(`${url}: HTTP ${response.status}`);
    await new Promise(r=>setTimeout(r,2000*(attempt+1)));
  }
}
async function pool(values,size,task){
  const results=[];
  for(let i=0;i<values.length;i+=size)results.push(...await Promise.all(values.slice(i,i+size).map(task)));
  return results;
}
const plain=html=>String(html||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/\s+/g,' ').trim();

function recordedNames(){
  const counts=new Map();
  for(const s of sources)for(const f of JSON.parse(fs.readFileSync(s.path)).features){
    const r=adapt(f,s.id),name=String(r?.scientific||'').trim();
    if(!name)continue;
    const entry=counts.get(name)||{records:0,sources:{}};
    entry.records++;entry.sources[s.id]=(entry.sources[s.id]||0)+1;counts.set(name,entry);
  }
  return counts;
}

// GBIF corrects misspellings and resolves synonyms to the accepted species.
const tidy=name=>name.replace(/'[^']*'|"[^"]*"/g,' ').replace(/\s+[x×]\s+/gi,' ').replace(/\s+/g,' ').trim().toLowerCase().replace(/^./,c=>c.toUpperCase());
async function acceptedSpecies(name){
  const m=await get('https://api.gbif.org/v1/species/match?kingdom=Plantae&name='+encodeURIComponent(tidy(name)));
  if(!['EXACT','FUZZY'].includes(m.matchType)||m.confidence<80)return null;
  if(['SPECIES','VARIETY','SUBSPECIES','FORM'].includes(m.rank))return m.species;
  return null;
}
function distance(a,b){
  const d=Array.from({length:a.length+1},(_,i)=>[i,...Array(b.length).fill(0)]);
  for(let j=1;j<=b.length;j++)d[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return d[a.length][b.length];
}
// Typos GBIF cannot place (e.g. "Sabal pametto") join the closest accepted species.
function nearestAccepted(name,accepted){
  const [genus,epithet]=tidy(name).split(' ');if(!epithet)return null;
  const close=accepted.map(a=>{const [g,e]=a.split(' ');return {a,score:distance(genus,g)+distance(epithet,e)};}).filter(x=>x.score<=2).sort((x,y)=>x.score-y.score);
  return close.length&&(close.length===1||close[0].score<close[1].score)?close[0].a:null;
}

async function wikidata(names){
  const values=names.map(n=>JSON.stringify(n)).join(' ');
  const query=`SELECT ?name ?item ?image ?common ?article WHERE { VALUES ?name { ${values} } ?item wdt:P225 ?name .
    OPTIONAL { ?item wdt:P18 ?image } OPTIONAL { ?item wdt:P1843 ?common FILTER(LANG(?common)='en') }
    OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> } }`;
  const data=await get('https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(query));
  const found={};
  for(const b of data.results.bindings){
    const n=b.name.value,e=found[n]||={images:new Set(),common:null,article:null};
    if(b.image)e.images.add(decodeURIComponent(b.image.value.split('/Special:FilePath/')[1]).replace(/_/g,' '));
    e.common??=b.common?.value||null;e.article??=b.article?.value||null;
  }
  return found;
}

async function wikipediaSummary(article){
  if(!article)return {};
  const title=decodeURIComponent(article.split('/wiki/')[1]);
  const s=await get('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(title)).catch(()=>({}));
  const image=s.originalimage?.source?.includes('/wikipedia/commons/')?decodeURIComponent(s.originalimage.source.split('/').pop()).replace(/_/g,' '):null;
  return {title:s.title,description:s.description||null,extract:s.extract||null,image};
}

const NOT_HABIT=/\b(fruits?|flowers?|flowering|blooms?|blossoms?|inflorescences?|leaf|leaves|foliage|bark|trunk|seeds?|nuts?|cones?|acorns?|berr(y|ies)|pods?|drupes?|catkins?|buds?|twigs?|branch(es)?|close-?up|macro|detail|illustration|drawing|plate|herbarium|specimen|sylva|botanical|BB-1913|Köhler|insects?|galls?|caterpillar|bonsai|seedlings?|sapling|nursery|map|range|lumber|USDA|etching|silva|DPLA)\b/i;
const HABIT=/\b(tree|trees|habit|habitus|whole|grove|avenue|mature|old|large|giant|specimen tree|in (a|the) park)\b/i;
// Commons categories and descriptions flag close-ups, animals, and artwork.
const NOT_TREE_TOPIC=/\b(leaves|leaf|flowers?|flowering|inflorescences?|fruits?|seeds?|cones?|acorns?|nuts?|bark|buds?|twigs?|close-?ups?|macro|insects?|lepidoptera|butterfl(y|ies)|moths?|caterpillars?|larvae?|beetles?|weevils?|coleoptera|birds?|aves|sparrows?|bees?|wasps?|galls?|fungi|illustrations?|drawings?|botanical art|herbarium|specimens?|maps?|cultivars? in pots|bonsai|food|cuisine|market)\b/i;
const TREE_TOPIC=/\b(habitus|habit|trees? in|whole (tree|plant)|individual trees|old trees|notable trees|avenues?|groves?|forests?|landscape|in winter|in autumn|in summer|in spring|tree)\b/i;
const NOT_TREE_CAPTION=/\b(leaf|leaves|flowers?|blossoms?|inflorescences?|fruits?|acorns?|seeds?|cones?|nuts?|bark|range|map|illustration|drawing|galls?|caterpillar|larva|wood grain|close-?up)\b/i;
// Wikipedia article photos, in article order, with their captions.
async function articlePhotos(article){
  if(!article)return [];
  const title=decodeURIComponent(article.split('/wiki/')[1]);
  const data=await get('https://en.wikipedia.org/api/rest_v1/page/media-list/'+encodeURIComponent(title)).catch(()=>({items:[]}));
  return (data.items||[]).filter(i=>i.type==='image'&&/\.jpe?g$/i.test(i.title))
    .map(i=>({file:decodeURIComponent(i.title.replace(/^File:/,'')).replace(/_/g,' '),caption:i.caption?.text?.trim()||null}));
}
async function commonsSearch(query){
  const data=await get('https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=25&gsrsearch='+encodeURIComponent(query)+'&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=800');
  return Object.values(data.query?.pages||{}).map(page=>page.title.replace(/^File:/,''));
}
async function commonsImages(files){
  const info={};
  for(let i=0;i<files.length;i+=40){
    const titles=files.slice(i,i+40).map(f=>'File:'+f).join('|');
    const data=await get('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=800&titles='+encodeURIComponent(titles));
    for(const page of Object.values(data.query.pages)){
      const ii=page.imageinfo?.[0];if(!ii)continue;
      const meta=ii.extmetadata||{},file=page.title.replace(/^File:/,'');
      const clean=url=>url&&url.replace(/\?utm_.*$/,'');
      info[file]={file,width:ii.width,height:ii.height,mime:ii.mime,url:clean(ii.url),thumbnail:clean(ii.thumburl),page:ii.descriptionurl,
        artist:plain(meta.Artist?.value)||null,credit:plain(meta.Credit?.value)||null,
        license:meta.LicenseShortName?.value||null,license_url:meta.LicenseUrl?.value||null,
        description:plain(meta.ImageDescription?.value).slice(0,400),categories:String(meta.Categories?.value||'').replace(/\|/g,'; '),
        quality:/Featured pictures|Quality images|Valued images/.test(meta.Categories?.value||'')};
    }
  }
  return info;
}

// The fields the gallery page needs, with the photographer credit and license for every photo.
function publicPhoto(p){
  if(p.inaturalist_photo)return {source:'iNaturalist',url:p.url,thumbnail:p.thumbnail,page:p.page,credit:p.credit,license:p.license,
    license_url:'https://creativecommons.org/licenses/'+p.license.replace(/^CC0$/,'zero').replace(/^CC /,'').toLowerCase()+(p.license==='CC0'?'/1.0/':'/4.0/'),caption:null};
  return {source:'Wikimedia Commons',url:p.url,thumbnail:p.thumbnail,page:p.page,credit:p.artist||p.credit||'Wikimedia Commons contributor',
    license:p.license,license_url:p.license_url,caption:p.caption||null,width:p.width,height:p.height};
}

(async()=>{
  const recorded=recordedNames(),species=new Map(),unmatched=[];
  const names=[...recorded.keys()],accepted=await pool(names,8,acceptedSpecies);
  const known=[...new Set(accepted.filter(Boolean))];
  names.forEach((name,i)=>{
    const a=accepted[i]||nearestAccepted(name,known),r=recorded.get(name);
    if(!a){unmatched.push(name);return;}
    const s=species.get(a)||{scientific:a,records:0,sources:{},recorded_as:[]};
    s.records+=r.records;s.recorded_as.push(name);
    for(const [k,v] of Object.entries(r.sources))s.sources[k]=(s.sources[k]||0)+v;
    species.set(a,s);
  });
  for(const n of NOT_TREES)species.delete(n);
  for(const [n,s] of species)if(s.records<2&&Object.keys(s.sources).every(k=>k==='unincorporated'||k==='omni'))species.delete(n);
  const list=[...species.values()],wd={};
  for(let i=0;i<list.length;i+=60)Object.assign(wd,await wikidata(list.slice(i,i+60).map(s=>s.scientific)));
  const summaries=await pool(list,6,s=>wikipediaSummary(wd[s.scientific]?.article));
  // Candidates: curated Commons quality/featured images, whole-tree searches, then Wikidata/Wikipedia lead images.
  const searched=await pool(list,4,async s=>[
    ...await commonsSearch(`"${s.scientific}" incategory:Quality_images|Featured_pictures_on_Wikimedia_Commons|Valued_images_sorted_by_promotion_date filemime:image/jpeg`),
    ...await commonsSearch(`${s.scientific} tree filemime:image/jpeg`),
    ...await commonsSearch(`${s.scientific} habitus filemime:image/jpeg`)]);
  const articles=await pool(list,4,s=>articlePhotos(wd[s.scientific]?.article));
  const candidates=list.map((s,i)=>[...new Set([...searched[i],...(wd[s.scientific]?.images||[]),summaries[i].image].filter(Boolean))]);
  const images=await commonsImages([...new Set([...candidates.flat(),...articles.flat().map(a=>a.file)])]);
  const overrides=fs.existsSync('data/gallery-overrides.json')?JSON.parse(fs.readFileSync('data/gallery-overrides.json')):{};
  // Hand-reviewed close-ups and non-tree photos that pass the automatic filters.
  const excluded=new Set(overrides._exclude||[]);delete overrides._exclude;
  const overrideFiles=Object.values(overrides).flat().filter(f=>typeof f==='string'&&!images[f]);
  if(overrideFiles.length)Object.assign(images,await commonsImages(overrideFiles));
  const items=[],skipped=[];
  list.forEach((s,i)=>{
    const sum=summaries[i];
    // Prefer Commons quality/featured images, then the largest; all must be high resolution and licensed.
    const text=im=>im.file+' '+im.description,named=im=>text(im).toLowerCase().includes(s.scientific.toLowerCase())||text(im).toLowerCase().includes(s.scientific.split(' ')[0].toLowerCase());
    const score=im=>(HABIT.test(text(im))?4:0)+(im.quality?2:0)+Math.min(im.width*im.height/2e7,1);
    // Hand-checked choices in gallery-overrides.json win; null removes a species without a good tree photo.
    if(s.scientific in overrides&&!overrides[s.scientific]){skipped.push(s.scientific);return;}
    // First choice: the species' Wikipedia article photos (Commons-hosted, licensed, large, whole-tree).
    let photos=articles[i].map(a=>images[a.file]&&{...images[a.file],caption:a.caption})
      .filter(im=>im&&im.license&&Math.max(im.width,im.height)>=1000&&!NOT_HABIT.test(im.file)&&!(im.caption&&NOT_TREE_CAPTION.test(im.caption))
        &&!NOT_TREE_TOPIC.test(im.categories+' '+im.description))
      .map((im,order)=>({im,order,rank:(TREE_TOPIC.test(im.caption+' '+im.file+' '+im.categories+' '+im.description)?2:0)+(im.quality?1:0)}))
      .sort((a,b)=>b.rank-a.rank||a.order-b.order).slice(0,MAX_PHOTOS).map(x=>x.im);
    if(overrides[s.scientific])photos=overrides[s.scientific].map(f=>typeof f==='string'?{...images[f],caption:null}:f);
    // Fallback: a Commons search for whole-tree photos.
    if(!photos.length){
      const found=candidates[i].map(f=>images[f])
        .filter(im=>im&&im.mime==='image/jpeg'&&Math.min(im.width,im.height)>=MIN_SIDE&&im.license&&named(im)&&!NOT_HABIT.test(im.file))
        .sort((a,b)=>score(b)-score(a))[0];
      if(found)photos=[{...found,caption:null}];
    }
    photos=photos.filter(p=>p&&!excluded.has(p.file)).map(publicPhoto);
    if(!photos.length){skipped.push(s.scientific);return;}
    const common=wd[s.scientific]?.common||(sum.title&&sum.title!==s.scientific?sum.title:null);
    items.push({...s,common:common&&common[0].toUpperCase()+common.slice(1),description:sum.description,
      extract:sum.extract,wikipedia:wd[s.scientific]?.article||null,photos});
  });
  items.sort((a,b)=>b.records-a.records);
  fs.writeFileSync('data/gallery.json',JSON.stringify({built_at:new Date().toISOString(),
    method:'Recorded scientific names matched to accepted species with GBIF. Photos come from each species\' English Wikipedia article (Commons-hosted and licensed); a Commons search for whole-tree photos is the fallback.',
    items,skipped_no_suitable_image:skipped,unmatched_names:unmatched},null,1));
  console.log(`${items.length} species with Commons images; ${skipped.length} without a suitable image; ${unmatched.length} unmatched names`);
  console.log('skipped:',skipped.join(', '));console.log('unmatched:',unmatched.join(', '));
})();
