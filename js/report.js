/* ============================================================
 * 유료 상세 리포트 — 계산 결과로 본문을 만든다
 * ------------------------------------------------------------
 * 원칙
 *  · 모든 문장은 엔진이 계산한 값(십성·대운·절기월·지지 관계)에서 나온다.
 *  · 연도·나이·월을 미리 박아 넣지 않는다. 값이 없으면 문장을 만들지 않는다.
 *  · 단정은 근거가 있을 때만. 과장·겁주기 없이 담백하게.
 * ============================================================ */
(function (g) {
  'use strict';

  var Engine = g.SajuEngine;
  var C = g.SAJU_CONTENT;
  var CFG = g.SAJU_CONFIG;

  var POS = [['year', '년지'], ['month', '월지'], ['day', '일지'], ['hour', '시지']];

  /* ---------- 유틸 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function two(n) { return n < 10 ? '0' + n : '' + n; }
  function mod(n, m) { return ((n % m) + m) % m; }
  function elKo(i) { return C.ELEM_META[i].ko; }
  function elHan(i) { return C.ELEM_META[i].han; }
  function stemKo(i) { return Engine.STEMS[i].ko; }
  function brKo(i) { return Engine.BRANCHES[i].ko; }
  function brAnimal(i) { return Engine.BRANCHES[i].animal; }
  function group(god) { return Engine.SIPSUNG_GROUP[god]; }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
  function joinKo(a) { return a.join('·'); }

  /* 받침에 따라 조사를 고른다: josa('오','이','가') → '오가', part('정재','으로','로') → '로' */
  function part(word, withFinal, withoutFinal) {
    var c = String(word).charCodeAt(String(word).length - 1);
    var batchim = (c - 0xAC00) % 28 !== 0;
    return batchim ? withFinal : withoutFinal;
  }

  function josa(word, withFinal, withoutFinal) {
    return word + part(word, withFinal, withoutFinal);
  }

  function natalBranches(res) {
    var out = [];
    POS.forEach(function (p) {
      var pil = res.pillars[p[0]];
      if (pil) out.push({ pos: p[0], label: p[1], idx: pil.branch, ko: brKo(pil.branch), animal: brAnimal(pil.branch), el: Engine.BRANCHES[pil.branch].el });
    });
    return out;
  }

  function dateText(d) {
    if (!d) return '';
    return d.m + '월 ' + d.d + '일';
  }

  function strengthNote(level, grp) {
    if (level === '신강') {
      if (grp === '관성' || grp === '재성') return '기운이 넘치는 사주라 이 10년의 압박은 충분히 버틸 만해요. 다만 사람을 밀어붙이는 방식은 반발을 불러요.';
      if (grp === '식상' || grp === '비겁') return '넘치는 기운을 밖으로 빼야 편한 사주예요. 이 10년은 그게 자연스럽게 되는 구간이에요.';
      return '기운이 이미 넘치는데 채우기만 하는 구간이에요. 배우는 걸로 미루지 말고 하나를 결과로 꺼내세요.';
    }
    if (level === '신약') {
      if (grp === '관성' || grp === '재성') return '받치는 기운이 얇은 사주라 이 10년의 책임은 몸에 무리가 와요. 잠과 식사를 일정하게 두는 게 실력이에요.';
      if (grp === '식상' || grp === '비겁') return '내 기운을 더 빼는 구간이에요. 벌이기 전에 회복을 먼저 챙기세요.';
      return '모자란 기운을 채워주는 구간이라 버티기 좋아요. 배운 걸 돈이 되는 형태로 바꾸는 작업이 필요해요.';
    }
    return '균형이 잡힌 사주라 이 10년의 흐름을 있는 그대로 쓸 수 있어요. 크게 흔들리지 않는 대신, 스스로 판을 키워야 해요.';
  }

  /* ============================================================
   * 1. 모델 만들기
   * ============================================================ */
  function build(res, input, opts) {
    opts = opts || {};
    var nowY = opts.nowY || new Date().getFullYear();
    var nowM = opts.nowM || (new Date().getMonth() + 1);
    var focusYear = (opts.focusYear || (CFG && CFG.product && CFG.product.focusYear) || 2027);
    var dayStem = res.pillars.day.stem;
    var dayBranch = res.pillars.day.branch;
    var dayEl = Engine.STEMS[dayStem].el;
    var natal = natalBranches(res);
    var strength = Engine.strength(res.pillars);
    var tally = res.sipsung.tally;

    var model = {
      name: (input && input.name) || '',
      who: (input && input.name) ? input.name + '님' : '당신',
      solar: res.solar,
      lunar: res.lunar,
      gender: res.input.gender,
      hourKnown: res.hourKnown,
      hour: res.hour,
      pillars: res.pillars,
      dayMaster: res.dayMaster,
      elements: res.elements,
      sipsung: res.sipsung,
      sinsal: res.sinsal,
      strength: strength,
      focusYear: focusYear,
      builtAt: nowY + '.' + two(nowM)
    };

    model.daeun = buildDaeun(res, natal, strength, nowY, nowM);
    model.wealth = buildWealth(res, natal, strength, tally, dayEl, focusYear);
    model.love = buildLove(res, natal, tally, dayStem, dayBranch, focusYear);
    model.year = buildYear(res, natal, dayStem, focusYear);
    model.remedy = buildRemedy(res, strength, model);

    return model;
  }

  /* ---------- 01 대운 ---------- */
  function buildDaeun(res, natal, strength, nowY, nowM) {
    var count = (CFG && CFG.report && CFG.report.daeunCount) || 8;
    var list = Engine.daeunList(res, count);
    if (!list.length) return null;
    var curIdx = Engine.currentDaeunIndex(res, list, nowY, nowM);

    list.forEach(function (d) {
      d.isCurrent = false;
      d.hits = [];
      natal.forEach(function (b) {
        Engine.branchRelations(d.branch, b.idx).forEach(function (rel) {
          d.hits.push({ rel: rel, label: b.label, pos: b.pos });
        });
      });
    });
    list[curIdx].isCurrent = true;

    var cur = list[curIdx];
    var grp = cur.branchGroup;
    var text = C.DAEUN_GROUP[grp];

    /* 대운 지지가 원국과 부딪히는 지점 */
    var chung = cur.hits.filter(function (h) { return h.rel === '충'; });
    var yukhap = cur.hits.filter(function (h) { return h.rel === '육합'; });
    var hyeong = cur.hits.filter(function (h) { return h.rel === '형' || h.rel === '파' || h.rel === '해'; });

    var touch = null;
    var names = joinKo(uniq(chung.concat(yukhap, hyeong).map(function (h) { return h.label; })));
    if (chung.length) {
      touch = {
        tone: 'care',
        text: '이 대운의 지지 ' + josa(brKo(cur.branch), '이', '가') + ' ' + names + '와 충(沖)해요. ' +
          C.RELATION['충'].body[chung[0].pos] + '. 판이 한 번 바뀌는 지점이에요.'
      };
    } else if (yukhap.length) {
      touch = {
        tone: 'good',
        text: '이 대운의 지지 ' + josa(brKo(cur.branch), '이', '가') + ' ' + names + '와 붙어요(육합). ' +
          C.RELATION['육합'].body[yukhap[0].pos] + '.'
      };
    } else if (hyeong.length) {
      touch = {
        tone: 'care',
        text: '이 대운의 지지 ' + josa(brKo(cur.branch), '이', '가') + ' ' + names + '와 ' + (hyeong[0].rel === '해' ? '해(害)' : hyeong[0].rel) + ' 관계로 엮여요. ' +
          C.RELATION[hyeong[0].rel].body[hyeong[0].pos] + '.'
      };
    }

    var next = list[curIdx + 1] || null;

    return {
      list: list,
      currentIndex: curIdx,
      current: cur,
      forward: res.daeun.forward,
      startAge: res.daeun.startAge,
      startMonth: res.daeun.startMonth,
      startLabel: res.daeun.label,
      head: text.head,
      body: text.body,
      stemLine: C.DAEUN_STEM[cur.stemGod],
      work: text.work,
      money: text.money,
      love: text.love,
      touch: touch,
      strengthLine: strengthNote(strength.level, grp),
      next: next ? { ganzhi: next.ganzhi, group: next.branchGroup, year: next.year, age: next.age } : null,
      startedYear: res.solar.y + res.daeun.startAge
    };
  }

  /* ---------- 02 재물 ---------- */
  function buildWealth(res, natal, strength, tally, dayEl, focusYear) {
    var wealthEl = mod(dayEl + 2, 5);       /* 재성 오행 */
    var wealthKo = elKo(wealthEl);
    var items = res.sipsung.items.filter(function (i) { return i.god === '정재' || i.god === '편재'; });
    var rooted = natal.some(function (b) {
      return Engine.HIDDEN_FULL[b.idx].some(function (s) { return Engine.STEMS[s].el === wealthEl; });
    });

    /* 재고(財庫): 재성 오행이 들어가는 묘지. 재성이 없으면 고도 의미가 없다. */
    var GO = { 0: 7, 1: 10, 3: 1, 4: 4 };
    var goBranches = wealthEl === 2 ? [4, 10, 1, 7] : [GO[wealthEl]];
    var goHit = items.length ? natal.filter(function (b) { return goBranches.indexOf(b.idx) >= 0; }) : [];
    var goOpen = false, goOpenBy = null;
    if (goHit.length) {
      natal.forEach(function (b) {
        goHit.forEach(function (hb) {
          if (b.idx !== hb.idx && !goOpenBy && Engine.branchRelations(b.idx, hb.idx).indexOf('충') >= 0) {
            goOpen = true;
            goOpenBy = { a: b, b: hb };
          }
        });
      });
    }

    var patternKey;
    if (items.length === 0) patternKey = 'none';
    else if (tally['비겁'] >= 3) patternKey = 'leak';
    else if (items.length >= 3 && tally['비겁'] <= 1) patternKey = 'big';
    else if (tally['식상'] >= 2 && items.length >= 1) patternKey = 'producer';
    else if (tally['관성'] >= 3 && items.length <= 1) patternKey = 'office';
    else patternKey = 'steady';

    /* 돈이 트이는 해 — 앞으로 10년 */
    var years = [];
    var useSikSang = items.length === 0;
    for (var y = focusYear - 1; y <= focusYear + 8; y++) {
      var s = Engine.saeun(res.pillars.day.stem, y);
      var why = [];
      if (useSikSang) {
        if (group(s.stemGod) === '식상') why.push(s.stemGod + '이 천간에 들어와 만든 것이 돈이 돼요');
        if (group(s.branchGod) === '식상') why.push(s.branchGod + '이 지지에 앉아 손이 바빠져요');
      } else {
        if (group(s.stemGod) === '재성') why.push(s.stemGod + '이 천간에 들어와요');
        if (group(s.branchGod) === '재성') why.push(s.branchGod + '이 지지에 앉아요');
        if (goHit.length && Engine.branchRelations(s.branch, goHit[0].idx).indexOf('충') >= 0) why.push('묶여 있던 재고가 열려요');
        natal.forEach(function (b) {
          if (Engine.branchRelations(s.branch, b.idx).indexOf('육합') >= 0 && b.el === wealthEl) why.push(b.label + '와 붙어 재성이 자리를 잡아요');
        });
      }
      if (why.length) years.push({ year: y, ganzhi: s.ganzhi, why: uniq(why) });
    }
    years.sort(function (a, b) { return b.why.length - a.why.length || a.year - b.year; });
    var topYears = years.slice(0, 3).sort(function (a, b) { return a.year - b.year; });

    /* 새는 지점 */
    var leaks = [];
    if (tally['비겁'] >= 2) leaks.push('사람에게 나가는 돈 — 빌려주는 돈, 같이 쓰는 돈, 눈치 보여 내는 돈');
    if (items.length && !rooted) leaks.push('들어와도 머물지 않는 돈 — 뿌리가 없어 생활비로 바로 풀려요');
    if (items.length >= 2 && tally['식상'] === 0) leaks.push('벌이는 있는데 만들어내는 힘이 없어서, 다음 수입이 끊기면 그대로 줄어들어요');
    if (tally['인성'] >= 3 && items.length <= 1) leaks.push('준비만 하다 결실이 늦어지는 돈 — 공부와 계획에 쓴 시간이 수입으로 안 바뀌어요');
    if (!leaks.length) leaks.push('크게 새는 구멍은 없어요. 대신 굳히는 힘이 약해서 모은 돈이 생활로 조금씩 풀려요');

    var points = [];
    if (tally['식상'] >= 1 && items.length >= 1) points.push('일한 만큼 바로 들어오는 구조 — 성과가 눈에 보이는 일에서 돈이 붙어요');
    if (items.length && rooted) points.push('재성에 뿌리가 있어 흔들려도 남는 돈 — 한 번 잡은 수입이 끊기지 않아요');
    if (tally['관성'] >= 2) points.push('자리와 자격을 통해 들어오는 돈 — 직책이 오르면 수입이 같이 올라가요');
    if (items.length === 0 && tally['식상'] >= 2) points.push('만들어내는 힘이 곧 돈 — 재성이 없어도 이 힘이 수입을 만들어요');
    if (goHit.length && !goOpen) points.push('모아두는 힘 — 재고(' + brKo(goHit[0].idx) + ')가 닫혀 있어 급하게 쓰지 않고 쌓여요');
    if (goHit.length && goOpen) points.push('재고(' + brKo(goHit[0].idx) + ')가 열려 있어 한 번에 목돈이 들어오는 자리가 있어요');
    if (!points.length) points.push('한 우물을 오래 파는 방식 — 잔돈을 좇기보다 하나를 깊게 가는 쪽이 남아요');

    return {
      wealthEl: wealthEl,
      wealthKo: wealthKo,
      wealthHan: elHan(wealthEl),
      count: items.length,
      positions: items.map(function (i) { return { pos: i.pos, kind: i.kind, god: i.god, label: C.POSITION[i.pos] }; }),
      rooted: rooted,
      goHit: goHit,
      goOpen: goOpen,
      goOpenBy: goOpenBy,
      pattern: C.WEALTH[patternKey],
      patternKey: patternKey,
      tally: tally,
      points: points,
      leaks: leaks,
      years: topYears,
      allYears: years,
      strengthLine: strength.level === '신강'
        ? '기운이 강한 사주라 돈을 쥐는 힘은 있어요. 문제는 쥔 돈을 놓을 때를 아는 것 — 쓸 곳에 확실히 쓰는 연습이 필요해요.'
        : strength.level === '신약'
          ? '기운이 얇은 사주라 큰돈을 한 번에 밀어붙이면 몸이 먼저 상해요. 작게 여러 번 들어오는 구조가 맞아요.'
          : '균형이 잡힌 사주라 버는 힘과 모으는 힘이 비슷해요. 어느 한쪽으로 치우치지 않는 게 장점이에요.'
    };
  }

  /* ---------- 03 인연 ---------- */
  function buildLove(res, natal, tally, dayStem, dayBranch, focusYear) {
    var female = res.input.gender !== 'male';
    var spouseGods = female ? ['정관', '편관'] : ['정재', '편재'];
    var items = res.sipsung.items.filter(function (i) { return spouseGods.indexOf(i.god) >= 0; });
    var spouseName = female ? '관성' : '재성';

    var spouseText;
    if (items.length === 0) spouseText = C.LOVE.spouseNone;
    else if (items.length === 1) spouseText = C.LOVE.spouseOne + ' 이번 사주에서는 ' + C.POSITION[items[0].pos] + '에 앉아 있어요.';
    else spouseText = C.LOVE.spouseMany;

    /* 일지와 나머지 지지의 관계 */
    var dayHits = [];
    natal.forEach(function (b) {
      if (b.pos === 'day') return;
      Engine.branchRelations(dayBranch, b.idx).forEach(function (rel) {
        dayHits.push({ rel: rel, label: b.label, pos: b.pos });
      });
    });

    /* 잘 맞는 인연 — 일지와 육합·삼합 */
    var goodBranches = [];
    for (var i = 0; i < 12; i++) {
      if (i === dayBranch) continue;
      var rels = Engine.branchRelations(i, dayBranch);
      if (rels.indexOf('육합') >= 0) goodBranches.unshift({ idx: i, how: '육합', why: '말이 통하고 텀이 편한 사람' });
      else if (Engine.samhapGroup(i, dayBranch)) goodBranches.push({ idx: i, how: '삼합', why: '같이 있으면 일이 커지는 사람' });
    }

    /* 잘 맞는 상대 일간 — 나에게 정관/정재·정인으로 오는 천간 */
    var goodGods = female ? ['정관', '정인'] : ['정재', '정인'];
    var goodStems = [];
    for (var s = 0; s < 10; s++) {
      if (Engine.tenGod(dayStem, s) === goodGods[0] || Engine.tenGod(dayStem, s) === goodGods[1]) {
        goodStems.push({ idx: s, god: Engine.tenGod(dayStem, s) });
      }
    }

    /* 피해야 할 인연 — 일지와 충, 그리고 나를 누르거나 말로 상하게 하는 천간 */
    var badBranch = null;
    for (var j = 0; j < 12; j++) {
      if (Engine.branchRelations(j, dayBranch).indexOf('충') >= 0) badBranch = j;
    }
    var badGods = female ? ['상관', '편관'] : ['겁재', '편관'];
    var badStems = [];
    for (var k = 0; k < 10; k++) {
      if (badGods.indexOf(Engine.tenGod(dayStem, k)) >= 0) badStems.push({ idx: k, god: Engine.tenGod(dayStem, k) });
    }

    /* 귀인 */
    var ce = res.sinsal.filter(function (x) { return x.key === 'cheoneul'; })[0];
    var nobleYears = [];
    var ceBranches = Engine.CHEONEUL[dayStem] || [];
    for (var y = focusYear - 1; y <= focusYear + 8; y++) {
      var sy = Engine.saeun(dayStem, y);
      if (ceBranches.indexOf(sy.branch) >= 0) nobleYears.push(y);
    }

    /* 2027년 안에서 인연이 붙는 달 */
    var months2027 = Engine.monthPillars(focusYear, dayStem);
    var loveMonths = months2027.filter(function (m) {
      if (m.branch === dayBranch) return false;
      var r = Engine.branchRelations(m.branch, dayBranch);
      return r.indexOf('육합') >= 0 || !!Engine.samhapGroup(m.branch, dayBranch);
    }).map(function (m) { return { month: m.from ? m.from.m : 0, ganzhi: m.ganzhi, branch: m.branch }; });

    return {
      spouseName: spouseName,
      spouseCount: items.length,
      spouseText: spouseText,
      spousePositions: items.map(function (it) { return C.POSITION[it.pos] + ' ' + it.god; }),
      dayBranch: dayBranch,
      dayHits: dayHits,
      goodBranches: goodBranches.slice(0, 3),
      goodStems: goodStems,
      badBranch: badBranch,
      badStems: badStems,
      noble: ce ? ce.where : null,
      nobleYears: nobleYears,
      nobleAll: ceBranches,
      loveMonths: loveMonths,
      female: female
    };
  }

  /* ---------- 04 2027 ---------- */
  function buildYear(res, natal, dayStem, year) {
    var sae = Engine.saeun(dayStem, year);
    var months = Engine.monthPillars(year, dayStem);

    var list = months.map(function (m) {
      var hits = [];
      natal.forEach(function (b) {
        Engine.branchRelations(m.branch, b.idx).forEach(function (rel) {
          hits.push({ rel: rel, label: b.label, pos: b.pos });
        });
      });

      var grp = group(m.branchGod);
      var stemGrp = group(m.stemGod);
      var care = hits.filter(function (h) { return h.rel === '충' || h.rel === '형' || h.rel === '파' || h.rel === '해'; });
      var chung = hits.filter(function (h) { return h.rel === '충'; });
      var good = hits.filter(function (h) { return h.rel === '육합'; });

      var startText = m.from
        ? (m.from.y === year ? (m.from.m + '.' + m.from.d) : ("'" + String(m.from.y).slice(2) + '.' + m.from.m + '.' + m.from.d))
        : '';
      var endText = m.to
        ? (m.to.y === year ? (m.to.m + '.' + m.to.d) : ("'" + String(m.to.y).slice(2) + '.' + m.to.m + '.' + m.to.d))
        : '';

      return {
        key: m.key,
        stem: m.stem,
        branch: m.branch,
        ganzhi: m.ganzhi,
        stemGod: m.stemGod,
        branchGod: m.branchGod,
        stemGrp: stemGrp,
        branchGrp: grp,
        season: m.season,
        monthNo: m.from ? m.from.m : null,
        from: m.from,
        to: m.to,
        startText: startText,
        endText: endText,
        tag: C.MONTH_GROUP[grp].tag,
        headline: (C.MONTH_GOD[m.branchGod] || C.MONTH_GROUP[grp]).head,
        body: C.MONTH_GROUP[grp].body,
        godLine: C.MONTH_GOD[m.branchGod] ? C.MONTH_GOD[m.branchGod].line : null,
        stemLine: stemGrp !== grp ? ('겉으로는 ' + stemLabel(m.stemGod) + ' 쪽이 먼저 드러나요.') : null,
        primaryCare: care[0] || null,
        careSentence: care.length ? C.RELATION[care[0].rel].body[care[0].pos] : null,
        goodSentence: (!care.length && good.length) ? C.RELATION['육합'].body[good[0].pos] : null,
        relTags: uniq(hits.map(function (h) { return h.label + ' ' + h.rel; })),
        hits: hits,
        care: care,
        chung: chung,
        good: good,
        isMoney: grp === '재성' || stemGrp === '재성',
        hasChung: chung.length > 0,
        score: (grp === '재성' ? 3 : grp === '관성' ? 1 : grp === '식상' ? 2 : grp === '인성' ? 1 : 0) +
          (chung.some(function (h) { return h.pos === 'day'; }) ? -4 : 0) +
          (chung.length ? -2 : 0) + (good.length ? 1 : 0) +
          (stemGrp === '재성' ? 1 : 0)
      };
    });

    /* 분기 — 삼합 계절로 묶는다 */
    var quarters = [
      { name: '봄', sub: '인·묘·진월', months: list.slice(0, 3) },
      { name: '여름', sub: '사·오·미월', months: list.slice(3, 6) },
      { name: '가을', sub: '신·유·술월', months: list.slice(6, 9) },
      { name: '겨울', sub: '해·자·축월', months: list.slice(9, 12) }
    ];
    quarters.forEach(function (q) {
      var money = q.months.filter(function (m) { return m.isMoney; });
      var safeMoney = money.filter(function (m) { return !m.hasChung; });
      var chungMonths = q.months.filter(function (m) { return m.hasChung; });
      var bits = [];
      bits.push('중심은 ' + C.MONTH_GROUP[q.months[1].branchGrp].tag + ' 쪽이에요');
      if (money.length) {
        bits.push('돈이 움직이는 달은 ' + money.map(function (m) { return m.monthNo + '월'; }).join('·'));
        if (safeMoney.length && safeMoney.length !== money.length) {
          bits.push('그중 ' + safeMoney.map(function (m) { return m.monthNo + '월'; }).join('·') + '은 부딪힘이 없어 결과가 남아요');
        } else if (!safeMoney.length) {
          bits.push('다만 그 달은 원국과 부딪혀 들어온 돈이 그대로 나가기 쉬워요');
        }
      }
      if (chungMonths.length) bits.push('부딪히는 달은 ' + chungMonths.map(function (m) { return m.monthNo + '월'; }).join('·'));
      if (!money.length && !chungMonths.length) bits.push('큰 돈이 오가거나 부딪히는 달은 없어 흐름이 고른 편이에요');
      q.line = bits.join('. ') + '.';
      q.range = (q.months[0].from ? dateText(q.months[0].from) : '') + ' ~ ' + (q.months[2].to ? dateText(q.months[2].to) : '');
      if (q.months[2].to && q.months[0].from && q.months[2].to.y !== q.months[0].from.y) {
        q.range = dateText(q.months[0].from) + ' ~ ' + q.months[2].to.y + '년 ' + dateText(q.months[2].to);
      }
    });

    var ranked = list.slice().sort(function (a, b) { return b.score - a.score; });
    var moneyMonths = ranked.filter(function (m) { return m.isMoney && !m.hasChung; }).slice(0, 3);
    var careMonths = list.filter(function (m) {
      return m.chung.some(function (h) { return h.pos === 'day'; });
    });
    if (!careMonths.length) careMonths = list.filter(function (m) { return m.hasChung; }).slice(0, 2);

    return {
      year: year,
      ganzhi: sae.ganzhi,
      stemGod: sae.stemGod,
      branchGod: sae.branchGod,
      season: sae.season,
      head: C.SAEUN_TEXT[sae.stemGod].head,
      body: C.SAEUN_TEXT[sae.stemGod].body,
      care: C.SAEUN_TEXT[sae.stemGod].care,
      moneyLine: C.SAEUN_TEXT[sae.stemGod].money,
      months: list,
      quarters: quarters,
      moneyMonths: moneyMonths,
      careMonths: careMonths
    };
  }

  function badEffect(stems) {
    var has = {};
    stems.forEach(function (s) { has[s.god] = true; });
    var out = [];
    if (has['상관']) out.push('말로 관계를 좁혀요');
    if (has['편관']) out.push('관계를 통제하려 들어요');
    if (has['겁재']) out.push('내 몫을 나눠 가지려 해요');
    if (!out.length) out.push('관계의 속도를 내 쪽으로 당겨요');
    return out.join('. ') + '.';
  }

  function stemLabel(god) {
    var m = {
      '비견': '내 일, 내 몫',
      '겁재': '경쟁과 사람',
      '식신': '먹고 즐기는 일',
      '상관': '말과 표현',
      '편재': '큰돈',
      '정재': '실속과 생활비',
      '편관': '압박과 책임',
      '정관': '자리와 계약',
      '편인': '혼자 하는 공부',
      '정인': '도움과 보호'
    };
    return m[god] || god;
  }

  /* ---------- 05 개운 ---------- */
  function buildRemedy(res, strength, model) {
    var e = res.elements;
    var weak = e.missing.length ? e.missing.slice() : e.weakest.slice();
    var pick = weak.slice(0, 2);
    var strong = e.strongest.slice();

    var cards = pick.map(function (idx) {
      var r = C.ELEM_REMEDY[idx];
      return {
        idx: idx,
        ko: r.ko,
        han: r.han,
        colorName: r.colorName,
        swatch: r.swatch,
        items: r.items,
        place: r.place,
        line: r.line,
        habit: C.REMEDY_HABIT[idx]
      };
    });

    var reduce = null;
    if (strength.level === '신강') {
      var strongEl = strong[0];
      reduce = {
        ko: elKo(strongEl),
        text: elKo(strongEl) + ' 기운이 넘치는 사주예요. 부족한 걸 채우는 것보다 넘치는 걸 덜어내는 쪽이 먼저예요. ' +
          elKo(strongEl) + ' 계열 색과 소재를 줄이고, 소모를 견디는 대신 결과를 남기는 일에 힘을 쓰세요.'
      };
    } else if (strength.level === '신약') {
      reduce = {
        ko: elKo(strength.supportEl),
        text: '기운이 얇은 사주라 많이 벌이는 방식이 오래 못 가요. 일정을 절반으로 줄이고, 잠과 식사를 시간표에 넣는 게 실질적인 개운이에요.'
      };
    } else {
      reduce = {
        ko: elKo(strong[0]),
        text: '균형이 잡혀 있어 특별히 덜어낼 것은 없어요. 다만 ' + elKo(strong[0]) + ' 쪽으로 기울면 판단이 빨라지면서 말이 세지니, 그때만 한 박자 늦추세요.'
      };
    }

    var fit = null;
    if (model && model.daeun && model.daeun.current) {
      var grp = model.daeun.current.branchGroup;
      var fitMap = {
        '비겁': '이 10년은 내 이름으로 서는 구간이에요. 개운 아이템도 남에게 보여주는 것보다 내가 매일 쓰는 물건이 나아요.',
        '식상': '이 10년은 밖으로 꺼내는 구간이에요. 만들고 보여주는 일에 색을 입히면 훨씬 빨리 자리를 잡아요.',
        '재성': '이 10년은 돈이 붙는 구간이에요. 지갑·가방처럼 돈이 드나드는 물건을 새것으로 바꾸는 게 실제로 도움이 돼요.',
        '관성': '이 10년은 자리가 정해지는 구간이에요. 옷차림과 서류처럼 형식이 보이는 것부터 정리하세요.',
        '인성': '이 10년은 채우는 구간이에요. 책과 공부 자리에 투자하는 색이 맞아요.'
      };
      fit = fitMap[grp] || null;
    }

    return { cards: cards, reduce: reduce, fit: fit, missing: e.missing, weak: e.weakest };
  }

  /* ============================================================
   * 2. 렌더링
   * ============================================================ */
  function render(model) {
    var m = model;
    var p = m.pillars;
    var st = m.dayMaster;
    var stemP = C.STEM_PROFILES[p.day.stem];
    var nameLine = m.name ? esc(m.name) : '이름 없이';
    var chars = m.hourKnown ? 8 : 6;

    var html = '';

    /* ---------- 표지 ---------- */
    html += '<section class="rp-cover">' +
      '<p class="rp-cover__eyebrow">상세 리포트 · ' + m.builtAt + ' 기준</p>' +
      '<h1 class="rp-cover__name">' + nameLine + '<span>님의 여덟 글자</span></h1>' +
      '<div class="rp-cover__chars">' + pillarRow(p) + '</div>' +
      '<p class="rp-cover__meta">' +
      '양력 ' + m.solar.y + '. ' + m.solar.m + '. ' + m.solar.d + ' · 음력 ' + (m.lunar.leap ? '윤' : '') + m.lunar.m + '월 ' + m.lunar.d + '일' +
      (m.hourKnown ? ' · ' + two(m.hour.hh) + ':' + two(m.hour.mm) : ' · 시간 모름') +
      ' · ' + (m.gender === 'female' ? '여' : '남') +
      '</p>' +
      '<p class="rp-cover__lead">' + esc(stemP.tagline) + '. ' + (m.hourKnown ? '여덟' : '여섯') + ' 글자로 보면 ' +
      esc(m.sipsung.dominant.join('·')) + part(m.sipsung.dominant[0], '이', '가') + ' 중심이고, ' +
      elKo(m.elements.missing.length ? m.elements.missing[0] : m.elements.weakest[0]) +
      (m.elements.missing.length ? ' 기운이 비어 있어요.' : ' 기운이 가장 약해요.') + '</p>' +
      '<div class="rp-cover__tags">' +
      '<span>' + p.day.ganzhi + '일주</span>' +
      '<span>' + elHan(st.el) + ' ' + elKo(st.el) + ' 일간</span>' +
      '<span>' + esc(m.strength.level) + '</span>' +
      '<span>대운 ' + (m.daeun ? (m.daeun.forward ? '순행' : '역행') + ' ' + m.daeun.startLabel + ' 시작' : '계산 불가') + '</span>' +
      '</div>' +
      '</section>';

    html += '<section class="rp-sec">' + secHead('00', '한 장 요약', '이 사주를 한 문단으로') + summaryBlock(m) + '</section>';

    /* ---------- 01 대운 ---------- */
    html += '<section class="rp-sec">' + secHead('01', '10년 대운의 흐름', '지금이 어느 구간인지') + daeunBlock(m) + '</section>';

    /* ---------- 02 재물 ---------- */
    html += '<section class="rp-sec">' + secHead('02', '평생 재물운의 구조', '돈이 모이는 곳과 새는 곳') + wealthBlock(m) + '</section>';

    /* ---------- 03 인연 ---------- */
    html += '<section class="rp-sec">' + secHead('03', '연애와 인연', '들어오는 사람, 피할 사람') + loveBlock(m) + '</section>';

    /* ---------- 04 2027 ---------- */
    html += '<section class="rp-sec">' + secHead('04', m.focusYear + ' ' + m.year.ganzhi + '년 월별 흐름', '열두 달의 변수') + yearBlock(m) + '</section>';

    /* ---------- 05 개운 ---------- */
    html += '<section class="rp-sec">' + secHead('05', '개운 전략', '색·물건·습관으로 채우기') + remedyBlock(m) + '</section>';

    /* ---------- 기준 ---------- */
    html += '<section class="rp-sec rp-sec--note">' + secHead('', '계산 기준', '숫자가 어디서 나왔는지') + basisBlock(m) + '</section>';

    return html;
  }

  function secHead(no, title, sub) {
    return '<div class="rp-sec__head">' +
      (no ? '<span class="rp-sec__no">' + no + '</span>' : '<span class="rp-sec__no rp-sec__no--dash">—</span>') +
      '<div><h2 class="rp-sec__title">' + esc(title) + '</h2><p class="rp-sec__sub">' + esc(sub) + '</p></div>' +
      '</div>';
  }

  function pillarRow(p) {
    var order = [['year', '년'], ['month', '월'], ['day', '일'], ['hour', '시']];
    var cells = order.map(function (o) {
      var pil = p[o[0]];
      if (!pil) {
        return '<div class="rp-pc rp-pc--empty"><span class="rp-pc__god">' + o[1] + '</span>' +
          '<span class="rp-pc__han">·</span><span class="rp-pc__han rp-pc__han--sub">·</span></div>';
      }
      var sMeta = C.ELEM_META[pil.stemEl];
      var bMeta = C.ELEM_META[pil.branchEl];
      return '<div class="rp-pc' + (o[0] === 'day' ? ' rp-pc--day' : '') + '">' +
        '<span class="rp-pc__god">' + (o[0] === 'day' ? '일간' : esc(pil.stemGod)) + '</span>' +
        '<span class="rp-pc__han" style="color:' + sMeta.color + '">' + pil.stemHan + '</span>' +
        '<span class="rp-pc__god">' + (o[0] === 'day' ? '일지' : esc(pil.branchGod)) + '</span>' +
        '<span class="rp-pc__han rp-pc__han--sub" style="color:' + bMeta.color + '">' + pil.branchHan + '</span>' +
        '</div>';
    }).join('');
    return cells;
  }

  /* ---------- 00 요약 ---------- */
  function summaryBlock(m) {
    var p = m.pillars;
    var st = m.dayMaster;
    var stemP = C.STEM_PROFILES[p.day.stem];
    var el = m.elements;
    var strongKo = el.strongest.map(elKo).join('·');
    var weakKo = (el.missing.length ? el.missing : el.weakest).map(elKo).join('·');

    return '<div class="rp-card">' +
      '<p class="rp-lead">일간은 ' + st.han + '(' + st.ko + '), ' + esc(stemP.image) + '이에요. ' + esc(stemP.personality[0]) + '</p>' +
      '<div class="rp-kv">' +
      kv('중심 십성', m.sipsung.dominant.join('·'), (m.hourKnown ? '여덟' : '여섯') + ' 글자에서 가장 많은 기운') +
      kv('강한 오행', strongKo, '이미 넘치는 쪽') +
      kv(el.missing.length ? '빈 오행' : '약한 오행', weakKo, '생활에서 채워야 하는 쪽') +
      kv('신강·신약', m.strength.level + ' (' + m.strength.score + ')', '월령·통근을 점수화한 참고 지표') +
      '</div>' +
      '<p class="rp-note">' + esc(m.strength.marks.join(' · ')) + '.</p>' +
      '</div>';
  }

  function kv(k, v, note) {
    return '<div class="rp-kv__row"><span class="rp-kv__k">' + esc(k) + '</span>' +
      '<span class="rp-kv__v">' + esc(v) + '</span>' +
      (note ? '<span class="rp-kv__n">' + esc(note) + '</span>' : '') + '</div>';
  }

  /* ---------- 01 대운 ---------- */
  function daeunBlock(m) {
    var d = m.daeun;
    if (!d) return '<p class="rp-p">대운을 계산할 수 없는 생년월일이에요.</p>';
    var cur = d.current;

    var rows = d.list.map(function (x) {
      return '<li class="rp-du' + (x.isCurrent ? ' is-now' : '') + (x.year > m.builtAt ? '' : '') + '">' +
        '<span class="rp-du__age">' + x.age + '–' + x.ageEnd + '세</span>' +
        '<span class="rp-du__year">' + x.year + '–' + x.yearEnd + '</span>' +
        '<span class="rp-du__gz">' + x.ganzhi + '</span>' +
        '<span class="rp-du__god">' + esc(x.stemGod) + ' / ' + esc(x.branchGod) + '</span>' +
        (x.isCurrent ? '<span class="rp-du__now">지금</span>' : '') +
        '</li>';
    }).join('');

    var h = '<div class="rp-card">' +
      '<div class="rp-card__head"><h3>10년 단위 흐름표</h3><span>' + (d.forward ? '순행' : '역행') + ' · ' + d.startLabel + ' 시작</span></div>' +
      '<ul class="rp-du__list">' +
      '<li class="rp-du rp-du--head"><span class="rp-du__age">나이</span><span class="rp-du__year">연도</span><span class="rp-du__gz">간지</span><span class="rp-du__god">천간/지지</span></li>' +
      rows + '</ul>' +
      '<p class="rp-note">3일을 1년으로 환산한 표준 대운수 기준이에요. 나이는 만 나이 기준이에요.</p>' +
      '</div>';

    h += '<div class="rp-card rp-card--accent">' +
      '<p class="rp-card__kicker">지금 이 대운 · ' + cur.ganzhi + ' · ' + cur.age + '–' + cur.ageEnd + '세</p>' +
      '<h3 class="rp-card__title">' + esc(d.head) + '</h3>' +
      '<p class="rp-p">' + esc(d.body) + '</p>' +
      '<p class="rp-p rp-p--dim">' + esc(d.stemLine) + '</p>' +
      '<div class="rp-grid3">' +
      miniBlock('일', d.work) +
      miniBlock('돈', d.money) +
      miniBlock('관계', d.love) +
      '</div>' +
      (d.touch ? '<div class="rp-touch rp-touch--' + d.touch.tone + '">' + esc(d.touch.text) + '</div>' : '') +
      '<p class="rp-p rp-p--dim">' + esc(d.strengthLine) + '</p>' +
      (d.next ? '<p class="rp-note">다음 대운은 ' + d.next.year + '년부터 ' + d.next.ganzhi + ' · ' + esc(d.next.group) + ' 흐름이에요.</p>' : '') +
      '</div>';

    return h;
  }

  function miniBlock(label, text) {
    return '<div class="rp-mini"><span class="rp-mini__label">' + esc(label) + '</span><p>' + esc(text) + '</p></div>';
  }

  /* ---------- 02 재물 ---------- */
  function wealthBlock(m) {
    var w = m.wealth;
    var posText = w.positions.length
      ? w.positions.map(function (x) { return x.label + '(' + x.god + ')'; }).join(' · ')
      : '없음';

    var h = '<div class="rp-card">' +
      '<p class="rp-card__kicker">재성 ' + w.count + '개 · ' + w.wealthKo + '(' + w.wealthHan + ') 기운</p>' +
      '<h3 class="rp-card__title">' + esc(w.pattern.title) + '</h3>' +
      '<p class="rp-p">' + esc(w.pattern.body) + '</p>' +
      '<div class="rp-kv">' +
      kv('재성 자리', posText,
        w.count === 0 ? '원국에 없어 결과로 따라와요' : (w.rooted ? '지지에 뿌리가 있음' : '지지에 뿌리가 없음')) +
      (w.count === 0
        ? kv('식상(대신 버는 힘)', w.tally['식상'] + '개', w.tally['식상'] ? '만든 것이 곧 수입이 되는 구조' : '만들어내는 힘이 얇아 사람을 통해 들어와요')
        : kv('재고', w.goHit.length ? (w.goOpen ? '열려 있음' : '닫혀 있음') : '원국에 없음',
          w.goHit.length ? brKo(w.goHit[0].idx) + ' 자리' : '묶어두는 창고가 없어 흘러나감')) +
      kv('식상(재성의 엔진)', w.tally['식상'] + '개', w.tally['식상'] ? '일한 것이 돈이 되는 구조' : '만들어내는 힘이 얇음') +
      kv('비겁(새는 길)', w.tally['비겁'] + '개', w.tally['비겁'] >= 2 ? '사람에게 나가는 돈이 있음' : '사람 쪽 지출은 적은 편') +
      '</div>' +
      '</div>';

    h += '<div class="rp-two">' +
      '<div class="rp-box rp-box--good"><span class="rp-box__label">돈이 모이는 지점</span><ul class="rp-list">' +
      w.points.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="rp-box rp-box--care"><span class="rp-box__label">돈이 새는 지점</span><ul class="rp-list">' +
      w.leaks.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '</div>';

    h += '<div class="rp-card">' +
      '<div class="rp-card__head"><h3>돈이 트이는 해</h3><span>앞으로 10년</span></div>' +
      (w.years.length
        ? '<ul class="rp-years">' + w.years.map(function (y) {
          return '<li><b>' + y.year + '</b><span class="rp-years__gz">' + y.ganzhi + '년</span>' +
            '<span class="rp-years__why">' + esc(y.why.join('. ')) + '.</span></li>';
        }).join('') + '</ul>'
        : '<p class="rp-p">앞으로 10년 안에 재성이 직접 들어오는 해는 없어요. 이 사주의 돈은 해운보다 대운에서 바뀌는 쪽이에요.</p>') +
      '<p class="rp-p rp-p--dim">' + esc(w.strengthLine) + '</p>' +
      '</div>';

    return h;
  }

  /* ---------- 03 인연 ---------- */
  function loveBlock(m) {
    var l = m.love;
    var dayKo = brKo(l.dayBranch);
    var dayAnimal = brAnimal(l.dayBranch);

    var h = '<div class="rp-card">' +
      '<p class="rp-card__kicker">일지 ' + dayKo + '(' + dayAnimal + ') · 배우자 자리</p>' +
      '<h3 class="rp-card__title">인연이 들어오는 통로</h3>' +
      '<p class="rp-p">' + esc(l.spouseText) + '</p>' +
      (l.spousePositions.length ? '<p class="rp-note">배우자성 위치 · ' + esc(l.spousePositions.join(' · ')) + '</p>' : '') +
      (l.dayHits.length
        ? '<ul class="rp-list rp-list--tight">' + l.dayHits.map(function (h2) {
          return '<li><b>' + h2.label + ' ' + h2.rel + '</b> — ' + esc(C.RELATION[h2.rel].body[h2.pos]) + '</li>';
        }).join('') + '</ul>'
        : '<p class="rp-p rp-p--dim">일지가 다른 지지와 부딪히지 않아요. 관계에서 큰 흔들림 없이 오래 가는 쪽이에요.</p>') +
      '</div>';

    /* 귀인 */
    var noble = '';
    if (l.noble) {
      noble = '<p class="rp-p">천을귀인이 ' + esc(l.noble.join('·')) + '에 앉아 있어요. 막힐 때 도와주는 사람이 ' +
        (l.noble.indexOf('년지') >= 0 ? '가족·윗사람 쪽' : l.noble.indexOf('월지') >= 0 ? '직장·동료 쪽' : '가까운 사람 쪽') +
        '에서 나와요.</p>';
    } else if (l.nobleYears.length) {
      noble = '<p class="rp-p">천을귀인이 원국에는 없어요. 대신 귀인이 들어오는 해가 있어요 — ' +
        l.nobleYears.slice(0, 3).join('·') + '년. 이 해에 만난 사람은 오래 가요.</p>';
    } else {
      noble = '<p class="rp-p">천을귀인이 원국에는 없어요. 앞으로 10년 안에 귀인이 뚜렷하게 들어오는 해도 보이지 않아요.</p>';
    }

    h += '<div class="rp-two">' +
      '<div class="rp-box rp-box--good"><span class="rp-box__label">' + esc(C.LOVE.goodTitle) + '</span>' +
      '<ul class="rp-list rp-list--tight">' +
      l.goodBranches.map(function (b) {
        var tail = b.how === '육합' ? '육합' : '삼합';
        return '<li><b>' + brKo(b.idx) + '(' + brAnimal(b.idx) + ') 일지</b> — ' + esc(b.why) + ' <em>(' + tail + ')</em></li>';
      }).join('') +
      l.goodStems.map(function (s) {
        return '<li><b>' + stemKo(s.idx) + '</b> 일간 — ' + esc(josa(s.god, '으로', '로')) + ' 오는 사람, 나를 편하게 두는 쪽</li>';
      }).join('') +
      '</ul></div>' +
      '<div class="rp-box rp-box--care"><span class="rp-box__label">' + esc(C.LOVE.badTitle) + '</span>' +
      '<ul class="rp-list rp-list--tight">' +
      (l.badBranch !== null
        ? '<li><b>' + brKo(l.badBranch) + '(' + brAnimal(l.badBranch) + ') 일지</b> — 일지 ' + josa(dayKo, '과', '와') + ' 정면으로 충해요. 시작은 빠른데 같은 자리에서 계속 부딪혀요</li>'
        : '') +
      l.badStems.map(function (s) {
        return '<li><b>' + stemKo(s.idx) + '</b> 일간 — ' + esc(josa(s.god, '으로', '로')) + ' 오는 사람. ' +
          (s.god === '상관' ? '말이 세고 내 얘기를 자주 끊어요' : s.god === '편관' ? '압박과 통제로 관계를 좁혀요' : '내 것을 나눠 가지려는 쪽이에요') + '</li>';
      }).join('') +
      '</ul></div>' +
      '</div>';

    h += '<div class="rp-card">' + noble +
      (l.loveMonths.length
        ? '<p class="rp-p rp-p--dim">' + m.focusYear + '년에는 ' + l.loveMonths.map(function (x) { return x.month + '월'; }).join('·') +
        '에 일지와 붙는 달이 있어요. 인연이 움직이는 시기예요.</p>'
        : '') +
      '<p class="rp-note">상대의 일지·일간은 그 사람의 생년월일시로 확인하는 값이에요. 여기 적은 조합은 당신의 일지와 맞물리는 방식만 본 것이에요.</p>' +
      '</div>';

    return h;
  }

  /* ---------- 04 2027 ---------- */
  function yearBlock(m) {
    var y = m.year;
    var h = '<div class="rp-card rp-card--accent">' +
      '<p class="rp-card__kicker">' + y.year + '년 · ' + y.ganzhi + '년 · ' + esc(y.stemGod) + '/' + esc(y.branchGod) + '</p>' +
      '<h3 class="rp-card__title">' + esc(y.head) + '</h3>' +
      '<p class="rp-p">' + esc(y.body) + '</p>' +
      '<div class="rp-two rp-two--tight">' +
      '<div class="rp-mini"><span class="rp-mini__label">인간관계</span><p>' + esc(y.care) + '</p></div>' +
      '<div class="rp-mini"><span class="rp-mini__label">금전</span><p>' + esc(y.moneyLine) + '</p></div>' +
      '</div></div>';

    h += '<div class="rp-card">' +
      '<div class="rp-card__head"><h3>분기로 보는 큰 흐름</h3><span>절기 기준</span></div>' +
      '<ul class="rp-quarters">' + y.quarters.map(function (q) {
        return '<li><div class="rp-q__name">' + q.name + '</div>' +
          '<div class="rp-q__body"><span class="rp-q__range">' + esc(q.sub) + ' · ' + esc(q.range) + '</span>' +
          '<p>' + esc(q.line) + '</p></div></li>';
      }).join('') + '</ul></div>';

    h += '<div class="rp-card">' +
      '<div class="rp-card__head"><h3>열두 달</h3><span>절기월 기준</span></div>' +
      '<p class="rp-note rp-note--top">절기 기준이라 달력 월과 3~5일 차이가 나요. 각 달 옆에 시작일을 적었어요.</p>' +
      '<ul class="rp-months">' + y.months.map(function (mo) {
        return '<li class="rp-month' + (mo.hasChung ? ' is-care' : '') + '">' +
          '<div class="rp-month__date"><b>' + mo.monthNo + '월</b><span>' + esc(mo.startText) + '</span></div>' +
          '<div class="rp-month__body">' +
          '<div class="rp-month__top"><span class="rp-month__gz">' + mo.ganzhi + '</span>' +
          '<span class="rp-month__god">' + esc(mo.stemGod) + '/' + esc(mo.branchGod) + '</span>' +
          '<span class="rp-month__tag">' + esc(mo.tag) + '</span></div>' +
          '<p class="rp-month__head">' + esc(mo.headline) + '</p>' +
          '<p class="rp-month__line">' + esc(mo.body) + '</p>' +
          (mo.godLine ? '<p class="rp-month__line">' + esc(mo.godLine) + '</p>' : '') +
          (mo.stemLine ? '<p class="rp-month__line rp-month__line--dim">' + esc(mo.stemLine) + '</p>' : '') +
          (mo.careSentence ? '<p class="rp-month__hit rp-month__hit--care">' + esc(mo.careSentence) + '<em>' + esc(mo.primaryCare.label + ' ' + mo.primaryCare.rel) + '</em></p>' : '') +
          (mo.goodSentence ? '<p class="rp-month__hit rp-month__hit--good">' + esc(mo.goodSentence) + '</p>' : '') +
          '</div></li>';
      }).join('') + '</ul></div>';

    if (y.careMonths.length) {
      h += '<div class="rp-card rp-card--warn">' +
        '<div class="rp-card__head"><h3>주의할 달</h3><span>' + y.careMonths.length + '개</span></div>' +
        '<ul class="rp-list">' + y.careMonths.map(function (mo) {
          var hit = mo.chung[0] || mo.care[0];
          return '<li><b>' + mo.monthNo + '월(' + mo.ganzhi + ')</b> — ' +
            esc(hit.label + ' ' + hit.rel) + '. ' + esc(C.RELATION[hit.rel].body[hit.pos]) + '.</li>';
        }).join('') + '</ul>' +
        '<p class="rp-note">큰 결정은 이 달을 피해 한 주 뒤로 미루면 대체로 정리가 돼요.</p></div>';
    }

    if (y.moneyMonths.length) {
      h += '<div class="rp-card">' +
        '<div class="rp-card__head"><h3>돈이 움직이는 달</h3><span>재성이 겹치는 달</span></div>' +
        '<ul class="rp-list">' + y.moneyMonths.map(function (mo) {
          return '<li><b>' + mo.monthNo + '월(' + mo.ganzhi + ')</b> — 재성이 ' +
            (mo.branchGrp === '재성' ? '지지에 앉아요. ' : '천간으로 들어와요. ') +
            esc(mo.body) + '</li>';
        }).join('') + '</ul>' +
        '<p class="rp-note">부딪히는 지지가 없는 달만 골랐어요. 돈이 오가는 일은 이 달에 맞추는 게 좋아요.</p></div>';
    }

    return h;
  }

  /* ---------- 05 개운 ---------- */
  function remedyBlock(m) {
    var r = m.remedy;
    var h = '<div class="rp-card">' +
      '<p class="rp-card__kicker">부족한 ' + r.cards.map(function (c) { return c.ko; }).join('·') + ' 채우기</p>' +
      '<h3 class="rp-card__title">빈 곳은 색과 물건으로 천천히 채우면 돼요</h3>' +
      '<p class="rp-p">사주에 없는 기운은 생활에서 조금씩 보태면 돼요. 큰 걸 바꾸지 않아도 색 하나, 물건 하나로 시작할 수 있어요.</p>' +
      '</div>';

    h += '<div class="rp-remedy">' + r.cards.map(function (c) {
      return '<div class="rp-rcard">' +
        '<div class="rp-rcard__head">' +
        '<span class="rp-rcard__swatch" style="background:linear-gradient(135deg,' + c.swatch[0] + ',' + c.swatch[1] + ')"></span>' +
        '<div><p class="rp-rcard__ko">' + c.ko + '(' + c.han + ')</p><p class="rp-rcard__color">' + esc(c.colorName) + '</p></div></div>' +
        '<p class="rp-rcard__line">' + esc(c.line) + '</p>' +
        '<ul class="rp-rcard__items">' + c.items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
        '<p class="rp-rcard__place">자리 · ' + esc(c.place) + '</p>' +
        '<p class="rp-rcard__habit">습관 · ' + esc(c.habit[0]) + ' — ' + esc(c.habit[1]) + '</p>' +
        '</div>';
    }).join('') + '</div>';

    h += '<div class="rp-card">' +
      '<div class="rp-card__head"><h3>덜어낼 것</h3><span>' + esc(r.reduce.ko) + '</span></div>' +
      '<p class="rp-p">' + esc(r.reduce.text) + '</p>' +
      (r.fit ? '<div class="rp-touch rp-touch--good">' + esc(r.fit) + '</div>' : '') +
      '</div>';

    return h;
  }

  /* ---------- 기준 ---------- */
  function basisBlock(m) {
    var p = m.pillars;
    return '<div class="rp-card rp-card--plain">' +
      '<ul class="rp-list rp-list--dim rp-list--tight">' +
      '<li>년주는 입춘, 월주는 12절 절입시각을 기준으로 계산했어요. 절입시각은 태양 황경 15도 단위 실측값이에요.</li>' +
      '<li>음양력 변환은 한국천문연구원 역서 기반 데이터(1900~2050)를 썼어요. 윤달도 구분해요.</li>' +
      '<li>일주는 율리우스적일 60갑자 순환, 시주는 12지시와 시두법 기준이에요. 자시는 야자시로 봤어요.</li>' +
      '<li>대운은 월주에서 ' + (m.daeun ? (m.daeun.forward ? '순행' : '역행') : '—') + '으로 10년씩 진행하고, 대운수는 3일을 1년으로 환산했어요.</li>' +
      '<li>신강·신약은 월령 장악과 통근을 점수화한 참고 지표예요. 전통 간명의 정밀 판정을 대체하지 않아요.</li>' +
      '<li>표준시(KST) 그대로 계산했고, 경도 보정과 서머타임은 적용하지 않았어요.</li>' +
      '<li>이 리포트는 재미와 자기 이해를 위한 풀이예요. 의료·투자·법률 판단의 근거로 쓰지 마세요.</li>' +
      '</ul>' +
      '<p class="rp-note">기준 · 양력 ' + m.solar.y + '. ' + m.solar.m + '. ' + m.solar.d +
      (m.hourKnown ? ' ' + two(m.hour.hh) + ':' + two(m.hour.mm) : ' 시간 모름') +
      ' / ' + m.builtAt + ' 작성</p>' +
      '</div>';
  }

  /* ============================================================
   * 3. 잠금 카드 티저 — 계산값에서만 만든다
   * ============================================================ */
  function teasers(m) {
    var out = [];
    var w = m.wealth;
    var l = m.love;
    var y = m.year;

    /* 1. 재물 — 실제 재성 개수와 구조에서만 */
    var bits = [];
    if (w.count === 0) {
      bits.push('여덟 글자에 재성이 없어요.');
      bits.push('돈을 직접 겨냥할 때 새고, 잘하는 일을 오래 할 때 통장이 따라오는 구조예요.');
    } else {
      bits.push('재성 ' + w.count + '개.');
      bits.push(w.rooted ? '지지에 뿌리가 있어 흔들려도 남아요.' : '지지에 뿌리가 없어 들어와도 머물지 않아요.');
      if (w.goHit.length) bits.push(w.goOpen ? '재고(' + brKo(w.goHit[0].idx) + ')가 열려 있어 목돈이 한 번에 들어오는 자리가 있어요.' : '재고(' + brKo(w.goHit[0].idx) + ')가 닫혀 있어 모아두는 구조예요.');
    }
    if (w.years.length) bits.push('트이는 해는 ' + w.years.map(function (a) { return a.year + '년'; }).join('·') + '.');
    out.push({ tag: '평생 재물', title: w.pattern.title, preview: bits.join(' ') });

    /* 2. 인연 */
    var good = l.goodBranches[0];
    var loveBits = ['일지 ' + brKo(l.dayBranch) + '(' + brAnimal(l.dayBranch) + ').'];
    if (good) loveBits.push(good.how + ' 상대는 ' + brKo(good.idx) + '(' + brAnimal(good.idx) + ') 일지 — ' + good.why + '.');
    if (l.badBranch !== null) loveBits.push('충하는 ' + brKo(l.badBranch) + '(' + brAnimal(l.badBranch) + ') 일지.');
    var nobleBit = l.noble ? '귀인은 ' + l.noble.join('·') + '.' : (l.nobleYears.length ? '귀인이 들어오는 해는 ' + l.nobleYears.slice(0, 2).join('·') + '년.' : '');
    if (nobleBit) loveBits.push(nobleBit);
    out.push({ tag: '인연', title: '나와 붙는 사람, 부딪히는 사람', preview: loveBits.join(' ') });

    /* 3. 주의 */
    var watch = [];
    if (l.badBranch !== null) watch.push('일지 ' + brKo(l.badBranch) + '(' + brAnimal(l.badBranch) + ')인 사람과는 같은 자리에서 계속 부딪혀요.');
    if (l.badStems.length) {
      watch.push('일간이 ' + l.badStems.map(function (s) { return stemKo(s.idx) + '(' + s.god + ')'; }).join('·') +
        '인 사람 — ' + badEffect(l.badStems));
    }
    if (!watch.length) watch.push('원국과 정면으로 부딪히는 일지가 없어요. 대신 ' + (l.spouseName === '관성' ? '관성' : '재성') + '이 약한 자리를 채워주는 사람이 오래 가요.');
    out.push({ tag: '주의', title: '피해야 할 인연의 사주 특징', preview: watch.join(' ') });

    /* 4. 2027 월별 */
    var mbits = [];
    if (y.moneyMonths.length) mbits.push('돈이 움직이는 달은 ' + y.moneyMonths.map(function (a) { return a.monthNo + '월'; }).join('·') + '.');
    if (y.careMonths.length) mbits.push('부딪히는 달은 ' + y.careMonths.map(function (a) { return a.monthNo + '월'; }).join('·') + '.');
    mbits.push('이 해는 ' + y.ganzhi + '년, ' + y.stemGod + '/' + y.branchGod + part(y.branchGod, '으로', '로') + ' 들어와요.');
    out.push({ tag: m.focusYear + ' 월별', title: m.focusYear + '년 열두 달의 흐름', preview: mbits.join(' ') });

    /* 5. 대운 */
    if (m.daeun) {
      var d = m.daeun;
      out.push({
        tag: '대운',
        title: '지금 ' + d.current.ganzhi + ' 대운 · ' + d.head,
        preview: d.current.age + '–' + d.current.ageEnd + '세 (' + d.current.year + '–' + d.current.yearEnd + '년). ' +
          (d.touch ? d.touch.text : '원국과 정면으로 부딪히는 지지가 없어 흐름이 고른 구간이에요.')
      });
    }

    return out;
  }

  g.SAJU_REPORT = {
    build: build,
    render: render,
    teasers: teasers,
    strengthNote: strengthNote,
    dateText: dateText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.SAJU_REPORT;
})(typeof window !== 'undefined' ? window : globalThis);
