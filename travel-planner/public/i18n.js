// 화면 언어 (한국어 / English / 日本語 / 中文): 고정 문구 사전과 장소 외국어 데이터를 한 곳에서 관리한다.
// - 일본어·중국어(간체) 사전은 i18n-cjk.js, 장소 이름·팁은 knowledge-intl.js.
// - 고정 문구는 한국어 원문을 키로 쓴다: t("일정 만들기") → EN이면 "Make my plan". 사전에 없으면 한국어 그대로.
// - {이름}은 값 자리: t("{n}곳", { n: 3 }) → "3 places"
// - 장소 이름·설명은 data-en.json(한국관광공사 영문 관광정보, scripts/bake-english.mjs)에서. 없으면 한국어 그대로.
// - 일정 엔진(planner.js)은 언어와 무관하게 그대로 쓰고, 화면에 보일 때만 바꾼다.

import { JA, ZH, REGION, AREA, BASE, LODGING, TYPE, REASON, BENEFIT, FEST, SOUVENIR } from "./i18n-cjk.js";
import { NAMES_JA, NAMES_ZH, TIPS_JA, TIPS_ZH } from "./knowledge-intl.js";

const KEY = "lang";
export const LANGS = ["ko", "en", "ja", "zh"];
function initialLang() {
  try { const s = localStorage.getItem(KEY); if (LANGS.includes(s)) return s; } catch { /* 저장소 없음 */ }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language || "ko"];
  const first = langs[0] || "";
  return /^ko\b/i.test(first) ? "ko" : /^ja\b/i.test(first) ? "ja" : /^zh\b/i.test(first) ? "zh" : "en";
}
let lang = initialLang();
export const getLang = () => lang;
export const isEN = () => lang === "en";
export const isForeign = () => lang !== "ko"; // 외국어 화면(영어·일본어·중국어): 원화 표기, 구글 우선 등
const HTML_LANG = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans" };
export function setLang(l) {
  lang = LANGS.includes(l) ? l : "ko";
  try { localStorage.setItem(KEY, lang); } catch { /* 기억 못 해도 동작 */ }
  document.documentElement.lang = HTML_LANG[lang];
}

