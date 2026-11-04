// 강릉 장소 데이터 (운영정보 확인: 2026년 11월)
// hours: [열림, 닫힘], lastEntry: 입장·주문 마감, breaks: 브레이크타임 목록
// closed: 정기 휴무 요일 (0=일 ... 6=토)
// byDay: 요일별로 다른 운영시간 { 요일: [열림, 닫힘] }
// seasons: 계절별 운영시간 [{ months: [...], hours, lastEntry }]
// multi: 여러 가게가 모인 거리 (가게마다 운영시간이 다름, hours는 대부분 가게가 여는 시간)
// 출처마다 시간이 다르면 가장 보수적인(짧은) 시간을 사용
// stay: 권장 체류(분), walk: 걷는 양 1~3, pop: 인기도 1~3
// tags: kids(아이 동반 적합), senior(부모님 동반 적합), night(저녁에 좋음)

export const CHECKED = "2026-11";

// 권역: 선택지는 5개
export const REGIONS = {
  gangneung: { label: "강릉·동해", base: { name: "강릉역", lat: 37.7643, lng: 128.8996 } },
  seorak: { label: "속초·양양", base: { name: "속초시외버스터미널", lat: 38.2063, lng: 128.5910 } },
  chuncheon: { label: "춘천·철원", base: { name: "춘천역", lat: 37.8847, lng: 127.7170 } },
  pyeongchang: { label: "평창·정선", base: { name: "진부역", lat: 37.6469, lng: 128.5636 } },
  wonju: { label: "원주", base: { name: "원주역", lat: 37.3190, lng: 127.9200 } },
};
export const BASE = REGIONS.gangneung.base;

export const AREAS = {
  // 강릉·동해
  gyeongpo: { region: "gangneung", name: "경포·초당", lat: 37.795, lng: 128.902 },
  anmok: { region: "gangneung", name: "안목·남항진", lat: 37.770, lng: 128.948 },
  downtown: { region: "gangneung", name: "강릉 시내", lat: 37.756, lng: 128.897 },
  north: { region: "gangneung", name: "사천·주문진", lat: 37.870, lng: 128.845 },
  south: { region: "gangneung", name: "정동진", lat: 37.690, lng: 129.025 },
  inland: { region: "gangneung", name: "구정·성산", lat: 37.725, lng: 128.845 },
  donghae: { region: "gangneung", name: "동해 묵호·추암", lat: 37.540, lng: 129.120 },
  samcheok: { region: "gangneung", name: "삼척", lat: 37.300, lng: 129.150 },
  // 속초·양양·고성·인제
  sokcho: { region: "seorak", name: "속초 시내", lat: 38.200, lng: 128.594 },
  seoraksan: { region: "seorak", name: "설악산", lat: 38.173, lng: 128.490 },
  goseong: { region: "seorak", name: "고성", lat: 38.430, lng: 128.450 },
  yangyang: { region: "seorak", name: "양양", lat: 38.050, lng: 128.700 },
  inje: { region: "seorak", name: "인제", lat: 38.000, lng: 128.278 },
  // 춘천·화천·철원
  cc_city: { region: "chuncheon", name: "춘천 시내", lat: 37.880, lng: 127.725 },
  nami: { region: "chuncheon", name: "남이섬·김유정", lat: 37.810, lng: 127.620 },
  cheorwon: { region: "chuncheon", name: "철원", lat: 38.175, lng: 127.290 },
  hwacheon: { region: "chuncheon", name: "화천", lat: 38.106, lng: 127.708 },
  // 평창·정선·영월·태백
  daegwallyeong: { region: "pyeongchang", name: "대관령", lat: 37.685, lng: 128.720 },
  odaesan: { region: "pyeongchang", name: "오대산·진부", lat: 37.700, lng: 128.590 },
  jeongseon: { region: "pyeongchang", name: "정선", lat: 37.300, lng: 128.750 },
  yeongwol: { region: "pyeongchang", name: "영월", lat: 37.190, lng: 128.430 },
  taebaek: { region: "pyeongchang", name: "태백", lat: 37.180, lng: 128.975 },
  // 원주
  wj_city: { region: "wonju", name: "원주 시내", lat: 37.345, lng: 127.940 },
  ganhyeon: { region: "wonju", name: "간현·지정", lat: 37.385, lng: 127.820 },
  chiaksan: { region: "wonju", name: "치악산", lat: 37.404, lng: 128.048 },
};

const WINTER = [11, 12, 1, 2, 3];

