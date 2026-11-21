// 계정 암호화 (브라우저·Node 공용, WebCrypto): 서버는 비밀번호도, 저장한 일정 내용도 알 수 없다 (종단간 암호화).
//
//  비밀번호 ──PBKDF2(60만 번, 소금=이메일)──▶ 주 키 ──HKDF──┬─ auth  : 로그인 확인용 값 (서버는 이것을 다시 scrypt로 감싸 저장)
//                                                          └─ wrap  : 자료 키를 감싸는 키 (서버로 가지 않음)
//  자료 키(무작위 256비트) ── AES-GCM ──▶ 금고(저장한 일정·설정)   서버에는 '감싼 자료 키'와 '암호화된 금고'만 있다
//  복구 코드(가입 때 한 번 보여 줌)도 같은 방식으로 auth·wrap을 만들어, 비밀번호를 잊었을 때 자료 키를 되찾는다.
//  → 비밀번호와 복구 코드를 둘 다 잃으면 운영자도 금고를 열 수 없다.
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder(), dec = new TextDecoder();
export const ITER = 600000; // OWASP 2023 권장(PBKDF2-SHA256)
export const normEmail = (e) => String(e || "").trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(normEmail(e)) && normEmail(e).length <= 254;
// 비밀번호 규칙: 10자 이상, 너무 흔한 것 금지 (자세한 강도 측정 대신 쉬운 규칙)
const COMMON = /^(password|qwerty|1234567890|0123456789|1q2w3e4r|asdfghjkl|iloveyou|abcdefghij|11111111|00000000)/i;
export function passwordProblem(pw, email = "") {
  const s = String(pw || "");
  if (s.length < 10) return "short";
  if (s.length > 200) return "long";
  if (COMMON.test(s) || /^(.)\1+$/.test(s) || (email && s.toLowerCase().includes(normEmail(email).split("@")[0]) && normEmail(email).split("@")[0].length >= 4)) return "weak";
  return null;
}

export const b64 = (buf) => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = (s) => Uint8Array.from(atob(String(s)), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function master(secret, salt, iter) {
  const k = await subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: iter }, k, 256);
  return subtle.importKey("raw", bits, "HKDF", false, ["deriveBits", "deriveKey"]);
}
async function split(m) {
  const auth = await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("bopok-auth-v1") }, m, 256);
  const wrap = await subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("bopok-wrap-v1") }, m, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
  return { auth: hex(auth), wrap };
}
/** 비밀번호 → { auth(서버로 보내는 확인값), wrap(자료 키를 감싸는 키, 기기 안에만) } */
export async function passwordKeys(email, password, iter = ITER) {
  return split(await master(String(password).normalize("NFKC"), `bopok-v1:${normEmail(email)}`, iter));
}
/** 복구 코드 → { auth, wrap }. 코드는 대소문자·띄어쓰기·하이픈을 무시한다 */
export const cleanCode = (code) => String(code || "").toUpperCase().replace(/[^A-Z2-9]/g, "");
export async function recoveryKeys(email, code, iter = 200000) {
  return split(await master(cleanCode(code), `bopok-recovery-v1:${normEmail(email)}`, iter));
}
// 복구 코드: 헷갈리는 글자(0·O·1·I·L) 뺀 32글자 중 24자 = 약 120비트, 4자씩 하이픈
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newRecoveryCode() {
  const r = globalThis.crypto.getRandomValues(new Uint8Array(24));
  const s = [...r].map((x) => ALPHA[x % ALPHA.length]).join("");
  return s.match(/.{4}/g).join("-");
}
export const newDataKey = () => subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
/** 자료 키를 감싼다 → "iv.ct" (base64) */
export async function wrapKey(dataKey, wrap) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  return `${b64(iv)}.${b64(await subtle.wrapKey("raw", dataKey, wrap, { name: "AES-GCM", iv }))}`;
}
/** 감싼 자료 키를 푼다. extractable=false면 기기에 저장해도 꺼낼 수 없는 키가 된다 */
export async function unwrapKey(wrapped, wrap, extractable = false) {
  const [iv, ct] = String(wrapped).split(".");
  return subtle.unwrapKey("raw", unb64(ct), wrap, { name: "AES-GCM", iv: unb64(iv) }, { name: "AES-GCM", length: 256 }, extractable, ["encrypt", "decrypt"]);
}
const AAD = enc.encode("bopok-vault-v1");
export async function sealJSON(dataKey, obj) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  return `${b64(iv)}.${b64(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, dataKey, enc.encode(JSON.stringify(obj))))}`;
}
export async function openJSON(dataKey, sealed) {
  const [iv, ct] = String(sealed).split(".");
  return JSON.parse(dec.decode(await subtle.decrypt({ name: "AES-GCM", iv: unb64(iv), additionalData: AAD }, dataKey, unb64(ct))));
}

/** 가입 준비: 서버로 보낼 것({email, auth, wrapped, recoveryAuth, recoveryWrapped})과 기기에 둘 것(dataKey, recoveryCode) */
export async function prepareSignup(email, password, opts = {}) {
  const pk = await passwordKeys(email, password, opts.iter), code = newRecoveryCode(), rk = await recoveryKeys(email, code, opts.recIter);
  const dataKey = await newDataKey();
  return {
    send: { email: normEmail(email), auth: pk.auth, wrapped: await wrapKey(dataKey, pk.wrap), recoveryAuth: rk.auth, recoveryWrapped: await wrapKey(dataKey, rk.wrap) },
    dataKey: await unwrapKey(await wrapKey(dataKey, pk.wrap), pk.wrap), // 꺼낼 수 없는 키로 바꿔 둔다
    recoveryCode: code,
  };
}

// 금고 합치기: 두 기기에서 저장한 일정을 id로 합치고(최근 저장 순, 최대 20개), 지운 일정(tomb)은 다시 살아나지 않게 한다
export function mergeVault(a = {}, b = {}) {
  const tomb = { ...(a.tomb || {}), ...(b.tomb || {}) };
  for (const k of Object.keys(tomb)) if (Date.now() - tomb[k] > 180 * 864e5) delete tomb[k]; // 반년 지난 지운 기록은 버림
  const byId = new Map();
  for (const x of [...(a.saved || []), ...(b.saved || [])]) {
    if (!x?.id || tomb[x.id]) continue;
    const have = byId.get(x.id);
    if (!have || (x.savedAt || 0) > (have.savedAt || 0)) byId.set(x.id, x);
  }
  const newer = (a.settingsAt || 0) >= (b.settingsAt || 0) ? a : b;
  return { v: 1, saved: [...byId.values()].sort((x, y) => (y.savedAt || 0) - (x.savedAt || 0)).slice(0, 20), tomb, settings: newer.settings || {}, settingsAt: newer.settingsAt || 0 };
}
