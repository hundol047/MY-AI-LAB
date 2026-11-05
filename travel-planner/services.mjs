import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
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
    CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, review TEXT NOT NULL, reason TEXT NOT NULL, createdAt TEXT NOT NULL);`);
  const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
  function booking(id) {
    const row = db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
    if (!row) fail(404, '신청을 찾을 수 없습니다.');
    return { row, data: JSON.parse(row.payload) };
  }
  const save = b => db.prepare('UPDATE bookings SET payload=? WHERE id=?').run(JSON.stringify(b), b.id);
  const authorize = (row, token) => { if (!equalSecret(row.token, digest(token || ''))) fail(404, '신청번호 또는 조회키를 확인하세요.'); };
  return {
    close: () => db.close(),
    create(body, key, token) {
      if (!/^[a-zA-Z0-9_-]{24,100}$/.test(key || '') || !/^[a-zA-Z0-9_-]{32,100}$/.test(token || '')) fail(400, '신청 식별키가 올바르지 않습니다.');
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
    listBookings() { return db.prepare('SELECT payload FROM bookings ORDER BY rowid DESC LIMIT 200').all().map(r=>JSON.parse(r.payload)); },
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
    listReviews() { return db.prepare('SELECT id,state,payload FROM reviews ORDER BY rowid DESC LIMIT 200').all().map(r=>({...JSON.parse(r.payload),state:r.state})); },
    moderate(id,state) { if (!['published','hidden'].includes(state)) fail(400,'후기 상태가 잘못됐습니다.'); const r=db.prepare('UPDATE reviews SET state=? WHERE id=?').run(state,id); if (!r.changes) fail(404,'후기가 없습니다.'); return {id,state}; },
    report(id,reason) {
      if (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 500) fail(400,'신고 사유를 3~500자로 입력하세요.');
      if (!db.prepare("SELECT id FROM reviews WHERE id=? AND state='published'").get(id)) fail(404,'후기가 없습니다.');
      db.prepare('INSERT INTO reports VALUES(?,?,?,?)').run(randomUUID(),id,reason.trim(),new Date().toISOString()); return {received:true};
    },
    reports() { return db.prepare('SELECT * FROM reports ORDER BY rowid DESC LIMIT 200').all(); }
  };
}