const GANGNEUNG = [
  // 바다 (상시 개방 공공 해변, 일출 전·늦은 밤 제외)
  { id: "gyeongpo-beach", name: "경포해변", cat: "sea", area: "gyeongpo", lat: 37.8055, lng: 128.9087, hours: ["06:00", "22:00"], closed: [], stay: 50, indoor: false, walk: 2, pop: 3, tags: ["kids", "senior", "night"], wiki: "경포해수욕장", desc: "넓은 백사장과 소나무숲" },
  { id: "gangmun-beach", name: "강문해변", cat: "sea", area: "gyeongpo", lat: 37.7953, lng: 128.9180, hours: ["06:00", "22:00"], closed: [], stay: 40, indoor: false, walk: 1, pop: 2, tags: ["kids", "senior", "night"], wiki: "강문해수욕장", desc: "솟대다리와 포토존" },
  { id: "anmok-beach", name: "안목해변", cat: "sea", area: "anmok", lat: 37.7720, lng: 128.9478, hours: ["06:00", "22:00"], closed: [], stay: 40, indoor: false, walk: 1, pop: 3, tags: ["kids", "senior", "night"], wiki: "안목해변", desc: "커피거리 앞 바다" },
  { id: "namhangjin-beach", name: "남항진해변", cat: "sea", area: "anmok", lat: 37.7676, lng: 128.9531, hours: ["06:00", "22:00"], closed: [], stay: 30, indoor: false, walk: 1, pop: 1, tags: ["senior"], wiki: "남항진해수욕장", desc: "솔바람다리와 조용한 해변" },
  { id: "sacheon-beach", name: "사천해변", cat: "sea", area: "north", lat: 37.8420, lng: 128.8762, hours: ["06:00", "22:00"], closed: [], stay: 40, indoor: false, walk: 1, pop: 1, tags: ["kids", "senior"], wiki: "사천해수욕장", desc: "물이 맑고 한적한 해변" },
  { id: "yeongjin-beach", name: "영진해변 도깨비 촬영지", cat: "sea", area: "north", lat: 37.8716, lng: 128.8410, hours: ["06:00", "21:00"], closed: [], stay: 30, indoor: false, walk: 1, pop: 2, tags: [], wiki: "영진해수욕장", desc: "방파제 포토 스팟" },
  { id: "hyangho-beach", name: "향호해변 버스정류장", cat: "sea", area: "north", lat: 37.9135, lng: 128.8105, hours: ["06:00", "21:00"], closed: [], stay: 30, indoor: false, walk: 1, pop: 2, tags: [], wiki: "향호해수욕장", desc: "앨범 촬영지 정류장 세트" },
  { id: "jeongdongjin", name: "정동진해변", cat: "sea", area: "south", lat: 37.6905, lng: 129.0340, hours: ["05:00", "22:00"], closed: [], stay: 50, indoor: false, walk: 2, pop: 3, tags: ["kids", "senior"], wiki: "정동진역", desc: "바다와 가장 가까운 기차역" },
  {
    id: "sea-trail", name: "정동심곡 바다부채길", cat: "nature", area: "south", lat: 37.6866, lng: 129.0446,
    hours: ["09:00", "17:30"], lastEntry: "16:30",
    seasons: [{ months: WINTER, hours: ["09:00", "16:30"], lastEntry: "15:30" }],
    closed: [], stay: 70, indoor: false, walk: 3, pop: 3, tags: [], wiki: "정동심곡바다부채길", desc: "해안 절벽 2.9km 탐방로 · 풍랑특보 시 통제",
  },

  // 카페
  { id: "anmok-coffee", souvenir: "강릉 커피 원두", name: "안목 커피거리", cat: "cafe", area: "anmok", lat: 37.7727, lng: 128.9470, hours: ["10:00", "22:00"], multi: true, closed: [], stay: 60, indoor: true, walk: 1, pop: 3, tags: ["kids", "senior", "night"], wiki: "안목해변", desc: "오션뷰 카페 30여 곳" },
  { id: "terarosa", souvenir: "강릉 커피 원두", name: "테라로사 커피공장 강릉본점", cat: "cafe", area: "inland", lat: 37.7085, lng: 128.8855, hours: ["09:00", "19:00"], lastEntry: "18:00", closed: [], stay: 60, indoor: true, walk: 1, pop: 3, tags: ["senior"], wiki: "테라로사", desc: "로스터리와 커피 박물관" },
  { id: "bohemian", souvenir: "강릉 커피 원두", name: "보헤미안 박이추커피 사천점", cat: "cafe", area: "north", lat: 37.8495, lng: 128.8705, hours: ["09:00", "18:00"], lastEntry: "17:00", closed: [], stay: 50, indoor: true, walk: 1, pop: 2, tags: ["senior"], wiki: "박이추", desc: "1세대 바리스타의 핸드드립" },
  { id: "toetmaru", souvenir: "강릉 커피 원두", name: "카페 툇마루", cat: "cafe", area: "gyeongpo", lat: 37.7920, lng: 128.9140, hours: ["11:00", "19:00"], lastEntry: "18:00", closed: [2], stay: 45, indoor: true, walk: 1, pop: 2, tags: [], wiki: "초당동 (강릉시)", desc: "흑임자 라테로 유명한 초당 카페" },

  // 맛집·시장 (식사)
  {
    id: "chodang-tofu", souvenir: "초당두부", group: "tofu", name: "초당할머니순두부", cat: "food", area: "gyeongpo", lat: 37.7905, lng: 128.9150,
    hours: ["08:00", "19:00"], byDay: { 2: ["08:00", "15:00"], 0: ["08:00", "18:30"], 6: ["08:00", "18:30"] },
    breaks: [["16:00", "17:00"]], closed: [3], stay: 50, indoor: true, walk: 1, pop: 3, tags: ["kids", "senior"], wiki: "초당두부", desc: "바닷물로 굳힌 초당두부",
  },
  {
    id: "jjamppong-tofu", souvenir: "초당두부", group: "tofu", name: "동화가든 짬뽕순두부", cat: "food", area: "gyeongpo", lat: 37.7898, lng: 128.9128,
    hours: ["07:00", "19:30"], lastEntry: "18:50", breaks: [["16:00", "17:00"]], closed: [3], stay: 50, indoor: true, walk: 1, pop: 3, tags: [], wiki: "초당동 (강릉시)", desc: "원조 짬뽕순두부 · 점심 대기 김",
  },
  { id: "central-market", souvenir: "강릉 닭강정", name: "강릉중앙시장", cat: "food", area: "downtown", lat: 37.7545, lng: 128.8990, hours: ["09:00", "19:00"], multi: true, closed: [], stay: 70, indoor: true, walk: 2, pop: 3, tags: ["kids", "senior"], wiki: "강릉중앙시장", desc: "닭강정·장칼국수·감자전" },
  { id: "jumunjin-market", souvenir: "주문진 건오징어", name: "주문진수산시장", cat: "food", area: "north", lat: 37.8930, lng: 128.8290, hours: ["07:00", "21:00"], multi: true, closed: [], stay: 70, indoor: true, walk: 2, pop: 3, tags: ["senior"], wiki: "주문진수산시장", desc: "제철 회와 해산물" },
  { id: "sacheon-mulhoe", name: "사천진항 물회거리", cat: "food", area: "north", lat: 37.8433, lng: 128.8752, hours: ["10:00", "20:00"], multi: true, closed: [], stay: 60, indoor: true, walk: 1, pop: 2, tags: ["senior"], wiki: "사천진항", desc: "항구 앞 물회 골목" },
  { id: "jeongdongjin-food", name: "정동진역 앞 식당가", cat: "food", area: "south", lat: 37.6920, lng: 129.0320, hours: ["09:00", "20:00"], multi: true, closed: [], stay: 60, indoor: true, walk: 1, pop: 1, tags: ["kids", "senior"], wiki: "정동진", desc: "역 앞 식당가" },
  { id: "anmok-hoe", name: "남항진 횟집거리", cat: "food", area: "anmok", lat: 37.7690, lng: 128.9515, hours: ["11:00", "21:00"], multi: true, closed: [], stay: 70, indoor: true, walk: 1, pop: 1, tags: ["senior"], wiki: "남항진해수욕장", desc: "바다 보며 먹는 회" },

  // 역사·문화
  { id: "ojukheon", name: "오죽헌", cat: "culture", area: "gyeongpo", lat: 37.7792, lng: 128.8783, hours: ["09:00", "18:00"], lastEntry: "17:00", closed: [], stay: 60, indoor: false, walk: 2, pop: 3, tags: ["kids", "senior"], wiki: "오죽헌", desc: "율곡 이이가 태어난 집" },
  {
    id: "seongyojang", name: "선교장", cat: "culture", area: "gyeongpo", lat: 37.7865, lng: 128.8838,
    hours: ["09:00", "18:00"], seasons: [{ months: [11, 12, 1, 2], hours: ["09:00", "17:00"] }],
    closed: [], stay: 50, indoor: false, walk: 2, pop: 2, tags: ["senior"], wiki: "강릉 선교장", desc: "300년 된 사대부 고택",
  },
  { id: "gyeongpodae", name: "경포대", cat: "culture", area: "gyeongpo", lat: 37.7955, lng: 128.8965, hours: ["10:00", "18:00"], lastEntry: "17:30", closed: [1], stay: 30, indoor: false, walk: 2, pop: 2, tags: ["senior"], wiki: "경포대", desc: "경포호를 내려다보는 누각" },
  { id: "chamsori", name: "참소리축음기·에디슨과학박물관", cat: "culture", area: "gyeongpo", lat: 37.7963, lng: 128.8978, hours: ["10:00", "17:00"], lastEntry: "15:30", closed: [2], stay: 70, indoor: true, walk: 1, pop: 2, tags: ["kids", "senior"], wiki: "참소리 축음기 에디슨 박물관", desc: "축음기와 에디슨 발명품 전시" },
  { id: "heo-park", name: "허균·허난설헌 기념공원", cat: "culture", area: "gyeongpo", lat: 37.7915, lng: 128.9070, hours: ["09:00", "18:00"], breaks: [["12:00", "13:00"]], closed: [1], stay: 40, indoor: false, walk: 2, pop: 1, tags: ["senior"], wiki: "허균·허난설헌 기념공원", desc: "솔숲 속 생가터와 기념관" },
  { id: "arte", name: "아르떼뮤지엄 강릉", cat: "culture", area: "gyeongpo", lat: 37.7870, lng: 128.9020, hours: ["10:00", "20:00"], lastEntry: "19:00", closed: [], stay: 80, indoor: true, walk: 1, pop: 3, tags: ["kids"], wiki: "아르떼뮤지엄", desc: "몰입형 미디어아트 전시" },
  { id: "gwana", name: "강릉대도호부 관아", cat: "culture", area: "downtown", lat: 37.7538, lng: 128.8957, hours: ["09:00", "18:00"], closed: [1], stay: 30, indoor: false, walk: 1, pop: 1, tags: ["senior"], wiki: "강릉대도호부 관아", desc: "고려~조선 관청 건물" },
  { id: "wolhwa", name: "월화거리", cat: "culture", area: "downtown", lat: 37.7575, lng: 128.8975, hours: ["00:00", "23:59"], closed: [], stay: 40, indoor: false, walk: 2, pop: 2, tags: ["kids", "senior", "night"], wiki: "월화거리", desc: "옛 철길 위 산책로와 야시장" },
  { id: "haslla", name: "하슬라아트월드", cat: "culture", area: "south", lat: 37.7110, lng: 129.0080, hours: ["09:00", "18:00"], lastEntry: "17:00", closed: [], stay: 90, indoor: true, walk: 2, pop: 2, tags: ["kids"], wiki: "하슬라아트월드", desc: "바다 언덕 위 미술관" },
  {
    id: "time-museum", name: "정동진 시간박물관", cat: "culture", area: "south", lat: 37.6895, lng: 129.0365,
    hours: ["09:00", "18:00"], lastEntry: "17:30", seasons: [{ months: [11, 12, 1, 2, 3, 4], hours: ["09:00", "18:00"], lastEntry: "17:00" }],
    closed: [], stay: 50, indoor: true, walk: 1, pop: 1, tags: ["kids", "senior"], wiki: "정동진", desc: "기차 객차 안 시계 박물관",
  },

  // 자연·산책
  { id: "gyeongpo-lake", name: "경포호 둘레길", cat: "nature", area: "gyeongpo", lat: 37.7960, lng: 128.9030, hours: ["00:00", "23:59"], closed: [], stay: 50, indoor: false, walk: 2, pop: 2, tags: ["kids", "senior", "night"], wiki: "경포호", desc: "평지 4.3km 호수 산책로" },
  { id: "gasiyeon", name: "가시연습지", cat: "nature", area: "gyeongpo", lat: 37.7990, lng: 128.8990, hours: ["00:00", "23:59"], closed: [], stay: 30, indoor: false, walk: 1, pop: 1, tags: ["senior"], wiki: "경포호", desc: "데크길 따라 걷는 습지" },
  {
    id: "solhyang", name: "강릉솔향수목원", cat: "nature", area: "inland", lat: 37.7290, lng: 128.8320,
    hours: ["09:00", "18:00"], lastEntry: "17:00", seasons: [{ months: [11, 12, 1, 2], hours: ["09:00", "17:00"], lastEntry: "16:00" }],
    closed: [1], stay: 70, indoor: false, walk: 3, pop: 1, tags: ["kids"], wiki: "강릉솔향수목원", desc: "금강소나무 숲 계곡길 · 무료",
  },
  { id: "jumunjin-lighthouse", name: "주문진등대", cat: "nature", area: "north", lat: 37.8995, lng: 128.8295, hours: ["09:00", "18:00"], closed: [], stay: 25, indoor: false, walk: 2, pop: 1, tags: [], wiki: "주문진등대", desc: "강원 최초의 등대 · 무료" },
  { id: "songjeong", name: "송정 해송숲", cat: "nature", area: "anmok", lat: 37.7785, lng: 128.9370, hours: ["00:00", "23:59"], closed: [], stay: 40, indoor: false, walk: 2, pop: 1, tags: ["senior"], wiki: "송정해수욕장 (강릉)", desc: "해변 따라 이어진 솔숲길" },
];

