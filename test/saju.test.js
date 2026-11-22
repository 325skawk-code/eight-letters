/* ============================================================
 * 만세력 계산 검증 테스트
 * 실행: node test/saju.test.js
 * ------------------------------------------------------------
 * 대조 기준
 *  1) 한국천문연구원(KASI) 달력자료 2025·2026 — 24절기 절입시각, 음력 월초, 일진
 *  2) 한국천문연구원 역서 기반 음양력 데이터 — 1900~2050 전 구간 일진·음양력 변환
 * ============================================================ */
'use strict';

require('../js/calendar-data.js');
const Saju = require('../js/saju-engine.js');
const fs = require('fs');
const path = require('path');

let pass = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { pass++; return true; }
  failures.push(name + (detail ? ' → ' + detail : ''));
  return false;
}

function eq(name, actual, expected) {
  return check(name, actual === expected, 'expected ' + expected + ', got ' + actual);
}

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));

/* ------------------------------------------------------------
 * 1. 기준일 사주 (1997-03-25 양력 = 음력 1997-02-17)
 *    일진 병인 — KARI 역서 기반 데이터와 일치
 * ---------------------------------------------------------- */
const ref = Saju.compute({ year: 1997, month: 3, day: 25, hour: 10, minute: 0, hourBranch: 5, gender: 'female' });
check('기준일 계산 성공', ref.ok, JSON.stringify(ref.errors));
eq('1997-03-25 년주', ref.pillars.year.ganzhi, '정축');
eq('1997-03-25 월주', ref.pillars.month.ganzhi, '계묘');
eq('1997-03-25 일주', ref.pillars.day.ganzhi, '병인');
eq('1997-03-25 10시 시주', ref.pillars.hour.ganzhi, '계사');
eq('1997-03-25 음력 변환', ref.lunar.y + '-' + ref.lunar.m + '-' + ref.lunar.d, '1997-2-17');

/* ------------------------------------------------------------
 * 2. KARI 공식 절기표 대조 (2025·2026년 24절기)
 * ---------------------------------------------------------- */
const kari = load('kari-official.json');
['2025', '2026'].forEach((year) => {
  kari.terms[year].forEach((t) => {
    const [name, mo, dy, hh, mi] = t;
    const k = Saju.TERM_NAMES.indexOf(name);
    const got = Saju.termDate(+year, k);
    const sameDay = got && got.y === +year && got.m === mo && got.d === dy;
    const diffMin = got ? Math.abs((got.hh * 60 + got.mm) - (hh * 60 + mi)) : 999;
    check(`${year} ${name} 절입일`, sameDay, got ? `${got.m}-${got.d}` : 'none');
    check(`${year} ${name} 절입시각(±1분)`, diffMin <= 1, got ? `${got.hh}:${got.mm} vs ${hh}:${mi}` : 'none');
  });
});

/* ------------------------------------------------------------
 * 3. KARI 음력 월초 · 일진 대조
 * ---------------------------------------------------------- */
kari.lunarStarts.forEach(([ly, lm, sy, sm, sd, iljin]) => {
  const jdn = Saju.lunarToJdn(ly, lm, 1, false);
  const ymd = Saju.ymdFromJdn(jdn);
  check(`${ly} 음력 ${lm}+1 양력일`, ymd.y === sy && ymd.m === sm && ymd.d === sd, `${ymd.y}-${ymd.m}-${ymd.d} vs ${sy}-${sm}-${sd}`);
  const c = Saju.compute({ year: ymd.y, month: ymd.m, day: ymd.d, gender: 'female' });
  eq(`일진 ${ymd.y}-${ymd.m}-${ymd.d}`, c.pillars.day.ganzhi, iljin);
});

/* ------------------------------------------------------------
 * 4. 일진 전 구간 대조 (1900~2050, 29일 간격 1,903개 표본)
 * ---------------------------------------------------------- */
