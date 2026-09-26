// Диагностика старта (24.09.2026, жалоба основателя: на ВК игра открывается
// ~30 с). Грузится первым из скриптов игры. Собирает метки этапов запуска
// (BOOT.mark из platform.js/game.js) и тайминги всех загруженных файлов
// (Resource Timing), время считается от начала навигации iframe.
//
// Отчёт — только по запросу: #debug в адресе (у ВК: vk.com/appXXXX#debug —
// хэш передаётся в iframe игры) или ?debug=1 — тогда в консоль ('[boot]')
// при показе первого экрана и повторно через 20 с, и окном на экране.
// Из консоли — BOOT.print(true).
'use strict';

const BOOT = (() => {
  const marks = [];
  // Журнал событий воронки (js/analytics.js, раунд 15) — последние
  // EVENTS_MAX, в том же окне #debug под этапами старта.
  const events = [];
  const EVENTS_MAX = 40;
  let enabled = false;
  try {
    enabled = /(^|[#&])debug\b/.test(location.hash) || new URLSearchParams(location.search).has('debug');
  } catch (e) { /* без диагностики на экране */ }
  let panel = null;

  const ms = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v) + ' мс');
  function shortName(url) {
    try {
      const u = new URL(url, location.href);
      const file = u.pathname.split('/').filter(Boolean).pop() || '/';
      return (u.host === location.host ? '' : u.host + ' … ') + decodeURIComponent(file);
    } catch (e) { return String(url).slice(-50); }
  }

  function report() {
    const lines = [];
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    lines.push('Страница: ' + location.host + location.pathname);
    lines.push('Сеть: ' + ((navigator.connection && navigator.connection.effectiveType) || '?') +
      ', экран ' + innerWidth + '×' + innerHeight);
    if (nav) {
      lines.push('');
      lines.push('HTML: первый байт ' + ms(nav.responseStart) + ', загружен ' + ms(nav.responseEnd));
      lines.push('DOM готов ' + ms(nav.domContentLoadedEventEnd || null) + ', всё загружено (load) ' + ms(nav.loadEventEnd || null));
    }
    lines.push('');
    lines.push('Этапы:');
    marks.forEach(([name, t]) => lines.push('  ' + String(Math.round(t)).padStart(6) + ' мс  ' + name));
    if (events.length) {
      lines.push('');
      lines.push('События воронки (Analytics.track, последние ' + events.length + '):');
      events.forEach(([name, t, p]) => lines.push('  ' + String(Math.round(t)).padStart(6) + ' мс  ' + name + (p ? ' ' + p : '')));
    }
    const res = (performance.getEntriesByType ? performance.getEntriesByType('resource') : [])
      .slice()
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 14);
    if (res.length) {
      lines.push('');
      lines.push('Самые долгие файлы (начало → конец, длительность, КБ):');
      res.forEach((r) => {
        const kb = r.transferSize ? Math.round(r.transferSize / 1024) + ' КБ' : (r.encodedBodySize ? Math.round(r.encodedBodySize / 1024) + ' КБ' : '?');
        lines.push('  ' + String(Math.round(r.startTime)).padStart(6) + ' → ' + String(Math.round(r.responseEnd)).padStart(6) +
          '  ' + String(Math.round(r.duration)).padStart(6) + ' мс  ' + kb.padStart(7) + '  ' + shortName(r.name));
      });
    }
    return lines.join('\n');
  }

  function render() {
    if (!enabled || !document.body) return;
    if (!panel) {
      panel = document.createElement('div');
      panel.style.cssText = 'position:fixed;left:6px;top:6px;z-index:100000;max-width:min(96vw,760px);max-height:90vh;' +
        'overflow:auto;background:rgba(0,0,0,.86);color:#b8ffb0;font:11px/1.35 monospace;padding:8px 10px;' +
        'border:1px solid #4a4;border-radius:6px;white-space:pre;user-select:text;-webkit-user-select:text;';
      const close = document.createElement('button');
      close.textContent = '×';
      close.style.cssText = 'position:sticky;float:right;top:0;font:16px monospace;background:#333;color:#fff;border:0;cursor:pointer;';
      close.onclick = () => { panel.remove(); panel = null; enabled = false; };
      panel.appendChild(close);
      panel.appendChild(document.createElement('div'));
      document.body.appendChild(panel);
    }
    panel.lastChild.textContent = '[boot] диагностика старта\n\n' + report();
  }

  function mark(name) {
    marks.push([name, performance.now()]);
    render();
  }
  // Раунд 15 (И7): в консоль — только в режиме #debug/?debug=1 (куратор
  // CrazyGames видел русский дамп загрузки при каждом старте). Вручную из
  // консоли — BOOT.print(true).
  function print(force) {
    if (enabled || force === true) console.info('[boot]\n' + report());
    render();
  }

  mark('скрипты игры начали выполняться');
  document.addEventListener('DOMContentLoaded', () => mark('DOMContentLoaded'));
  window.addEventListener('load', () => mark('window load'));
  // Шрифты локальные (assets/fonts/), браузер качает их при первом
  // использовании — фиксируем момент, когда все нужные уже готовы.
  if (document.fonts && document.fonts.ready) {
    document.addEventListener('DOMContentLoaded', () => document.fonts.ready.then(() => mark('шрифты готовы')));
  }

  let firstScreenSeen = false;
  return {
    mark,
    print,
    report,
    enabled: () => enabled,
    // Событие воронки (из js/analytics.js). В консоль — только в режиме
    // #debug, чтобы не шуметь у обычных игроков.
    event(name, params) {
      let p = '';
      try { p = params && Object.keys(params).length ? JSON.stringify(params) : ''; } catch (e) { /* пусто */ }
      events.push([name, performance.now(), p]);
      if (events.length > EVENTS_MAX) events.shift();
      if (enabled) { console.info('[funnel]', name, p); render(); }
    },
    // Зовётся из game.js при показе первого экрана — отчёт в консоль сразу
    // и повторно через 20 с. Событие 'boot:firstscreen' открывает загрузку
    // музыки меню (js/audio.js, MUSIC — ленивая загрузка) и шлёт
    // boot_first_screen в воронку (js/analytics.js).
    firstScreen() {
      if (firstScreenSeen) return;
      firstScreenSeen = true;
      mark('ПЕРВЫЙ ЭКРАН ПОКАЗАН');
      print();
      setTimeout(print, 20000);
      try { window.dispatchEvent(new Event('boot:firstscreen')); } catch (e) { /* старые браузеры */ }
    },
  };
})();