// 동해·삼척 (강릉·동해 권역)
const DONGHAE = [
  { id: "chuam", name: "추암 촛대바위", cat: "sea", area: "samcheok", lat: 37.4770, lng: 129.1580, hours: ["05:00", "22:00"], closed: [], stay: 40, indoor: false, walk: 2, pop: 3, tags: ["kids", "senior"], wiki: "추암해수욕장", desc: "애국가 첫 장면의 일출 명소" },
  { id: "nongoldam", name: "묵호 논골담길", cat: "culture", area: "donghae", lat: 37.5530, lng: 129.1180, hours: ["00:00", "23:59"], closed: [], stay: 50, indoor: false, walk: 3, pop: 2, tags: ["night"], wiki: "묵호등대", desc: "벽화 골목과 묵호등대" },
  {
    id: "dojjaebi", name: "도째비골 스카이밸리", cat: "nature", area: "donghae", lat: 37.5506, lng: 129.1185,
    hours: ["10:00", "18:00"], seasons: [{ months: WINTER, hours: ["10:00", "17:00"] }],
    closed: [1], stay: 50, indoor: false, walk: 2, pop: 3, tags: ["kids"], wiki: "묵호등대", desc: "바다 위 스카이워크와 자이언트 슬라이드",
  },
  { id: "haerang", name: "해랑전망대", cat: "sea", area: "donghae", lat: 37.5492, lng: 129.1220, hours: ["10:00", "21:00"], closed: [], stay: 25, indoor: false, walk: 1, pop: 2, tags: ["kids", "senior", "night"], wiki: "묵호항", desc: "바다 위를 걷는 무료 전망대 · 파도 높으면 통제" },
  { id: "mukho-port", souvenir: "묵호 건어물", name: "묵호항 회센터", cat: "food", area: "donghae", lat: 37.5500, lng: 129.1150, hours: ["10:00", "20:00"], multi: true, closed: [], stay: 60, indoor: true, walk: 1, pop: 2, tags: ["senior"], wiki: "묵호항", desc: "제철 회와 물회" },
  { id: "mangsang", name: "망상해변", cat: "sea", area: "donghae", lat: 37.5920, lng: 129.0890, hours: ["06:00", "22:00"], closed: [], stay: 40, indoor: false, walk: 1, pop: 1, tags: ["kids", "senior"], wiki: "망상해수욕장", desc: "동해안에서 손꼽히는 넓은 백사장" },
  {
    id: "hwanseon", name: "환선굴", cat: "nature", area: "samcheok", lat: 37.3250, lng: 129.0180,
    hours: ["09:00", "18:00"], lastEntry: "17:00", seasons: [{ months: [11, 12, 1, 2], hours: ["09:30", "17:00"], lastEntry: "16:00" }],
    closed: [], closedMonthDays: [18], stay: 100, indoor: true, walk: 3, pop: 2, tags: ["kids"], wiki: "환선굴", desc: "국내 최대 석회동굴 · 모노레일 운행",
  },
  { id: "samcheok-cable", name: "삼척해상케이블카", cat: "sea", area: "samcheok", lat: 37.2860, lng: 129.3150, hours: ["09:00", "18:00"], lastEntry: "17:10", closed: [], closedNth: [[2, 1], [2, 3]], stay: 40, indoor: true, walk: 1, pop: 2, tags: ["kids", "senior"], wiki: "장호항", desc: "장호항 바다 위 874m 케이블카" },
  { id: "jangho", name: "장호항", cat: "sea", area: "samcheok", lat: 37.2870, lng: 129.3130, hours: ["06:00", "21:00"], closed: [], stay: 40, indoor: false, walk: 1, pop: 2, tags: ["kids", "senior"], wiki: "장호항", desc: "투명한 바다의 작은 항구" },
];

