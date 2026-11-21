// 개인정보 보호 (서버 없이 이 기기에서): 앱 잠금(PIN), 처음 열 때 안내(로그인 화면), 내 정보 내려받기.
// - 앱 잠금은 다른 사람이 내 휴대폰으로 앱을 여는 것을 막는다. PIN은 PBKDF2로 감싼 값만 저장하고 원래 PIN은 어디에도 남기지 않는다.
//   5번 틀리면 30초, 그다음부터 두 배씩 기다린다. PIN을 잊으면 이 기기 기록을 모두 지우고 풀 수 있다(되찾을 방법이 없도록).
// - 앱을 1분 넘게 다른 화면에 두었다가 돌아오면 다시 잠근다.
const subtle = globalThis.crypto.subtle, te = new TextEncoder();
const KEY = "appLock", ITER = 150000, RELOCK_MS = 60e3;
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export async function hashPin(pin, saltHex, iter = ITER) {
  const k = await subtle.importKey("raw", te.encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, k, 256));
}
export const validPin = (p) => /^\d{4,8}$/.test(String(p)) && !/^(\d)\1+$/.test(p) && !"0123456789".includes(p) && !"9876543210".includes(p);
export async function makeLock(pin) {
  const salt = hex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  return { v: 1, salt, iter: ITER, hash: await hashPin(pin, salt), fails: 0, waitUntil: 0 };
}
// 틀린 횟수에 따른 기다림(ms): 5번째부터 30초, 60초, 120초 … 최대 1시간
export const waitFor = (fails) => (fails < 5 ? 0 : Math.min(3600e3, 30e3 * 2 ** (fails - 5)));
export async function checkPin(lock, pin, now = Date.now()) {
  if (lock.waitUntil > now) return { ok: false, wait: lock.waitUntil - now, lock };
  const ok = (await hashPin(pin, lock.salt, lock.iter)) === lock.hash;
  const fails = ok ? 0 : lock.fails + 1;
  const next = { ...lock, fails, waitUntil: ok ? 0 : now + waitFor(fails) };
  return { ok, wait: next.waitUntil > now ? next.waitUntil - now : 0, lock: next };
}

const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return v?.hash ? v : null; } catch { return null; } };
const write = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch { /* 저장 공간 없음 */ } };
export const lockOn = () => !!read();

/**
 * 화면 연결. deps: { t, toast, wipeAll() — 기기 기록 모두 지우기 }
 */
