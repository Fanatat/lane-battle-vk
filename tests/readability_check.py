#!/usr/bin/env python3
"""
tests/readability_check.py — ТЗ №16, раздел 5, критерии 1, 3, 4.

ТЗ №15 версия этого файла мерила ЛЕВУЮ сторону против ПРАВОЙ (обе бледные —
тест зелёный, силуэта не видно). Дефект разобран в ТЗ №16 (P-29, вступление):
критерий обязан мерить силуэт ПРОТИВ ФОНА, не сторону против стороны.

Критерий 1 и 4 меряются ТОЧЕЧНОЙ выборкой пикселя в заведомо сплошной части
фигуры (центр торса/головы для тела, центр шлема для акцента), а не средней
яркостью по всей маске "отличается от фона": маска по всей фигуре включает
тонкие антиалиased края конечностей (несколько пикселей полупрозрачного
смешения с фоном на 6-8px линии) — их доля в такой тонкой геометрии велика
и тянет среднее вверх, хотя сама заливка/линия сплошная и тёмная. Точечная
выборка спрашивает именно то, что є критерий: "цвет тела", а не "цвет тела
пополам с шумом по контуру".

Три теста:
  (1) КОНТРАСТ ТЕЛА: цвет в центре торса и центре головы юнита (rig.js
      window.Rig.drawUnit, роль A — «боец», без шлема/щита в этих точках)
      темнее фона «тёплая бумага» (#f3ead6, тот же фон, что у #game в
      index.html) минимум в 4 раза по светлоте.
  (2) РОЛИ различимы силуэтом: попарная несовпадающая площадь масок трёх
      ролей ≥20% размеченной площади (критерий 3, метод не менялся).
  (3) ГАБАРИТЫ: bbox непрозрачных пикселей роли отличаются от любой другой
      роли по ширине или высоте ≥25% (критерий 3, метод не менялся).
  (4) СТОРОНЫ: цвет в центре шлема (акцент стороны — то, что рисует только
      сторона, не тело) игрока и врага различаются по тону ≥25% (критерий 4).

Рендерит rig.js напрямую в headless Chromium, снимает пиксели через
getImageData — честные значения канваса, не скриншот-эвристику.

Запуск: python3 tests/readability_check.py
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
ROOT = HERE.parent
RIG_JS = (ROOT / 'rig.js').read_text(encoding='utf-8')
BALANCE = __import__('json').loads((ROOT / 'balance.json').read_text(encoding='utf-8'))

W, H = 240, 240
BG = '#f3ead6'  # A-01 «тёплая бумага» — тот же фон, что у #game (index.html --paper-bg)
MIN_BODY_CONTRAST_RATIO = 4.0  # критерий 1: фон темнее тела минимум в N раз
MIN_ACCENT_TONE_DELTA_FRACTION = 0.25  # критерий 4: акцент сторон различим
MIN_SHAPE_DIFF_FRACTION = 0.20
MIN_GABARITY_DIFF_FRACTION = 0.25
COLOR_DIFF_THRESHOLD = 24  # маска "видимый пиксель" для критериев 2/3 (та же метка, что в prop_check.py)

HARNESS_HTML = """<!doctype html><html><body>
<canvas id="c" width="{w}" height="{h}"></canvas>
<script>{rig}</script>
</body></html>"""

results = []


def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))


def luma(r, g, b):
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def render_and_sample(page, shape, is_player, accent, bg):
    """Рисует юнит на фоне bg, возвращает: фон, цвет центра торса, центра
    головы, центра шлема/повязки (rig.propTopY-based точка над головой) и
    маску/bbox всей видимой фигуры (для критериев 2/3)."""
    return page.evaluate(
        """([shape, isPlayer, accent, bg, w, h, threshold]) => {
            const ctx = document.getElementById('c').getContext('2d');
            const ink = 'rgba(0,0,0,0.4)'; // не используется телом (rig.js хардкодит чернила), только для API
            const anim = { mode: 'idle', t: 0 };
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);
            const bgc = ctx.getImageData(w - 1, h - 1, 1, 1).data;
            const pad = w * 0.08;
            const rig = window.Rig.drawUnit(ctx, shape, isPlayer, pad, pad, w - pad * 2, h - pad * 2, accent, ink, Math.max(1, w * 0.03), anim);
            const px = (x, y) => {
                const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
                return [d[0], d[1], d[2]];
            };
            const torsoColor = px(rig.cx, (rig.shoulderY + rig.hipY) / 2);
            const headColor = px(rig.headCx, rig.headCy);
            const helmetColor = px(rig.headCx, rig.headCy - rig.headR * 0.9);

            const data = ctx.getImageData(0, 0, w, h).data;
            const mask = new Uint8Array(w * h);
            let count = 0, minX = w, minY = h, maxX = 0, maxY = 0;
            for (let py = 0; py < h; py++) {
                for (let pxi = 0; pxi < w; pxi++) {
                    const i = py * w + pxi;
                    const dr = data[i * 4] - bgc[0], dg = data[i * 4 + 1] - bgc[1], db = data[i * 4 + 2] - bgc[2];
                    if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) > threshold) {
                        mask[i] = 1; count++;
                        if (pxi < minX) minX = pxi; if (pxi > maxX) maxX = pxi;
                        if (py < minY) minY = py; if (py > maxY) maxY = py;
                    }
                }
            }
            return {
                bg: [bgc[0], bgc[1], bgc[2]], torsoColor, headColor, helmetColor,
                mask: Array.from(mask), count,
                bboxW: count ? (maxX - minX + 1) : 0, bboxH: count ? (maxY - minY + 1) : 0
            };
        }""",
        [shape, is_player, accent, bg, W, H, COLOR_DIFF_THRESHOLD]
    )


def mask_diff_fraction(m1, m2):
    total_on = 0
    diff = 0
    for a, b in zip(m1, m2):
        if a or b:
            total_on += 1
            if a != b:
                diff += 1
    return diff / total_on if total_on else 0.0


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': W, 'height': H})
        page.set_content(HARNESS_HTML.format(w=W, h=H, rig=RIG_JS))

        player_fill = BALANCE['sides']['player']['fill']
        enemy_fill = BALANCE['sides']['enemy']['fill']
        shapes = {t: BALANCE['units'][t]['shape'] for t in ('A', 'B', 'C')}

        # (1)+(4): роль A (боец) на обеих сторонах — торс/голова/шлем точечно.
        r_player = render_and_sample(page, shapes['A'], True, player_fill, BG)
        r_enemy = render_and_sample(page, shapes['A'], False, enemy_fill, BG)

        bg_luma = luma(*r_player['bg'])
        for label, r in (('игрок', r_player), ('враг', r_enemy)):
            for part in ('torsoColor', 'headColor'):
                part_luma = luma(*r[part])
                ratio = bg_luma / max(part_luma, 1e-6)
                record(
                    f'критерий 1 ({label}, {part}): фон яркость={bg_luma:.1f}, тело яркость={part_luma:.1f}, '
                    f'фон темнее тела в {ratio:.2f}x (нужно ≥{MIN_BODY_CONTRAST_RATIO:.0f}x)',
                    ratio >= MIN_BODY_CONTRAST_RATIO
                )

        luma_p = luma(*r_player['helmetColor'])
        luma_e = luma(*r_enemy['helmetColor'])
        delta_fraction = abs(luma_p - luma_e) / max(luma_p, luma_e, 1e-6)
        record(
            f'критерий 4: акцент (шлем) яркость игрок={luma_p:.1f} враг={luma_e:.1f}, разница {delta_fraction*100:.1f}% '
            f'(нужно ≥{MIN_ACCENT_TONE_DELTA_FRACTION*100:.0f}%)',
            delta_fraction >= MIN_ACCENT_TONE_DELTA_FRACTION
        )

        # (2)/(3) роли различимы силуэтом и габаритами — метод из ТЗ15, без изменений.
        renders = {t: render_and_sample(page, shapes[t], True, player_fill, BG) for t in ('A', 'B', 'C')}
        masks = {t: renders[t]['mask'] for t in ('A', 'B', 'C')}
        pairs = [('A', 'B'), ('A', 'C'), ('B', 'C')]
        for a, b in pairs:
            diff = mask_diff_fraction(masks[a], masks[b])
            record(
                f'критерий 3 (силуэт): {a}({shapes[a]}) vs {b}({shapes[b]}) — несовпадающая площадь {diff*100:.1f}% '
                f'(нужно ≥{MIN_SHAPE_DIFF_FRACTION*100:.0f}%)',
                diff >= MIN_SHAPE_DIFF_FRACTION
            )
        for a, b in pairs:
            wa, ha = renders[a]['bboxW'], renders[a]['bboxH']
            wb, hb = renders[b]['bboxW'], renders[b]['bboxH']
            w_diff = abs(wa - wb) / max(wa, wb, 1e-6)
            h_diff = abs(ha - hb) / max(ha, hb, 1e-6)
            ok = w_diff >= MIN_GABARITY_DIFF_FRACTION or h_diff >= MIN_GABARITY_DIFF_FRACTION
            record(
                f'критерий 3 (габариты): {a}({shapes[a]}) {wa}x{ha} vs {b}({shapes[b]}) {wb}x{hb} — '
                f'ширина {w_diff*100:.1f}%, высота {h_diff*100:.1f}% (нужно ≥{MIN_GABARITY_DIFF_FRACTION*100:.0f}% хотя бы по одной)',
                ok
            )

        # guard: ни один силуэт не пустой
        for t in ('A', 'B', 'C'):
            cnt = renders[t]['count']
            record(f'силуэт {t} ({shapes[t]}) рендерит непустую заливку', cnt > (W * H) * 0.02, f'count={cnt}')

        browser.close()

    print('\n=== ИТОГ ===')
    failed = [r for r in results if not r[1]]
    print(f'всего: {len(results)}, провалов: {len(failed)}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