// 속초·양양·고성·인제
const SEORAK = [
  { id: "sokcho-beach", name: "속초해수욕장", cat: "sea", area: "sokcho", lat: 38.1905, lng: 128.6020, hours: ["06:00", "22:00"], closed: [], stay: 40, indoor: false, walk: 1, pop: 3, tags: ["kids", "senior", "night"], wiki: "속초해수욕장", desc: "시내에서 가장 가까운 해변" },
  { id: "yeonggeumjeong", name: "영금정", cat: "sea", area: "sokcho", lat: 38.2125, lng: 128.6000, hours: ["00:00", "23:59"], closed: [], stay: 30, indoor: false, walk: 2, pop: 2, tags: ["senior"], wiki: "영금정", desc: "파도 소리가 거문고 같다는 바위 정자" },
  { id: "abai", souvenir: "속초 오징어순대", name: "아바이마을·갯배", cat: "culture", area: "sokcho", lat: 38.2010, lng: 128.5950, hours: ["09:00", "21:00"], multi: true, closed: [], stay: 50, indoor: false, walk: 1, pop: 3, tags: ["kids", "senior"], wiki: "아바이마을", desc: "줄 당겨 건너는 갯배와 순대" },
  { id: "sokcho-market", souvenir: "속초 오징어순대", name: "속초관광수산시장", cat: "food", area: "sokcho", lat: 38.2045, lng: 128.5900, hours: ["09:00", "21:00"], multi: true, closed: [], stay: 70, indoor: true, walk: 2, pop: 3, tags: ["kids", "senior"], wiki: "속초관광수산시장", desc: "닭강정·오징어순대·회" },
  { id: "cheongcho", name: "청초호 호수공원", cat: "nature", area: "sokcho", lat: 38.1960, lng: 128.5860, hours: ["00:00", "23:59"], closed: [], stay: 40, indoor: false, walk: 2, pop: 1, tags: ["kids", "senior", "night"], wiki: "청초호", desc: "호수 산책로와 엑스포타워" },
  { id: "seorak-cable", name: "설악산 케이블카", cat: "nature", area: "seoraksan", lat: 38.1730, lng: 128.4890, hours: ["09:00", "17:00"], lastEntry: "16:00", closed: [], stay: 90, indoor: false, walk: 2, pop: 3, tags: ["kids", "senior"], wiki: "설악산", desc: "권금성까지 10분 · 강풍 시 운휴" },
  {
    id: "unification", name: "고성 통일전망대", cat: "culture", area: "goseong", lat: 38.5870, lng: 128.3720,
    hours: ["09:00", "16:50"], seasons: [{ months: [11, 12, 1, 2], hours: ["09:00", "15:50"] }],
    closed: [], stay: 70, indoor: true, walk: 1, pop: 2, tags: ["kids", "senior"], wiki: "통일전망대", desc: "금강산이 보이는 최북단 전망대 · 출입신고·신분증 필요", car: true,
  },
  { id: "hwajinpo", name: "화진포", cat: "nature", area: "goseong", lat: 38.4730, lng: 128.4380, hours: ["06:00", "20:00"], closed: [], stay: 50, indoor: false, walk: 2, pop: 2, tags: ["senior"], wiki: "화진포", desc: "호수와 바다가 맞닿은 석호" },
  { id: "ayajin", name: "아야진해변", cat: "sea", area: "goseong", lat: 38.2700, lng: 128.5560, hours: ["06:00", "21:00"], closed: [], stay: 30, indoor: false, walk: 1, pop: 1, tags: ["kids"], wiki: "아야진해수욕장", desc: "바위와 에메랄드빛 바다" },
  { id: "naksan-beach", name: "낙산해변", cat: "sea", area: "yangyang", lat: 38.1240, lng: 128.6290, hours: ["06:00", "22:00"], closed: [], stay: 40, indoor: false, walk: 1, pop: 2, tags: ["kids", "senior"], wiki: "낙산해수욕장", desc: "낙산사 아래 긴 백사장" },
  { id: "surfyy", name: "서피비치", cat: "sea", area: "yangyang", lat: 38.0303, lng: 128.7180, hours: ["09:00", "20:00"], closed: [], stay: 60, indoor: false, walk: 1, pop: 3, tags: ["night"], wiki: "하조대해수욕장", desc: "서핑과 해변 바" },
  { id: "hajodae", name: "하조대", cat: "nature", area: "yangyang", lat: 38.0228, lng: 128.7244, hours: ["06:00", "20:00"], closed: [], stay: 40, indoor: false, walk: 2, pop: 2, tags: ["senior"], wiki: "하조대", desc: "바다 절벽 위 정자와 등대 · 무료" },
  { id: "jukdo", name: "죽도해변", cat: "sea", area: "yangyang", lat: 37.9715, lng: 128.7600, hours: ["06:00", "22:00"], closed: [], stay: 40, indoor: false, walk: 1, pop: 2, tags: ["night"], wiki: "죽도해수욕장", desc: "서핑 마을과 카페 거리" },
  {
    id: "birch", name: "원대리 자작나무숲", cat: "nature", area: "inje", lat: 38.0005, lng: 128.2785,
    hours: ["09:00", "18:00"], lastEntry: "15:00", seasons: [{ months: WINTER, hours: ["09:00", "17:00"], lastEntry: "14:00" }],
    closed: [1, 2], stay: 150, indoor: false, walk: 3, pop: 3, tags: [], wiki: "원대리 자작나무숲", desc: "69만 그루 자작나무 · 주차장에서 1시간 걸어 올라감",
  },
  { id: "daepo", souvenir: "속초 건어물", name: "대포항", cat: "food", area: "sokcho", lat: 38.1750, lng: 128.6070, hours: ["10:00", "21:00"], multi: true, closed: [], stay: 60, indoor: true, walk: 1, pop: 2, tags: ["senior"], wiki: "대포항", desc: "튀김골목과 활어 횟집" },
  { id: "dongmyeong", souvenir: "속초 건어물", name: "동명항 활어센터", cat: "food", area: "sokcho", lat: 38.2120, lng: 128.5990, hours: ["09:00", "21:00"], multi: true, closed: [], stay: 60, indoor: true, walk: 1, pop: 1, tags: ["senior"], wiki: "동명항", desc: "영금정 옆 회센터" },
  { id: "yongdae", souvenir: "용대리 황태", name: "용대리 황태구이 마을", cat: "food", area: "inje", lat: 38.1650, lng: 128.3600, hours: ["09:00", "19:00"], multi: true, closed: [], stay: 50, indoor: true, walk: 1, pop: 2, tags: ["senior"], wiki: "용대리", desc: "황태덕장 마을 황태구이" },
  { id: "yangyang-market", souvenir: "양양 송이", name: "양양전통시장", cat: "food", area: "yangyang", lat: 38.0750, lng: 128.6190, hours: ["09:00", "19:00"], multi: true, closed: [], stay: 50, indoor: true, walk: 1, pop: 1, tags: ["senior"], wiki: "양양군", desc: "4·9일 오일장 · 송이·메밀전" },
  { id: "geojin", name: "거진항 식당가", cat: "food", area: "goseong", lat: 38.4450, lng: 128.4580, hours: ["10:00", "19:00"], multi: true, closed: [], stay: 50, indoor: true, walk: 1, pop: 1, tags: ["senior"], wiki: "거진항", desc: "곰치국·생선찜" },
  { id: "chilsung", name: "칠성조선소", cat: "cafe", area: "sokcho", lat: 38.2005, lng: 128.5880, hours: ["11:00", "20:00"], lastEntry: "19:30", closed: [], stay: 50, indoor: true, walk: 1, pop: 2, tags: ["senior"], wiki: "청초호", desc: "옛 조선소를 고친 호숫가 카페" },
];

