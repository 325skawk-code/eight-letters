/* ============================================================
 * 사주 계산 엔진 (만세력)
 * ------------------------------------------------------------
 * - 일주 : 율리우스적일(JDN) 기반 60갑자. (JDN + 49) % 60 → 0 = 갑자
 * - 년주 : 입춘 절입시각 기준
 * - 월주 : 12절(소한·입춘·경칩·청명·입하·망종·소서·입추·백로·한로·입동·대설) 절입시각 기준
 * - 시주 : 일간 + 12지시
 * - 음력 : 한국천문연구원 역서 기반 음양력 테이블(1899~2050)
 * - 절입시각 : 태양 황경 15도 단위 실측값(1899~2050), 한국표준시(KST, UTC+9)
 * 브라우저와 Node 양쪽에서 동작한다.
 * ============================================================ */
(function (g) {
  'use strict';

  var CAL = g.SAJU_CAL;
  if (!CAL) throw new Error('calendar-data.js must be loaded before saju-engine.js');

  /* ---------- 기본 상수 ---------- */
  var STEMS = [
    { ko: '갑', han: '甲', el: 0, yang: true },
    { ko: '을', han: '乙', el: 0, yang: false },
    { ko: '병', han: '丙', el: 1, yang: true },
    { ko: '정', han: '丁', el: 1, yang: false },
    { ko: '무', han: '戊', el: 2, yang: true },
    { ko: '기', han: '己', el: 2, yang: false },
    { ko: '경', han: '庚', el: 3, yang: true },
    { ko: '신', han: '辛', el: 3, yang: false },
    { ko: '임', han: '壬', el: 4, yang: true },
    { ko: '계', han: '癸', el: 4, yang: false }
  ];

  var BRANCHES = [
    { ko: '자', han: '子', el: 4, animal: '쥐', hidden: [9] },
    { ko: '축', han: '丑', el: 2, animal: '소', hidden: [5] },
    { ko: '인', han: '寅', el: 0, animal: '호랑이', hidden: [0] },
    { ko: '묘', han: '卯', el: 0, animal: '토끼', hidden: [1] },
    { ko: '진', han: '辰', el: 2, animal: '용', hidden: [4] },
    { ko: '사', han: '巳', el: 1, animal: '뱀', hidden: [2] },
    { ko: '오', han: '午', el: 1, animal: '말', hidden: [3] },
    { ko: '미', han: '未', el: 2, animal: '양', hidden: [5] },
    { ko: '신', han: '申', el: 3, animal: '원숭이', hidden: [6] },
    { ko: '유', han: '酉', el: 3, animal: '닭', hidden: [7] },
    { ko: '술', han: '戌', el: 2, animal: '개', hidden: [4] },
    { ko: '해', han: '亥', el: 4, animal: '돼지', hidden: [8] }
  ];

  var ELEMENTS = ['목', '화', '토', '금', '수'];
  var ELEM_HAN = ['木', '火', '土', '金', '水'];

  var TERM_NAMES = ['소한', '대한', '입춘', '우수', '경칩', '춘분', '청명', '곡우',
    '입하', '소만', '망종', '하지', '소서', '대서', '입추', '처서',
    '백로', '추분', '한로', '상강', '입동', '소설', '대설', '동지'];

  // 월을 여는 12절의 인덱스
  var JIE_IDX = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

  var TEN_GODS = {
    bigyeon: '비견', geupjae: '겁재', siksan: '식신', sanggwan: '상관',
    pyeonjae: '편재', jeongjae: '정재', pyeongwan: '편관', jeonggwan: '정관',
    pyeonin: '편인', jeongin: '정인'
  };

  var SIPSUNG_GROUP = {
    '비견': '비겁', '겁재': '비겁', '식신': '식상', '상관': '식상',
    '편재': '재성', '정재': '재성', '편관': '관성', '정관': '관성',
    '편인': '인성', '정인': '인성'
  };

  var ZODIAC_HOUR = [
    { ko: '자시', from: 23, to: 1 }, { ko: '축시', from: 1, to: 3 },
    { ko: '인시', from: 3, to: 5 }, { ko: '묘시', from: 5, to: 7 },
    { ko: '진시', from: 7, to: 9 }, { ko: '사시', from: 9, to: 11 },
    { ko: '오시', from: 11, to: 13 }, { ko: '미시', from: 13, to: 15 },
    { ko: '신시', from: 15, to: 17 }, { ko: '유시', from: 17, to: 19 },
    { ko: '술시', from: 19, to: 21 }, { ko: '해시', from: 21, to: 23 }
  ];

  var MIN_YEAR = 1900;
  var MAX_YEAR = 2050;

  /* ---------- 산술 유틸 ---------- */
  function mod(n, m) { return ((n % m) + m) % m; }

  function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  function daysInMonth(y, m) {
    var t = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (m === 2 && isLeapYear(y)) return 29;
    return t[m - 1];
  }

  function jdnFromYmd(y, m, d) {
    var a = Math.floor((14 - m) / 12);
    var yy = y + 4800 - a;
    var mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy +
      Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }

  function ymdFromJdn(jdn) {
    var a = jdn + 32044;
    var b = Math.floor((4 * a + 3) / 146097);
    var c = a - Math.floor(146097 * b / 4);
    var d = Math.floor((4 * c + 3) / 1461);
    var e = c - Math.floor(1461 * d / 4);
    var m = Math.floor((5 * e + 2) / 153);
    return {
      y: 100 * b + d - 4800 + Math.floor(m / 10),
      m: m + 3 - 12 * Math.floor(m / 10),
      d: e - Math.floor((153 * m + 2) / 5) + 1
    };
  }

  /* ---------- 음력 테이블 ---------- */
  function lunarBits(y) { return CAL.lunarBits[y - CAL.lunarStartYear]; }
  function lunarLeapMonth(y) { return (lunarBits(y) >> 12) & 0x0f; }
  function lunarLeapBig(y) { return (lunarBits(y) >> 16) & 1; }

  function lunarMonthDays(y, m, isLeap) {
    if (isLeap) return lunarLeapBig(y) ? 30 : 29;
    return ((lunarBits(y) >> (12 - m)) & 1) ? 30 : 29;
  }

  function lunarNewYearJdn(y) { return CAL.lunarNewYearJdn[y - CAL.lunarStartYear]; }

  function lunarToJdn(y, m, d, isLeap) {
    var leap = lunarLeapMonth(y);
    if (isLeap && leap !== m) return null;
    var days = 0, i;
    for (i = 1; i < m; i++) days += lunarMonthDays(y, i, false);
    if (isLeap) days += lunarMonthDays(y, m, false);
    else if (leap > 0 && leap < m) days += lunarMonthDays(y, leap, true);
    return lunarNewYearJdn(y) + days + d - 1;
  }

  function jdnToLunar(jdn) {
    var y = 1899;
    while (y < CAL.lunarStartYear + CAL.lunarNewYearJdn.length - 1 && lunarNewYearJdn(y + 1) <= jdn) y++;
    var offset = jdn - lunarNewYearJdn(y);
    var leap = lunarLeapMonth(y);
    var m = 1, len;
    for (m = 1; m <= 12; m++) {
      len = lunarMonthDays(y, m, false);
      if (offset < len) return { y: y, m: m, d: offset + 1, leap: false };
      offset -= len;
      if (leap === m) {
        len = lunarMonthDays(y, m, true);
        if (offset < len) return { y: y, m: m, d: offset + 1, leap: true };
        offset -= len;
      }
    }
    // 12월 말 이후는 다음 해 1월 1일에 해당
    return { y: y + 1, m: 1, d: 1, leap: false };
  }

  /* ---------- 절기 테이블 ---------- */
  var termCache = {};

  function termMinutes(year, k) {
    var row = termCache[year];
    if (!row) {
      var raw = CAL.termBase36[year - CAL.termStartYear];
      if (typeof raw !== 'string' || raw.length < 96) return null;
      row = termCache[year] = [];
      for (var i = 0; i < 24; i++) row.push(parseInt(raw.substr(i * 4, 4), 36));
    }
    return row[k];
  }

  // 1899-01-01 00:00 KST부터 흐른 분. 날짜 계산 전용(절대 비교용).
  function wallMinutes(y, m, d, hh, mm) {
    return jdnFromYmd(y, m, d) * 1440 + (hh || 0) * 60 + (mm || 0);
  }

  function termAbsMinutes(year, k) {
    var v = termMinutes(year, k);
    if (v === null) return null;
    return jdnFromYmd(year, 1, 1) * 1440 + v;
  }

  function termDate(year, k) {
    var v = termMinutes(year, k);
    if (v === null) return null;
    var jdn = jdnFromYmd(year, 1, 1) + Math.floor(v / 1440);
    var rest = v % 1440;
    var ymd = ymdFromJdn(jdn);
    ymd.hh = Math.floor(rest / 60);
    ymd.mm = rest % 60;
    ymd.name = TERM_NAMES[k];
    ymd.k = k;
    return ymd;
  }

  /**
   * 출생 시각이 속한 절(節)을 찾는다.
   * @return {{current: object, next: object, index: number}}
   */
  function findJie(absMinutes, birthYear) {
    var best = null, next = null, i, y, k, t;
    for (y = birthYear - 1; y <= birthYear + 1; y++) {
      if (y < CAL.termStartYear || y > CAL.termStartYear + CAL.termBase36.length - 1) continue;
      for (i = 0; i < JIE_IDX.length; i++) {
        k = JIE_IDX[i];
        t = termAbsMinutes(y, k);
        if (t === null) continue;
        if (t <= absMinutes) {
          if (!best || t > best.abs) best = { abs: t, year: y, k: k };
        } else if (!next || t < next.abs) {
          next = { abs: t, year: y, k: k };
        }
      }
    }
    return {
      current: best ? termDate(best.year, best.k) : null,
      next: next ? termDate(next.year, next.k) : null,
      index: best ? best.k : null
    };
  }

  /* ---------- 십성 ---------- */
  function tenGod(dayStem, targetStem) {
    var ds = STEMS[dayStem], ts = STEMS[targetStem];
    var same = ds.yang === ts.yang;
    var rel = mod(ts.el - ds.el, 5); // 0 같은 오행 1 내가 생 2 내가 극 3 나를 극 4 나를 생
    if (rel === 0) return same ? TEN_GODS.bigyeon : TEN_GODS.geupjae;
    if (rel === 1) return same ? TEN_GODS.siksan : TEN_GODS.sanggwan;
    if (rel === 2) return same ? TEN_GODS.pyeonjae : TEN_GODS.jeongjae;
    if (rel === 3) return same ? TEN_GODS.pyeongwan : TEN_GODS.jeonggwan;
    return same ? TEN_GODS.pyeonin : TEN_GODS.jeongin;
  }

  function branchTenGod(dayStem, branchIdx) {
    return tenGod(dayStem, BRANCHES[branchIdx].hidden[0]);
  }

  /* ---------- 신살 ---------- */
  // 삼합국: 인오술=화, 사유축=금, 신자진=수, 해묘미=목
  var SAMHAP = [
    { group: [2, 6, 10], dohwa: 3, yeokma: 8, hwagae: 10, name: '화국' },
    { group: [5, 9, 1], dohwa: 6, yeokma: 11, hwagae: 1, name: '금국' },
    { group: [8, 0, 4], dohwa: 9, yeokma: 2, hwagae: 4, name: '수국' },
    { group: [11, 3, 7], dohwa: 0, yeokma: 5, hwagae: 7, name: '목국' }
  ];

  var HONGYEOM = { 0: 6, 1: 6, 2: 2, 3: 7, 4: 4, 5: 4, 6: 10, 7: 9, 8: 0, 9: 8 };

  var CHEONEUL = {
    0: [1, 7], 1: [0, 8], 2: [11, 9], 3: [11, 9],
    4: [1, 7], 5: [0, 8], 6: [1, 7], 7: [2, 6],
    8: [3, 5], 9: [3, 5]
  };

  function findSinsal(dayStem, branches) {
    // branches: [{idx, label}]
    var list = [];
    var base = branches.filter(function (b) { return b.label === '년지' || b.label === '일지'; });

    function hitOf(pred) {
      var out = [];
      branches.forEach(function (b) { if (pred(b.idx)) out.push(b.label); });
      return out;
    }

    ['dohwa', 'yeokma', 'hwagae'].forEach(function (key) {
      var name = { dohwa: '도화살', yeokma: '역마살', hwagae: '화개살' }[key];
      var hits = {};
      base.forEach(function (b) {
        SAMHAP.forEach(function (s) {
          if (s.group.indexOf(b.idx) >= 0) hits[s[key]] = true;
        });
      });
      var where = [];
      branches.forEach(function (b) {
        if (hits[b.idx]) where.push(b.label);
      });
      if (where.length) list.push({ key: key, name: name, where: where });
    });

    var hy = HONGYEOM[dayStem];
    var hyWhere = hitOf(function (i) { return i === hy; });
    if (hyWhere.length) list.push({ key: 'hongyeom', name: '홍염살', where: hyWhere });

    var ce = CHEONEUL[dayStem] || [];
    var ceWhere = hitOf(function (i) { return ce.indexOf(i) >= 0; });
    if (ceWhere.length) list.push({ key: 'cheoneul', name: '천을귀인', where: ceWhere });

    return list;
  }

  /* ---------- 오행 분포 ---------- */
  function elementDistribution(pillars) {
    var counts = [0, 0, 0, 0, 0];
    var letters = [];
    ['year', 'month', 'day', 'hour'].forEach(function (key) {
      var p = pillars[key];
      if (!p) return;
      counts[STEMS[p.stem].el]++;
      counts[BRANCHES[p.branch].el]++;
      letters.push({
        pos: key,
        stemEl: STEMS[p.stem].el,
        branchEl: BRANCHES[p.branch].el
      });
    });
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    var max = Math.max.apply(null, counts);
    var min = Math.min.apply(null, counts);
    var strongest = [], weakest = [], missing = [];
    counts.forEach(function (c, i) {
      if (c === max) strongest.push(i);
      if (c === min) weakest.push(i);
      if (c === 0) missing.push(i);
    });
    return {
      counts: counts,
      total: total,
      ratios: counts.map(function (c) { return total ? Math.round((c / total) * 1000) / 10 : 0; }),
      strongest: strongest,
      weakest: weakest,
      missing: missing,
      balance: max - min
    };
  }

  /* ---------- 십성 분포 ---------- */
  function sipsungDistribution(pillars) {
    var dayStem = pillars.day.stem;
    var tally = { 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
    var items = [];
    ['year', 'month', 'hour'].forEach(function (key) {
      var p = pillars[key];
      if (!p) return;
      var sg = tenGod(dayStem, p.stem);
      var bg = branchTenGod(dayStem, p.branch);
      tally[SIPSUNG_GROUP[sg]]++;
      tally[SIPSUNG_GROUP[bg]]++;
      items.push({ pos: key, kind: 'stem', god: sg });
      items.push({ pos: key, kind: 'branch', god: bg });
    });
    // 일지도 십성에 포함(사회적 관계·배우자 자리)
    var dayBranchGod = branchTenGod(dayStem, pillars.day.branch);
    tally[SIPSUNG_GROUP[dayBranchGod]]++;
    items.push({ pos: 'day', kind: 'branch', god: dayBranchGod });

    var order = ['비겁', '식상', '재성', '관성', '인성'];
    var max = 0;
    order.forEach(function (k) { if (tally[k] > max) max = tally[k]; });
    return {
      tally: tally,
      items: items,
      dayBranchGod: dayBranchGod,
      dominant: order.filter(function (k) { return tally[k] === max; }),
      empty: order.filter(function (k) { return tally[k] === 0; })
    };
  }

  /* ---------- 대운 ---------- */
  function daeun(birthAbs, yearYang, gender, jieInfo, pillars) {
    // 양년 남자·음년 여자 = 순행, 음년 남자·양년 여자 = 역행
    var forward = (yearYang && gender === 'male') || (!yearYang && gender === 'female');
    var target = forward ? jieInfo.next : jieInfo.current;
    if (!target) return null;
    var diffMin = Math.abs(wallMinutes(target.y, target.m, target.d, target.hh, target.mm) - birthAbs);
    var days = diffMin / 1440;
    var months = Math.round(days * 4); // 3일 = 1년, 1일 = 4개월
    var age = Math.floor(months / 12);
    var restMonth = months % 12;
    return {
      forward: forward,
      startAge: age,
      startMonth: restMonth,
      label: age + '세' + (restMonth ? ' ' + restMonth + '개월' : ''),
      days: Math.round(days * 10) / 10
    };
  }

  /* ---------- 세운 ---------- */
  function yearPillarOf(calendarYear) {
    var idx = mod(calendarYear - 4, 60);
    return { stem: idx % 10, branch: idx % 12, ganzhi: STEMS[idx % 10].ko + BRANCHES[idx % 12].ko, yang: STEMS[idx % 10].yang };
  }

  function saeun(dayStem, calendarYear) {
    var yp = yearPillarOf(calendarYear);
    var stemGod = tenGod(dayStem, yp.stem);
    var branchGod = branchTenGod(dayStem, yp.branch);
    return {
      year: calendarYear,
      ganzhi: yp.ganzhi,
      stem: yp.stem,
      branch: yp.branch,
      stemGod: stemGod,
      branchGod: branchGod,
      groups: [SIPSUNG_GROUP[stemGod], SIPSUNG_GROUP[branchGod]]
    };
  }

  /* ---------- 지장간 (정기·중기·여기) ---------- */
  // [정기, 중기, 여기] 순서. 통근·뿌리 판단에 쓴다.
  var HIDDEN_FULL = [
    [9], [5, 9, 7], [0, 2, 4], [1], [4, 9, 1], [2, 6, 4],
    [3, 5], [5, 3, 1], [6, 8, 4], [7], [4, 7, 3], [8, 0, 4]
  ];

  /* ---------- 지지·천간 관계 ---------- */
  function isChung(a, b) { return mod(a - b, 12) === 6; }

  var YUKHAP = [1, 0, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]; // 자축 인해 묘술 진유 사신 오미
  var PAIRS_PA = [[0, 9], [1, 4], [2, 11], [3, 6], [5, 8], [7, 10]];                 // 자유 축진 인해 묘오 사신 술미
  var PAIRS_HAE = [[0, 5], [1, 6], [2, 3], [3, 4], [8, 11], [9, 10]];                // 자미 축오 인사 묘진 신해 술유
  var PAIRS_HYEONG = [[2, 5], [5, 8], [2, 8], [1, 10], [10, 7], [1, 7], [0, 3]];     // 인사신 축술미 자묘
  var SELF_HYEONG = [4, 6, 9, 11];                                                    // 진오유해 자형

  var SAMHAP_GROUPS = [
    { name: '화국', members: [2, 6, 10], el: 1 },
    { name: '금국', members: [5, 9, 1], el: 3 },
    { name: '수국', members: [8, 0, 4], el: 4 },
    { name: '목국', members: [11, 3, 7], el: 0 }
  ];

  function inPair(list, a, b) {
    for (var i = 0; i < list.length; i++) {
      if ((list[i][0] === a && list[i][1] === b) || (list[i][0] === b && list[i][1] === a)) return true;
    }
    return false;
  }

  /** 두 지지的关系 목록. 예: ['충'], ['육합','형'] */
  function branchRelations(a, b) {
    var out = [];
    if (a === b && SELF_HYEONG.indexOf(a) >= 0) out.push('자형');
    if (a !== b) {
      if (isChung(a, b)) out.push('충');
      if (YUKHAP[a] === b) out.push('육합');
      if (inPair(PAIRS_PA, a, b)) out.push('파');
      if (inPair(PAIRS_HAE, a, b)) out.push('해');
      if (inPair(PAIRS_HYEONG, a, b)) out.push('형');
    }
    return out;
  }

  /** 같은 삼합국에 속하는지 */
  function samhapGroup(a, b) {
    for (var i = 0; i < SAMHAP_GROUPS.length; i++) {
      var m = SAMHAP_GROUPS[i].members;
      if (m.indexOf(a) >= 0 && m.indexOf(b) >= 0) return SAMHAP_GROUPS[i];
    }
    return null;
  }

  function stemRelations(a, b) {
    var out = [];
    if (mod(a - b, 10) === 5 || mod(b - a, 10) === 5) out.push('천간합');
    if (mod(a - b, 10) === 6 || mod(b - a, 10) === 6) out.push('천간충');
    return out;
  }

  /* ---------- 신강·신약 (참고 지표) ---------- */
  // 월령 장악 + 통근 + 천간 생조를 점수화한 축약식.
  // 전통 간명의 정밀 판정을 대체하지 않는다. 리포트에 기준을 함께 표기한다.
  function strength(pillars) {
    var ds = pillars.day.stem, dEl = STEMS[ds].el;
    var score = 0, marks = [];
    var mbEl = BRANCHES[pillars.month.branch].el;
    var mRel = mod(mbEl - dEl, 5);
    if (mRel === 0) { score += 3; marks.push('월지가 같은 오행'); }
    else if (mRel === 4) { score += 3; marks.push('월지가 일간을 생함'); }
    else if (mRel === 1) { score -= 1; marks.push('월지가 기운을 빼냄'); }
    else if (mRel === 2) { score -= 1; marks.push('월지가 재성 자리'); }
    else { score -= 2; marks.push('월지가 일간을 극함'); }

    var inEl = mod(dEl + 4, 5); // 인성 오행
    var roots = [];
    ['year', 'month', 'day', 'hour'].forEach(function (k) {
      var p = pillars[k];
      if (!p) return;
      var hs = HIDDEN_FULL[p.branch];
      var hasSelf = hs.some(function (s) { return STEMS[s].el === dEl; });
      var hasIn = hs.some(function (s) { return STEMS[s].el === inEl; });
      if (hasSelf || hasIn) {
        score += (k === 'day' || k === 'month') ? 2 : 1.5;
        roots.push({ pos: k, self: hasSelf, in: hasIn });
      }
    });

    ['year', 'month', 'hour'].forEach(function (k) {
      var p = pillars[k];
      if (!p) return;
      var rel = mod(STEMS[p.stem].el - dEl, 5);
      if (rel === 0 || rel === 4) score += 1;
      else if (rel === 3) score -= 1.5;
      else score -= 0.5;
    });

    score = Math.round(score * 10) / 10;
    var level = score >= 4 ? '신강' : score >= 0.5 ? '중화' : '신약';
    return {
      score: score,
      level: level,
      marks: marks,
      roots: roots,
      rootCount: roots.length,
      dayEl: dEl,
      supportEl: inEl
    };
  }

  /* ---------- 대운 흐름 ---------- */
  function cycleIndexOf(stem, branch) {
    for (var i = 0; i < 60; i++) if (i % 10 === stem && i % 12 === branch) return i;
    return -1;
  }

  /** 대운 10년 목록. 월주에서 순행/역행으로 진행한다. */
  function daeunList(res, count) {
    if (!res.daeun) return [];
    var n = count || 8;
    var dayStem = res.pillars.day.stem;
    var mi = cycleIndexOf(res.pillars.month.stem, res.pillars.month.branch);
    var birthY = res.solar.y;
    var list = [];
    for (var i = 1; i <= n; i++) {
      var idx = mod(mi + (res.daeun.forward ? i : -i), 60);
      var st = idx % 10, br = idx % 12;
      var y0 = birthY + res.daeun.startAge + (i - 1) * 10;
      list.push({
        index: i,
        age: res.daeun.startAge + (i - 1) * 10,
        ageEnd: res.daeun.startAge + (i - 1) * 10 + 9,
        year: y0,
        yearEnd: y0 + 9,
        stem: st,
        branch: br,
        ganzhi: STEMS[st].ko + BRANCHES[br].ko,
        stemHan: STEMS[st].han,
        branchHan: BRANCHES[br].han,
        stemGod: tenGod(dayStem, st),
        branchGod: branchTenGod(dayStem, br),
        stemGroup: SIPSUNG_GROUP[tenGod(dayStem, st)],
        branchGroup: SIPSUNG_GROUP[branchTenGod(dayStem, br)]
      });
    }
    return list;
  }

  /** 현재 나이에 해당하는 대운 index (list 기준 0부터) */
  function currentDaeunIndex(res, list, nowY, nowM) {
    if (!list || !list.length || !res.daeun) return 0;
    var age = (nowY || new Date().getFullYear()) - res.solar.y;
    if (nowM && nowM < res.solar.m) age -= 1;
    var idx = Math.floor((age - res.daeun.startAge) / 10);
    return Math.max(0, Math.min(list.length - 1, idx));
  }

  /* ---------- 절기월 (특정 연도의 12개월) ---------- */
  /**
   * year년 입춘부터 다음 해 입춘 전까지의 12절기월.
   * 각 항목: 인월~축월, 절입일과 다음 절입일, 간지, 십성.
   */
  function monthPillars(year, dayStem) {
    var yp = yearPillarOf(year);
    var inMonthStem = mod((yp.stem % 5) * 2 + 2, 10);
    var out = [];
    for (var j = 0; j < 12; j++) {
      var branch = mod(2 + j, 12);
      var stem = mod(inMonthStem + j, 10);
      var startYear = (j === 11) ? year + 1 : year;
      var startK = JIE_IDX[(j + 1) % 12];
      var endYear = (j === 10) ? year + 1 : startYear;
      var endK = (j === 11) ? 2 : JIE_IDX[(j + 2) % 12];
      if (j === 10) endK = 0; // 자월은 다음 해 소한에서 끝난다
      var from = termDate(startYear, startK);
      var to = termDate(endYear, endK);
      out.push({
        key: STEMS[stem].ko + BRANCHES[branch].ko,
        stem: stem,
        branch: branch,
        ganzhi: STEMS[stem].ko + BRANCHES[branch].ko,
        stemHan: STEMS[stem].han,
        branchHan: BRANCHES[branch].han,
        branchKo: BRANCHES[branch].ko,
        branchEl: BRANCHES[branch].el,
        stemEl: STEMS[stem].el,
        season: j < 3 ? '봄' : j < 6 ? '여름' : j < 9 ? '가을' : '겨울',
        from: from,
        to: to,
        startText: from ? (from.m + '.' + from.d) : '',
        endText: to ? (to.m + '.' + to.d) : '',
        stemGod: dayStem === undefined ? null : tenGod(dayStem, stem),
        branchGod: dayStem === undefined ? null : branchTenGod(dayStem, branch)
      });
    }
    return out;
  }

  /* ---------- 메인 ---------- */
  /**
   * @param {object} input
   *   year, month, day  : 입력한 달력 기준 날짜
   *   isLunar           : 음력 여부
   *   isLeap            : 음력 윤달 여부
   *   hourBranch        : 0~11 (자~해), null이면 시간 모름
   *   hour, minute      : 정확한 시각을 아는 경우 (hourBranch보다 우선)
   *   gender            : 'female' | 'male'
   */
  function compute(input) {
    var errors = [];
    var isLunar = !!input.isLunar;
    var y = +input.year, m = +input.month, d = +input.day;

    if (!(y >= MIN_YEAR && y <= MAX_YEAR)) errors.push('출생연도는 1900년부터 2050년까지만 계산할 수 있어요.');
    if (!(m >= 1 && m <= 12)) errors.push('태어난 달을 다시 확인해 주세요.');
    if (errors.length) return { ok: false, errors: errors };

    var solarJdn, solarYmd, lunarYmd;
    if (isLunar) {
      var converted = lunarToJdn(y, m, d, !!input.isLeap);
      if (converted === null) {
        errors.push(y + '년 음력 ' + m + '월에는 윤달이 없어요. 윤달 표시를 풀고 다시 시도해 주세요.');
        return { ok: false, errors: errors };
      }
      var maxDay = lunarMonthDays(y, m, !!input.isLeap);
      if (d < 1 || d > maxDay) {
        errors.push(y + '년 음력 ' + m + '월은 ' + maxDay + '일까지예요.');
        return { ok: false, errors: errors };
      }
      solarJdn = converted;
      solarYmd = ymdFromJdn(solarJdn);
      lunarYmd = { y: y, m: m, d: d, leap: !!input.isLeap };
    } else {
      if (d < 1 || d > daysInMonth(y, m)) {
        errors.push(y + '년 ' + m + '월은 ' + daysInMonth(y, m) + '일까지예요.');
        return { ok: false, errors: errors };
      }
      solarJdn = jdnFromYmd(y, m, d);
      solarYmd = { y: y, m: m, d: d };
      lunarYmd = jdnToLunar(solarJdn);
    }

    if (solarYmd.y < MIN_YEAR || solarYmd.y > MAX_YEAR) {
      errors.push('양력으로 환산하면 1900~2050년 범위를 벗어나요.');
      return { ok: false, errors: errors };
    }

    // 시각 처리
    var hourBranch = null, hour = null, minute = 0, hourKnown = false, hourNote = null;
    if (typeof input.hourBranch === 'number' && input.hourBranch >= 0 && input.hourBranch <= 11) {
      hourKnown = true;
      hourBranch = input.hourBranch;
      if (typeof input.hour === 'number' && input.hour >= 0 && input.hour <= 23) {
        hour = input.hour;
        minute = typeof input.minute === 'number' ? Math.min(59, Math.max(0, input.minute)) : 0;
        // 넘겨받은 시각과 지지가 어긋나면 시각을 신뢰
        hourBranch = Math.floor(mod(hour + 1, 24) / 2);
      } else if (hourBranch === 0) {
        hour = 0; minute = 30; // 자시(23:00~00:59)는 자정 이후로 취급
        hourNote = '자시는 23시부터 00시 59분까지예요. 23시대 출생이라면 시각을 직접 넣어 주세요.';
      } else {
        hour = hourBranch * 2;
        minute = 30;
      }
    }

    var birthAbs = wallMinutes(solarYmd.y, solarYmd.m, solarYmd.d, hour === null ? 12 : hour, minute);
    var jie = findJie(birthAbs, solarYmd.y);

    // 년주: 입춘 기준
    var ipchunAbs = termAbsMinutes(solarYmd.y, 2);
    var sajuYear = (ipchunAbs !== null && birthAbs < ipchunAbs) ? solarYmd.y - 1 : solarYmd.y;
    var yearCyc = yearPillarOf(sajuYear);

    // 월주: 절입 기준
    var monthBranch, monthName = null;
    if (jie.current) {
      monthBranch = mod((jie.index >> 1) + 1, 12);
      monthName = jie.current.name;
    } else {
      monthBranch = 1;
    }
    var inMonthStem = mod((yearCyc.stem % 5) * 2 + 2, 10);
    var monthOffset = mod(monthBranch - 2, 12);
    var monthStem = mod(inMonthStem + monthOffset, 10);

    // 일주
    var dayCycIdx = mod(solarJdn + 49, 60);
    var dayStem = dayCycIdx % 10;
    var dayBranch = dayCycIdx % 12;

    // 시주 — 자시는 야자시 기준: 일주는 그날 그대로, 23시대의 시주는 다음 날 일간으로 잡는다.
    var hourPillar = null;
    if (hourKnown) {
      var hourBaseStem = (hour !== null && hour >= 23) ? mod(dayStem + 1, 10) : dayStem;
      var hourStem = mod((hourBaseStem % 5) * 2 + hourBranch, 10);
      hourPillar = { stem: hourStem, branch: hourBranch };
    }

    var pillars = {
      year: { stem: yearCyc.stem, branch: yearCyc.branch, sajuYear: sajuYear },
      month: { stem: monthStem, branch: monthBranch },
      day: { stem: dayStem, branch: dayBranch },
      hour: hourPillar
    };

    ['year', 'month', 'day', 'hour'].forEach(function (k) {
      var p = pillars[k];
      if (!p) return;
      p.ganzhi = STEMS[p.stem].ko + BRANCHES[p.branch].ko;
      p.stemHan = STEMS[p.stem].han;
      p.branchHan = BRANCHES[p.branch].han;
      p.stemEl = STEMS[p.stem].el;
      p.branchEl = BRANCHES[p.branch].el;
      p.stemGod = k === 'day' ? '일간' : tenGod(dayStem, p.stem);
      p.branchGod = k === 'day' ? branchTenGod(dayStem, p.branch) : branchTenGod(dayStem, p.branch);
    });

    var branchList = [];
    ['year', 'month', 'day', 'hour'].forEach(function (k) {
      if (pillars[k]) branchList.push({ idx: pillars[k].branch, label: k === 'year' ? '년지' : k === 'month' ? '월지' : k === 'day' ? '일지' : '시지' });
    });

    var elements = elementDistribution(pillars);
    var sipsung = sipsungDistribution(pillars);
    var sinsal = findSinsal(dayStem, branchList);
    var gender = input.gender === 'male' ? 'male' : 'female';
    var du = daeun(birthAbs, yearCyc.yang, gender, jie, pillars);

    return {
      ok: true,
      input: {
        name: input.name || '',
        gender: gender,
        isLunar: isLunar,
        isLeap: !!input.isLeap
      },
      solar: solarYmd,
      lunar: lunarYmd,
      hour: hourKnown ? { hh: hour, mm: minute, branch: hourBranch, note: hourNote } : null,
      hourKnown: hourKnown,
      pillars: pillars,
      dayMaster: { stem: dayStem, ...STEMS[dayStem] },
      elements: elements,
      sipsung: sipsung,
      sinsal: sinsal,
      jie: jie,
      daeun: du,
      saeun: { y2026: saeun(dayStem, 2026), y2027: saeun(dayStem, 2027) }
    };
  }

  /* ---------- 노출 ---------- */
  var Engine = {
    compute: compute,
    jdnFromYmd: jdnFromYmd,
    ymdFromJdn: ymdFromJdn,
    lunarToJdn: lunarToJdn,
    jdnToLunar: jdnToLunar,
    lunarMonthDays: lunarMonthDays,
    lunarLeapMonth: lunarLeapMonth,
    tenGod: tenGod,
    branchTenGod: branchTenGod,
    termDate: termDate,
    termMinutes: termMinutes,
    findJie: findJie,
    yearPillarOf: yearPillarOf,
    saeun: saeun,
    daeunList: daeunList,
    currentDaeunIndex: currentDaeunIndex,
    monthPillars: monthPillars,
    branchRelations: branchRelations,
    stemRelations: stemRelations,
    samhapGroup: samhapGroup,
    strength: strength,
    cycleIndexOf: cycleIndexOf,
    HIDDEN_FULL: HIDDEN_FULL,
    CHEONEUL: CHEONEUL,
    HONGYEOM: HONGYEOM,
    SAMHAP: SAMHAP,
    elementDistribution: elementDistribution,
    STEMS: STEMS,
    BRANCHES: BRANCHES,
    ELEMENTS: ELEMENTS,
    ELEM_HAN: ELEM_HAN,
    TERM_NAMES: TERM_NAMES,
    ZODIAC_HOUR: ZODIAC_HOUR,
    TEN_GODS: TEN_GODS,
    SIPSUNG_GROUP: SIPSUNG_GROUP,
    MIN_YEAR: MIN_YEAR,
    MAX_YEAR: MAX_YEAR
  };

  g.SajuEngine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
