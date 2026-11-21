// 보폭 계정 화면: 로그인 · 가입(복구 코드) · 비밀번호 찾기 · 내 계정(동기화·비밀번호 바꾸기·로그아웃·계정 삭제)
// 앱 서버가 없으면(GitHub Pages·안드로이드 앱) 계정을 쓸 수 없다고 알린다. 계정 없이도 앱의 모든 기능을 쓸 수 있다.
import { t, loadLang, getLang } from "./i18n.js";
import * as A from "./account-client.js";
import { passwordProblem, validEmail } from "./account-crypto.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const root = $("#acct");
let toastTimer = 0;
const toast = (m) => { const el = $("#toast"); el.textContent = m; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600); };
const PW_MSG = { short: "비밀번호는 10자 이상이어야 해요", long: "비밀번호가 너무 길어요", weak: "너무 쉬운 비밀번호예요 · 문장처럼 길게 써 보세요" };
const errText = (e) => {
  const m = e?.message || "", left = m.match(/남은 횟수 (\d+)번/);
  if (left) return t("코드가 맞지 않아요 (남은 횟수 {n}번)", { n: left[1] });
  return t(/[가-힣]/.test(m) ? m : "잠시 후 다시 시도하세요.");
};

const PRIVACY = () => `<aside class="acct-box">
  <b>🔒 ${t("운영자도 내 일정을 볼 수 없어요")}</b>
  <ul>
    <li>${t("저장한 일정·설정은 이 기기에서 암호화한 뒤에만 서버로 보내요")}</li>
    <li>${t("비밀번호는 서버로 보내지 않아요 · 서버는 이메일과 가입 날짜만 알아요")}</li>
    <li>${t("위치·영수증 사진·정산 서류는 계정에 올리지 않고 이 기기에만 둬요")}</li>
    <li>${t("계정 없이도 모든 기능을 쓸 수 있어요")}</li>
  </ul></aside>`;

const field = (id, label, type = "text", extra = "") => `<label class="acct-field"><span>${t(label)}</span><span class="acct-input"><input id="${id}" type="${type}" ${extra}>${type === "password" ? `<button type="button" class="linkish" data-show="${id}">${t("보기")}</button>` : ""}</span></label>`;

function busy(form, on) { form.querySelectorAll("button, input").forEach((x) => (x.disabled = on)); form.classList.toggle("busy", on); }
async function run(form, fn) {
  const out = form.querySelector(".acct-err"); if (out) out.textContent = "";
  busy(form, true);
  try { await fn(); } catch (e) { if (out) out.textContent = errText(e); else toast(errText(e)); } finally { busy(form, false); }
}
root.addEventListener("click", (e) => {
  const s = e.target.closest("[data-show]");
  if (s) { const i = document.getElementById(s.dataset.show); const on = i.type === "password"; i.type = on ? "text" : "password"; s.textContent = on ? t("숨기기") : t("보기"); }
  const go = e.target.closest("[data-go]");
  if (go) { e.preventDefault(); views[go.dataset.go](); }
});

