// Usage: node scripts/approve-directory.mjs reviewed.json
// reviewed.json: [{id, region, area, cat, hours:["09:00","18:00"], closed:[], stay:60,
// indoor:true, walk:1, pop:1, tags:[], desc:"...", reviewedAt:"YYYY-MM-DD", sourceUrl:"https://..."}]
import {readFile,writeFile} from 'node:fs/promises';
import {PLACES,AREAS} from '../public/data.js';
const source=JSON.parse(await readFile(new URL('../public/directory.json',import.meta.url),'utf8'));
const rows=JSON.parse(await readFile(process.argv[2],'utf8'));
if(!Array.isArray(rows))throw Error('검토 목록이 필요합니다.');
const ids=new Set();
const extra=rows.map(r=>{
 const p=source.places.find(p=>p.id===r.id);
 const times=Array.isArray(r.hours)&&r.hours.length===2&&r.hours.every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t))&&r.hours[0]<r.hours[1];
 if(!p || p.type==='32' || ids.has(r.id) || PLACES.some(x=>x.id===r.id && !x.external) || AREAS[r.area]?.region!==r.region || !['sea','cafe','food','culture','nature'].includes(r.cat)||!times||!Array.isArray(r.closed)||!r.closed.every(d=>Number.isInteger(d)&&d>=0&&d<=6)||!Number.isInteger(r.stay)||r.stay<10||r.stay>480||typeof r.indoor!=='boolean'||![1,2,3].includes(r.walk)||!Number.isFinite(r.pop)||!Array.isArray(r.tags)||!r.tags.every(x=>typeof x==='string')||typeof r.desc!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.reviewedAt)||!/^https:\/\//.test(r.sourceUrl)||!Number.isFinite(p.lat)||!Number.isFinite(p.lng))throw Error(`검토 항목 누락 또는 오류: ${r.id}`);
 ids.add(r.id);return {id:r.id,region:r.region,area:r.area,cat:r.cat,hours:r.hours,closed:r.closed,stay:r.stay,indoor:r.indoor,walk:r.walk,pop:r.pop,tags:r.tags,desc:r.desc,reviewedAt:r.reviewedAt,sourceUrl:r.sourceUrl,name:p.name,lat:p.lat,lng:p.lng,external:true};
});
await writeFile(new URL('../public/extra-places.js',import.meta.url),'// Operator-reviewed official places.\nexport const EXTRA_PLACES = '+JSON.stringify(extra,null,2)+';\n');
console.log(`검토 장소 ${extra.length}곳 반영. 전체 일정 테스트 후 배포하세요.`);