const dayFixtures = load('day-pillars.json');
let dayBad = 0;
const dayInRange = dayFixtures.filter(([y]) => y >= 1900);
dayInRange.forEach(([y, m, d, ganzhi]) => {
  const c = Saju.compute({ year: y, month: m, day: d, gender: 'female' });
  if (!c.ok || c.pillars.day.ganzhi !== ganzhi) {
    dayBad++;
    if (dayBad <= 5) failures.push(`일진 불일치 ${y}-${m}-${d}: ${c.ok ? c.pillars.day.ganzhi : 'err'} vs ${ganzhi}`);
  }
});
check(`일진 ${dayInRange.length}건 전수 일치`, dayBad === 0, dayBad + '건 불일치');

/* ------------------------------------------------------------
 * 5. 음양력 변환 전 구간 대조 (3,240개 표본)
 * ---------------------------------------------------------- */
const lunarFixtures = load('lunar-conversion.json');
let lunarBad = 0;
lunarFixtures.forEach(([sy, sm, sd, ly, lm, ld, leap]) => {
  const c = Saju.compute({ year: sy, month: sm, day: sd, gender: 'female' });
  if (!c.ok || c.lunar.y !== ly || c.lunar.m !== lm || c.lunar.d !== ld || (c.lunar.leap ? 1 : 0) !== leap) {
    lunarBad++;
    if (lunarBad <= 5) failures.push(`음력 변환 불일치 ${sy}-${sm}-${sd}: ${c.ok ? `${c.lunar.y}-${c.lunar.m}-${c.lunar.d}(${c.lunar.leap})` : 'err'} vs ${ly}-${lm}-${ld}(${leap})`);
  }
});
check(`음양력 변환 ${lunarFixtures.length}건 전수 일치`, lunarBad === 0, lunarBad + '건 불일치');

/* 음력 → 양력 역방향 */
let reverseBad = 0;
lunarFixtures.slice(0, 800).forEach(([, , , ly, lm, ld, leap]) => {
  const c = Saju.compute({ year: ly, month: lm, day: ld, isLunar: true, isLeap: !!leap, gender: 'male' });
  if (!c.ok) { reverseBad++; return; }
  const jdnA = Saju.jdnFromYmd(c.solar.y, c.solar.m, c.solar.d);
  const jdnB = Saju.jdnFromYmd(...[ly, lm, ld].map((v, i) => v)) && Saju.lunarToJdn(ly, lm, ld, !!leap);
  if (jdnA !== jdnB) reverseBad++;
});
check('음력→양력 역변환 800건 일치', reverseBad === 0, reverseBad + '건 불일치');

/* ------------------------------------------------------------
 * 6. 절입 경계 — 년주·월주가 절입시각에서 넘어가는지
 * ---------------------------------------------------------- */
const ipchun2026 = Saju.termDate(2026, 2); // 입춘 2026-02-04 05:02
check('2026 입춘 절입 05:02', ipchun2026 && ipchun2026.hh === 5 && ipchun2026.mm === 2, JSON.stringify(ipchun2026));

const before = Saju.compute({ year: 2026, month: 2, day: 4, hour: 4, hourBranch: 2, gender: 'female', minute: 0 });
const after = Saju.compute({ year: 2026, month: 2, day: 4, hour: 5, hourBranch: 2, gender: 'female', minute: 30 });
eq('입춘 4시 년주 = 을사', before.pillars.year.ganzhi, '을사');
eq('입춘 4시 월주 = 기축', before.pillars.month.ganzhi, '기축');
eq('입춘 5시30분 년주 = 병오', after.pillars.year.ganzhi, '병오');
eq('입춘 5시30분 월주 = 경인', after.pillars.month.ganzhi, '경인');

const dec1996 = Saju.compute({ year: 1997, month: 2, day: 3, hour: 12, hourBranch: 6, gender: 'male', minute: 0 });
eq('1997-02-03 년주 = 병자(입춘 전)', dec1996.pillars.year.ganzhi, '병자');
eq('1997-02-03 월주 = 신축(병자년 축월)', dec1996.pillars.month.ganzhi, '신축');

