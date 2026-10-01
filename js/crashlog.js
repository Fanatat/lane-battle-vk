// Журнал сбоев (раунд 17, 01.10.2026: «краш на мобильной версии в миссии 9»,
// воспроизвести не удалось). Две вещи, чтобы следующий краш не прошёл бесследно:
//  1) исключения (window.onerror / unhandledrejection / пойманные в frame()) —
//     в localStorage 'twinforts_crashlog_v1' (последние 10);
//  2) «пульс боя»: раз в 2 с во время боя пишется срез (миссия, секунда, число
//     юнитов/частиц, JS-куча, средний кадр, уровень защиты). Нормальный выход
//     (скрытие вкладки / pagehide) помечает пульс чистым. Если при следующем
//     запуске пульс остался «грязным» — прошлую сессию убила ОС/браузер
//     (OOM, краш вкладки): в журнал уходит 'suspect-kill' с последним срезом.
// Смотреть: CRASHLOG.dump() в консоли или #debug (блок «Журнал сбоев»).
// На CrazyGames localStorage запрещён — журнал живёт только в памяти.
'use strict';

const CRASHLOG = (() => {
  const LS_LOG = 'twinforts_crashlog_v1';
  const LS_ALIVE = 'twinforts_alive_v1';
  const MAX = 10;
  const useLS = window.GAME_PLATFORM !== 'crazygames';
  let mem = [];
  let provider = null;
  let hbTimer = null;

  function lsGet(k) { if (!useLS) return null; try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { if (!useLS) return; try { localStorage.setItem(k, v); } catch (e) { /* квота/приват */ } }
  function lsDel(k) { if (!useLS) return; try { localStorage.removeItem(k); } catch (e) { /* пусто */ } }
  function readLog() {
    const raw = lsGet(LS_LOG);
    if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a)) return a; } catch (e) { /* битый журнал */ } }
    return mem;
  }
  function snapshot() {
    let s = {};
    try { s = provider ? provider() || {} : {}; } catch (e) { s = { providerError: String(e) }; }
    try {
      if (performance.memory) s.heapMB = Math.round(performance.memory.usedJSHeapSize / 1048576);
      s.view = innerWidth + 'x' + innerHeight + '@' + (window.devicePixelRatio || 1);
    } catch (e) { /* без памяти */ }
    return s;
  }
  function record(kind, err, extra) {
    const entry = {
      t: new Date().toISOString(), kind,
      msg: String(err && err.message ? err.message : err).slice(0, 200),
      stack: err && err.stack ? String(err.stack).split('\n').slice(0, 4).join(' | ').slice(0, 400) : '',
      state: Object.assign(snapshot(), extra || {}),
      ua: (navigator.userAgent || '').slice(0, 120),
    };
    const log = readLog().concat([entry]).slice(-MAX);
    mem = log;
    lsSet(LS_LOG, JSON.stringify(log));
    try { console.warn('[crashlog]', kind, entry.msg, entry.state); } catch (e) { /* пусто */ }
    try { if (typeof Analytics !== 'undefined') Analytics.track('crash_' + kind, { msg: entry.msg.slice(0, 60) }); } catch (e) { /* аналитика не ломает */ }
    return entry;
  }
  function beat(clean) {
    const s = snapshot();
    s.at = Date.now();
    s.clean = !!clean;
    lsSet(LS_ALIVE, JSON.stringify(s));
  }
  // Предыдущая сессия оборвалась посреди боя без pagehide/hidden?
  (function checkPrevious() {
    const raw = lsGet(LS_ALIVE);
    if (!raw) return;
    lsDel(LS_ALIVE);
    try {
      const s = JSON.parse(raw);
      if (s && !s.clean && s.screen === 'match') record('suspect-kill', 'previous session ended mid-match', { prev: s });
    } catch (e) { /* пусто */ }
  })();

  window.addEventListener('error', (e) => record('error', e.error || e.message, { src: (e.filename || '').split('/').pop() + ':' + e.lineno }));
  window.addEventListener('unhandledrejection', (e) => record('rejection', e.reason));
  window.addEventListener('pagehide', () => { if (hbTimer) beat(true); });
  document.addEventListener('visibilitychange', () => { if (hbTimer && document.hidden) beat(true); });

  return {
    record,
    // Зовётся из game.js: функция, отдающая срез состояния боя.
    setProvider(fn) { provider = fn; },
    startHeartbeat() {
      if (hbTimer) return;
      beat(false);
      hbTimer = setInterval(() => { if (!document.hidden) beat(false); }, 2000);
    },
    // Конец боя/выход в меню: пульс чистый, останавливаем.
    stopHeartbeat() {
      if (!hbTimer) return;
      clearInterval(hbTimer); hbTimer = null;
      beat(true);
    },
    read: readLog,
    dump() { const l = readLog(); console.info('[crashlog]\n' + JSON.stringify(l, null, 1)); return l; },
    clear() { mem = []; lsDel(LS_LOG); lsDel(LS_ALIVE); },
  };
})();
