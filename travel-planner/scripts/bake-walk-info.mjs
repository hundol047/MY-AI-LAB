// 장소 주변 걷기 정보 조사: 장소마다 둘레의 계단·화장실·걷는 길(경사·흙길)을 지도 자료에서 세어 적는다.
// - 계단·걷는 길·화장실: OpenFreeMap 벡터 지도 조각(오픈스트리트맵 자료, 14단계). 자원봉사자가 그린 지도라 "미확인"이다.
// - 경사: AWS 공개 지형 고도(terrarium, 약 30m 간격)로 어림. 3D 화면(view3d.js)과 같은 계산(view3d-data.js)을 쓴다.
//   높이 0.5m 이하(바다·물가)는 "모름"으로 둔다.
// - 공식 화장실: public/toilets.json(행정안전부, bake-toilets.mjs)이 있으면 함께 센다.
// 출력: public/walk-info.json ({builtAt, mapDate, radius, places: {id: {...}}}), reports/walk-info.md (계단·화장실 위치를 하나씩 적은 조사표)
// 실행: node scripts/bake-walk-info.mjs   (인증키 필요 없음. 프록시를 거치는 곳에서는 NODE_USE_ENV_PROXY=1)
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { slopeSegments, walkSummary, distM, lineLengthM, lineMid } from "../public/view3d-data.js";

export const RADIUS = 400;      // 장소에서 이 거리(m) 안을 "주변"으로 센다
const Z = 14, EXTENT_PAD = 0;
const TERRAIN = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

// ---------- 좌표 ----------
const n = 2 ** Z;
export const tileXY = (lng, lat) => [((lng + 180) / 360) * n, ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n];
const lngLat = (x, y) => [(x / n) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI];
export function tilesAround(lng, lat, m) {
  const dLat = m / 111320, dLng = m / (111320 * Math.cos((lat * Math.PI) / 180));
  const [x0, y0] = tileXY(lng - dLng, lat + dLat), [x1, y1] = tileXY(lng + dLng, lat - dLat);
  const out = [];
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let y = Math.floor(y0); y <= Math.floor(y1); y++) out.push([x, y]);
  return out;
}

