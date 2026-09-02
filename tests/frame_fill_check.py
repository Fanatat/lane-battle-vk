#!/usr/bin/env python3
"""
tests/frame_fill_check.py — ТЗ №16, раздел 5, критерий 5: "юнит ≥18% высоты
игрового поля; доля пустого фона в кадре ≤45%."

"Игровое поле" — canvas #game (layout.h), НЕ окно браузера: index.html
кладёт #topBar и карточки спавна СНАРУЖИ канваса (flex-колонка), поэтому
canvas.clientHeight, которым main.js resize() считает layout.h, уже
исключает этот HUD-хром — второе условие критерия ("не экрана") выполнено
самим устройством layout, не требует отдельного вычитания.

Два теста:
  (1) unitSize/layout.h ≥18% — то же значение, что видит main.js в игре
      (не синтетический пересчёт с другими входами).
  (2) доля пикселей канваса, совпадающих с фоном #f3ead6 (то, что main.js
      рисует ДО заливки задника и земли — см. main.js render()) ≤45% —
      меряется на РЕАЛЬНОМ рендере через настоящий сервер (тот же приём,
      что tests/fps_check.py), не на предположении о композиции сцены.

Запуск: python3 tests/frame_fill_check.py
"""
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent.parent
PORT = 8984

MIN_UNIT_FIELD_FRACTION = 0.18
MAX_EMPTY_BG_FRACTION = 0.45
BG_COLOR_DIFF_THRESHOLD = 18  # порог "пиксель совпадает с фоном #f3ead6"

results = []


def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))


def main():
    with sync_playwright() as p:
        server = subprocess.Popen(
            [sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
            cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        time.sleep(0.6)
        try:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={'width': 1920, 'height': 1080})
            page.goto(f'http://127.0.0.1:{PORT}/index.html?deterministic=1&seed=1')
            page.wait_for_selector('#menuScreen:not(.hidden)', timeout=8000)
            page.evaluate("document.getElementById('playBtn').click()")
            page.wait_for_timeout(300)
            page.evaluate("""() => {
                for (let i = 0; i < 4; i++) {
                    window.Game.spawnPlayerDebug(['A','B','C'][i % 3]);
                    window.Game.spawnEnemyDebug(['A','B','C'][i % 3]);
                }
            }""")
            page.wait_for_timeout(200)

            info = page.evaluate("""([bgThreshold]) => {
                const layout = window.Game.getLayout();
                const c = document.getElementById('game');
                const ctx = c.getContext('2d');
                const w = c.width, h = c.height;
                const data = ctx.getImageData(0, 0, w, h).data;
                // "Пусто" — это то, что глаз видит как непокрашенную бумагу: либо
                // канвас-пиксель НЕ рисовался вообще (alpha≈0 — сквозь него виден
                // CSS-фон #game/body, тоже #f3ead6, ТЗ №16 п.3.2), либо нарисован,
                // но буквально цветом фона. Считать только по RGB (без alpha)
                // ошибочно: непрорисованный пиксель в getImageData — это (0,0,0,0),
                // визуально неотличимое от бумаги, но арифметически "далёкое" от
                // (243,234,214) — такая проверка молча считала бы пустоту заполненной.
                const bg = [0xf3, 0xea, 0xd6];
                let emptyCount = 0;
                for (let i = 0; i < w * h; i++) {
                    const a = data[i*4 + 3];
                    if (a < 10) { emptyCount++; continue; }
                    const dr = Math.abs(data[i*4] - bg[0]), dg = Math.abs(data[i*4+1] - bg[1]), db = Math.abs(data[i*4+2] - bg[2]);
                    if (dr + dg + db <= bgThreshold) emptyCount++;
                }
                return {
                    unitSize: layout.unitSize, fieldH: layout.h,
                    bgFraction: emptyCount / (w * h), totalPx: w * h, bgCount: emptyCount
                };
            }""", [BG_COLOR_DIFF_THRESHOLD])
            browser.close()
        finally:
            server.terminate()
            server.wait(timeout=5)

    unit_field_fraction = info['unitSize'] / info['fieldH']
    record(
        f'критерий 5 (заполнение): unitSize={info["unitSize"]:.1f}px / игровое поле={info["fieldH"]:.1f}px = '
        f'{unit_field_fraction*100:.1f}% (нужно ≥{MIN_UNIT_FIELD_FRACTION*100:.0f}%)',
        unit_field_fraction >= MIN_UNIT_FIELD_FRACTION - 1e-9
    )
    record(
        f'критерий 5 (пустой фон): {info["bgCount"]} из {info["totalPx"]} пикселей канваса = '
        f'{info["bgFraction"]*100:.1f}% совпадают с фоном #f3ead6 (нужно ≤{MAX_EMPTY_BG_FRACTION*100:.0f}%)',
        info['bgFraction'] <= MAX_EMPTY_BG_FRACTION
    )

    print('\n=== ИТОГ ===')
    failed = [r for r in results if not r[1]]
    print(f'всего: {len(results)}, провалов: {len(failed)}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
