// Платформенный слой: Яндекс Игры (ИНАП) / VK (реклама за вознаграждение) /
// локальный тест без SDK. Единая точка входа для game.js — вызывающему коду
// не важно, на какой площадке он выполняется. См. КОНЦЕПТ_ГДД.md,
// «Допущения» (раздел про монетизацию, ночь 07→08.09.2026).
//
// Определение площадки (без сборки — один и тот же index.html грузится и на
// Яндексе, и на VK, и локально):
// 1) ?platform=yandex|vk|none в URL — ручной оверрайд для QA/локального
//    теста (используется в этой сессии для живой проверки всех трёх веток).
// 2) window.GAME_PLATFORM, если не 'auto' — жёсткий выбор конкретного
//    билда (можно прописать вручную перед заливкой в конкретную консоль,
//    чтобы вообще не полагаться на автоопределение).
// 3) vk_app_id в query — VK Games гарантированно подставляет этот параметр
//    сам при реальном запуске внутри VK, это надёжный сигнал реальной
//    площадки (важнее оверрайда, чтобы случайный ?platform= в шаренной
//    ссылке не сломал настоящий VK-запуск).
// 4) Иначе — короткая попытка инициализировать Yandex SDK (в настоящем
//    Яндекс-iframe она отвечает быстро); нет ответа за 1.5с — считаем, что
//    площадки нет, работаем в локальном тестовом режиме ('none').
'use strict';

window.GAME_PLATFORM = window.GAME_PLATFORM || 'auto';

const YANDEX_SDK_URL = 'https://yandex.ru/games/sdk/v2';
const VK_BRIDGE_URL = 'https://unpkg.com/@vkontakte/vk-bridge/dist/browser.min.js';

// ID товаров ИНАП в консоли Яндекс.Игр. ДОЛЖНЫ дословно совпадать с тем, что
// заведено в консоли основателем — это ручное действие вне кода (см. отчёт
// сессии: раздел «что сделать основателю»). Известный шрам студии: заведённый
// товар в консоли ≠ подключённые покупки, поэтому вся логика ниже обязана
// громко сообщать о недоступности, а не тихо прятать кнопку.
const YANDEX_PRODUCT_IDS = {
  dlcHardMode: 'dlc_hard_mode',
  dlcPlayerBuff: 'dlc_player_buff',
};

// Предохранитель на каждый вызов моста облачных сохранений (Яндекс
// player.setData/getData, VK VKWebAppStorageSet/Get) — то же число, что
// уже проверено в бою в vk_platform.js (см. ТЗ_ОБЛАЧНЫЕ_СОХРАНЕНИЯ.md,
// раздел 1): без него молчащий мост вешает игру на экране загрузки навсегда.
const STORAGE_TIMEOUT_MS = 5000;

