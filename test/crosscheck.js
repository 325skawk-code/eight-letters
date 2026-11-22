/* 독립 구현(寿星天文历, sxtwl)과의 교차 검증 — node test/crosscheck.js */
'use strict';
require('../js/calendar-data.js');
const Saju = require('../js/saju-engine.js');
const fs = require('fs');
const path = require('path');

// 신(辛)=천간, 신(申)=지지 — 글자로는 구분되지 않으니 자리로 구분한다.
const toHan = (gz) => {
  const stem = Saju.STEMS.find((s) => s.ko === gz[0]);
  const branch = Saju.BRANCHES.find((b) => b.ko === gz[1]);
  return stem.han + branch.han;
};

const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'sxtwl-crosscheck.json'), 'utf8'));
let bad = 0;
const fails = [];
// 23시대는 자시 규칙(통자시 ↔ 야자시)이 학파마다 달라 교차 대상에서 제외한다.
const target = rows.filter(([, , , hh]) => hh !== 23);
target.forEach(([y, m, d, hh, eYear, eMonth, eDay, eHour]) => {
  const c = Saju.compute({ year: y, month: m, day: d, hour: hh, minute: 30, hourBranch: Math.floor(((hh + 1) % 24) / 2), gender: 'female' });
  if (!c.ok) { bad++; fails.push(`${y}-${m}-${d} 계산 실패`); return; }
  const got = [c.pillars.year.ganzhi, c.pillars.month.ganzhi, c.pillars.day.ganzhi, c.pillars.hour.ganzhi].map(toHan);
  const exp = [eYear, eMonth, eDay, eHour];
  if (got.join(' ') !== exp.join(' ')) {
    bad++;
    if (fails.length < 12) fails.push(`${y}-${m}-${d} ${hh}시: ${got.join(' ')} vs ${exp.join(' ')}`);
  }
});
console.log('교차 검증 표본:', target.length, '/', rows.length, '| 불일치:', bad);
if (bad) { fails.forEach((f) => console.log('  ✗', f)); process.exit(1); }
console.log('년·월·일·시주 전부 일치 ✔ (독립 구현 寿星天文历 기준)');