/* ---------- 고정 문구 ---------- */
const EN = {
  // 머리글·첫 화면
  "오늘강원": "Oneul Gangwon",
  "링크 공유": "Share",
  "캘린더 저장": "Calendar",
  "강원 여행 일정,<br>고르기만 하세요": "Your Gangwon trip,<br>just pick and go",
  "오늘의 강원": "Today in Gangwon",
  "예) 주말에 부모님이랑 속초 1박": "e.g. Sokcho with my parents this weekend, 1 night",
  "만들기": "Create",
  "어디로": "Where",
  "언제": "When",
  "누구와": "With whom",
  "좋아하는 것 <em>여러 개 가능</em>": "Interests <em>pick any</em>",
  "이동": "Getting around",
  "강릉·동해": "Gangneung · Donghae",
  "속초·양양": "Sokcho · Yangyang",
  "춘천·철원": "Chuncheon · Cheorwon",
  "평창·정선": "Pyeongchang · Jeongseon",
  "원주": "Wonju",
  "당일": "Day trip",
  "1박 2일": "2 days, 1 night",
  "2박 3일": "3 days, 2 nights",
  "3박 4일": "4 days, 3 nights",
  "4박 5일": "5 days, 4 nights",
  "택시": "Taxi",
  "혼자": "Solo",
  "연인·친구": "Partner · friends",
  "아이와": "With kids",
  "부모님과": "With parents",
  "바다": "Sea",
  "카페": "Cafés",
  "맛집": "Local food",
  "역사·문화": "History · culture",
  "자연·산책": "Nature · walks",
  "자동차": "Car",
  "대중교통·도보": "Transit · walking",
  "일정 만들기": "Make my plan",
  "사장님이세요? 메뉴판 사진 한 장으로 가게 등록": "Own a shop? Register it with one photo of your menu (Korean)",
  // 결과 화면
  "조건 변경": "Edit choices",
  "비가 와요": "It's raining",
  "덜 걷고 싶어요": "Less walking",
  "여유롭게": "Relaxed",
  "더 알차게": "Pack more in",
  "AI 가이드": "AI guide",
  "비 오면 어떡해?": "What if it rains?",
  "아이랑 가도 괜찮을까?": "Is it OK with kids?",
  "오늘 운영시간 알려줘": "Today's opening hours?",
  "예) 2일차에 바다 한 곳 더 넣어줘": "e.g. Add one more beach on day 2",
  "보내기": "Send",
  "{n}곳": "{n} places",
  "이동 {t}": "Travel {t}",
  "영업시간 충돌 {n}건": "{n} opening-hours conflicts",
  "영업시간·휴무 확인 완료": "Hours & closing days checked",
  "실제 도로 기준": "Real road times",
  "{n}일차": "Day {n}",
  " · 비 {p}%": " · rain {p}%",
  "조건에 맞는 장소가 없어요. 조건을 바꿔보세요.": "No places match. Try changing your choices.",
  "{start}에서 {mode} {min}분": "From {start}: {mode} {min} min",
  "{mode} {min}분": "{mode} {min} min",
  "실내": "Indoor",
  "길찾기": "Directions",
  "바꾸기": "Swap",
  // 분류·이동
  "식사": "Meal", "문화": "Culture", "자연": "Nature", "축제": "Festival",
  "점심": "Lunch", "저녁": "Dinner",
  "도보": "Walk", "차": "Drive", "버스": "Bus", "바로 옆": "Next door",
  // 운영시간
  "축제 기간 {a}–{b}": "Festival {a}–{b}",
  "상시 개방": "Always open",
  "가게별 상이 · 대체로 {a}–{b}": "Varies by shop · mostly {a}–{b}",
  "운영 {a}–{b}": "Open {a}–{b}",
  " · 주문 {t}까지": " · last order {t}",
  " · 입장 {t}까지": " · last entry {t}",
  " · 휴식 {r}": " · break {r}",
  // 축제
  "매년 {m}월 · 날짜 발표 전": "Every {m} · dates TBA",
  "일정에 넣었어요": "In your plan",
  "여행 기간의 강원 축제": "Gangwon festivals during your trip",
  "{n}개 더 보기": "Show {n} more",
  // 숙소
  "추천 숙소 · {n}박 내내": "Recommended stay · all {n} nights",
  "추천 숙소 · 1박": "Recommended stay · 1 night",
  " · 다른 선택: {o}": " · Other options: {o}",
  "네이버에서 찾기": "Search on Naver",
  "카카오맵": "Kakao Map",
  "예약 전 안심 체크": "Pre-booking check",
  "예약하려는 숙소 페이지의 가격, 취소·환불 규정, 후기를 그대로 붙여넣으세요": "Paste the price, cancellation policy and reviews from the lodging page you want to book",
  "확인": "Check",
  "확인 중…": "Checking…",
  "숙소 페이지 내용을 조금 더 붙여넣어 주세요": "Please paste a bit more of the lodging page",
  "안심": "OK", "주의": "Caution", "위험": "Risk",
  "취소·환불: ": "Cancellation: ", "가격: ": "Price: ", "후기: ": "Reviews: ",
  "예약 전에 물어볼 것: ": "Ask before booking: ",
  "숙소({name})로 · 약 {km}km": "To your stay ({name}) · about {km} km",
  "숙소 · {name}": "Stay · {name}",
  "이 지역 추천 숙소": "Places to stay in this area",
  // 출발지
  "출발": "Start",
  "출발지 바꾸기": "Change",
  "지금 위치에서": "From my location",
  "기본(권역 역·터미널)": "Default (station·terminal)",
  "출발지 검색 (예: 서울역, 경포, 동서울)": "Search a starting point (e.g. Seoul Station, Gyeongpo)",
  "첫날 출발 시각": "Departure on day 1",
  "자동": "Auto",
  "고른 출발지는 이 기기에 저장돼요. 자동: 가까우면 10시, 멀면(60km 넘게) 8시에 출발": "Your starting point is saved on this device. Auto: leave at 10:00 if nearby, 08:00 if over 60 km away",
  "{name} (기본)": "{name} (default)",
  "내 위치": "My location",
  "최근 출발지": "Recent",
  "검색 결과가 없어요": "No matches",
  "출발지를 {name}(으)로 정했어요": "Starting point set to {name}",
  "위치를 찾는 중…": "Finding your location…",
  // 예상 비용
  " · 약 {won}": " · about {won}",
  " · 택시 약 {won}": " · taxi about {won}",
  "예상 비용": "Estimated cost",
  "1인당 {r}": "{r} per person",
  "어른": "Adults",
  "어린이": "Children",
  "자동차 연료": "Fuel",
  "입장료": "Admission",
  "식사·카페": "Meals & cafés",
  "숙박": "Lodging",
  "명": " person(s)",
  "실": " room(s)",
  "강원 중형택시 요금(2024년 8월 조정)": "Gangwon taxi fares (Aug 2024)",
  "오피넷 전국 휘발유 평균(2026년 10월)": "Opinet national gasoline average (Oct 2026)",
  "{n}구간 · 택시 {cars}대 · {src}": "{n} rides · {cars} taxi(s) · {src}",
  " · 출발지에서 오는 먼 구간은 기차·버스 요금 별도": " · the long trip from your starting point (train/bus) is not included",
  "약 {km}km · 연비 {eff}km/L · {src}": "about {km} km · {eff} km/L · {src}",
  "{n}번 탑승 · 1회 {fare}": "{n} rides · {fare} each",
  " · 먼 구간 {n}번은 시외버스라 요금 확인 필요": " · {n} long ride(s) are intercity buses, check fares",
  "요금 확인된 {n}곳 (한국관광공사)": "{n} places with known fees (Korea Tourism Organization)",
  " · 요금 정보 없음: {names}": " · no fee info: {names}",
  "점심 {l} · 저녁 {d} · 카페 {c} (앱 가정: 1인 점심 {a}, 저녁 {b})": "{l} lunches · {d} dinners · {c} cafés (app assumption per person: lunch {a}, dinner {b})",
  "{n}박 · {units}{unit} · {type} (앱 가정: 평균 범위, 주말·성수기엔 더 비쌈)": "{n} night(s) · {units}{unit} · {type} (app assumption: typical range, higher on weekends and in peak season)",
  "집에서 강원까지 오가는 교통비, 주차·통행료, 쇼핑은 빠져 있어요. 식사·숙박은 앱이 정한 평균 범위라 실제와 다를 수 있어요.": "Not included: travel to and from Gangwon, parking and tolls, shopping. Meals and lodging use typical ranges set by the app and may differ.",
  "바다·호수 전망": "Sea/lake view",
  "{km}km": "{km} km away",
  "네이버": "Naver",
  "구글": "Google",
  "지도": "Map",
  "최저가 비교": "Compare prices",
  "이 지역 숙소 최저가 비교": "Compare lodging prices here",
  "한국관광공사 숙박 정보 기준 · 전망 표시는 관광공사 소개글에 적힌 곳만 · 최저가 비교는 여러 예약 사이트의 가격을 한 화면에 보여 줘요. 날짜를 고르면 그날 가장 싼 곳을 찾을 수 있어요": "From Korea Tourism Organization lodging data · views marked only when its description says so · Compare prices shows several booking sites side by side. Pick your dates to find the cheapest one",
  "카카오": "Kakao",
  "한국관광공사 숙박 정보 기준 · 전망 표시는 관광공사 소개글에 적힌 곳만 · 가격과 빈 방은 예약 사이트에서 확인하세요": "From Korea Tourism Organization lodging data · views marked only when its description says so · check prices and availability on booking sites",
  "숙소({name})": "Stay ({name})",
  // 혜택
  "이 일정으로 받는 혜택": "Benefits for this trip",
  "현장 환급 {n}원": "On-site refund ₩{n}",
  "일정에 포함 · 현장에서 받기": "In your plan · claim on site",
  "신청 가능 · {d} 마감": "Open · apply by {d}",
  "하반기 공고 확인 필요": "Check the second-half announcement",
  "증빙 {a}/{b}": "Proofs {a}/{b}",
  " {n}장": " ×{n}",
  "증빙 보관함 보기": "View saved proofs",
  "삭제": "Delete",
  "증빙을 보관함에 넣었어요": "Saved to your proofs",
  "저장 공간이 부족해요. 사진을 몇 장 지워주세요": "Storage is full. Please delete a few photos",
  "사진을 읽지 못했어요": "Couldn't read the photo",
  "입장권": "Ticket", "숙박 영수증": "Lodging receipt", "관광 소비 영수증": "Tourism spending receipt",
  "식당 영수증": "Restaurant receipt", "체험시설 이용 증빙": "Activity receipt", "관광지 인증사진 2곳 이상": "Photos at 2+ attractions",
  // 1박 전환
  "하룻밤 더하면": "If you stay one night",
  "볼 수 있는 곳": "More places",
  "+{n}곳": "+{n}",
  "밤 코스": "Evening",
  "{t}까지": "until {t}",
  "없음": "None",
  "숙소": "Stay",
  "밤 코스: ": "Evening: ",
  "둘째 날: ": "Day 2: ",
  "다음 날 축제: ": "Festivals next day: ",
  "받을 수 있는 혜택: ": "Benefits: ",
  "추가 비용: 숙박비({type})와 식사 2끼 · 숙박비는 날짜마다 달라 검색으로 확인하세요": "Extra cost: lodging ({type}) and 2 meals · lodging prices vary by date, so check when booking",
  "1박 2일로 바꾸기": "Switch to 2 days, 1 night",
  "1박 2일로 바꿨어요": "Switched to 2 days, 1 night",
  // 가게·특산물
  "사장님이 직접 등록한 가게": "Shops registered by their owners",
  "메뉴 {n}개 · 4개 언어": "{n} menu items · 4 languages",
  "집에서 다시 맛보기": "Taste it again at home",
  "{from}에서": "from {from}",
  "검색어 복사": "Copy search term",
  "{mall}(강원도 공식 쇼핑몰)에서 주문하기": "Order at {mall} (Gangwon's official online mall, Korean)",
  "\"{t}\" 복사했어요": "Copied \"{t}\"",
  "지난 {region} 여행에서 먹은 {items}": "From your last {region} trip: {items}",
  "집에서 다시 주문": "Reorder at home",
  // 지도
  "출": "S", "숙": "H",
  "내 위치": "My location",
  "위치를 사용할 수 없어요": "Location is not available",
  "위치 권한을 허용해 주세요": "Please allow location access",
  // 조작·알림
  "{name}(으)로 바꿨어요": "Swapped to {name}",
  "대신 갈 수 있는 곳이 없어 뺐어요": "No alternative fits, so it was removed",
  "생각 중": "Thinking",
  " ({names}은(는) 영업시간·휴무가 맞지 않아 넣지 못했어요)": " (Couldn't add {names}: opening hours or closing days don't fit)",
  " 영업시간을 다시 확인해 일정에 반영했어요.": " Opening hours re-checked and your plan updated.",
  "강원 여행 일정": "Gangwon trip plan",
  "링크를 복사했어요": "Link copied",
  "비 예보가 있는 날은 실내 위주로 바꿨어요": "Rain is forecast, so those days now focus on indoor places",
  "AI에 연결되지 않아 간단 모드로 처리했어요": "AI is unavailable, so simple mode was used",
};

