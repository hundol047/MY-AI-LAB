// 보폭 최종 결과 보고 (파워포인트). 실행: node build.js <출력 폴더>
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs"); // npm install pptxgenjs
const { applyTheme } = require("/root/.claude/skills/synced/1afa45ce-5809-4f3a-b9dd-d577d5391e19_daff9d3f-af1c-4f07-b917-cc1223211c92/pptx/scripts/apply_theme.js");

const OUT = process.argv[2];
const SHOT = (f) => path.join(OUT, "shots", f.replace(/\.png$/, ".jpg"));
const SIZES = JSON.parse(fs.readFileSync(path.join(OUT, "shots", "sizes.json"), "utf8"));
const STORE = "/home/user/MY-AI-LAB/travel-planner/store";
const REPO = "https://github.com/hundol047/MY-AI-LAB";
const WEB = "https://hundol047.github.io/MY-AI-LAB/";
const APK = "github.com/hundol047/MY-AI-LAB/releases (android-latest)";

const THEME = {
  name: "Bopok",
  headFontFace: "Malgun Gothic",
  bodyFontFace: "Malgun Gothic",
  colors: {
    dk1: "1F2433", lt1: "FFFFFF", dk2: "2B3A82", lt2: "EEF1FB",
    accent1: "34479A", accent2: "F08A3C", accent3: "2E9E6B", accent4: "D64545", accent5: "6B7AC4", accent6: "8A94A6",
    hlink: "34479A", folHlink: "6B7AC4",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pres.title = "보폭 최종 결과 보고";
pres.author = "보폭";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

// ---------- 레이아웃 ----------
pres.defineSlideMaster({
  title: "COVER",
  background: { color: HEX.dk2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.0, w: 7.6, h: 1.6, fontSize: 48, bold: true, color: C.background1, valign: "bottom", align: "left", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.75, w: 7.6, h: 1.4, fontSize: 20, color: C.background2, valign: "top", align: "left", margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "SECTION",
  background: { color: HEX.dk2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.6, w: 11.7, h: 1.2, fontSize: 40, bold: true, color: C.background1, valign: "middle", align: "left", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.85, w: 11.7, h: 0.9, fontSize: 18, color: C.background2, valign: "top", align: "left", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: 12.4, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: C.background2 },
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: HEX.lt1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.8, fontSize: 30, bold: true, color: C.text2, valign: "middle", align: "left", margin: 0 }, text: "" } },
    { text: { text: "보폭 · 최종 결과 보고", options: { x: 0.6, y: 7.02, w: 6, h: 0.3, fontSize: 10, color: C.accent6, margin: 0 } } },
  ],
  slideNumber: { x: 12.4, y: 7.02, w: 0.6, h: 0.3, fontSize: 10, color: C.accent6 },
});

// ---------- 도우미 ----------
const tb = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, valign: "top", fontSize: 14, color: C.text1, ...o });
const card = (s, x, y, w, h, fill = C.background2, name) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: fill }, objectName: name });
const dot = (s, x, y, label, fill = C.accent2, size = 0.5) => {
  s.addShape(pres.shapes.OVAL, { x, y, w: size, h: size, fill: { color: fill }, line: { color: fill } });
  s.addText(String(label), { isTextBox: true, x, y, w: size, h: size, align: "center", valign: "middle", fontSize: size > 0.45 ? 16 : 12, bold: true, color: C.background1, margin: 0 });
};
// 휴대폰 화면 (둥근 테두리 + 그림)
const phone = (s, file, x, y, h, caption) => {
  const ratio = 780 / 1688, w = h * ratio;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x - 0.06, y: y - 0.06, w: w + 0.12, h: h + 0.12, rectRadius: 0.18, fill: { color: C.text1 }, line: { color: C.text1 } });
  s.addImage({ path: SHOT(file), x, y, w, h, altText: caption || file });
  if (caption) tb(s, caption, { x: x - 0.3, y: y + h + 0.12, w: w + 0.6, h: 0.3, fontSize: 11, color: C.accent6, align: "center" });
  return w;
};
const imgFit = (s, file, x, y, maxW, maxH, alt) => {
  const [pw, ph] = SIZES[file];
  const k = Math.min(maxW / pw, maxH / ph), w = pw * k, h = ph * k;
  s.addImage({ path: SHOT(file), x, y, w, h, altText: alt || file });
  return { w, h };
};
function size(f) { // PNG 크기 읽기
  const b = fs.readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const bullets = (s, items, o) => s.addText(items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1 } })), { isTextBox: true, margin: 0, valign: "top", fontSize: 15, color: C.text1, paraSpaceAfter: 8, ...o });

