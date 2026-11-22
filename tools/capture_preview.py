#!/usr/bin/env python3
"""
렌더링 확인용 스크린샷 생성기.

    LD_LIBRARY_PATH=... python3 tools/capture_preview.py

saju-site/ 를 로컬에서 띄우고 모바일 폭(390px)에서
입력 → 무료 결과 → 잠금 카드 → 신청 모달 → 해금 → 유료 리포트
전 구간을 실제로 클릭하며 preview/ 에 저장한다.
"""
import functools
import http.server
import os
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'preview')
PORT = 8765

SAMPLE = dict(name='김민지', year='1997', month='3', day='25',
              hour='10', minute='0', gender='female', calendar='solar')


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def shot(page, name, selector=None):
    path = os.path.join(OUT, name)
    if selector:
        page.locator(selector).first.scroll_into_view_if_needed()
        page.wait_for_timeout(220)
    page.screenshot(path=path)
    print('  saved', name)


def main():
    os.makedirs(OUT, exist_ok=True)
    httpd = serve()
    url = 'http://127.0.0.1:%d/index.html' % PORT

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        page.goto(url, wait_until='networkidle')
        page.wait_for_timeout(400)

        # 1. 랜딩
        shot(page, '01-랜딩.png')

        # 2. 입력 폼
        page.click('[data-scroll="formCard"]')
        page.wait_for_timeout(500)
        page.fill('#nameInput', SAMPLE['name'])
        page.select_option('#birthYear', SAMPLE['year'])
        page.select_option('#birthMonth', SAMPLE['month'])
        page.select_option('#birthDay', SAMPLE['day'])
        page.select_option('#birthHour', 'custom')
        page.fill('#hourInput', SAMPLE['hour'])
        page.fill('#minuteInput', SAMPLE['minute'])
        page.wait_for_timeout(200)
        shot(page, '02-입력폼.png', '#formCard')

        # 3. 무료 결과
        page.click('#sajuForm button[type="submit"]')
        page.wait_for_selector('#result:not([hidden])', timeout=8000)
        page.wait_for_timeout(1200)
        shot(page, '03-원국-오행.png', '#resultBody > .card >> nth=0')
        shot(page, '04-일간-일주.png', '#resultBody > .card >> nth=2')
        shot(page, '05-연애-세운.png', '#resultBody > .card >> nth=6')

        # 4. 잠금 카드
        shot(page, '06-잠금카드-CTA.png', '#upsell')

        # 5. 신청 모달
        page.click('#upsellCta')
        page.wait_for_selector('#modal:not([hidden])')
        page.wait_for_timeout(500)
        shot(page, '07-신청모달.png')

        # 6. 해금 코드 입력
        page.click('#unlockToggle')
        page.wait_for_timeout(300)
        page.fill('#unlockInput', 'TEST3900')
        shot(page, '08-해금코드-입력.png')

        # 7. 유료 리포트
        page.click('#unlockBtn')
        page.wait_for_selector('#report:not([hidden])', timeout=8000)
        page.wait_for_timeout(600)
        shot(page, '09-리포트-표지.png')

        # 8. 리포트 각 섹션 (뷰포트 단위)
        targets = [
            ('10-한장요약', '#reportBody .rp-sec >> nth=0'),
            ('11-대운표', '#reportBody .rp-sec >> nth=1'),
            ('12-재물구조', '#reportBody .rp-sec >> nth=2'),
            ('13-인연', '#reportBody .rp-sec >> nth=3'),
            ('14-2027-개요', '#reportBody .rp-sec >> nth=4'),
            ('14b-2027-분기', '.rp-quarters'),
            ('15-2027-월별', '.rp-months'),
            ('16-개운', '#reportBody .rp-sec >> nth=5'),
            ('17-계산기준', '#reportBody .rp-sec >> nth=6'),
        ]
        for name, sel in targets:
            loc = page.locator(sel).first
            if not loc.count():
                continue
            # 리포트는 내부 스크롤 컨테이너라 섹션 머리를 화면 위로 붙인다
            loc.evaluate("el => el.scrollIntoView({block: 'start'})")
            page.wait_for_timeout(280)
            page.screenshot(path=os.path.join(OUT, name + '.png'))
            print('  saved', name + '.png')

        # 9. 월별 흐름 하반기
        month_items = page.locator('.rp-month')
        if month_items.count() >= 9:
            month_items.nth(6).evaluate("el => el.scrollIntoView({block: 'start'})")
            page.wait_for_timeout(260)
            page.screenshot(path=os.path.join(OUT, '15b-2027-월별-하반기.png'))
            print('  saved 15b-2027-월별-하반기.png')

        # 10. 인쇄 모드(PDF) 전체
        page.emulate_media(media='print')
        page.set_viewport_size({'width': 780, 'height': 1100})
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(OUT, '18-인쇄모드-전체.png'), full_page=True)
        print('  saved 18-인쇄모드-전체.png')

        # 실제 PDF (인쇄 CSS 확인용 샘플)
        page.pdf(path=os.path.join(OUT, '19-리포트-샘플.pdf'), format='A4', print_background=True)
        print('  saved 19-리포트-샘플.pdf')
        page.emulate_media(media='screen')

        browser.close()
        httpd.shutdown()


if __name__ == '__main__':
    sys.exit(main())
