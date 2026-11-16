// 반값여행 정산 서류 자동 작성: 영수증 사진 → 글자 읽기(기기 안 Tesseract) → 경비 내역서, 여행 사진 → 촬영 날짜·위치 → 방문 인증 목록,
// 숙박이용확인서 양식, 제출용 파일 묶음(ZIP). 사진·영수증은 이 기기(IndexedDB)에만 저장하고 어디에도 보내지 않는다.
import { PLACES, BENEFITS, LODGING } from "./data.js";
import { parseReceipt, checkReceipt, refundOf, nearestPlace, fileNameFor, PAYMENT_LABEL, CATEGORY_LABEL } from "./claim-parse.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const won = (n) => (Number(n) || 0).toLocaleString("ko-KR");
const HP = BENEFITS.find((b) => b.id === "b-halfprice");
const TOWNS = Object.keys(HP.placesByTown);
const byId = new Map(PLACES.map((p) => [p.id, p]));
const fees = await fetch("fees.json").then((r) => r.json()).catch(() => ({}));
// 인증사진 후보: 그 시군의 관광지(식당·카페 제외). 입장료가 있는 곳은 "유료 관광지"로 표시
const sightsOf = (town) => (HP.placesByTown[town] || []).map((id) => byId.get(id)).filter((p) => p && !["food", "cafe"].includes(p.cat));
const paid = (p) => (fees[p.id]?.adult || 0) > 0;

/* ---------- 저장 (설정은 localStorage, 사진은 IndexedDB) ---------- */
const SKEY = "claim:settings";
const loadS = () => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch { return {}; } };
const saveS = (s) => { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* 저장 공간 없음 */ } };
let db;
function idb() {
  if (db) return Promise.resolve(db);
  return new Promise((res, rej) => {
    const r = indexedDB.open("ohneul-claim", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("items", { keyPath: "id" });
    r.onsuccess = () => res((db = r.result)); r.onerror = () => rej(r.error);
  });
}
const tx = async (mode, fn) => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction("items", mode); const out = fn(t.objectStore("items")); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };
const putItem = (it) => tx("readwrite", (s) => s.put(it));
const delItem = (id) => tx("readwrite", (s) => s.delete(id));
const allItems = () => tx("readonly", (s) => s.getAll());
let items = [];

/* ---------- 1. 여행 정보 ---------- */
$("#town").innerHTML = TOWNS.map((t) => `<option>${t}</option>`).join("");
function initTrip() {
  const s = loadS();
  // 앱에서 마지막으로 만든 일정이 반값여행 시군이면 날짜·인원을 미리 채운다
  let last = null; try { last = JSON.parse(localStorage.getItem("lastTrip")); } catch { /* 없음 */ }
  const pkg = HP.packages.find((p) => p.id === last?.opts?.halfPkg);
  const add = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const v = {
    town: s.town || pkg?.town || TOWNS[0],
    from: s.from || last?.input?.date || "",
    to: s.to || (last?.input?.date ? add(last.input.date, (last.input.days || 1) - 1) : ""),
    people: s.people || ((last?.opts?.people?.adults || 0) + (last?.opts?.people?.kids || 0)) || 2,
    name: s.name || "", phone: s.phone || "", stayName: s.stayName || "", stayAddr: s.stayAddr || "",
    minSpend: s.minSpend ?? 0, unit: s.unit || 1000, deadlineDays: s.deadlineDays || 10,
  };
  if (!s.stayName && last?.opts?.lodgingId) { const l = LODGING.find((x) => x.id === last.opts.lodgingId); if (l) v.stayName = l.name; }
  for (const [k, val] of Object.entries(v)) if ($("#" + k)) $("#" + k).value = val;
  const pays = s.payments || ["card", "cashReceipt", "local"];
  document.querySelectorAll("[data-pay]").forEach((c) => (c.checked = pays.includes(c.dataset.pay)));
}
function settings() {
  return {
    town: $("#town").value, from: $("#from").value, to: $("#to").value || $("#from").value, people: Number($("#people").value) || 1,
    name: $("#name").value.trim(), phone: $("#phone").value.trim(), stayName: $("#stayName").value.trim(), stayAddr: $("#stayAddr").value.trim(),
    minSpend: Number($("#minSpend").value) || 0, unit: Number($("#unit").value) || 1000, deadlineDays: Number($("#deadlineDays").value) || 10,
    payments: [...document.querySelectorAll("[data-pay]:checked")].map((c) => c.dataset.pay),
  };
}
document.addEventListener("change", (e) => { if (e.target.closest("#tripBox, .card") && e.target.id && !e.target.type?.startsWith("file")) { saveS(settings()); renderAll(); } });
document.addEventListener("input", (e) => { if (["name", "phone", "stayName", "stayAddr"].includes(e.target.id)) saveS(settings()); });

