// 모든 장소·축제의 사진 주소를 미리 찾아 public/photos.json에 저장한다.
// 실행: TOUR_API_KEY=발급키 node scripts/bake-photos.mjs   (키가 없으면 위키백과·공용만 사용)
import { writeFile, readFile } from "node:fs/promises";
import { PLACES, FESTIVALS } from "../public/data.js";
import { findPhoto } from "./photo-sources.mjs";

const out = new URL("../public/photos.json", import.meta.url);
const current = JSON.parse(await readFile(out, "utf8").catch(() => "{}"));
const targets = [...PLACES, ...FESTIVALS.filter((f) => f.start)];
const missing = [];
for (const p of targets) {
  if (current[p.id]) continue;
  const url = await findPhoto(p, process.env.TOUR_API_KEY);
  if (url) current[p.id] = url; else missing.push(p.name);
  process.stdout.write(url ? "." : "x");
}
await writeFile(out, JSON.stringify(current, null, 2) + "\n");
console.log(`\n${Object.keys(current).length}/${targets.length}곳 사진 저장`);
if (missing.length) console.log("사진 없음:", missing.join(", "));
