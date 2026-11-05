// 사장님이 메뉴와 번역을 직접 입력 → 등록 → 다국어 QR 메뉴
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// 서버 없이 파일만 올린 주소(GitHub Pages 등)에서는 등록할 수 없다는 것을 처음부터 알린다
fetch("api/shops?region=gangneung").then((r) => r.ok).catch(() => false).then((ok) => {
  if (ok) return;
  const note = document.createElement("p");
  note.className = "card owner-off";
  note.textContent = "이 주소는 서버 없이 올린 체험판이라 가게 등록을 할 수 없어요. 서버로 실행한 주소(npm start)에서 등록해 주세요.";
  document.querySelector("main.owner h1").after(note);
  document.querySelectorAll("main.owner button, main.owner input, main.owner select, main.owner textarea").forEach((el) => { el.disabled = true; });
});
let toastTimer;
function toast(msg) { const el = $("#toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2400); }

function row(i = {}) {
  const el = document.createElement("div");
  el.className = "menu-row";
  el.innerHTML = `
    <input data-k="ko" placeholder="메뉴 이름" value="${esc(i.ko)}">
    <input data-k="price" placeholder="가격" value="${esc(i.price)}">
    <input data-k="en" placeholder="English" value="${esc(i.en)}">
    <input data-k="ja" placeholder="日本語" value="${esc(i.ja)}">
    <input data-k="zh" placeholder="中文" value="${esc(i.zh)}">
    <input data-k="note" placeholder="설명 (맵기, 재료)" value="${esc(i.note)}">
    <button type="button" class="ghost small del" aria-label="삭제">삭제</button>`;
  el.querySelector(".del").onclick = () => el.remove();
  $("#rows").append(el);
}

row(); row(); row();

$("#addRow").onclick = () => row();

$("#step2").addEventListener("submit", async (e) => {
  e.preventDefault();
  const items = [...document.querySelectorAll(".menu-row")].map((r) => Object.fromEntries([...r.querySelectorAll("input")].map((i) => [i.dataset.k, i.value.trim()]))).filter((i) => i.ko);
  if (!items.length) return toast("메뉴를 1개 이상 입력해 주세요");
  const body = { name: $("#name").value, region: $("#region").value, address: $("#address").value, hours: $("#hours").value, phone: $("#phone").value, card: $("#card").checked, items };
  const res = await fetch("api/shops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res || !res.ok) { const j = res ? await res.json().catch(() => ({})) : {}; return toast(j.error || "등록하지 못했어요. 잠시 뒤 다시 해 주세요"); }
  const { id } = await res.json();
  $("#qr").src = `api/qr?id=${id}`;
  $("#menuLink").href = `menu.html?id=${id}`;
  $("#step3").hidden = false;
  $("#step3").scrollIntoView({ behavior: "smooth" });
});
