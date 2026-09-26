// Воронка событий (раунд 15, П5 — ТЗ_КАЧЕСТВО_CRAZYGAMES_2026-09-25.md).
// До этого внутриигровой аналитики не было: по статистике ВК D1 7,7%, D7 0,
// но где именно уходят игроки — неизвестно.
//
// API: Analytics.track(name, params) — одна строка в месте события.
// События: boot_first_screen, menu_shown, mission_start {id},
// mission_win {id, sec, coreHpPct}, mission_lose {id, sec}, era_up {id, age},
// tutorial_step {n}, shop_open, ad_reward_ok / ad_reward_fail {screen}.
//
// Куда уходит:
//  (a) всегда — журнал #debug (BOOT.event, js/diag.js) и счётчики в
//      localStorage (кроме CrazyGames — там localStorage запрещён,
//      ТЗ_CRAZYGAMES_ИНТЕГРАЦИЯ.md п.4; счётчики живут в памяти);
//  (b) Яндекс — цель Метрики ym(id,'reachGoal',...), только если на странице
//      уже есть счётчик (window.ym) и задан ANALYTICS_CONFIG.yandexMetrikaId.
//      Сам счётчик этот файл НЕ подключает — никаких запросов к сторонним
//      доменам (автопроверка Яндекса);
//  (c) CrazyGames — метрики воронки площадка собирает сама (gameplayStart/
//      Stop уже вызываются, см. PLATFORM.setGameplayActive). Отсюда только
//      штатные вызовы SDK.game: setGameContext/clearGameContext (контекст к
//      отзывам игроков), reportGameCompletedPercentage (прогресс кампании),
//      happytime (редко: финал главы и кампании — «beating a boss»);
//  (d) ВК — ничего: VKWebAppTrackEvent требует отдельной настройки MyTracker.
// Любая ошибка внутри глотается — аналитика не имеет права ронять игру.
'use strict';

const ANALYTICS_CONFIG = {
  // ID счётчика Яндекс Метрики — даёт основатель. null = не отправлять.
  yandexMetrikaId: null,
  // Для событий с {id} миссии в Метрику дополнительно уходит цель
  // '<name>_<id>' (mission_start_1, mission_win_1, …) — из таких целей
  // воронка «старт м1 → победа м1 → старт м2» собирается без фильтров.
  metrikaPerMissionGoals: true,
};