// ---------- 1. 표지 ----------
pres.addSection({ title: "표지" });
{
  const s = pres.addSlide({ masterName: "COVER", sectionTitle: "표지" });
  s.addText("보폭", { placeholder: "title" });
  s.addText([
    { text: "걸음이 불편해도, 휠체어로도", options: { breakLine: true } },
    { text: "공식 자료로 확인한 강원 무장애 여행 일정 서비스", options: { breakLine: true } },
    { text: "최종 결과 보고 · 2026년 12월", options: { fontSize: 16, color: C.accent2 } },
  ], { placeholder: "body" });
  phone(s, "08-3d-overview.png", 9.4, 0.75, 6.0);
  s.addNotes("보폭은 걸음이 불편한 분, 휠체어·유모차 이용자가 강원도 여행을 미리 확인하고 다닐 수 있게 만든 일정 서비스입니다. 오늘은 계획서 기준으로 기획, 개발, 실증 결과와 앞으로의 확장 방향을 보고드립니다.");
}

// ---------- 2. 목차 ----------
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "표지" });
  s.addText("보고 순서", { placeholder: "title" });
  const steps = [["기획", "문제 정의와 목표, 정확성 원칙"], ["개발", "일정 엔진, 무장애 정보, 3D 미리보기, 현장 안내"], ["실증", "자동 검증 결과와 실제 자료로 찾은 문제·개선"], ["확장", "지역·데이터·기능·운영 확장 계획"], ["제출", "서비스 화면, 시연 영상, GitHub 저장소"]];
  steps.forEach(([h, d], i) => {
    const y = 1.5 + i * 1.05;
    dot(s, 0.9, y + 0.12, i + 1, i === 2 ? C.accent2 : C.accent1, 0.6);
    tb(s, h, { x: 1.8, y: y + 0.05, w: 2.5, h: 0.4, fontSize: 22, bold: true, color: C.text2 });
    tb(s, d, { x: 1.8, y: y + 0.5, w: 7.5, h: 0.4, fontSize: 15, color: C.text1 });
  });
  phone(s, "01-welcome.png", 10.3, 1.2, 5.3, "첫 화면 — 로그인 없이 시작");
  s.addNotes("보고는 기획, 개발, 실증, 확장, 제출 순서입니다.");
}

// ---------- 3~4. 기획 ----------
pres.addSection({ title: "기획" });
{
  const s = pres.addSlide({ masterName: "SECTION", sectionTitle: "기획" });
  s.addText("1. 기획", { placeholder: "title" });
  s.addText("“계단이랑 화장실 위치 하나라도 틀리면 안 돼” — 이 한 문장에서 출발했습니다", { placeholder: "body" });
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "기획" });
  s.addText("문제: 걸음이 불편한 여행자는 ‘가 보기 전에’ 알 수 없다", { placeholder: "title" });
  const probs = [
    ["문 닫은 곳을 추천", "AI 일정은 휴무일·입장 마감·브레이크타임을 놓치고 없는 장소까지 추천"],
    ["계단·경사를 모름", "가 보기 전에는 입구 계단, 가파른 길, 흙길을 알 수 없음"],
    ["화장실이 불확실", "지도마다 화장실 위치가 다르고, 장애인 화장실 여부는 더 모름"],
    ["정보가 흩어짐", "관광공사·지자체·공공데이터에 나뉘어 있어 혼자 모으기 어려움"],
  ];
  probs.forEach(([h, d], i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 1.55 + Math.floor(i / 2) * 2.55;
    card(s, x, y, 5.95, 2.3);
    dot(s, x + 0.3, y + 0.3, i + 1, C.accent4);
    tb(s, h, { x: x + 1.0, y: y + 0.32, w: 4.7, h: 0.5, fontSize: 20, bold: true, color: C.text2 });
    tb(s, d, { x: x + 1.0, y: y + 0.95, w: 4.7, h: 1.2, fontSize: 15 });
  });
  s.addNotes("기존 여행 앱과 AI 일정은 휴무와 운영시간을 자주 틀리고, 걸음이 불편한 분께 가장 중요한 계단·경사·화장실 정보가 부족하거나 흩어져 있습니다.");
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "기획" });
  s.addText("목표와 원칙: 모르면 ‘모름’, 확인된 것만 ‘공식’", { placeholder: "title" });
  tb(s, "계획 목표", { x: 0.6, y: 1.45, w: 6, h: 0.4, fontSize: 20, bold: true, color: C.text2 });
  bullets(s, [
    "말하거나 5개만 고르면 영업시간·휴무·이동시간이 맞는 강원 일정",
    "휠체어·걷기 힘듦·유모차 조건에 맞춰 오래 걷는 곳·계단 있는 곳 빼기",
    "가기 전에 3D로 경사·계단·화장실을 미리 보기",
    "현장에서는 내 위치를 따라가며 안내",
    "로그인 없이, 개인정보는 기기 안에만",
  ], { x: 0.6, y: 2.0, w: 6.0, h: 3.6 });
  const labels = [["공식", "정부·관광공사 자료로 확인", C.accent3], ["두 지도 확인", "서로 다른 지도가 같은 자리", C.accent1], ["미확인", "자원봉사 지도 자료(표시만)", C.accent6], ["모름", "자료 없음 — 지어내지 않음", C.accent4]];
  tb(s, "화면에 붙이는 확인 수준", { x: 7.2, y: 1.45, w: 5.5, h: 0.4, fontSize: 20, bold: true, color: C.text2 });
  labels.forEach(([h, d, col], i) => {
    const y = 2.05 + i * 1.12;
    card(s, 7.2, y, 5.5, 0.95);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.45, y: y + 0.22, w: 1.7, h: 0.5, rectRadius: 0.25, fill: { color: col }, line: { color: col } });
    tb(s, h, { x: 7.45, y: y + 0.22, w: 1.7, h: 0.5, fontSize: 14, bold: true, color: C.background1, align: "center", valign: "middle" });
    tb(s, d, { x: 9.35, y: y + 0.27, w: 3.2, h: 0.45, fontSize: 14, valign: "middle" });
  });
  s.addNotes("당초 계획의 목표는 다섯 가지였고, 개발 내내 지킨 원칙은 확인되지 않은 정보를 확실한 것처럼 보여 주지 않는 것입니다. 모든 정보에 공식, 두 지도 확인, 미확인, 모름 표시를 붙였습니다.");
}