// ---------- 선을 지도 조각 경계에서 자른다 (조각마다 겹쳐 실린 부분을 두 번 세지 않게) ----------
export function clipLine(pts, min, max) {
  const out = []; let cur = [];
  const inside = (p) => p.x >= min && p.x <= max && p.y >= min && p.y <= max;
  const cut = (a, b) => { // a→b 선분을 상자에 맞춰 자른 [p, q] 또는 null (Liang–Barsky)
    let t0 = 0, t1 = 1; const dx = b.x - a.x, dy = b.y - a.y;
    for (const [p, q] of [[-dx, a.x - min], [dx, max - a.x], [-dy, a.y - min], [dy, max - a.y]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
  };
  for (let i = 1; i < pts.length; i++) {
    const seg = cut(pts[i - 1], pts[i]);
    if (!seg) { if (cur.length > 1) out.push(cur); cur = []; continue; }
    if (!cur.length) cur.push(seg[0]);
    cur.push(seg[1]);
    if (!inside(pts[i]) || seg[1].x !== pts[i].x || seg[1].y !== pts[i].y) { if (cur.length > 1) out.push(cur); cur = []; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

// 끝점이 맞닿은(3m 안) 계단 조각은 한 계단으로 묶는다
export function mergeTouching(lines, tol = 3) {
  const group = lines.map((_, i) => i);
  const find = (i) => (group[i] === i ? i : (group[i] = find(group[i])));
  const ends = (l) => [l[0], l[l.length - 1]];
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    if (ends(lines[i]).some((a) => ends(lines[j]).some((b) => distM(a, b) <= tol))) group[find(i)] = find(j);
  }
  const out = new Map();
  lines.forEach((l, i) => { const g = find(i); if (!out.has(g)) out.set(g, []); out.get(g).push(l); });
  return [...out.values()];
}

// ---------- PNG(8비트 RGB/RGBA) 읽기: 지형 고도 조각 ----------
export function decodePng(buf) {
  let pos = 8, w = 0, h = 0, type = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), name = buf.toString("latin1", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (name === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; if (data[8] !== 8 || ![2, 6].includes(type) || data[12] !== 0) throw new Error("지원하지 않는 PNG 형식"); }
    if (name === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[o + i - bpp] : 0, b = y ? px[o - stride + i] : 0, c = y && i >= bpp ? px[o - stride + i - bpp] : 0;
      let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + i] = v & 255;
    }
  }
  return { w, h, bpp, px };
}
const elevOfPx = (t, x, y) => { const i = (Math.min(t.h - 1, Math.max(0, y)) * t.w + Math.min(t.w - 1, Math.max(0, x))) * t.bpp; return t.px[i] * 256 + t.px[i + 1] + t.px[i + 2] / 256 - 32768; };

// ---------- 받기 ----------
async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (res?.ok) return Buffer.from(await res.arrayBuffer());
    if (res && (res.status === 404 || res.status === 204)) return null;
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error(`받지 못했습니다: ${url.replace(/\?.*/, "")}`);
}

const kakao = (label, lat, lng) => `https://map.kakao.com/link/map/${encodeURIComponent(label)},${lat.toFixed(6)},${lng.toFixed(6)}`;

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const { PLACES } = await import("../public/data.js");
  const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
  const places = PLACES.filter((p) => p.cat !== "festival" && Number.isFinite(p.lat) && (!only.length || only.includes(p.id)));
  const meta = JSON.parse((await get("https://tiles.openfreemap.org/planet")).toString());
  const tpl = meta.tiles[0];
  const mapDate = (tpl.match(/\/(\d{4})(\d{2})(\d{2})_/) || []).slice(1).join("-") || null;
  const official = await readFile(new URL("../public/toilets.json", import.meta.url), "utf8").then(JSON.parse).catch(() => null);
  const vt = new Map(), dem = new Map();
  const vtile = async (x, y) => { const k = `${x}/${y}`; if (!vt.has(k)) { const b = await get(tpl.replace("{z}", Z).replace("{x}", x).replace("{y}", y)); vt.set(k, b ? new VectorTile(new PbfReader(b)) : null); } return vt.get(k); };
  const dtile = async (x, y) => { const k = `${x}/${y}`; if (!dem.has(k)) { const b = await get(TERRAIN(Z, x, y)); dem.set(k, b ? decodePng(b) : null); } return dem.get(k); };
  // 높이(m): 조각 안에서 둘레 네 점을 섞어 읽는다. 0.5m 이하(바다·물가)·자료 없음은 null
  const elevAt = (lng, lat) => {
    const [fx, fy] = tileXY(lng, lat), tx = Math.floor(fx), ty = Math.floor(fy), t = dem.get(`${tx}/${ty}`);
    if (!t) return null;
    const px = (fx - tx) * t.w - 0.5, py = (fy - ty) * t.h - 0.5, x0 = Math.floor(px), y0 = Math.floor(py), ax = px - x0, ay = py - y0;
    const z = elevOfPx(t, x0, y0) * (1 - ax) * (1 - ay) + elevOfPx(t, x0 + 1, y0) * ax * (1 - ay) + elevOfPx(t, x0, y0 + 1) * (1 - ax) * ay + elevOfPx(t, x0 + 1, y0 + 1) * ax * ay;
    return z <= 0.5 ? null : z;
  };

  const out = {}, report = [];
  let done = 0;
  for (const p of places) {
    const here = [p.lng, p.lat];
    const tiles = tilesAround(p.lng, p.lat, RADIUS + 50);
    const paths = [], stepPieces = [], wcs = [];
    for (const [x, y] of tiles) {
      const [tile] = await Promise.all([vtile(x, y), dtile(x, y)]);
      if (!tile) continue;
      const tr = tile.layers.transportation, poi = tile.layers.poi;
      for (let i = 0; i < (tr?.length || 0); i++) {
        const f = tr.feature(i);
        if (f.properties.class !== "path") continue;
        for (const ring of f.loadGeometry()) for (const piece of clipLine(ring, -EXTENT_PAD, f.extent + EXTENT_PAD)) {
          const line = piece.map((q) => lngLat(x + q.x / f.extent, y + q.y / f.extent));
          if (f.properties.subclass === "steps") stepPieces.push(line);
          else paths.push({ line, unpaved: f.properties.surface === "unpaved", kind: f.properties.subclass });
        }
      }
      for (let i = 0; i < (poi?.length || 0); i++) {
        const f = poi.feature(i);
        if (f.properties.class !== "toilets") continue;
        const q = f.loadGeometry()[0][0];
        if (q.x < 0 || q.y < 0 || q.x > f.extent || q.y > f.extent) continue; // 옆 조각에 실린 것
        wcs.push({ at: lngLat(x + q.x / f.extent, y + q.y / f.extent), name: f.properties.name || "" });
      }
    }
    // 계단: 맞닿은 조각은 하나로, 장소에서 가까운 순
    const steps = mergeTouching(stepPieces).map((g) => { const longest = g.reduce((a, b) => (lineLengthM(b) > lineLengthM(a) ? b : a)); const at = lineMid(longest); return { at, len: Math.round(g.reduce((s, l) => s + lineLengthM(l), 0)), m: Math.round(Math.min(...g.flat().map((q) => distM(q, here)))) }; })
      .filter((s) => s.m <= RADIUS).sort((a, b) => a.m - b.m);
    const offAll = (official?.items || []).map((t) => ({ at: [t.lng, t.lat], name: t.name, acc: t.acc, open: t.open, official: true }));
    const toilets = [...offAll, ...wcs.filter((w) => !offAll.some((o) => distM(o.at, w.at) < 30))].map((w) => ({ ...w, m: Math.round(distM(w.at, here)) })).filter((w) => w.m <= RADIUS).sort((a, b) => a.m - b.m);
    // 걷는 길: 장소 둘레 안에 한 점이라도 든 길만
    const nearPaths = paths.filter((q) => q.line.some((c) => distM(c, here) <= RADIUS));
    const segs = nearPaths.flatMap((q) => slopeSegments(q.line, elevAt));
    const sum = walkSummary(segs);
    const total = nearPaths.reduce((s, q) => s + lineLengthM(q.line), 0), unp = nearPaths.filter((q) => q.unpaved).reduce((s, q) => s + lineLengthM(q.line), 0);
    out[p.id] = {
      n: nearPaths.length, km: +(total / 1000).toFixed(2),
      ...(sum.share ? { sh: sum.share } : {}),
      ...(total > 0 && unp / total >= 0.05 ? { unp: Math.round((unp / total) * 100) } : {}),
      st: steps.length, ...(steps.length ? { stM: steps[0].m, stLen: steps.reduce((s, x) => s + x.len, 0) } : {}),
      wc: toilets.length, ...(toilets.length ? { wcM: toilets[0].m } : {}),
      ...(toilets.some((t) => t.official) ? { wcOff: toilets.filter((t) => t.official).length } : {}),
      ...(toilets.some((t) => t.acc) ? { wcAcc: toilets.filter((t) => t.acc).length, wcAccM: toilets.find((t) => t.acc).m } : {}),
    };
    report.push(`### ${p.name}`, "",
      `- 걷는 길: ${nearPaths.length}개 · 약 ${(total / 1000).toFixed(1)}km${sum.share ? ` · 완만 ${sum.share[0]}% / 조금 가파름 ${sum.share[1]}% / 가파름 ${sum.share[2]}%` : " · 경사 모름"}${unp > 0 ? ` · 흙·자갈길 ${Math.round((unp / total) * 100)}%` : ""}${nearPaths.length ? "" : " (지도에 걷는 길이 그려져 있지 않음 — 현장 확인 필요)"}`,
      `- 계단 ${steps.length}곳${steps.length ? ":" : " (지도에 표시된 계단 없음 — 계단이 없다는 뜻은 아님)"}`,
      ...steps.map((s, i) => `  - 계단 ${i + 1}: 장소에서 ${s.m}m · 길이 약 ${s.len}m · [지도](${kakao(`${p.name} 계단${i + 1}`, s.at[1], s.at[0])})`),
      `- 화장실 ${toilets.length}곳${toilets.length ? ":" : " (지도·공식 자료에 없음)"}`,
      ...toilets.map((w, i) => `  - 화장실 ${i + 1}: 장소에서 ${w.m}m · ${w.official ? `공식${w.acc ? " · 장애인 화장실 있음" : w.acc === false ? " · 장애인 화장실 없음" : ""}${w.open ? ` · ${w.open}` : ""}` : "미확인(오픈스트리트맵)"}${w.name ? ` · ${w.name}` : ""} · [지도](${kakao(`${p.name} 화장실${i + 1}`, w.at[1], w.at[0])})`),
      ...(p.access?.text ? ["- 한국관광공사 무장애 조사(공식):", ...Object.entries(p.access.text).map(([k, v]) => `  - ${k}: ${v}`)] : ["- 한국관광공사 무장애 조사: 없음"]), "");
    if (++done % 25 === 0) process.stdout.write(`${done} `);
  }
  if (only.length) { console.log(JSON.stringify(out, null, 1)); console.log(report.join("\n")); process.exit(0); }
  const ids = Object.keys(out), withPaths = ids.filter((k) => out[k].n).length;
  if (withPaths < places.length * 0.5) throw new Error(`걷는 길 자료가 있는 장소가 ${withPaths}/${places.length}곳뿐이라 이상합니다 — 저장하지 않습니다`);
  await writeFile(new URL("../public/walk-info.json", import.meta.url), JSON.stringify({ builtAt: new Date().toISOString(), mapDate, radius: RADIUS, source: "OpenFreeMap(오픈스트리트맵) 걷는 길·계단·화장실, AWS 지형 고도, 행정안전부 공중화장실", places: out }).replace(/\},"/g, '},\n"') + "\n");
  await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
  const sum = (f) => ids.reduce((s, k) => s + (f(out[k]) || 0), 0);
  await writeFile(new URL("../reports/walk-info.md", import.meta.url), ["# 장소 주변 걷기 정보 조사표 (계단·화장실·걷는 길 경사)", "",
    `생성: node scripts/bake-walk-info.mjs · 지도 자료 기준일 ${mapDate || "모름"} · 장소 둘레 ${RADIUS}m.`, "",
    "- **계단·걷는 길·'미확인' 화장실**은 오픈스트리트맵(자원봉사자가 그린 지도) 자료다. 빠진 계단·화장실이 있을 수 있고, \"계단 0곳\"은 계단이 없다는 뜻이 아니다.",
    "- **경사**는 약 30m 간격 지형 고도로 어림한 값이다(완만 1/18 이하 · 조금 가파름 1/12 이하 · 가파름 1/12 넘음). 짧은 턱·급경사는 보이지 않고, 바다 높이로 읽힌 구간은 뺐다.",
    "- **공식** 화장실은 행정안전부 전국공중화장실표준데이터, 무장애 조사는 한국관광공사 자료다.",
    "- 각 위치의 [지도] 링크로 카카오맵에서 위치를 확인할 수 있다. 현장에서 다르면 앱 3D 화면의 \"현장 확인 남기기\"로 표시한다.", "",
    `장소 ${ids.length}곳 · 걷는 길 자료 있는 곳 ${withPaths}곳 · 계단 ${sum((v) => v.st)}곳(계단이 표시된 장소 ${ids.filter((k) => out[k].st).length}곳) · 화장실 ${sum((v) => v.wc)}곳(화장실이 표시된 장소 ${ids.filter((k) => out[k].wc).length}곳, 공식 ${sum((v) => v.wcOff)}곳)`, "",
    ...report].join("\n"));
  console.log(`\n걷기 정보 ${ids.length}곳 (걷는 길 ${withPaths}곳, 계단 ${sum((v) => v.st)}곳, 화장실 ${sum((v) => v.wc)}곳) → public/walk-info.json, reports/walk-info.md`);
}