const views = {
  noServer() {
    root.innerHTML = `<section class="card acct-card"><h2>${t("계정은 앱 서버가 있을 때 쓸 수 있어요")}</h2>
      <p>${t("지금 쓰는 앱(설치 앱·웹 미리보기)은 서버 없이 이 기기 안에서만 동작해요. 저장한 일정은 이 기기에 있고, 다른 기기로는 '다른 기기로 옮기기(QR)'로 옮길 수 있어요.")}</p>
      <a class="primary" href="index.html">${t("계정 없이 계속하기")}</a></section>${PRIVACY()}`;
  },
  login(msg = "") {
    root.innerHTML = `<form class="card acct-card" id="f" novalidate><h2>${t("로그인")}</h2>
      ${msg ? `<p class="acct-ok">${esc(msg)}</p>` : ""}
      ${field("email", "이메일", "email", 'autocomplete="username" inputmode="email" required')}
      ${field("pw", "비밀번호", "password", 'autocomplete="current-password" required')}
      <p class="acct-err" role="alert"></p>
      <button class="primary" type="submit">${t("로그인")}</button>
      <p class="acct-links"><a href="#" data-go="signup">${t("처음이에요 · 가입하기")}</a> · <a href="#" data-go="forgot">${t("비밀번호를 잊었어요")}</a></p>
      <a class="ghost" href="index.html">${t("계정 없이 계속하기")}</a></form>${PRIVACY()}`;
    const f = $("#f");
    f.addEventListener("submit", (e) => { e.preventDefault(); run(f, async () => {
      const email = $("#email").value.trim(), pw = $("#pw").value;
      if (!validEmail(email)) throw new Error("이메일 주소를 확인하세요.");
      f.querySelector(".acct-err").textContent = t("안전하게 확인하는 중… (몇 초 걸려요)");
      const r = await A.login(email, pw);
      toast(t("로그인했어요 · 저장한 일정 {n}개를 맞췄어요", { n: r?.saved ?? 0 }));
      views.me();
    }); });
  },
  // 가입 1단계 (메일을 보낼 수 있는 서버): 이메일로 6자리 코드를 받아 본인 이메일인지 확인
  async signup() {
    const cfg = await A.config();
    if (!cfg.verifyEmail) return views.signupForm();
    root.innerHTML = `<form class="card acct-card" id="f" novalidate><h2>${t("가입하기")}</h2>
      <ol class="acct-steps"><li class="on">${t("이메일 확인")}</li><li>${t("비밀번호 정하기")}</li><li>${t("복구 코드 보관")}</li></ol>
      <p>${t("본인 이메일인지 확인하려고 6자리 코드를 보내 드려요.")}</p>
      ${field("email", "이메일", "email", 'autocomplete="username" inputmode="email" required')}
      <div class="acct-code-in" hidden>${field("code", "확인 코드 (6자리)", "text", 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*"')}<p class="acct-note">${t("메일이 안 보이면 스팸함을 확인하세요. 코드는 10분 동안 쓸 수 있어요.")}</p></div>
      <p class="acct-err" role="alert"></p>
      <button class="primary" type="submit" id="go">${t("확인 코드 받기")}</button>
      <button class="linkish" type="button" id="resend" hidden>${t("코드 다시 받기")}</button>
      <p class="acct-links"><a href="#" data-go="login">${t("이미 계정이 있어요 · 로그인")}</a></p></form>${PRIVACY()}`;
    const f = $("#f"); let email = "", cool = 0;
    let tick = 0;
    const startCool = () => { const btn = $("#resend"); btn.hidden = false; cool = 60; btn.disabled = true; btn.textContent = t("코드 다시 받기 ({s}초)", { s: cool }); clearInterval(tick); tick = setInterval(() => { if (!document.body.contains(btn)) return clearInterval(tick); cool--; btn.textContent = cool > 0 ? t("코드 다시 받기 ({s}초)", { s: cool }) : t("코드 다시 받기"); if (cool <= 0) { btn.disabled = false; clearInterval(tick); } }, 1000); };
    const send = async () => { await A.verifyStart(email, getLang()); f.querySelector(".acct-code-in").hidden = false; $("#email").readOnly = true; $("#go").textContent = t("확인"); f.querySelector(".acct-err").textContent = ""; toast(t("{email}(으)로 코드를 보냈어요", { email })); startCool(); setTimeout(() => $("#code").focus(), 50); };
    $("#resend").onclick = () => run(f, send).then(() => { const r = $("#resend"); if (r && cool > 0) r.disabled = true; });
    f.addEventListener("submit", (e) => { e.preventDefault(); run(f, async () => {
      if (!email) { email = $("#email").value.trim(); if (!validEmail(email)) { email = ""; throw new Error("이메일 주소를 확인하세요."); } return send(); }
      const ticket = await A.verifyCheck(email, $("#code").value);
      views.signupForm(email, ticket);
    }).then(() => { const r = $("#resend"); if (r && cool > 0) r.disabled = true; const em = $("#email"); if (em && em.type !== "hidden") em.readOnly = !!email; }); });
  },
  // 가입 2단계: 비밀번호 (메일 확인을 마쳤으면 이메일은 고정)
  signupForm(verifiedEmail = "", ticket = "") {
    root.innerHTML = `<form class="card acct-card" id="f" novalidate><h2>${t("가입하기")}</h2>
      ${verifiedEmail ? `<ol class="acct-steps"><li class="done">${t("이메일 확인")}</li><li class="on">${t("비밀번호 정하기")}</li><li>${t("복구 코드 보관")}</li></ol><p class="acct-ok">✓ ${esc(verifiedEmail)} · ${t("확인된 이메일")}</p>` : ""}
      <p>${t("가입하면 저장한 일정을 다른 휴대폰·컴퓨터에서도 볼 수 있어요.")}</p>
      ${verifiedEmail ? `<input type="hidden" id="email" value="${esc(verifiedEmail)}" autocomplete="username">` : field("email", "이메일", "email", 'autocomplete="username" inputmode="email" required')}
      ${field("pw", "비밀번호 (10자 이상)", "password", 'autocomplete="new-password" required minlength="10"')}
      ${field("pw2", "비밀번호 한 번 더", "password", 'autocomplete="new-password" required')}
      <label class="acct-check"><input type="checkbox" id="agree"> <span>${t("비밀번호와 복구 코드를 모두 잃으면 운영자도 일정을 되찾아 줄 수 없다는 것을 알았어요")}</span></label>
      <label class="acct-check"><input type="checkbox" id="policy"> <span>${t("개인정보처리방침(이메일·암호화된 일정 보관)에 동의해요")} <a href="privacy.html" target="_blank" rel="noopener">${t("보기")}</a></span></label>
      <p class="acct-err" role="alert"></p>
      <button class="primary" type="submit">${t("가입하기")}</button>
      <p class="acct-links"><a href="#" data-go="login">${t("이미 계정이 있어요 · 로그인")}</a></p></form>${PRIVACY()}`;
    const f = $("#f");
    f.addEventListener("submit", (e) => { e.preventDefault(); run(f, async () => {
      const email = $("#email").value.trim(), pw = $("#pw").value;
      if (!validEmail(email)) throw new Error("이메일 주소를 확인하세요.");
      const p = passwordProblem(pw, email); if (p) throw new Error(PW_MSG[p]);
      if (pw !== $("#pw2").value) throw new Error("두 비밀번호가 달라요");
      if (!$("#agree").checked || !$("#policy").checked) throw new Error("두 가지에 동의해야 가입할 수 있어요");
      f.querySelector(".acct-err").textContent = t("안전하게 암호화하는 중… (몇 초 걸려요)");
      views.code(await A.signup(email, pw, ticket));
    }); });
  },
  // 가입 직후 한 번만: 복구 코드
  code(code) {
    root.innerHTML = `<section class="card acct-card"><h2>${t("복구 코드를 보관하세요")}</h2>
      <p>${t("비밀번호를 잊었을 때 이 코드로만 일정을 되찾을 수 있어요. 지금 한 번만 보여 드려요.")}</p>
      <p class="acct-code" id="code">${esc(code)}</p>
      <div class="acct-row"><button type="button" class="ghost" id="copy">${t("복사")}</button><button type="button" class="ghost" id="dl">${t("파일로 저장")}</button></div>
      <p class="acct-note">${t("종이에 적거나 비밀번호 관리 앱에 넣어 두세요. 사진·메신저로 보내지 마세요.")}</p>
      <label class="acct-check"><input type="checkbox" id="kept"> <span>${t("복구 코드를 안전한 곳에 보관했어요")}</span></label>
      <button class="primary" type="button" id="done" disabled>${t("계속하기")}</button></section>`;
    $("#copy").onclick = () => navigator.clipboard?.writeText(code).then(() => toast(t("복사했어요"))).catch(() => toast(t("복사하지 못했어요 · 직접 적어 두세요")));
    $("#dl").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([`보폭 복구 코드 / Bopok recovery code\n\n${code}\n`], { type: "text/plain" })); a.download = "bopok-recovery-code.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    $("#kept").onchange = (e) => ($("#done").disabled = !e.target.checked);
    $("#done").onclick = () => views.me();
  },
  // 비밀번호 찾기: 메일 링크(서버에 메일 설정이 있을 때) 또는 복구 코드
  async forgot() {
    const cfg = await A.config();
    if (!cfg.mailReset) return views.recover();
    root.innerHTML = `<form class="card acct-card" id="f" novalidate><h2>${t("비밀번호 찾기")}</h2>
      <p>${t("가입한 이메일로 비밀번호를 다시 정하는 링크를 보내 드려요 (30분 동안 한 번만 쓸 수 있어요).")}</p>
      ${field("email", "이메일", "email", 'autocomplete="username" inputmode="email" required')}
      <p class="acct-note">${t("메일로 다시 정하면 서버에 암호화해 둔 일정은 지워지고, 그 기기에 저장된 일정으로 다시 채워져요. 복구 코드가 있으면 복구 코드로 하세요 — 서버 일정이 그대로 남아요.")}</p>
      <p class="acct-err" role="alert"></p>
      <button class="primary" type="submit">${t("메일 받기")}</button>
      <p class="acct-links"><a href="#" data-go="recover">${t("복구 코드로 하기")}</a> · <a href="#" data-go="login">${t("로그인으로 돌아가기")}</a></p></form>`;
    const f = $("#f");
    f.addEventListener("submit", (e) => { e.preventDefault(); run(f, async () => {
      const email = $("#email").value.trim();
      if (!validEmail(email)) throw new Error("이메일 주소를 확인하세요.");
      await A.requestReset(email, getLang());
      root.innerHTML = `<section class="card acct-card"><h2>${t("메일을 확인하세요")}</h2>
        <p>${t("가입한 이메일이라면 몇 분 안에 링크가 도착해요. 스팸함도 확인해 주세요. 링크는 30분 동안 쓸 수 있어요.")}</p>
        <a class="ghost" href="#" data-go="login">${t("로그인으로 돌아가기")}</a></section>`;
    }); });
  },
  // 메일 링크로 열었을 때: account.html#reset=토큰 (주소 끝 # 뒤라 서버 기록·다른 사이트로 새지 않는다)
  async reset(token) {
    history.replaceState(null, "", location.pathname); // 토큰을 주소창·방문 기록에 남기지 않는다
    let email;
    try { ({ email } = await A.checkReset(token)); } catch (e) {
      root.innerHTML = `<section class="card acct-card"><h2>${t("링크를 쓸 수 없어요")}</h2><p>${esc(errText(e))}</p><a class="primary" href="#" data-go="forgot">${t("다시 요청하기")}</a></section>`; return;
    }
    root.innerHTML = `<form class="card acct-card" id="f" novalidate><h2>${t("새 비밀번호 정하기")}</h2>
      <p class="acct-email">${esc(email)}</p>
      ${field("pw", "새 비밀번호 (10자 이상)", "password", 'autocomplete="new-password" required')}
      ${field("pw2", "비밀번호 한 번 더", "password", 'autocomplete="new-password" required')}
      <p class="acct-note">${t("서버에 암호화해 둔 일정은 지워지고, 이 기기에 저장된 일정으로 다시 채워져요. 새 복구 코드를 드려요.")}</p>
      <p class="acct-err" role="alert"></p>
      <button class="primary" type="submit">${t("새 비밀번호로 바꾸기")}</button></form>`;
    const f = $("#f");
    f.addEventListener("submit", (e) => { e.preventDefault(); run(f, async () => {
      const pw = $("#pw").value;
      const p = passwordProblem(pw, email); if (p) throw new Error(PW_MSG[p]);
      if (pw !== $("#pw2").value) throw new Error("두 비밀번호가 달라요");
      f.querySelector(".acct-err").textContent = t("안전하게 암호화하는 중… (몇 초 걸려요)");
      views.code(await A.resetWithToken(token, pw));
    }); });
  },
  recover() {
    root.innerHTML = `<form class="card acct-card" id="f" novalidate><h2>${t("비밀번호 다시 정하기")}</h2>
      <p>${t("가입할 때 받은 복구 코드가 있어야 해요. 코드가 없으면 일정을 되찾을 수 없지만, 같은 이메일로는 운영자에게 계정 삭제를 요청할 수 있어요.")}</p>
      ${field("email", "이메일", "email", 'autocomplete="username" inputmode="email" required')}
      ${field("code", "복구 코드", "text", 'autocomplete="off" autocapitalize="characters" spellcheck="false" required placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"')}
      ${field("pw", "새 비밀번호 (10자 이상)", "password", 'autocomplete="new-password" required')}
      <p class="acct-err" role="alert"></p>
      <button class="primary" type="submit">${t("비밀번호 다시 정하기")}</button>
      <p class="acct-links"><a href="#" data-go="login">${t("로그인으로 돌아가기")}</a></p></form>`;
    const f = $("#f");
    f.addEventListener("submit", (e) => { e.preventDefault(); run(f, async () => {
      const email = $("#email").value.trim(), pw = $("#pw").value;
      const p = passwordProblem(pw, email); if (p) throw new Error(PW_MSG[p]);
      f.querySelector(".acct-err").textContent = t("안전하게 확인하는 중… (몇 초 걸려요)");
      await A.recover(email, $("#code").value, pw);
      toast(t("새 비밀번호로 바꿨어요 · 다른 기기는 로그아웃돼요")); views.me();
    }); });
  },
  async me() {
    const s = await A.status();
    if (!s) return views.login();
    const when = s.lastSync ? new Date(s.lastSync).toLocaleString(getLang() === "ko" ? "ko-KR" : getLang()) : t("아직 안 함");
    root.innerHTML = `<section class="card acct-card"><h2>${t("내 계정")}</h2>
      <p class="acct-email">${esc(s.email)}</p>
      <p class="${s.verified ? "acct-ok" : "acct-note"}">${s.verified ? `✓ ${t("확인된 이메일")}` : t("아직 확인하지 않은 이메일이에요")}</p>
      <div id="vme"></div>
      <p class="acct-note">${t("마지막 동기화: {when}", { when: esc(when) })}${s.offline ? ` · ${t("지금은 서버에 연결할 수 없어요")}` : ""}</p>
      <div class="acct-row"><button class="primary" type="button" id="sync">${t("지금 동기화")}</button><a class="ghost" href="index.html">${t("앱으로 돌아가기")}</a></div></section>
      <form class="card acct-card" id="fpw" novalidate><h3>${t("비밀번호 바꾸기")}</h3>
        ${field("cur", "지금 비밀번호", "password", 'autocomplete="current-password"')}
        ${field("new", "새 비밀번호 (10자 이상)", "password", 'autocomplete="new-password"')}
        <p class="acct-err" role="alert"></p><button class="ghost" type="submit">${t("바꾸기")}</button></form>
      <section class="card acct-card"><h3>${t("로그아웃")}</h3>
        <label class="acct-check"><input type="checkbox" id="wipe"> <span>${t("이 기기에 저장한 일정도 지우기 (다른 사람과 같이 쓰는 기기라면)")}</span></label>
        <button class="ghost" type="button" id="out">${t("로그아웃")}</button></section>
      <form class="card acct-card danger-zone" id="fdel" novalidate><h3 id="delete">${t("계정 삭제")}</h3>
        <p>${t("계정과 서버에 있는 암호화된 일정이 바로 지워지고 되돌릴 수 없어요. 이 기기에 저장한 일정은 남아요.")}</p>
        ${field("dpw", "비밀번호 확인", "password", 'autocomplete="current-password"')}
        <p class="acct-err" role="alert"></p><button class="ghost danger" type="submit">${t("계정 삭제")}</button></form>${PRIVACY()}`;
    if (!s.verified) A.config().then((cfg) => {
      if (!cfg.verifyEmail) return;
      const box = $("#vme");
      box.innerHTML = `<form class="acct-vme" novalidate><button class="ghost" type="button" id="vsend">${t("이메일 확인하기")}</button><div hidden id="vin">${field("vcode", "확인 코드 (6자리)", "text", 'inputmode="numeric" autocomplete="one-time-code" maxlength="6"')}<button class="primary" type="submit">${t("확인")}</button></div><p class="acct-err" role="alert"></p></form>`;
      const vf = box.querySelector("form");
      $("#vsend").onclick = () => run(vf, async () => { await A.verifyMeStart(getLang()); $("#vin").hidden = false; toast(t("{email}(으)로 코드를 보냈어요", { email: s.email })); });
      vf.onsubmit = (e) => { e.preventDefault(); run(vf, async () => { await A.verifyMeCheck($("#vcode").value); toast(t("이메일을 확인했어요")); views.me(); }); };
    });
    $("#sync").onclick = (e) => run(e.target.closest("section"), async () => { const r = await A.sync(); toast(t("동기화했어요 · 저장한 일정 {n}개", { n: r?.saved ?? 0 })); views.me(); });
    $("#out").onclick = (e) => run(e.target.closest("section"), async () => { await A.logout($("#wipe").checked); toast(t("로그아웃했어요")); views.login(); });
    const fpw = $("#fpw");
    fpw.onsubmit = (e) => { e.preventDefault(); run(fpw, async () => {
      const p = passwordProblem($("#new").value, s.email); if (p) throw new Error(PW_MSG[p]);
      fpw.querySelector(".acct-err").textContent = t("안전하게 암호화하는 중… (몇 초 걸려요)");
      await A.changePassword($("#cur").value, $("#new").value);
      fpw.querySelector(".acct-err").textContent = ""; toast(t("비밀번호를 바꿨어요 · 다른 기기는 로그아웃돼요")); fpw.reset();
    }); };
    const fdel = $("#fdel");
    fdel.onsubmit = (e) => { e.preventDefault(); run(fdel, async () => {
      if (!confirm(t("정말 계정을 삭제할까요? 되돌릴 수 없어요."))) return;
      await A.deleteAccount($("#dpw").value);
      views.login(t("계정을 삭제했어요"));
    }); };
    if (location.hash === "#delete") document.getElementById("delete")?.scrollIntoView();
  },
};

await loadLang();
document.title = t("보폭 계정"); $("#title").textContent = t("계정"); $("#back").textContent = `‹ ${t("보폭")}`;
const server = await fetch("api/account/me", { credentials: "same-origin" }).then((r) => r.status === 200 || r.status === 401).catch(() => false);
if (!server) views.noServer();
else if (location.hash === "#signup") views.signup();
else if (location.hash === "#recover") views.recover();
else if (location.hash.startsWith("#reset=")) views.reset(location.hash.slice(7));
else views.me(); // 로그인 안 했으면 로그인 화면 (계정 삭제 링크 #delete도 로그인부터)
// 이미 계정 화면을 연 채로 메일 링크를 눌러도(같은 페이지 # 이동) 새 비밀번호 화면으로
addEventListener("hashchange", () => { if (location.hash.startsWith("#reset=")) views.reset(location.hash.slice(7)); else if (location.hash === "#delete") views.me(); });
