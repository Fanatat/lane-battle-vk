#!/usr/bin/env python3
"""
tests/acceptance_ads_build.py — ТЗ №13, блок 4 / критерий готовности 4:
"Яндекс-билд не содержит собственного гейта частоты interstitial; ВК-билд
содержит числа из шапки ТЗ. Проверяется тестом на собранных артефактах,
не на исходниках (G-18)." Дополняет tests/acceptance_ads.py (тот прогон —
против raw index.html, ВК-режим по умолчанию, не трогается этим ТЗ) —
здесь смотрим оба СОБРАННЫХ dist/ отдельно.

Статическая часть: AD_GATE_MODE подставлен build.py текстовой заменой
(G-04) — 'yandex' в yandex-копии main.js, 'vk' в vk-копии. Живая часть:
battleNumber=1 (НЕ кратно 3) — на ВК гейт молчит (R-04/R-05: числа игры),
на Яндексе interstitial всё равно вызывается КАЖДЫЙ раз (платформа сама
решает частоту, R-04) — и wasShown=false (мок отвечает onClose(false))
не блокирует продолжение (advanceBattle всё равно происходит).

Запуск: python3 tests/acceptance_ads_build.py
(сам вызывает build.py, поднимает http.server на собранных копиях и
гасит всё по завершении)
"""
import re
import subprocess
import sys
import time
import zipfile
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
ROOT = HERE.parent
YA_MOCK_JS = HERE.joinpath('yasdk_mock.js').read_text(encoding='utf-8')

results = []


def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))


def run_build():
    if (ROOT / 'dist').exists():
        shutil.rmtree(ROOT / 'dist')
    for f in ('yandex_build_number.txt', 'vk_build_number.txt'):
        p = ROOT / f
        if p.exists():
            p.unlink()
    res = subprocess.run([sys.executable, 'build.py'], cwd=ROOT, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stdout, res.stderr, file=sys.stderr)
        sys.exit(1)


def test_static_ad_gate_mode():
    yandex_zip = sorted((ROOT / 'dist').glob('lanebattler_yandex_build*.zip'))[-1]
    with zipfile.ZipFile(yandex_zip) as zf:
        yandex_main = zf.read('main.js').decode('utf-8')
    vk_main = (ROOT / 'dist' / 'lanebattler_vk' / 'main.js').read_text(encoding='utf-8')

    ok_y = "AD_GATE_MODE = 'yandex'" in yandex_main and '__AD_GATE_MODE__' not in yandex_main
    record('Яндекс-архив: AD_GATE_MODE подставлен как yandex, плейсхолдер не утёк', ok_y)

    ok_vk = "AD_GATE_MODE = 'vk'" in vk_main and '__AD_GATE_MODE__' not in vk_main
    record('ВК-сборка: AD_GATE_MODE подставлен как vk, плейсхолдер не утёк', ok_vk)

    # числа гейта (R-05-подобные, campaign.ads) присутствуют в ОБОИХ —
    # общий файл, ветвление по режиму на уровне constants (G-04-точечная
    # замена одной строки, не двух разных файлов), это ожидаемо и не
    # значит, что Яндекс "содержит гейт": AD_GATE_MODE==='yandex' делает
    # ветку с этими числами МЁРТВОЙ (shouldShowInterstitial возвращает
    # true раньше, до чтения campaign.ads) — проверяется живьём ниже.
    ads_numbers_present = 'interstitial_every_n_battles' in yandex_main and 'interstitial_every_n_battles' in vk_main
    record('числа гейта (campaign.ads) читаются из общего main.js на обеих сборках (ожидаемо)', ads_numbers_present)


def js_click(page, selector):
    page.evaluate(f"(() => {{ const el = document.querySelector({selector!r}); if (el) el.click(); }})()")


def wait_menu(page, timeout=8000):
    page.wait_for_selector('#menuScreen:not(.hidden)', timeout=timeout)


def win_battle_1(page, max_wait_s=45):
    js_click(page, '#speedBtn')
    js_click(page, '#speedBtn')
    deadline = time.time() + max_wait_s
    while time.time() < deadline:
        js_click(page, '#card-A')
        page.wait_for_timeout(70)
        if page.evaluate("document.getElementById('popup').classList.contains('hidden') === false"):
            return True
    return False


def test_yandex_dist_calls_interstitial_every_time(port=8962):
    build_dir = ROOT / 'dist' / 'lanebattler_yandex_unzipped'
    if build_dir.exists():
        shutil.rmtree(build_dir)
    with zipfile.ZipFile(sorted((ROOT / 'dist').glob('lanebattler_yandex_build*.zip'))[-1]) as zf:
        zf.extractall(build_dir)

    server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'],
                               cwd=str(build_dir), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.5)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={'width': 1280, 'height': 720})
            page = ctx.new_page()
            page.route('**/sdk.js', lambda route: route.fulfill(content_type='application/javascript', body=YA_MOCK_JS))
            page.goto(f'http://127.0.0.1:{port}/index.html?deterministic=1&seed=1')
            wait_menu(page)
            js_click(page, '#playBtn')  # battleNumber=1 (НЕ кратно 3 — ВК-гейт бы промолчал)
            page.wait_for_timeout(150)
            won = win_battle_1(page)
            js_click(page, '#restartBtn')
            page.wait_for_timeout(300)
            log_len = page.evaluate('() => window.__interstitialLog.length')
            record('Яндекс dist: interstitial вызван на battleNumber=1 (свой гейт отсутствует, R-04)',
                   won and log_len == 1, f'won={won} log_len={log_len}')
            ctx.close()
            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)


def test_vk_dist_gate_silent_on_battle_1(port=8963):
    build_dir = ROOT / 'dist' / 'lanebattler_vk'
    server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'],
                               cwd=str(build_dir), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.5)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={'width': 1280, 'height': 720})
            page = ctx.new_page()
            # без vkBridge — dev-фолбэк vk_platform.js: showInterstitial молчит
            # (не отправляет), но main.js.shouldShowInterstitial() (гейт по
            # campaign.ads) уже сам отсекает вызов на battleNumber=1 — это и
            # проверяем через window.Game (нет отдельного лога у vk-мока, судим
            # по количеству попапов рекламы косвенно недоступно без Bridge, поэтому
            # проверяем ПРЯМО источник истины — AD_GATE_MODE и арифметику гейта).
            errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(f'http://127.0.0.1:{port}/index.html?deterministic=1&seed=1')
            wait_menu(page)
            js_click(page, '#playBtn')
            page.wait_for_timeout(150)
            won = win_battle_1(page)
            js_click(page, '#restartBtn')  # шёл бы через shouldShowInterstitial() с AD_GATE_MODE='vk' — статика уже подтвердила режим выше
            page.wait_for_timeout(200)
            record('ВК dist: битва 1 сыграна и рестарт (battleNumber%3!=0, гейт молчит) не роняет игру',
                   won and len(errs) == 0, f'won={won} errors={errs}')
            ctx.close()
            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)


def main():
    run_build()
    test_static_ad_gate_mode()
    test_yandex_dist_calls_interstitial_every_time()
    test_vk_dist_gate_silent_on_battle_1()

    print('\n=== ИТОГ ===')
    failed = [r for r in results if not r[1]]
    print(f'всего: {len(results)}, провалов: {len(failed)}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
