// 무료 간단 모드 가이드의 정확도 측정: 4개 언어의 실제 같은 질문에 대해 답의 종류·장소·언어가 맞는지 센다
// node test/guide-eval.mjs        → 세 묶음 전체의 언어별 정확도와 틀린 질문 목록 (--holdout, --blind로 한 묶음만)
// node test/guide-eval.mjs --check → 기준(MIN) 아래면 실패 (npm test에서 사용)
import { readFileSync } from "node:fs";
import { planTrip } from "../public/planner.js";
import { guideLocal } from "../public/ai-local.js";

const read = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url)));
const fees = read("../public/fees.json");
const namesEn = Object.fromEntries(Object.entries(read("../public/data-en.json")).map(([k, v]) => [k, v.name]));

const trips = {};
function tripFor(region) {
  if (!trips[region]) {
    const input = { region, date: "2026-11-07", days: 2, who: "couple", likes: ["sea", "food", "nature"], move: "car" };
    const opts = { prefer: [], avoid: [] };
    trips[region] = { input, opts, trip: planTrip(input, opts) };
  }
  return trips[region];
}

// [질문, 기대: { kind, place?, add?, remove?, avoid?, region?, ui? }]
// kind: hours·fee·duration·kids·parents·walk·rain·sunrise·photo·night·food·cafe·faq:주차·faq:가는법·faq:특산물·faq:숙소·place·add·remove·addCat·prefs·help
const CASES = {
  ko: [
    ["오죽헌 몇 시에 열어?", { kind: "hours", place: "ojukheon" }],
    ["경포대 입장료 있어?", { kind: "fee", place: "gyeongpodae" }],
    ["아르떼뮤지엄 얼마예요", { kind: "fee", place: "arte" }],
    ["바다부채길 얼마나 걸려?", { kind: "duration", place: "sea-trail" }],
    ["애들 데리고 가도 돼?", { kind: "kids" }],
    ["울엄마 무릎이 안 좋은데 괜찮을까", { kind: "parents" }],
    ["계단 많은 곳 있어?", { kind: "walk" }],
    ["내일 비 온다는데", { kind: "rain" }],
    ["해돋이 볼 만한 데", { kind: "sunrise" }],
    ["인생샷 찍을 곳 추천", { kind: "photo" }],
    ["밤에 갈 만한 곳", { kind: "night" }],
    ["배고픈데 근처 밥집", { kind: "food" }],
    ["커피 마실 곳", { kind: "cafe" }],
    ["주차 어디에 해?", { kind: "faq:주차" }],
    ["서울에서 어떻게 가요?", { kind: "faq:가는법" }],
    ["기념품 뭐 사가지", { kind: "faq:특산물" }],
    ["테라로사 어때?", { kind: "place", place: "terarosa" }],
    ["환선굴 넣어줘", { kind: "add", add: "hwanseon" }],
    ["선교장도 가고 싶어", { kind: "add", add: "seongyojang" }],
    ["경포해변 빼줘", { kind: "remove", remove: "gyeongpo-beach" }],
    ["2일차에 카페 하나 더 넣어줘", { kind: "addCat" }],
    ["카페는 빼줘", { kind: "prefs", avoid: "cafe" }],
    ["좀 여유롭게 다니고 싶어", { kind: "prefs" }],
    ["덜 걷게 해줘", { kind: "prefs" }],
    ["툇마루 줄 길어?", { kind: "place", place: "toetmaru" }],
    ["중앙시장 몇시까지 해", { kind: "hours", place: "central-market" }],
    ["짬순 맵나요", { kind: "place", place: "jjamppong-tofu" }],
    ["속초 영금정 운영시간", { kind: "hours", place: "yeonggeumjeong", region: "seorak" }],
    ["남이섬 입장료", { kind: "fee", place: "nami", region: "chuncheon" }],
    ["양떼목장 아이랑 괜찮아?", { kind: "kids", place: "sheep", region: "pyeongchang" }],
  ],
  en: [
    ["What time does Ojukheon open?", { kind: "hours", place: "ojukheon" }],
    ["Is there an entrance fee for Gyeongpodae?", { kind: "fee", place: "gyeongpodae" }],
    ["How much is the ARTE museum?", { kind: "fee", place: "arte" }],
    ["How long does the sea trail take?", { kind: "duration", place: "sea-trail" }],
    ["Can I bring my kids?", { kind: "kids" }],
    ["Is this ok for my elderly parents?", { kind: "parents" }],
    ["Are there many stairs?", { kind: "walk" }],
    ["What if it rains tomorrow?", { kind: "rain" }],
    ["Where can I watch the sunrise?", { kind: "sunrise" }],
    ["Best photo spots?", { kind: "photo" }],
    ["Anything to do at night?", { kind: "night" }],
    ["I'm hungry, where should we eat?", { kind: "food" }],
    ["Where can I get coffee?", { kind: "cafe" }],
    ["Where do I park?", { kind: "faq:주차" }],
    ["How do I get there from Seoul?", { kind: "faq:가는법" }],
    ["What souvenirs should I buy?", { kind: "faq:특산물" }],
    ["Tell me about Terarosa", { kind: "place", place: "terarosa" }],
    ["Add Hwanseon cave", { kind: "add", add: "hwanseon" }],
    ["I want to visit Seongyojang too", { kind: "add", add: "seongyojang" }],
    ["Remove Gyeongpo Beach", { kind: "remove", remove: "gyeongpo-beach" }],
    ["Add one more cafe on day 2", { kind: "addCat" }],
    ["No cafes please", { kind: "prefs", avoid: "cafe" }],
    ["Can we take it easy?", { kind: "prefs" }],
    ["Less walking please", { kind: "prefs" }],
    ["Is the line long at Toetmaru?", { kind: "place", place: "toetmaru" }],
    ["When does the central market close?", { kind: "hours", place: "central-market" }],
    ["Is the jjamppong tofu spicy?", { kind: "place", place: "jjamppong-tofu" }],
    ["Yeonggeumjeong opening hours", { kind: "hours", place: "yeonggeumjeong", region: "seorak" }],
    ["Nami Island ticket price", { kind: "fee", place: "nami", region: "chuncheon" }],
    ["Is the sheep farm good for kids?", { kind: "kids", place: "sheep", region: "pyeongchang" }],
  ],
  ja: [
    ["烏竹軒は何時に開きますか？", { kind: "hours", place: "ojukheon" }],
    ["鏡浦台は入場料がかかりますか", { kind: "fee", place: "gyeongpodae" }],
    ["アルテミュージアムはいくらですか", { kind: "fee", place: "arte" }],
    ["パダブチェギルはどのくらいかかりますか", { kind: "duration", place: "sea-trail" }],
    ["子供連れでも大丈夫ですか？", { kind: "kids" }],
    ["高齢の両親と一緒でも大丈夫？", { kind: "parents" }],
    ["階段は多いですか", { kind: "walk" }],
    ["明日雨が降ったらどうしよう", { kind: "rain" }],
    ["日の出が見られる場所は？", { kind: "sunrise" }],
    ["写真映えするスポットを教えて", { kind: "photo" }],
    ["夜に行ける所はありますか", { kind: "night" }],
    ["お腹すいた、近くでご飯食べられる所", { kind: "food" }],
    ["コーヒーが飲みたい", { kind: "cafe" }],
    ["駐車場はどこですか", { kind: "faq:주차" }],
    ["ソウルからの行き方を教えて", { kind: "faq:가는법" }],
    ["お土産は何がいい？", { kind: "faq:특산물" }],
    ["テラロサってどんな所？", { kind: "place", place: "terarosa" }],
    ["幻仙窟を追加して", { kind: "add", add: "hwanseon" }],
    ["船橋荘にも行きたい", { kind: "add", add: "seongyojang" }],
    ["鏡浦海水浴場を外して", { kind: "remove", remove: "gyeongpo-beach" }],
    ["2日目にカフェをもう一つ追加して", { kind: "addCat" }],
    ["カフェはなしで", { kind: "prefs", avoid: "cafe" }],
    ["もっとのんびり回りたい", { kind: "prefs" }],
    ["あまり歩きたくない", { kind: "prefs" }],
    ["テッマルは混んでますか", { kind: "place", place: "toetmaru" }],
    ["中央市場は何時まで？", { kind: "hours", place: "central-market" }],
    ["チャンポンスンドゥブは辛い？", { kind: "place", place: "jjamppong-tofu" }],
    ["霊琴亭の営業時間", { kind: "hours", place: "yeonggeumjeong", region: "seorak" }],
    ["南怡島の入場料", { kind: "fee", place: "nami", region: "chuncheon" }],
    ["羊牧場は子供と行っても楽しい？", { kind: "kids", place: "sheep", region: "pyeongchang" }],
  ],
  zh: [
    ["乌竹轩几点开门？", { kind: "hours", place: "ojukheon" }],
    ["镜浦台要门票吗", { kind: "fee", place: "gyeongpodae" }],
    ["ARTE MUSEUM门票多少钱", { kind: "fee", place: "arte" }],
    ["海浪步道要走多久？", { kind: "duration", place: "sea-trail" }],
    ["带孩子去可以吗？", { kind: "kids" }],
    ["带父母去会不会太累", { kind: "parents" }],
    ["台阶多吗", { kind: "walk" }],
    ["明天下雨怎么办", { kind: "rain" }],
    ["哪里可以看日出？", { kind: "sunrise" }],
    ["有什么拍照打卡的地方", { kind: "photo" }],
    ["晚上可以去哪里", { kind: "night" }],
    ["饿了，附近有什么好吃的", { kind: "food" }],
    ["想喝咖啡", { kind: "cafe" }],
    ["在哪里停车？", { kind: "faq:주차" }],
    ["从首尔怎么去？", { kind: "faq:가는법" }],
    ["有什么特产可以买", { kind: "faq:특산물" }],
    ["Terarosa咖啡怎么样？", { kind: "place", place: "terarosa" }],
    ["加上幻仙窟", { kind: "add", add: "hwanseon" }],
    ["我也想去船桥庄", { kind: "add", add: "seongyojang" }],
    ["去掉镜浦海水浴场", { kind: "remove", remove: "gyeongpo-beach" }],
    ["第2天再加一个咖啡店", { kind: "addCat" }],
    ["不要咖啡店", { kind: "prefs", avoid: "cafe" }],
    ["想轻松一点慢慢玩", { kind: "prefs" }],
    ["少走路", { kind: "prefs" }],
    ["Toetmaru要排队吗", { kind: "place", place: "toetmaru" }],
    ["中央市场几点关门？", { kind: "hours", place: "central-market" }],
    ["炒码面嫩豆腐辣吗？", { kind: "place", place: "jjamppong-tofu" }],
    ["灵琴亭营业时间", { kind: "hours", place: "yeonggeumjeong", region: "seorak" }],
    ["南怡岛门票多少钱", { kind: "fee", place: "nami", region: "chuncheon" }],
    ["羊群牧场适合带孩子吗？", { kind: "kids", place: "sheep", region: "pyeongchang" }],
    ["南怡島門票多少錢", { kind: "fee", place: "nami", region: "chuncheon" }],
  ],
};


