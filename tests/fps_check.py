#!/usr/bin/env python3
"""
ТЗ №15, критерий 9: частота кадров не ниже 55 fps на 1920 (раздел 2, блок 3
допускает упрощение анимации до покачивания, если частота падает — сначала
надо честно измерить). Заполняет поле максимумом юнитов через debug-спавн
и меряет средний/минимальный fps через requestAnimationFrame в реальном
браузере (не headless-тайминг симуляции — берём то же, что видит игрок).
"""
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path('/home/vps_home_1/projects/game4')
PORT = 8981

with sync_playwright() as p:
    server = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(0.6)
    try:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})
        page.goto(f'http://127.0.0.1:{PORT}/index.html?promo=1&deterministic=1&seed=1')
        page.wait_for_selector('#menuScreen:not(.hidden)', timeout=8000)
        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_timeout(150)
        # забить поле юнитами обеих сторон под завязку — худший случай нагрузки рендера rig.js
        page.evaluate("""() => {
            for (let i = 0; i < 12; i++) {
                window.Game.spawnPlayerDebug(['A','B','C'][i % 3]);
                window.Game.spawnEnemyDebug(['A','B','C'][i % 3]);
            }
        }""")
        page.wait_for_timeout(300)
        result = page.evaluate("""() => new Promise(resolve => {
            const samples = [];
            let last = performance.now();
            let frames = 0;
            function tick(ts) {
                const dt = ts - last;
                last = ts;
                if (frames > 5) samples.push(dt); // отбросить разогрев
                frames++;
                if (frames < 120) requestAnimationFrame(tick);
                else resolve(samples);
            }
            requestAnimationFrame(tick);
        })""")
        browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)

fps_samples = [1000 / d for d in result if d > 0]
avg_fps = sum(fps_samples) / len(fps_samples)
min_fps = min(fps_samples)
ok = avg_fps >= 55
print(f"[{'OK' if ok else 'FAIL'}] fps на 1920x1080 под нагрузкой (24 юнита): среднее={avg_fps:.1f} минимум={min_fps:.1f} (нужно среднее ≥55)")
sys.exit(0 if ok else 1)