// 춘천·화천·철원
const CHUNCHEON = [
  {
    id: "nami", name: "남이섬", cat: "nature", area: "nami", lat: 37.7915, lng: 127.5257,
    hours: ["08:00", "21:00"], lastEntry: "20:30", closed: [], stay: 150, indoor: false, walk: 2, pop: 3, tags: ["kids", "senior", "night"], wiki: "남이섬", desc: "배 타고 들어가는 메타세쿼이아 섬",
  },
  {
    id: "kimyoujeong", name: "김유정문학촌", cat: "culture", area: "nami", lat: 37.8170, lng: 127.7160,
    hours: ["09:30", "17:30"], seasons: [{ months: [11, 12, 1, 2], hours: ["09:30", "17:00"] }],
    closed: [1], stay: 50, indoor: false, walk: 2, pop: 2, tags: ["senior"], wiki: "김유정문학촌", desc: "소설 「봄봄」의 마을",
  },
  { id: "soyang-skywalk", name: "소양강 스카이워크", cat: "nature", area: "cc_city", lat: 37.8950, lng: 127.7240, hours: ["10:00", "18:00"], lastEntry: "17:30", closed: [2], stay: 30, indoor: false, walk: 1, pop: 2, tags: ["kids", "senior"], wiki: "소양강 스카이워크", desc: "강 위 투명 유리 다리" },
  { id: "cc-museum", name: "국립춘천박물관", cat: "culture", area: "cc_city", lat: 37.8650, lng: 127.7480, hours: ["09:00", "18:00"], lastEntry: "17:30", closed: [1], stay: 70, indoor: true, walk: 1, pop: 2, tags: ["kids", "senior"], wiki: "국립춘천박물관", desc: "나한상 전시 「득도의 기쁨」" },
  { id: "dakgalbi", souvenir: "춘천 닭갈비", name: "명동 닭갈비골목", cat: "food", area: "cc_city", lat: 37.8805, lng: 127.7275, hours: ["10:00", "21:00"], multi: true, closed: [], stay: 60, indoor: true, walk: 1, pop: 3, tags: ["kids", "senior"], wiki: "춘천 닭갈비", desc: "춘천 닭갈비 원조 골목" },
  { id: "makguksu", souvenir: "춘천 막국수", name: "춘천 막국수 (샘밭)", cat: "food", area: "cc_city", lat: 37.9300, lng: 127.7800, hours: ["10:00", "20:00"], multi: true, closed: [], stay: 50, indoor: true, walk: 1, pop: 2, tags: ["senior"], wiki: "막국수", desc: "소양댐 아래 막국수 식당가" },
  { id: "gongjicheon", name: "공지천 유원지", cat: "nature", area: "cc_city", lat: 37.8700, lng: 127.7100, hours: ["00:00", "23:59"], closed: [], stay: 40, indoor: false, walk: 2, pop: 1, tags: ["kids", "senior", "night"], wiki: "공지천", desc: "의암호 따라 걷는 산책로" },
  {
    id: "hantan-trail", name: "한탄강 주상절리길", cat: "nature", area: "cheorwon", lat: 38.1580, lng: 127.2950,
    hours: ["09:00", "16:00"], seasons: [{ months: [12, 1, 2], hours: ["09:00", "15:00"] }],
    closed: [2], stay: 100, indoor: false, walk: 3, pop: 3, tags: [], wiki: "한탄강", desc: "절벽에 매달린 잔도 3.6km",
  },
  { id: "goseokjeong", name: "고석정", cat: "nature", area: "cheorwon", lat: 38.1930, lng: 127.2810, hours: ["00:00", "23:59"], closed: [], stay: 40, indoor: false, walk: 2, pop: 2, tags: ["senior"], wiki: "고석정", desc: "한탄강 협곡의 바위 정자" },
  { id: "hwacheon-river", name: "화천 붕어섬", cat: "nature", area: "hwacheon", lat: 38.1000, lng: 127.7150, hours: ["00:00", "23:59"], closed: [], stay: 40, indoor: false, walk: 1, pop: 1, tags: ["kids", "senior"], wiki: "화천군", desc: "북한강 위 섬 공원" },
  { id: "nangman", souvenir: "춘천 닭갈비", name: "춘천 낭만시장", cat: "food", area: "cc_city", lat: 37.8810, lng: 127.7270, hours: ["09:00", "20:00"], multi: true, closed: [], stay: 50, indoor: true, walk: 1, pop: 1, tags: ["kids", "senior"], wiki: "춘천중앙시장", desc: "옛 중앙시장 먹거리" },
  { id: "dongsong", name: "철원 동송 식당가", cat: "food", area: "cheorwon", lat: 38.2100, lng: 127.2120, hours: ["10:00", "20:00"], multi: true, closed: [], stay: 50, indoor: true, walk: 1, pop: 1, tags: ["senior"], wiki: "동송읍", desc: "철원 오대쌀 밥집" },
  { id: "hwacheon-food", name: "화천읍 식당가", cat: "food", area: "hwacheon", lat: 38.1060, lng: 127.7050, hours: ["10:00", "20:00"], multi: true, closed: [], stay: 50, indoor: true, walk: 1, pop: 1, tags: ["senior"], wiki: "화천읍", desc: "어죽·막국수" },
  { id: "samak-cable", name: "삼악산 호수케이블카", cat: "nature", area: "cc_city", lat: 37.8650, lng: 127.6920, hours: ["09:00", "18:00"], lastEntry: "17:00", closed: [], closedRanges: [["2026-11-01", "2026-11-30"]], stay: 60, indoor: true, walk: 1, pop: 3, tags: ["kids", "senior"], wiki: "삼악산", desc: "의암호 위를 지나는 3.6km 케이블카" },
  { id: "labor-party", name: "철원 노동당사", cat: "culture", area: "cheorwon", lat: 38.2050, lng: 127.2180, hours: ["00:00", "23:59"], closed: [], stay: 25, indoor: false, walk: 1, pop: 2, tags: ["senior"], wiki: "철원 노동당사", desc: "전쟁의 흔적이 남은 건물" },
  { id: "jiktang", name: "직탕폭포", cat: "nature", area: "cheorwon", lat: 38.2200, lng: 127.2950, hours: ["06:00", "19:00"], closed: [], stay: 25, indoor: false, walk: 1, pop: 1, tags: ["senior"], wiki: "직탕폭포", desc: "한국의 나이아가라" },
  { id: "gangchon", souvenir: "춘천 닭갈비", name: "강촌 닭갈비 식당가", cat: "food", area: "nami", lat: 37.8130, lng: 127.6340, hours: ["10:00", "20:00"], multi: true, closed: [], stay: 50, indoor: true, walk: 1, pop: 1, tags: ["kids", "senior"], wiki: "강촌역", desc: "남이섬 가는 길 닭갈비·막국수" },
  { id: "gamjabat", souvenir: "춘천 감자빵", name: "카페 감자밭", cat: "cafe", area: "cc_city", lat: 37.9330, lng: 127.7700, hours: ["10:00", "20:00"], lastEntry: "19:30", closed: [], stay: 50, indoor: true, walk: 1, pop: 3, tags: ["kids", "senior"], wiki: "춘천시", desc: "감자빵으로 유명한 정원 카페" },
];