// ---------- 5~10. 개발 ----------
pres.addSection({ title: "개발" });
{
  const s = pres.addSlide({ masterName: "SECTION", sectionTitle: "개발" });
  s.addText("2. 개발", { placeholder: "title" });
  s.addText("일정 엔진 · 무장애 정보 · 3D 미리보기 · 현장 안내 · 누구나 쓰는 화면", { placeholder: "body" });
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "개발" });
  s.addText("서비스 흐름: 말하면, 확인하고, 미리 보고, 현장에서 따라간다", { placeholder: "title" });
  const flow = [["말하기·고르기", "“부모님이랑 속초 1박, 휠체어”"], ["검증 일정 엔진", "운영시간·휴무·명절·일몰·이동시간"], ["무장애 정보", "공식 조사·편의시설·화장실·계단"], ["3D 미리보기", "경사 색, 계단 모형, 주변 시설"], ["현장 안내", "내 위치 따라가기, 전화 질문"]];
  flow.forEach(([h, d], i) => {
    const x = 0.6 + i * 2.5;
    card(s, x, 1.7, 2.25, 2.1, i % 2 ? C.background2 : "E3E8F8");
    dot(s, x + 0.85, 1.9, i + 1, C.accent1);
    tb(s, h, { x: x + 0.1, y: 2.55, w: 2.05, h: 0.45, fontSize: 16, bold: true, align: "center", color: C.text2 });
    tb(s, d, { x: x + 0.15, y: 3.05, w: 1.95, h: 0.7, fontSize: 12, align: "center" });
    if (i < 4) s.addShape(pres.shapes.RIGHT_TRIANGLE, { x: x + 2.3, y: 2.6, w: 0.15, h: 0.3, rotate: 90, fill: { color: C.accent2 }, line: { color: C.accent2 } });
  });
  const stats = [["567", "장소 (18개 시군)"], ["185", "관광공사 무장애 공식 조사"], ["4", "언어 (한·영·일·중)"], ["0원", "이용료 · 로그인 없음"]];
  stats.forEach(([n, l], i) => {
    const x = 0.6 + i * 3.1;
    tb(s, n, { x, y: 4.45, w: 2.9, h: 1.0, fontSize: 48, bold: true, color: C.accent2 });
    tb(s, l, { x, y: 5.5, w: 2.9, h: 0.5, fontSize: 15, color: C.text1 });
  });
  s.addNotes("사용자는 말하거나 조건을 고르기만 하면 되고, 엔진이 검증된 자료로 일정을 만듭니다. 장소는 18개 시군 567곳, 그중 185곳은 관광공사 무장애 공식 조사가 있습니다.");
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "개발" });
  s.addText("① 검증 일정 엔진: 문 닫은 곳에 보내지 않는다", { placeholder: "title" });
  bullets(s, [
    "AI는 요청을 ‘조건’으로만 해석, 장소 선택·시간 계산은 검증 엔진이 담당",
    "계절별 운영시간·입장 마감·브레이크타임·요일 휴무·매월 휴무 반영",
    "명절·공휴일 휴무 46곳 (설·추석 당일/오전/연휴, 1월 1일)",
    "겨울엔 해 지기 전에 끝나는 야외 걷기만 (어두운 숲길 방지)",
    "걷기 힘듦·휠체어: 하루 걷는 양 한도, 두 곳마다 쉬는 시간",
    "성격이 다른 일정 3개를 비교해 고르기",
  ], { x: 0.6, y: 1.5, w: 6.6, h: 4.8 });
  phone(s, "03-options.png", 7.9, 1.3, 5.3, "일정 3개 비교");
  phone(s, "14-bigtext.png", 10.6, 1.3, 5.3, "큰 글씨 모드");
  s.addNotes("일정은 AI가 아니라 검증 엔진이 만듭니다. 운영시간과 휴무는 물론 명절 휴무와 겨울 일몰까지 반영해, 문 닫은 곳이나 어두운 숲길로 보내지 않습니다.");
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "개발" });
  s.addText("② 무장애 정보: 흩어진 공식 자료를 한 카드에", { placeholder: "title" });
  const data = [["185곳", "관광공사 무장애 조사", "경사로·장애인 화장실·주차·휠체어 대여"], ["34곳", "건물 편의시설", "사회보장정보원 장애인편의시설 현황"], ["272곳", "확인된 공중화장실", "행정안전부 공중화장실 (장애인 변기 수)"], ["213·452곳", "무장애 숙소·식당", "관광공사 무장애 여행 정보"], ["14곳", "무장애나눔길", "산림복지진흥원 공간정보 (3D에 선으로)"], ["10곳", "열린관광지", "정부가 무장애로 정비한 관광지"]];
  data.forEach(([n, h, d], i) => {
    const x = 0.6 + (i % 2) * 3.45, y = 1.45 + Math.floor(i / 2) * 1.75;
    card(s, x, y, 3.25, 1.55);
    tb(s, n, { x: x + 0.2, y: y + 0.12, w: 2.9, h: 0.55, fontSize: 24, bold: true, color: C.accent1 });
    tb(s, h, { x: x + 0.2, y: y + 0.68, w: 2.9, h: 0.35, fontSize: 14, bold: true, color: C.text2 });
    tb(s, d, { x: x + 0.2, y: y + 1.03, w: 2.95, h: 0.45, fontSize: 11, color: C.text1 });
  });
  imgFit(s, "04-card.png", 7.85, 1.35, 2.75, 5.35, "장소 카드: 무장애 정보와 확인 수준");
  imgFit(s, "05-access-help.png", 10.75, 1.35, 2.0, 4.2, "휠체어 이동 도움 칸");
  tb(s, "장소 카드 · 이동 도움 칸", { x: 7.85, y: 6.55, w: 4.9, h: 0.3, fontSize: 11, color: C.accent6 });
  s.addNotes("관광공사, 사회보장정보원, 행정안전부, 산림복지진흥원 자료를 장소마다 모아 한 카드에 보여 줍니다. 공식 자료에는 공식 표시를, 지도 자료에는 미확인 표시를 붙입니다.");
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "개발" });
  s.addText("③ 3D 미리보기: 가기 전에 경사·계단·화장실을 본다", { placeholder: "title" });
  phone(s, "08-3d-overview.png", 0.7, 1.3, 5.2, "경사 색칠 (완만·조금 가파름·가파름)");
  phone(s, "09-3d-stairs.png", 3.6, 1.3, 5.2, "계단 3D 모형·주변 시설");
  phone(s, "10-3d-legend.png", 6.5, 1.3, 5.2, "확인 수준 설명");
  bullets(s, [
    "위성 사진 + 지형 + 건물 높이로 장소를 입체로",
    "걷는 길을 경사로 색칠 (장애인등편의법 1/18·1/12 기준)",
    "계단 위치에 층계 모형, 누르면 실제 높이 차",
    "확인된 화장실만 표시 (한 지도에만 있는 173곳 제외)",
    "주차장·정류장·쉼터·약국·병원",
  ], { x: 9.55, y: 1.45, w: 3.3, h: 5.3, fontSize: 14 });
  s.addNotes("3D 화면에서는 걷는 길을 경사 기준으로 색칠하고, 계단은 층계 모형으로 세웁니다. 화장실은 정부 자료나 두 지도가 일치하는 곳만 보여 줍니다.");
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "개발" });
  s.addText("④ 현장 안내: 도착하면 내 위치를 따라간다", { placeholder: "title" });
  phone(s, "12-3d-onsite.png", 0.7, 1.3, 5.2, "현장 2km 안이면 자동으로 따라가기");
  phone(s, "11-3d-indoor.png", 3.6, 1.3, 5.2, "실내 길 안내 (공식 조사 순서대로)");
  imgFit(s, "13-callq.png", 6.6, 1.35, 2.7, 3.3, "전화할 때 물어볼 것");
  tb(s, "공식 조사가 없는 곳: 전화할 때 물어볼 것 6가지", { x: 6.6, y: 4.75, w: 2.8, h: 0.6, fontSize: 11, color: C.accent6 });
  bullets(s, [
    "현장에서 3D를 열면 내 위치가 바로 뜨고 걸음을 따라감",
    "인터넷이 끊겨도 일정·글 안내는 그대로",
    "실내 길 안내: 대중교통→주차→접근로→출입구→화장실",
    "장애인 콜택시·광역이동지원센터(1577-2014) 안내",
    "기상특보(풍랑·강풍·대설)를 그날 장소에 경고",
  ], { x: 9.75, y: 1.45, w: 3.1, h: 5.3, fontSize: 14 });
  s.addNotes("현장에 도착해 3D를 열면 위치를 확인해 따라가기를 켭니다. 공식 조사가 없는 곳에는 전화로 확인할 질문 목록을 붙였습니다.");
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "개발" });
  s.addText("⑤ 누구나 쓰는 화면과 개인정보 보호", { placeholder: "title" });
  phone(s, "15-english.png", 0.7, 1.3, 5.2, "영어 화면 (한·영·일·중)");
  imgFit(s, "06-guide.png", 3.65, 1.35, 3.3, 5.2, "무료 여행 가이드");
  tb(s, "가이드: 무장애 질문에 공식 자료로 답함", { x: 3.65, y: 6.55, w: 3.4, h: 0.3, fontSize: 11, color: C.accent6 });
  const items = [["접근성", "큰 글씨·화면낭독기·키보드, 누르는 버튼 44px, 접근성 검사 위반 0"], ["4개 언어", "한국어·영어·일본어·중국어"], ["개인정보", "로그인 없이 모든 기능, 일정은 기기 안에서 계산·저장, 위치는 기기 밖으로 보내지 않음"], ["어디서나", "웹(PWA)·안드로이드 앱, 오프라인 열람"]];
  items.forEach(([h, d], i) => {
    const y = 1.4 + i * 1.33;
    card(s, 7.35, y, 5.4, 1.18);
    tb(s, h, { x: 7.6, y: y + 0.15, w: 4.9, h: 0.35, fontSize: 16, bold: true, color: C.text2 });
    tb(s, d, { x: 7.6, y: y + 0.52, w: 5.0, h: 0.6, fontSize: 12 });
  });
  s.addNotes("어르신과 장애인 이용자를 위해 큰 글씨, 화면낭독기, 키보드 조작을 지원하고, 4개 언어로 제공합니다. 로그인 없이 쓰고 개인정보는 기기 밖으로 보내지 않습니다.");
}

