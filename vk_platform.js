/* ============================================================
   vk_platform.js — адаптер ВК Bridge под контракт platform.js.
   Публичный интерфейс идентичен platform.js (те же методы, имена,
   сигнатуры) — main.js не знает, какая платформа под капотом.
   Сверено с рабочим адаптером эталона game3/color_sort/vk_platform.js
   (S-11, ТЗ №10, чтение чужой папки — G-01), не по памяти (S-14).

   Вне ВК-клиента (локальная разработка) vkBridge нет — все методы
   тихо деградируют в mock, игра остаётся живой.
   ============================================================ */
const Platform = (() => {
  const SAVE_KEY = 'lanebattler_save';
  const INIT_TIMEOUT_MS = 2000;
  const AD_HANG_TIMEOUT_MS = 40000;
  // ВК не публикует официальный байтовый лимит хранилища в актуальной
  // доке (S-12) — «3500 байт» не подтверждён первоисточником. Взят тот
  // же консервативный запас, что эталон использует как временный
  // студийный бюджет, а не как проверенное число ВК.
  const SAVE_SIZE_GUARD_BYTES = 3500;
  const BUILD = '__VK_BUILD__';

  let ready = false;

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
    if (typeof vkBridge === 'undefined') {
      console.warn('[vk_platform] Bridge не найден — dev-режим (mock)');
      return false;
    }
    try {
      await withTimeout(vkBridge.send('VKWebAppInit'), INIT_TIMEOUT_MS);
      ready = true;
      console.log('[vk_platform] VK Bridge инициализирован');
      return true;
    } catch (e) {
      console.error('[vk_platform] VKWebAppInit не ответил/ошибка:', e);
      return false;
    }
  }

  // У ВК нет аналога LoadingAPI.ready() — метод-заглушка, чтобы main.js
  // звал Platform.gameReady() без ветвления по площадке.
  function gameReady() {}

  // ВК-билд лочится на русский — аудитория и карточка русскоязычные
  // (то же решение, что в эталоне).
  function getLang() { return 'ru'; }

  async function save(fullState) {
    if (!ready) {
      console.warn('[vk_platform] dev-режим: сейв пропущен', fullState);
      return { ok: true, error: null };
    }
    try {
      await vkBridge.send('VKWebAppStorageSet', { key: SAVE_KEY, value: JSON.stringify(fullState) });
      return { ok: true, error: null };
    } catch (e) {
      console.error('[vk_platform] VKWebAppStorageSet ошибка:', e);
      return { ok: false, error: e };
    }
  }

  async function load() {
    if (!ready) return { ok: true, data: null, error: null };
    try {
      const res = await vkBridge.send('VKWebAppStorageGet', { keys: [SAVE_KEY] });
      const entry = res.keys.find((k) => k.key === SAVE_KEY);
      if (!entry || !entry.value) return { ok: true, data: null, error: null }; // пустая строка — штатный ответ на отсутствующий ключ
      return { ok: true, data: JSON.parse(entry.value), error: null };
    } catch (e) {
      console.error('[vk_platform] VKWebAppStorageGet/парсинг ошибка:', e);
      return { ok: false, data: null, error: e };
    }
  }

  function showInterstitial(onPause, onResume, onBeforeShow) {
    if (onBeforeShow) onBeforeShow();
    if (!ready) { console.warn('[vk_platform] dev: interstitial пропущен'); if (onResume) onResume(); return; }
    if (onPause) onPause();
    vkBridge.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' })
      .then(() => { if (onResume) onResume(true); })
      .catch((e) => {
        console.error('[vk_platform] interstitial:', e);
        if (onResume) onResume(false);
      });
  }

  function showRewarded(onRewarded, onPause, onResume) {
    if (!ready) {
      console.log('[rewarded] запрос — dev-режим (нет Bridge), награда выдана без рекламы');
      if (onRewarded) onRewarded();
      if (onResume) onResume();
      return;
    }
    if (onPause) onPause();
    let settled = false;
    const finish = (grantReward, reason) => {
      if (settled) return;
      settled = true;
      if (onResume) onResume();
      console.log('[rewarded] завершён:', reason, '| награда:', grantReward);
      if (grantReward && onRewarded) onRewarded();
    };
    withTimeout(vkBridge.send('VKWebAppShowNativeAds', { ad_format: 'reward' }), AD_HANG_TIMEOUT_MS)
      .then(() => finish(true, 'ролик закрыт (resolve)'))
      .catch((e) => {
        console.warn('[vk_platform] rewarded недоступна/зависла — выдаём бесплатно:', e);
        finish(true, 'ошибка/таймаут — выдано бесплатно');
      });
  }

  return { init, gameReady, getLang, save, load, showInterstitial, showRewarded, BUILD, now, SAVE_SIZE_GUARD_BYTES };
})();

if (typeof module === 'object' && module.exports) module.exports = Platform;
