#!/usr/bin/env python3
"""
tests/promo_measure.py — ТЗ №13, блок 5 / критерий 5: мобильный промо-
скриншот с долей канваса в кадре ≥70% (A-04, п.5.1.1.2), измеряется
СКРИПТОМ, не глазами. Снимает набор промо ПОД КАЖДУЮ ПЛОЩАДКУ (A-10):
Яндекс desktop 16:9 и mobile 9:16, ВК horizontal 1200×600 (A-05 — ВК без
требования 70%, но letterbox без кадрирования — тут не актуально: канвас
и так занимает всю площадку в промо-режиме, отдельного letterbox-фона не
нужно).

Промо-режим (?promo=1) живёт ТОЛЬКО в dev.js (M-11 — URL-флаг сам по себе
не защита, защита — физическое отсутствие dev.js в собранном архиве),
снимается против ИСХОДНИКА (сырой index.html), не против dist/.

Запуск: python3 tests/promo_measure.py
(сам поднимает http.server и гасит его по завершении; пишет PNG в
ВЫДАЧА/отчёты/промо_ТЗ13/)
"""
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
ROOT = HERE.parent
OUTDIR = ROOT / 'ВЫДАЧА' / 'отчёты' / 'промо_ТЗ13'
PORT = 8961
URL = f'http://127.0.0.1:{PORT}/index.html'
MIN_GAMEPLAY_FRACTION = 0.70

# (имя файла, ширина, высота)
SHOTS = [
    ('yandex_desktop_16x9_1920x1080.png', 1920, 1080),
    ('yandex_mobile_9x16_1080x1920.png', 1080, 1920),
    ('vk_horizontal_1200x600.png', 1200, 600),
]

results = []


def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))


def stage_battle(page):
    page.wait_for_selector('#menuScreen:not(.hidden)', timeout=8000)
    page.evaluate("document.getElementById('playBtn').click()")
    page.wait_for_timeout(150)
    page.evaluate("document.getElementById('speedBtn').click()")
    for _ in range(6):
        page.evaluate("(() => { const el = document.getElementById('card-A'); if (el) el.click(); })()")
        page.wait_for_timeout(120)
    page.evaluate("window.Game.spawnEnemyDebug('B')")
    page.evaluate("window.Game.spawnEnemyDebug('C')")
    page.evaluate("window.Game.spawnPlayerDebug('C')")
    page.wait_for_timeout(600)


def main():
    OUTDIR.mkdir(parents=True, exist_ok=True)
    server = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(0.6)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for name, w, h in SHOTS:
                ctx = browser.new_context(viewport={'width': w, 'height': h})
                page = ctx.new_page()
                errs = []
                page.on('pageerror', lambda e: errs.append(str(e)))
                page.goto(f'{URL}?promo=1&deterministic=1&seed=1')
                stage_battle(page)

                box = page.eval_on_selector(
                    '#game', 'el => { const r = el.getBoundingClientRect(); return {w:r.width,h:r.height}; }'
                )
                fraction = (box['w'] * box['h']) / (w * h)
                out_path = OUTDIR / name
                page.screenshot(path=str(out_path))
                ok = fraction >= MIN_GAMEPLAY_FRACTION - 1e-9 and len(errs) == 0
                record(f'{name}: доля канваса в кадре {fraction * 100:.1f}% (нужно ≥{MIN_GAMEPLAY_FRACTION * 100:.0f}%)',
                       ok, f'canvas={box} frame={w}x{h} errors={errs}')

                no_chrome = page.eval_on_selector(
                    '#topBar', "el => getComputedStyle(el).display === 'none'"
                ) and page.eval_on_selector('#cards', "el => getComputedStyle(el).display === 'none'")
                record(f'{name}: UI площадки/топбар/карточки скрыты в кадре (A-04, п.8.3.4)', no_chrome)
                ctx.close()
            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)

    print('\n=== ИТОГ ===')
    failed = [r for r in results if not r[1]]
    print(f'всего: {len(results)}, провалов: {len(failed)}')
    print(f'файлы: {OUTDIR}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
