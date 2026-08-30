#!/usr/bin/env python3
"""
tests/readability_check.py — ТЗ №13, блок 2 / критерий готовности 2:
"Grayscale-тест: три роли и две стороны различимы, проверено скриптом."
(K-22: рендер поля -> grayscale -> яркости различимы, ориентир ≥25% между
соседними ступенями; форма страхует цвет только когда формы РАЗНЫЕ).

Рендерит theme_art.js напрямую (тот же код, что main.js) в headless
Chromium, снимает пиксели через getImageData — не скриншот-эвристику,
а честные значения канваса. Два теста:
  (1) СТОРОНЫ: средняя яркость (grayscale luminance) закрашенных пикселей
      силуэта игрока и врага при ОДНОЙ и той же форме отличается на ≥25%
      от яркости игрока (K-22 ориентир).
  (2) РОЛИ: силуэты трёх ролей (одна сторона, один размер, один центр)
      попарно РАЗНЫЕ — доля несовпадающих закрашенных пикселей (не-IoU)
      между любой парой ≥ 20% размеченной площади, иначе силуэты
      неотличимы контуром и K-22 держится только на цвете.

Запуск: python3 tests/readability_check.py
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
ROOT = HERE.parent
THEME_ART_JS = (ROOT / 'theme_art.js').read_text(encoding='utf-8')
BALANCE = __import__('json').loads((ROOT / 'balance.json').read_text(encoding='utf-8'))

W, H = 200, 200
MIN_SIDE_LUMA_DELTA_FRACTION = 0.25  # K-22 ориентир
MIN_SHAPE_DIFF_FRACTION = 0.20

HARNESS_HTML = """<!doctype html><html><body>
<canvas id="c" width="{w}" height="{h}"></canvas>
<script>{theme_art}</script>
</body></html>"""

results = []


def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))


def render_mask(page, shape, fill):
    """Рисует ОДИН силуэт заливкой fill на прозрачном канвасе, возвращает
    (маску закрашенных пикселей, среднюю grayscale-яркость закрашенных)."""
    return page.evaluate(
        """([shape, fill, w, h]) => {
            const ctx = document.getElementById('c').getContext('2d');
            ctx.clearRect(0, 0, w, h);
            const pad = w * 0.1;
            window.ThemeArt.drawUnit(ctx, shape, pad, pad, w - pad * 2, h - pad * 2, fill, 'rgba(0,0,0,0.001)', 1);
            const data = ctx.getImageData(0, 0, w, h).data;
            const mask = new Uint8Array(w * h);
            let sumLuma = 0, count = 0;
            for (let i = 0; i < w * h; i++) {
                const a = data[i * 4 + 3];
                if (a > 10) {
                    mask[i] = 1;
                    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
                    sumLuma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
                    count++;
                }
            }
            return { mask: Array.from(mask), avgLuma: count ? sumLuma / count : 0, count };
        }""",
        [shape, fill, W, H]
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
        page.set_content(HARNESS_HTML.format(w=W, h=H, theme_art=THEME_ART_JS))

        player_fill = BALANCE['sides']['player']['fill']
        enemy_fill = BALANCE['sides']['enemy']['fill']
        shapes = {t: BALANCE['units'][t]['shape'] for t in ('A', 'B', 'C')}

        # (1) стороны: та же форма (A), разная заливка — luma delta
        r_player = render_mask(page, shapes['A'], player_fill)
        r_enemy = render_mask(page, shapes['A'], enemy_fill)
        luma_p, luma_e = r_player['avgLuma'], r_enemy['avgLuma']
        delta_fraction = abs(luma_p - luma_e) / max(luma_p, luma_e, 1e-6)
        record(
            f'K-22 стороны: яркость игрок={luma_p:.1f} враг={luma_e:.1f}, разница {delta_fraction*100:.1f}% (нужно ≥{MIN_SIDE_LUMA_DELTA_FRACTION*100:.0f}%)',
            delta_fraction >= MIN_SIDE_LUMA_DELTA_FRACTION
        )

        # (2) роли: три формы одной стороны, попарная несовпадающая площадь
        masks = {t: render_mask(page, shapes[t], player_fill)['mask'] for t in ('A', 'B', 'C')}
        pairs = [('A', 'B'), ('A', 'C'), ('B', 'C')]
        for a, b in pairs:
            diff = mask_diff_fraction(masks[a], masks[b])
            record(
                f'силуэты различимы: {a} vs {b} — несовпадающая площадь {diff*100:.1f}% (нужно ≥{MIN_SHAPE_DIFF_FRACTION*100:.0f}%)',
                diff >= MIN_SHAPE_DIFF_FRACTION
            )

        # (0) ни один силуэт не пустой (guard: тест не должен молча пройти на баге рендера)
        for t in ('A', 'B', 'C'):
            cnt = render_mask(page, shapes[t], player_fill)['count']
            record(f'силуэт {t} ({shapes[t]}) рендерит непустую заливку', cnt > (W * H) * 0.02, f'count={cnt}')

        browser.close()

    print('\n=== ИТОГ ===')
    failed = [r for r in results if not r[1]]
    print(f'всего: {len(results)}, провалов: {len(failed)}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
