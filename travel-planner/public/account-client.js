// 계정 (브라우저 쪽): 로그인·가입·복구·동기화. 앱 서버가 있을 때만 쓸 수 있다 (accounts.mjs).
// 자료 키는 '꺼낼 수 없는 키'로 이 기기 IndexedDB에만 두고, 일정은 이 키로 암호화한 뒤에만 서버로 보낸다.
import { passwordKeys, recoveryKeys, newRecoveryCode, newDataKey, prepareSignup, unwrapKey, wrapKey, sealJSON, openJSON, mergeVault, normEmail } from "./account-crypto.js";

const DB = "bopok-account", OS = "k";
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(OS);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(OS, mode), st = tx.objectStore(OS);
      const r = fn(st);
      tx.oncomplete = () => { open.result.close(); resolve(r?.result); };
      tx.onerror = () => { open.result.close(); reject(tx.error); };
    };
  });
}
const getKey = () => idb("readonly", (st) => st.get("session")).catch(() => null);
const putKey = (v) => idb("readwrite", (st) => st.put(v, "session"));
const dropKey = () => idb("readwrite", (st) => st.delete("session")).catch(() => {});

async function api(method, path, body) {
  const r = await fetch(`api/account/${path}`, { method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || "잠시 후 다시 시도하세요."), { status: r.status });
  return j;
}

// ---------- 이 기기의 자료 ↔ 금고 ----------
const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 공간 없음 */ } } };
const SETTING_KEYS = ["bigText", "defaults"];
export function localVault() {
  const settings = Object.fromEntries(SETTING_KEYS.map((k) => [k, ls.get(k)]).filter(([, v]) => v != null));
  try { const th = localStorage.getItem("theme"); if (th) settings.theme = th; } catch { /* 무시 */ }
  return { saved: (ls.get("savedTrips") || []).filter((x) => x?.id), tomb: ls.get("savedTomb") || {}, settings, settingsAt: ls.get("settingsAt") || 0 };
}
function applyVault(v) {
  ls.set("savedTrips", v.saved || []);
  ls.set("savedTomb", v.tomb || {});
  if ((v.settingsAt || 0) > (ls.get("settingsAt") || 0)) {
    for (const k of SETTING_KEYS) if (k in (v.settings || {})) ls.set(k, v.settings[k]);
    try { if (v.settings?.theme) localStorage.setItem("theme", v.settings.theme); } catch { /* 무시 */ }
    ls.set("settingsAt", v.settingsAt);
  }
}

/** 지금 로그인 상태: { email, lastSync } 또는 null (서버 세션과 기기 키가 둘 다 있어야 로그인으로 본다) */
export async function status() {
  const k = await getKey();
  if (!k) return null;
  try { const me = await api("GET", "me"); if (normEmail(me.email) !== k.email) throw 0; return { email: me.email, verified: !!me.verified, lastSync: k.lastSync || 0 }; }
  catch (e) { if (e?.status === 401 || e === 0) { await dropKey(); return null; } return { email: k.email, lastSync: k.lastSync || 0, offline: true }; }
}

/** 동기화: 서버 금고를 열어 이 기기 자료와 합치고, 합친 것을 암호화해 올린다. 다른 기기가 먼저 바꿨으면(409) 한 번 더 */
export async function sync() {
  const k = await getKey();
  if (!k) return null;
  for (let tries = 0; tries < 3; tries++) {
    const me = await api("GET", "me");
    const remote = me.vault ? await openJSON(k.dataKey, me.vault) : {};
    const merged = mergeVault(remote, localVault());
    applyVault(merged);
    try {
      await api("PUT", "vault", { vault: await sealJSON(k.dataKey, merged), version: me.version });
      await putKey({ ...k, lastSync: Date.now() });
      return { saved: merged.saved.length };
    } catch (e) { if (e.status !== 409) throw e; }
  }
  throw new Error("다른 기기와 동시에 바뀌고 있어요. 잠시 후 다시 시도하세요.");
}
let timer = 0;
/** 저장한 일정이 바뀌면 부른다: 로그인한 경우에만 2초 뒤 동기화 */
export function scheduleSync(onDone) {
  clearTimeout(timer);
  timer = setTimeout(() => sync().then((r) => r && onDone?.(r)).catch(() => {}), 2000);
}

