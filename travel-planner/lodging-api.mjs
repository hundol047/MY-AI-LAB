// Official nationwide lodging photographs. No room prices or availability are inferred.
import {km} from './scripts/tour-api.mjs';
export function lodgingRows(rows,point){
 return rows.flatMap(r=>{const lat=Number(r.mapy),lng=Number(r.mapx);if(!r.contentid||!r.title||!Number.isFinite(lat)||!Number.isFinite(lng))return [];const distance=km(point,{lat,lng});if(distance>10)return [];let photo='';try{const u=new URL(r.firstimage||r.firstimage2);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password){u.protocol='https:';photo=u.href;}}catch{}
 return [{id:String(r.contentid),name:String(r.title).slice(0,200),lat,lng,km:Math.round(distance*10)/10,addr:String(r.addr1||'').slice(0,500),photo}];}).sort((a,b)=>Number(!!b.photo)-Number(!!a.photo)||a.km-b.km).slice(0,6);
}
export async function loadLodgings(point,{key,fetchImpl=fetch}={}){
 if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||point.lat<33||point.lat>39||point.lng<124||point.lng>132)throw Object.assign(Error('INVALID_LOCATION'),{status:400});
 if(!key)throw Object.assign(Error('PROVIDER_NOT_CONFIGURED'),{status:503});
 if(/%[a-f\d]{2}/i.test(key)){try{key=decodeURIComponent(key);}catch{}}
 const q=new URLSearchParams({serviceKey:key,MobileOS:'ETC',MobileApp:'Yeohaengit',_type:'json',mapX:String(point.lng),mapY:String(point.lat),radius:'10000',contentTypeId:'32',numOfRows:'30',pageNo:'1',arrange:'E'});
 const response=await fetchImpl('https://apis.data.go.kr/B551011/KorService2/locationBasedList2?'+q,{signal:AbortSignal.timeout(7000),redirect:'error'});
 if(!response.ok)throw Error('PROVIDER_UNAVAILABLE');const body=await response.text();if(body.length>1000000)throw Error('RESPONSE_TOO_LARGE');const data=JSON.parse(body)?.response;if(!['00','0000'].includes(String(data?.header?.resultCode)))throw Error('PROVIDER_UNAVAILABLE');const item=data.body?.items?.item;return lodgingRows(Array.isArray(item)?item:item?[item]:[],point);
}
