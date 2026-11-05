import assert from 'node:assert/strict';
import {tour} from '../scripts/tour-api.mjs';
const original=globalThis.fetch;let calls=0;
try{
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({OpenAPI_ServiceResponse:{cmmMsgHeader:{returnReasonCode:'10',errMsg:'fixture-secret'}}}),{status:400});};
 await assert.rejects(()=>tour('KorService2','areaCode2',{}, {key:'fixture-secret'}), e=>e.message.includes('오류 코드 10')&&!e.message.includes('fixture-secret'));
 assert.equal(calls,1,'400 요청은 동일하게 재시도하지 않는다');
 globalThis.fetch=async()=>new Response(JSON.stringify({unexpected:[]}));
 await assert.rejects(()=>tour('KorService2','areaCode2',{}, {key:'fixture-secret'}),/응답 구조/);
 console.log('ok - 관광공사 게이트웨이 오류 분류·키 미출력·400 재시도 방지·응답 구조 검증');
}finally{globalThis.fetch=original;}
