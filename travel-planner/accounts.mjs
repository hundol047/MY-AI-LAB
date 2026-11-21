// 계정 (선택 기능, 앱 서버가 있을 때만): 가입·로그인·로그아웃·저장한 일정 동기화·비밀번호 바꾸기·복구·탈퇴.
// 종단간 암호화(public/account-crypto.js): 서버는 비밀번호를 받지 않고 '확인값(auth)'만 받으며, 그것도 scrypt로 다시 감싸 저장한다.
// 저장한 일정·설정은 기기에서 암호화된 채로만 오가므로 운영자도 내용을 볼 수 없다. 서버가 아는 것은 이메일과 가입·수정 시각뿐이다.
// 세션: 무작위 토큰을 HttpOnly·SameSite=Strict 쿠키로 주고, 서버에는 토큰의 SHA-256만 저장한다 (30일).
// 남용 막기: 한 IP는 1분에 20번, 한 이메일은 로그인 10번 틀리면 15분 잠금. 없는 이메일도 같은 시간이 걸리게 한다.
// 이메일도 그대로 저장하지 않는다: 찾기용 HMAC 색인 + AES-256-GCM 암호문(pii.mjs). 데이터베이스만 빼 가서는 누가 가입했는지 알 수 없다.
// 비밀번호 찾기: (1) 복구 코드 — 서버 일정 그대로, (2) 메일 링크(SMTP 설정 시) — 30분·한 번만 쓰는 토큰, 서버 일정은 지우고 그 기기 일정으로 다시 채움(종단간 암호화라 운영자가 풀어 줄 수 없음)
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createPII } from "./pii.mjs";
import { createMailer, resetMail, codeMail, alreadyMail } from "./mailer.mjs";

