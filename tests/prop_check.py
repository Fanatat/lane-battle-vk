#!/usr/bin/env python3
"""
tests/prop_check.py — ТЗ №16, раздел 5, критерий 2 (проп-тест переписан):
"На кропе одного юнита в ИГРОВОМ МАСШТАБЕ доля пикселей пропа ≥8% пикселей
фигуры для каждой из трёх ролей."

ТЗ №15 версия этого файла мерила "проп выступает за bbox контура тела" —
формально проходило даже на оружии-кружке у колена (выступает за bbox на
считанные проценты, но не опознаётся как оружие). Дефект разобран в ТЗ №16
(P-29, вступление): критерий обязан мерить ОПОЗНАВАЕМОСТЬ (площадь пропа
относительно площади фигуры), а не факт геометрического выступа, и мерить
на РЕАЛЬНОМ игровом масштабе юнита — не на канвасе, искусственно
увеличенном под тест (на маленьком реальном размере минимальные lineWidth
могут "не доехать" до заметной доли, чего не видно при увеличении).

Метод: рисуем юнит на канвасе размером с реальный слот юнита при 1920×1080
(engine.js computeLayout, тот же unitSize, что видит main.js в игре), дважды:
(a) только тело (window.Rig.drawUnitBodyOnly), (b) полная отрисовка
(window.Rig.drawUnit). pixels_props = mask_full AND NOT mask_body —
пиксели, появившиеся ТОЛЬКО благодаря пропам (шлем/повязка/оружие/лук/щит).
Критерий: pixels_props / pixels_full ≥ 8% для каждой роли.

Запуск: python3 tests/prop_check.py
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
ROOT = HERE.parent
RIG_JS = (ROOT / 'rig.js').read_text(encoding='utf-8')
ENGINE_JS = (ROOT / 'engine.js').read_text(encoding='utf-8')
BALANCE = __import__('json').loads((ROOT / 'balance.json').read_text(encoding='utf-8'))

REF_W, REF_H = 1920, 1080  # игровой масштаб — то же разрешение, что fps_check.py/decor_check.py
BG = '#f3ead6'  # A-01 «тёплая бумага», тот же фон, что у #game
COLOR_DIFF_THRESHOLD = 24  # минимальная сумма |dR|+|dG|+|dB| от фона, чтобы считать пиксель "видимым"
MIN_PROP_PIXEL_FRACTION = 0.08

HARNESS_HTML = """<!doctype html><html><body>
<canvas id="c" width="{w}" height="{h}"></canvas>
<script>{engine}</script>
<script>{rig}</script>
</body></html>"""

results = []


def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))


def render_visible_mask(page, mode, shape, is_player, bg, cw, ch, unit_w, unit_h, pad):
    return page.evaluate(
        """([mode, shape, isPlayer, bg, cw, ch, unitW, unitH, pad, threshold]) => {
            const ctx = document.getElementById('c').getContext('2d');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, cw, ch);
            const bgc = ctx.getImageData(cw - 1, ch - 1, 1, 1).data;
            const anim = { mode: 'idle', t: 0 };
            const lineWidth = Math.max(1, unitH * 0.03); // та же формула, что main.js передаёт в игре
            if (mode === 'body') {
                window.Rig.drawUnitBodyOnly(ctx, shape, pad, pad, unitW, unitH, lineWidth, anim);
            } else {
                window.Rig.drawUnit(ctx, shape, isPlayer, pad, pad, unitW, unitH, '#c1682f', 'rgba(0,0,0,0.4)', lineWidth, anim);
            }
            const data = ctx.getImageData(0, 0, cw, ch).data;
            const mask = new Uint8Array(cw * ch);
            let count = 0;
            for (let i = 0; i < cw * ch; i++) {
                const dr = data[i * 4] - bgc[0], dg = data[i * 4 + 1] - bgc[1], db = data[i * 4 + 2] - bgc[2];
                if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) > threshold) { mask[i] = 1; count++; }
            }
            return { mask: Array.from(mask), count };
        }""",
        [mode, shape, is_player, bg, cw, ch, unit_w, unit_h, pad, COLOR_DIFF_THRESHOLD]
    )


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(HARNESS_HTML.format(w=10, h=10, engine=ENGINE_JS, rig=RIG_JS))

        layout = page.evaluate("([w, h, g]) => window.LaneEngine.computeLayout(w, h, g)", [REF_W, REF_H, BALANCE['geometry']])
        unit_size = layout['unitSize']
        unit_w, unit_h = unit_size * 0.82, unit_size  # main.js drawUnit: w = size*0.82, h = size
        pad = unit_size * 0.3
        cw, ch = round(unit_w + pad * 2), round(unit_h + pad * 2)
        page.set_content(HARNESS_HTML.format(w=cw, h=ch, engine=ENGINE_JS, rig=RIG_JS))
        record(f'игровой масштаб взят с {REF_W}x{REF_H}: unitSize={unit_size:.1f}px, кроп {cw}x{ch}px', True)

        shapes = {t: BALANCE['units'][t]['shape'] for t in ('A', 'B', 'C')}

        for t in ('A', 'B', 'C'):
            shape = shapes[t]
            body = render_visible_mask(page, 'body', shape, True, BG, cw, ch, unit_w, unit_h, pad)
            full = render_visible_mask(page, 'full', shape, True, BG, cw, ch, unit_w, unit_h, pad)

            record(f'роль {t} ({shape}): тело рендерит непустую фигуру', body['count'] > 0, f"count={body['count']}")
            record(f'роль {t} ({shape}): полная отрисовка больше тела', full['count'] > body['count'],
                   f"body={body['count']} full={full['count']}")

            prop_count = sum(1 for f, b in zip(full['mask'], body['mask']) if f and not b)
            fraction = prop_count / full['count'] if full['count'] else 0.0
            record(
                f'критерий 2 роль {t} ({shape}): проп-пиксели {prop_count} из {full["count"]} фигуры = {fraction*100:.1f}% '
                f'(нужно ≥{MIN_PROP_PIXEL_FRACTION*100:.0f}%)',
                fraction >= MIN_PROP_PIXEL_FRACTION
            )

        browser.close()

    print('\n=== ИТОГ ===')
    failed = [r for r in results if not r[1]]
    print(f'всего: {len(results)}, провалов: {len(failed)}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
