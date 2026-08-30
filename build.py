#!/usr/bin/env python3
"""
build.py — сборка релизных архивов под Яндекс и ВК из общих исходников
(ТЗ №12, G-04/G-12/S-02). Белый список файлов, вырезание дев-флагов
(M-11/M-12), номер билда (G-07/G-08), плашка BUILD.

Контракт студии (S-01): `platform.js` — Яндекс-адаптер, `vk_platform.js` —
ВК-адаптер, одинаковый публичный интерфейс (см. BLOCKERS.md п.23 —
isRewardedAvailable() в реальном контракте эталона отсутствует, здесь
тоже). Порт SDK: Яндекс подключается через `/sdk.js` (относительный путь,
раздаётся самой площадкой — сверено официальной докой SDK, S-14, а не по
памяти); ВК — локальный вендор `vendor/vk-bridge.min.js`
(@vkontakte/vk-bridge@3.0.2, сверено с npm-пакетом, тот же принцип, что у
эталона game3/color_sort — dev.vk.com недоступен напрямую).

Формат сборки задаёт способ заливки (G-12): Яндекс — zip (формат подачи),
ВК — ПАПКА без zip (лишний архив с тем же номером — риск залить не то).

Запуск:
  python3 build.py yandex   # dist/<GAME_ID>_yandex.zip
  python3 build.py vk       # dist/<GAME_ID>_vk/ (папка)
  python3 build.py          # оба таргета

GAME_ID — рабочий внутренний идентификатор для ИМЕНИ ФАЙЛА архива, не
показывается в интерфейсе игры (рабочее имя по ROADMAP.md в UI не
выводится, N-15 — нейминг на фазе 12 решением основателя; здесь — только
имя файла на диске, не игровой текст).
"""
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).parent
DIST = ROOT / 'dist'
GAME_ID = 'lanebattler'

# ---------------------------------------------------------------------
# M-11: отладочный код (dev.js, панель диагностики) в подаваемый архив НЕ
# ПОПАДАЕТ ФИЗИЧЕСКИ. tests/, BLOCKERS.md, ТЗ/отчёты — тоже не игровые
# файлы. Список НЕ "всё, кроме запрещённого" (белый список, не чёрный) —
# каждый новый игровой файл нужно явно сюда добавить (то же требование
# K-15 "ревизия всех экранов при изменении масштаба", применённое к сборке).
WHITELIST_COMMON = ['index.html', 'engine.js', 'campaign.js', 'main.js', 'balance.json']

YANDEX_PLACEHOLDER = '__YANDEX_BUILD__'
VK_PLACEHOLDER = '__VK_BUILD__'


def git_hash():
    try:
        return subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT, text=True).strip()
    except Exception:
        return 'nogit'


def next_build_number(platform):
    # G-08: номер НЕ идёт назад — при расхождении счётчика и факта берётся
    # следующий свободный выше максимального выданного. Файл — источник
    # истины счётчика; если он отстал от уже выпущенных архивов в dist/,
    # это баг конфигурации, а не повод молча продолжить с меньшим числом.
    counter_file = ROOT / f'{platform}_build_number.txt'
    current = int(counter_file.read_text().strip()) if counter_file.exists() else 0
    existing_max = 0
    if DIST.exists():
        for p in DIST.glob(f'{GAME_ID}_{platform}_build*'):
            try:
                n = int(p.name.split('build')[-1].split('.')[0])
                existing_max = max(existing_max, n)
            except ValueError:
                pass
    n = max(current, existing_max) + 1
    counter_file.write_text(str(n) + '\n')
    return n


def fail(msg):
    print(f'[FAIL] {msg}', file=sys.stderr)
    sys.exit(1)


def check_no_dev_leak(build_dir):
    # M-11/M-12: guard проверяет РАСПАКОВАННЫЙ/собранный каталог, не
    # исходник (T-05: "исходник ≠ собранный архив").
    forbidden_names = {'dev.js', 'BLOCKERS.md', 'CLAUDE.md', 'ROADMAP.md', 'build.py'}
    found = []
    for p in build_dir.rglob('*'):
        if p.is_file() and (p.name in forbidden_names or 'tests' in p.relative_to(build_dir).parts):
            found.append(str(p.relative_to(build_dir)))
    if found:
        fail(f'отладочные/служебные файлы физически попали в сборку {build_dir.name}: {found}')


def check_placeholder_replaced(build_dir, placeholder):
    leaked = []
    for p in build_dir.rglob('*.js'):
        if placeholder in p.read_text(encoding='utf-8'):
            leaked.append(str(p.relative_to(build_dir)))
    if leaked:
        fail(f'плейсхолдер {placeholder} НЕ заменён в собранной копии: {leaked} (маркер сдвинулся или подстановка не сработала)')