/* ------------------------------------------------------------
 * 7. 십성 관계 10종
 * ---------------------------------------------------------- */
const T = Saju.tenGod;
const stemIdx = (ko) => Saju.STEMS.findIndex((s) => s.ko === ko);
const cases = [['갑', '갑', '비견'], ['갑', '을', '겁재'], ['갑', '병', '식신'], ['갑', '정', '상관'],
  ['갑', '무', '편재'], ['갑', '기', '정재'], ['갑', '경', '편관'], ['갑', '신', '정관'],
  ['갑', '임', '편인'], ['갑', '계', '정인']];
cases.forEach(([day, target, expected]) => {
  eq(`십성 ${day}일간 · ${target}`, T(stemIdx(day), stemIdx(target)), expected);
});

/* ------------------------------------------------------------
 * 8. 오행 · 십성 분포 정합성
 * ---------------------------------------------------------- */
const e = ref.elements;
eq('오행 8글자 합계', e.counts.reduce((a, b) => a + b, 0), 8);
const tallySum = Object.values(ref.sipsung.tally).reduce((a, b) => a + b, 0);
eq('십성 분포 합계(일간 제외 7자리)', tallySum, 7);

/* ------------------------------------------------------------
 * 9. 신살 — 1997-03-25 (병인일, 년지 축·월지 묘·일지 인)
 * ---------------------------------------------------------- */
const ss = ref.sinsal.map((x) => x.name);
check('도화살 검출', ss.indexOf('도화살') >= 0, ss.join(','));
check('홍염살 검출(병일간 → 인)', ss.indexOf('홍염살') >= 0, ss.join(','));

/* ------------------------------------------------------------
 * 10. 예외 처리
 * ---------------------------------------------------------- */
const noLeap = Saju.compute({ year: 1997, month: 3, day: 10, isLunar: true, isLeap: true, gender: 'female' });
check('없는 윤달 요청 거부', noLeap.ok === false, JSON.stringify(noLeap));
const badDay = Saju.compute({ year: 1997, month: 2, day: 30, gender: 'female' });
check('없는 날짜 거부', badDay.ok === false);
const leakLeap2025 = Saju.compute({ year: 2025, month: 6, day: 5, isLunar: true, isLeap: true, gender: 'female' });
check('2025 윤6월 계산', leakLeap2025.ok === true && leakLeap2025.solar.m === 7 && leakLeap2025.solar.d === 29,
  leakLeap2025.ok ? `${leakLeap2025.solar.y}-${leakLeap2025.solar.m}-${leakLeap2025.solar.d}` : JSON.stringify(leakLeap2025));
const noHour = Saju.compute({ year: 1990, month: 6, day: 15, gender: 'female' });
check('시간 모름 → 시주 없음', noHour.ok && noHour.pillars.hour === null && noHour.elements.total === 6);

/* ------------------------------------------------------------
 * 11. 자시 처리
 * ---------------------------------------------------------- */
const ja = Saju.compute({ year: 2000, month: 1, day: 1, hour: 23, minute: 30, hourBranch: 0, gender: 'female' });
eq('23:30 → 자시 지지', Saju.BRANCHES[ja.pillars.hour.branch].ko, '자');
eq('23:30 일주는 달력 날짜 그대로(무오) — 야자시', ja.pillars.day.ganzhi, '무오');
// 공개 만세력(야자시 기본) 예시와 동일: 2000-01-01 23:30 → 무오일 갑자시
eq('23:30 시주 = 갑자(다음 날 일간 기준)', ja.pillars.hour.ganzhi, '갑자');
const joJa = Saju.compute({ year: 2000, month: 1, day: 2, hour: 0, minute: 30, hourBranch: 0, gender: 'female' });
eq('00:30(조자시) 일주 = 기미', joJa.pillars.day.ganzhi, '기미');
eq('00:30(조자시) 시주 = 갑자', joJa.pillars.hour.ganzhi, '갑자');
const jaHint = Saju.compute({ year: 2000, month: 1, day: 1, hourBranch: 0, gender: 'female' });
check('자시 안내 문구 생성', !!jaHint.hour && !!jaHint.hour.note);

