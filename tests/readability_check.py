#!/usr/bin/env python3
"""
tests/readability_check.py — ТЗ №15, раздел 3, критерии 1 и 2:
"Grayscale: стороны различимы по светлоте, роли различимы по силуэту" и
"Габариты: силуэты трёх ролей различаются по ширине или высоте не менее
чем на 25% попарно, метрикой рендера."

Рендерит rig.js напрямую (тот же код, что main.js) в headless Chromium,
снимает пиксели через getImageData — не скриншот-эвристику, а честные
значения канваса. Три теста:
  (1) СТОРОНЫ: средняя яркость (grayscale luminance) закрашенных пикселей
      силуэта игрока и врага при ОДНОЙ и той же роли отличается на ≥25%
      (K-22 ориентир).
  (2) РОЛИ различимы силуэтом: попарная несовпадающая площадь масок трёх
      ролей (одна сторона, один слот-бокс) ≥ 20% размеченной площади.
  (3) ГАБАРИТЫ: bbox непрозрачных пикселей каждой роли — ширина или высота
      отличаются от bbox любой другой роли не менее чем на 25% (раздел 1,
      "тот же rig, другие пропорции").

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
MIN_SIDE_LUMA_DELTA_FRACTION = 0.25
MIN_SHAPE_DIFF_FRACTION = 0.20
MIN_GABARITY_DIFF_FRACTION = 0.25

HARNESS_HTML = """<!doctype html><html><body>
<canvas id="c" width="{w}" height="{h}"></canvas>
<script>{rig}</script>
</body></html>"""

results = []


def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))


def render_mask(page, shape, is_player, fill):
    """Рисует ОДИН юнит (rig целиком: тело + пропы) заливкой fill на прозрачном
    канвасе, возвращает маску закрашенных пикселей, среднюю яркость и bbox."""
    return page.evaluate(
        """([shape, isPlayer, fill, w, h]) => {
            const ctx = document.getElementById('c').getContext('2d');
            ctx.clearRect(0, 0, w, h);
            const pad = w * 0.08;
            window.Rig.drawUnit(ctx, shape, isPlayer, pad, pad, w - pad * 2, h - pad * 2, fill, 'rgba(0,0,0,0.4)', Math.max(1, w * 0.03), { mode: 'idle', t: 0 });
            const data = ctx.getImageData(0, 0, w, h).data;
            const mask = new Uint8Array(w * h);
            let sumLuma = 0, count = 0;
            let minX = w, minY = h, maxX = 0, maxY = 0;
            for (let py = 0; py < h; py++) {
                for (let px = 0; px < w; px++) {
                    const i = py * w + px;
                    const a = data[i * 4 + 3];
                    if (a > 10) {
                        mask[i] = 1;
                        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
                        sumLuma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
                        count++;
                        if (px < minX) minX = px;
                        if (px > maxX) maxX = px;
                        if (py < minY) minY = py;
                        if (py > maxY) maxY = py;
                    }
                }
            }
            return {
                mask: Array.from(mask), avgLuma: count ? sumLuma / count : 0, count,
                bboxW: count ? (maxX - minX + 1) : 0, bboxH: count ? (maxY - minY + 1) : 0
            };
        }""",
        [shape, is_player, fill, W, H]
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

        # (1) стороны: та же роль (A), разная заливка — luma delta
        r_player = render_mask(page, shapes['A'], True, player_fill)
        r_enemy = render_mask(page, shapes['A'], False, enemy_fill)
        luma_p, luma_e = r_player['avgLuma'], r_enemy['avgLuma']
        delta_fraction = abs(luma_p - luma_e) / max(luma_p, luma_e, 1e-6)
        record(
            f'K-22 стороны: яркость игрок={luma_p:.1f} враг={luma_e:.1f}, разница {delta_fraction*100:.1f}% (нужно ≥{MIN_SIDE_LUMA_DELTA_FRACTION*100:.0f}%)',
            delta_fraction >= MIN_SIDE_LUMA_DELTA_FRACTION
        )

        # (2) роли различимы силуэтом: три роли одной стороны, попарная несовпадающая площадь
        renders = {t: render_mask(page, shapes[t], True, player_fill) for t in ('A', 'B', 'C')}
        masks = {t: renders[t]['mask'] for t in ('A', 'B', 'C')}
        pairs = [('A', 'B'), ('A', 'C'), ('B', 'C')]
        for a, b in pairs:
            diff = mask_diff_fraction(masks[a], masks[b])
            record(
                f'силуэты различимы: {a}({shapes[a]}) vs {b}({shapes[b]}) — несовпадающая площадь {diff*100:.1f}% (нужно ≥{MIN_SHAPE_DIFF_FRACTION*100:.0f}%)',
                diff >= MIN_SHAPE_DIFF_FRACTION
            )

        # (3) габариты: bbox ширина ИЛИ высота отличаются ≥25% попарно
        for a, b in pairs:
            wa, ha = renders[a]['bboxW'], renders[a]['bboxH']
            wb, hb = renders[b]['bboxW'], renders[b]['bboxH']
            w_diff = abs(wa - wb) / max(wa, wb, 1e-6)
            h_diff = abs(ha - hb) / max(ha, hb, 1e-6)
            ok = w_diff >= MIN_GABARITY_DIFF_FRACTION or h_diff >= MIN_GABARITY_DIFF_FRACTION
            record(
                f'габариты: {a}({shapes[a]}) {wa}x{ha} vs {b}({shapes[b]}) {wb}x{hb} — ширина {w_diff*100:.1f}%, высота {h_diff*100:.1f}% (нужно ≥{MIN_GABARITY_DIFF_FRACTION*100:.0f}% хотя бы по одной)',
                ok
            )

        # (0) ни один силуэт не пустой (guard: тест не должен молча пройти на баге рендера)
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
