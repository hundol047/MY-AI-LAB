import { createServices, equalSecret } from './services.mjs';
import { createUsageStats } from './usage-stats.mjs';
import path from 'node:path';
import { PLACES } from './public/data.js';
import { readFile, stat } from 'node:fs/promises';
// 탐색 목록(관광공사 4,000여 곳, 1MB 넘음)의 id 집합: 후기를 쓸 때마다 파일을 다시 읽지 않고, 파일이 바뀌었을 때만 다시 만든다
const DIRECTORY=new URL('./public/directory.json',import.meta.url);let directoryIds=null,directoryStamp=0;
async function directoryHas(id){const {mtimeMs}=await stat(DIRECTORY);if(!directoryIds||mtimeMs!==directoryStamp){directoryIds=new Set(JSON.parse(await readFile(DIRECTORY,'utf8')).places.map(p=>String(p.id)));directoryStamp=mtimeMs;}return directoryIds.has(String(id));}
const reply = (res,status,data) => res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}).end(JSON.stringify(data));
export function serviceAPI({file,adminToken,pushSender=null}) {
  const store=createServices(file), rates=new Map(), stats=createUsageStats(path.join(path.dirname(file),'usage-stats.json'));
  async function body(req) {
    if (!String(req.headers['content-type']||'').startsWith('application/json')) throw Object.assign(new Error('JSON 요청이 필요합니다.'),{status:415});
    let text=''; for await (const chunk of req) {text+=chunk; if (Buffer.byteLength(text)>(req.url.split('?')[0]==='/api/shops'?200000:12000)) throw Object.assign(new Error('요청이 너무 큽니다.'),{status:413});}
    try{const b=JSON.parse(text);if(!b || typeof b!=='object' || Array.isArray(b))throw new Error();return b;}catch{throw Object.assign(new Error('신청 내용을 확인하세요.'),{status:400});}
  }
  async function validPlace(id) {
    if (PLACES.some(p=>p.id===id)) return true;
    return directoryHas(id);
  }
  const handler = async (req,res,url) => {
    const p=url.pathname;
    const offset=Math.max(0,parseInt(url.searchParams.get('offset'))||0),limit=50;
    if (!/^\/api\/(bookings|admin|reviews|payments|shops|push-config|stats|place-reports|votes)(\/|$)/.test(p)) return false;
    try {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return reply(res,403,{error:'다른 사이트의 요청은 허용하지 않습니다.'}),true;
      if ((req.method !== 'GET' || p.startsWith('/api/admin')) && p!=='/api/stats') { // 집계는 예약 요청 한도를 쓰지 않게 따로 둔다
        const now=Date.now(), key=req.socket.remoteAddress;
        for (const [k,v] of rates) if (v.until<now) rates.delete(k);
        const v=rates.get(key)||{n:0,until:now+60000}; v.n++; rates.set(key,v);
        if (v.n>30) return reply(res,429,{error:'요청이 많습니다. 잠시 후 다시 시도하세요.'}),true;
      }
      const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
      if (p.startsWith('/api/admin')) {
        if (!adminToken || adminToken.length < 32) return reply(res,503,{error:'운영자 인증이 설정되지 않았습니다.'}),true;
        if (!equalSecret(token,adminToken)) return reply(res,401,{error:'운영자 인증이 필요합니다.'}),true;
        if (p==='/api/admin/stats' && req.method==='GET') reply(res,200,await stats.summary(Math.min(180,Math.max(1,parseInt(url.searchParams.get('days'))||30))));
        else if (p==='/api/admin/push' && req.method==='GET') reply(res,200,{enabled:!!pushSender,...store.pushStats()});
        else if (p==='/api/admin/shops' && req.method==='GET') reply(res,200,store.shops({admin:true,offset,limit}));
        else if (/^\/api\/admin\/shops\/[^/]+$/.test(p) && req.method==='POST') reply(res,200,store.moderateShop(p.split('/')[4],await body(req)));
        else if (p==='/api/admin/bookings' && req.method==='GET') reply(res,200,store.listBookings(offset,limit));
        else if (p==='/api/admin/reviews' && req.method==='GET') reply(res,200,store.listReviews(offset,limit));
        else if (p==='/api/admin/reports' && req.method==='GET') reply(res,200,store.reports(offset,limit));
        else if (p==='/api/admin/place-reports' && req.method==='GET') reply(res,200,store.placeReports(offset,limit));
        else if (/^\/api\/admin\/bookings\/[^/]+\/(status|quote)$/.test(p) && req.method==='POST') {const parts=p.split('/'); reply(res,200,store[parts[5]==='quote'?'quote':'update'](parts[4],await body(req)));}
        else if (/^\/api\/admin\/reviews\/[^/]+$/.test(p) && req.method==='POST') reply(res,200,store.moderate(p.split('/')[4],(await body(req)).state));
        else reply(res,404,{error:'경로를 찾지 못했습니다.'});
      } else if(p==='/api/stats' && req.method==='POST') {const b=await body(req);await stats.record(b.event,b.value);reply(res,200,{ok:true});}
      else if(p==='/api/push-config' && req.method==='GET') reply(res,200,{enabled:!!pushSender,publicKey:pushSender?.publicKey||null});
      else if (/^\/api\/bookings\/[^/]+\/push$/.test(p) && ['POST','DELETE'].includes(req.method)) {const b=await body(req);store.get(p.split('/')[3],token);if(req.method==='DELETE')reply(res,200,store.unsubscribePush(p.split('/')[3],token,b.endpoint));else if(!pushSender)reply(res,503,{error:'웹 푸시 서버 설정이 필요합니다.'});else reply(res,200,store.subscribePush(p.split('/')[3],token,b.subscription,b.lang));}
      else if (p==='/api/shops' && req.method==='POST') reply(res,201,store.addShop(await body(req)));
      else if (p==='/api/shops' && req.method==='GET') {const id=url.searchParams.get('id'); const rows=store.shops({region:url.searchParams.get('region'),id,limit:200});reply(res,id&&!rows.length?404:200,id?rows[0]||{}:rows.map(p=>({...p,count:p.items.length})));}
      else if (/^\/api\/bookings\/[^/]+\/recover$/.test(p) && req.method==='POST') reply(res,200,store.recover(p.split('/')[3],(await body(req)).recoveryKey));
      else if (/^\/api\/bookings\/[^/]+$/.test(p) && req.method==='DELETE') reply(res,200,store.removeBooking(p.split('/')[3],token));
      else if (p==='/api/bookings' && req.method==='POST') reply(res,201,store.create(await body(req),req.headers['idempotency-key'],token));
      else if (/^\/api\/bookings\/[^/]+$/.test(p) && req.method==='GET') reply(res,200,store.get(p.split('/')[3],token));
      else if (/^\/api\/bookings\/[^/]+\/cancel$/.test(p) && req.method==='POST') reply(res,200,store.cancel(p.split('/')[3],token));
      else if (p==='/api/payments/capabilities' && req.method==='GET') reply(res,200,{enabled:false,reason:'결제사 연동 준비 중입니다. 현재 결제할 수 없습니다.'});
      else if (p==='/api/payments/checkout' && req.method==='POST') {const b=await body(req); store.get(b.bookingId,token); reply(res,503,{error:'결제사 연동 준비 중입니다. 결제가 실행되지 않았습니다.'});}
      else if (p==='/api/reviews' && req.method==='GET') reply(res,200,store.reviews(url.searchParams.get('place')||''));
      else if (p==='/api/reviews' && req.method==='POST') {const b=await body(req); if(!await validPlace(b.place)) reply(res,400,{error:'등록된 장소를 선택하세요.'}); else reply(res,201,store.addReview(b));}
      else if (p==='/api/place-reports' && req.method==='POST') {const b=await body(req); if(!await validPlace(b.place)) reply(res,400,{error:'등록된 장소를 선택하세요.'}); else reply(res,201,store.addPlaceReport(b));}
      else if (p==='/api/votes' && req.method==='GET') reply(res,200,store.votes(url.searchParams.get('trip')||'',url.searchParams.get('voter')||''));
      else if (p==='/api/votes' && req.method==='POST') {const b=await body(req); if(!await validPlace(b.place)) reply(res,400,{error:'등록된 장소를 선택하세요.'}); else reply(res,200,store.vote(b));}
      else if (/^\/api\/reviews\/[^/]+\/report$/.test(p) && req.method==='POST') reply(res,201,store.report(p.split('/')[3],(await body(req)).reason));
      else reply(res,404,{error:'경로를 찾지 못했습니다.'});
    } catch(e) { reply(res,e.status||500,{error:e.status?e.message:'처리에 실패했습니다. 잠시 후 다시 시도하세요.'}); }
    return true;
  };
  return Object.assign(handler,{store});
}
