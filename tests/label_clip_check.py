#!/usr/bin/env python3
"""
tests/label_clip_check.py — ТЗ №16, раздел 5, критерий 6: "обе базы, все
шесть геометрий, ноль обрезанных глифов."

ТЗ №15 версия этого файла проверяла только 4 геометрии (не было 1920×1080)
и мерила clip ADVANCE-шириной (ctx.measureText().width/2), а не реальными
чернилами глифа. На видео 1920×1080 подпись правой базы «ВРАГ» была обрезана
до «ВРАI» (засечка «Г» срезана краем канваса), хотя advance-ширина
формально помещалась — дефект разобран в ТЗ №16 (P-29, вступление) как
"тест мерил не то место". Правки: (1) те же шесть геометрий, что
decor_check.py/fps_check.py, включая 1920×1080; (2) rig.js
drawClampedLabel теперь клэмпит по actualBoundingBoxLeft/Right (реальные
чернила, не advance); (3) тест ДОПОЛНИТЕЛЬНО проверяет пиксели напрямую —
рисует в "песочнице" шире исходного канваса (реальный канвас + поля с обеих
сторон) и требует, чтобы НИ ОДНОГО закрашенного пикселя не попало в поля
(то, что было бы обрезано краем канваса шириной canvasW).

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

# Те же шесть геометрий, что tests/decor_check.py (канонический набор проекта).
GEOMETRIES = [
    ('узкий 360×640', 360, 640),
    ('средний 768×500', 768, 500),
    ('широкий 1280×587', 1280, 587),
    ('портрет 390×844', 390, 844),
    ('десктоп 1920×1080', 1920, 1080),
    ('узкий портрет 320×568', 320, 568),
]

MARGIN = 200  # px "песочницы" по каждому краю — с запасом больше любого разумного overhang

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
                "([w, h, geometry]) => window.LaneEngine.computeLayout(w, h, geometry)",
                [w, h, BALANCE['geometry']]
            )
            font_px = round(layout['unitSize'] * 0.22)
            for label, base_key in (('ИГРОК', 'playerBase'), ('ВРАГ', 'enemyBase')):
                base = layout[base_key]
                result = page.evaluate(
                    """([label, cx, canvasW, fontPx, margin]) => {
                        const sandboxW = canvasW + margin * 2;
                        const c = document.getElementById('c');
                        c.width = sandboxW; c.height = 60;
                        const ctx = c.getContext('2d');
                        const bg = '#f3ead6';
                        ctx.fillStyle = bg;
                        ctx.fillRect(0, 0, sandboxW, 60);
                        const font = 'bold ' + fontPx + 'px Georgia, "Times New Roman", serif';
                        // Сдвигаем систему координат на margin — то, что реально попало бы
                        // на канвас шириной canvasW, рисуется в [margin, margin+canvasW).
                        // Вне этой полосы (в margin-полях) — то, что обрезал бы настоящий канвас.
                        ctx.save();
                        ctx.translate(margin, 0);
                        const x = window.Rig.drawClampedLabel(ctx, label, cx, 30, canvasW, font, '#2b2723', fontPx * 0.4);
                        ctx.restore();

                        const data = ctx.getImageData(0, 0, sandboxW, 60).data;
                        const bgc = ctx.getImageData(0, 59, 1, 1).data; // угол не тронут текстом
                        let strayPixels = 0, strayMinCol = sandboxW, strayMaxCol = 0;
                        for (let py = 0; py < 60; py++) {
                            for (let pxi = 0; pxi < sandboxW; pxi++) {
                                if (pxi >= margin && pxi < margin + canvasW) continue; // внутри настоящего канваса — не считаем
                                const i = py * sandboxW + pxi;
                                const dr = Math.abs(data[i*4] - bgc[0]), dg = Math.abs(data[i*4+1] - bgc[1]), db = Math.abs(data[i*4+2] - bgc[2]);
                                if (dr + dg + db > 24) {
                                    strayPixels++;
                                    if (pxi < strayMinCol) strayMinCol = pxi;
                                    if (pxi > strayMaxCol) strayMaxCol = pxi;
                                }
                            }
                        }
                        return { x, strayPixels, strayMinCol, strayMaxCol, margin };
                    }""",
                    [label, base['x'] + base['w'] / 2, layout['w'], font_px, MARGIN]
                )
                ok = result['strayPixels'] == 0
                detail = f"x={result['x']:.1f}" if ok else (
                    f"x={result['x']:.1f}, {result['strayPixels']}px чернил вне канваса "
                    f"(колонки песочницы {result['strayMinCol']}..{result['strayMaxCol']}, canvas=[{MARGIN},{MARGIN+layout['w']:.0f}))"
                )
                record(f'{label_geo}: подпись "{label}" — ноль пикселей чернил обрезано краем канваса', ok, detail)
        browser.close()

    print('\n=== ИТОГ ===')
    failed = [r for r in results if not r[1]]
    print(f'всего: {len(results)}, провалов: {len(failed)}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