const DICT = { en: EN, ja: JA, zh: ZH };
export function t(ko, vars) {
  const d = DICT[lang];
  let s = d && Object.hasOwn(d, ko) ? d[ko] : ko;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
  return s;
}

/* ---------- 날짜·시간 ---------- */
const WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];
const WEEK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEK_JA = ["日", "月", "火", "水", "木", "金", "土"];
const WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"];
export function dateLabel(ds) {
  const [y, m, d] = ds.split("-").map(Number);
  const w = new Date(y, m - 1, d).getDay();
  if (lang === "en") return `${WEEK_EN[w]}, ${MONTH_EN[m - 1]} ${d}`;
  if (lang === "ja") return `${m}月${d}日(${WEEK_JA[w]})`;
  if (lang === "zh") return `${m}月${d}日 周${WEEK_ZH[w]}`;
  return `${m}월 ${d}일 (${WEEK_KO[w]})`;
}
export function minutesLabel(min) {
  const h = Math.floor(min / 60), r = min % 60;
  if (lang === "en") return h ? `${h}h${r ? ` ${r}m` : ""}` : `${r} min`;
  if (lang === "ja") return h ? `${h}時間${r ? `${r}分` : ""}` : `${r}分`;
  if (lang === "zh") return h ? `${h}小时${r ? `${r}分钟` : ""}` : `${r}分钟`;
  return h ? `${h}시간${r ? ` ${r}분` : ""}` : `${r}분`;
}
export const monthsLabel = (months) => (lang === "en" ? months.map((m) => MONTH_EN[m - 1]).join("·") : months.join("·"));

