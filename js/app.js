/* ============================================================
 * 화면 조립 — 입력, 계산, 결과 렌더링, 신청 모달, 유료 리포트 해금
 * ============================================================ */
(function () {
  'use strict';

  var Engine = window.SajuEngine;
  var C = window.SAJU_CONTENT;
  var CFG = window.SAJU_CONFIG;
  var Report = window.SAJU_REPORT;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var state = { result: null, input: null, model: null, unlocked: false, fromUrl: false };

  /* ---------- 유틸 ---------- */
  var el = function (tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(d) { return d.y + '. ' + d.m + '. ' + d.d; }
  function two(n) { return n < 10 ? '0' + n : '' + n; }
  function price(n) { return CFG.fmtPrice(n); }

  /* ---------- 잠금 상태 ---------- */
  function readUnlock() {
    try { return localStorage.getItem(CFG.unlock.storageKey) === '1'; } catch (e) { return false; }
  }
  function writeUnlock(v) {
    try {
      if (v) localStorage.setItem(CFG.unlock.storageKey, '1');
      else localStorage.removeItem(CFG.unlock.storageKey);
    } catch (e) { }
    state.unlocked = v;
  }
  function codeMatches(raw) {
    var v = String(raw || '').trim().toUpperCase();
    if (!v) return false;
    return CFG.unlock.codes.some(function (c) { return String(c).toUpperCase() === v; });
  }

  /** 결제 후 돌아온 주소(?unlocked=1 · ?payapp=success · ?code= · ?token=) 확인 */
  function applyUrlUnlock() {
    var q;
    try { q = new URLSearchParams(window.location.search); } catch (e) { return false; }
    var hit = false;

    CFG.payapp.successParams.forEach(function (p) {
      var v = q.get(p);
      if (v && CFG.payapp.successValues.indexOf(String(v).toLowerCase()) >= 0) hit = true;
    });
    var code = q.get(CFG.unlock.paramName);
    if (code && codeMatches(code)) hit = true;
    var tok = q.get(CFG.payapp.tokenParam);
    if (tok && CFG.unlock.tokens && CFG.unlock.tokens.indexOf(tok) >= 0) hit = true;

    if (!hit) return false;
    writeUnlock(true);
    state.fromUrl = true;
    try {
      var url = new URL(window.location.href);
      [CFG.unlock.paramName, CFG.payapp.tokenParam].concat(CFG.payapp.successParams).forEach(function (k) {
        url.searchParams.delete(k);
      });
      window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams : '') + url.hash);
    } catch (e) { }
    return true;
  }

  /* ---------- 폼 초기화 ---------- */
  var yearSel = $('#birthYear');
  var monthSel = $('#birthMonth');
  var daySel = $('#birthDay');

  function initSelects() {
    var now = new Date();
    var maxYear = Math.min(now.getFullYear(), Engine.MAX_YEAR);
    yearSel.appendChild(new Option('년', ''));
    for (var y = Engine.MIN_YEAR; y <= maxYear; y++) {
      yearSel.appendChild(new Option(y + '년', y));
    }
    monthSel.appendChild(new Option('월', ''));
    for (var m = 1; m <= 12; m++) {
      monthSel.appendChild(new Option(m + '월', m));
    }
    daySel.appendChild(new Option('일', ''));
    syncDays();
  }

  function syncDays() {
    var y = +yearSel.value, m = +monthSel.value;
    var isLunar = $('input[name="calendar"]:checked').value === 'lunar';
    var prev = daySel.value;
    daySel.innerHTML = '';
    daySel.appendChild(new Option('일', ''));
    if (!y || !m) { syncLeap(); return; }
    var max = isLunar ? Engine.lunarMonthDays(y, m, false) : new Date(y, m, 0).getDate();
    for (var d = 1; d <= max; d++) daySel.appendChild(new Option(d + '일', d));
    daySel.value = prev && +prev <= max ? prev : '';
    syncLeap();
  }

  function syncLeap() {
    var isLunar = $('input[name="calendar"]:checked').value === 'lunar';
    var wrap = $('#leapWrap');
    var cb = $('#isLeap');
    if (!isLunar || !yearSel.value || !monthSel.value) {
      wrap.hidden = true;
      cb.checked = false;
      return;
    }
    wrap.hidden = false;
    var y = +yearSel.value, m = +monthSel.value;
    var leap = Engine.lunarLeapMonth(y);
    if (leap === 0) {
      cb.checked = false;
      cb.disabled = true;
      $('#leapHint').textContent = y + '년은 윤달이 없어요.';
    } else if (leap !== m) {
      cb.checked = false;
      cb.disabled = true;
      $('#leapHint').textContent = y + '년 윤달은 윤' + leap + '월이에요.';
    } else {
      cb.disabled = false;
      $('#leapHint').textContent = y + '년 ' + m + '월에 윤달이 있어요.';
    }
  }

  /* ---------- 시간 입력 ---------- */
  function buildTimeOptions() {
    var sel = $('#birthHour');
    var opts = [{ v: 'unknown', t: '시간 모름 (시주 제외)' }];
    Engine.ZODIAC_HOUR.forEach(function (z, i) {
      opts.push({ v: String(i), t: z.ko + ' (' + two(z.from % 24) + ':00 ~ ' + two((z.to % 24) === 0 ? 23 : z.to - 1) + ':59)' });
    });
    opts.push({ v: 'custom', t: '시각 직접 입력' });
    opts.forEach(function (o) {
      var n = el('option', null, o.t);
      n.value = o.v;
      sel.appendChild(n);
    });
  }

  function syncTime() {
    var v = $('#birthHour').value;
    $('#customTime').hidden = v !== 'custom';
  }

  /* ---------- 계산 ---------- */
  function readInput() {
    var cal = $('input[name="calendar"]:checked').value;
    var hourVal = $('#birthHour').value;
    var input = {
      name: $('#nameInput').value.trim(),
      gender: $('input[name="gender"]:checked').value,
      year: +yearSel.value,
      month: +monthSel.value,
      day: +daySel.value,
      isLunar: cal === 'lunar',
      isLeap: cal === 'lunar' && $('#isLeap').checked
    };
    if (hourVal === 'unknown') {
      input.hourBranch = null;
    } else if (hourVal === 'custom') {
      var hh = +$('#hourInput').value;
      var mm = +$('#minuteInput').value || 0;
      input.hour = hh;
      input.minute = mm;
      input.hourBranch = Math.floor(((hh + 1) % 24) / 2);
    } else {
      input.hourBranch = +hourVal;
    }
    return input;
  }

  function showError(msg) {
    var box = $('#formError');
    box.textContent = msg;
    box.hidden = false;
  }

  function hideError() { $('#formError').hidden = true; }

  function submit() {
    hideError();
    if (!yearSel.value || !monthSel.value || !daySel.value) {
      showError('생년월일을 연·월·일까지 선택해 주세요.');
      return;
    }
    var input = readInput();
    var res = Engine.compute(input);
    if (!res.ok) { showError(res.errors[0]); return; }
    try { localStorage.setItem('saju:last', JSON.stringify(input)); } catch (e) { }

    $('#formCard').classList.add('is-collapsed');
    var loader = $('#loading');
    loader.hidden = false;
    loader.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(function () {
      loader.hidden = true;
      state.result = res;
      state.input = input;
      state.model = null;
      render(res, input);
      $('#result').hidden = false;
      reveal();
      $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('#stickyBar').hidden = false;
      if (state.unlocked && state.fromUrl) {
        state.fromUrl = false;
        openReport();
      }
    }, 820);
  }

  /* ---------- 모델 ---------- */
  function model() {
    if (!state.result) return null;
    if (!state.model) {
      var now = new Date();
      state.model = Report.build(state.result, state.input, {
        nowY: now.getFullYear(),
        nowM: now.getMonth() + 1,
        focusYear: CFG.product.focusYear
      });
    }
    return state.model;
  }

  /* ---------- 렌더 ---------- */
  function elemChip(idx) {
    var m = C.ELEM_META[idx];
    return '<span class="el el--' + m.ko + '">' + m.ko + '<i>' + m.han + '</i></span>';
  }

  function pillarCells(res) {
    var order = [
      { key: 'year', label: '년주' }, { key: 'month', label: '월주' },
      { key: 'day', label: '일주' }, { key: 'hour', label: '시주' }
    ];
    return order.map(function (o) {
      var p = res.pillars[o.key];
      if (!p) {
        return '<div class="pc pc--empty"><span class="pc__label">' + o.label + '</span>' +
          '<span class="pc__god">—</span><span class="pc__han">·</span><span class="pc__ko">모름</span>' +
          '<span class="pc__god">—</span><span class="pc__han pc__han--sub">·</span><span class="pc__ko">모름</span></div>';
      }
      var stemMeta = C.ELEM_META[p.stemEl];
      var branchMeta = C.ELEM_META[p.branchEl];
      return '<div class="pc' + (o.key === 'day' ? ' pc--day' : '') + '">' +
        '<span class="pc__label">' + o.label + '</span>' +
        '<span class="pc__god">' + esc(p.stemGod) + '</span>' +
        '<span class="pc__han" style="color:' + stemMeta.color + '">' + p.stemHan + '</span>' +
        '<span class="pc__ko">' + Engine.STEMS[p.stem].ko + '<i>' + stemMeta.ko + '</i></span>' +
        '<span class="pc__god">' + esc(p.branchGod) + '</span>' +
        '<span class="pc__han pc__han--sub" style="color:' + branchMeta.color + '">' + p.branchHan + '</span>' +
        '<span class="pc__ko">' + Engine.BRANCHES[p.branch].ko + '<i>' + branchMeta.ko + '</i></span>' +
        '</div>';
    }).join('');
  }

  function renderElements(res) {
    var e = res.elements;
    var max = Math.max.apply(null, e.counts);
    var rows = e.counts.map(function (c, i) {
      var meta = C.ELEM_META[i];
      var pct = max ? Math.round((c / max) * 100) : 0;
      var cls = 'el-row';
      if (e.strongest.indexOf(i) >= 0 && c > 0) cls += ' is-strong';
      if (c === 0) cls += ' is-none';
      return '<li class="' + cls + '">' +
        '<span class="el-row__name">' + meta.ko + '<i>' + meta.han + '</i></span>' +
        '<span class="el-row__track"><span class="el-row__fill" style="width:' + Math.max(pct, c ? 8 : 0) + '%;background:' + meta.color + '"></span></span>' +
        '<span class="el-row__num">' + c + '</span>' +
        '</li>';
    }).join('');

    var strongTxt = e.strongest.map(function (i) { return C.ELEM_META[i].ko; }).join('·');
    var weakIdx = e.missing.length ? e.missing : e.weakest;
    var weakTxt = weakIdx.map(function (i) { return C.ELEM_META[i].ko; }).join('·');
    var summary = e.missing.length
      ? '가장 강한 기운은 <b>' + strongTxt + '</b>, <b>' + weakTxt + '</b>는 여덟 글자에 아예 없어요.'
      : '가장 강한 기운은 <b>' + strongTxt + '</b>, 가장 약한 기운은 <b>' + weakTxt + '</b>예요.';
    return '<ul class="el-list">' + rows + '</ul>' +
      '<p class="el-summary">' + summary + ' ' +
      (e.total === 6 ? '시주를 모르니 여섯 글자로만 봤어요.' : '여덟 글자 전체를 기준으로 봤어요.') + '</p>';
  }

  function renderSipsung(res) {
    var s = res.sipsung;
    var order = ['비겁', '식상', '재성', '관성', '인성'];
    var chips = order.map(function (k) {
      return '<li class="' + (s.dominant.indexOf(k) >= 0 ? 'is-on' : '') + (s.tally[k] === 0 ? ' is-off' : '') + '">' +
        '<b>' + k + '</b><span>' + s.tally[k] + '</span></li>';
    }).join('');
    var dom = C.SIPSUNG_READING[s.dominant[0]];
    return '<ul class="chips">' + chips + '</ul>' +
      '<h4 class="sub-title">' + esc(dom.title) + ' — ' + s.dominant.join('·') + '이 중심</h4>' +
      '<p class="body-text">' + esc(dom.body) + '</p>' +
      '<p class="body-text body-text--dim">그림자: ' + esc(dom.shadow) + '</p>';
  }

  function renderSinsal(res) {
    if (!res.sinsal.length) {
      return '<p class="body-text">이 사주엔 눈에 띄는 살(煞)이 없어요. 흔들림 없이 자기 길을 가는 편이라, 대신 재미있는 변수도 적은 사주예요.</p>';
    }
    return res.sinsal.map(function (s) {
      var info = C.SINSAL[s.key];
      return '<article class="sinsal">' +
        '<div class="sinsal__head"><span class="sinsal__han">' + info.han + '</span>' +
        '<h4>' + info.title + '</h4><span class="sinsal__where">' + s.where.join('·') + '</span></div>' +
        '<p class="sinsal__lead">' + esc(info.lead) + '</p>' +
        '<p class="sinsal__body">' + esc(info.body) + '</p>' +
        '</article>';
    }).join('');
  }

  function renderRemedy(res) {
    var e = res.elements;
    var order = e.missing.length ? e.missing : e.weakest;
    var pick = order.slice(0, 2);
    return pick.map(function (i) {
      var r = C.ELEM_REMEDY[i];
      return '<article class="goods">' +
        '<div class="goods__head">' +
        '<span class="goods__swatch" style="background:linear-gradient(135deg,' + r.swatch[0] + ',' + r.swatch[1] + ')"></span>' +
        '<div><p class="goods__eyebrow">부족한 ' + r.ko + '(' + r.han + ') 채우기</p>' +
        '<h4 class="goods__title">' + r.colorName + '</h4></div></div>' +
        '<p class="goods__line">' + esc(r.line) + '</p>' +
        '<ul class="goods__items">' + r.items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
        '<p class="goods__place">자리 · ' + esc(r.place) + '</p>' +
        '<a class="goods__link" href="#" data-affiliate="coupang" data-slot="' + r.ko + '">추천 아이템 보기 <span>제휴 링크 자리</span></a>' +
        '</article>';
    }).join('');
  }

  /* 잠금 카드 — 계산값으로 만든 티저 */
  function renderLocked(m) {
    var list = Report.teasers(m);
    return list.map(function (c) {
      return '<article class="lockcard">' +
        '<span class="lockcard__tag">' + esc(c.tag) + '</span>' +
        '<h4 class="lockcard__title">' + esc(c.title) + '</h4>' +
        '<p class="lockcard__preview">' + esc(c.preview) + '</p>' +
        '<span class="lockcard__veil">잠금</span>' +
        '</article>';
    }).join('');
  }

  function priceLine() {
    var d = CFG.discountRate();
    return '<p class="price-line"><span>정가 <s>' + esc(CFG.listPriceLabel) + '</s></span>' +
      '<b>' + esc(CFG.product.priceTag) + ' ' + esc(CFG.priceLabel) + '</b>' +
      (d ? '<em>' + d + '% 할인</em>' : '') + '</p>';
  }

  function render(res, input) {
    var stemP = C.STEM_PROFILES[res.pillars.day.stem];
    var ilju = C.ILJU[res.pillars.day.ganzhi] || ['', ''];
    var dayBranchGod = res.sipsung.dayBranchGod;
    var dbg = C.DAY_BRANCH_GOD[dayBranchGod];
    var y2026 = res.saeun.y2026;
    var y2027 = res.saeun.y2027;
    var t2026 = C.SAEUN_TEXT[y2026.stemGod];
    var t2027 = C.SAEUN_TEXT[y2027.stemGod];
    var name = esc(input.name || '');
    var who = name ? name + '님의 여덟 글자' : '당신의 여덟 글자';

    var jieLine = res.jie.current
      ? res.jie.current.name + ' ' + res.jie.current.m + '월 ' + res.jie.current.d + '일 ' +
      two(res.jie.current.hh) + ':' + two(res.jie.current.mm) + ' 절입 이후 → ' +
      Engine.BRANCHES[res.pillars.month.branch].ko + '월'
      : '절입 정보 없음';

    var timeLbl = res.hourKnown
      ? (res.hour.note ? '자시 (00:30 기준)' : two(res.hour.hh) + ':' + two(res.hour.mm) + ' ' + Engine.ZODIAC_HOUR[res.hour.branch].ko)
      : '시간 모름';
    var lunarLbl = '음력 ' + (res.lunar.leap ? '윤' : '') + res.lunar.m + '월 ' + res.lunar.d + '일';

    var tags = [res.pillars.day.ganzhi + '일주'];
    res.sinsal.slice(0, 3).forEach(function (x) { tags.push(x.name); });
    tags.push(res.sipsung.dominant.join('·') + ' 중심');
    tags.push(res.elements.missing.length
      ? C.ELEM_META[res.elements.missing[0]].ko + ' 없음'
      : C.ELEM_META[res.elements.weakest[0]].ko + ' 약함');

    var html =
      '<div class="result__head">' +
      '<p class="result__eyebrow">사주 원국 · 십성 · 신살</p>' +
      '<h2 class="result__title">' + who + '</h2>' +
      '<p class="result__sub">' + fmtDate(res.solar) + ' · ' + lunarLbl + ' · ' + timeLbl +
      ' · ' + (res.input.gender === 'female' ? '여' : '남') + '</p>' +
      '<ul class="tagbar">' + tags.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<p class="result__tagline">' + esc(stemP.tagline) + '</p>' +
      '</div>' +

      '<section class="card">' +
      '<div class="card__head"><h3>사주 원국</h3><span class="card__hint">여덟 글자</span></div>' +
      '<div class="pillars">' + pillarCells(res) + '</div>' +
      '<p class="card__foot">' + esc(jieLine) + ' · 일간 ' + res.dayMaster.han + '(' + res.dayMaster.ko + ') 기준</p>' +
      '</section>' +

      '<section class="card">' +
      '<div class="card__head"><h3>오행의 균형</h3><span class="card__hint">목·화·토·금·수</span></div>' +
      renderElements(res) +
      '</section>' +

      '<section class="card card--hero">' +
      '<p class="card__eyebrow">일간 · 나를 뜻하는 한 글자</p>' +
      '<h3 class="daymaster">' + res.dayMaster.han + ' <span>' + res.dayMaster.ko + '</span> · ' + esc(stemP.image) + '</h3>' +
      '<p class="daymaster__tag">' + esc(stemP.tagline) + '</p>' +
      stemP.personality.map(function (t) { return '<p class="body-text">' + esc(t) + '</p>'; }).join('') +
      '<div class="divider"></div>' +
      '<p class="label-inline">연애</p><p class="body-text">' + esc(stemP.love) + '</p>' +
      '<p class="label-inline">잘 맞는 일</p><p class="body-text">' + esc(stemP.work) + '</p>' +
      '</section>' +

      '<section class="card">' +
      '<div class="card__head"><h3>' + res.pillars.day.ganzhi + '일주</h3><span class="card__hint">일주론</span></div>' +
      '<p class="ilju__title">' + esc(ilju[0]) + '</p>' +
      '<p class="body-text">' + esc(ilju[1]) + '</p>' +
      '<div class="divider"></div>' +
      '<p class="label-inline">일지에 앉은 ' + dayBranchGod + '</p>' +
      '<p class="body-text">' + esc(dbg.style) + '</p>' +
      '</section>' +

      '<section class="card">' +
      '<div class="card__head"><h3>십성으로 본 결</h3><span class="card__hint">비겁·식상·재성·관성·인성</span></div>' +
      renderSipsung(res) +
      '</section>' +

      '<section class="card">' +
      '<div class="card__head"><h3>타고난 별</h3><span class="card__hint">신살</span></div>' +
      renderSinsal(res) +
      '</section>' +

      '<section class="card">' +
      '<div class="card__head"><h3>끌리는 사람, 끌리는 이유</h3><span class="card__hint">연애</span></div>' +
      '<p class="label-inline">나에게 끌리는 유형</p>' +
      '<p class="body-text">' + esc(dbg.who) + '</p>' +
      '<p class="label-inline">연애할 때 나는</p>' +
      '<p class="body-text">' + esc(dbg.style) + '</p>' +
      '<p class="label-inline">조심할 것</p>' +
      '<p class="body-text">' + esc(dbg.caution) + '</p>' +
      '<div class="teaser-lock">' +
      '<p class="teaser-lock__text">이 사주에 반복해서 들어오는 인연의 유형과, 피해야 할 상대의 사주 특징은 상세 리포트에 정리해뒀어요.</p>' +
      '<button class="btn btn--ghost" data-open-modal="1">인연 자세히 보기</button>' +
      '</div>' +
      '</section>' +

      '<section class="card">' +
      '<div class="card__head"><h3>2026 · 2027</h3><span class="card__hint">세운</span></div>' +
      '<p class="label-inline">2026 ' + y2026.ganzhi + '년 · ' + y2026.stemGod + '</p>' +
      '<h4 class="sub-title">' + esc(t2026.head) + '</h4>' +
      '<p class="body-text">' + esc(t2026.body) + '</p>' +
      '<div class="care">' +
      '<div class="care__item"><span>인간관계</span><p>' + esc(t2026.care) + '</p></div>' +
      '<div class="care__item"><span>금전</span><p>' + esc(t2026.money) + '</p></div>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<p class="label-inline">2027 ' + y2027.ganzhi + '년 · ' + y2027.stemGod + '</p>' +
      '<h4 class="sub-title">' + esc(t2027.head) + '</h4>' +
      '<p class="body-text">' + esc(t2027.body) + '</p>' +
      '</section>' +

      '<section class="upsell" id="upsell">' +
      '<p class="upsell__eyebrow">여기까지가 맛보기</p>' +
      '<h3 class="upsell__title">당신이 진짜<br>궁금해할 것들</h3>' +
      '<p class="upsell__sub">2027년에 돈이 트이는 달, 인연이 들어오는 시기, 피해야 할 사람의 사주까지. 원국에 다 적혀 있는데 아직 안 꺼낸 것뿐이에요.</p>' +
      '<div class="lockgrid">' + renderLocked(model()) + '</div>' +
      priceLine() +
      '<button class="btn btn--gold btn--wide" id="upsellCta" data-open-modal="1">' +
      (state.unlocked ? '상세 리포트 열기' : esc(CFG.product.cta) + ' · ' + esc(CFG.product.priceTag) + ' ' + esc(CFG.priceLabel)) +
      '</button>' +
      '<p class="upsell__fine">' + esc(CFG.product.delivery) + ' · 평생 소장</p>' +
      '</section>' +

      '<section class="card">' +
      '<div class="card__head"><h3>부족한 기운 채우기</h3><span class="card__hint">개운</span></div>' +
      '<p class="body-text body-text--dim">사주에 없는 기운은 생활에서 조금씩 보태면 돼요. 큰 걸 바꾸지 않아도, 색과 물건 하나로 시작할 수 있어요.</p>' +
      '<div class="goodsgird">' + renderRemedy(res) + '</div>' +
      '</section>' +

      '<section class="card card--note">' +
      '<div class="card__head"><h3>계산 기준</h3></div>' +
      '<p class="body-text body-text--dim">' +
      '· 양력 ' + fmtDate(res.solar) + ' / 음력 ' + (res.lunar.leap ? '윤' : '') + res.lunar.m + '월 ' + res.lunar.d + '일<br>' +
      '· 년주는 입춘, 월주는 12절 절입시각(한국표준시) 기준으로 계산했어요.<br>' +
      '· 절입시각은 태양 황경 15도 단위 실측값(1899~2050), 음양력 변환은 한국천문연구원 역서 기반 데이터예요.<br>' +
      '· 자시는 야자시 기준이에요. 23시대 출생은 일주를 그날로 두고 시주만 다음 날 일간으로 잡아요.<br>' +
      '· 표준시(KST) 그대로 계산해요. 경도 보정과 서머타임은 적용하지 않았어요.<br>' +
      (res.daeun ? '· 대운은 약 ' + res.daeun.startAge + '세부터 10년 단위로 바뀌어요(' + (res.daeun.forward ? '순행' : '역행') + ').<br>' : '') +
      (res.hourKnown ? '' : '· 시간을 몰라 시주는 비워뒀어요. 시각을 알면 여덟 글자가 완성돼요.<br>') +
      (res.hour && res.hour.note ? '· ' + esc(res.hour.note) + '<br>' : '') +
      '· 재미와 자기 이해를 위한 풀이예요. 의료·투자·법률 판단의 근거로 쓰지 마세요.' +
      '</p></section>';

    $('#resultBody').innerHTML = html;
  }

  /* ---------- 등장 애니메이션 ---------- */
  function reveal() {
    var items = $$('#resultBody > .card, #resultBody > .upsell, #resultBody .result__head');
    items.forEach(function (n, i) {
      n.classList.add('reveal');
      n.style.transitionDelay = Math.min(i * 60, 420) + 'ms';
    });
    requestAnimationFrame(function () {
      setTimeout(function () {
        items.forEach(function (n) { n.classList.add('in'); });
      }, 30);
    });
  }

  /* ---------- 신청 모달 ---------- */
  function openModal() {
    if (state.unlocked && state.result) { openReport(); return; }
    var m = $('#modal');
    m.hidden = false;
    document.body.classList.add('is-modal');
    m.querySelector('.modal__panel').scrollTop = 0;
  }
  function closeModal() {
    $('#modal').hidden = true;
    document.body.classList.remove('is-modal');
  }

  function unlockMsg(text, tone) {
    var box = $('#unlockMsg');
    box.textContent = text;
    box.hidden = false;
    box.className = 'unlock__msg' + (tone ? ' is-' + tone : '');
  }

  function tryUnlock() {
    var v = $('#unlockInput').value;
    if (codeMatches(v)) {
      writeUnlock(true);
      unlockMsg('열렸어요. 리포트를 불러옵니다.', 'ok');
      closeModal();
      if (!state.result) {
        closeModal();
        showError('사주를 먼저 세워주세요. 생년월일을 넣으면 리포트가 열려요.');
        $('#formCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      openReport();
      return;
    }
    unlockMsg('코드가 맞지 않아요. 받은 코드를 다시 확인해 주세요.', 'bad');
    var input = $('#unlockInput');
    input.classList.add('is-shake');
    setTimeout(function () { input.classList.remove('is-shake'); }, 420);
  }

  /* ---------- 유료 리포트 ---------- */
  function openReport() {
    if (!state.result) {
      closeModal();
      showError('사주를 먼저 세워주세요.');
      $('#formCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var m = model();
    $('#reportBody').innerHTML = Report.render(m);
    var cta = $('#upsellCta');
    if (cta && state.unlocked) cta.textContent = '상세 리포트 열기';
    var overlay = $('#report');
    overlay.hidden = false;
    document.body.classList.add('is-report');
    overlay.querySelector('.report__body').scrollTop = 0;
    overlay.focus({ preventScroll: true });
    $('#reportRelock').hidden = !CFG.unlock.sampleEnabled;
    closeModal();
  }

  function closeReport() {
    $('#report').hidden = true;
    document.body.classList.remove('is-report');
  }

  function printReport() {
    window.print();
  }

  /* ---------- 공유 ---------- */
  function share() {
    if (!state.result) return;
    var r = state.result;
    var text = '내 사주 여덟 글자: ' + ['year', 'month', 'day', 'hour'].map(function (k) {
      return r.pillars[k] ? r.pillars[k].ganzhi : '-';
    }).join(' ') + ' · ' + r.pillars.day.ganzhi + '일주';
    if (navigator.share) {
      navigator.share({ title: '여덟 글자', text: text }).catch(function () { });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      var btn = $('#shareBtn');
      btn.textContent = '복사했어요';
      setTimeout(function () { btn.textContent = '친구에게 보내기'; }, 1600);
    }
  }

  /* ---------- 설정 반영 ---------- */
  function applyConfig() {
    var p = CFG.product;
    document.title = CFG.brand.name + ' — 내 사주를 가장 조용히 읽는 방법';
    $('#stickyListPrice').textContent = CFG.listPriceLabel;
    $('#stickyPrice').textContent = CFG.priceLabel;
    $('#stickyCta').textContent = CFG.priceLabel + '에 열기';
    $('#modalListPrice').textContent = CFG.listPriceLabel;
    $('#modalPrice').textContent = CFG.priceLabel;
    $('#modalPriceNote').textContent = p.priceNote;
    var d = CFG.discountRate();
    $('#modalDiscount').textContent = d ? d + '% 할인' : '';
    $('#modalDiscount').hidden = !d;

    /* 계좌 */
    $('#accountNo').textContent = CFG.payment.bank + ' ' + CFG.payment.account;
    $('#accountHolder').textContent = (CFG.payment.holder || '예금주') + ' · ' + (CFG.payment.placeholder ? '테스트용' : CFG.brand.name);
    $('#accountLabel').textContent = CFG.payment.placeholder ? '입금 계좌 (테스트용 · 실제 계좌로 교체)' : CFG.payment.label;

    /* 페이앱 */
    var payBtn = $('#payappBtn');
    if (CFG.hasPayapp()) {
      payBtn.hidden = false;
      payBtn.href = CFG.payappPaymentUrl;
      payBtn.target = '_blank';
      payBtn.rel = 'noopener';
      payBtn.textContent = CFG.payapp.label;
      $('#paySteps').innerHTML =
        '<li><b>' + esc(CFG.payapp.label) + '</b> 버튼을 눌러 ' + esc(CFG.priceLabel) + '을 결제해요.</li>' +
        '<li>결제를 마치면 <b>해금 코드</b>를 받아요.</li>' +
        '<li>코드를 넣으면 리포트가 바로 열리고, PDF로도 저장할 수 있어요.</li>';
      $('#accountBox').hidden = true;
      $('#modalFine').textContent = CFG.payapp.note + ' · ' + p.delivery;
    } else {
      payBtn.hidden = true;
      $('#paySteps').innerHTML =
        '<li>아래 계좌로 <b>' + esc(CFG.priceLabel) + '</b>을 입금해요.</li>' +
        '<li>입금 후 오픈채팅으로 <b>이름 / 생년월일시 / 양력·음력</b>을 보내요.</li>' +
        '<li>받은 <b>해금 코드</b>를 넣으면 리포트가 바로 열리고, PDF로도 저장할 수 있어요.</li>';
      $('#modalFine').textContent = p.delivery + ' · 평생 소장';
    }

    /* 오픈채팅 */
    var chat = $('#openChatBtn');
    if (CFG.hasOpenChat()) {
      chat.href = CFG.openChat.url;
      chat.target = '_blank';
      chat.rel = 'noopener';
      chat.textContent = CFG.openChat.label;
      chat.hidden = false;
    } else {
      chat.hidden = true;
    }

    /* 해금 영역 */
    $('#unlockLabel').textContent = CFG.unlock.codeLabel;
    $('#unlockHelp').textContent = CFG.unlock.codeHelp;
    $('#sampleBtn').hidden = !CFG.unlock.sampleEnabled;
    $('#sampleBtn').textContent = CFG.unlock.sampleLabel;

    /* FAQ 결제 안내 */
    $('#faqPay').textContent = CFG.hasPayapp()
      ? ('페이앱으로 결제하면 해금 코드가 발급되고, 코드를 넣으면 리포트가 바로 열려요.')
      : ('지금은 계좌이체로 신청을 받고 있어요. 입금 후 오픈채팅으로 이름·생년월일시를 보내면 코드를 드려요.');

    state.unlocked = readUnlock();
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    $$('input[name="calendar"]').forEach(function (r) {
      r.addEventListener('change', function () {
        document.querySelector('.seg--cal').classList.toggle('is-lunar', r.value === 'lunar' && r.checked);
        syncDays();
      });
    });
    yearSel.addEventListener('change', syncDays);
    monthSel.addEventListener('change', syncDays);
    $('#birthHour').addEventListener('change', syncTime);
    $('#sajuForm').addEventListener('submit', function (e) { e.preventDefault(); submit(); });

    $('#result').addEventListener('click', function (e) {
      var t = e.target.closest('[data-open-modal]');
      if (t) { e.preventDefault(); openModal(); }
    });

    $('#stickyCta').addEventListener('click', openModal);

    /* 모달 */
    $('#modalClose').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', function (e) {
      if (e.target.id === 'modal') closeModal();
    });
    $('#unlockToggle').addEventListener('click', function () {
      var body = $('#unlockBody');
      var open = body.hidden;
      body.hidden = !open;
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) setTimeout(function () { $('#unlockInput').focus(); }, 120);
    });
    $('#unlockBtn').addEventListener('click', tryUnlock);
    $('#unlockInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
    });
    $('#sampleBtn').addEventListener('click', function () {
      if (!state.result) {
        closeModal();
        showError('사주를 먼저 세워주세요. 생년월일을 넣으면 샘플 리포트가 열려요.');
        $('#formCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      openReport();
    });

    /* 리포트 */
    $('#reportClose').addEventListener('click', closeReport);
    $('#reportPrint').addEventListener('click', printReport);
    $('#reportPrint2').addEventListener('click', printReport);
    $('#reportRelock').addEventListener('click', function () {
      writeUnlock(false);
      closeReport();
      if (state.result) render(state.result, state.input);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('#modal').hidden) closeModal();
      else if (!$('#report').hidden) closeReport();
    });

    $('#shareBtn').addEventListener('click', share);

    $$('[data-scroll]').forEach(function (b) {
      b.addEventListener('click', function () {
        var target = document.getElementById(b.getAttribute('data-scroll'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(function () { $('#nameInput').focus({ preventScroll: true }); }, 500);
      });
    });

    $('#copyAccount').addEventListener('click', function () {
      var txt = $('#accountNo').textContent.trim();
      if (navigator.clipboard) navigator.clipboard.writeText(txt);
      var b = $('#copyAccount');
      b.textContent = '복사됨';
      setTimeout(function () { b.textContent = '계좌 복사'; }, 1500);
    });

    $('#againBtn').addEventListener('click', function () {
      closeReport();
      $('#formCard').classList.remove('is-collapsed');
      $('#result').hidden = true;
      $('#stickyBar').hidden = true;
      state.model = null;
      $('#formCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    $$('[data-open-chat]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (!CFG.hasOpenChat()) {
          e.preventDefault();
          a.textContent = '오픈채팅 링크 준비 중이에요';
          a.classList.add('is-muted');
        }
      });
    });
  }

  function restore() {
    try {
      var raw = localStorage.getItem('saju:last');
      if (!raw) return;
      var s = JSON.parse(raw);
      if (!s || !s.year) return;
      yearSel.value = s.year;
      monthSel.value = s.month;
      syncDays();
      daySel.value = s.day;
      if (s.name) $('#nameInput').value = s.name;
      var gender = document.querySelector('input[name="gender"][value="' + (s.gender || 'female') + '"]');
      if (gender) gender.checked = true;
      var cal = document.querySelector('input[name="calendar"][value="' + (s.isLunar ? 'lunar' : 'solar') + '"]');
      if (cal) { cal.checked = true; document.querySelector('.seg--cal').classList.toggle('is-lunar', s.isLunar); }
      syncDays();
      if (s.isLeap && !$('#isLeap').disabled) $('#isLeap').checked = true;
      if (s.hour !== undefined && s.hour !== null) {
        $('#birthHour').value = 'custom';
        $('#hourInput').value = s.hour;
        $('#minuteInput').value = s.minute || 0;
      } else if (typeof s.hourBranch === 'number') {
        $('#birthHour').value = String(s.hourBranch);
      }
      syncTime();
    } catch (e) { }
  }

  /** 결제 후 돌아왔고 저장된 사주가 있으면 바로 리포트를 연다 */
  function reopenAfterPayment() {
    if (!state.unlocked) return;
    var raw;
    try { raw = localStorage.getItem('saju:last'); } catch (e) { return; }
    if (!raw) return;
    var s;
    try { s = JSON.parse(raw); } catch (e) { return; }
    if (!s || !s.year) return;
    var res = Engine.compute(s);
    if (!res.ok) return;
    state.result = res;
    state.input = s;
    state.model = null;
    $('#formCard').classList.add('is-collapsed');
    render(res, s);
    $('#result').hidden = false;
    $('#stickyBar').hidden = false;
    setTimeout(openReport, 240);
  }

  /* ---------- 시작 ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    initSelects();
    buildTimeOptions();
    restore();
    applyConfig();
    applyUrlUnlock();
    bind();
    var y = new Date().getFullYear();
    document.querySelectorAll('[data-this-year]').forEach(function (n) { n.textContent = y; });
    if (state.unlocked) {
      reopenAfterPayment();
    }
  });
})();
