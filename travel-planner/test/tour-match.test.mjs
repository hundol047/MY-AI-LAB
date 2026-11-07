// 관광공사 결과 대조 규칙: 같은 곳만 통과시키고, 이웃 시설·개별 가게·다른 목장은 버리는지
import assert from "node:assert/strict";
import { judge, koreanInTitle, englishInTitle, firstSentence } from "../scripts/tour-api.mjs";


const P = (name, multi = false) => ({ name, multi, lat: 0, lng: 0 });
const ok = (place, title, type = "12") => judge(place, title, type).ok;

assert.ok(ok(P("경포해변"), "경포해수욕장"), "해변=해수욕장");
assert.ok(ok(P("오죽헌"), "강릉 오죽헌·시립박물관"), "·로 묶인 제목");
assert.ok(ok(P("해랑전망대"), "도째비골 해랑전망대"), "앞에 지역명");
assert.ok(ok(P("치악산 구룡사"), "구룡사"));
assert.ok(ok(P("영진해변 도깨비 촬영지"), "영진해변"), "장소가 있는 해변");
assert.ok(!ok(P("대관령 삼양목장"), "대관령 하늘목장"), "다른 목장");
assert.ok(!ok(P("대관령 양떼목장"), "대관령하우스"));
assert.ok(!ok(P("고석정"), "고석정 꽃밭"), "옆의 다른 시설");
assert.ok(!ok(P("남이섬"), "남이섬 노래박물관"));
assert.ok(ok(P("강릉중앙시장", true), "강릉 중앙시장"), "시장 자체");
assert.ok(!ok(P("속초관광수산시장", true), "속초관광수산시장 회센터"), "시장 안 개별 가게");
assert.ok(!ok(P("사천진항 물회거리", true), "사천진항"), "식당가를 항구로 바꾸지 않음");
assert.ok(!ok(P("안목 커피거리", true), "하슬라가배", "39"), "거리 안 개별 카페");

assert.ok(!ok(P("보헤미안 박이추커피 사천점"), "보헤미안박이추커피 본점"), "다른 지점");
assert.ok(ok(P("테라로사 커피공장 강릉본점"), "테라로사 커피공장"), "지점명 없는 등록");
// 축제 날짜 갱신은 이름 같음·앞 지역명만 인정 (유사도 매칭은 다른 축제를 붙인다)
const fj = judge({ name: "양양 연어축제" }, "평창송어축제", "15");
assert.ok(!(fj.ok && fj.score >= 2 && !/유사/.test(fj.why)), "연어축제 ≠ 송어축제");
assert.ok(judge({ name: "철원 한탄강 얼음트레킹 축제" }, "철원 한탄강 얼음트레킹 축제", "15").score >= 2);
assert.equal(koreanInTitle("Hwanseongul Cave (Daei-ri Cave System) (환선굴 (대이리 동굴지대))"), "환선굴 (대이리 동굴지대)");
assert.equal(englishInTitle("Hwanseongul Cave (Daei-ri Cave System) (환선굴 (대이리 동굴지대))"), "Hwanseongul Cave (Daei-ri Cave System)");
assert.equal(englishInTitle("CU Gangneung Gyeongpo Hana Branch[Tax Refund Shop](CU 경포하나점)"), "CU Gangneung Gyeongpo Hana Branch");
assert.equal(firstSentence("The 7.4-kilometer cable car is long. Second."), "The 7.4-kilometer cable car is long.");
assert.equal(firstSentence("*The information below is based on 2026. Trout fishing on ice."), "Trout fishing on ice.");
// 관광공사 제목의 [대괄호] 꼬리(유네스코 표시 등)는 이름 대조에서 뺀다
assert.equal(judge({ name: "영월 장릉" }, "영월 장릉(단종) [유네스코 세계유산]", "12").ok, true);
console.log("ok - 관광공사 대조 규칙");