// ---------- 11~14. 실증 ----------
pres.addSection({ title: "실증" });
{
  const s = pres.addSlide({ masterName: "SECTION", sectionTitle: "실증" });
  s.addText("3. 실증", { placeholder: "title" });
  s.addText("수만 개의 일정과 실제 공공데이터로 검증하고, 찾은 문제를 고쳤습니다", { placeholder: "body" });
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "실증" });
  s.addText("자동 검증 결과: 충돌 0, 휴무 위반 0, 접근성 위반 0", { placeholder: "title" });
  const st = [["35,640", "일정 조합 검증", "운영시간·휴무 충돌 0건"], ["2,160일", "일정 품질 검사", "점심·저녁 누락 0%"], ["310개", "겨울 일정 (12~2월)", "휴무·겨울 휴장 위반 0"], ["0건", "접근성 검사 위반", "밝게·어둡게·큰 글씨 × 16개 화면"]];
  st.forEach(([n, h, d], i) => {
    const x = 0.6 + i * 3.1;
    card(s, x, 1.5, 2.9, 2.6, i === 0 ? "E3E8F8" : C.background2);
    tb(s, n, { x: x + 0.2, y: 1.7, w: 2.6, h: 0.9, fontSize: 36, bold: true, color: C.accent2 });
    tb(s, h, { x: x + 0.2, y: 2.65, w: 2.6, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
    tb(s, d, { x: x + 0.2, y: 3.1, w: 2.6, h: 0.8, fontSize: 13 });
  });
  s.addChart(pres.charts.BAR, [{ name: "일정 품질 (2,160일)", labels: ["60분+ 빈 시간", "한 번 이동 75분+", "하루 이동 4시간+", "점심 없음", "저녁 없음"], values: [0.8, 3.4, 1.5, 0, 0] }], {
    x: 0.6, y: 4.35, w: 7.4, h: 2.55, barDir: "bar", chartColors: [HEX.accent1], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: '0.0"%"',
    showTitle: true, title: "일정 품질 지표 (낮을수록 좋음, %)", titleFontSize: 13, titleColor: HEX.dk2, titleFontFace: "+mn-lt",
    catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, catAxisLabelColor: HEX.dk1, valAxisLabelColor: HEX.accent6, dataLabelFontSize: 11, dataLabelColor: HEX.dk1,
    catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt", valGridLine: { color: "E5E7EB", size: 0.5 }, catGridLine: { style: "none" }, showLegend: false, valAxisMaxVal: 5,
  });
  bullets(s, [
    "시험 파일 42개, 코드가 바뀔 때마다 GitHub에서 자동 실행",
    "걷기 힘듦·휠체어 90일: 걷는 양 한도 넘김 0~2회",
    "실제 브라우저로 4개 언어·4가지 이동 조건 시험",
    "오프라인·큰 글씨·320px 작은 폰 화면 점검",
  ], { x: 8.4, y: 4.45, w: 4.4, h: 2.4, fontSize: 13 });
  s.addNotes("일정 엔진은 3만 5천여 개 조합에서 충돌 0건, 겨울 일정 310개에서 휴무 위반 0건이었습니다. 접근성 자동 검사도 모든 화면에서 위반 0건입니다.");
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "실증" });
  s.addText("실제 자료로 찾은 문제와 개선", { placeholder: "title" });
  const cases = [
    ["화장실", "자원봉사 지도에만 있는 화장실 173곳 → 표시 제외, 정부 자료·두 지도 일치만"],
    ["명절 휴무", "설·추석 휴무 46곳을 몰랐음 → 관광공사 원문을 읽어 규칙화"],
    ["기상특보", "‘동해중부앞바다’ 묶음 발표를 놓쳐 낙산해변 풍랑주의보 누락 → 수정"],
    ["겨울 일몰", "해 진 뒤 숲길 절 방문 3건 → 일몰 전에 끝나게"],
    ["운영시간", "관광공사와 다른 15곳 대조 → 6곳 수정 (마감 21시→17시 30분 등)"],
    ["입장료 감면", "65세 이상·장애인 감면 20곳 원문과 1:1 대조 → 모두 일치"],
  ];
  cases.forEach(([h, d], i) => {
    const y = 1.4 + i * 0.9;
    dot(s, 0.65, y + 0.12, i + 1, C.accent2, 0.5);
    tb(s, h, { x: 1.35, y: y + 0.14, w: 1.9, h: 0.45, fontSize: 16, bold: true, color: C.text2 });
    tb(s, d, { x: 3.3, y: y + 0.16, w: 6.3, h: 0.6, fontSize: 14 });
  });
  card(s, 9.9, 1.4, 2.85, 5.25, "E3E8F8");
  tb(s, "자동 갱신", { x: 10.1, y: 1.6, w: 2.5, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
  bullets(s, ["운영정보·시간표: 매일", "기상특보: 2시간마다", "축제·버스·주차·사진·편의시설·걷기 정보: 매주", "자료가 크게 줄면 지난 자료 유지"], { x: 10.1, y: 2.1, w: 2.5, h: 4.3, fontSize: 12 });
  s.addNotes("실제 공공데이터를 넣고 돌리며 찾은 문제를 하나씩 고쳤습니다. 확인되지 않은 화장실 173곳을 빼고, 명절 휴무와 기상특보 누락을 바로잡았습니다. 자료는 매일, 매주 자동으로 갱신됩니다.");
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "실증" });
  s.addText("서비스 화면", { placeholder: "title" });
  const list = [["02-setup.png", "말하거나 고르기"], ["03-options.png", "일정 3개 비교"], ["08-3d-overview.png", "3D 경사 미리보기"], ["11-3d-indoor.png", "실내 길 안내"], ["12-3d-onsite.png", "현장 내 위치"], ["14-bigtext.png", "큰 글씨"]];
  list.forEach(([f, c], i) => phone(s, f, 0.75 + i * 2.1, 1.3, 4.2, c));
  imgFit(s, "07-map.png", 0.7, 6.1, 1.6, 0.75, "일정 지도");
  tb(s, "실제 앱(웹·안드로이드)에서 찍은 화면입니다. 위성 사진: Esri, 지도: OpenFreeMap(오픈스트리트맵)", { x: 2.5, y: 6.35, w: 10.2, h: 0.35, fontSize: 11, color: C.accent6 });
  s.addNotes("실제 앱에서 찍은 화면입니다. 조건 선택부터 일정 비교, 3D 미리보기, 실내 안내, 현장 위치, 큰 글씨 모드까지 보여 드립니다.");
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "실증" });
  s.addText("시연 영상: 조건 고르기 → 일정 → 3D → 실내 안내", { placeholder: "title" });
  const cover = fs.readFileSync(SHOT("demo-cover.png")).toString("base64");
  s.addMedia({ type: "video", path: path.join(OUT, "bopok-demo.mp4"), cover: "image/png;base64," + cover, x: 0.9, y: 1.25, w: 5.6 * 390 / 844 * 1.0, h: 5.6, objectName: "시연 영상" });
  bullets(s, [
    "속초·양양, 부모님과, 휠체어 조건으로 일정 만들기",
    "추천 일정 열기, 장소 카드의 무장애 정보 확인",
    "‘3D로 보기’로 경사·계단·화장실 미리 보기",
    "‘실내·사진’에서 공식 조사 순서대로 실내 길 안내",
  ], { x: 4.2, y: 1.45, w: 5.0, h: 3.5, fontSize: 15 });
  tb(s, "영상 파일: bopok-demo.mp4 (2분 36초, 함께 제출)", { x: 4.2, y: 5.2, w: 5.2, h: 0.4, fontSize: 12, color: C.accent6 });
  s.addImage({ path: path.join(STORE, "qr-web.png"), x: 9.9, y: 1.45, w: 1.4, h: 1.4, altText: "웹 QR" });
  tb(s, "웹으로 열기\n(아이폰·PC)", { x: 11.45, y: 1.6, w: 1.5, h: 1.0, fontSize: 12 });
  s.addImage({ path: path.join(STORE, "qr-android-apk.png"), x: 9.9, y: 3.2, w: 1.4, h: 1.4, altText: "안드로이드 앱 QR" });
  tb(s, "안드로이드 앱\n내려받기", { x: 11.45, y: 3.35, w: 1.5, h: 1.0, fontSize: 12 });
  s.addNotes("시연 영상은 속초·양양에 부모님과 휠체어로 가는 조건으로 일정을 만들고, 3D와 실내 안내까지 보여 줍니다. 오른쪽 QR로 직접 써 보실 수 있습니다.");
}

