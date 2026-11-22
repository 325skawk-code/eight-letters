#!/usr/bin/env python3
"""
calendar-data.js 생성 스크립트

1) 24절기 절입시각 (1899~2050)
   - skyfield + JPL DE440s 로 태양의 겉보기 황경을 계산해 15도 단위 교점을 뉴턴법으로 수렴.
   - 결과를 한국표준시(KST, UTC+9) 1월 1일 0시부터의 '분'으로 바꿔 base36 4자리로 압축.
   - 한국천문연구원(KASI) 공식 달력자료와 대조: 2025·2026년 48개 절기 날짜 전부 일치, 시각 ±1분 이내.

2) 음양력 테이블 (1899~2050)
   - 한국천문연구원 역서 기반 음양력 데이터(korean-lunar-calendar, MIT)에서 연도별 월 길이와
     음력 1월 1일의 율리우스적일을 뽑아 비트 + 정수 배열로 저장.

사용:
    pip install skyfield korean-lunar-calendar
    python tools/build_calendar_data.py [출력경로]
"""
import io
import json
import os
import sys

from skyfield.api import load
from skyfield.framelib import ecliptic_frame

LON = [285, 300, 315, 330, 345, 0, 15, 30, 45, 60, 75, 90,
       105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270]
APPROX = [(1, 5), (1, 20), (2, 4), (2, 19), (3, 6), (3, 21), (4, 5), (4, 20),
          (5, 6), (5, 21), (6, 6), (6, 21), (7, 7), (7, 23), (8, 8), (8, 23),
          (9, 8), (9, 23), (10, 8), (10, 23), (11, 7), (11, 22), (12, 7), (12, 22)]

TERM_YEARS = list(range(1899, 2051))
LUNAR_YEARS = (1899, 2050)


def jdn(y, m, d):
    a = (14 - m) // 12
    yy = y + 4800 - a
    mm = m + 12 * a - 3
    return d + (153 * mm + 2) // 5 + 365 * yy + yy // 4 - yy // 100 + yy // 400 - 32045


def build_terms():
    import numpy as np
    import datetime

    ts = load.timescale()
    eph = load('de440s.bsp')
    earth, sun = eph['earth'], eph['sun']

    def sun_lon(t):
        e = earth.at(t).observe(sun).apparent()
        return e.frame_latlon(ecliptic_frame)[1].degrees

    jd0, target = [], []
    for y in TERM_YEARS:
        for (m, d), lon in zip(APPROX, LON):
            jd0.append(ts.utc(y, m, d, 12).tt)
            target.append(lon)

    jd = np.array(jd0, dtype=float)
    target = np.array(target)
    for _ in range(12):
        lam = sun_lon(ts.tt_jd(jd))
        diff = ((lam - target + 180) % 360) - 180
        jd = jd - diff / 0.9856473

    utc = ts.tt_jd(jd).utc_datetime()
    rows = []
    for i, y in enumerate(TERM_YEARS):
        values = []
        for k in range(24):
            local = utc[i * 24 + k] + datetime.timedelta(hours=9)
            jan1 = datetime.datetime(local.year, 1, 1, tzinfo=local.tzinfo)
            values.append(int(round((local - jan1).total_seconds() / 60)))
        rows.append(''.join(_b36(v).rjust(4, '0') for v in values))
    return rows


def _b36(n):
    alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
    s = ''
    while n:
        n, r = divmod(n, 36)
        s = alphabet[r] + s
    return s or '0'


def build_lunar():
    from korean_lunar_calendar.korean_lunar_calendar import KoreanLunarCalendar as K

    c = K()
    bits, new_year = [], []
    for y in range(LUNAR_YEARS[0], LUNAR_YEARS[1] + 1):
        raw = c.KOREAN_LUNAR_DATA[y - c.KOREAN_LUNAR_BASE_YEAR]
        leap = (raw >> 12) & 0xF
        leap_big = (raw >> 16) & 1
        v = 0
        for m in range(1, 13):
            if (raw >> (12 - m)) & 1:
                v |= 1 << (12 - m)
        v |= (leap & 0xF) << 12
        v |= (1 if leap_big else 0) << 16
        bits.append(v)
        c.setLunarDate(y, 1, 1, False)
        new_year.append(jdn(c.solarYear, c.solarMonth, c.solarDay))
    return bits, new_year


def _array(nums, per=16, indent='    '):
    out = []
    for i in range(0, len(nums), per):
        out.append(indent + ', '.join(str(n) for n in nums[i:i + per]) + ',')
    return '\n'.join(out)


def _str_array(items, per=6, indent='    '):
    out = []
    for i in range(0, len(items), per):
        out.append(indent + ', '.join("'%s'" % s for s in items[i:i + per]) + ',')
    return '\n'.join(out)


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'js', 'calendar-data.js')
    term_rows = build_terms()
    bits, new_year = build_lunar()

    js = """/* 달력 데이터 — 만세력 계산용 원자료 (tools/build_calendar_data.py 생성물)
 * ------------------------------------------------------------
 * lunarBits : 연도별 월 길이(bit 12-m = m월이 30일) + 윤달 번호(bit 12~15) + 윤달 크기(bit 16)
 * lunarNewYearJdn : 음력 1월 1일의 율리우스적일
 * termBase36 : 24절기 절입시각(한국표준시, 1월 1일 0시부터의 분) base36 4자리
 *   순서: 소한,대한,입춘,우수,경칩,춘분,청명,곡우,입하,소만,망종,하지,
 *         소서,대서,입추,처서,백로,추분,한로,상강,입동,소설,대설,동지
 * ------------------------------------------------------------ */
(function (g) {
  'use strict';

  var CAL = {
    lunarStartYear: %d,
    lunarBits: [
%s
    ],
    lunarNewYearJdn: [
%s
    ],
    termStartYear: %d,
    termBase36: [
%s
    ]
  };

  g.SAJU_CAL = CAL;
})(typeof window !== 'undefined' ? window : globalThis);
""" % (LUNAR_YEARS[0], _array(bits), _array(new_year), TERM_YEARS[0], _str_array(term_rows))

    with io.open(out_path, 'w', encoding='utf-8') as f:
        f.write(js)
    print('written:', out_path, len(js), 'bytes')


if __name__ == '__main__':
    main()
