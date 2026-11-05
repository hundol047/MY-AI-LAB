import { createServices, equalSecret } from './services.mjs';
import { PLACES } from './public/data.js';
import { readFile } from 'node:fs/promises';
const reply = (res,status,data) => res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}).end(JSON.stringify(data));
export function serviceAPI({file,adminToken,pushSender=null}) {
  const store=createServices(file), rates=new Map();
  async function body(req) {
    if (!String(req.headers['content-type']||'').startsWith('application/json')) throw Object.assign(new Error('JSON 요청이 필요합니다.'),{status:415});
    let text=''; for await (const chunk of req) {text+=chunk; if (Buffer.byteLength(text)>(req.url.split('?')[0]==='/api/shops'?200000:12000)) throw Object.assign(new Error('요청이 너무 큽니다.'),{status:413});}
    try{const b=JSON.parse(text);if(!b || typeof b!=='object' || Array.isArray(b))throw new Error();return b;}catch{throw Object.assign(new Error('신청 내용을 확인하세요.'),{status:400});}
  }
  async function validPlace(id) {
    if (PLACES.some(p=>p.id===id)) return true;
    const d=JSON.parse(await readFile(new URL('./public/directory.json',import.meta.url),'utf8'));
    return d.places.some(p=>p.id===id);
  }
  const handler = async (req,res,url) => {
    const p=url.pathname;
    const offset=Math.max(0,parseInt(url.searchParams.get('offset'))||0),limit=50;
    if (!/^\/api\/(bookings|admin|reviews|payments|shops|push-config)(\/|$)/.test(p)) return false;
    try {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return reply(res,403,{error:'다른 사이트의 요청은 허용하지 않습니다.'}),true;
      if (req.method !== 'GET' || p.startsWith('/api/admin')) {
        const now=Date.now(), key=req.socket.remoteAddress;
        for (const [k,v] of rates) if (v.until<now) rates.delete(k);
        const v=rates.get(key)||{n:0,until:now+60000}; v.n++; rates.set(key,v);
        if (v.n>30) return reply(res,429,{error:'요청이 많습니다. 잠시 후 다시 시도하세요.'}),true;
      }
      const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
      if (p.startsWith('/api/admin')) {
        if (!adminToken || adminToken.length < 32) return reply(res,503,{error:'운영자 인증이 설정되지 않았습니다.'}),true;
        if (!equalSecret(token,adminToken)) return reply(res,401,{error:'운영자 인증이 필요합니다.'}),true;
        if (p==='/api/admin/push' && req.method==='GET') reply(res,200,{enabled:!!pushSender,...store.pushStats()});
        else if (p==='/api/admin/shops' && req.method==='GET') reply(res,200,store.shops({admin:true,offset,limit}));
        else if (/^\/api\/admin\/shops\/[^/]+$/.test(p) && req.method==='POST') reply(res,200,store.moderateShop(p.split('/')[4],await body(req)));
        else if (p==='/api/admin/bookings' && req.method==='GET') reply(res,200,store.listBookings(offset,limit));
        else if (p==='/api/admin/reviews' && req.method==='GET') reply(res,200,store.listReviews(offset,limit));
        else if (p==='/api/admin/reports' && req.method==='GET') reply(res,200,store.reports(offset,limit));
        else if (/^\/api\/admin\/bookings\/[^/]+\/(status|quote)$/.test(p) && req.method==='POST') {const parts=p.split('/'); reply(res,200,store[parts[5]==='quote'?'quote':'update'](parts[4],await body(req)));}
        else if (/^\/api\/admin\/reviews\/[^/]+$/.test(p) && req.method==='POST') reply(res,200,store.moderate(p.split('/')[4],(await body(req)).state));
        else reply(res,404,{error:'경로를 찾지 못했습니다.'});
      } else if(p==='/api/push-config' && req.method==='GET') reply(res,200,{enabled:!!pushSender,publicKey:pushSender?.publicKey||null});
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
      else if (/^\/api\/reviews\/[^/]+\/report$/.test(p) && req.method==='POST') reply(res,201,store.report(p.split('/')[3],(await body(req)).reason));
      else reply(res,404,{error:'경로를 찾지 못했습니다.'});
    } catch(e) { reply(res,e.status||500,{error:e.status?e.message:'처리에 실패했습니다. 잠시 후 다시 시도하세요.'}); }
    return true;
  };
  return Object.assign(handler,{store});
}