/* ---------- 사진 줄이기·읽기 ---------- */
function shrink(file, max = 1600, q = 0.82) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? res(b) : rej(new Error("이미지"))), "image/jpeg", q);
    };
    img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}
// 글자 읽기 도구는 처음 쓸 때만 받는다 (버전 고정)
let ocrWorker = null;
async function ocr(blob, onStep) {
  if (!ocrWorker) {
    onStep?.("글자 읽기 도구를 받는 중… (처음 한 번)");
    await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"; s.onload = res; s.onerror = () => rej(new Error("글자 읽기 도구를 받지 못했어요. 인터넷 연결을 확인하세요")); document.head.append(s); });
    ocrWorker = await window.Tesseract.createWorker("kor", 1, {
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
      langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/kor@1.0.0/4.0.0_best_int",
    });
  }
  const { data } = await ocrWorker.recognize(blob);
  return data.text || "";
}
async function exifOf(file) {
  try {
    const { default: exifr } = await import("./vendor/exifr/exifr-lite.js");
    const x = await exifr.parse(file, { gps: true }); // pick을 같이 주면 GPS 계산에서 오류가 난다
    const d = x?.DateTimeOriginal || x?.CreateDate;
    const local = d instanceof Date ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString() : null; // 사진 시계(현지 시각) 그대로
    return { date: local?.slice(0, 10) || null, time: local?.slice(11, 16) || null, lat: x?.latitude ?? null, lng: x?.longitude ?? null };
  } catch { return { date: null, time: null, lat: null, lng: null }; }
}

/* ---------- 2. 영수증 ---------- */
$("#receiptFiles").addEventListener("change", async (e) => {
  const files = [...e.target.files]; e.target.value = "";
  const st = $("#ocrStatus");
  for (let i = 0; i < files.length; i++) {
    st.textContent = `영수증 ${i + 1}/${files.length} 읽는 중…`;
    try {
      const blob = await shrink(files[i], 1800, 0.85);
      const it = { id: crypto.randomUUID(), kind: "receipt", blob, added: Date.now(), meta: { merchant: "", date: settings().from, amount: null, payment: "unknown", category: "etc", address: "", ocr: "" } };
      await putItem(it); items.push(it); renderAll();
      try {
        const text = await ocr(blob, (m) => (st.textContent = m));
        it.meta = { ...parseReceipt(text, Number((settings().from || "").slice(0, 4)) || new Date().getFullYear()), ocr: text.slice(0, 1500) };
        if (!it.meta.date) it.meta.date = settings().from;
        await putItem(it);
      } catch (err) { st.textContent = err.message + " — 표에 직접 적어 주세요"; }
      renderAll();
    } catch { st.textContent = "사진을 읽지 못했어요"; }
  }
  if (!/못/.test(st.textContent)) st.textContent = `영수증 ${files.length}장을 읽었어요. 표의 값이 영수증과 같은지 확인하세요.`;
});
$("#addRow").addEventListener("click", async () => {
  const it = { id: crypto.randomUUID(), kind: "receipt", blob: null, added: Date.now(), meta: { merchant: "", date: settings().from, amount: null, payment: "card", category: "food", address: "", ocr: "" } };
  await putItem(it); items.push(it); renderAll();
});
// 적는 즉시 값을 저장해 둔다 (다른 영수증 글자 읽기가 끝나 표를 다시 그려도 적던 내용이 사라지지 않게)
$("#receiptTable").addEventListener("input", (e) => {
  const tr = e.target.closest("tr[data-id]"); const f = e.target.dataset.f; if (!tr || !f) return;
  const it = items.find((x) => x.id === tr.dataset.id); if (!it) return;
  it.meta[f] = f === "amount" ? Number(String(e.target.value).replace(/[^\d]/g, "")) || null : e.target.value;
  putItem(it).catch(() => {});
});
$("#receiptTable").addEventListener("change", async (e) => {
  const tr = e.target.closest("tr[data-id]"); if (!tr) return;
  const it = items.find((x) => x.id === tr.dataset.id); const f = e.target.dataset.f;
  it.meta[f] = f === "amount" ? Number(String(e.target.value).replace(/[^\d]/g, "")) || null : e.target.value;
  await putItem(it); renderAll();
});

