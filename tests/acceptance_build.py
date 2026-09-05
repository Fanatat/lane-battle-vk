#!/usr/bin/env python3
"""
Приёмочный прогон build.py (ТЗ №12). Пороги раздела «Порог»:
(1) сборка падает, если отладочный файл попал в архив;
(2) распаковка архива подтверждает отсутствие дев-флагов;
и T-10 (штатный смоук СОБРАННОГО dist/ живым Chromium, а не исходника —
T-05 "исходник ≠ собранный архив").

Запуск: python3 tests/acceptance_build.py
"""
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
ROOT = HERE.parent
YA_MOCK_JS = HERE.joinpath('yasdk_mock.js').read_text(encoding='utf-8')

results = []


def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f' -- {detail}' if detail else ''))


def run_build(args=()):
    return subprocess.run([sys.executable, 'build.py', *args], cwd=ROOT, capture_output=True, text=True)


def reset_build_state():
    # Тест обязан быть воспроизводимым независимо от того, сколько раз
    # build.py уже гонялся раньше (G-08: номер билда не идёт назад) —
    # чистим dist/ и счётчики, чтобы номер снова начинался с 1.
    if (ROOT / 'dist').exists():
        shutil.rmtree(ROOT / 'dist')
    for f in ('yandex_build_number.txt', 'vk_build_number.txt'):
        p = ROOT / f
        if p.exists():
            p.unlink()


def find_yandex_zip():
    matches = sorted((ROOT / 'dist').glob('lanebattler_yandex_build*.zip'))
    return matches[-1] if matches else None


def test_build_succeeds_both_targets():
    reset_build_state()
    res = run_build()
    zip_path = find_yandex_zip()
    ok = (res.returncode == 0
          and zip_path is not None
          and (ROOT / 'dist' / 'lanebattler_vk' / 'index.html').exists())
    record('build.py (оба таргета) завершается успешно и производит ожидаемые артефакты', ok,
           res.stdout.strip() + res.stderr.strip())


def test_yandex_zip_has_no_dev_files():
    zip_path = find_yandex_zip()
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
    forbidden = [n for n in names if 'dev.js' in n or n.startswith('tests/') or n in ('BLOCKERS.md', 'CLAUDE.md', 'build.py')]
    record('распаковка Яндекс-архива подтверждает отсутствие dev.js/tests/служебных файлов (M-12)',
           len(forbidden) == 0, f'names={names} forbidden={forbidden}')


def test_vk_folder_has_no_zip():
    # G-12: ВК — папка без zip (лишний архив с тем же номером — риск залить не то).
    zips = list((ROOT / 'dist').glob('*vk*.zip'))
    record('ВК-сборка не производит zip вовсе (G-12)', len(zips) == 0, f'найдены: {zips}')


def test_build_fails_loudly_on_dev_leak():
    """Порог 1: сборка ПАДАЕТ, если отладочный файл попал в архив — гоняем
    guard напрямую на НАМЕРЕННО испорченном каталоге (T-11: guard
    принимается только после демонстрации, что он валит сборку на
    испорченном входе, а не просто пропускает валидный)."""
    sys.path.insert(0, str(ROOT))
    import importlib
    import build as build_module
    importlib.reload(build_module)
    fake_dir = ROOT / 'dist' / '_test_corrupt'
    if fake_dir.exists():
        shutil.rmtree(fake_dir)
    fake_dir.mkdir(parents=True)
    (fake_dir / 'index.html').write_text('<html></html>', encoding='utf-8')
    (fake_dir / 'dev.js').write_text('// leaked', encoding='utf-8')
    try:
        build_module.check_no_dev_leak(fake_dir)
        ok = False
        detail = 'guard НЕ упал на подложенном dev.js'
    except SystemExit:
        ok = True
        detail = 'guard корректно упал (sys.exit) на подложенном dev.js'
    finally:
        shutil.rmtree(fake_dir)
    record('build.py: guard падает громко, если dev.js физически попал в сборку', ok, detail)


def test_build_fails_loudly_on_unreplaced_placeholder():
    """Второй класс порчи для того же guard (T-11: ДВА класса порчи) —
    плейсхолдер BUILD не заменён (маркер сдвинулся/подстановка не сработала)."""
    sys.path.insert(0, str(ROOT))
    import build as build_module
    fake_dir = ROOT / 'dist' / '_test_corrupt2'
    if fake_dir.exists():
        shutil.rmtree(fake_dir)
    fake_dir.mkdir(parents=True)
    (fake_dir / 'platform.js').write_text('const Platform = { BUILD: "__YANDEX_BUILD__" };', encoding='utf-8')
    try:
        build_module.check_placeholder_replaced(fake_dir, '__YANDEX_BUILD__')
        ok = False
        detail = 'guard НЕ упал на неподменённом плейсхолдере'
    except SystemExit:
        ok = True
        detail = 'guard корректно упал (sys.exit) на неподменённом плейсхолдере'
    finally:
        shutil.rmtree(fake_dir)
    record('build.py: guard падает громко, если плейсхолдер BUILD не заменён', ok, detail)