const CODE_MIN = 10, CODE_TRIES = 5, CODE_PER_HOUR = 3, TICKET_MIN = 30;
const SESSION_DAYS = 30, MAX_VAULT = 400_000, LOCK_FAILS = 10, LOCK_MIN = 15, RESET_MIN = 30, RESET_PER_HOUR = 3;
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const HEX64 = /^[0-9a-f]{64}$/, WRAP = /^[A-Za-z0-9+/=]{16,24}\.[A-Za-z0-9+/=]{40,80}$/, SEALED = /^[A-Za-z0-9+/=]{16,24}\.[A-Za-z0-9+/=]{20,}$/;
const normEmail = (e) => String(e || "").trim().toLowerCase();
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const fail = (status, error) => Object.assign(new Error(error), { status });
function hashAuth(auth, salt = randomBytes(16)) { return `${salt.toString("hex")}:${scryptSync(auth, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex")}`; }
function checkAuth(auth, stored) {
  const [salt, h] = String(stored || `${"0".repeat(32)}:${"0".repeat(64)}`).split(":");
  const got = scryptSync(String(auth), Buffer.from(salt, "hex"), 32, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(got, Buffer.from(h, "hex")) && !!stored;
}

export function createAccounts(file, { now = () => Date.now(), pii = createPII(), mailer = null, appUrl = "" } = {}) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, emailIdx TEXT UNIQUE NOT NULL, emailEnc TEXT NOT NULL, verifier TEXT NOT NULL, wrapped TEXT NOT NULL,
      rverifier TEXT NOT NULL, rwrapped TEXT NOT NULL, vault TEXT, version INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      fails INTEGER NOT NULL DEFAULT 0, lockUntil INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, account TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account);
    CREATE TABLE IF NOT EXISTS reset_tokens(hash TEXT PRIMARY KEY, account TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS verify_codes(emailIdx TEXT NOT NULL, purpose TEXT NOT NULL, codeHash TEXT NOT NULL, expires INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(emailIdx, purpose));
    CREATE TABLE IF NOT EXISTS verify_sends(emailIdx TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS verify_tickets(hash TEXT PRIMARY KEY, emailIdx TEXT NOT NULL, expires INTEGER NOT NULL);`);
  // 이메일 확인 여부 칸 (예전 데이터베이스에도 붙인다)
  if (!db.prepare("PRAGMA table_info(accounts)").all().some((c) => c.name === "verified")) db.exec("ALTER TABLE accounts ADD COLUMN verified INTEGER NOT NULL DEFAULT 0");
  const idx = (email) => pii.index(`email:${normEmail(email)}`);
  const q = {
    byEmailIdx: db.prepare("SELECT * FROM accounts WHERE emailIdx=?"),
    byId: db.prepare("SELECT * FROM accounts WHERE id=?"),
    insert: db.prepare("INSERT INTO accounts(id,emailIdx,emailEnc,verifier,wrapped,rverifier,rwrapped,vault,version,created,updated,verified) VALUES(?,?,?,?,?,?,?,NULL,0,?,?,?)"),
    setVerified: db.prepare("UPDATE accounts SET verified=1 WHERE id=?"),
    putCode: db.prepare("INSERT INTO verify_codes(emailIdx,purpose,codeHash,expires,tries) VALUES(?,?,?,?,0) ON CONFLICT(emailIdx,purpose) DO UPDATE SET codeHash=excluded.codeHash, expires=excluded.expires, tries=0"),
    getCode: db.prepare("SELECT * FROM verify_codes WHERE emailIdx=? AND purpose=?"),
    tryCode: db.prepare("UPDATE verify_codes SET tries=tries+1 WHERE emailIdx=? AND purpose=?"),
    dropCode: db.prepare("DELETE FROM verify_codes WHERE emailIdx=? AND purpose=?"),
    sent: db.prepare("INSERT INTO verify_sends(emailIdx,at) VALUES(?,?)"),
    sentSince: db.prepare("SELECT count(*) n FROM verify_sends WHERE emailIdx=? AND at>?"),
    newTicket: db.prepare("INSERT INTO verify_tickets(hash,emailIdx,expires) VALUES(?,?,?)"),
    ticket: db.prepare("SELECT * FROM verify_tickets WHERE hash=? AND expires>?"),
    dropTicket: db.prepare("DELETE FROM verify_tickets WHERE hash=?"),
    purgeVerify: db.prepare("DELETE FROM verify_codes WHERE expires<=?"),
    purgeSends: db.prepare("DELETE FROM verify_sends WHERE at<=?"),
    purgeTickets: db.prepare("DELETE FROM verify_tickets WHERE expires<=?"),
    reset: db.prepare("UPDATE accounts SET verifier=?, wrapped=?, rverifier=?, rwrapped=?, vault=NULL, version=version+1, updated=?, fails=0, lockUntil=0 WHERE id=?"),
    newToken: db.prepare("INSERT INTO reset_tokens(hash,account,expires,created) VALUES(?,?,?,?)"),
    token: db.prepare("SELECT * FROM reset_tokens WHERE hash=? AND used=0 AND expires>?"),
    tokensSince: db.prepare("SELECT count(*) n FROM reset_tokens WHERE account=? AND created>?"),
    useTokens: db.prepare("UPDATE reset_tokens SET used=1 WHERE account=?"),
    purgeTokens: db.prepare("DELETE FROM reset_tokens WHERE expires<=?"),
    dropTokens: db.prepare("DELETE FROM reset_tokens WHERE account=?"),
    fails: db.prepare("UPDATE accounts SET fails=?, lockUntil=? WHERE id=?"),
    newSession: db.prepare("INSERT INTO sessions(hash,account,expires) VALUES(?,?,?)"),
    session: db.prepare("SELECT account FROM sessions WHERE hash=? AND expires>?"),
    dropSession: db.prepare("DELETE FROM sessions WHERE hash=?"),
    dropSessions: db.prepare("DELETE FROM sessions WHERE account=?"),
    purgeSessions: db.prepare("DELETE FROM sessions WHERE expires<=?"),
    vault: db.prepare("UPDATE accounts SET vault=?, version=version+1, updated=? WHERE id=? AND version=?"),
    password: db.prepare("UPDATE accounts SET verifier=?, wrapped=?, updated=? WHERE id=?"),
    remove: db.prepare("DELETE FROM accounts WHERE id=?"),
  };
  const session = (id) => { const token = randomBytes(32).toString("base64url"); q.newSession.run(sha(token), id, now() + SESSION_DAYS * 864e5); return token; };
  const byEmail = (email) => q.byEmailIdx.get(idx(email));
  const mailOn = () => !!(mailer && appUrl);
  // 확인 코드: 6자리, 10분, 5번 틀리면 끝, 한 이메일에 한 시간 3번까지 보냄. 코드는 이메일 색인과 섞은 SHA-256만 저장
  const codeHash = (ei, code) => sha(`${ei}:${code}`);
  function sendCode(ei, purpose, to, lang) {
    if (q.sentSince.get(ei, now() - 3600e3).n >= CODE_PER_HOUR) throw fail(429, "확인 코드를 너무 자주 요청했어요. 한 시간 뒤에 다시 해 주세요.");
    const code = String(100000 + (randomBytes(4).readUInt32BE() % 900000));
    q.putCode.run(ei, purpose, codeHash(ei, code), now() + CODE_MIN * 6e4); q.sent.run(ei, now());
    const mail = codeMail(lang, code);
    return () => mailer.send({ to, ...mail }).catch(() => console.error("이메일 확인 코드를 보내지 못했습니다 (SMTP 설정 확인)"));
  }
  function checkCode(ei, purpose, code) {
    const r = q.getCode.get(ei, purpose);
    if (!r || r.expires <= now() || r.tries >= CODE_TRIES) throw fail(400, "코드가 만료됐거나 여러 번 틀렸어요. 새 코드를 받아 주세요.");
    const ok = /^\d{6}$/.test(String(code || "")) && timingSafeEqual(Buffer.from(codeHash(ei, String(code))), Buffer.from(r.codeHash));
    if (!ok) { q.tryCode.run(ei, purpose); throw fail(400, `코드가 맞지 않아요 (남은 횟수 ${CODE_TRIES - r.tries - 1}번)`); }
    q.dropCode.run(ei, purpose);
  }
  const view = (a) => ({ email: pii.open(a.emailEnc), verified: !!a.verified, wrapped: a.wrapped, vault: a.vault, version: a.version, updated: a.updated });
  function verify(a, auth, field = "verifier") {
    if (a && a.lockUntil > now()) throw fail(429, `로그인을 여러 번 틀려 ${LOCK_MIN}분 동안 잠겼어요.`);
    const ok = checkAuth(String(auth || ""), a?.[field]); // 없는 계정도 같은 계산을 한다
    if (!a || !ok) {
      if (a) { const f = a.fails + 1; q.fails.run(f >= LOCK_FAILS ? 0 : f, f >= LOCK_FAILS ? now() + LOCK_MIN * 6e4 : 0, a.id); }
      throw fail(401, "이메일 또는 비밀번호가 맞지 않아요.");
    }
    if (a.fails) q.fails.run(0, 0, a.id);
  }
  const need = (b, k, re) => { if (typeof b[k] !== "string" || !re.test(b[k])) throw fail(400, "요청 내용을 확인하세요."); return b[k]; };
  return {
    db,
    signup(b) {
      const email = normEmail(b.email);
      if (!validEmail(email)) throw fail(400, "이메일 주소를 확인하세요.");
      const auth = need(b, "auth", HEX64), wrapped = need(b, "wrapped", WRAP), rauth = need(b, "recoveryAuth", HEX64), rwrapped = need(b, "recoveryWrapped", WRAP);
      if (byEmail(email)) throw fail(409, "이미 가입한 이메일이에요. 로그인해 주세요.");
      // 메일을 보낼 수 있는 서버에서는 이메일 확인(확인 코드 → 30분짜리 가입표)을 거쳐야 가입된다
      let verified = 0;
      if (mailOn()) {
        const tk = typeof b.ticket === "string" && q.ticket.get(sha(b.ticket), now());
        if (!tk || tk.emailIdx !== idx(email)) throw fail(403, "이메일 확인을 먼저 해 주세요.");
        q.dropTicket.run(sha(b.ticket)); verified = 1;
      }
      const id = randomBytes(12).toString("hex"), t = now();
      q.insert.run(id, idx(email), pii.seal(email), hashAuth(auth), wrapped, hashAuth(rauth), rwrapped, t, t, verified);
      return { token: session(id), account: view(q.byId.get(id)) };
    },
    login(b) {
      const a = byEmail(b.email);
      verify(a, b.auth);
      return { token: session(a.id), account: view(a) };
    },
    who(token) {
      if (!token) return null;
      const s = q.session.get(sha(token), now());
      return s ? q.byId.get(s.account) || null : null;
    },
    me(a) { return view(a); },
    logout(token) { if (token) q.dropSession.run(sha(token)); },
    saveVault(a, b) {
      const vault = need(b, "vault", SEALED);
      if (vault.length > MAX_VAULT) throw fail(413, "저장한 일정이 너무 많아요.");
      if (!Number.isInteger(b.version)) throw fail(400, "요청 내용을 확인하세요.");
      if (q.vault.run(vault, now(), a.id, b.version).changes !== 1) throw fail(409, "다른 기기에서 먼저 바뀌었어요. 다시 받아 합칠게요.");
      return { version: b.version + 1 };
    },
    changePassword(a, b) {
      verify(a, b.auth);
      q.password.run(hashAuth(need(b, "newAuth", HEX64)), need(b, "newWrapped", WRAP), now(), a.id);
      q.dropSessions.run(a.id); // 다른 기기는 모두 로그아웃
      return { token: session(a.id) };
    },
    // 복구 1단계: 복구 코드 확인값이 맞으면 '복구 코드로 감싼 자료 키'를 준다
    recoverStart(b) {
      const a = byEmail(b.email);
      verify(a, b.recoveryAuth, "rverifier");
      return { recoveryWrapped: a.rwrapped };
    },
    // 복구 2단계: 새 비밀번호로 감싼 자료 키를 저장하고 모든 기기를 로그아웃한 뒤 새로 로그인
    recoverFinish(b) {
      const a = byEmail(b.email);
      verify(a, b.recoveryAuth, "rverifier");
      q.password.run(hashAuth(need(b, "newAuth", HEX64)), need(b, "newWrapped", WRAP), now(), a.id);
      q.dropSessions.run(a.id);
      return { token: session(a.id), account: view(q.byId.get(a.id)) };
    },
    // 탈퇴: 비밀번호 확인 후 계정·금고·세션을 바로 지운다 (되돌릴 수 없음)
    remove(a, b) {
      verify(a, b.auth);
      q.dropSessions.run(a.id); q.dropTokens.run(a.id); q.remove.run(a.id);
      return { deleted: true };
    },
    purge() { q.purgeSessions.run(now()); q.purgeTokens.run(now()); q.purgeVerify.run(now()); q.purgeSends.run(now() - 3600e3); q.purgeTickets.run(now()); },
    config: () => ({ mailReset: mailOn(), verifyEmail: mailOn() }),
    // 가입 전 이메일 확인 1단계: 코드 보내기. 이미 가입한 이메일이면 코드 대신 안내 메일 (화면 응답은 같다)
    verifyStart(b) {
      const email = normEmail(b.email);
      if (!validEmail(email)) throw fail(400, "이메일 주소를 확인하세요.");
      if (!mailOn()) throw fail(503, "이 서버는 이메일 확인을 쓰지 않아요.");
      const ei = idx(email), lang = ["ko", "en", "ja", "zh"].includes(b.lang) ? b.lang : "ko";
      if (byEmail(email)) {
        if (q.sentSince.get(ei, now() - 3600e3).n >= CODE_PER_HOUR) throw fail(429, "확인 코드를 너무 자주 요청했어요. 한 시간 뒤에 다시 해 주세요.");
        q.sent.run(ei, now());
        const mail = alreadyMail(lang);
        return { sent: true, job: () => mailer.send({ to: email, ...mail }).catch(() => console.error("안내 메일을 보내지 못했습니다 (SMTP 설정 확인)")) };
      }
      return { sent: true, job: sendCode(ei, "signup", email, lang) };
    },
    // 2단계: 코드가 맞으면 30분짜리 가입표(ticket)를 준다 → signup에 함께 보낸다
    verifyCheck(b) {
      const email = normEmail(b.email), ei = idx(email);
      checkCode(ei, "signup", b.code);
      const ticket = randomBytes(32).toString("base64url");
      q.newTicket.run(sha(ticket), ei, now() + TICKET_MIN * 6e4);
      return { ticket };
    },
    // 로그인한 뒤 이메일 확인 (메일 설정 전에 가입한 계정)
    verifyMeStart(a, b) {
      if (!mailOn()) throw fail(503, "이 서버는 이메일 확인을 쓰지 않아요.");
      if (a.verified) return { sent: true, job: null };
      return { sent: true, job: sendCode(a.emailIdx, "me", pii.open(a.emailEnc), ["ko", "en", "ja", "zh"].includes(b.lang) ? b.lang : "ko") };
    },
    verifyMeCheck(a, b) { checkCode(a.emailIdx, "me", b.code); q.setVerified.run(a.id); return { verified: true }; },
    // 메일로 비밀번호 찾기 1단계: 있든 없든 같은 응답. 있으면 30분짜리 링크를 보낸다(한 시간에 3번까지). 메일은 응답 뒤에 보내 걸리는 시간으로도 알 수 없게
    resetRequest(b) {
      const email = normEmail(b.email);
      if (!validEmail(email)) throw fail(400, "이메일 주소를 확인하세요.");
      if (!mailer || !appUrl) throw fail(503, "메일로 비밀번호 찾기를 쓸 수 없어요. 복구 코드를 써 주세요.");
      const a = byEmail(email);
      if (!a || q.tokensSince.get(a.id, now() - 3600e3).n >= RESET_PER_HOUR) return { sent: true, job: null };
      const token = randomBytes(32).toString("base64url");
      q.newToken.run(sha(token), a.id, now() + RESET_MIN * 6e4, now());
      const link = `${appUrl.replace(/\/+$/, "")}/account.html#reset=${token}`;
      const mail = resetMail(["ko", "en", "ja", "zh"].includes(b.lang) ? b.lang : "ko", link);
      const job = () => mailer.send({ to: pii.open(a.emailEnc), ...mail }).catch(() => console.error("비밀번호 재설정 메일을 보내지 못했습니다 (SMTP 설정 확인)"));
      return { sent: true, job };
    },
    // 2단계: 링크의 토큰이 살아 있으면 이메일을 알려 준다 (새 키를 만들 때 이메일이 소금으로 쓰인다)
    resetCheck(b) {
      const r = typeof b.token === "string" && q.token.get(sha(b.token), now());
      if (!r) throw fail(400, "링크가 만료됐거나 이미 썼어요. 다시 요청해 주세요.");
      return { email: pii.open(q.byId.get(r.account).emailEnc) };
    },
    // 3단계: 새 비밀번호·새 복구 코드로 바꾸고, 열 수 없게 된 서버 금고는 비운다. 모든 기기 로그아웃 후 이 기기만 로그인
    resetFinish(b) {
      const r = typeof b.token === "string" && q.token.get(sha(b.token), now());
      if (!r) throw fail(400, "링크가 만료됐거나 이미 썼어요. 다시 요청해 주세요.");
      q.reset.run(hashAuth(need(b, "newAuth", HEX64)), need(b, "newWrapped", WRAP), hashAuth(need(b, "recoveryAuth", HEX64)), need(b, "recoveryWrapped", WRAP), now(), r.account);
      q.useTokens.run(r.account); q.dropSessions.run(r.account); q.setVerified.run(r.account); // 메일 링크를 열었으니 이메일도 확인된 것
      return { token: session(r.account), account: view(q.byId.get(r.account)) };
    },
  };
}