def write_index_html(src_html, platform_script_tag_old, platform_script_tag_new, sdk_tag):
    html = src_html.replace(
        f'<script src="{platform_script_tag_old}"></script>',
        (sdk_tag + '\n  ' if sdk_tag else '') + f'<script src="{platform_script_tag_new}"></script>'
    )
    # dev.js не попадает в архив физически (M-11) — тег на него тоже
    # вырезаем, иначе в проде это неработающий 404-запрос на несуществующий
    # файл (не дев-флаг сам по себе, но явный мусор в подаваемом билде).
    html = html.replace('  <script src="dev.js"></script>\n', '')
    if 'dev.js' in html:
        fail('тег <script src="dev.js"> не вырезан из собранного index.html — маркер сдвинулся, чинить build.py')
    return html


def build_yandex():
    build_dir = DIST / f'{GAME_ID}_yandex'
    if build_dir.exists():
        shutil.rmtree(build_dir)
    build_dir.mkdir(parents=True)

    for name in WHITELIST_COMMON:
        shutil.copy2(ROOT / name, build_dir / name)
    shutil.copy2(ROOT / 'platform.js', build_dir / 'platform.js')

    n = next_build_number('yandex')
    build_id = f'yandex-b{n}-{git_hash()}'

    platform_src = (build_dir / 'platform.js').read_text(encoding='utf-8')
    if YANDEX_PLACEHOLDER not in platform_src:
        fail(f"плейсхолдер '{YANDEX_PLACEHOLDER}' не найден в platform.js — маркер сдвинулся, чинить build.py")
    (build_dir / 'platform.js').write_text(platform_src.replace(YANDEX_PLACEHOLDER, build_id), encoding='utf-8')

    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    html = write_index_html(html, 'platform.js', 'platform.js', '<script src="/sdk.js"></script>')
    (build_dir / 'index.html').write_text(html, encoding='utf-8')

    check_no_dev_leak(build_dir)
    check_placeholder_replaced(build_dir, YANDEX_PLACEHOLDER)
    check_placeholder_replaced(build_dir, VK_PLACEHOLDER)

    # G-12: Яндекс — формат подачи zip. G-07(1): имя <игра>_<площадка>_buildN.zip.
    zip_path = DIST / f'{GAME_ID}_yandex_build{n}.zip'
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(build_dir.rglob('*')):
            if p.is_file():
                zf.write(p, p.relative_to(build_dir))

    print(f'OK: yandex build {build_id} -> {zip_path.relative_to(ROOT)} ({zip_path.stat().st_size} bytes)')
    return zip_path


def build_vk():
    build_dir = DIST / f'{GAME_ID}_vk'
    if build_dir.exists():
        shutil.rmtree(build_dir)
    build_dir.mkdir(parents=True)

    for name in WHITELIST_COMMON:
        shutil.copy2(ROOT / name, build_dir / name)
    shutil.copy2(ROOT / 'vk_platform.js', build_dir / 'vk_platform.js')
    shutil.copy2(ROOT / 'vendor' / 'vk-bridge.min.js', build_dir / 'vk-bridge.min.js')

    n = next_build_number('vk')
    build_id = f'vk-b{n}-{git_hash()}'

    platform_src = (build_dir / 'vk_platform.js').read_text(encoding='utf-8')
    if VK_PLACEHOLDER not in platform_src:
        fail(f"плейсхолдер '{VK_PLACEHOLDER}' не найден в vk_platform.js — маркер сдвинулся, чинить build.py")
    (build_dir / 'vk_platform.js').write_text(platform_src.replace(VK_PLACEHOLDER, build_id), encoding='utf-8')

    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    html = write_index_html(html, 'platform.js', 'vk_platform.js', '<script src="vk-bridge.min.js"></script>')
    (build_dir / 'index.html').write_text(html, encoding='utf-8')

    check_no_dev_leak(build_dir)
    check_placeholder_replaced(build_dir, YANDEX_PLACEHOLDER)
    check_placeholder_replaced(build_dir, VK_PLACEHOLDER)

    # G-12: ВК — папка, zip НЕ производится вовсе.
    print(f'OK: vk build {build_id} -> {build_dir.relative_to(ROOT)}/ (папка, без zip — G-12)')
    return build_dir


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else 'both'
    DIST.mkdir(exist_ok=True)
    if target in ('yandex', 'both'):
        build_yandex()
    if target in ('vk', 'both'):
        build_vk()


if __name__ == '__main__':
    main()