// ---------- 15~16. 확장 ----------
pres.addSection({ title: "확장" });
{
  const s = pres.addSlide({ masterName: "SECTION", sectionTitle: "확장" });
  s.addText("4. 확장", { placeholder: "title" });
  s.addText("강원에서 검증한 방식을 전국·실내·운영 모델로 넓힙니다", { placeholder: "body" });
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "확장" });
  s.addText("결과물은 이렇게 확장할 수 있습니다", { placeholder: "title" });
  const ex = [
    ["지역", "강원 18개 시군 → 전국", "공공데이터(관광공사·행정안전부·사회보장정보원)는 전국 단위라 같은 엔진·같은 검증으로 넓힐 수 있음 (전국 개편 작업 진행 중)"],
    ["데이터", "더 많이, 더 확실하게", "장애인편의시설 API 전 시설, 카카오맵 화장실 대조, 이용자 현장 확인(계단·화장실) 공유"],
    ["기능", "실내·음성·동행", "시설 실내 지도 연계, 길 안내 음성, 보호자와 일정 공유, 단체 여행"],
    ["운영", "지속 가능한 모델", "숙소·입장권 제휴 수수료(설정만 하면 적용), 지자체·관광공사 무장애 관광 협력, Play 스토어·iOS 출시"],
  ];
  ex.forEach(([h, sub, d], i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 1.45 + Math.floor(i / 2) * 2.7;
    card(s, x, y, 5.95, 2.45, i === 0 ? "E3E8F8" : C.background2);
    dot(s, x + 0.3, y + 0.3, i + 1, C.accent1);
    tb(s, h, { x: x + 1.0, y: y + 0.28, w: 1.4, h: 0.5, fontSize: 20, bold: true, color: C.text2 });
    tb(s, sub, { x: x + 2.3, y: y + 0.34, w: 3.5, h: 0.45, fontSize: 15, bold: true, color: C.accent2 });
    tb(s, d, { x: x + 1.0, y: y + 0.95, w: 4.75, h: 1.4, fontSize: 13 });
  });
  s.addNotes("지역, 데이터, 기능, 운영 네 방향으로 확장할 수 있습니다. 공공데이터가 전국 단위라 같은 방식으로 전국에 적용할 수 있고, 제휴 수수료와 공공 협력으로 운영을 이어 갈 수 있습니다.");
}
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "확장" });
  s.addText("남은 과제", { placeholder: "title" });
  const todo = [
    ["실사용자 현장 실증", "걸음이 불편한 이용자와 함께 현장 시험, 실제 안드로이드 폰(3D 속도·위치 따라가기·뒤로 가기) 확인"],
    ["위성 사진 이용 조건", "Esri 위성 사진을 상업적으로 쓰려면 ArcGIS 키 또는 이용 조건 확인"],
    ["조사 못 한 누리집", "강릉·춘천·철원 등 일부 시군 누리집은 조사 환경에서 열리지 않아 무장애 안내를 더 찾아야 함"],
    ["매달 바뀌는 공지", "삼악산 호수케이블카처럼 휴장일을 매달 공지하는 곳은 공지 반영 필요"],
  ];
  todo.forEach(([h, d], i) => {
    const y = 1.45 + i * 1.3;
    card(s, 0.6, y, 12.15, 1.12);
    dot(s, 0.85, y + 0.31, "!", C.accent4, 0.5);
    tb(s, h, { x: 1.6, y: y + 0.17, w: 3.3, h: 0.4, fontSize: 17, bold: true, color: C.text2 });
    tb(s, d, { x: 4.9, y: y + 0.2, w: 7.7, h: 0.8, fontSize: 14 });
  });
  s.addNotes("남은 과제는 실제 이용자와의 현장 실증, 위성 사진 이용 조건 확인, 일부 지자체 자료 보강, 매달 바뀌는 공지 반영입니다.");
}