/* ---------- 지역·숙소·혜택 (앱이 정한 이름이라 직접 번역) ---------- */
const REGION_EN = { gangneung: "Gangneung·Donghae", seorak: "Sokcho·Yangyang", chuncheon: "Chuncheon·Cheorwon", pyeongchang: "Pyeongchang·Jeongseon", wonju: "Wonju" };
const AREA_EN = {
  "경포·초당": "Gyeongpo·Chodang", "안목·남항진": "Anmok·Namhangjin", "강릉 시내": "Downtown Gangneung", "사천·주문진": "Sacheon·Jumunjin",
  "정동진": "Jeongdongjin", "구정·성산": "Gujeong·Seongsan", "동해 묵호·추암": "Donghae Mukho·Chuam", "삼척": "Samcheok",
  "속초 시내": "Downtown Sokcho", "설악산": "Seoraksan", "고성": "Goseong", "양양": "Yangyang", "인제": "Inje",
  "춘천 시내": "Downtown Chuncheon", "남이섬·김유정": "Nami Island·Kim Yu-jeong", "철원": "Cheorwon", "화천": "Hwacheon",
  "대관령": "Daegwallyeong", "오대산·진부": "Odaesan·Jinbu", "정선": "Jeongseon", "영월": "Yeongwol", "태백": "Taebaek",
  "원주 시내": "Downtown Wonju", "간현·지정": "Ganhyeon·Jijeong", "치악산": "Chiaksan",
};
const BASE_EN = { "강릉역": "Gangneung Station", "속초시외버스터미널": "Sokcho Intercity Bus Terminal", "춘천역": "Chuncheon Station", "진부역": "Jinbu Station", "원주역": "Wonju Station" };
const LODGING_EN = {
  "l-gyeongpo": ["Gyeongpo", "Ocean-view hotels and resorts by Gyeongpo Beach and lake"],
  "l-anmok": ["Gangmun·Anmok", "Hotels and stylish stays right on the beach"],
  "l-gn-station": ["Gangneung Station·downtown", "Near the KTX station, easy by public transport"],
  "l-jeongdongjin": ["Jeongdongjin", "Watch the sunrise from your room"],
  "l-jumunjin": ["Jumunjin·Sacheon", "Quiet seaside pensions"],
  "l-mukho": ["Donghae Mukho", "Sea-view stays on the harbor hill"],
  "l-samcheok": ["Samcheok beaches", "Large resorts and beach pensions"],
  "l-sokcho": ["Sokcho beach·downtown", "Ocean-view hotels by the beach and stays near the terminal"],
  "l-seorakdong": ["Seorak-dong", "Resorts and condos at the Seoraksan entrance"],
  "l-yangyang": ["Yangyang Jukdo·Surfyy Beach", "Surf-town guesthouses and sea-view hotels"],
  "l-goseong": ["Goseong beaches", "Quiet beach resorts"],
  "l-inje": ["Inje", "Pensions by the valley stream"],
  "l-cc-city": ["Chuncheon Station·Myeong-dong", "Near the station and the dakgalbi street"],
  "l-uiam": ["Uiamho Lake", "Lake-view hotels"],
  "l-gangchon": ["Nami Island·Gangchon", "Resorts and riverside pensions"],
  "l-cheorwon": ["Cheorwon", "Stays near the Hantangang River"],
  "l-hwacheon": ["Hwacheon", "Bukhangang riverside pensions"],
  "l-yongpyong": ["Daegwallyeong·Yongpyong", "Ski resorts and condos"],
  "l-jinbu": ["Jinbu·Odaesan", "Near Jinbu Station, temple stays nearby"],
  "l-jeongseon": ["Jeongseon-eup", "Riverside pensions and hanok"],
  "l-gohan": ["Gohan·Sabuk", "Mountain-top resorts"],
  "l-yeongwol": ["Yeongwol", "Donggang River resorts and pensions"],
  "l-taebaek": ["Taebaek", "Downtown hotels"],
  "l-wj-city": ["Downtown Wonju", "Hotels near the station and terminal"],
  "l-jijeong": ["Wonju Jijeong-myeon", "Resorts next to Museum SAN"],
  "l-chiak": ["Chiaksan", "Pensions at the foot of the mountain"],
};
const TYPE_EN = { guesthouse: "Guesthouse", business: "Business hotel", ocean: "Hotel with a view", pension: "Pension", resort: "Resort·condo", hanok: "Hanok stay" };
const TYPE_KO_TO_KEY = { "게스트하우스": "guesthouse", "비즈니스호텔": "business", "전망 좋은 호텔": "ocean", "펜션": "pension", "리조트·콘도": "resort", "한옥스테이": "hanok" };
const REASON_EN = {
  guesthouse: "Affordable and easy to meet other solo travelers",
  business: "Clean and close to the station or terminal",
  ocean: "Sea or lake views from your window",
  pension: "Quiet, with room for a barbecue",
  resort: "Family facilities such as kitchens and pools",
  hanok: "Quiet and comfortable with heated ondol floors",
};
const BENEFIT_EN = {
  "b-soyang": { title: "Soyanggang Skywalk ticket refund", how: "Get your ₩2,000 ticket back as a ₩2,000 Chuncheon local gift voucher" },
  "b-hantan": { title: "Hantangang Jusangjeolli Trail voucher refund", how: "Get ₩5,000 of the ₩10,000 ticket back as a Cheorwon local gift voucher" },
  "b-hoengseong": { title: "Hoengseong Lake Trail ticket refund", how: "Get your ₩2,000 ticket back as a tourism gift voucher of the same amount" },
  "b-incentive": {
    title: "Benefit GO! Gangwon travel",
    how: "Visitors from outside Gangwon get ₩30,000 back for ₩60,000+ at registered lodging, and ₩10,000 for ₩50,000+ tourism spending, as mobile Gangwon gift vouchers",
    steps: ["Sign up for Gangwon Hyetaek Easy", "Get a Gangwon Life Resident card", "Verify receipts"],
    note: "Paid as mobile Gangwon gift vouchers (Bpay)",
  },
  "b-halfprice": {
    title: "Half-price travel (local vacation support)",
    how: "Get 50% of travel costs back as local gift vouchers (up to ₩100,000 per person, ₩200,000 for 2+ people)",
    steps: ["Apply and get approved before the trip", "Submit proofs after the trip", "Vouchers paid after review"],
    note: "Only card, cash-receipt or mobile payment records count (no simple receipts or bank transfers) · check the second-half announcement on Korea Tourism Organization's VisitKorea",
  },
};