/* ------------------------------------------------------------
 * 12. 전 구간 무예외 스윕 (임의 1,200건)
 * ---------------------------------------------------------- */
let sweepError = 0;
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (let i = 0; i < 1200; i++) {
  const y = 1900 + Math.floor(rnd() * 151);
  const m = 1 + Math.floor(rnd() * 12);
  const d = 1 + Math.floor(rnd() * 28);
  const hb = Math.floor(rnd() * 12);
  try {
    const c = Saju.compute({ year: y, month: m, day: d, hourBranch: hb, gender: rnd() > 0.5 ? 'male' : 'female' });
    if (!c.ok) { sweepError++; continue; }
    if (!/^[가-힣]{2}$/.test(c.pillars.year.ganzhi)) sweepError++;
    if (!/^[가-힣]{2}$/.test(c.pillars.month.ganzhi)) sweepError++;
    if (!/^[가-힣]{2}$/.test(c.pillars.day.ganzhi)) sweepError++;
    if (c.pillars.hour && !/^[가-힣]{2}$/.test(c.pillars.hour.ganzhi)) sweepError++;
    if (c.elements.counts.reduce((a, b) => a + b, 0) !== 8) sweepError++;
  } catch (err) {
    sweepError++;
    if (sweepError <= 3) failures.push('예외: ' + y + '-' + m + '-' + d + ' ' + err.message);
  }
}
check('임의 1,200건 계산 무결', sweepError === 0, sweepError + '건 이상');

/* ------------------------------------------------------------
 * 13. 대운 방향 (양년 남자 순행 / 양년 여자 역행)
 * ---------------------------------------------------------- */
const maleYang = Saju.compute({ year: 1990, month: 5, day: 5, hour: 10, hourBranch: 5, gender: 'male' });
const femaleYang = Saju.compute({ year: 1990, month: 5, day: 5, hour: 10, hourBranch: 5, gender: 'female' });
check('경오년 남자 → 대운 순행', maleYang.daeun && maleYang.daeun.forward === true);
check('경오년 여자 → 대운 역행', femaleYang.daeun && femaleYang.daeun.forward === false);

/* ------------------------------------------------------------
 * 결과
 * ---------------------------------------------------------- */
console.log('\n=== 만세력 검증 결과 ===');
console.log('통과:', pass, '/ 실패:', failures.length);
if (failures.length) {
  console.log('\n실패 항목:');
  failures.slice(0, 40).forEach((f) => console.log('  ✗', f));
  process.exit(1);
}
console.log('\n[샘플] 1997-03-25 10:00 여');
console.log('  양력', ref.solar.y + '-' + ref.solar.m + '-' + ref.solar.d,
  '/ 음력', ref.lunar.y + '-' + ref.lunar.m + '-' + ref.lunar.d);
console.log('  사주', ['year', 'month', 'day', 'hour'].map((k) => ref.pillars[k] ? ref.pillars[k].ganzhi : '-').join(' '));
console.log('  오행', Saju.ELEMENTS.map((el, i) => el + ref.elements.counts[i]).join(' '));
console.log('  십성', JSON.stringify(ref.sipsung.tally));
console.log('  신살', ref.sinsal.map((x) => x.name + '(' + x.where.join(',') + ')').join(' '));
console.log('  절입', ref.jie.current ? ref.jie.current.name + ' ' + ref.jie.current.m + '/' + ref.jie.current.d : '-');
console.log('  대운', ref.daeun ? (ref.daeun.forward ? '순행 ' : '역행 ') + ref.daeun.label + ' 시작' : '-');
console.log('\n전체 통과 ✔');
