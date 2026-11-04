// 사장님: 메뉴판 사진 → AI가 읽고 번역 → 사장님이 확인·수정 → 등록 → 다국어 QR 메뉴
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let toastTimer;
function toast(msg) { const el = $("#toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2400); }

function shrink(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

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

$("#photo").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const dataUrl = await shrink(file);
  $("#preview").src = dataUrl; $("#preview").hidden = false; $("#shotLabel").textContent = "다시 찍기";
  $("#scanState").textContent = "메뉴판을 읽고 있어요…";
  let r = null;
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 45000);
    const res = await fetch("api/menu-scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: dataUrl.split(",")[1], mediaType: "image/jpeg" }), signal: c.signal });
    clearTimeout(t);
    if (res.ok) r = await res.json();
  } catch {}
  $("#rows").innerHTML = "";
  if (r) {
    $("#scanState").textContent = `메뉴 ${r.items.length}개를 읽었어요. 틀린 곳을 고쳐 주세요.`;
    if (r.shopName && !$("#name").value) $("#name").value = r.shopName;
    r.items.forEach(row);
    $("#unclear").textContent = r.unclear.length ? `잘 안 보인 부분: ${r.unclear.join(", ")}` : "";
  } else {
    $("#scanState").textContent = "지금은 AI로 읽을 수 없어요. 메뉴를 직접 입력해 주세요. (번역 칸은 비워도 돼요)";
    row(); row(); row();
  }
  $("#step2").hidden = false;
  $("#step2").scrollIntoView({ behavior: "smooth" });
});

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