const Analytics = (() => {
  const LS_KEY = 'twinforts_funnel_v1';
  const PER_ID = { mission_start: 1, mission_win: 1, mission_lose: 1, era_up: 1 };
  let lastScreen = null;
  let reportedPct = 0;
  const happyDone = {};

  function platformKind() {
    try { if (typeof PLATFORM !== 'undefined') return PLATFORM.kind(); } catch (e) { /* ниже фолбэк */ }
    return window.GAME_PLATFORM || 'none';
  }
  function onCrazyGames() {
    return platformKind() === 'crazygames' || window.GAME_PLATFORM === 'crazygames';
  }
  function cgGame() {
    if (platformKind() !== 'crazygames') return null;
    const sdk = window.CrazyGames && window.CrazyGames.SDK;
    if (!sdk || sdk.environment === 'disabled' || !sdk.game) return null;
    return sdk.game;
  }
  function cgCall(method, ...args) {
    try {
      const g = cgGame();
      if (g && typeof g[method] === 'function') g[method](...args);
    } catch (e) { console.warn('[analytics] CrazyGames', method, e); }
  }

  // ---- (a) счётчики
  let memStore = { v: 1, c: {}, first: {} };
  let loaded = false;
  function store() {
    if (loaded) return memStore;
    loaded = true;
    if (onCrazyGames()) return memStore;
    try {
      const raw = localStorage.getItem(LS_KEY);
      const parsed = raw && JSON.parse(raw);
      if (parsed && parsed.c) memStore = parsed;
    } catch (e) { /* приватный режим / битые данные — считаем с нуля в памяти */ }
    return memStore;
  }
  function count(key) {
    const s = store();
    s.c[key] = (s.c[key] || 0) + 1;
    if (!s.first[key]) s.first[key] = Date.now();
  }
  function persist() {
    if (onCrazyGames()) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(memStore)); } catch (e) { /* квота/запрет */ }
  }

  // ---- (b) Яндекс Метрика
  function metrika(name, params) {
    const id = ANALYTICS_CONFIG.yandexMetrikaId;
    if (!id || platformKind() !== 'yandex' || typeof window.ym !== 'function') return;
    try {
      window.ym(id, 'reachGoal', name, params || undefined);
      if (ANALYTICS_CONFIG.metrikaPerMissionGoals && PER_ID[name] && params && params.id != null) {
        window.ym(id, 'reachGoal', name + '_' + params.id, params);
      }
    } catch (e) { console.warn('[analytics] ym', e); }
  }

  // ---- (c) CrazyGames
  function missionsTotal() {
    return (typeof MISSIONS !== 'undefined' && MISSIONS.length) || 0;
  }
  function reportProgress(done) {
    const total = missionsTotal();
    if (!total || !(done > 0)) return;
    const pct = Math.max(0, Math.min(100, Math.round(done / total * 100)));
    if (pct <= reportedPct) return; // прогресс только вперёд
    reportedPct = pct;
    cgCall('reportGameCompletedPercentage', pct);
  }
  function unlockedDone() {
    try { if (typeof progress !== 'undefined' && progress && progress.unlocked) return progress.unlocked - 1; } catch (e) { /* нет */ }
    return 0;
  }
  function crazyGames(name, params) {
    if (!cgGame()) return;
    if (name === 'boot_first_screen') {
      // Док: «report the correct percentage on game start».
      reportProgress(unlockedDone());
    } else if (name === 'mission_start' && params) {
      cgCall('setGameContext', { mission: params.id });
    } else if (name === 'menu_shown') {
      cgCall('clearGameContext');
    } else if (name === 'mission_win' && params) {
      reportProgress(Math.max(params.id, unlockedDone()));
      const total = missionsTotal();
      const perChapter = (typeof MISSIONS_PER_CHAPTER !== 'undefined' && MISSIONS_PER_CHAPTER) || 0;
      const bossWin = (total && params.id >= total) || (perChapter && params.id % perChapter === 0);
      // happytime — «use sparingly»: только финал главы/кампании и не чаще
      // одного раза за сессию на миссию.
      if (bossWin && !happyDone[params.id]) {
        happyDone[params.id] = true;
        cgCall('happytime');
      }
    }
  }

  function track(name, params) {
    try {
      count(name);
      if (params && PER_ID[name] && params.id != null) count(name + ':' + params.id);
      persist();
      if (typeof BOOT !== 'undefined' && BOOT.event) BOOT.event(name, params);
      metrika(name, params);
      crazyGames(name, params);
    } catch (e) {
      console.warn('[analytics] track failed', name, e);
    }
  }

  // Первый экран отмечает js/diag.js (BOOT.firstScreen) — отдельный вызов в
  // game.js не нужен.
  window.addEventListener('boot:firstscreen', () => track('boot_first_screen', { ms: Math.round(performance.now()) }));

  return {
    track,
    // Из showScreen(): смена экрана -> menu_shown / shop_open (только при
    // переходе, не при повторном показе того же экрана). Сравниваем со своим
    // lastScreen, а не с переменной screen игры: та стартует со значения
    // 'menu', и первый показ меню иначе не засчитывался бы.
    screenShown(name) {
      const was = lastScreen;
      lastScreen = name;
      if (name === was) return;
      if (name === 'menu') track('menu_shown');
      else if (name === 'shop') track('shop_open');
    },
    // Итог рекламы за вознаграждение (зовёт PLATFORM.showRewardedVideo).
    adReward(ok) { track(ok ? 'ad_reward_ok' : 'ad_reward_fail', { screen: lastScreen }); },
    // Счётчики для отладки: Analytics.stats() в консоли.
    stats() { return JSON.parse(JSON.stringify(store())); },
  };
})();
