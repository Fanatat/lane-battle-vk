#!/usr/bin/env python3
"""
Приёмочный прогон слоя площадки и сейва (ТЗ №10), живым Chromium
(Playwright), не headless-логикой (T-01). Мок YaGames — tests/yasdk_mock.js,
стейтфул по образцу game3/color_sort/tests/yasdk_mock.js (G-01: чтение
эталона в чужой папке, не по памяти — S-14).

Против ИСХОДНИКОВ (build.py — фаза 12, ещё не существует): тест T-10
(смоук собранного dist/) в этой фазе физически недостижим — см. отчёт
ТЗ №10 и BLOCKERS.md.

Запуск: python3 tests/acceptance_platform.py
(сам поднимает http.server на 127.0.0.1:8790 и гасит его по завершении)
"""
import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
ROOT = HERE.parent
YA_MOCK_JS = HERE.joinpath('yasdk_mock.js').read_text(encoding='utf-8')
PORT = 8790
URL = f'http://127.0.0.1:{PORT}/index.html'

results = []


def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))


def wait_menu(page, timeout=8000):
    page.wait_for_selector('#menuScreen:not(.hidden)', timeout=timeout)


def new_page(browser, seed=None, mock=True, extra_init=''):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 720})
    page = ctx.new_page()
    # Порядок важен: init-скрипты выполняются в порядке добавления, ДО
    # скриптов страницы — window.__seedSave/__mockHang обязаны попасть в
    # window РАНЬШЕ, чем IIFE мока их прочитает.
    if seed is not None:
        page.add_init_script(f'window.__seedSave = {json.dumps(seed)};')
    if extra_init:
        page.add_init_script(extra_init)
    if mock:
        page.add_init_script(YA_MOCK_JS)
    return ctx, page


def win_one_battle(page):
    page.click('#playBtn')
    page.wait_for_timeout(200)
    page.click('#speedBtn')
    page.click('#speedBtn')
    for _ in range(400):
        try:
            page.click('#card-A', timeout=200)
        except Exception:
            pass
        page.wait_for_timeout(120)
        hidden = page.eval_on_selector('#popup', 'el => el.classList.contains("hidden")')
        if not hidden:
            return True
    return False


# ---------------------------------------------------------------
def test_dev_fallback_boots(browser):
    """Без мока вовсе (typeof YaGames === 'undefined') — dev-режим, игра
    живая, ни одной ошибки в консоли (базовый прогон S-09)."""
    errors = []
    ctx, page = new_page(browser, mock=False)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    wait_menu(page)
    devmode_logged = page.evaluate(
        "() => window.console && true"  # просто убеждаемся, что страница жива
    )
    record('dev-фолбэк без SDK: меню появилось, ноль JS-ошибок', len(errors) == 0 and devmode_logged,
           json.dumps(errors))
    ctx.close()


def test_platform_silent_falls_back(browser):
    """S-10: «платформа МОЛЧИТ» — YaGames.init() никогда не резолвится.
    init-таймаут обязан не дать игре зависнуть навсегда."""
    errors = []
    ctx, page = new_page(browser, extra_init='window.__mockHang = true;')
    page.on('pageerror', lambda e: errors.append(str(e)))
    t0 = time.time()
    page.goto(URL)
    wait_menu(page, timeout=6000)  # INIT_TIMEOUT_MS=2000 + запас
    elapsed = time.time() - t0
    record('платформа молчит (init не резолвится): меню всё равно появилось за <6с, ноль ошибок',
           len(errors) == 0, f'elapsed={elapsed:.2f}с, errors={errors}')
    ctx.close()