// ---------- 17. 제출 ----------
pres.addSection({ title: "제출" });
{
  const s = pres.addSlide({ masterName: "COVER", sectionTitle: "제출" });
  s.addText("결과물 제출", { placeholder: "title" });
  s.addText([
    { text: "GitHub 저장소 (공개)", options: { bold: true, color: C.accent2, breakLine: true } },
    { text: REPO, options: { hyperlink: { url: REPO }, color: C.background1, breakLine: true } },
    { text: " ", options: { breakLine: true, fontSize: 8 } },
    { text: "웹 서비스: " + WEB, options: { breakLine: true, fontSize: 15 } },
    { text: "안드로이드 앱: " + APK, options: { breakLine: true, fontSize: 15 } },
    { text: "시연 영상: bopok-demo.mp4", options: { fontSize: 15 } },
  ], { placeholder: "body" });
  s.addImage({ path: path.join(STORE, "qr-web.png"), x: 9.5, y: 1.6, w: 1.6, h: 1.6, altText: "웹 QR" });
  tb(s, "웹", { x: 9.5, y: 3.3, w: 1.6, h: 0.35, fontSize: 13, color: C.background1, align: "center" });
  s.addImage({ path: path.join(STORE, "qr-android-apk.png"), x: 11.3, y: 1.6, w: 1.6, h: 1.6, altText: "안드로이드 앱 QR" });
  tb(s, "안드로이드", { x: 11.3, y: 3.3, w: 1.6, h: 0.35, fontSize: 13, color: C.background1, align: "center" });
  s.addNotes("결과물은 공개 GitHub 저장소와 웹 서비스, 안드로이드 앱, 시연 영상으로 제출합니다. 감사합니다.");
}

(async () => {
  const file = path.join(OUT, "bopok-final-report.pptx");
  await pres.writeFile({ fileName: file });
  await applyTheme(file, THEME);
  console.log("written", file);
})();