def smoke_dist(build_dir_name, port, mock_route, wait_ms=800):
    """T-10: штатный смоук СОБРАННОГО dist/ живым Chromium — dev-фолбэк
    (без SDK) и, отдельно, с мок-SDK через перехват реального пути
    (/sdk.js или локальный vk-bridge.min.js), как это будет на площадке."""
    build_dir = ROOT / 'dist' / build_dir_name
    server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'],
                               cwd=str(build_dir), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.5)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()

            # без SDK — dev-фолбэк. BUILD уже подставлен build.py В ФАЙЛЕ
            # (не зависит от того, ответит ли платформа в рантайме) —
            # плашка обязана быть ВИДНА уже здесь, это и есть разница
            # между собранным dist/ и исходником (T-05).
            page = browser.new_page(viewport={'width': 1280, 'height': 720})
            errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(f'http://127.0.0.1:{port}/index.html')
            try:
                page.wait_for_selector('#buildBadge:not(.hidden)', timeout=5000)
                badge_visible_no_sdk = True
            except Exception:
                badge_visible_no_sdk = False
            record(f'{build_dir_name}: dev-фолбэк без SDK — 0 ошибок, плашка BUILD уже видна (подставлена в файл сборкой)',
                   len(errs) == 0 and badge_visible_no_sdk, f'errors={errs}')
            page.close()

            # с мок-SDK через перехват реального пути загрузки
            page2 = browser.new_page(viewport={'width': 1280, 'height': 720})
            errs2 = []
            page2.on('pageerror', lambda e: errs2.append(str(e)))
            if mock_route:
                page2.route(mock_route['pattern'], lambda route: route.fulfill(
                    content_type='application/javascript', body=mock_route['body']))
            page2.goto(f'http://127.0.0.1:{port}/index.html')
            page2.wait_for_timeout(wait_ms)
            # Блок 3a (RESTRUCTURE.md): старт = геймплей сразу, без меню-гейта
            # — #playBtn больше не часть флоу первого запуска (кнопка теперь
            # только явный возврат из паузы), клика по ней здесь не требуется.
            page2.wait_for_timeout(500)
            badge_text = page2.eval_on_selector('#buildBadge', 'el => el.textContent')
            battle_visible = page2.eval_on_selector('#menuScreen', 'el => el.classList.contains("hidden")')
            record(f'{build_dir_name}: игра запускается из СОБРАННОГО dist/, плашка BUILD показывает номер',
                   len(errs2) == 0 and battle_visible and len(badge_text) > 0,
                   f'errors={errs2} badge={badge_text!r}')
            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)


def main():
    test_build_succeeds_both_targets()
    test_yandex_zip_has_no_dev_files()
    test_vk_folder_has_no_zip()
    test_build_fails_loudly_on_dev_leak()
    test_build_fails_loudly_on_unreplaced_placeholder()

    # zip нельзя раздать http.server напрямую — распаковываем во временную
    # копию, чтобы смоук шёл против ТОГО ЖЕ содержимого, что уедет в Консоль.
    unzipped = ROOT / 'dist' / 'lanebattler_yandex_unzipped'
    if unzipped.exists():
        shutil.rmtree(unzipped)
    with zipfile.ZipFile(find_yandex_zip()) as zf:
        zf.extractall(unzipped)

    smoke_dist('lanebattler_yandex_unzipped', 8799, {
        'pattern': '**/sdk.js', 'body': YA_MOCK_JS,
    })
    # wait_ms > vk_platform.js INIT_TIMEOUT_MS (2000мс, withTimeout на
    # VKWebAppInit) — без родительского VK-фрейма (headless) бридж всегда
    # ждёт полный таймаут перед дев-фолбэком, 800мс по умолчанию для этого
    # смоука не хватает (badge читался пустым до его истечения).
    smoke_dist('lanebattler_vk', 8800, None, wait_ms=2500)  # vk-bridge.min.js уже локальный файл — мок не нужен для смоука дев-фолбэка

    print('\n=== ИТОГ ===')
    failed = [r for r in results if not r[1]]
    print(f'всего: {len(results)}, провалов: {len(failed)}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