async function keep(email, wrapped, wrap) {
  await putKey({ email: normEmail(email), dataKey: await unwrapKey(wrapped, wrap, false), lastSync: 0 });
}
/** 가입 전 이메일 확인: 6자리 코드를 메일로 → 코드가 맞으면 30분짜리 가입표(ticket) */
export const verifyStart = (email, lang) => api("POST", "verify/start", { email, lang });
export const verifyCheck = (email, code) => api("POST", "verify/check", { email, code: String(code).replace(/\D/g, "") }).then((r) => r.ticket);
/** 로그인한 뒤 내 이메일 확인 */
export const verifyMeStart = (lang) => api("POST", "verify/me/start", { lang });
export const verifyMeCheck = (code) => api("POST", "verify/me/check", { code: String(code).replace(/\D/g, "") });
export async function signup(email, password, ticket) {
  const s = await prepareSignup(email, password);
  await api("POST", "signup", { ...s.send, ...(ticket ? { ticket } : {}) });
  await putKey({ email: normEmail(email), dataKey: s.dataKey, lastSync: 0 });
  await sync();
  return s.recoveryCode;
}
export async function login(email, password) {
  const pk = await passwordKeys(email, password);
  const me = await api("POST", "login", { email, auth: pk.auth });
  await keep(email, me.wrapped, pk.wrap);
  return sync();
}
export async function recover(email, code, newPassword) {
  const rk = await recoveryKeys(email, code);
  const { recoveryWrapped } = await api("POST", "recover/start", { email, recoveryAuth: rk.auth });
  const dataKey = await unwrapKey(recoveryWrapped, rk.wrap, true);
  const pk = await passwordKeys(email, newPassword);
  const wrapped = await wrapKey(dataKey, pk.wrap);
  await api("POST", "recover/finish", { email, recoveryAuth: rk.auth, newAuth: pk.auth, newWrapped: wrapped });
  await keep(email, wrapped, pk.wrap);
  return sync();
}
/** 메일로 비밀번호 찾기 (서버에 SMTP가 설정된 경우): 있든 없든 같은 응답 */
export const config = () => api("GET", "config").catch(() => ({ mailReset: false }));
export const requestReset = (email, lang) => api("POST", "reset/request", { email, lang });
export const checkReset = (token) => api("POST", "reset/check", { token });
/**
 * 메일 링크로 새 비밀번호: 예전 자료 키는 비밀번호·복구 코드 없이는 풀 수 없으므로(종단간 암호화) 새 자료 키·새 복구 코드를 만든다.
 * 서버 금고는 비워지고, 이 기기에 저장된 일정으로 다시 채운다. 새 복구 코드를 돌려준다.
 */
export async function resetWithToken(token, newPassword) {
  const { email } = await checkReset(token);
  const pk = await passwordKeys(email, newPassword), code = newRecoveryCode(), rk = await recoveryKeys(email, code);
  const dataKey = await newDataKey();
  const wrapped = await wrapKey(dataKey, pk.wrap);
  await api("POST", "reset/finish", { token, newAuth: pk.auth, newWrapped: wrapped, recoveryAuth: rk.auth, recoveryWrapped: await wrapKey(dataKey, rk.wrap) });
  await keep(email, wrapped, pk.wrap);
  await sync();
  return code;
}
export async function changePassword(current, next) {
  const k = await getKey(); if (!k) throw new Error("로그인이 필요해요.");
  const old = await passwordKeys(k.email, current);
  const me = await api("GET", "me");
  let dataKey;
  try { dataKey = await unwrapKey(me.wrapped, old.wrap, true); } catch { throw new Error("지금 비밀번호가 맞지 않아요."); }
  const pk = await passwordKeys(k.email, next);
  const wrapped = await wrapKey(dataKey, pk.wrap);
  await api("POST", "password", { auth: old.auth, newAuth: pk.auth, newWrapped: wrapped });
  await keep(k.email, wrapped, pk.wrap);
}
/** 로그아웃. wipe=true면 이 기기에 저장한 일정도 지운다 (함께 쓰는 기기) */
export async function logout(wipe = false) {
  await api("POST", "logout").catch(() => {});
  await dropKey();
  if (wipe) for (const k of ["savedTrips", "savedTomb"]) try { localStorage.removeItem(k); } catch { /* 무시 */ }
}
export async function deleteAccount(password) {
  const k = await getKey(); if (!k) throw new Error("로그인이 필요해요.");
  const pk = await passwordKeys(k.email, password);
  await api("POST", "delete", { auth: pk.auth });
  await dropKey();
}
/** 앱 잠금의 '잊었어요'·모두 지우기에서: 기기 키만 지운다 */
export const forgetDevice = dropKey;