/* ---------- 3. 방문 사진 ---------- */
$("#photoFiles").addEventListener("change", async (e) => {
  const files = [...e.target.files]; e.target.value = "";
  const s = settings(), places = sightsOf(s.town);
  for (const f of files) {
    const ex = await exifOf(f);
    const near = nearestPlace(ex.lat != null ? { lat: ex.lat, lng: ex.lng } : null, places);
    const blob = await shrink(f, 1600, 0.82).catch(() => null); if (!blob) continue;
    const it = { id: crypto.randomUUID(), kind: "photo", blob, added: Date.now(), meta: { date: ex.date, time: ex.time, hasGps: ex.lat != null, placeId: near?.place.id || "", km: near?.km ?? null } };
    await putItem(it); items.push(it);
  }
  renderAll();
});
$("#photoList").addEventListener("change", async (e) => {
  const fig = e.target.closest("[data-id]"); if (!fig) return;
  const it = items.find((x) => x.id === fig.dataset.id); it.meta[e.target.dataset.f] = e.target.value; await putItem(it); renderAll();
});

/* ---------- 4. 숙박 ---------- */
$("#stayFiles").addEventListener("change", async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const blob = await shrink(f, 1800, 0.85); const it = { id: crypto.randomUUID(), kind: "stay", blob, added: Date.now(), meta: {} };
  await putItem(it); items.push(it); renderAll();
});
document.addEventListener("click", async (e) => {
  const d = e.target.closest("[data-del]"); if (!d) return;
  await delItem(d.dataset.del); items = items.filter((x) => x.id !== d.dataset.del); renderAll();
});