// 튜닝에 쓰지 않은 두 번째 묶음 (일반화 확인용). --holdout 으로 이 묶음만 잰다
const HOLDOUT = {
  ko: [
    ["정동진 시간박물관 휴무일 있어?", { kind: "hours", place: "time-museum" }],
    ["하슬라아트월드 가격", { kind: "fee", place: "haslla" }],
    ["경포호 한 바퀴 몇 분 걸려", { kind: "duration", place: "gyeongpo-lake" }],
    ["유모차 끌고 다닐 수 있나", { kind: "walk" }],
    ["비 오면 일정 어떻게 돼?", { kind: "rain" }],
    ["저녁 먹을 데 추천해줘", { kind: "food" }],
    ["주문진수산시장 추가", { kind: "add", add: "jumunjin-market" }],
    ["안목해변은 안 갈래", { kind: "remove", remove: "anmok-beach" }],
    ["박물관 말고 바다 위주로", { kind: "prefs", avoid: "culture" }],
    ["강릉 특산물 뭐 있어", { kind: "faq:특산물" }],
    ["보헤미안 커피 어때", { kind: "place", place: "bohemian" }],
    ["아바이마을 갯배 몇시까지 해?", { kind: "hours", place: "abai", region: "seorak" }],
    ["뮤지엄산 입장료", { kind: "fee", place: "museum-san", region: "wonju" }],
    ["소금산 출렁다리 무서워?", { kind: "place", place: "sogeumsan", region: "wonju" }],
    ["숙소는 어디서 자?", { kind: "faq:숙소" }],
  ],
  en: [
    ["Is the Time Museum closed on Mondays?", { kind: "hours", place: "time-museum" }],
    ["How much is Haslla Art World?", { kind: "fee", place: "haslla" }],
    ["How long to walk around Gyeongpo Lake?", { kind: "duration", place: "gyeongpo-lake" }],
    ["Can I use a stroller?", { kind: "walk" }],
    ["It might rain, any ideas?", { kind: "rain" }],
    ["Recommend a place for dinner", { kind: "food" }],
    ["Add Jumunjin fish market", { kind: "add", add: "jumunjin-market" }],
    ["Skip Anmok Beach", { kind: "remove", remove: "anmok-beach" }],
    ["No museums, more beaches", { kind: "prefs", avoid: "culture" }],
    ["What's Gangneung famous for to bring home?", { kind: "faq:특산물" }],
    ["What's Bohemian Roasters like?", { kind: "place", place: "bohemian" }],
    ["When does the Abai Village ferry close?", { kind: "hours", place: "abai", region: "seorak" }],
    ["Museum SAN admission", { kind: "fee", place: "museum-san", region: "wonju" }],
    ["Is the Sogeumsan suspension bridge scary?", { kind: "place", place: "sogeumsan", region: "wonju" }],
    ["Where are we staying?", { kind: "faq:숙소" }],
  ],
  ja: [
    ["正東津時間博物館は定休日ある？", { kind: "hours", place: "time-museum" }],
    ["ハスラ・アートワールドの料金は？", { kind: "fee", place: "haslla" }],
    ["鏡浦湖を一周するのに何分？", { kind: "duration", place: "gyeongpo-lake" }],
    ["ベビーカーでも回れる？", { kind: "walk" }],
    ["雨の日はどうなる？", { kind: "rain" }],
    ["夕食におすすめの店", { kind: "food" }],
    ["注文津水産市場を追加", { kind: "add", add: "jumunjin-market" }],
    ["安木海水浴場には行かない", { kind: "remove", remove: "anmok-beach" }],
    ["博物館はいらない、海中心で", { kind: "prefs", avoid: "culture" }],
    ["江陵の名産は？", { kind: "faq:특산물" }],
    ["ボヘミアンのコーヒーはどう？", { kind: "place", place: "bohemian" }],
    ["アバイ村の渡し船は何時まで？", { kind: "hours", place: "abai", region: "seorak" }],
    ["ミュージアムSANの入場料", { kind: "fee", place: "museum-san", region: "wonju" }],
    ["小金山の吊り橋は怖い？", { kind: "place", place: "sogeumsan", region: "wonju" }],
    ["どこに泊まるの？", { kind: "faq:숙소" }],
  ],
  zh: [
    ["正东津时间博物馆有休息日吗？", { kind: "hours", place: "time-museum" }],
    ["哈斯拉艺术世界票价", { kind: "fee", place: "haslla" }],
    ["绕镜浦湖一圈要多久？", { kind: "duration", place: "gyeongpo-lake" }],
    ["可以推婴儿车吗？", { kind: "walk" }],
    ["下雨天怎么安排？", { kind: "rain" }],
    ["推荐吃晚餐的地方", { kind: "food" }],
    ["加上注文津水产市场", { kind: "add", add: "jumunjin-market" }],
    ["不去安木海水浴场了", { kind: "remove", remove: "anmok-beach" }],
    ["不要博物馆，多去海边", { kind: "prefs", avoid: "culture" }],
    ["江陵有什么特产？", { kind: "faq:특산물" }],
    ["Bohemian咖啡怎么样？", { kind: "place", place: "bohemian" }],
    ["阿爸村渡船几点结束？", { kind: "hours", place: "abai", region: "seorak" }],
    ["SAN博物馆门票", { kind: "fee", place: "museum-san", region: "wonju" }],
    ["小金山吊桥可怕吗？", { kind: "place", place: "sogeumsan", region: "wonju" }],
    ["我们住在哪里？", { kind: "faq:숙소" }],
  ],
};

