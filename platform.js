/* ============================================================
   platform.js — ЕДИНСТВЕННАЯ точка контакта с платформой (Яндекс).
   Контракт студии v2 (S-01), сверен по РЕАЛЬНОМУ рабочему адаптеру
   game3/color_sort/platform.js (S-11, ТЗ №10) — методы и форма
   {ok, data, error} перенесены по образцу, не по памяти. Расхождение
   с текстом S-01: isRewardedAvailable() в рабочем контракте эталона
   нет (доступность rewarded обрабатывается реактивно, R-07/R-08) —
   не добавлен и сюда, см. BLOCKERS.md п.23. Покупки/каталог не
   перенесены — у game4 нет магазина (вне объёма фазы 10).

   Вне платформы (локальная разработка) SDK нет — все методы тихо
   деградируют в mock, игра остаётся живой. dev-режим НЕ пишет и не
   читает через localStorage (S-08: только родное хранилище площадки
   засчитывается проверкой) — кампания просто не переживает
   перезагрузку страницы вне реальной площадки, как и было объявлено
   в отчёте фазы 08.
   ============================================================ */
const Platform = (() => {
  let ysdk = null;
  let player = null;

  /* Плашка номера билда — как в эталоне, плейсхолдер на диске,
     build.py (фаза 12) подставит реальное значение в копию, летящую
     в архив. Локальный запуск без сборки показывает плейсхолдер как
     есть — это нормально, значит билд не собирался через build.py. */
  const BUILD = '__YANDEX_BUILD__';

  /* Сторож объёма сейва (S-06/S-12): 150000 байт — цифра первоисточника
     эталона (Яндекс), не придумана заново. У game4 сейв — несколько
     чисел и булевых (номер битвы, трофеи, уровни апгрейдов), на порядки
     меньше бюджета; сторож всё равно измеряет реальные байты перед
     КАЖДОЙ записью, а не полагается на «должно влезать» (S-06). */
  const SAVE_SIZE_GUARD_BYTES = 150000;

  const INIT_TIMEOUT_MS = 2000; // S-10, тот же порядок, что vk_platform.js эталона
  const AD_HANG_TIMEOUT_MS = 40000; // S-10, byte-для-byte число эталона (не придумано заново)

  function now() { return Date.now(); }

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); }
      );
    });
  }

  async function init() {
    if (typeof YaGames === 'undefined') {
      console.warn('[platform] SDK не найден — dev-режим (mock)');
      return false;
    }
    try {
      ysdk = await withTimeout(YaGames.init(), INIT_TIMEOUT_MS);
      console.log('[platform] SDK инициализирован');
      return true;
    } catch (e) {
      console.error('[platform] Ошибка/таймаут init SDK:', e);
      return false;
    }
  }

  function gameReady() {
    if (ysdk && ysdk.features && ysdk.features.LoadingAPI) {
      ysdk.features.LoadingAPI.ready();
      console.log('[platform] Game Ready отправлен');
    }
  }

  function getLang() {
    if (ysdk && ysdk.environment && ysdk.environment.i18n) {
      return ysdk.environment.i18n.lang || 'ru';
    }
    return (typeof navigator !== 'undefined' && navigator.language || 'ru').slice(0, 2);
  }

  // S-10: init-таймаут покрывает «платформа МОЛЧИТ», но не «платформа
  // НЕ УМЕЕТ метод» — getPlayer() может бросить и ПОСЛЕ успешного init
  // (например если у SDK нет scopes/метода вовсе); ловим здесь тем же
  // try/catch, что и остальные вызовы после init.
  async function getPlayerObj() {
    if (!ysdk) return null;
    if (!player) {
      try {
        player = await ysdk.getPlayer({ scopes: false });
      } catch (e) {
        console.error('[platform] getPlayer ошибка (платформа не умеет метод или сбой):', e);
      }
    }
    return player;
  }

  async function save(fullState) {
    const p = await getPlayerObj();
    if (!p) {
      console.warn('[platform] dev-режим: сейв пропущен', fullState);
      return { ok: true, error: null }; // мок — не считается сбоем (S-08)
    }
    try {
      await p.setData(fullState, true);
      return { ok: true, error: null };
    } catch (e) {
      console.error('[platform] setData ошибка:', e);
      return { ok: false, error: e };
    }
  }

  async function load() {
    const p = await getPlayerObj();
    if (!p) return { ok: true, data: null, error: null }; // dev-режим — легитимно «пусто»
    try {
      const data = await p.getData();
      const hasData = data && typeof data === 'object' && Object.keys(data).length > 0;
      return { ok: true, data: hasData ? data : null, error: null };
    } catch (e) {
      console.error('[platform] getData ошибка:', e);
      return { ok: false, data: null, error: e };
    }
  }

  // Реклама — контракт присутствует (S-01), вызывающих сайтов в игре
  // пока нет (реклама — объём фазы 11). onBeforeShow вызывается ПЕРВОЙ
  // инструкцией — раньше даже проверки SDK, как в эталоне.
  function showInterstitial(onPause, onResume, onBeforeShow) {
    if (onBeforeShow) onBeforeShow();
    if (!ysdk) { console.warn('[platform] dev: interstitial пропущен'); if (onResume) onResume(); return; }
    if (!ysdk.adv || typeof ysdk.adv.showFullscreenAdv !== 'function') {
      console.error('[platform] adv.showFullscreenAdv недоступен на этой платформе (S-10: инициализация прошла, метод — нет)');
      if (onResume) onResume(false);
      return;
    }
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.error(`[platform] interstitial: таймаут — onClose/onError не пришёл за ${AD_HANG_TIMEOUT_MS}мс`);
      if (onResume) onResume(false);
    }, AD_HANG_TIMEOUT_MS);
    ysdk.adv.showFullscreenAdv({
      callbacks: {
        onOpen: () => { if (onPause) onPause(); },
        onClose: (wasShown) => {
          if (settled) return;
          settled = true; clearTimeout(timeoutId);
          if (onResume) onResume(wasShown);
        },
        onError: (e) => {
          if (settled) return;
          settled = true; clearTimeout(timeoutId);
          console.error('[platform] interstitial:', e);
          if (onResume) onResume(false);
        }
      }
    });
  }

  function showRewarded(onRewarded, onPause, onResume) {
    if (!ysdk) {
      console.log('[rewarded] запрос — dev-режим (нет SDK), награда выдана без рекламы');
      if (onRewarded) onRewarded();
      if (onResume) onResume();
      return;
    }
    if (!ysdk.adv || typeof ysdk.adv.showRewardedVideo !== 'function') {
      console.error('[platform] adv.showRewardedVideo недоступен на этой платформе (S-10) — награда выдана бесплатно (R-07: тупика для игрока нет)');
      if (onResume) onResume();
      if (onRewarded) onRewarded();
      return;
    }
    let rewarded = false;
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.log(`[rewarded] таймаут — onClose не пришёл за ${AD_HANG_TIMEOUT_MS}мс, выдано бесплатно`);
      if (onResume) onResume();
      if (onRewarded) onRewarded();
    }, AD_HANG_TIMEOUT_MS);
    ysdk.adv.showRewardedVideo({
      callbacks: {
        onOpen: () => { if (onPause) onPause(); },
        onRewarded: () => { rewarded = true; },
        onClose: () => {
          if (settled) return;
          settled = true; clearTimeout(timeoutId);
          console.log(rewarded ? '[rewarded] показан — награда выдаётся' : '[rewarded] закрыт без просмотра — награды нет (осознанный отказ игрока)');
          if (onResume) onResume();
          if (rewarded && onRewarded) onRewarded();
        },
        onError: (e) => {
          if (settled) return;
          settled = true; clearTimeout(timeoutId);
          console.error('[platform] rewarded ошибка/нет филла — выдано бесплатно:', e);
          if (onResume) onResume();
          if (onRewarded) onRewarded();
        }
      }
    });
  }

  return { init, gameReady, getLang, save, load, showInterstitial, showRewarded, BUILD, now, SAVE_SIZE_GUARD_BYTES };
})();

if (typeof module === 'object' && module.exports) module.exports = Platform;
