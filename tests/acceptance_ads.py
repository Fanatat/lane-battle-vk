#!/usr/bin/env python3
"""
Приёмочный прогон рекламы и удержания (ТЗ №11), живым Chromium (T-01).
Мок и конвенция — те же, что tests/acceptance_platform.py.

Тесты, зависящие от НОМЕРА битвы (гейт interstitial, финал-событие),
телепортируют campaignState.battleNumber напрямую через
window.Game.getCampaignState() (возвращает ЖИВУЮ ссылку, не копию) вместо
того, чтобы реально доигрывать десяток промежуточных битв — предмет
проверки здесь ЛОГИКА ГЕЙТА (что она читает battleNumber и решает по
нему), а не баланс боя, для которого номер битвы получен реальной игрой
где угодно ещё (T-08: калибровка проверки независима от проверяемого —
если бы гейт сам считал battleNumber, подмена была бы нечестной, но он
берёт готовое значение состояния кампании, только он и main.js). Играется
РЕАЛЬНО только текущий бой (нужен настоящий popup, чтобы кнопка
"Начать битву" вообще появилась) — все битвы здесь battleNumber<=3
(детерминированы, без джиттера), поэтому дёшевы и быстры.

Запуск: python3 tests/acceptance_ads.py
"""
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
ROOT = HERE.parent
YA_MOCK_JS = HERE.joinpath('yasdk_mock.js').read_text(encoding='utf-8')
PORT = 8793
URL = f'http://127.0.0.1:{PORT}/index.html'

results = []


def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))


def wait_menu(page, timeout=8000):
    page.wait_for_selector('#menuScreen:not(.hidden)', timeout=timeout)


def new_page(browser):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 720})
    page = ctx.new_page()
    page.add_init_script(YA_MOCK_JS)
    return ctx, page


def js_click(page, selector):
    page.evaluate(f"(() => {{ const el = document.querySelector({selector!r}); if (el) el.click(); }})()")


def set_battle_number(page, n):
    page.evaluate(f'() => {{ window.Game.getCampaignState().battleNumber = {n}; }}')


def ensure_speed_x3(page):
    # Идемпотентно: клик по кругу x1->x2->x3->x1 — если просто кликнуть
    # ДВАЖДЫ каждый вызов (не проверяя текущее значение), при повторных
    # битвах на одной странице скорость уезжает на x2/x1 вместо x3 (нашли
    # этим же тестом — вторая битва-15 не успевала за 70с на x1).
    for _ in range(3):
        if page.eval_on_selector('#speedBtn', 'el => el.textContent') == '×3':
            return
        js_click(page, '#speedBtn')


def win_current_battle(page, max_wait_s=70):
    """Battle 1 (первая после #playBtn) — детерминирована (battleNumber<=3
    в main.js/campaign.js), спам бойца A выигрывает быстро и надёжно."""
    ensure_speed_x3(page)
    deadline = time.time() + max_wait_s
    while time.time() < deadline:
        js_click(page, '#card-A')
        page.wait_for_timeout(60)
        if page.evaluate("document.getElementById('popup').classList.contains('hidden') === false"):
            return True
    return False


# ---------------------------------------------------------------
def test_interstitial_gate_and_cooldown(browser):
    """campaign.ads: гейт срабатывает ровно на battleNumber%3==0, кулдаун
    подавляет повторный показ секунды спустя по факту (Platform.now())."""
    ctx, page = new_page(browser)
    page.goto(URL)
    wait_menu(page)
    js_click(page, '#playBtn')
    page.wait_for_timeout(150)
    ok = win_current_battle(page)

    set_battle_number(page, 3)  # граница: 3 % 3 == 0
    js_click(page, '#restartBtn')
    page.wait_for_timeout(200)
    log_after_3 = page.evaluate('() => window.__interstitialLog.length')
    record('interstitial срабатывает на battleNumber%3==0 (3)', ok and log_after_3 == 1,
           f'win_ok={ok} log_len={log_after_3}')

    win_current_battle(page)  # текущая (теперь battleNumber=4) — тоже детерминирована? нет, >3, но всё ещё простая (spamA)
    set_battle_number(page, 6)  # следующая граница, СЕКУНДЫ спустя по реальному времени -> кулдаун должен подавить
    js_click(page, '#restartBtn')
    page.wait_for_timeout(200)
    log_after_6 = page.evaluate('() => window.__interstitialLog.length')
    record('кулдаун 90с подавляет повторный показ на следующей границе секунды спустя', log_after_6 == 1,
           f'log_len={log_after_6}')
    ctx.close()