// 세 번째 묶음: 처음 잴 때 ko 90%·en 90%·ja 80%·zh 90%였던 묶음 (이후 고쳐서 넣어 둠). pace는 "너무 빡빡해" 같은 말이 여유롭게로 가는지
const BLIND = {
  ko: [["추암 촛대바위 일출 몇 시쯤?", { kind: "sunrise", place: "chuam" }], ["오죽헌이랑 선교장 중에 아이랑 가기 좋은 곳", { kind: "kids" }], ["허균 기념공원 입장료 있나요", { kind: "fee", place: "heo-park" }], ["둘째 날 너무 빡빡해", { kind: "prefs", pace: "relaxed" }], ["강문해변에서 사진 찍기 좋아?", { kind: "photo", place: "gangmun-beach" }], ["주문진등대 넣자", { kind: "add", add: "jumunjin-lighthouse" }], ["걷는 거 힘든 곳 있어?", { kind: "walk" }], ["차 세울 곳 있어?", { kind: "faq:주차" }]],
  en: [["Which is better for kids, Ojukheon or Seongyojang?", { kind: "kids" }], ["Does the Heo Gyun park cost money?", { kind: "fee", place: "heo-park" }], ["Day 2 feels too packed", { kind: "prefs", pace: "relaxed" }], ["Fewer beaches, more nature", { kind: "prefs", avoid: "sea" }], ["Is Gangmun Beach good for photos?", { kind: "photo", place: "gangmun-beach" }], ["Let's add Jumunjin Lighthouse", { kind: "add", add: "jumunjin-lighthouse" }], ["Any places with a lot of walking?", { kind: "walk" }], ["Is there somewhere to park the car?", { kind: "faq:주차" }]],
  ja: [["烏竹軒と船橋荘、子どもにはどっち？", { kind: "kids" }], ["許筠記念公園は入場料ある？", { kind: "fee", place: "heo-park" }], ["2日目が詰め込みすぎ", { kind: "prefs", pace: "relaxed" }], ["江門海水浴場は写真映えする？", { kind: "photo", place: "gangmun-beach" }], ["注文津灯台を入れて", { kind: "add", add: "jumunjin-lighthouse" }], ["たくさん歩く所はある？", { kind: "walk" }], ["車を停める所はある？", { kind: "faq:주차" }]],
  zh: [["乌竹轩和船桥庄哪个适合孩子？", { kind: "kids" }], ["许筠纪念公园要门票吗", { kind: "fee", place: "heo-park" }], ["第二天太赶了", { kind: "prefs", pace: "relaxed" }], ["江门海水浴场适合拍照吗？", { kind: "photo", place: "gangmun-beach" }], ["加上注文津灯塔", { kind: "add", add: "jumunjin-lighthouse" }], ["有要走很多路的地方吗？", { kind: "walk" }], ["有地方停车吗？", { kind: "faq:주차" }]],
};

