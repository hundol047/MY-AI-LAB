// Offline bootstrap from existing, attributed app datasets; never claim a fresh API fetch.
import {readFile,writeFile} from 'node:fs/promises';
import {PLACES,REGIONS} from '../public/data.js';
const path=new URL('../public/directory.json',import.meta.url);
const current=JSON.parse(await readFile(path,'utf8'));
const map=new Map((current.places||[]).map(p=>[p.id,p]));
for(const p of PLACES) if(!map.has(p.id)) map.set(p.id,{id:p.id,type:({food:'39',cafe:'39',culture:'14'})[p.cat]||'12',name:p.name,address:REGIONS[p.region].label,lat:p.lat,lng:p.lng,hours:p.hours.join('–'),closed:p.closed.map(d=>['일','월','화','수','목','금','토'][d]).join(', '),source:'앱 검토 자료',plannerId:p.id});
const lodging=JSON.parse(await readFile(new URL('../public/lodging-places.json',import.meta.url),'utf8'));
for(const types of Object.values(lodging)) for(const rows of Object.values(types)) for(const p of rows) if(!map.has(p.id)) map.set(p.id,{id:p.id,type:'32',name:p.name,address:p.addr,lat:p.lat,lng:p.lng,hours:'',closed:'',source:'한국관광공사 숙박 정보 (기존 수집본)'});
await writeFile(path,JSON.stringify({...current,source:current.fetchedAt?current.source:'앱 검토 자료·관광공사 기존 숙박 자료',places:[...map.values()]},null,2)+'\n');
console.log(`탐색 목록 ${map.size}곳 (새 API 수집 아님)`);
