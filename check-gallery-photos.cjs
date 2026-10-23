// Records which source photos load, so the gallery shows only accessible images.
// Run with: node check-gallery-photos.cjs
const fs=require('node:fs');
const {sources,adapt}=require('./map-data.js');
const read=path=>JSON.parse(fs.readFileSync(path));
const attachments={city:{},planting:{},'city-plantings':{}};
for(const g of read('data/fernandina-attachments.json').attachmentGroups||[])attachments.city[g.parentObjectId]=g.attachmentInfos||[];
for(const [id,path] of [['planting','data/south-island/aipca-planting-locations/attachments.json'],['city-plantings','data/city-supplements/city-plantings.attachments.json']])
  for(const a of read(path))(attachments[id][a.parent_object_id]??=[]).push(a);
const urls=new Set();
for(const s of sources)for(const f of read(s.path).features){
  const r=adapt(f,s.id);if(!r)continue;
  for(const p of [...r.photos,...(attachments[s.id]?.[r.id]||[]).filter(a=>(a.contentType||'').startsWith('image/'))])if(p.url)urls.add(p.url);
}
async function check(url){
  try{
    const response=await fetch(url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(30000)});
    const type=response.headers.get('content-type')||'';
    await response.body?.cancel();
    return response.ok&&type.startsWith('image/')?null:`HTTP ${response.status} ${type}`.trim();
  }catch(error){return error.message;}
}
(async()=>{
  const list=[...urls],ok=[],failed=[];
  for(let i=0;i<list.length;i+=12){
    const results=await Promise.all(list.slice(i,i+12).map(check));
    results.forEach((reason,j)=>reason?failed.push({url:list[i+j],reason}):ok.push(list[i+j]));
  }
  fs.writeFileSync('data/gallery-photos.json',JSON.stringify({checked_at:new Date().toISOString(),accessible:ok.sort(),failed},null,1));
  console.log(`${ok.length} accessible, ${failed.length} failed`);
  for(const f of failed.slice(0,15))console.log(' ',f.reason,f.url);
})();
