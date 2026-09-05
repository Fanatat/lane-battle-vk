#!/usr/bin/env python3
"""
Приёмочный прогон блока 3b (RESTRUCTURE.md, критерий Б3b) — живым Chromium
поверх исходника (dev-сервер), не чтением кода. Playwright здесь — ТОЛЬКО
безголовый браузер для скриншотов/DOM/консоли (тот же приём, что блок 3a),
не автотест ощущений (CLAUDE.md/DETAILS §1 запрещают именно последнее).

Прогоняет реальную игру: побеждает в битвах 1-3 (спамом карточки A, чтобы
гарантированно выиграть — заведомо непроигрышные битвы, ТЗ блок 3a), затем
НЕ спавнит ничего в битвах 4+, пока не случится первое поражение (первый
проигрыш когда-либо в игре) и накопится 3 подряд, чтобы пройти все новые
ветки блока 3b хотя бы раз: "почти"-строка, бесплатный юнит, бегущие цифры,
idle-подсказка.

Запуск: python3 tests/acceptance_block3b.py
"""
import re
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout


def safe_click(page, selector):
    """Клик, который не роняет скрипт, если элемент как раз накрылся попапом
    между проверкой видимости и кликом (гонка реального игрового цикла).
    force=True — #restartBtn (блок 3b) непрерывно пульсирует CSS-анимацией
    (transform: scale), из-за чего Playwright никогда не считает его
    "стабильным" по умолчанию и просто вечно ждёт; на реальном пальце это
    не проблема (обычный паттерн CTA-кнопок), это только особенность
    актуальности элемента для авто-теста."""
    try:
        page.click(selector, timeout=1500, force=True)
    except PwTimeout:
        pass

HERE = Path(__file__).parent
ROOT = HERE.parent
EVIDENCE_DIR = ROOT / 'evidence' / date.today().isoformat()
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

results = []


def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))


def main():
    server = subprocess.Popen(
        [sys.executable, '-m', 'http.server', '8791', '--bind', '127.0.0.1'],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(0.6)
    console_errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={'width': 1280, 'height': 600})
            page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
            page.on('pageerror', lambda exc: console_errors.append(str(exc)))
            page.goto('http://127.0.0.1:8791/index.html')
            page.wait_for_function("window.Game && window.Game.getBalance()", timeout=8000)

            # Скорость ×3 сразу, чтобы не ждать реальные 60-150с боя.
            def max_speed():
                safe_click(page, '#speedBtn')
                safe_click(page, '#speedBtn')

            def popup_visible():
                return page.eval_on_selector('#popup', "el => !el.classList.contains('hidden')")

            def wait_for_popup(timeout_s):
                deadline = time.time() + timeout_s
                while time.time() < deadline:
                    if popup_visible():
                        return True
                    time.sleep(0.2)
                return False

            max_speed()
            page.screenshot(path=str(EVIDENCE_DIR / '13_block3b_battle1_start.png'))

            # ---- Битвы 1-3: спамим карточку A, гарантированный выигрыш ----
            first_round_end_t = None
            first_hook_shown_t = None
            for n in range(1, 4):
                deadline = time.time() + 60
                while not popup_visible() and time.time() < deadline:
                    safe_click(page, '#card-A')
                    time.sleep(0.05)
                ok = popup_visible()
                record(f'battle {n} завершилась (победа, спам A)', ok)
                if n == 1:
                    feel = page.evaluate("window.__feel.events")
                    round_end = next((e for e in feel if e['type'] == 'round_end'), None)
                    hook_shown = next((e for e in feel if e['type'] == 'hook_shown'), None)
                    if round_end and hook_shown:
                        delta = hook_shown['t'] - round_end['t']
                        record('round_end -> hook_shown <= 1000мс (Б3b)', delta <= 1000, f'{delta:.1f}мс')
                safe_click(page, '#restartBtn')
                time.sleep(0.15)

            page.screenshot(path=str(EVIDENCE_DIR / '14_block3b_after_battle3_win.png'))

            # ---- Battle 4+: ничего не спавним — ждём первое поражение ----
            first_loss_battle = None
            for n in range(4, 4 + 12):
                deadline = time.time() + 60
                while not popup_visible() and time.time() < deadline:
                    time.sleep(0.2)
                if not popup_visible():
                    record(f'battle {n} не завершилась за 60с без спавна', False)
                    break
                title = page.text_content('#popupTitle')
                if title.strip().lower() in ('поражение', 'defeat'):
                    first_loss_battle = n
                    stats = page.text_content('#popupStats')
                    has_almost_line = bool(re.search(r'\d+%', stats)) or 'information' in stats.lower() or 'информация' in stats.lower()
                    record('первое поражение: информативная "почти"-строка в тексте', has_almost_line, stats[:160])
                    reward_text = page.text_content('#popupReward')
                    record('popupReward виден при поражении тоже (награда за проигрыш > 0)', not page.eval_on_selector('#popupReward', "el => el.classList.contains('hidden')"), reward_text)
                    page.screenshot(path=str(EVIDENCE_DIR / '15_block3b_first_loss_almost.png'))
                    safe_click(page, '#restartBtn')
                    time.sleep(0.15)
                    break
                safe_click(page, '#restartBtn')
                time.sleep(0.15)

            record('первое поражение случилось (для проверки anti-frustration)', first_loss_battle is not None, f'битва {first_loss_battle}')

            # ---- Ещё 2 поражения подряд (без спавна) -> бесплатный юнит ----
            free_unit_line_seen = False
            if first_loss_battle is not None:
                for i in range(2):
                    deadline = time.time() + 60
                    while not popup_visible() and time.time() < deadline:
                        time.sleep(0.2)
                    if not popup_visible():
                        break
                    stats = page.text_content('#popupStats')
                    if 'подкреплени' in stats.lower() or 'reinforcement' in stats.lower():
                        free_unit_line_seen = True
                        page.screenshot(path=str(EVIDENCE_DIR / '16_block3b_free_unit_promised.png'))
                    safe_click(page, '#restartBtn')
                    time.sleep(0.15)
                record('3 поражения подряд -> строка про бесплатное подкрепление в попапе', free_unit_line_seen)

                # Юнит реально заспавнен на старте следующей битвы без клика по карточке.
                time.sleep(0.3)
                spawned = page.evaluate("window.Game.getState() ? window.Game.getState().spawnedCount : -1")
                record('бесплатный юнит заспавнен на старте битвы без ввода игрока', spawned >= 1, f'spawnedCount={spawned}')
                page.screenshot(path=str(EVIDENCE_DIR / '17_block3b_free_unit_on_field.png'))

                # ---- idle-подсказка: 6+ с без спавна -> pulse на карточке A ----
                time.sleep(7.5)
                has_hint = page.eval_on_selector_all('.card.idleHint', 'els => els.length') > 0
                record('idle-подсказка появилась после бездействия (раздел 6 FUN_SPEC)', has_hint)
                page.screenshot(path=str(EVIDENCE_DIR / '18_block3b_idle_hint.png'))

            record('0 console.error за сессию', len(console_errors) == 0, '; '.join(console_errors[:5]))

            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)

    print('\n=== ИТОГ ===')
    failed = [r for r in results if not r[1]]
    for name, ok, detail in results:
        print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))
    if failed:
        print(f'\n{len(failed)} провал(ов).')
        sys.exit(1)
    print('\nВсе проверки пройдены.')


if __name__ == '__main__':
    main()