def test_platform_throws_after_init(browser):
    """S-10: init() успешен, но getPlayer() бросает — «платформа не умеет
    метод» уже после init. Игра не падает, гейт сейва остаётся закрыт
    (см. persist() в main.js), но кнопки бою не мешают."""
    errors = []
    ctx, page = new_page(browser, extra_init='window.__mockThrowAfterInit = true;')
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    wait_menu(page)
    won = win_one_battle(page)
    # покупка апгрейда не должна падать, даже если persist() внутри
    # предупредит и пропустит запись (гейт закрыт из-за ok:false при load())
    try:
        page.click('#upgradeShop .upgradeItem button >> nth=0')
        crashed = False
    except Exception as e:
        crashed = True
        errors.append(str(e))
    record('платформа бросает после init: бой играется, покупка не роняет игру, ноль JS-исключений',
           won and not crashed and len(errors) == 0, json.dumps(errors))
    ctx.close()


def test_migration_partial_data(browser):
    """S-05: сейв с частично отсутствующими/повреждёнными полями (эмулирует
    либо старую схему, либо порчу сети) не должен уронить игру — только
    подставить дефолты на повреждённые куски. unlock_C:true без unlock_B —
    невозможное по графу состояние, тоже должно быть отброшено."""
    legacy_seed = {
        'v': 1,
        'battleNumber': 5,
        'trophies': -999,          # повреждённое значение — должно откатиться на дефолт (0)
        'unlocked': {'unlock_C': True},  # unlock_B отсутствует => unlock_C не должен приняться
        # levels отсутствует целиком
    }
    ctx, page = new_page(browser, seed=legacy_seed)
    page.goto(URL)
    wait_menu(page)
    page.wait_for_timeout(300)
    cs = page.evaluate('() => window.Game.getCampaignState()')
    ok = (cs['battleNumber'] == 5 and cs['trophies'] == 0
          and cs['unlocked']['unlock_B'] is False and cs['unlocked']['unlock_C'] is False
          and cs['levels']['income'] == 0)
    record('миграция частично повреждённого сейва: battleNumber=5 сохранён, trophies откачен на 0, unlock_C без unlock_B отброшен',
           ok, json.dumps(cs))
    ctx.close()


def test_save_load_roundtrip_real_object(browser):
    """T-07: «сохранил → вернулся» на объекте, который платформа РЕАЛЬНО
    записала — не на статичном сиде, который сам себя обнуляет при
    перезагрузке. Первая страница играет и копит трофеи/апгрейд, второй
    ЗАХОД (новый контекст) поднимается на captured __saveLog, а не на
    придуманном объекте."""
    ctx1, page1 = new_page(browser)
    page1.goto(URL)
    wait_menu(page1)
    won = win_one_battle(page1)
    page1.click('#upgradeShop .upgradeItem button >> nth=0')  # покупка unlock_B
    page1.wait_for_timeout(200)
    save_log = page1.evaluate('() => window.__saveLog')
    ctx1.close()

    if not save_log:
        record('T-07 раунд-трип: РЕАЛЬНАЯ запись поймана из __saveLog', False, 'save_log пуст')
        return
    real_written = save_log[-1]

    ctx2, page2 = new_page(browser, seed=real_written)
    page2.goto(URL)
    wait_menu(page2)
    page2.wait_for_timeout(200)
    # battleLabel/trophyValue в DOM обновляются только при первом
    # startBattle() — до боя проверяем восстановленное состояние напрямую
    # через window.Game.getCampaignState(), а не текст ещё не отрисованного HUD.
    cs = page2.evaluate('() => window.Game.getCampaignState()')
    ok = (won
          and cs['battleNumber'] == real_written['battleNumber']
          and cs['trophies'] == real_written['trophies']
          and cs['unlocked']['unlock_B'] is True)
    record('T-07 раунд-трип на реально записанном объекте: battleNumber/трофеи/разблокировка пережили "перезагрузку"',
           ok, json.dumps({'seeded': real_written, 'restored': cs}))
    ctx2.close()


TESTS = [
    test_dev_fallback_boots,
    test_platform_silent_falls_back,
    test_platform_throws_after_init,
    test_migration_partial_data,
    test_save_load_roundtrip_real_object,
]


def main():
    server = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(0.6)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for fn in TESTS:
                fn(browser)
            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)

    print('\n=== ИТОГ ===')
    failed = [r for r in results if not r[1]]
    print(f'всего: {len(results)}, провалов: {len(failed)}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
