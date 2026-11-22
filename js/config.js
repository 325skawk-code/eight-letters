/* ============================================================
 * 운영 설정 — 계좌·오픈채팅·가격·해금 코드
 * ------------------------------------------------------------
 * 이 파일 하나만 고치면 사이트 전체 문구와 가격이 바뀐다.
 *   payment.placeholder = true  → 계좌 자리에 '테스트용' 표시가 붙는다.
 *   openChat.url 이 비어 있으면 오픈채팅 버튼이 '준비 중'으로 동작한다.
 * ============================================================ */
(function (g) {
  'use strict';

  var CONFIG = {
    brand: {
      name: '여덟 글자',
      mark: '八字',
      note: '만세력 기반'
    },

    product: {
      name: '상세 리포트',
      /* 가격은 '원' 단위 숫자. 문구는 전부 여기서 자동 생성된다. */
      price: 3900,
      listPrice: 9900,
      priceTag: '런칭 특가',
      priceNote: '런칭 특가 · 평생 소장',
      cta: '상세 리포트 받기',
      delivery: '코드를 받으면 바로 열람 · PDF로 저장',
      /* 리포트가 다루는 기준 연도. 2027년(정미년) 월별 흐름의 근거. */
      focusYear: 2027
    },

    payment: {
      bank: '토스뱅크',
      account: '1000-6806-0776',
      holder: '강금성',
      /* 실제 계좌를 넣으면 false로 바꾼다. */
      placeholder: false,
      label: '입금 계좌'
    },

    /* ------------------------------------------------------------
     * 페이앱(PayApp) 개인 가입 연동
     * payappPaymentUrl에 결제 링크를 넣으면 신청 모달의 주 버튼이
     * '페이앱으로 결제하기'로 바뀌고, 비어 있으면 기존 계좌이체 안내가 나간다.
     *
     * 결제 완료 후 돌아올 주소에 아래 파라미터를 붙이면 리포트가 바로 열린다.
     *   https://사이트주소/?unlocked=1
     *   https://사이트주소/?payapp=success
     *   https://사이트주소/?token=<발급토큰>
     * (정적 사이트라 브라우저에서만 확인하는 잠금이다. 실제 판매 단계에서는
     *  서버에서 결제를 확인하고 토큰을 발급하는 방식으로 바꿔야 한다.)
     * ------------------------------------------------------------ */
    payappPaymentUrl: '',
    payapp: {
      label: '페이앱으로 결제하기',
      note: '카드·계좌이체·간편결제 모두 페이앱에서 한 번에',
      /* 결제 후 돌아오는 주소에 붙일 파라미터 이름 */
      successParams: ['unlocked', 'payapp'],
      successValues: ['1', 'success', 'true'],
      tokenParam: 'token'
    },

    openChat: {
      /* 예: 'https://open.kakao.com/o/xxxxxxx' */
      url: 'https://open.kakao.com/o/sm31IiYi',
      label: '오픈채팅으로 신청하기',
      placeholder: false
    },

    unlock: {
      /* 유료 리포트 해금 코드. 인호가 검수/발급할 때 쓰는 코드 */
      codes: ['EIGHT3900', 'TEST3900'],
      /* 페이앱 등 결제 후 발급하는 토큰 (비어 있으면 토큰 검사 안 함) */
      tokens: [],
      /* 샘플 해금 미리보기 버튼 노출 여부 (실서비스 공개 시 false) */
      sampleEnabled: false,
      sampleLabel: '샘플 해금 미리보기',
      codeLabel: '해금 코드',
      codeHelp: '입금 후 오픈채팅으로 받은 코드를 넣어주세요.',
      storageKey: 'saju:unlock:v1',
      /* 주소창 ?code=TEST3900 으로도 열린다 (검수용) */
      paramName: 'code'
    },

    report: {
      daeunCount: 8
    }
  };

  function comma(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  CONFIG.fmtPrice = function (n) { return comma(n) + '원'; };
  CONFIG.priceLabel = comma(CONFIG.product.price) + '원';
  CONFIG.listPriceLabel = comma(CONFIG.product.listPrice) + '원';

  /* 정가 대비 할인율 (내림) */
  CONFIG.discountRate = function () {
    var p = CONFIG.product;
    if (!p.listPrice || p.listPrice <= p.price) return 0;
    return Math.floor((1 - p.price / p.listPrice) * 100);
  };

  /* 페이앱 결제 링크가 채워졌는지 */
  CONFIG.hasPayapp = function () {
    return !!(CONFIG.payappPaymentUrl && String(CONFIG.payappPaymentUrl).trim());
  };
  CONFIG.hasOpenChat = function () {
    return !!(CONFIG.openChat && CONFIG.openChat.url && String(CONFIG.openChat.url).trim());
  };

  g.SAJU_CONFIG = CONFIG;
  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
