// 계정 (선택 기능, 앱 서버가 있을 때만): 가입·로그인·로그아웃·저장한 일정 동기화·비밀번호 바꾸기·복구·탈퇴.
// 종단간 암호화(public/account-crypto.js): 서버는 비밀번호를 받지 않고 '확인값(auth)'만 받으며, 그것도 scrypt로 다시 감싸 저장한다.
// 저장한 일정·설정은 기기에서 암호화된 채로만 오가므로 운영자도 내용을 볼 수 없다. 서버가 아는 것은 이메일과 가입·수정 시각뿐이다.
// 세션: 무작위 토큰을 HttpOnly·SameSite=Strict 쿠키로 주고, 서버에는 토큰의 SHA-256만 저장한다 (30일).
// 남용 막기: 한 IP는 1분에 20번, 한 이메일은 로그인 10번 틀리면 15분 잠금. 없는 이메일도 같은 시간이 걸리게 한다.
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SESSION_DAYS = 30, MAX_VAULT = 400_000, LOCK_FAILS = 10, LOCK_MIN = 15;
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

export function createAccounts(file, now = () => Date.now()) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, verifier TEXT NOT NULL, wrapped TEXT NOT NULL,
      rverifier TEXT NOT NULL, rwrapped TEXT NOT NULL, vault TEXT, version INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      fails INTEGER NOT NULL DEFAULT 0, lockUntil INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, account TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account);`);
  const q = {
    byEmail: db.prepare("SELECT * FROM accounts WHERE email=?"),
    byId: db.prepare("SELECT * FROM accounts WHERE id=?"),
    insert: db.prepare("INSERT INTO accounts(id,email,verifier,wrapped,rverifier,rwrapped,vault,version,created,updated) VALUES(?,?,?,?,?,?,NULL,0,?,?)"),
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
  const view = (a) => ({ email: a.email, wrapped: a.wrapped, vault: a.vault, version: a.version, updated: a.updated });
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
      if (q.byEmail.get(email)) throw fail(409, "이미 가입한 이메일이에요. 로그인해 주세요.");
      const id = randomBytes(12).toString("hex"), t = now();
      q.insert.run(id, email, hashAuth(auth), wrapped, hashAuth(rauth), rwrapped, t, t);
      return { token: session(id), account: view(q.byId.get(id)) };
    },
    login(b) {
      const a = q.byEmail.get(normEmail(b.email));
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
      const a = q.byEmail.get(normEmail(b.email));
      verify(a, b.recoveryAuth, "rverifier");
      return { recoveryWrapped: a.rwrapped };
    },
    // 복구 2단계: 새 비밀번호로 감싼 자료 키를 저장하고 모든 기기를 로그아웃한 뒤 새로 로그인
    recoverFinish(b) {
      const a = q.byEmail.get(normEmail(b.email));
      verify(a, b.recoveryAuth, "rverifier");
      q.password.run(hashAuth(need(b, "newAuth", HEX64)), need(b, "newWrapped", WRAP), now(), a.id);
      q.dropSessions.run(a.id);
      return { token: session(a.id), account: view(q.byId.get(a.id)) };
    },
    // 탈퇴: 비밀번호 확인 후 계정·금고·세션을 바로 지운다 (되돌릴 수 없음)
    remove(a, b) {
      verify(a, b.auth);
      q.dropSessions.run(a.id); q.remove.run(a.id);
      return { deleted: true };
    },
    purge() { q.purgeSessions.run(now()); },
  };
}

// ---------- HTTP: /api/account/... ----------
const COOKIE = "bopok_s";
export function accountRoutes({ file }) {
  const acc = createAccounts(file);
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
      if (M === "POST /api/account/recover/start") return reply(res, 200, acc.recoverStart(await body(req))), true;
      if (M === "POST /api/account/recover/finish") { const r = acc.recoverFinish(await body(req)); return reply(res, 200, r.account, { "set-cookie": setCookie(req, r.token) }), true; }
      if (M === "POST /api/account/logout") { acc.logout(token); return reply(res, 200, { ok: true }, { "set-cookie": setCookie(req, "") }), true; }
      if (!me) throw fail(401, "로그인이 필요해요.");
      if (M === "GET /api/account/me") return reply(res, 200, acc.me(me)), true;
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