// 평창·정선·영월·태백
const PYEONGCHANG = [
  {
    id: "sheep", name: "대관령 양떼목장", cat: "nature", area: "daegwallyeong", lat: 37.6870, lng: 128.7520,
    hours: ["09:00", "17:30"], lastEntry: "16:30", seasons: [{ months: [11, 12, 1, 2], hours: ["09:00", "17:00"], lastEntry: "16:00" }],
    closed: [], stay: 70, indoor: false, walk: 2, pop: 3, tags: ["kids", "senior"], wiki: "대관령 양떼목장", desc: "능선 따라 걷는 양떼 목장",
  },
  {
    id: "samyang", name: "대관령 삼양목장", cat: "nature", area: "daegwallyeong", lat: 37.7040, lng: 128.7230,
    hours: ["09:00", "17:00"], lastEntry: "16:00", seasons: [{ months: [11, 12, 1, 2, 3, 4], hours: ["09:00", "16:30"], lastEntry: "15:30" }],
    closed: [], stay: 100, indoor: false, walk: 2, pop: 2, tags: ["kids", "senior"], wiki: "대관령 삼양목장", desc: "동해전망대와 풍력발전기 초원",
  },
  { id: "ohsam", souvenir: "대관령 황태", name: "횡계 오삼불고기 거리", cat: "food", area: "daegwallyeong", lat: 37.6750, lng: 128.7080, hours: ["11:00", "21:00"], multi: true, closed: [], stay: 60, indoor: true, walk: 1, pop: 2, tags: ["senior"], wiki: "횡계리", desc: "오징어·삼겹살 불고기" },
  { id: "balwang", name: "발왕산 관광케이블카", cat: "nature", area: "odaesan", lat: 37.6440, lng: 128.6800, hours: ["09:00", "17:00"], lastEntry: "16:00", closed: [], stay: 90, indoor: true, walk: 1, pop: 3, tags: ["kids", "senior"], wiki: "발왕산", desc: "해발 1,458m까지 7.4km 케이블카" },
  { id: "woljeongsa", name: "월정사 전나무숲길", cat: "nature", area: "odaesan", lat: 37.7320, lng: 128.5920, hours: ["06:00", "18:00"], closed: [], stay: 70, indoor: false, walk: 2, pop: 3, tags: ["senior"], wiki: "월정사", desc: "전나무 1km 숲길 · 무료, 24시간 개방이지만 해 지기 전으로 배치" },
  { id: "arirang-market", souvenir: "정선 곤드레나물", name: "정선아리랑시장", cat: "food", area: "jeongseon", lat: 37.3790, lng: 128.6630, hours: ["09:00", "18:00"], multi: true, closed: [], stay: 70, indoor: true, walk: 2, pop: 3, tags: ["kids", "senior"], wiki: "정선아리랑시장", desc: "곤드레밥·콧등치기국수 · 2·7일 오일장" },
  { id: "samtan", name: "삼탄아트마인", cat: "culture", area: "jeongseon", lat: 37.2050, lng: 128.8540, hours: ["09:30", "17:30"], lastEntry: "16:30", closed: [1, 2], stay: 80, indoor: true, walk: 2, pop: 2, tags: ["kids"], wiki: "삼척탄좌", desc: "폐광을 바꾼 예술 공간" },
  { id: "cheongnyeongpo", name: "청령포", cat: "culture", area: "yeongwol", lat: 37.1770, lng: 128.4470, hours: ["09:00", "18:00"], lastEntry: "17:00", closed: [1], stay: 60, indoor: false, walk: 2, pop: 3, tags: ["senior"], wiki: "청령포", desc: "나룻배로 건너는 단종 유배지" },
  { id: "hanbando", name: "한반도지형 전망대", cat: "nature", area: "yeongwol", lat: 37.2160, lng: 128.3880, hours: ["06:00", "19:00"], closed: [], stay: 40, indoor: false, walk: 2, pop: 2, tags: ["senior"], wiki: "한반도지형", desc: "한반도를 닮은 강 굽이" },
  { id: "yw-market", souvenir: "영월 메밀전병", name: "영월 서부시장", cat: "food", area: "yeongwol", lat: 37.1830, lng: 128.4610, hours: ["09:00", "19:00"], multi: true, closed: [], stay: 60, indoor: true, walk: 1, pop: 2, tags: ["senior"], wiki: "영월군", desc: "메밀전병·올챙이국수" },
  { id: "hwangji", name: "황지연못", cat: "nature", area: "taebaek", lat: 37.1640, lng: 128.9860, hours: ["00:00", "23:59"], closed: [], stay: 25, indoor: false, walk: 1, pop: 1, tags: ["kids", "senior"], wiki: "황지연못", desc: "낙동강 1,300리의 발원지" },
  { id: "windhill", name: "매봉산 바람의 언덕", cat: "nature", area: "taebaek", lat: 37.2150, lng: 128.9640, hours: ["06:00", "19:00"], closed: [], stay: 50, indoor: false, walk: 2, pop: 2, tags: [], wiki: "매봉산 (태백)", desc: "풍력발전기와 고랭지 배추밭" },
  { id: "bongpyeong", souvenir: "봉평 메밀", name: "봉평 메밀 음식촌", cat: "food", area: "odaesan", lat: 37.6150, lng: 128.3590, hours: ["10:00", "20:00"], multi: true, closed: [], stay: 50, indoor: true, walk: 1, pop: 2, tags: ["senior"], wiki: "봉평면", desc: "메밀막국수·메밀전병" },
  { id: "jinbu-food", name: "진부 시내 식당가", cat: "food", area: "odaesan", lat: 37.6400, lng: 128.5630, hours: ["10:00", "20:00"], multi: true, closed: [], stay: 50, indoor: true, walk: 1, pop: 1, tags: ["senior"], wiki: "진부면", desc: "산채정식" },
  { id: "taebaek-hanwoo", souvenir: "태백 한우", name: "태백 한우 실비 거리", cat: "food", area: "taebaek", lat: 37.1640, lng: 128.9870, hours: ["11:00", "21:00"], multi: true, closed: [], stay: 60, indoor: true, walk: 1, pop: 2, tags: ["senior"], wiki: "태백시", desc: "연탄불 한우구이" },
];

// 원주
const WONJU = [
  {
    id: "sogeumsan", name: "소금산 그랜드밸리", cat: "nature", area: "ganhyeon", lat: 37.3730, lng: 127.8180,
    hours: ["09:00", "18:00"], lastEntry: "16:30", seasons: [{ months: WINTER, hours: ["09:00", "17:00"], lastEntry: "15:30" }],
    closed: [1], stay: 120, indoor: false, walk: 3, pop: 3, tags: [], wiki: "소금산", desc: "출렁다리·울렁다리·스카이타워",
  },
  { id: "museum-san", name: "뮤지엄 산", cat: "culture", area: "ganhyeon", lat: 37.4140, lng: 127.8170, hours: ["10:00", "17:00"], lastEntry: "16:00", closed: [1], stay: 120, indoor: true, walk: 2, pop: 3, tags: ["senior"], wiki: "뮤지엄 산", desc: "안도 다다오 설계 미술관 · 제임스 터렐관은 예약 필요" },
  { id: "bangyeri", group: "ginkgo", name: "반계리 은행나무", cat: "nature", area: "ganhyeon", lat: 37.3130, lng: 127.8370, hours: ["06:00", "20:00"], closed: [], stay: 30, indoor: false, walk: 1, pop: 2, tags: ["senior"], wiki: "원주 반계리 은행나무", desc: "800년 된 천연기념물 은행나무" },
  { id: "guryongsa", name: "치악산 구룡사", cat: "nature", area: "chiaksan", lat: 37.4040, lng: 128.0480, hours: ["09:00", "18:00"], closed: [], stay: 70, indoor: false, walk: 2, pop: 2, tags: ["senior"], wiki: "구룡사 (원주)", desc: "금강소나무 숲길 끝의 천년 고찰" },
  { id: "wj-market", name: "원주 중앙시장·자유시장", cat: "food", area: "wj_city", lat: 37.3480, lng: 127.9500, hours: ["09:00", "20:00"], multi: true, closed: [], stay: 60, indoor: true, walk: 1, pop: 2, tags: ["kids", "senior"], wiki: "원주시", desc: "칼국수·만두·전" },
  { id: "hanwoo", souvenir: "횡성 한우", name: "횡성 한우 먹거리", cat: "food", area: "wj_city", lat: 37.4860, lng: 127.9850, hours: ["11:00", "21:00"], multi: true, closed: [], stay: 70, indoor: true, walk: 1, pop: 2, tags: ["senior"], wiki: "횡성 한우", desc: "횡성읍 한우 식당가" },
  { id: "guryong-food", name: "구룡사 입구 식당가", cat: "food", area: "chiaksan", lat: 37.3980, lng: 128.0430, hours: ["10:00", "19:00"], multi: true, closed: [], stay: 50, indoor: true, walk: 1, pop: 1, tags: ["senior"], wiki: "치악산", desc: "산채비빔밥·도토리묵" },
  { id: "ganhyeon-food", name: "간현관광지 식당가", cat: "food", area: "ganhyeon", lat: 37.3720, lng: 127.8150, hours: ["10:00", "19:00"], multi: true, closed: [], stay: 50, indoor: true, walk: 1, pop: 1, tags: ["senior"], wiki: "간현관광지", desc: "소금산 아래 식당가" },
  { id: "hoengseong-lake", name: "횡성호수길", cat: "nature", area: "chiaksan", lat: 37.5000, lng: 128.0300, hours: ["06:00", "18:00"], closed: [], stay: 70, indoor: false, walk: 2, pop: 2, tags: ["senior"], wiki: "횡성호", desc: "호수 둘레 숲길" },
  { id: "ganhyeon-park", name: "간현유원지", cat: "nature", area: "ganhyeon", lat: 37.3710, lng: 127.8140, hours: ["00:00", "23:59"], closed: [], stay: 30, indoor: false, walk: 1, pop: 1, tags: ["kids", "senior"], wiki: "간현관광지", desc: "섬강 강변 산책로" },
];