// 언어별 표: 영어는 이 파일, 일본어·중국어는 i18n-cjk.js
const pick = (tables) => tables[lang];
const T_REGION = { en: REGION_EN, ...REGION }, T_AREA = { en: AREA_EN, ...AREA }, T_BASE = { en: BASE_EN, ...BASE };
const T_LODGING = { en: LODGING_EN, ...LODGING }, T_TYPE = { en: TYPE_EN, ...TYPE }, T_REASON = { en: REASON_EN, ...REASON }, T_BENEFIT = { en: BENEFIT_EN, ...BENEFIT };
export const regionLabel = (key, ko) => pick(T_REGION)?.[key] || ko;
export const areaName = (ko) => pick(T_AREA)?.[ko] || ko;
export const lodgingName = (l) => pick(T_LODGING)?.[l.id]?.[0] || l.name;
export const lodgingDesc = (l) => pick(T_LODGING)?.[l.id]?.[1] || l.desc;
export const typeLabel = (type, ko) => pick(T_TYPE)?.[type] || ko;
export const typeLabelFromKo = (ko) => pick(T_TYPE)?.[TYPE_KO_TO_KEY[ko]] || ko;
export const lodgingReason = (l) => pick(T_REASON)?.[l.type] || l.reason;
export function benefitText(b, field) {
  return pick(T_BENEFIT)?.[b.id]?.[field] ?? b[field];
}
// 특산물: 외국어 화면은 번역 + 한국어(강원더몰에서 그대로 검색하는 말)
export const souvenirName = (ko) => (lang === "ko" || !SOUVENIR[lang]?.[ko] ? ko : `${SOUVENIR[lang][ko]} (${ko})`);
// 출발점: 기준 역 또는 "숙소(경포)"
export function startName(start, lodging) {
  if (lang === "ko") return start.name;
  if (start.nameEn) return start.nameEn;
  if (start.name.startsWith("숙소") && lodging) return t("숙소({name})", { name: lodgingName(lodging) });
  return pick(T_BASE)?.[start.name] || start.name;
}

