import assert from 'node:assert/strict';
import {NATIONAL_REGIONS,NATIONAL_PLACES} from '../public/national-data.js';
import {planTrip} from '../public/planner.js';
import {startLocal} from '../public/ai-local.js';
import {loadLodgings,lodgingRows} from '../lodging-api.mjs';
for(const region of Object.keys(NATIONAL_REGIONS)){
 const input={region,date:'2026-11-21',days:2,who:'couple',move:'car',likes:['nature','culture','food']};
 const trip=planTrip(input,{pace:'normal'});assert.equal(trip.days.length,2);assert.ok(trip.lodging);assert.equal(trip.totals.conflicts,0);
 const ids=[];for(const day of trip.days){assert.ok(day.items.length>=2);for(const item of day.items){assert.equal(item.place.region,region);assert.equal(item.place.hoursGuessed,true);ids.push(item.id);}}assert.equal(new Set(ids).size,ids.length);
 const accessible=planTrip(input,{access:['wheelchair'],lessWalk:true});for(const day of accessible.days)for(const item of day.items)assert.equal(item.place.wheelchairKnown,'yes');
}
assert.equal(startLocal('서울역에서 출발해서 부산 1박','2026-11-08').region,'busan');
assert.equal(startLocal('제주 2박 가족 여행','2026-11-08').region,'jeju');
assert.equal(startLocal('서울역에서 기차로 강릉 1박','2026-11-08').region,'gangneung');
const point={lat:37.8,lng:128.9};const rows=[{contentid:'1',title:'사진 숙소',mapy:37.81,mapx:128.91,firstimage:'http://example.com/a.jpg'},{contentid:'2',title:'다른 지역',mapy:35,mapx:126},{contentid:'3',title:'안전한 대체',mapy:37.8,mapx:128.9,firstimage:'javascript:alert(1)'}];
const hotels=lodgingRows(rows,point);assert.equal(hotels.length,2);assert.equal(hotels[0].photo,'https://example.com/a.jpg');assert.equal(hotels[1].photo,'');
let calls=0;const fetched=await loadLodgings(point,{key:'test',fetchImpl:async(url)=>{calls++;assert.equal(new URL(url).searchParams.get('contentTypeId'),'32');return {ok:true,text:async()=>JSON.stringify({response:{header:{resultCode:'0000'},body:{items:{item:rows}}}})};}});assert.equal(fetched.length,2);assert.equal(calls,1);
await assert.rejects(loadLodgings({lat:NaN,lng:128},{key:'test'}),/INVALID_LOCATION/);await assert.rejects(loadLodgings(point),/PROVIDER_NOT_CONFIGURED/);
assert.ok(NATIONAL_PLACES.every(p=>p.sourceURL.startsWith('https://www.openstreetmap.org/')));
console.log('ok - 전국 16개 신규 시·도 + 기존 강원, 일정·접근성·지역 해석·숙소 사진 API');
