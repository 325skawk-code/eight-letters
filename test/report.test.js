/* ============================================================
 * 유료 리포트 검증
 * 실행: node test/report.test.js
 * ------------------------------------------------------------
 * 확인하는 것
 *  1) 어떤 사주든 리포트가 예외 없이 만들어진다 (시간 모름·음력·1900·2050 포함)
 *  2) 대운 목록이 10년 단위로 이어지고 '지금' 구간이 하나뿐이다
 *  3) 2027년 열두 달이 절입일로 끊기고 간지가 오호둔과 맞는다
 *  4) 월별 관계(충·형·파·해·육합)가 원국 지지와 정확히 맞는다
 *  5) 계산과 무관한 예시 문구(‘3월 하순’, ‘31세’, ‘○○’)가 남아 있지 않다
 *  6) 이름 등 입력값이 HTML로 새지 않는다
 * ============================================================ */
'use strict';

require('../js/calendar-data.js');
require('../js/config.js');
const Saju = require('../js/saju-engine.js');
const C = require('../js/content.js');
const Report = require('../js/report.js');

let pass = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { pass++; return true; }
  failures.push(name + (detail ? ' → ' + detail : ''));
  return false;
}

const STANDARD_ERRORS = [
  'undefined', 'null', 'NaN', '[object', '○○', '3월 하순', '24세, 31세',
  '예시 카피', '...더', '없는 값'
];

function randomInputs(n) {
  const out = [
    { year: 1997, month: 3, day: 25, hour: 10, minute: 0, hourBranch: 5, gender: 'female', name: '김민지' },
    { year: 1997, month: 3, day: 25, gender: 'female' },
    { year: 1900, month: 1, day: 1, gender: 'male' },
    { year: 2050, month: 12, day: 31, gender: 'female' },
    { year: 2000, month: 1, day: 1, hour: 23, minute: 30, hourBranch: 0, gender: 'male' },
    { year: 2025, month: 6, day: 5, isLunar: true, isLeap: true, gender: 'female' },
    { year: 1988, month: 2, day: 4, hour: 4, minute: 59, hourBranch: 2, gender: 'male' },
    { year: 1996, month: 12, day: 31, hour: 23, minute: 10, hourBranch: 0, gender: 'female' }
  ];
  let seed = 20261123;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < n; i++) {
    out.push({
      year: 1901 + Math.floor(rnd() * 148),
      month: 1 + Math.floor(rnd() * 12),
      day: 1 + Math.floor(rnd() * 28),
      hourBranch: Math.floor(rnd() * 12),
      hour: Math.floor(rnd() * 24),
      minute: Math.floor(rnd() * 60),
      gender: rnd() > 0.5 ? 'male' : 'female',
      name: rnd() > 0.7 ? '테스트' : ''
    });
  }
  return out;
}

const cases = randomInputs(48);
let built = 0;

