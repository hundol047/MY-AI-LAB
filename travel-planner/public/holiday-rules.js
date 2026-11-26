// 자동 생성: node scripts/bake-holiday-rules.mjs (관광공사 '쉬는 날' 원문 → 명절·공휴일 휴무 규칙). 직접 고치지 말 것
// newYear 1월 1일 휴무 · seollal/chuseok "day"(당일)|"am"(오전, 13시부터)|"holiday"(연휴 3일) · holidayClosed 법정공휴일 휴무
// holidayOpen 정기 휴일이 공휴일이면 연다 · shiftNext 그때는 다음 첫 평일에 쉰다
export const HOLIDAY_RULES = {"eulji-observatory":{"newYear":true,"seollal":"am","chuseok":"am","shiftNext":true,"holidayOpen":true},
"baegamsan-cable":{"shiftNext":true,"holidayOpen":true},
"pet-465":{"seollal":"day","chuseok":"day","holidayOpen":true},
"alpaca-world":{"seollal":"day","chuseok":"day"},
"hc-hwaro":{"seollal":"day","chuseok":"day"},
"yanggu-observatory":{"newYear":true,"holidayOpen":true},
"parksookeun":{"newYear":true,"seollal":"am","chuseok":"am","shiftNext":true,"holidayOpen":true},
"yanggu-porcelain":{"newYear":true,"seollal":"am","chuseok":"am","shiftNext":true,"holidayOpen":true},
"yanggu-modern":{"newYear":true,"seollal":"am","chuseok":"am"},
"peace-dam":{"seollal":"day","chuseok":"day"},
"jogyeongcheol":{"newYear":true,"seollal":"day","chuseok":"day","shiftNext":true,"holidayOpen":true},
"parkinhwan":{"newYear":true,"seollal":"day","chuseok":"day"},
"inje-folk":{"newYear":true,"seollal":"day","chuseok":"day","shiftNext":true,"holidayOpen":true},
"birch-museum":{"holidayOpen":true},
"jangneung":{"shiftNext":true,"holidayOpen":true},
"gossigul":{"seollal":"day","chuseok":"day","shiftNext":true,"holidayOpen":true},
"byeolmaro":{"newYear":true,"seollal":"day","chuseok":"day","holidayClosed":true},
"yongyeon-cave":{"shiftNext":true,"holidayOpen":true},
"hyoseok-village":{"newYear":true,"chuseok":"day"},
"cw-peace-observatory":{"newYear":true,"seollal":"holiday","chuseok":"holiday"},
"wj-hanji":{"newYear":true,"seollal":"holiday","chuseok":"holiday"},
"wj-parkkyongni":{"newYear":true,"seollal":"holiday","chuseok":"holiday"},
"hs-forest":{"shiftNext":true,"holidayOpen":true},
"pc-sillok":{"newYear":true,"seollal":"day","chuseok":"day"},
"pc-hangang-source":{"newYear":true,"seollal":"day","chuseok":"day"},
"pc-dalbit":{"newYear":true,"seollal":"day","chuseok":"day","shiftNext":true,"holidayOpen":true},
"pc-leeseungbok":{"seollal":"day","chuseok":"day"},
"pc-botanic":{"newYear":true,"seollal":"day","chuseok":"day","shiftNext":true,"holidayOpen":true},
"pc-olympic":{"newYear":true,"seollal":"day","chuseok":"day"},
"sc-newyork-bakery":{"seollal":"day","chuseok":"day"},
"yy-songi-village":{"seollal":"day","chuseok":"day"},
"yy-dongjjok-sekkosi":{"seollal":"day","chuseok":"day"},
"ojukheon":{"newYear":true,"seollal":"day","chuseok":"day"},
"chamsori":{"shiftNext":true,"holidayOpen":true},
"heo-park":{"newYear":true,"seollal":"day","chuseok":"day"},
"solhyang":{"shiftNext":true,"holidayOpen":true},
"dojjaebi":{"shiftNext":true,"holidayOpen":true},
"samcheok-cable":{"shiftNext":true,"holidayOpen":true},
"kimyoujeong":{"newYear":true,"seollal":"day","chuseok":"day"},
"cc-museum":{"newYear":true,"seollal":"day","chuseok":"day","shiftNext":true,"holidayOpen":true},
"hantan-trail":{"newYear":true,"seollal":"day","chuseok":"day"},
"sheep":{"seollal":"day","chuseok":"day"},
"samtan":{"newYear":true,"seollal":"day","chuseok":"day"},
"cheongnyeongpo":{"seollal":"day","chuseok":"day","shiftNext":true,"holidayOpen":true},
"sogeumsan":{"shiftNext":true,"holidayOpen":true},
"ganhyeon-park":{"shiftNext":true,"holidayOpen":true}};
// eulji-observatory: 매주 월요일 (월요일이 공휴일인 경우 그 다음날) / 1월 1일 / 설날·추석 오전 / 동절기 (12월~2월)
// baegamsan-cable: 매주 월요일 (단, 월요일이 공휴일인 경우 그 다음 평일 휴무) / 정기점검일
// pet-465: 매주 월요일, 화요일 (단, 공휴일 및 대체 휴무일인 경우 정상 운영) / 설·추석 당일
// alpaca-world: 설/추석 당일
// hc-hwaro: 매월 마지막 화요일 / 설·추석
// yanggu-observatory: 매주 월요일 (단, 월요일이 공휴일인 경우 정상운영) / 1월 1일
// parksookeun: 매주 월요일 (단, 월요일이 공휴일인 경우 개관하며, 그 다음 첫번째 평일에 휴관) / 1월 1일 / 설·추석 오전
// yanggu-porcelain: 매주 월요일 (단, 월요일이 공휴일인 경우 다음 첫번째 평일에 휴관) / 1월 1일 / 설·추석 오전
// yanggu-modern: 매주 월요일 / 1월 1일 / 설·추석 오전
// peace-dam: 설·추석 당일
// jogyeongcheol: 매주 월요일 (월요일이 공휴일인 경우 익일 휴무) / 1월 1일 / 설·추석 당일
// parkinhwan: 매주 월요일 / 1월 1일 / 설·추석 당일
// inje-folk: 매주 월요일(단, 월요일이 법정공휴일인 경우 다음날 휴관) / 1월 1일 / 설·추석 당일
// birch-museum: 매주 화요일~목요일 (단, 휴관일이 공휴일인 경우 개관)
// jangneung: 매주 월요일※ 단, 월요일이 공휴일인 경우 개방하며, 그 다음 평일에 휴관
// gossigul: 매주 월요일, 설/추석 당일(월요일 공휴일인 경우 다음날 휴무)
// byeolmaro: 매주 월요일 / 법정공휴일 / 1월 1일 / 설·추석 당일※ 기관사정에 따라 변동될 수 있으므로 자세한 사항은 홈페이지 참조
// yongyeon-cave: 매주 월요일 (단, 월요일이 공휴일인 경우 다음 평일 휴관)
// hyoseok-village: 매주 월요일 / 1월 1일 / 추석
// cw-peace-observatory: 매주 화요일 / 1월 1일 / 설·추석 연휴
// wj-hanji: 매주 월요일 / 1월 1일 / 설·추석 연휴
// wj-parkkyongni: 매주 월요일 / 1월 1일 / 설·추석 연휴
// hs-forest: 매월 첫째 월요일 (단, 월요일이 공휴일인 경우 그 다음 평일 휴무)
// pc-sillok: 매주 월요일 / 1월1일 / 설·추석 당일※ 시설 보수 및 전시물 교체·정비 때 필요할 경우 임시 휴관
// pc-hangang-source: 매주 월요일 / 1월 1일 / 설·추석 당일
// pc-dalbit: 월요일, 신정, 설날, 추석 휴무 월요일이 공휴일인 경우 다음날 휴무
// pc-leeseungbok: 설·추석 당일
// pc-botanic: 매주 월요일 (단, 월요일이 공휴일인 경우 그 다음날 평일이 휴관) / 1월 1일 / 설·추석 당일
// pc-olympic: 매주 월요일 / 1월 1일 / 설·추석 당일
// sc-newyork-bakery: 설·추석
// yy-songi-village: 매주 화요일 / 설·추석 당일
// yy-dongjjok-sekkosi: 매주 화요일 / 설·추석 당일
// ojukheon: 연중무휴※ 1월 1일·설·추석 당일은 오죽헌만 개방(실내 전시실 휴관)
// chamsori: 매주 화요일 (단, 화요일이 공휴일인 경우 그 다음날 휴관)
// heo-park: 매주 월요일 / 1월 1일 / 설·추석 당일
// solhyang: 매주 월요일 (단, 월요일이 공휴일인 경우 그 다음날 휴원)
// dojjaebi: 매주 월요일 (단, 월요일이 공휴일인 경우 그 다음 평일 휴장)※ 체험시설은 실외 체험시설로 기상 악화 시 안전상 운영 중단될 수 있음
// samcheok-cable: 매월 첫째 주, 셋째 주 화요일 (단, 공휴일인 경우 다음 평일 휴무) / ※ 기상(강풍) 상황에 따라 운행이 중단될 수 있음
// kimyoujeong: 매주 월요일 / 1월 1일 / 설·추석 당일
// cc-museum: 매주 월요일 / 1월 1일 / 설·추석 당일※ 단, 월요일이 공휴일이면 다음 첫 번째 평일에 휴관
// hantan-trail: 매주 화요일 / 1월 1일 / 설·추석 당일
// sheep: 설·추석 당일
// samtan: 매주 월요일 / 화요일 / 1월 1일 / 설·추석 당일※ 임시 휴관일 별도 공지
// cheongnyeongpo: 매주 월요일 (단, 월요일이 공휴일인 경우 그 다음 날 휴무) / 설·추석 당일
// sogeumsan: 매주 월요일 (단, 월요일이 공휴일인 경우 그 다음날 휴장)
// ganhyeon-park: 매주 월요일 (단, 월요일이 공휴일인 경우 그 다음날 평일)