/* ---------- 그리기 ---------- */
const urls = new Map();
const urlOf = (it) => { if (!it.blob) return ""; if (!urls.has(it.id)) urls.set(it.id, URL.createObjectURL(it.blob)); return urls.get(it.id); };
const nights = (s) => (s.from && s.to ? Math.round((new Date(s.to) - new Date(s.from)) / 864e5) : 0);
function analysis() {
  const s = settings(), rules = { town: s.town, from: s.from, to: s.to, payments: s.payments };
  const receipts = items.filter((x) => x.kind === "receipt").sort((a, b) => (a.meta.date || "").localeCompare(b.meta.date || "") || a.added - b.added)
    .map((it) => ({ it, chk: checkReceipt(it.meta, rules) }));
  const okSum = receipts.filter((r) => !r.chk.hard && r.it.meta.amount).reduce((a, r) => a + r.it.meta.amount, 0);
  const allSum = receipts.reduce((a, r) => a + (r.it.meta.amount || 0), 0);
  const photos = items.filter((x) => x.kind === "photo").sort((a, b) => `${a.meta.date}${a.meta.time}`.localeCompare(`${b.meta.date}${b.meta.time}`));
  const proven = photos.filter((p) => p.meta.placeId && (!p.meta.date || !s.from || (p.meta.date >= s.from && p.meta.date <= s.to)));
  const stays = items.filter((x) => x.kind === "stay");
  const refund = refundOf(okSum, { people: s.people, rate: HP.rate, caps: HP.caps, unit: s.unit, min: s.minSpend });
  const todo = [];
  if (!s.from) todo.push(["warn", "여행 날짜를 넣어 주세요"]);
  if (!receipts.length) todo.push(["warn", "영수증을 올려 주세요"]);
  const hard = receipts.filter((r) => r.chk.hard).length, soft = receipts.filter((r) => !r.chk.hard && !r.chk.ok).length;
  if (hard) todo.push(["warn", `인정되지 않을 수 있는 영수증 ${hard}장은 합계에서 뺐어요 (표의 ⚠ 확인)`]);
  if (soft) todo.push(["info", `확인이 필요한 영수증 ${soft}장 (주소·결제수단이 안 읽혔어요)`]);
  if (!proven.length) todo.push(["warn", `${s.town} 관광지 방문 인증 사진이 필요해요 (지정 유료 관광지 1곳 이상인 경우가 많아요)`]);
  else if (!proven.some((p) => paid(byId.get(p.meta.placeId)))) todo.push(["info", "인증 사진이 유료 관광지가 아니에요. 공고의 '지정 관광지'인지 확인하세요"]);
  const noLoc = photos.filter((p) => !p.meta.placeId).length;
  if (noLoc) todo.push(["info", `장소를 못 맞춘 사진 ${noLoc}장 — 장소를 골라 주세요`]);
  if (nights(s) > 0 && !stays.length) todo.push(["warn", "숙박했다면 숙박이용확인서(숙소 확인)를 올려 주세요"]);
  if (s.minSpend && okSum < s.minSpend) todo.push(["warn", `인정 금액이 최소 소비액 ${won(s.minSpend)}원보다 적어요`]);
  if (s.to) { const dl = new Date(s.to); dl.setDate(dl.getDate() + s.deadlineDays); todo.push(["info", `정산 기한(공고 확인): ${dl.toISOString().slice(0, 10)}까지`]); }
  if (!todo.some((t) => t[0] === "warn")) todo.unshift(["ok", "필요한 서류가 다 모였어요. 신청서를 확인하고 제출하세요"]);
  return { s, receipts, okSum, allSum, photos, proven, stays, refund, todo };
}
function renderAll() {
  // 다시 그려도 입력하던 칸에 커서가 남게 (위쪽 칸에서 표로 넘어오는 순간 다시 그려지는 경우)
  const ae = document.activeElement, row = ae?.closest?.("[data-id]");
  const focus = row && ae.dataset.f ? { id: row.dataset.id, f: ae.dataset.f } : null;
  draw();
  if (focus) { const el = document.querySelector(`[data-id="${focus.id}"] [data-f="${focus.f}"]`); if (el) { el.focus(); if (el.setSelectionRange && el.type === "text") el.setSelectionRange(el.value.length, el.value.length); } }
}
function draw() {
  const a = analysis(), s = a.s, places = sightsOf(s.town);
  // 표의 줄이 그대로면 입력칸은 건드리지 않고 확인 결과·색만 바꾼다 (적는 중인 칸이 바뀌지 않게)
  const body = $("#receiptTable tbody");
  const ids = a.receipts.map((r) => r.it.id).join();
  if (body.dataset.ids === ids) {
    a.receipts.forEach(({ it, chk }) => {
      const tr = body.querySelector(`tr[data-id="${it.id}"]`); if (!tr) return;
      tr.className = chk.hard ? "bad" : chk.ok ? "" : "soft";
      tr.querySelector(".why").innerHTML = chk.ok ? "✓" : `${chk.hard ? "⚠ " : ""}${chk.why.map(esc).join("<br>")}`;
      for (const el of tr.querySelectorAll("[data-f]")) if (el !== document.activeElement) {
        const v = el.dataset.f === "amount" ? (it.meta.amount ? won(it.meta.amount) : "") : it.meta[el.dataset.f] || "";
        if (el.value !== v) el.value = v;
      }
    });
  } else body.dataset.ids = ids, body.innerHTML = a.receipts.map(({ it, chk }, i) => `<tr data-id="${it.id}" class="${chk.hard ? "bad" : chk.ok ? "" : "soft"}">
    <td>${it.blob ? `<img src="${urlOf(it)}" alt="영수증 ${i + 1}">` : i + 1}</td>
    <td><input type="date" data-f="date" value="${esc(it.meta.date || "")}"></td>
    <td><input data-f="merchant" value="${esc(it.meta.merchant)}" placeholder="가게 이름"><input data-f="address" value="${esc(it.meta.address)}" placeholder="주소 (${s.town}…)" class="addr"></td>
    <td><select data-f="category">${Object.entries(CATEGORY_LABEL).map(([k, v]) => `<option value="${k}"${it.meta.category === k ? " selected" : ""}>${v}</option>`).join("")}</select></td>
    <td><select data-f="payment">${Object.entries(PAYMENT_LABEL).map(([k, v]) => `<option value="${k}"${it.meta.payment === k ? " selected" : ""}>${v}</option>`).join("")}</select></td>
    <td><input data-f="amount" inputmode="numeric" value="${it.meta.amount ? won(it.meta.amount) : ""}" placeholder="금액"></td>
    <td class="why">${chk.ok ? "✓" : `${chk.hard ? "⚠ " : ""}${chk.why.map(esc).join("<br>")}`}</td>
    <td><button type="button" class="ghost small" data-del="${it.id}" aria-label="삭제">✕</button></td></tr>`).join("");
  $("#photoList").innerHTML = a.photos.map((p) => {
    const pl = byId.get(p.meta.placeId);
    const out = p.meta.date && s.from && (p.meta.date < s.from || p.meta.date > s.to);
    return `<figure data-id="${p.id}" class="${pl && !out ? "ok" : "need"}"><img src="${urlOf(p)}" alt="">
      <figcaption>${p.meta.date ? `${p.meta.date} ${p.meta.time || ""}` : "촬영 날짜 없음"}${out ? " ⚠ 여행 기간 밖" : ""}<br>
      <select data-f="placeId"><option value="">${p.meta.hasGps ? "위치가 대상 장소와 멀어요 — 고르기" : "장소 고르기"}</option>${places.map((x) => `<option value="${x.id}"${x.id === p.meta.placeId ? " selected" : ""}>${esc(x.name)}${paid(x) ? " (유료)" : ""}</option>`).join("")}</select>
      ${pl && p.meta.km != null ? `<small>사진 위치가 ${esc(pl.name)}에서 ${p.meta.km}km</small>` : ""}</figcaption>
      <button type="button" class="ghost small" data-del="${p.id}">삭제</button></figure>`;
  }).join("");
  $("#stayList").innerHTML = a.stays.map((p) => `<figure data-id="${p.id}" class="ok"><img src="${urlOf(p)}" alt=""><figcaption>숙박이용확인서</figcaption><button type="button" class="ghost small" data-del="${p.id}">삭제</button></figure>`).join("");
  $("#summary").innerHTML = `<div class="sum-grid">
    <div><span>영수증</span><b>${a.receipts.length}장</b></div>
    <div><span>인정 예상 금액</span><b>${won(a.okSum)}원</b>${a.allSum !== a.okSum ? `<small>전체 ${won(a.allSum)}원</small>` : ""}</div>
    <div><span>환급 예상 (${Math.round(HP.rate * 100)}%)</span><b>${won(a.refund)}원</b><small>${s.people >= 2 ? "2명 이상" : "1명"} 최대 ${won(s.people >= 2 ? HP.caps.group : HP.caps.one)}원 · 지역사랑상품권</small></div>
    <div><span>방문 인증</span><b>${a.proven.length}장</b></div></div>`;
  $("#checklist").innerHTML = a.todo.map(([k, t]) => `<li class="${k}">${k === "ok" ? "✅" : k === "warn" ? "⚠️" : "ℹ️"} ${esc(t)}</li>`).join("");
}

