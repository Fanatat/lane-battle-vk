#!/usr/bin/env python3
"""
tests/prop_check.py — ТЗ №15, раздел 3, критерий 3 (проп-тест):
"При заливке тела, выставленной в цвет фона, каждая роль опознаётся по
выступающим пропам. Проп, полностью лежащий внутри контура тела, — дефект."

Метод: рисуем на канвасе, ЗАЛИТОМ цветом фона (paper-bg), сперва только
тело rig (window.Rig.drawUnitBodyOnly, fillStyle=цвет фона — заливка
сливается с фоном, остаётся видимым только контур/конечности/глаза через
strokeStyle), затем полную отрисовку (window.Rig.drawUnit, та же заливка
цвета фона). "Видимый" пиксель — тот, что заметно отличается ЦВЕТОМ от
фона (не alpha — заливка непрозрачна и совпадает с фоном по alpha=255,
поэтому маска строится по разнице цвета, не по альфа-каналу).

pixels_props = mask_full XOR mask_body_only — то, что появилось ТОЛЬКО
благодаря пропам. Дефект — если bbox этих пикселей целиком лежит ВНУТРИ
bbox контура тела (проп не выступает за силуэт).

Запуск: python3 tests/prop_check.py
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
ROOT = HERE.parent
RIG_JS = (ROOT / 'rig.js').read_text(encoding='utf-8')
BALANCE = __import__('json').loads((ROOT / 'balance.json').read_text(encoding='utf-8'))

W, H = 240, 240
BG = '#f3ead6'  # A-01 «тёплая бумага», paper-bg — тот же фон, что у канваса игры
COLOR_DIFF_THRESHOLD = 24  # минимальная сумма |dR|+|dG|+|dB| от фона, чтобы считать пиксель "видимым"

HARNESS_HTML = """<!doctype html><html><body>
<canvas id="c" width="{w}" height="{h}"></canvas>
<script>{rig}</script>
</body></html>"""

results = []


def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))


def render_visible_mask(page, mode, shape, is_player, bg):
    return page.evaluate(
        """([mode, shape, isPlayer, bg, w, h]) => {
            const ctx = document.getElementById('c').getContext('2d');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);
            const pad = w * 0.08;
            const anim = { mode: 'idle', t: 0 };
            const ink = 'rgba(0,0,0,0.4)';
            if (mode === 'body') {
                window.Rig.drawUnitBodyOnly(ctx, shape, pad, pad, w - pad * 2, h - pad * 2, bg, ink, Math.max(1, w * 0.03), anim);
            } else {
                window.Rig.drawUnit(ctx, shape, isPlayer, pad, pad, w - pad * 2, h - pad * 2, bg, ink, Math.max(1, w * 0.03), anim);
            }
            const bgc = (() => {
                ctx.save();
                ctx.fillStyle = bg;
                ctx.fillRect(w - 1, h - 1, 1, 1); // сэмпл фонового цвета тем же рендерером (учитывает округление)
                const d = ctx.getImageData(w - 1, h - 1, 1, 1).data;
                ctx.restore();
                return [d[0], d[1], d[2]];
            })();
            const data = ctx.getImageData(0, 0, w, h).data;
            const mask = new Uint8Array(w * h);
            let minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
            for (let py = 0; py < h; py++) {
                for (let px = 0; px < w; px++) {
                    const i = py * w + px;
                    const dr = Math.abs(data[i * 4] - bgc[0]);
                    const dg = Math.abs(data[i * 4 + 1] - bgc[1]);
                    const db = Math.abs(data[i * 4 + 2] - bgc[2]);
                    if (dr + dg + db > __THRESHOLD__) {
                        mask[i] = 1;
                        count++;
                        if (px < minX) minX = px;
                        if (px > maxX) maxX = px;
                        if (py < minY) minY = py;
                        if (py > maxY) maxY = py;
                    }
                }
            }
            return { mask: Array.from(mask), count, minX, minY, maxX, maxY };
        }""".replace('__THRESHOLD__', str(COLOR_DIFF_THRESHOLD)),
        [mode, shape, is_player, bg, W, H]
    )


def bbox_contains(outer, inner):
    """True если bbox inner целиком лежит внутри bbox outer (проп НЕ торчит — дефект)."""
    return (inner['minX'] >= outer['minX'] and inner['maxX'] <= outer['maxX']
            and inner['minY'] >= outer['minY'] and inner['maxY'] <= outer['maxY'])


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': W, 'height': H})
        page.set_content(HARNESS_HTML.format(w=W, h=H, rig=RIG_JS))

        shapes = {t: BALANCE['units'][t]['shape'] for t in ('A', 'B', 'C')}

        for t in ('A', 'B', 'C'):
            shape = shapes[t]
            body = render_visible_mask(page, 'body', shape, True, BG)
            full = render_visible_mask(page, 'full', shape, True, BG)

            record(f'роль {t} ({shape}): контур тела виден без заливки', body['count'] > 0, f"count={body['count']}")
            record(f'роль {t} ({shape}): полная отрисовка виднее контура тела', full['count'] > body['count'],
                   f"body={body['count']} full={full['count']}")

            prop_only = [1 if (f and not b) else 0 for f, b in zip(full['mask'], body['mask'])]
            if any(prop_only):
                minX = min(i % W for i, v in enumerate(prop_only) if v)
                maxX = max(i % W for i, v in enumerate(prop_only) if v)
                minY = min(i // W for i, v in enumerate(prop_only) if v)
                maxY = max(i // W for i, v in enumerate(prop_only) if v)
                prop_bbox = {'minX': minX, 'maxX': maxX, 'minY': minY, 'maxY': maxY}
                inside = bbox_contains(body, prop_bbox)
                record(
                    f'проп-тест роль {t} ({shape}): проп выступает за контур тела '
                    f'(тело bbox x[{body["minX"]},{body["maxX"]}] y[{body["minY"]},{body["maxY"]}], '
                    f'проп bbox x[{minX},{maxX}] y[{minY},{maxY}])',
                    not inside
                )
            else:
                record(f'проп-тест роль {t} ({shape}): проп-пиксели найдены', False, 'нет отличающихся от тела пикселей')

        browser.close()

    print('\n=== ИТОГ ===')
    failed = [r for r in results if not r[1]]
    print(f'всего: {len(results)}, провалов: {len(failed)}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