const PLATFORM = (() => {
  let kind = 'none'; // 'yandex' | 'vk' | 'none' — итог определения площадки
  let ysdk = null;
  let yandexPayments = null;
  let yandexCatalog = null;
  let yandexPaymentsError = null;
  let yandexPlayer = null;
  let yandexPlayerError = null;
  let vkBridge = null;
  let pauseHook = () => {};
  let resumeHook = () => {};
  let readyResolve;
  const ready = new Promise((res) => { readyResolve = res; });
  let loadingReadyCalled = false;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('script-load-failed: ' + src));
      document.head.appendChild(s);
    });
  }
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);
  }

  async function initYandex() {
    await loadScript(YANDEX_SDK_URL);
    ysdk = await window.YaGames.init();
    kind = 'yandex';
    // Требование SDK Яндекса (п.1.13.1) — обязателен метод консумирования;
    // каталог нужен, чтобы показывать РЕАЛЬНУЮ цену из консоли (п.1.13.4),
    // а не захардкоженную в коде. Если что-то из этого не удалось — не
    // валим инициализацию площадки целиком, а запоминаем ошибку, чтобы
    // магазин мог громко предупредить при попытке купить (см. game.js).
    try {
      yandexPayments = await ysdk.getPayments({ signed: true });
      yandexCatalog = await yandexPayments.getCatalog();
    } catch (e) {
      yandexPaymentsError = e;
    }
    // Облачные сохранения (п.1.13.3) — тем же принципом, что и платежи выше:
    // сбой получения Player не валит инициализацию площадки целиком,
    // saveCloud/loadCloud просто вернут {ok:false} при отсутствии player.
    // Неавторизованный игрок — НЕ ошибка: getPlayer() даёт ID даже без
    // авторизации, setData/getData работают на этот ID как обычно.
    try {
      yandexPlayer = await ysdk.getPlayer();
    } catch (e) {
      yandexPlayerError = e;
    }
  }

  async function initVk() {
    await loadScript(VK_BRIDGE_URL);
    vkBridge = window.vkBridge;
    await vkBridge.send('VKWebAppInit');
    kind = 'vk';
  }

  // Локализация (Яндекс, п.2.14 — см. ТЗ_ЛОКАЛИЗАЦИЯ_11_ЯЗЫКОВ.md). Язык
  // определяется здесь, ПОСЛЕ того как kind/ysdk известны, и применяется
  // до readyResolve() — game.js ждёт PLATFORM.ready перед первым
  // showScreen(), поэтому игра не успевает отрисоваться на "неправильном"
  // языке (см. game.js, конец файла).
  //
  // ?lang=xx в URL — QA-оверрайд по аналогии с ?platform= выше, приоритетнее
  // автоопределения; нужен, чтобы проверять любой из 11 языков живьём без
  // подмены реального SDK-окружения (и как единственный практический способ
  // подтвердить фолбэк-цепочку кодом, которого нет среди 11, например ?lang=zz).
  //
  // ВАЖНО (2026-09-09, панель отладки Яндекса — "I18N is not used"): раньше
  // qaLang проверялся ПЕРВЫМ и делал ранний return — на самой площадке в
  // адресе игры тоже есть свой lang (площадка передаёт язык в query), поэтому
  // обращения к ysdk.environment.i18n.lang вообще не происходило НИ РАЗУ,
  // хотя визуально язык был верным (площадка сама подставляла тот же язык
  // в адрес). Площадка видит только факт обращения к SDK, а не итоговый
  // язык — поэтому теперь SDK читается ВСЕГДА первым (для площадки), а
  // qaLang применяется поверх результата вторым шагом, не вместо него.
  // Для игрока порядок не меняет итог: параметра lang в адресе либо нет,
  // либо он совпадает с языком SDK.
  function applyDetectedLanguage() {
    const params = new URLSearchParams(location.search);
    const qaLang = params.get('lang');
    if (kind === 'yandex' && ysdk && ysdk.environment && ysdk.environment.i18n) {
      // ysdk.environment.i18n.lang — может прийти с региональным суффиксом
      // (напр. "en-US"); I18N.setLang() сам сводит код к базовому языку
      // (см. i18n.js, normalize()). Живьём в настоящем Яндекс-iframe эта
      // сессия проверить не может (нет доступа к реальной площадке) — см.
      // открытый вопрос в отчёте.
      I18N.setLang(ysdk.environment.i18n.lang);
    } else if (kind === 'vk') {
      // ВК — решение основателя (08.09.2026, отдельно от общей задачи
      // локализации): на ВК только русский, жёстко, без оглядки на язык
      // браузера. ВК-карточка сознательно только RU (см. ПРОМО_ТЕКСТЫ_...md),
      // это не техническое упрощение, а прямое требование площадки по факту
      // решения основателя — см. КОНЦЕПТ_ГДД.md, «Допущения».
      I18N.setLang('ru');
    } else {
      // Локальный тест ('none') — язык через Yandex SDK не определяется и
      // ВК-ограничение тоже не при чём (это просто удобство разработки):
      // дефолт navigator.language при совпадении среди 11 языков, иначе ru.
      const navBase = (navigator.language || '').toLowerCase().split(/[-_]/)[0];
      I18N.setLang(I18N.isSupported(navBase) ? navBase : 'ru');
    }
    if (qaLang) { I18N.setLang(qaLang); }
  }

  // Панель отладки Яндекса, "ready" called on timeout (2026-09-09): площадка
  // ждёт сигнал "игра загрузилась" от ysdk.features.LoadingAPI.ready() и без
  // него убирает свой лоадер по таймауту — этот вызов отсутствовал вообще
  // (в коде был только внутренний readyResolve() для собственного промиса
  // PLATFORM.ready, к SDK Яндекса отношения не имеющего — не путать их
  // снова). Зовётся из game.js ровно в момент, когда игра действительно
  // готова показать первый экран (после синхронизации облачного прогресса),
  // а не сразу после YaGames.init() — иначе площадка снимет свой лоадер
  // раньше, чем у игрока успеет отрисоваться меню.
  function notifyLoadingReady() {
    if (loadingReadyCalled) return;
    loadingReadyCalled = true;
    if (kind === 'yandex' && ysdk && ysdk.features && ysdk.features.LoadingAPI) {
      ysdk.features.LoadingAPI.ready();
    }
  }

  async function detect() {
    const params = new URLSearchParams(location.search);
    const override = params.get('platform');
    const forced = window.GAME_PLATFORM !== 'auto' ? window.GAME_PLATFORM : null;
    try {
      if (params.has('vk_app_id')) {
        // Реальный запуск внутри VK отвечает быстро; таймаут — страховка на
        // случай, если VKWebAppInit вообще не получит ответ (сбой хоста),
        // чтобы определение площадки не зависало навсегда.
        await withTimeout(initVk(), 4000);
      } else if (forced === 'yandex' || (!forced && override === 'yandex')) {
        await initYandex();
      } else if (forced === 'vk' || (!forced && override === 'vk')) {
        await withTimeout(initVk(), 4000);
      } else if (forced === 'none' || (!forced && override === 'none')) {
        kind = 'none';
      } else if (/yandex/i.test(document.referrer)) {
        // Найдено живым тестом (не догадкой): настоящий YaGames SDK,
        // загруженный НЕ из реального Яндекс-iframe, всё равно резолвит
        // init() без ошибки (просто все дальнейшие вызовы — платежи,
        // реклама — падают внутри с "No parent to post message"). Без
        // проверки referrer ЛЮБАЯ загрузка страницы с обычным доступом в
        // интернет (включая локальный предпросмотр VK-сборки) ложно
        // определялась бы как Яндекс. Реальный Яндекс-iframe грузит игру
        // именно с домена yandex.* — это и есть настоящий сигнал, SDK сам
        // по себе таковым не является.
        await withTimeout(initYandex(), 1500);
      } else {
        kind = 'none';
      }
    } catch (e) {
      kind = 'none';
    }
    applyDetectedLanguage();
    readyResolve();
  }
  detect();

  // ---- реклама за вознаграждение ------------------------------------
  function showTestAd() {
    return new Promise((resolve) => {
      pauseHook();
      const overlay = document.createElement('div');
      overlay.className = 'ad-test-overlay';
      overlay.innerHTML =
        '<div class="ad-test-box">' +
        '<div class="ad-test-badge">' + I18N.t('adtest.badge') + '</div>' +
        '<p>' + I18N.t('adtest.desc') + '</p>' +
        '<div class="ad-test-bar"><div class="ad-test-bar-fill"></div></div>' +
        '</div>';
      document.body.appendChild(overlay);
      setTimeout(() => {
        overlay.remove();
        resumeHook();
        resolve(true);
      }, 2200);
    });
  }
  function showYandexRewarded() {
    return new Promise((resolve) => {
      if (!ysdk || !ysdk.adv) { resolve(false); return; }
      let rewarded = false;
      ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => { pauseHook(); },
          onRewarded: () => { rewarded = true; },
          onClose: () => { resumeHook(); resolve(rewarded); },
          onError: () => { resumeHook(); resolve(false); },
        },
      });
    });
  }
  function showVkRewarded() {
    return new Promise((resolve) => {
      if (!vkBridge) { resolve(false); return; }
      pauseHook();
      vkBridge.send('VKWebAppCheckNativeAds', { ad_format: 'reward' })
        .then((data) => {
          if (!data || !data.result) { resumeHook(); resolve(false); return; }
          return vkBridge.send('VKWebAppShowNativeAds', { ad_format: 'reward' })
            .then((res) => { resumeHook(); resolve(!!(res && res.result)); });
        })
        .catch(() => { resumeHook(); resolve(false); });
    });
  }

  // Проактивная проверка готовности рекламы ДО клика (утро 08.09.2026,
  // прямое решение основателя по вопросу №3 — «давай сделаем заранее»):
  // кнопка должна заранее показывать своё состояние, а не заставлять
  // игрока жать впустую. VK даёт для этого честный API
  // (VKWebAppCheckNativeAds — тот же метод, что вызывается перед показом,
  // документация явно рекомендует опережающий вызов). У Yandex Games SDK
  // публичного метода «проверить, не показывая» нет — там готовность
  // узнаётся только по факту показа (onError), поэтому для Яндекса эта
  // функция возвращает null («неизвестно») — game.js трактует null как
  // «оставить как было»: кнопка сразу кликабельна, ошибка — по факту клика.
  function checkVkRewardedAvailable() {
    if (!vkBridge) return Promise.resolve(false);
    return vkBridge.send('VKWebAppCheckNativeAds', { ad_format: 'reward' })
      .then((data) => !!(data && data.result))
      .catch(() => false);
  }

  // ---- ИНАП (только Яндекс — на VK/локально DLC покупается за
  // внутриигровую валюту напрямую в game.js, платформенный вызов не нужен)
  function purchaseYandexProduct(key) {
    return new Promise((resolve) => {
      if (kind !== 'yandex' || !ysdk) { resolve({ ok: false, reason: 'no-sdk' }); return; }
      if (yandexPaymentsError || !yandexCatalog) { resolve({ ok: false, reason: 'catalog-unavailable' }); return; }
      const productID = YANDEX_PRODUCT_IDS[key];
      const product = yandexCatalog.find((p) => p.id === productID);
      if (!product) { resolve({ ok: false, reason: 'product-missing' }); return; }
      yandexPayments.purchase({ id: productID })
        .then((purchase) => {
          yandexPayments.consumePurchase(purchase.purchaseToken).catch(() => {});
          resolve({ ok: true });
        })
        .catch((err) => {
          resolve({ ok: false, reason: 'purchase-failed', error: err });
        });
    });
  }

  // ---- облачные сохранения (см. ТЗ_ОБЛАЧНЫЕ_СОХРАНЕНИЯ.md) -----------
  // Ключ SAVE_KEY — тот же, что в localStorage (js/save.js), для
  // единообразия между площадками. Объект сейва пишется/читается целиком,
  // этот слой его не интерпретирует (слияние — в save.js).
  function saveCloudYandex(fullState) {
    if (!yandexPlayer) return Promise.resolve({ ok: false, error: yandexPlayerError || new Error('no-player') });
    return withTimeout(yandexPlayer.setData({ [SAVE_KEY]: fullState }, true), STORAGE_TIMEOUT_MS)
      .then(() => ({ ok: true, error: null }))
      .catch((e) => ({ ok: false, error: e }));
  }
  function loadCloudYandex() {
    if (!yandexPlayer) return Promise.resolve({ ok: false, data: null, error: yandexPlayerError || new Error('no-player') });
    return withTimeout(yandexPlayer.getData([SAVE_KEY]), STORAGE_TIMEOUT_MS)
      .then((result) => ({ ok: true, data: (result && result[SAVE_KEY]) || null, error: null }))
      .catch((e) => ({ ok: false, data: null, error: e }));
  }
  function saveCloudVk(fullState) {
    if (!vkBridge) return Promise.resolve({ ok: false, error: new Error('no-bridge') });
    return withTimeout(vkBridge.send('VKWebAppStorageSet', {
      key: SAVE_KEY,
      value: JSON.stringify(fullState),
    }), STORAGE_TIMEOUT_MS)
      .then(() => ({ ok: true, error: null }))
      .catch((e) => ({ ok: false, error: e }));
  }
  function loadCloudVk() {
    if (!vkBridge) return Promise.resolve({ ok: false, data: null, error: new Error('no-bridge') });
    return withTimeout(vkBridge.send('VKWebAppStorageGet', { keys: [SAVE_KEY] }), STORAGE_TIMEOUT_MS)
      .then((res) => {
        const entry = res.keys.find((k) => k.key === SAVE_KEY);
        // Пустая строка — штатный ответ ВК для отсутствующего ключа
        // (первый запуск, не битый сейв), не пытаемся её парсить.
        if (!entry || !entry.value) return { ok: true, data: null, error: null };
        return { ok: true, data: JSON.parse(entry.value), error: null };
      })
      .catch((e) => ({ ok: false, data: null, error: e }));
  }

  return {
    ready,
    notifyLoadingReady,
    kind: () => kind,
    saveCloud(fullState) {
      if (kind === 'yandex') return saveCloudYandex(fullState);
      if (kind === 'vk') return saveCloudVk(fullState);
      return Promise.resolve({ ok: true, error: null });
    },
    loadCloud() {
      if (kind === 'yandex') return loadCloudYandex();
      if (kind === 'vk') return loadCloudVk();
      return Promise.resolve({ ok: true, data: null, error: null });
    },
    setPauseHooks(pause, resume) { pauseHook = pause; resumeHook = resume; },
    showRewardedVideo() {
      if (kind === 'yandex') return showYandexRewarded();
      if (kind === 'vk') return showVkRewarded();
      return showTestAd();
    },
    // true/false — площадка умеет проверять заранее, результат достоверен;
    // null — площадка (Yandex) такой проверки не даёт, вызывающий код
    // должен вести себя как раньше (не гейтить кнопку проверкой).
    checkRewardedAvailable() {
      if (kind === 'vk') return checkVkRewardedAvailable();
      if (kind === 'yandex') return Promise.resolve(null);
      return Promise.resolve(true); // локальный тест — заглушка всегда «готова»
    },
    purchaseYandexProduct,
    getYandexProductPrice(key) {
      if (!yandexCatalog) return null;
      const productID = YANDEX_PRODUCT_IDS[key];
      const product = yandexCatalog.find((p) => p.id === productID);
      return product ? product.price : null;
    },
    isYandexCatalogBroken() { return kind === 'yandex' && (!!yandexPaymentsError || !yandexCatalog); },
    // Восстановление незавершённых покупок прошлых сессий (сбой сети/закрытие
    // вкладки между purchase() и consumePurchase()) — вызывается один раз из
    // game.js после загрузки progress, чтобы не потерять оплаченный контент.
    reconcilePurchases(onGrant) {
      if (kind !== 'yandex' || !yandexPayments) return Promise.resolve();
      return yandexPayments.getPurchases()
        .then((purchases) => {
          for (const p of purchases) {
            const key = Object.keys(YANDEX_PRODUCT_IDS).find((k) => YANDEX_PRODUCT_IDS[k] === p.productID);
            if (key) {
              onGrant(key);
              yandexPayments.consumePurchase(p.purchaseToken).catch(() => {});
            }
          }
        })
        .catch(() => {});
    },
  };
})();