/* ---------- 5. 결과물 ---------- */
const fmtD = (d) => (d ? d.replace(/-/g, ".") : "");
function docHTML(a) {
  const s = a.s, today = new Date().toISOString().slice(0, 10);
  return `<article class="doc">
  <h1>지역사랑 휴가지원(반값여행) 여행경비 정산 신청서</h1>
  <table class="kv"><tr><th>신청자</th><td>${esc(s.name) || "&nbsp;"}</td><th>연락처</th><td>${esc(s.phone) || "&nbsp;"}</td></tr>
  <tr><th>여행 지역</th><td>강원특별자치도 ${esc(s.town)}${s.town === "평창" || s.town === "영월" || s.town === "횡성" ? "군" : ""}</td><th>인원</th><td>${s.people}명</td></tr>
  <tr><th>여행 기간</th><td colspan="3">${fmtD(s.from)} ~ ${fmtD(s.to)} (${nights(s)}박 ${nights(s) + 1}일)</td></tr>
  ${s.stayName ? `<tr><th>숙박</th><td colspan="3">${esc(s.stayName)}${s.stayAddr ? ` (${esc(s.stayAddr)})` : ""}</td></tr>` : ""}</table>
  <h2>1. 여행 경비 내역</h2>
  <table class="list"><thead><tr><th>번호</th><th>사용일</th><th>사용처</th><th>분류</th><th>결제수단</th><th>금액(원)</th><th>비고</th></tr></thead><tbody>
  ${a.receipts.map(({ it, chk }, i) => `<tr class="${chk.hard ? "x" : ""}"><td>${i + 1}</td><td>${fmtD(it.meta.date)}</td><td>${esc(it.meta.merchant)}</td><td>${CATEGORY_LABEL[it.meta.category] || ""}</td><td>${PAYMENT_LABEL[it.meta.payment] || ""}</td><td class="n">${won(it.meta.amount)}</td><td>${chk.hard ? "제외(" + esc(chk.why.filter((w) => /기간|밖|인정|주유/.test(w)).join(", ")) + ")" : ""}</td></tr>`).join("")}
  </tbody><tfoot><tr><th colspan="5">합계 (제외 항목 뺀 금액)</th><td class="n"><b>${won(a.okSum)}</b></td><td></td></tr>
  <tr><th colspan="5">환급 신청 예상액 (${Math.round(HP.rate * 100)}%, 한도 ${won(s.people >= 2 ? HP.caps.group : HP.caps.one)}원)</th><td class="n"><b>${won(a.refund)}</b></td><td></td></tr></tfoot></table>
  <h2>2. 관광지 방문 인증</h2>
  <table class="list"><thead><tr><th>번호</th><th>방문일시</th><th>장소</th><th>구분</th><th>근거</th></tr></thead><tbody>
  ${a.proven.map((p, i) => { const pl = byId.get(p.meta.placeId); return `<tr><td>${i + 1}</td><td>${fmtD(p.meta.date)} ${p.meta.time || ""}</td><td>${esc(pl?.name)}</td><td>${paid(pl) ? "유료 관광지" : "관광지"}</td><td>${p.meta.km != null ? `사진 위치 정보 (${p.meta.km}km)` : "사진 첨부"}</td></tr>`; }).join("") || `<tr><td colspan="5">(인증 사진 없음)</td></tr>`}
  </tbody></table>
  <div class="photos">${a.proven.map((p) => `<figure><img src="${urlOf(p)}"><figcaption>${esc(byId.get(p.meta.placeId)?.name)} · ${fmtD(p.meta.date)}</figcaption></figure>`).join("")}</div>
  <h2>3. 첨부</h2>
  <ul><li>결제 영수증 ${a.receipts.filter((r) => r.it.blob).length}장</li><li>방문 인증 사진 ${a.proven.length}장</li>${nights(s) > 0 ? `<li>숙박이용확인서 ${a.stays.length ? "1부" : "(미첨부)"}</li>` : ""}</ul>
  <p class="sign">위와 같이 여행 경비 정산을 신청합니다.<br>${fmtD(today)}<br>신청인 ${esc(s.name) || "&nbsp;".repeat(16)} (서명)</p>
  <p class="note">※ 보폭 앱이 영수증·사진으로 만든 초안입니다. 금액·사용처는 원본 영수증과 같은지 확인하세요. 인정 기준·환급액은 시군 공고와 심사로 정해집니다.</p>
  </article>`;
}
function stayFormHTML(s) {
  return `<article class="doc">
  <h1>숙박이용확인서</h1>
  <table class="kv"><tr><th>숙박업소명</th><td>${esc(s.stayName) || "&nbsp;"}</td></tr><tr><th>소재지</th><td>${esc(s.stayAddr) || "&nbsp;"}</td></tr>
  <tr><th>이용자(대표)</th><td>${esc(s.name) || "&nbsp;"}</td></tr><tr><th>연락처</th><td>${esc(s.phone) || "&nbsp;"}</td></tr>
  <tr><th>이용 기간</th><td>${fmtD(s.from)} ~ ${fmtD(s.to)} (${nights(s)}박)</td></tr><tr><th>이용 인원</th><td>${s.people}명</td></tr>
  <tr><th>결제 금액</th><td>&nbsp;</td></tr></table>
  <p class="sign">위 사람이 본 업소에 숙박하였음을 확인합니다.<br><br>${fmtD(new Date().toISOString().slice(0, 10))}<br><br>
  업소명 ______________________ &nbsp; 대표자 ______________ (인)<br>사업자등록번호 ______________________</p>
  <p class="note">※ 시군 공고에 정해진 양식이 있으면 그 양식을 쓰세요. 이 양식은 같은 내용을 미리 채운 것입니다.</p></article>`;
}
function openDoc(html) {
  const o = $("#docOverlay");
  o.innerHTML = `<div class="doc-bar"><button type="button" id="docPrint">🖨 인쇄 · PDF로 저장</button><button type="button" class="ghost" id="docClose">닫기</button></div>${html}`;
  o.hidden = false; document.body.classList.add("doc-open"); window.scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  if (e.target.id === "docPrint") { if (window.OhneulApp?.printPage) window.OhneulApp.printPage("반값여행 정산 서류"); else window.print(); } // 안드로이드 앱은 휴대폰 인쇄(PDF 저장)로
  if (e.target.id === "docClose") { $("#docOverlay").hidden = true; document.body.classList.remove("doc-open"); }
});
$("#makeDoc").addEventListener("click", () => openDoc(docHTML(analysis())));
$("#stayForm").addEventListener("click", () => openDoc(stayFormHTML(settings())));