def test_milestone_event_once(browser):
    """Закон 9/K-18: финал-событие (campaign.milestone_battle=15) — ровно
    один раз, флаг выставляется и не даёт повторного показа."""
    ctx, page = new_page(browser)
    page.goto(URL)
    wait_menu(page)
    js_click(page, '#playBtn')
    page.wait_for_timeout(150)
    win_current_battle(page)

    set_battle_number(page, 14)  # restart increments once — 14->15 через advanceBattle()
    js_click(page, '#restartBtn')  # advanceBattle -> startBattle() на "битве 15"
    page.wait_for_timeout(300)
    won15 = win_current_battle(page)
    stats15 = page.eval_on_selector('#popupStats', 'el => el.textContent') if won15 else ''
    cs_after = page.evaluate('() => window.Game.getCampaignState()')
    shown_once = 'Рубеж:' in stats15 and cs_after['milestoneShown']
    record('финал-событие показано на битве 15, флаг выставлен', won15 and shown_once, f'stats={stats15!r}')

    # Не повторяется при ПОВТОРНОМ визите битвы 15 (телепорт назад, а не
    # битва 16 — та ощутимо труднее и дольше, а тут проверяется именно
    # устойчивость ФЛАГА milestoneShown, не сложность следующей битвы).
    set_battle_number(page, 14)
    js_click(page, '#restartBtn')
    page.wait_for_timeout(300)
    won_again = win_current_battle(page)
    stats_again = page.eval_on_selector('#popupStats', 'el => el.textContent') if won_again else ''
    record('финал-событие не повторяется при повторном визите битвы-рубежа', won_again and 'Рубеж:' not in stats_again,
           f'stats={stats_again!r}')
    ctx.close()


def test_rewarded_button_always_visible_and_grants_bonus(browser):
    """R-07: кнопка rewarded всегда видима после битвы; клик даёт бонус
    ПОВЕРХ обычной награды (не вместо)."""
    ctx, page = new_page(browser)
    page.goto(URL)
    wait_menu(page)
    js_click(page, '#playBtn')
    page.wait_for_timeout(150)
    win_current_battle(page)
    visible_before = page.eval_on_selector('#rewardedBonusBtn', 'el => !el.classList.contains("hidden")')
    trophies_before = page.evaluate('() => window.Game.getCampaignState().trophies')
    js_click(page, '#rewardedBonusBtn')
    page.wait_for_timeout(150)
    trophies_after = page.evaluate('() => window.Game.getCampaignState().trophies')
    rewarded_log = page.evaluate('() => window.__rewardedLog')
    ok = visible_before and trophies_after > trophies_before and len(rewarded_log) == 1
    record('rewarded-кнопка видима, клик начисляет бонус поверх награды', ok,
           f'before={trophies_before} after={trophies_after} log_len={len(rewarded_log)}')
    ctx.close()


def test_law8_no_ad_calls_from_engine():
    """Закон 8: реклама никогда не условие победы — статический guard:
    engine.js (правила боя и условие победы/поражения) не должен
    ссылаться на Platform вовсе."""
    engine_src = ROOT.joinpath('engine.js').read_text(encoding='utf-8')
    ok = 'Platform' not in engine_src
    record('закон 8 (guard): engine.js не ссылается на Platform ни разу', ok)


def main():
    server = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(0.6)
    try:
        test_law8_no_ad_calls_from_engine()
        with sync_playwright() as p:
            browser = p.chromium.launch()
            test_rewarded_button_always_visible_and_grants_bonus(browser)
            test_interstitial_gate_and_cooldown(browser)
            test_milestone_event_once(browser)
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