/* ---------- 장소 영문 데이터 ---------- */
let dataEn = {};
let dataEnReady = null;
export function loadDataEn(fetcher = fetch) {
  return (dataEnReady ??= fetcher("data-en.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((j) => (dataEn = j || {})));
}
// 일본어·중국어: 장소는 knowledge-intl.js의 이름, 축제는 i18n-cjk.js의 이름 (없으면 영어, 그다음 한국어)
const NAMES = { ja: NAMES_JA, zh: NAMES_ZH };
export const placeName = (p) => {
  if (lang === "ko") return p.name;
  if (lang === "en") return dataEn[p.id]?.name || p.name;
  return NAMES[lang][p.id] || FEST[lang][p.id] || dataEn[p.id]?.name || p.name;
};
// 무료 간단 모드 가이드가 영어 질문 속 장소 이름을 알아듣도록
export const namesEn = () => Object.fromEntries(Object.entries(dataEn).map(([id, v]) => [id, v.name]));
const TIPS_CJK = { ja: TIPS_JA, zh: TIPS_ZH };
const firstSentence = (s) => (s.match(/^.*?。/) || [s])[0];
export const placeDesc = (p) => {
  if (lang === "ko") return p.desc;
  if (lang === "en") return dataEn[p.id]?.desc || p.desc;
  const tip = TIPS_CJK[lang][p.id];
  return tip ? firstSentence(tip) : dataEn[p.id]?.desc || p.desc; // 축제는 영어 소개(관광공사)
};

/* ---------- index.html의 고정 문구 ----------
   data-i18n: 내용(innerHTML), data-i18n-ph: placeholder, data-i18n-title: title·aria-label.
   처음 바꿀 때 한국어 원문을 data-ko에 보관해 두고, 그 원문을 키로 찾는다. */
export function applyStatic(root = document) {
  document.documentElement.lang = HTML_LANG[lang];
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.dataset.ko ??= el.innerHTML.trim();
    el.innerHTML = t(el.dataset.ko);
  });
  root.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.dataset.koPh ??= el.placeholder;
    el.placeholder = t(el.dataset.koPh);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.dataset.koTitle ??= el.title || el.getAttribute("aria-label") || "";
    el.title = t(el.dataset.koTitle);
    el.setAttribute("aria-label", el.title);
  });
  document.title = t("오늘강원");
  root.querySelectorAll("[data-lang]").forEach((b) => {
    const on = b.dataset.lang === lang;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
  });
}
