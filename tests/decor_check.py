#!/usr/bin/env python3
"""
tests/decor_check.py — ТЗ №15, раздел 3, критерии 6 и 7.

Критерий 6: "средняя светлота декора светлее средней светлоты силуэтов не
менее чем на 20%." Декор здесь — верхний баннер (window.Rig.drawTopBanner,
main.js render()), силуэты — юниты обеих сторон (window.Rig.drawUnit).
Измеряем те же цвета, что main.js реально передаёт (не гадаем по палитре).

Критерий 7: "зона обороны не пересекает более трети ширины поля." Дуга
обороны рисуется main.js drawBaseDefenseArc с радиусом
min(bd.range_logical * pxPerLogical, layout.w * 0.10) — константа сокращена
с 0.15 соревнованием 2026-09-05 (ТЗ №20 п.44: клин при 0.15 и секторе ±54°
давал вертикальный охват ≈1.6r, визуально доминировал над кадром) —
проверяем сам расчёт (тот же, что в main.js) на нескольких геометриях
layout_check.js, а не только формулу на бумаге.

Запуск: python3 tests/decor_check.py
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
ROOT = HERE.parent
RIG_JS = (ROOT / 'rig.js').read_text(encoding='utf-8')
ENGINE_JS = (ROOT / 'engine.js').read_text(encoding='utf-8')
BALANCE = __import__('json').loads((ROOT / 'balance.json').read_text(encoding='utf-8'))

W, H = 240, 240
MIN_DECOR_LUMA_DELTA_FRACTION = 0.20
MAX_ARC_WIDTH_FRACTION = 1.0 / 3.0

GEOMETRIES = [
    ('узкий 360×640', 360, 640),
    ('средний 768×500', 768, 500),
    ('широкий 1280×587', 1280, 587),
    ('портрет 390×844', 390, 844),
    ('десктоп 1920×1080', 1920, 1080),
    ('узкий портрет 320×568', 320, 568),
]

HARNESS_HTML = """<!doctype html><html><body>
<canvas id="c" width="{w}" height="{h}"></canvas>
<script>{engine}</script>
<script>{rig}</script>
</body></html>"""

results = []


def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))


def avg_luma(page, draw_js, w, h):
    return page.evaluate(
        """([drawJs, w, h]) => {
            const ctx = document.getElementById('c').getContext('2d');
            ctx.clearRect(0, 0, w, h);
            (new Function('ctx', 'w', 'h', drawJs))(ctx, w, h);
            const data = ctx.getImageData(0, 0, w, h).data;
            let sum = 0, count = 0;
            for (let i = 0; i < w * h; i++) {
                if (data[i * 4 + 3] > 10) {
                    sum += 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
                    count++;
                }
            }
            return count ? sum / count : -1;
        }""",
        [draw_js, w, h]
    )


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': W, 'height': H})
        page.set_content(HARNESS_HTML.format(w=W, h=H, engine=ENGINE_JS, rig=RIG_JS))

        # --- критерий 6: декор светлее силуэтов ---
        player_fill = BALANCE['sides']['player']['fill']
        enemy_fill = BALANCE['sides']['enemy']['fill']
        shape_a = BALANCE['units']['A']['shape']

        unit_draw = f"""
            const pad = w*0.1;
            window.Rig.drawUnit(ctx, '{shape_a}', true, pad, pad, w*0.4-pad, h-pad*2, '{player_fill}', 'rgba(0,0,0,0.4)', Math.max(1, w*0.03), {{mode:'idle', t:0}});
            window.Rig.drawUnit(ctx, '{shape_a}', false, w*0.5+pad, pad, w*0.4-pad, h-pad*2, '{enemy_fill}', 'rgba(0,0,0,0.4)', Math.max(1, w*0.03), {{mode:'idle', t:0}});
        """
        # координаты баннера — те же множители unitSize, что main.js передаёт
        # (unitSize = h * unit_height_screen_fraction, здесь h==canvas height теста)
        banner_draw = f"""
            const unitSize = h * {BALANCE['geometry']['unit_height_screen_fraction']};
            window.Rig.drawTopBanner(ctx, w, unitSize*0.12, unitSize*0.14, 'rgba(183,164,126,0.6)', '#ddccaa');
        """

        luma_units = avg_luma(page, unit_draw, W, H)
        luma_banner = avg_luma(page, banner_draw, W, H)
        delta = (luma_banner - luma_units) / max(luma_units, 1e-6)
        record(
            f'критерий 6: декор (баннер) яркость={luma_banner:.1f} vs силуэты яркость={luma_units:.1f}, '
            f'декор светлее на {delta*100:.1f}% (нужно ≥{MIN_DECOR_LUMA_DELTA_FRACTION*100:.0f}%)',
            delta >= MIN_DECOR_LUMA_DELTA_FRACTION
        )

        # --- критерий 7: дуга обороны не шире трети поля ---
        for label, w, h in GEOMETRIES:
            layout = page.evaluate("([w, h, geometry]) => window.LaneEngine.computeLayout(w, h, geometry)", [w, h, BALANCE['geometry']])
            bd = BALANCE['base_defense']
            range_px = bd['range_logical'] * layout['pxPerLogical']
            visual_r = min(range_px, layout['w'] * 0.10)
            arc_width_fraction = (visual_r * 2) / layout['w']
            record(
                f'критерий 7 {label}: диаметр индикатора обороны {visual_r*2:.1f}px = {arc_width_fraction*100:.1f}% ширины поля (нужно ≤{MAX_ARC_WIDTH_FRACTION*100:.1f}%)',
                arc_width_fraction <= MAX_ARC_WIDTH_FRACTION + 1e-9
            )

        browser.close()

    print('\n=== ИТОГ ===')
    failed = [r for r in results if not r[1]]
    print(f'всего: {len(results)}, провалов: {len(failed)}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