// 제출용 파일 묶음: 순서·이름을 붙인 영수증·사진·확인서 + 신청서(HTML, 열어서 인쇄 가능) + 붙여 넣을 내용(txt)
function pasteText(a) {
  const s = a.s;
  return [`[반값여행 정산 신청 내용] ${s.town} ${fmtD(s.from)}~${fmtD(s.to)} ${s.people}명`,
    `인정 예상 금액: ${won(a.okSum)}원 / 환급 예상: ${won(a.refund)}원`, "",
    "■ 경비 내역", ...a.receipts.filter((r) => !r.chk.hard).map(({ it }, i) => `${i + 1}. ${it.meta.date || ""} ${it.meta.merchant || ""} (${CATEGORY_LABEL[it.meta.category]}, ${PAYMENT_LABEL[it.meta.payment]}) ${won(it.meta.amount)}원`), "",
    "■ 방문 인증", ...a.proven.map((p, i) => `${i + 1}. ${p.meta.date || ""} ${p.meta.time || ""} ${byId.get(p.meta.placeId)?.name || ""}`),
    ...(s.stayName ? ["", `■ 숙박: ${s.stayName} ${fmtD(s.from)}~${fmtD(s.to)}`] : [])].join("\n");
}
$("#copyText").addEventListener("click", async () => {
  const t = pasteText(analysis());
  try { await navigator.clipboard.writeText(t); alert("복사했어요. 신청 사이트의 메모·내역 칸에 붙여 넣으세요."); } catch { prompt("아래 내용을 복사하세요", t); }
});
$("#makeZip").addEventListener("click", async () => {
  const a = analysis(); const { zipSync, strToU8 } = await import("./vendor/fflate/fflate.js");
  const files = {}; let n = 0;
  for (const { it, chk } of a.receipts) if (it.blob && !chk.hard) files[fileNameFor("영수증", ++n, it.meta)] = new Uint8Array(await it.blob.arrayBuffer());
  for (const p of a.proven) files[fileNameFor("인증사진", ++n, { date: p.meta.date, place: byId.get(p.meta.placeId)?.name })] = new Uint8Array(await p.blob.arrayBuffer());
  for (const p of a.stays) files[fileNameFor("숙박이용확인서", ++n, { date: a.s.from, place: a.s.stayName })] = new Uint8Array(await p.blob.arrayBuffer());
  const css = await fetch("claim.css").then((r) => r.text()).catch(() => "");
  files["00_정산신청서.html"] = strToU8(`<!doctype html><meta charset="utf-8"><title>정산 신청서</title><style>${css}</style>${docHTML(a).replace(/<img src="blob:[^"]*">/g, "")}`);
  files["00_신청내용_붙여넣기.txt"] = strToU8(pasteText(a));
  const zip = zipSync(files, { level: 0 });
  const name = `반값여행_정산_${a.s.town}_${a.s.from || "날짜"}.zip`;
  if (window.OhneulApp?.saveFile) { // 안드로이드 앱: 웹뷰는 내려받기를 못 하므로 "저장할 곳"을 골라 저장
    let bin = ""; for (let i = 0; i < zip.length; i += 0x8000) bin += String.fromCharCode.apply(null, zip.subarray(i, i + 0x8000));
    window.OhneulApp.saveFile(name, "application/zip", btoa(bin)); return;
  }
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
  link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 60000);
});
window.__saveDone = (r) => alert(r === "ok" ? "저장했어요. 신청 사이트에서 이 파일 안의 사진을 순서대로 올리세요." : r === "cancel" ? "저장을 취소했어요." : "저장하지 못했어요.");
$("#clearAll").addEventListener("click", async () => {
  if (!confirm("올린 영수증·사진과 입력한 내용을 모두 지울까요?")) return;
  await tx("readwrite", (s) => s.clear()); items = []; localStorage.removeItem(SKEY); initTrip(); renderAll();
});

initTrip();
items = await allItems().catch(() => []);
renderAll();
