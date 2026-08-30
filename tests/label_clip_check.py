#!/usr/bin/env python3
"""
tests/label_clip_check.py — ТЗ №13, критерий готовности 3: "Подписи баз
целиком видны на всех четырёх геометриях." Дефект тянулся с ТЗ №01
(см. BLOCKERS.md, до ТЗ13): centerX без учёта реальной ширины текста мог
унести подпись «ИГРОК»/«ВРАГ» за край канваса на узких геометриях.

Проверяет НЕ рендер-скриншот, а сам источник истины поведения —
window.Rig.drawClampedLabel — тем же способом, каким main.js его
вызывает (тот же font/паддинг), на всех геометриях tests/layout_check.js.
Печатает итоговый прямоугольник текста и требует, чтобы он целиком лежал
внутри [0, canvasWidth].

Запуск: python3 tests/label_clip_check.py
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
ROOT = HERE.parent
RIG_JS = (ROOT / 'rig.js').read_text(encoding='utf-8')
ENGINE_JS = (ROOT / 'engine.js').read_text(encoding='utf-8')
BALANCE = __import__('json').loads((ROOT / 'balance.json').read_text(encoding='utf-8'))

GEOMETRIES = [
    ('узкий 360×640', 360, 640),
    ('средний 768×500', 768, 500),
    ('широкий 1280×587', 1280, 587),
    ('портрет 390×844', 390, 844),
]

HARNESS_HTML = """<!doctype html><html><body>
<canvas id="c" width="10" height="10"></canvas>
<script>{engine}</script>
<script>{rig}</script>
</body></html>"""

results = []


def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(HARNESS_HTML.format(engine=ENGINE_JS, rig=RIG_JS))

        for label_geo, w, h in GEOMETRIES:
            layout = page.evaluate(
                """([w, h, geometry]) => window.LaneEngine.computeLayout(w, h, geometry)""",
                [w, h, BALANCE['geometry']]
            )
            font_px = round(layout['unitSize'] * 0.22)
            for label, base_key in (('ИГРОК', 'playerBase'), ('ВРАГ', 'enemyBase')):
                base = layout[base_key]
                bounds = page.evaluate(
                    """([label, cx, canvasW, fontPx]) => {
                        const ctx = document.getElementById('c').getContext('2d');
                        const font = 'bold ' + fontPx + 'px Georgia, "Times New Roman", serif';
                        const x = window.Rig.drawClampedLabel(ctx, label, cx, 50, canvasW, font, '#000', fontPx * 0.4);
                        ctx.font = font;
                        const halfW = ctx.measureText(label).width / 2;
                        return { x, left: x - halfW, right: x + halfW };
                    }""",
                    [label, base['x'] + base['w'] / 2, layout['w'], font_px]
                )
                ok = bounds['left'] >= -0.5 and bounds['right'] <= layout['w'] + 0.5
                record(
                    f'{label_geo}: подпись "{label}" внутри канваса [0,{layout["w"]:.0f}] — left={bounds["left"]:.1f} right={bounds["right"]:.1f}',
                    ok
                )
        browser.close()

    print('\n=== ИТОГ ===')
    failed = [r for r in results if not r[1]]
    print(f'всего: {len(results)}, провалов: {len(failed)}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
