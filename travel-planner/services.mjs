import {validateSubscription} from './web-push.mjs';
import { DatabaseSync, backup } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { REGIONS } from './public/data.js';
import { validateBooking } from './bookings.mjs';
const digest = s => createHash('sha256').update(String(s)).digest('hex');
export function equalSecret(a, b) { return !!a && !!b && timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b))); }
export function createServices(file) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  chmodSync(file, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY, token TEXT NOT NULL, requestKey TEXT UNIQUE NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, place TEXT NOT NULL, state TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, review TEXT NOT NULL, reason TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS place_reports(id TEXT PRIMARY KEY, place TEXT NOT NULL, kind TEXT NOT NULL, note TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS votes(trip TEXT NOT NULL, place TEXT NOT NULL, voter TEXT NOT NULL, vote INTEGER NOT NULL, at TEXT NOT NULL, PRIMARY KEY(trip,place,voter));
    CREATE TABLE IF NOT EXISTS recovery(id TEXT PRIMARY KEY, secret TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shops(id TEXT PRIMARY KEY, state TEXT NOT NULL, fingerprint TEXT UNIQUE NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS push_subscriptions(booking TEXT NOT NULL, endpoint TEXT NOT NULL, subscription TEXT NOT NULL, lang TEXT NOT NULL, PRIMARY KEY(booking,endpoint));
    CREATE TABLE IF NOT EXISTS push_outbox(id TEXT PRIMARY KEY, booking TEXT NOT NULL, endpoint TEXT NOT NULL, subscription TEXT NOT NULL, lang TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, nextAt INTEGER NOT NULL, status INTEGER NOT NULL DEFAULT 0);`);
  const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
  function booking(id) {
    const row = db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
    if (!row) fail(404, '신청을 찾을 수 없습니다.');
    return { row, data: JSON.parse(row.payload) };
  }
  const forgetPush = id => {db.prepare('DELETE FROM push_subscriptions WHERE booking=?').run(id);db.prepare('DELETE FROM push_outbox WHERE booking=?').run(id);};
  const save = b => {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE bookings SET payload=? WHERE id=?').run(JSON.stringify(b),b.id);
      for(const p of db.prepare('SELECT * FROM push_subscriptions WHERE booking=?').all(b.id)) {
        // One latest-state notification per booking/browser avoids obsolete queued alerts.
        db.prepare('DELETE FROM push_outbox WHERE booking=? AND endpoint=?').run(b.id,p.endpoint);
        db.prepare('INSERT INTO push_outbox(id,booking,endpoint,subscription,lang,nextAt) VALUES(?,?,?,?,?,?)').run(randomUUID(),b.id,p.endpoint,p.subscription,p.lang,Date.now());
      }
      db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
  };
  const authorize = (row, token) => { if (!equalSecret(row.token, digest(token || ''))) fail(404, '신청번호 또는 조회키를 확인하세요.'); };
  const page = (offset=0, limit=50) => [Math.max(1,Math.min(200,Number(limit)||50)),Math.max(0,Number(offset)||0)];
  return {
    subscribePush(id,token,subscription,lang='ko') {
      const {row}=booking(id);authorize(row,token);const sub=validateSubscription(subscription);
      const exists=db.prepare('SELECT 1 FROM push_subscriptions WHERE booking=? AND endpoint=?').get(id,sub.endpoint);
      if(!exists && db.prepare('SELECT count(*) AS n FROM push_subscriptions WHERE booking=?').get(id).n>=5)fail(409,'신청별 알림 기기는 최대 5개입니다.');
      db.prepare('INSERT INTO push_subscriptions VALUES(?,?,?,?) ON CONFLICT(booking,endpoint) DO UPDATE SET subscription=excluded.subscription,lang=excluded.lang').run(id,sub.endpoint,JSON.stringify(sub),['ko','en','ja','zh'].includes(lang)?lang:'ko');return {subscribed:true};
    },
    unsubscribePush(id,token,endpoint) {
      const {row}=booking(id);authorize(row,token);
      db.prepare('DELETE FROM push_subscriptions WHERE booking=? AND endpoint=?').run(id,endpoint);
      db.prepare('DELETE FROM push_outbox WHERE booking=? AND endpoint=?').run(id,endpoint);return {subscribed:false};
    },
    duePush(now=Date.now()) {return db.prepare('SELECT * FROM push_outbox WHERE nextAt<=? AND attempts<6 ORDER BY nextAt LIMIT 10').all(now);},
    completePush(id) {db.prepare('DELETE FROM push_outbox WHERE id=?').run(id);},
    failPush(id,status,now=Date.now()) {
      const p=db.prepare('SELECT * FROM push_outbox WHERE id=?').get(id);if(!p)return;
      if(status===404 || status===410) {db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(p.endpoint);db.prepare('DELETE FROM push_outbox WHERE endpoint=?').run(p.endpoint);return;}
      const attempts=[400,401,403].includes(status)?6:p.attempts+1;
      db.prepare('UPDATE push_outbox SET attempts=?,nextAt=?,status=? WHERE id=?').run(attempts,now+Math.min(3600000,60000*2**p.attempts),status,id);
    },
    pushStats() {return {subscriptions:db.prepare('SELECT count(*) n FROM push_subscriptions').get().n,pending:db.prepare('SELECT count(*) n FROM push_outbox WHERE attempts<6').get().n,failed:db.prepare('SELECT count(*) n FROM push_outbox WHERE attempts>=6').get().n};},
    async backup(file) { mkdirSync(dirname(file),{recursive:true,mode:0o700}); await backup(db,file); chmodSync(file,0o600); },
    purge(now=Date.now(), retentionDays=180) {
      // Only terminal bookings past their last update are eligible. Active cases stay available.
      let deleted=0;
      for(const {payload} of db.prepare('SELECT payload FROM bookings').all()) {
        const b=JSON.parse(payload), last=b.history.at(-1)?.at || b.createdAt;
        if(['cancelled','rejected'].includes(b.status) && new Date(last).getTime()<now-retentionDays*86400000) {
          db.prepare('DELETE FROM bookings WHERE id=?').run(b.id);db.prepare('DELETE FROM recovery WHERE id=?').run(b.id);forgetPush(b.id);deleted++;
        }
      }
      // 같이 고르기 투표는 여행이 끝나면 쓸모가 없어서 보관 기간이 지나면 지운다
      db.prepare('DELETE FROM votes WHERE at<?').run(new Date(now-retentionDays*86400000).toISOString());
      return {deleted};
    },
    removeBooking(id,token) {
      const {row,data:b}=booking(id);authorize(row,token);
      if(!['cancelled','rejected'].includes(b.status))fail(409,'신청을 취소하고 처리가 끝난 뒤 삭제할 수 있습니다.');
      db.prepare('DELETE FROM bookings WHERE id=?').run(id);db.prepare('DELETE FROM recovery WHERE id=?').run(id);forgetPush(id);return {deleted:true};
    },
    recover(id,secret) {
      const row=db.prepare('SELECT secret FROM recovery WHERE id=?').get(id);
      if(!row || !equalSecret(row.secret,digest(secret||'')))fail(404,'접수번호 또는 복구코드를 확인하세요.');
      const token=randomBytes(24).toString('hex'), recoveryKey=randomBytes(24).toString('hex');
      db.prepare('UPDATE bookings SET token=? WHERE id=?').run(digest(token),id);
      db.prepare('UPDATE recovery SET secret=? WHERE id=?').run(digest(recoveryKey),id);
      forgetPush(id);
      return {id,token,recoveryKey};
    },
    importShops(rows) {
      for(const p of rows){
        if(typeof p.id!=='string'||!p.name||!Array.isArray(p.items))continue;
        const fingerprint=digest([p.name,p.address||''].join('|').replace(/\s/g,''));
        db.prepare('INSERT OR IGNORE INTO shops VALUES(?,?,?,?)').run(p.id,'pending',fingerprint,JSON.stringify(p));
      }
    },
    addShop(body) {
      const clean=(v,n)=>String(v??'').trim().slice(0,n);
      const items=(Array.isArray(body.items)?body.items:[]).slice(0,80).map(i=>Object.fromEntries(['ko','price','en','ja','zh','note'].map(k=>[k,clean(i[k],120)]))).filter(i=>i.ko);
      if(!clean(body.name,40)||!REGIONS[body.region]||!items.length||!clean(body.phone,30)||!clean(body.address,100))fail(400,'가게 이름·주소·연락처·지역·메뉴를 입력하세요.');
      const fingerprint=digest([clean(body.name,40),clean(body.address,100)].join('|').replace(/\s/g,''));
      if(db.prepare('SELECT id FROM shops WHERE fingerprint=?').get(fingerprint))fail(409,'이미 검토 중이거나 등록된 가게입니다.');
      const p={id:randomBytes(5).toString('hex'),name:clean(body.name,40),region:body.region,address:clean(body.address,100),phone:clean(body.phone,30),hours:clean(body.hours,100),card:!!body.card,items,createdAt:new Date().toISOString()};
      db.prepare('INSERT INTO shops VALUES(?,?,?,?)').run(p.id,'pending',fingerprint,JSON.stringify(p));return {id:p.id,state:'pending'};
    },
    shops({admin=false,region,id,offset=0,limit=50}={}) {
      const rows=db.prepare(`SELECT state,payload FROM shops ${admin?'':"WHERE state='published'"} ORDER BY rowid DESC`).all().map(r=>({...JSON.parse(r.payload),state:r.state})).filter(p=>(!region||p.region===region)&&(!id||p.id===id));
      const [size,start]=page(offset,limit);return rows.slice(start,start+size);
    },
    moderateShop(id,body) {
      if(!['published','hidden','rejected'].includes(body.state))fail(400,'잘못된 상태입니다.');
      if(body.state==='published' && body.verified!==true)fail(400,'업체 연락처와 메뉴 확인이 필요합니다.');
      const row=db.prepare('SELECT payload FROM shops WHERE id=?').get(id);if(!row)fail(404,'가게를 찾지 못했습니다.');
      const p={...JSON.parse(row.payload),reviewedAt:new Date().toISOString(),verified:body.state==='published'};
      db.prepare('UPDATE shops SET state=?,payload=? WHERE id=?').run(body.state,JSON.stringify(p),id);return {id,state:body.state};
    },
    close: () => db.close(),
    create(body, key, token) {
      if (!/^[a-zA-Z0-9_-]{24,100}$/.test(key || '') || !/^[a-zA-Z0-9_-]{32,100}$/.test(token || '')) fail(400, '신청 식별키가 올바르지 않습니다.');
      if(body.recoveryKey!==undefined && !/^[a-zA-Z0-9_-]{32,100}$/.test(body.recoveryKey))fail(400,'복구코드가 올바르지 않습니다.');
      let valid; try { valid=validateBooking(body); } catch(e) { fail(400,e.message); }
      const existing = db.prepare('SELECT * FROM bookings WHERE requestKey=?').get(key);
      if (existing) {
        authorize(existing, token);
        const b = JSON.parse(existing.payload);
        if (JSON.stringify(b.request) !== JSON.stringify(valid)) fail(409, '기존 요청과 내용이 다릅니다. 새 신청으로 접수하세요.');
        return { id:b.id, status:b.status };
      }
      const b = {id:randomUUID(), request:valid, status:'received', createdAt:new Date().toISOString(), history:[{status:'received',at:new Date().toISOString(),message:'예약 검토 신청을 접수했습니다.'}], quote:null};
      db.prepare('INSERT INTO bookings VALUES(?,?,?,?)').run(b.id,digest(token),key,JSON.stringify(b));
      if(body.recoveryKey)db.prepare('INSERT INTO recovery VALUES(?,?)').run(b.id,digest(body.recoveryKey));
      return {id:b.id,status:b.status};
    },
    get(id, token) { const {row,data}=booking(id); authorize(row,token); return data; },
    cancel(id, token) {
      const {row,data:b}=booking(id); authorize(row,token);
      if (['cancelled','cancel_requested'].includes(b.status)) return b;
      if (b.status === 'rejected') fail(409,'거절된 신청입니다.');
      b.status = b.status === 'confirmed' ? 'cancel_requested' : 'cancelled';
      b.history.push({status:b.status,at:new Date().toISOString(),message:b.status === 'cancel_requested' ? '업체 취소 확인을 요청했습니다. 취소 확정 전입니다.' : '예약 검토 신청을 철회했습니다.'}); save(b); return b;
    },
    listBookings(offset=0,limit=50) { return db.prepare('SELECT payload FROM bookings ORDER BY rowid DESC LIMIT ? OFFSET ?').all(...page(offset,limit)).map(r=>JSON.parse(r.payload)); },
    update(id, body) {
      const {data:b}=booking(id);
      const next = {received:['reviewing','rejected','cancelled'],reviewing:['confirmed','rejected','cancelled'],confirmed:['cancel_requested'],cancel_requested:['cancelled','confirmed'],rejected:[],cancelled:[]};
      if (!next[b.status]?.includes(body.status)) fail(409,'허용되지 않는 상태 변경입니다. 목록을 새로 확인하세요.');
      if (body.status === 'confirmed' && (typeof body.reference !== 'string' || !body.reference.trim() || body.reference.length > 120)) fail(400,'업체에서 확인한 예약번호가 필요합니다.');
      const message = typeof body.message === 'string' ? body.message.trim().slice(0,500) : '';
      b.status=body.status;
      if (body.status === 'confirmed') b.supplierReference=body.reference.trim();
      b.history.push({status:b.status,at:new Date().toISOString(),message:message || '운영자가 신청 상태를 변경했습니다.'}); save(b); return b;
    },
    quote(id, body) {
      const {data:b}=booking(id);
      if (!['reviewing','confirmed'].includes(b.status)) fail(409,'검토 중 또는 확정 신청에만 견적을 등록할 수 있습니다.');
      if (!Number.isSafeInteger(body.amount) || body.amount < 1 || body.amount > 100000000 || typeof body.description !== 'string' || !body.description.trim() || body.description.length > 500) fail(400,'견적 금액과 포함 내역을 확인하세요.');
      b.quote={amount:body.amount,currency:'KRW',description:body.description.trim(),at:new Date().toISOString()};
      b.history.push({status:b.status,at:new Date().toISOString(),message:'견적이 등록되었습니다. 결제 기능은 아직 준비 중입니다.'}); save(b); return b;
    },
    reviews(place) { return db.prepare("SELECT payload FROM reviews WHERE place=? AND state='published' ORDER BY rowid DESC LIMIT 100").all(place).map(r=>JSON.parse(r.payload)); },
    addReview(body) {
      if (typeof body.place !== 'string' || !body.place || body.place.length > 100 || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5 || typeof body.nickname !== 'string' || !body.nickname.trim() || body.nickname.length > 30 || typeof body.text !== 'string' || body.text.trim().length < 10 || body.text.length > 2000) fail(400,'장소, 별점, 닉네임과 10~2000자 후기를 입력하세요.');
      const r={id:randomUUID(),place:body.place,rating:body.rating,nickname:body.nickname.trim(),text:body.text.trim(),createdAt:new Date().toISOString(),verifiedVisit:false};
      db.prepare('INSERT INTO reviews VALUES(?,?,?,?)').run(r.id,r.place,'pending',JSON.stringify(r)); return {id:r.id,state:'pending'};
    },
    listReviews(offset=0,limit=50) { return db.prepare('SELECT id,state,payload FROM reviews ORDER BY rowid DESC LIMIT ? OFFSET ?').all(...page(offset,limit)).map(r=>({...JSON.parse(r.payload),state:r.state})); },
    moderate(id,state) { if (!['published','hidden'].includes(state)) fail(400,'후기 상태가 잘못됐습니다.'); const r=db.prepare('UPDATE reviews SET state=? WHERE id=?').run(state,id); if (!r.changes) fail(404,'후기가 없습니다.'); return {id,state}; },
    report(id,reason) {
      if (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 500) fail(400,'신고 사유를 3~500자로 입력하세요.');
      if (!db.prepare("SELECT id FROM reviews WHERE id=? AND state='published'").get(id)) fail(404,'후기가 없습니다.');
      db.prepare('INSERT INTO reports VALUES(?,?,?,?)').run(randomUUID(),id,reason.trim(),new Date().toISOString()); return {received:true};
    },
    reports(offset=0,limit=50) { return db.prepare('SELECT * FROM reports ORDER BY rowid DESC LIMIT ? OFFSET ?').all(...page(offset,limit)); },
    // 장소 정보 오류 제보 (문 닫음·시간 다름·주차·위치 등). 개인정보는 받지 않는다
    addPlaceReport(body) {
      const KINDS = ['closed', 'hours', 'parking', 'location', 'other'];
      if (typeof body.place !== 'string' || !body.place || body.place.length > 100 || !KINDS.includes(body.kind) || (body.note != null && (typeof body.note !== 'string' || body.note.length > 500))) fail(400,'장소, 제보 종류, 500자 이내 설명을 확인하세요.');
      db.prepare('INSERT INTO place_reports VALUES(?,?,?,?,?)').run(randomUUID(),body.place,body.kind,String(body.note||'').trim(),new Date().toISOString()); return {received:true};
    },
    placeReports(offset=0,limit=50) { return db.prepare('SELECT * FROM place_reports ORDER BY rowid DESC LIMIT ? OFFSET ?').all(...page(offset,limit)); },
    // 같이 고르기: 공유한 일정(trip, 일정을 만들 때 정한 무작위 키)의 장소마다 👍/👎. voter는 그 기기의 무작위 id (개인정보 없음)
    vote(body) {
      const ok = (s, n) => typeof s === 'string' && new RegExp(`^[a-z0-9]{8,${n}}$`).test(s);
      if (!ok(body.trip, 16) || !ok(body.voter, 32) || typeof body.place !== 'string' || !body.place || body.place.length > 100 || ![-1, 0, 1].includes(body.vote)) fail(400,'투표 내용을 확인하세요.');
      if (body.vote === 0) db.prepare('DELETE FROM votes WHERE trip=? AND place=? AND voter=?').run(body.trip, body.place, body.voter);
      else {
        if (db.prepare('SELECT COUNT(*) n FROM votes WHERE trip=?').get(body.trip).n >= 2000) fail(429,'이 일정의 투표가 너무 많습니다.');
        db.prepare('INSERT INTO votes VALUES(?,?,?,?,?) ON CONFLICT(trip,place,voter) DO UPDATE SET vote=excluded.vote, at=excluded.at').run(body.trip, body.place, body.voter, body.vote, new Date().toISOString());
      }
      return this.votes(body.trip, body.voter);
    },
    votes(trip, voter = '') {
      if (typeof trip !== 'string' || !/^[a-z0-9]{8,16}$/.test(trip)) fail(400,'일정 키를 확인하세요.');
      const places = {};
      for (const r of db.prepare('SELECT place, vote, voter FROM votes WHERE trip=?').all(trip)) {
        const v = (places[r.place] ??= { up: 0, down: 0, mine: 0 });
        if (r.vote > 0) v.up++; else v.down++;
        if (voter && r.voter === voter) v.mine = r.vote;
      }
      return { trip, places };
    }
  };
}