cases.forEach((input, ci) => {
  const res = Saju.compute(input);
  if (!res.ok) return;
  built++;

  let m, html, teas;
  try {
    m = Report.build(res, input, { nowY: 2026, nowM: 11, focusYear: 2027 });
    html = Report.render(m);
    teas = Report.teasers(m);
  } catch (e) {
    check('리포트 생성 ' + ci, false, e.message);
    return;
  }
  check('리포트 생성 ' + ci, true);

  /* --- 필수 섹션 --- */
  ['10년 대운의 흐름', '평생 재물운의 구조', '연애와 인연', '2027 정미년 월별 흐름', '개운 전략', '계산 기준']
    .forEach((t) => check('섹션 ' + t + ' #' + ci, html.indexOf(t) >= 0));

  /* --- 예시 문구 잔존 확인 --- */
  STANDARD_ERRORS.forEach((bad) => {
    check('금지 문구 없음(' + bad + ') #' + ci, html.indexOf(bad) < 0);
  });

  /* --- 대운 --- */
  const list = m.daeun.list;
  check('대운 개수 #' + ci, list.length === 8, String(list.length));
  check('대운 간격 10년 #' + ci, list.every((d, i) => d.age === list[0].age + i * 10));
  check('대운 간지 형식 #' + ci, list.every((d) => /^[가-힣]{2}$/.test(d.ganzhi)));
  check('현재 대운 하나 #' + ci, list.filter((d) => d.isCurrent).length === 1);
  check('대운 방향과 간지 진행 #' + ci, (function () {
    const mi = Saju.cycleIndexOf(res.pillars.month.stem, res.pillars.month.branch);
    return list.every((d, i) => {
      const expect = ((mi + (res.daeun.forward ? i + 1 : -(i + 1))) % 60 + 60) % 60;
      return expect === Saju.cycleIndexOf(d.stem, d.branch);
    });
  })());

  /* --- 2027년 열두 달 --- */
  const months = m.year.months;
  check('열두 달 #' + ci, months.length === 12);
  check('달 순서(인~축) #' + ci, months.every((mo, i) => mo.branch === (2 + i) % 12));
  check('절입일 이어짐 #' + ci, months.every((mo, i) => {
    if (i === 11) return true;
    return mo.to && months[i + 1].from &&
      mo.to.y === months[i + 1].from.y && mo.to.m === months[i + 1].from.m && mo.to.d === months[i + 1].from.d;
  }));
  check('오호둔 월간 #' + ci, months.every((mo, i) => {
    const yp = Saju.yearPillarOf(2027);
    const inStem = ((yp.stem % 5) * 2 + 2) % 10;
    return mo.stem === (inStem + i) % 10;
  }));

  /* --- 월별 관계 정확성 --- */
  check('월-원국 관계 일치 #' + ci, months.every((mo) => {
    return mo.hits.every((h) => {
      const natalBranch = res.pillars[h.pos].branch;
      return Saju.branchRelations(mo.branch, natalBranch).indexOf(h.rel) >= 0;
    });
  }));

  /* --- 돈이 움직이는 달 조건 --- */
  check('돈 달은 충 없음 #' + ci, m.year.moneyMonths.every((mo) => mo.isMoney && !mo.hasChung));

  /* --- 재물 --- */
  check('돈 트이는 해 범위 #' + ci, m.wealth.years.every((y) => y.year >= 2026 && y.year <= 2035));
  check('재물 문장 존재 #' + ci, !!(m.wealth.pattern && m.wealth.pattern.body));

  /* --- 인연 --- */
  check('일지 충 상대 #' + ci, m.love.badBranch === null ||
    Saju.branchRelations(m.love.badBranch, res.pillars.day.branch).indexOf('충') >= 0);
  check('좋은 인연 지지 #' + ci, m.love.goodBranches.every((b) => b.idx >= 0 && b.idx < 12));

  /* --- 개운 --- */
  check('개운 카드 #' + ci, m.remedy.cards.length >= 1 && m.remedy.cards.length <= 2);

  /* --- 티저 --- */
  check('티저 개수 #' + ci, teas.length === 5, String(teas.length));
  check('티저 문구 채워짐 #' + ci, teas.every((t) => t.tag && t.title && t.preview && t.preview.length > 10));
});

/* ------------------------------------------------------------
 * 입력값 이스케이프
 * ---------------------------------------------------------- */
const xss = Saju.compute({ year: 1990, month: 5, day: 5, hour: 10, hourBranch: 5, gender: 'female', name: '<img src=x onerror=1>' });
const xssHtml = Report.render(Report.build(xss, { name: '<img src=x onerror=1>' }, { nowY: 2026, nowM: 11 }));
check('이름 HTML 이스케이프', xssHtml.indexOf('&lt;img') >= 0 && xssHtml.indexOf('<img src=x') < 0);

/* ------------------------------------------------------------
 * 기준 사주 손검증: 1997-03-25 10:00 여
 *   2027 정미년 미월(7.7~8.8)은 년지 축과 충
 * ---------------------------------------------------------- */
const ref = Saju.compute({ year: 1997, month: 3, day: 25, hour: 10, minute: 0, hourBranch: 5, gender: 'female' });
const refm = Report.build(ref, {}, { nowY: 2026, nowM: 11, focusYear: 2027 });
const mi = refm.year.months[5]; // 미월
check('미월 = 정미', mi.ganzhi === '정미', mi.ganzhi);
check('미월은 년지 축과 충', mi.hits.some((h) => h.rel === '충' && h.pos === 'year'), JSON.stringify(mi.hits));
check('미월이 주의할 달에 포함', refm.year.months.filter((x) => x.hasChung).some((x) => x.ganzhi === '정미'));
check('병인일 · 인과 신은 충', Saju.branchRelations(2, 8).indexOf('충') >= 0);
check('현재 대운은 병오', refm.daeun.current.ganzhi === '병오', refm.daeun.current.ganzhi);
check('대운 시작 3세', refm.daeun.startAge === 3, String(refm.daeun.startAge));

/* ------------------------------------------------------------
 * 결과
 * ---------------------------------------------------------- */
console.log('\n=== 유료 리포트 검증 ===');
console.log('검산한 사주:', built, '건 / 통과:', pass, '/ 실패:', failures.length);
if (failures.length) {
  console.log('\n실패 항목:');
  failures.slice(0, 30).forEach((f) => console.log('  ✗', f));
  process.exit(1);
}
console.log('전체 통과 ✔');