// ---------- HTTP: /api/account/... ----------
const COOKIE = "bopok_s";
export function accountRoutes({ file, mailer = createMailer(), appUrl = process.env.PUBLIC_APP_URL || "" }) {
  const acc = createAccounts(file, { mailer, appUrl });
  const hits = new Map();
  setInterval(() => acc.purge(), 6 * 3600e3).unref?.();
  const reply = (res, status, data, headers = {}) => res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }).end(JSON.stringify(data));
  const cookieOf = (req) => (String(req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{20,100})`)) || [])[1] || "";
  const secure = (req) => req.socket.encrypted || String(req.headers["x-forwarded-proto"] || "").split(",")[0] === "https";
  const setCookie = (req, token) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? SESSION_DAYS * 86400 : 0}${secure(req) ? "; Secure" : ""}`;
  async function body(req) {
    if (!String(req.headers["content-type"] || "").startsWith("application/json")) throw fail(415, "JSON 요청이 필요합니다.");
    let text = ""; for await (const c of req) { text += c; if (text.length > MAX_VAULT + 2000) throw fail(413, "요청이 너무 큽니다."); }
    try { const b = JSON.parse(text); if (!b || typeof b !== "object" || Array.isArray(b)) throw 0; return b; } catch { throw fail(400, "요청 내용을 확인하세요."); }
  }
  return async function handleAccount(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith("/api/account")) return false;
    try {
      // 다른 사이트에서 보낸 요청은 막는다 (쿠키가 SameSite=Strict이지만 한 번 더)
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) throw fail(403, "다른 사이트의 요청은 허용하지 않습니다.");
      if (req.method !== "GET") {
        const t = Date.now(), ip = req.socket.remoteAddress || "?", h = (hits.get(ip) || []).filter((x) => t - x < 60e3);
        if (h.length >= 20) throw fail(429, "요청이 많아요. 잠시 후 다시 시도하세요.");
        h.push(t); hits.set(ip, h);
        if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < 60e3)) hits.delete(k);
      }
      const token = cookieOf(req), me = acc.who(token);
      const M = `${req.method} ${p}`;
      if (M === "POST /api/account/signup") { const r = acc.signup(await body(req)); return reply(res, 201, r.account, { "set-cookie": setCookie(req, r.token) }), true; }
      if (M === "POST /api/account/login") { const r = acc.login(await body(req)); return reply(res, 200, r.account, { "set-cookie": setCookie(req, r.token) }), true; }
      if (M === "GET /api/account/config") return reply(res, 200, acc.config()), true;
      if (M === "POST /api/account/verify/start") { const r = acc.verifyStart(await body(req)); reply(res, 200, { sent: true }); r.job?.(); return true; }
      if (M === "POST /api/account/verify/check") return reply(res, 200, acc.verifyCheck(await body(req))), true;
      if (M === "POST /api/account/reset/request") { const r = acc.resetRequest(await body(req)); reply(res, 200, { sent: true }); r.job?.(); return true; }
      if (M === "POST /api/account/reset/check") return reply(res, 200, acc.resetCheck(await body(req))), true;
      if (M === "POST /api/account/reset/finish") { const r = acc.resetFinish(await body(req)); return reply(res, 200, r.account, { "set-cookie": setCookie(req, r.token) }), true; }
      if (M === "POST /api/account/recover/start") return reply(res, 200, acc.recoverStart(await body(req))), true;
      if (M === "POST /api/account/recover/finish") { const r = acc.recoverFinish(await body(req)); return reply(res, 200, r.account, { "set-cookie": setCookie(req, r.token) }), true; }
      if (M === "POST /api/account/logout") { acc.logout(token); return reply(res, 200, { ok: true }, { "set-cookie": setCookie(req, "") }), true; }
      if (!me) throw fail(401, "로그인이 필요해요.");
      if (M === "GET /api/account/me") return reply(res, 200, acc.me(me)), true;
      if (M === "POST /api/account/verify/me/start") { const r = acc.verifyMeStart(me, await body(req)); reply(res, 200, { sent: true }); r.job?.(); return true; }
      if (M === "POST /api/account/verify/me/check") return reply(res, 200, acc.verifyMeCheck(me, await body(req))), true;
      if (M === "PUT /api/account/vault") return reply(res, 200, acc.saveVault(me, await body(req))), true;
      if (M === "POST /api/account/password") { const r = acc.changePassword(me, await body(req)); return reply(res, 200, { ok: true }, { "set-cookie": setCookie(req, r.token) }), true; }
      if (M === "POST /api/account/delete") { acc.remove(me, await body(req)); return reply(res, 200, { deleted: true }, { "set-cookie": setCookie(req, "") }), true; }
      throw fail(404, "경로를 찾지 못했습니다.");
    } catch (e) {
      if (!e.status) console.error("계정 처리 오류:", e.message);
      return reply(res, e.status || 500, { error: e.status ? e.message : "잠시 후 다시 시도하세요." }), true;
    }
  };
}
