// 계정: 종단간 암호화(서버는 비밀번호·일정 내용을 모름), 가입·로그인·잠금·동기화 충돌·비밀번호 변경·복구·탈퇴, HTTP 쿠키·출처 검사
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { createAccounts, accountRoutes } from "../accounts.mjs";
import * as C from "../public/account-crypto.js";
import { createPII } from "../pii.mjs";
const pii = createPII({ secret: "test-secret-".repeat(4), quiet: true });
const mails = [];
const mailer = { send: async (m) => { mails.push(m); } };

const dir = mkdtempSync(path.join(tmpdir(), "acc-"));
const FAST = { iter: 2000, recIter: 1000 }; // 시험에서는 반복 횟수를 줄인다
try {
  // ---------- 암호화 ----------
  assert.equal(C.passwordProblem("short"), "short");
  assert.equal(C.passwordProblem("password123456"), "weak");
  assert.equal(C.passwordProblem("aaaaaaaaaaaa"), "weak");
  assert.equal(C.passwordProblem("hongildong99!", "hongildong@x.kr"), "weak", "이메일 아이디가 들어간 비밀번호");
  assert.equal(C.passwordProblem("강릉 바다 보러 가요 2026"), null);
  assert.ok(C.validEmail(" Me@Example.com ") && !C.validEmail("me@x") && !C.validEmail("a b@x.kr"));
  const code = C.newRecoveryCode();
  assert.match(code, /^([A-HJ-NP-Z2-9]{4}-){5}[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(C.cleanCode(code.toLowerCase().replace(/-/g, " ")), code.replace(/-/g, ""));
  const k1 = await C.passwordKeys("Me@Example.com", "강릉 바다 보러 가요 2026", 2000), k2 = await C.passwordKeys("me@example.com ", "강릉 바다 보러 가요 2026", 2000);
  assert.equal(k1.auth, k2.auth, "이메일 대소문자·공백은 같은 키");
  assert.notEqual(k1.auth, (await C.passwordKeys("me@example.com", "강릉 바다 보러 가요 2027", 2000)).auth);
  const dk = await C.newDataKey(), wrapped = await C.wrapKey(dk, k1.wrap);
  const dk2 = await C.unwrapKey(wrapped, k2.wrap);
  const sealed = await C.sealJSON(dk, { saved: [{ id: "a", title: "경포" }] });
  assert.deepEqual(await C.openJSON(dk2, sealed), { saved: [{ id: "a", title: "경포" }] });
  assert.equal(sealed.includes("경포"), false);
  await assert.rejects(C.unwrapKey(wrapped, (await C.passwordKeys("me@example.com", "다른 비밀번호입니다!!", 2000)).wrap), "틀린 비밀번호로는 못 연다");
  await assert.rejects(C.openJSON(dk, sealed.replace(/.$/, (c) => (c === "A" ? "B" : "A"))), "고친 암호문은 거부");
  const locked = await C.unwrapKey(wrapped, k1.wrap, false);
  await assert.rejects(globalThis.crypto.subtle.exportKey("raw", locked), "기기에 둔 키는 꺼낼 수 없다");
  // 금고 합치기
  const m = C.mergeVault({ saved: [{ id: "a", savedAt: 1 }, { id: "b", savedAt: 5 }], settings: { theme: "dark" }, settingsAt: 10 }, { saved: [{ id: "a", savedAt: 3, v: 2 }, { id: "c", savedAt: 2 }], tomb: { b: Date.now() }, settings: { theme: "light" }, settingsAt: 5 });
  assert.deepEqual(m.saved.map((x) => x.id), ["a", "c"]); assert.equal(m.saved[0].v, 2, "더 최근 저장이 이김"); assert.equal(m.settings.theme, "dark");

  // ---------- 서버 저장소 ----------
  let t = 1_700_000_000_000;
  const acc = createAccounts(path.join(dir, "a.sqlite"), { now: () => t, pii, mailer, appUrl: "https://bopok.example/" });
  const pw = "강릉 바다 보러 가요 2026", email = "Me@Example.com";
  const sign = await C.prepareSignup(email, pw, FAST);
  assert.equal(JSON.stringify(sign.send).includes(pw), false, "비밀번호는 서버로 가지 않는다");
  const s1 = acc.signup(sign.send);
  assert.ok(s1.token.length > 30 && s1.account.email === "me@example.com");
  assert.throws(() => acc.signup(sign.send), { status: 409 });
  assert.throws(() => acc.signup({ ...sign.send, email: "x@y.kr", auth: "nothex" }), { status: 400 });
  // 저장소에는 확인값 원문도, 일정 원문도 없다
  const row = acc.db.prepare("SELECT * FROM accounts").get();
  assert.equal(JSON.stringify(row).toLowerCase().includes("me@example.com"), false, "이메일은 암호화·색인으로만 저장");
  assert.ok(row.emailEnc.startsWith("enc1:") && /^[0-9a-f]{64}$/.test(row.emailIdx));
  assert.ok(!row.verifier.includes(sign.send.auth) && !row.rverifier.includes(sign.send.recoveryAuth));
  assert.equal(acc.db.prepare("SELECT count(*) n FROM sessions WHERE hash=?").get(s1.token).n, 0, "세션 토큰 원문은 저장 안 함");
  // 로그인
  const auth = (await C.passwordKeys(email, pw, FAST.iter)).auth;
  const me = acc.who(acc.login({ email: "me@example.com", auth }).token);
  assert.equal(acc.me(me).email, "me@example.com");
  assert.throws(() => acc.login({ email, auth: "0".repeat(64) }), { status: 401 });
  assert.throws(() => acc.login({ email: "nobody@x.kr", auth }), { status: 401, message: "이메일 또는 비밀번호가 맞지 않아요." }, "없는 이메일도 같은 말");
  // 동기화: 버전이 맞아야 저장, 어긋나면 409
  const v = await C.sealJSON(sign.dataKey, { saved: [{ id: "a" }] });
  assert.deepEqual(acc.saveVault(me, { vault: v, version: 0 }), { version: 1 });
  assert.throws(() => acc.saveVault(me, { vault: v, version: 0 }), { status: 409 });
  assert.equal(acc.me(acc.who(s1.token)).vault, v);
  // 잠금: 10번 틀리면 15분
  for (let i = 0; i < 8; i++) assert.throws(() => acc.login({ email, auth: "1".repeat(64) }), { status: 401 }); // 앞에서 1번 틀림 → 모두 10번
  assert.throws(() => acc.login({ email, auth: "1".repeat(64) }), { status: 401 });
  assert.throws(() => acc.login({ email, auth }), { status: 429 }, "잠긴 동안은 맞아도 안 됨");
  t += 16 * 6e4;
  const s2 = acc.login({ email, auth });
  // 비밀번호 바꾸기: 다른 세션은 끊긴다
  const pw2 = "속초 설악산 단풍 구경 2027";
  const k3 = await C.passwordKeys(email, pw2, FAST.iter);
  const ch = acc.changePassword(acc.who(s2.token), { auth, newAuth: k3.auth, newWrapped: await C.wrapKey(sign.dataKey.extractable ? sign.dataKey : await C.unwrapKey(sign.send.wrapped, (await C.passwordKeys(email, pw, FAST.iter)).wrap, true), k3.wrap) });
  assert.equal(acc.who(s1.token), null, "다른 기기 로그아웃"); assert.ok(acc.who(ch.token));
  assert.throws(() => acc.login({ email, auth }), { status: 401 }, "옛 비밀번호는 안 됨");
  // 복구: 복구 코드로 자료 키를 되찾고 새 비밀번호를 정한다 → 금고가 그대로 열린다
  const rk = await C.recoveryKeys(email, sign.recoveryCode.toLowerCase(), FAST.recIter);
  const { recoveryWrapped } = acc.recoverStart({ email, recoveryAuth: rk.auth });
  const back = await C.unwrapKey(recoveryWrapped, rk.wrap, true);
  const pw3 = "평창 대관령 양떼목장 2028", k4 = await C.passwordKeys(email, pw3, FAST.iter);
  const rf = acc.recoverFinish({ email, recoveryAuth: rk.auth, newAuth: k4.auth, newWrapped: await C.wrapKey(back, k4.wrap) });
  const after = acc.me(acc.who(rf.token));
  assert.deepEqual(await C.openJSON(await C.unwrapKey(after.wrapped, k4.wrap), after.vault), { saved: [{ id: "a" }] });
  assert.throws(() => acc.recoverStart({ email, recoveryAuth: "2".repeat(64) }), { status: 401 });
  // 메일로 비밀번호 찾기: 없는 이메일도 같은 응답, 링크는 PUBLIC_APP_URL로, 30분·한 번만, 한 시간 3번까지, 서버 금고는 비움
  assert.deepEqual(acc.config(), { mailReset: true });
  const none = acc.resetRequest({ email: "nobody@x.kr" }); assert.equal(none.sent, true); assert.equal(none.job, null);
  const rq = acc.resetRequest({ email: "ME@example.com", lang: "en" }); await rq.job();
  assert.equal(mails.length, 1); assert.equal(mails[0].to, "me@example.com"); assert.match(mails[0].subject, /Reset/);
  const link = mails[0].text.match(/https:\/\/bopok\.example\/account\.html#reset=([A-Za-z0-9_-]+)/); assert.ok(link, "링크 주소");
  const resetTok = link[1];
  assert.equal(acc.db.prepare("SELECT count(*) n FROM reset_tokens WHERE hash=?").get(resetTok).n, 0, "토큰 원문은 저장 안 함");
  assert.deepEqual(acc.resetCheck({ token: resetTok }), { email: "me@example.com" });
  const pw5 = "정선 아리랑 시장 구경 2029", k5 = await C.passwordKeys(email, pw5, FAST.iter), code5 = C.newRecoveryCode(), r5 = await C.recoveryKeys(email, code5, FAST.recIter), dk5 = await C.newDataKey();
  const fin = acc.resetFinish({ token: resetTok, newAuth: k5.auth, newWrapped: await C.wrapKey(dk5, k5.wrap), recoveryAuth: r5.auth, recoveryWrapped: await C.wrapKey(dk5, r5.wrap) });
  assert.equal(fin.account.vault, null, "열 수 없게 된 금고는 비움"); assert.equal(acc.who(rf.token), null, "다른 기기 로그아웃");
  assert.throws(() => acc.resetCheck({ token: resetTok }), { status: 400 }, "한 번만");
  assert.throws(() => acc.login({ email, auth: k4.auth }), { status: 401 }); acc.login({ email, auth: k5.auth });
  acc.recoverStart({ email, recoveryAuth: r5.auth }); // 새 복구 코드가 살아 있음
  for (let i = 0; i < 3; i++) acc.resetRequest({ email });
  assert.equal(acc.resetRequest({ email }).job, null, "한 시간에 3번까지");
  const tk = acc.db.prepare("SELECT hash FROM reset_tokens WHERE used=0 LIMIT 1").get(); assert.ok(tk);
  t += 31 * 6e4; assert.equal(acc.db.prepare("SELECT count(*) n FROM reset_tokens WHERE used=0 AND expires>?").get(t).n, 0, "30분 뒤 만료"); t -= 31 * 6e4;
  const noMail = createAccounts(path.join(dir, "b.sqlite"), { pii }); assert.deepEqual(noMail.config(), { mailReset: false });
  assert.throws(() => noMail.resetRequest({ email }), { status: 503 });
  const rf2 = { token: acc.login({ email, auth: k5.auth }).token };
  // 세션 만료
  t += 31 * 864e5; assert.equal(acc.who(rf2.token), null); t -= 31 * 864e5;
  // 탈퇴: 비밀번호 확인 후 모두 지움
  assert.throws(() => acc.remove(acc.who(rf2.token), { auth: "3".repeat(64) }), { status: 401 });
  acc.remove(acc.who(rf2.token), { auth: k5.auth });
  assert.equal(acc.db.prepare("SELECT count(*) n FROM reset_tokens").get().n, 0);
  assert.equal(acc.db.prepare("SELECT count(*) n FROM accounts").get().n, 0);
  assert.equal(acc.db.prepare("SELECT count(*) n FROM sessions").get().n, 0);

  // ---------- HTTP ----------
  const handle = accountRoutes({ file: path.join(dir, "h.sqlite"), mailer, appUrl: "https://bopok.example" });
  const srv = http.createServer(async (req, res) => { if (!(await handle(req, res, new URL(req.url, "http://x")))) res.writeHead(404).end(); });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = "";
  const call = async (method, p, b, extra = {}) => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extra }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0]; return { status: r.status, sc, j: await r.json() }; };
  const s = await C.prepareSignup("web@x.kr", pw, FAST);
  const r1 = await call("POST", "/api/account/signup", s.send);
  assert.equal(r1.status, 201); assert.match(r1.sc, /HttpOnly; SameSite=Strict/); assert.doesNotMatch(r1.sc, /Secure/, "http에서는 Secure 없이");
  assert.equal((await call("GET", "/api/account/me")).j.email, "web@x.kr");
  assert.equal((await call("POST", "/api/account/login", { email: "web@x.kr", auth: "0".repeat(64) }, { origin: "https://evil.example" })).status, 403, "다른 사이트 요청 막기");
  assert.equal((await call("POST", "/api/account/logout")).status, 200);
  assert.equal((await call("GET", "/api/account/me")).status, 401);
  const r2 = await call("POST", "/api/account/login", { email: "web@x.kr", auth: (await C.passwordKeys("web@x.kr", pw, FAST.iter)).auth }, { "x-forwarded-proto": "https" });
  assert.equal(r2.status, 200); assert.match(r2.sc, /Secure/, "https 뒤에서는 Secure");
  assert.deepEqual((await call("GET", "/api/account/config")).j, { mailReset: true });
  const before = mails.length; assert.deepEqual((await call("POST", "/api/account/reset/request", { email: "web@x.kr", lang: "ja" }, { host: "evil.example" })).j, { sent: true });
  await new Promise((r) => setTimeout(r, 50)); assert.equal(mails.length, before + 1); assert.match(mails.at(-1).text, /^.*\n\nhttps:\/\/bopok\.example\/account/s, "Host 머리글이 아니라 설정 주소로");
  assert.equal((await call("POST", "/api/account/delete", { auth: (await C.passwordKeys("web@x.kr", pw, FAST.iter)).auth })).j.deleted, true);
  srv.close();
  console.log("ok - 계정 (종단간 암호화·가입·로그인·잠금·동기화 충돌·비밀번호 변경·복구 코드·탈퇴·쿠키·출처 검사)");
} finally { rmSync(dir, { recursive: true, force: true }); }