export function initPrivacy({ t, toast, wipeAll }) {
  const $ = (s) => document.querySelector(s);
  // ---------- 잠금 화면 ----------
  let hiddenAt = 0, open = false;
  function showLock() {
    if (open || !read()) return;
    open = true;
    const el = document.createElement("div");
    el.className = "lock-screen"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML = `<form class="lock-box" novalidate>
      <img src="icon-192.png" alt="" width="64" height="64">
      <h2>${t("보폭이 잠겨 있어요")}</h2>
      <p>${t("PIN을 입력하세요")}</p>
      <input class="lock-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" aria-label="PIN">
      <p class="lock-err" role="alert"></p>
      <button class="primary" type="submit">${t("열기")}</button>
      <button class="linkish" type="button" data-forgot>${t("PIN을 잊었어요")}</button></form>`;
    document.body.append(el); document.body.classList.add("locked");
    const input = el.querySelector("input"), err = el.querySelector(".lock-err");
    setTimeout(() => input.focus(), 50);
    el.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = el.querySelector(".primary"); if (btn.disabled) return;
      btn.disabled = true; err.textContent = t("확인하는 중…");
      const r = await checkPin(read(), input.value);
      btn.disabled = false; err.textContent = "";
      write(r.lock); input.value = "";
      if (r.ok) { el.remove(); document.body.classList.remove("locked"); open = false; return; }
      err.textContent = r.wait ? t("여러 번 틀렸어요 · {s}초 뒤에 다시 해 보세요", { s: Math.ceil(r.wait / 1000) }) : t("PIN이 맞지 않아요");
    });
    el.querySelector("[data-forgot]").addEventListener("click", async () => {
      if (!confirm(t("PIN은 되찾을 수 없어요. 이 기기에 저장한 일정·정산 자료·설정을 모두 지우고 잠금을 풀까요? (계정에 동기화한 일정은 다시 로그인하면 돌아와요)"))) return;
      await wipeAll();
    });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > RELOCK_MS) showLock();
  });
  showLock();

  // ---------- 처음 열 때: 환영·개인정보 안내 (로그인 화면) ----------
  function showWelcome() {
    const dlg = $("#welcome"); if (!dlg) return;
    let seen = false; try { seen = !!localStorage.getItem("welcomed"); } catch { seen = true; }
    if (seen || read()) return;
    dlg.showModal?.();
    const done = () => { try { localStorage.setItem("welcomed", "1"); } catch { /* 무시 */ } dlg.close(); };
    dlg.querySelector("#welcomeGo").addEventListener("click", done);
    dlg.querySelector("#welcomeLogin")?.addEventListener("click", () => { done(); location.href = "account.html"; });
    dlg.querySelector("#welcomeLock")?.addEventListener("click", () => { done(); setLock(); });
    dlg.addEventListener("cancel", () => done());
  }
  showWelcome();

  // ---------- 설정: 잠금 켜기·끄기, 내 정보 내려받기 ----------
  // PIN 입력 창 (prompt는 글자가 그대로 보여서 쓰지 않는다)
  function askPin(msg) {
    return new Promise((resolve) => {
      const d = document.createElement("dialog");
      d.className = "pin-dlg";
      d.innerHTML = `<form method="dialog" novalidate><p></p><input type="password" inputmode="numeric" autocomplete="off" maxlength="8" aria-label="PIN"><div class="pin-acts"><button value="no" class="ghost small" type="submit">${t("취소")}</button><button value="ok" class="primary small" type="submit">${t("확인")}</button></div></form>`;
      d.querySelector("p").textContent = msg;
      document.body.append(d); d.showModal();
      const input = d.querySelector("input"); setTimeout(() => input.focus(), 30);
      d.addEventListener("close", () => { const v = d.returnValue === "ok" ? input.value.trim() : null; d.remove(); resolve(v); }, { once: true });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); d.close("ok"); } });
    });
  }
  async function setLock() {
    const a = await askPin(t("새 PIN (숫자 4~8자리, 같은 숫자·연속 숫자는 안 돼요)")); if (a == null) return false;
    if (!validPin(a)) { toast(t("숫자 4~8자리로, 1111·1234 같은 쉬운 PIN은 피해 주세요")); return false; }
    const b = await askPin(t("PIN을 한 번 더 입력하세요")); if (b == null) return false;
    if (a !== b) { toast(t("두 PIN이 달라요")); return false; }
    write(await makeLock(a)); toast(t("앱 잠금을 켰어요 · 1분 넘게 비우면 다시 잠겨요")); return true;
  }
  async function clearLock() {
    const pin = await askPin(t("지금 PIN을 입력하세요")); if (pin == null) return false;
    const r = await checkPin(read(), pin); write(r.lock);
    if (!r.ok) { toast(r.wait ? t("여러 번 틀렸어요 · {s}초 뒤에 다시 해 보세요", { s: Math.ceil(r.wait / 1000) }) : t("PIN이 맞지 않아요")); return false; }
    write(null); toast(t("앱 잠금을 껐어요")); return true;
  }
  function exportMine() {
    const out = { app: "보폭", exportedAt: new Date().toISOString(), note: t("이 기기에 저장된 보폭 기록입니다. 반값여행 영수증·사진은 정산 화면의 '파일로 저장'으로 따로 받을 수 있어요."), data: {} };
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k === KEY) continue; const v = localStorage.getItem(k); try { out.data[k] = JSON.parse(v); } catch { out.data[k] = v; } } } catch { /* 저장소 없음 */ }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    a.download = `bopok-my-data-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(t("내 기록을 파일로 저장했어요"));
  }
  return { setLock, clearLock, exportMine, lockOn };
}