export const PLACES = [
  ...GANGNEUNG.map((p) => ({ region: "gangneung", ...p })),
  ...DONGHAE.map((p) => ({ region: "gangneung", ...p })),
  ...SEORAK.map((p) => ({ region: "seorak", ...p })),
  ...CHUNCHEON.map((p) => ({ region: "chuncheon", ...p })),
  ...PYEONGCHANG.map((p) => ({ region: "pyeongchang", ...p })),
  ...WONJU.map((p) => ({ region: "wonju", ...p })),
];

// 강원 축제
// confirmed: 날짜가 발표된 축제 → 기간 중 같은 권역 여행이면 일정에 자동 포함
// tentative: 매년 열리지만 올해 날짜가 아직 발표되지 않은 축제 → 해당 월에 안내만
export const FESTIVALS = [
  { id: "f-hwacheon", name: "화천 산천어축제", region: "chuncheon", area: "hwacheon", lat: 38.1060, lng: 127.7080, start: "2027-01-09", end: "2027-01-31", hours: ["10:00", "17:00"], stay: 150, desc: "얼음낚시·맨손잡기", wiki: "화천산천어축제" },
  { id: "f-trout", name: "평창송어축제", region: "pyeongchang", area: "odaesan", lat: 37.6400, lng: 128.5600, start: "2026-12-31", end: "2027-02-01", hours: ["10:00", "17:00"], stay: 120, desc: "오대천 얼음낚시", wiki: "평창송어축제" },
  { id: "f-ginkgo", group: "ginkgo", name: "원주 반계리 은행나무축제", region: "wonju", area: "ganhyeon", lat: 37.3130, lng: 127.8370, start: "2026-10-30", end: "2026-11-12", hours: ["10:00", "17:00"], stay: 60, desc: "800년 은행나무 단풍", wiki: "원주 반계리 은행나무" },

  { id: "t-christmas", name: "강릉 크리스마스 겨울축제", region: "gangneung", months: [12, 1], desc: "월화거리·안목해변 불빛 축제" },
  { id: "t-sunrise", name: "정동진·경포 해맞이", region: "gangneung", months: [1], desc: "1월 1일 해돋이" },
  { id: "t-hongcheon", name: "홍천강 꽁꽁축제", region: "chuncheon", months: [1], desc: "홍천강 얼음낚시" },
  { id: "t-daegwallyeong", name: "대관령 눈꽃축제", region: "pyeongchang", months: [1, 2], desc: "눈조각과 눈썰매" },
  { id: "t-taebaek", name: "태백산 눈축제", region: "pyeongchang", months: [1, 2], desc: "태백산국립공원 눈조각" },
  { id: "t-yeongwol", name: "영월 단종문화제", region: "pyeongchang", months: [4], desc: "단종 국장 재현" },
  { id: "t-mime", name: "춘천 마임축제", region: "chuncheon", months: [5], desc: "거리 공연 축제" },
  { id: "t-rose", name: "삼척 장미축제", region: "gangneung", months: [5], desc: "오십천 장미공원" },
  { id: "t-dano", name: "강릉단오제", region: "gangneung", months: [6], desc: "유네스코 인류무형문화유산" },
  { id: "t-corn", name: "홍천 찰옥수수축제", region: "chuncheon", months: [7], desc: "옥수수 체험·먹거리" },
  { id: "t-tomato", name: "화천 토마토축제", region: "chuncheon", months: [8], desc: "토마토 풀장" },
  { id: "t-dakgalbi", name: "춘천 닭갈비막국수축제", region: "chuncheon", months: [8, 9], desc: "닭갈비·막국수 먹거리" },
  { id: "t-hyoseok", name: "평창 효석문화제", region: "pyeongchang", months: [9], desc: "봉평 메밀꽃밭" },
  { id: "t-dancing", name: "원주 다이내믹댄싱카니발", region: "wonju", months: [9], desc: "거리 퍼레이드 댄스 축제" },
  { id: "t-coffee", name: "강릉커피축제", region: "gangneung", months: [10], desc: "커피거리·핸드드립 체험" },
  { id: "t-arirang", name: "정선아리랑제", region: "pyeongchang", months: [10], desc: "아리랑 공연" },
  { id: "t-hanwoo", name: "횡성한우축제", region: "wonju", months: [10], desc: "한우 먹거리" },
  { id: "t-salmon", name: "양양 연어축제", region: "seorak", months: [10], desc: "남대천 연어 맨손잡기" },
  { id: "t-seorak", name: "속초 설악문화제", region: "seorak", months: [10], desc: "속초 대표 문화축제" },
];