const SETS = process.argv.includes("--holdout") ? HOLDOUT : process.argv.includes("--blind") ? BLIND : Object.fromEntries(Object.keys(CASES).map((k) => [k, [...CASES[k], ...HOLDOUT[k], ...BLIND[k]]]));
const MIN = 0.95; // npm test 기준: 언어마다 95% 이상
const verbose = !process.argv.includes("--check");
let failedLangs = 0;
for (const [lang, cases] of Object.entries(SETS)) {
  let ok = 0;
  const bad = [];
  for (const [q, want] of cases) {
    const { input, opts, trip } = tripFor(want.region || "gangneung");
    const r = guideLocal(q, trip, 0, { input, opts, fees, lang: lang === "en" ? "en" : "ko", namesEn });
    const problems = [];
    if (r.kind !== want.kind) problems.push(`종류 ${r.kind}≠${want.kind}`);
    if (r.lang !== lang) problems.push(`언어 ${r.lang}≠${lang}`);
    const already = !r.changed && /이미 일정|already in your plan|もうプラン|已经在行程/.test(r.answer);
    if (want.add && !(r.add || []).includes(want.add) && !already) problems.push(`추가 ${r.add}`);
    if (want.remove && !(r.remove || []).includes(want.remove)) problems.push(`제외 ${r.remove}`);
    if (want.avoid && !(r.avoid || []).includes(want.avoid)) problems.push(`피하기 ${r.avoid}`);
    if (want.pace && r.pace !== want.pace) problems.push(`속도 ${r.pace}`);
    if (want.place && !["add", "remove"].includes(want.kind)) {
      const all = { ko: "", en: namesEn[want.place] || "" };
      void all;
      if (!r.answer.includes(want.place) && !mentionsPlace(r.answer, want.place, lang)) problems.push("장소 없음");
    }
    if (problems.length) bad.push(`  ✗ ${q} → ${problems.join(", ")} · "${r.answer.slice(0, 70)}"`);
    else ok++;
  }
  const rate = ok / cases.length;
  if (rate < MIN) failedLangs++;
  console.log(`${lang}: ${ok}/${cases.length} (${Math.round(rate * 100)}%)`);
  if (verbose || rate < MIN) for (const b of bad) console.log(b);
}

import { PLACES } from "../public/data.js";
import { NAMES_JA, NAMES_ZH } from "../public/knowledge-intl.js";
function mentionsPlace(answer, id, lang) {
  const p = PLACES.find((x) => x.id === id);
  const name = { ko: p.name, en: namesEn[id], ja: NAMES_JA[id], zh: NAMES_ZH[id] }[lang] || p.name;
  return answer.includes(name);
}

if (failedLangs) { console.error(`정확도 기준(${MIN * 100}%) 미달 언어 ${failedLangs}개`); process.exit(1); }
console.log("ok - 무료 간단 모드 정확도");
