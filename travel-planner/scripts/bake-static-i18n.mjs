// index.html의 고정 문구(data-i18n·placeholder·제목)만 골라 영어·일본어·중국어 번역을 HTML 안에 넣는다.
// 왜: 외국어 화면에서 앱 코드·번역 표를 받기 전, 한국어 원문이 잠깐 보이는 것을 없애려고.
//     HTML을 읽는 동안 바로 번역하므로 느린 회선에서도 첫 화면부터 그 언어로 나온다 (약 3KB).
// 사용: node scripts/bake-static-i18n.mjs          → index.html 갱신
//       node scripts/bake-static-i18n.mjs --check  → 최신이 아니면 실패 (npm test)
import { readFileSync, writeFileSync } from "node:fs";
import { JA, ZH } from "../public/i18n-cjk.js";
import { EN } from "../public/i18n.js";

const FILE = new URL("../public/index.html", import.meta.url);
const START = "<!-- static-i18n:start (scripts/bake-static-i18n.mjs가 만듦, 직접 고치지 말 것) -->";
const END = "<!-- static-i18n:end -->";
// 만들어 넣은 부분 [시작, 끝] (없으면 null). 표시 문구에 괄호가 있어 정규식 대신 글자 그대로 찾는다
const blockAt = (html) => { const a = html.indexOf(START); return a < 0 ? null : [a, html.indexOf(END, a) + END.length]; };

export function staticKeys(fullHtml) {
  const at = blockAt(fullHtml);
  const html = at ? fullHtml.slice(0, at[0]) + fullHtml.slice(at[1]) : fullHtml; // 만들어 넣은 부분은 빼고
  const keys = new Set(["오늘강원"]); // 문서 제목
  for (const m of html.matchAll(/<(\w+)\b[^>]*\sdata-i18n(?=[\s>])[^>]*>(.*?)<\/\1>/gs)) keys.add(m[2].trim());
  for (const m of html.matchAll(/<[^>]*\bdata-i18n-ph\b[^>]*>/g)) keys.add(m[0].match(/placeholder="([^"]*)"/)[1]);
  for (const m of html.matchAll(/<[^>]*\bdata-i18n-title\b[^>]*>/g)) keys.add((m[0].match(/(?:title|aria-label)="([^"]*)"/) || [])[1]);
  keys.delete(undefined);
  return [...keys];
}

function build(html) {
  const keys = staticKeys(html);
  const pick = (d, name) => Object.fromEntries(keys.map((k) => {
    if (!Object.hasOwn(d, k)) throw new Error(`${name}에 없는 고정 문구: ${k}`);
    return [k, d[k]];
  }));
  const dict = JSON.stringify({ en: pick(EN, "EN"), ja: pick(JA, "JA"), zh: pick(ZH, "ZH") });
  // i18n.js의 applyStatic과 같은 방식: 원문을 data-ko 등에 남겨 두고 바꾼다 (나중에 언어를 바꿀 때 원문을 키로 씀)
  const script = `<script>
  (function () {
    var D = ${dict}[document.documentElement.dataset.earlyLang];
    if (!D) return;
    var q = function (s, f) { var a = document.querySelectorAll(s); for (var i = 0; i < a.length; i++) f(a[i]); };
    q("[data-i18n]", function (el) { var k = el.innerHTML.trim(); if (D[k]) { el.dataset.ko = k; el.innerHTML = D[k]; } });
    q("[data-i18n-ph]", function (el) { var k = el.placeholder; if (D[k]) { el.dataset.koPh = k; el.placeholder = D[k]; } });
    q("[data-i18n-title]", function (el) { var k = el.title || el.getAttribute("aria-label") || ""; if (D[k]) { el.dataset.koTitle = k; el.title = D[k]; el.setAttribute("aria-label", D[k]); } });
    q("[data-lang]", function (b) { var on = b.dataset.lang === document.documentElement.dataset.earlyLang; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    document.title = D["오늘강원"];
    document.documentElement.classList.remove("i18n-wait");
  })();
  </script>`;
  const block = `${START}\n  ${script}\n  ${END}`;
  const at = blockAt(html);
  if (at) return html.slice(0, at[0]) + block + html.slice(at[1]);
  return html.replace('  <script type="module" src="app.js"></script>', `  ${block}\n  <script type="module" src="app.js"></script>`);
}

const html = readFileSync(FILE, "utf8");
const next = build(html);
if (process.argv.includes("--check")) {
  if (next !== html) { console.error("index.html의 고정 문구 번역이 최신이 아니에요: node scripts/bake-static-i18n.mjs"); process.exit(1); }
  console.log(`ok - 첫 화면 고정 문구 ${staticKeys(html).length}개 영어·일본어·중국어 (HTML 안)`);
} else {
  writeFileSync(FILE, next);
  console.log(`index.html 갱신: 고정 문구 ${staticKeys(html).length}개`);
}