// 숙소 지역: 실제 숙소가 모여 있는 곳과 그곳에 많은 숙소 종류
// types: guesthouse(게스트하우스), business(비즈니스호텔), ocean(오션뷰 호텔), pension(펜션), resort(리조트·콘도), hanok(한옥스테이)
export const LODGING = [
  { id: "l-gyeongpo", region: "gangneung", name: "경포", lat: 37.8000, lng: 128.9050, types: ["ocean", "resort", "pension"], desc: "경포해변·호수 앞 오션뷰 호텔과 리조트" },
  { id: "l-anmok", region: "gangneung", name: "강문·안목", lat: 37.7800, lng: 128.9400, types: ["ocean", "pension", "guesthouse"], desc: "해변 바로 앞 호텔과 감성 숙소" },
  { id: "l-gn-station", region: "gangneung", name: "강릉역·시내", lat: 37.7630, lng: 128.9000, types: ["business", "guesthouse", "hanok"], desc: "KTX역 근처, 대중교통 편리" },
  { id: "l-jeongdongjin", region: "gangneung", name: "정동진", lat: 37.6900, lng: 129.0300, types: ["ocean", "pension"], desc: "일출을 숙소에서 보는 곳" },
  { id: "l-jumunjin", region: "gangneung", name: "주문진·사천", lat: 37.8700, lng: 128.8500, types: ["pension", "ocean"], desc: "조용한 바닷가 펜션" },
  { id: "l-mukho", region: "gangneung", name: "동해 묵호", lat: 37.5500, lng: 129.1150, types: ["pension", "guesthouse", "ocean"], desc: "항구 언덕 위 바다 전망 숙소" },
  { id: "l-samcheok", region: "gangneung", name: "삼척 해변", lat: 37.3900, lng: 129.2400, types: ["resort", "pension", "ocean"], desc: "대형 리조트와 해변 펜션" },
  { id: "l-sokcho", region: "seorak", name: "속초해변·시내", lat: 38.1950, lng: 128.5980, types: ["ocean", "business", "guesthouse"], desc: "해변 앞 오션뷰 호텔과 터미널 근처 숙소" },
  { id: "l-seorakdong", region: "seorak", name: "설악동", lat: 38.1800, lng: 128.5200, types: ["resort", "hanok", "pension"], desc: "설악산 입구 리조트·콘도" },
  { id: "l-yangyang", region: "seorak", name: "양양 죽도·서피비치", lat: 38.0000, lng: 128.7400, types: ["guesthouse", "ocean", "pension"], desc: "서핑 마을 게스트하우스와 바다 호텔" },
  { id: "l-goseong", region: "seorak", name: "고성 해변", lat: 38.3300, lng: 128.5200, types: ["resort", "pension"], desc: "한적한 해변 리조트" },
  { id: "l-inje", region: "seorak", name: "인제", lat: 38.0700, lng: 128.1700, types: ["pension"], desc: "계곡 옆 펜션" },
  { id: "l-cc-city", region: "chuncheon", name: "춘천역·명동", lat: 37.8800, lng: 127.7220, types: ["business", "guesthouse"], desc: "역과 닭갈비골목 근처" },
  { id: "l-uiam", region: "chuncheon", name: "의암호", lat: 37.8700, lng: 127.7000, types: ["ocean", "resort"], desc: "호수 전망 호텔" },
  { id: "l-gangchon", region: "chuncheon", name: "남이섬·강촌", lat: 37.8000, lng: 127.6200, types: ["resort", "pension"], desc: "리조트와 강변 펜션" },
  { id: "l-cheorwon", region: "chuncheon", name: "철원", lat: 38.2000, lng: 127.2200, types: ["pension", "business"], desc: "한탄강 근처 숙소" },
  { id: "l-hwacheon", region: "chuncheon", name: "화천", lat: 38.1060, lng: 127.7080, types: ["pension"], desc: "북한강 펜션" },
  { id: "l-yongpyong", region: "pyeongchang", name: "대관령·용평", lat: 37.6600, lng: 128.6900, types: ["resort", "pension"], desc: "스키 리조트와 콘도" },
  { id: "l-jinbu", region: "pyeongchang", name: "진부·오대산", lat: 37.6400, lng: 128.5600, types: ["pension", "hanok", "business"], desc: "진부역 근처, 산사 템플스테이" },
  { id: "l-jeongseon", region: "pyeongchang", name: "정선읍", lat: 37.3800, lng: 128.6600, types: ["pension", "hanok"], desc: "강변 펜션과 한옥" },
  { id: "l-gohan", region: "pyeongchang", name: "고한·사북", lat: 37.2000, lng: 128.8500, types: ["resort", "business"], desc: "산 위 리조트" },
  { id: "l-yeongwol", region: "pyeongchang", name: "영월", lat: 37.1850, lng: 128.4600, types: ["resort", "pension"], desc: "동강 리조트와 펜션" },
  { id: "l-taebaek", region: "pyeongchang", name: "태백", lat: 37.1650, lng: 128.9850, types: ["business", "pension"], desc: "시내 호텔" },
  { id: "l-wj-city", region: "wonju", name: "원주 시내", lat: 37.3450, lng: 127.9400, types: ["business", "guesthouse"], desc: "역·터미널 근처 호텔" },
  { id: "l-jijeong", region: "wonju", name: "원주 지정면", lat: 37.4100, lng: 127.8200, types: ["resort"], desc: "뮤지엄 산 옆 리조트" },
  { id: "l-chiak", region: "wonju", name: "치악산", lat: 37.4000, lng: 128.0400, types: ["pension", "hanok"], desc: "산자락 펜션" },
];

export const LODGING_TYPES = {
  guesthouse: "게스트하우스", business: "비즈니스호텔", ocean: "전망 좋은 호텔", pension: "펜션", resort: "리조트·콘도", hanok: "한옥스테이",
};

// 혜택: 공고 기간·조건·증빙을 확인한 것만 넣는다 (확인: 2026년 11월)
// kind "place": 일정에 그 장소가 있으면 자동 적용 (입장료를 지역 상품권으로 돌려줌)
// kind "program": 기간·지역이 맞으면 신청 안내
export const BENEFITS = [
  { id: "b-soyang", kind: "place", place: "soyang-skywalk", title: "소양강 스카이워크 입장료 환급", amount: 2000, how: "입장료 2,000원을 춘천사랑상품권 2,000원으로 돌려받아요", proofs: ["입장권"], deadline: null },
  { id: "b-hantan", kind: "place", place: "hantan-trail", title: "한탄강 주상절리길 상품권 환급", amount: 5000, how: "입장료 10,000원 중 5,000원을 철원사랑상품권으로 돌려받아요", proofs: ["입장권"], deadline: null },
  { id: "b-hoengseong", kind: "place", place: "hoengseong-lake", title: "횡성호수길 입장료 환급", amount: 2000, how: "입장료 2,000원을 같은 금액의 관광상품권으로 돌려받아요", proofs: ["입장권"], deadline: null },
  {
    id: "b-incentive", kind: "program", title: "혜택 받GO! 강원 여행", start: "2026-02-23", end: "2026-09-30",
    regions: ["gangneung", "seorak", "chuncheon", "pyeongchang", "wonju"], needsNight: false,
    amount: 40000, how: "강원 외 지역 주민이 도내 등록 숙박 6만 원 이상 쓰면 3만 원, 관광 소비 5만 원 이상이면 1만 원을 모바일 강원상품권으로 돌려받아요",
    steps: ["강원혜택이지 가입", "강원생활도민증 발급", "영수증 인증"], proofs: ["숙박 영수증", "관광 소비 영수증"],
    note: "모바일 강원상품권(비플페이)으로 지급",
  },
  {
    id: "b-halfprice", kind: "program", title: "반값여행 (지역사랑 휴가지원)", start: null, end: "2026-12-31",
    towns: ["평창", "영월", "횡성"], regions: ["pyeongchang", "wonju"], needsNight: false,
    areas: ["daegwallyeong", "odaesan", "yeongwol"], placeIds: ["hoengseong-lake", "hanwoo"],
    amount: 100000, how: "여행 경비의 50%를 지역사랑상품권으로 돌려받아요 (개인 최대 10만 원, 2인 이상 최대 20만 원)",
    steps: ["여행 전 사전 신청·승인", "여행 후 증빙 제출", "심사 후 지역사랑상품권 지급"],
    proofs: ["숙박 영수증", "식당 영수증", "체험시설 이용 증빙", "관광지 인증사진 2곳 이상"],
    note: "카드·현금영수증·모바일 결제 내역만 인정 (간이영수증·계좌이체 불가) · 하반기 공고는 대한민국 구석구석에서 확인",
    unconfirmed: true,
  },
];

export const SHOP_MALL = { name: "강원더몰", url: "https://www.gwdmall.kr" };
