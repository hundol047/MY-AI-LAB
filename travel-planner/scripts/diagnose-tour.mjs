// HTTPS-only diagnosis. Output never includes credentials, request URLs or raw provider bodies.
import {tour} from './tour-api.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const cases=[
 ['regional-list','KorService2','areaBasedList2',{lDongRegnCd:'51',numOfRows:'1',pageNo:'1',arrange:'C'}],
 ['legacy-area-parameter','KorService2','areaBasedList2',{areaCode:'32',numOfRows:'1',pageNo:'1',listYN:'Y',arrange:'A'}],
 ['minimal-list','KorService2','areaBasedList2',{numOfRows:'1',pageNo:'1'}],
 ['area-codes','KorService2','areaCode2',{numOfRows:'1',pageNo:'1'}],
 ['legacy-service','KorService1','areaBasedList1',{numOfRows:'1',pageNo:'1'}],
];
const results=[];
for(const [name,service,operation,params]of cases){
 try{const rows=await tour(service,operation,params);results.push({name,service,operation,ok:true,count:rows.length});}
 catch(e){results.push({name,service,operation,ok:false,status:e.status||null,code:e.code||null,hint:e.hint||'연결·키 설정·응답 형식을 확인하세요.'});}
}
const report={checkedAt:new Date().toISOString(),transport:'HTTPS',results};
await mkdir(new URL('../reports/',import.meta.url),{recursive:true});
await writeFile(new URL('../reports/tour-connectivity.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(!results.some(r=>r.ok))process.exitCode=1;
