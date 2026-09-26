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

// Модерация (2026-09-14, отчёт по замечанию 1.19.1): грузили старый/неверный
// URL SDK (games/sdk/v2 на yandex.ru, не из документации) — debug-панель
// площадки показывала индикатор "IF" (старый лоадер). Игра размещена архивом
// через Консоль разработчика (не свой домен) — поэтому по документации путь
// должен быть ОТНОСИТЕЛЬНЫМ '/sdk.js', его отдаёт сервер Яндекса сам после
// заливки билда; абсолютный путь до SDK на CDN Яндекса из документации
// нужен только для размещения на собственном домене, здесь не тот случай.
// ВАЖНО: не писать сюда литералом сам этот CDN-адрес (даже в комментарии) —
// автопроверка архива в Консоли ловит его как "ссылка на сервисное
// хранилище" и заново отклоняет билд (найдено 2026-09-14 на этой самой
// правке — см. yandex_report/10_1.png, отдельная итерация отчёта).
const YANDEX_SDK_URL = '/sdk.js';
// VK Bridge — локальная копия @vkontakte/vk-bridge@3.0.2 (MIT), не unpkg
// (24.09.2026, долгий старт на ВК): раньше грузился с unpkg без версии —
// лишний редирект и сторонний CDN прямо на пути к VKWebAppInit.
const VK_BRIDGE_URL = 'js/vendor/vk-bridge.min.js';

// ID товаров ИНАП в консоли Яндекс.Игр. ДОЛЖНЫ дословно совпадать с тем, что
// заведено в консоли основателем — это ручное действие вне кода (см. отчёт
// сессии: раздел «что сделать основателю»). Известный шрам студии: заведённый
// товар в консоли ≠ подключённые покупки, поэтому вся логика ниже обязана
// громко сообщать о недоступности, а не тихо прятать кнопку.
const YANDEX_PRODUCT_IDS = {
  dlcHardMode: 'dlc_hard_mode',
  dlcPlayerBuff: 'dlc_player_buff',
};

// AES-ключ лидерборда CrazyGames (SDK.user.submitScore, методичка
// МЕТОДИЧКА_ВЫВОД_НА_CRAZYGAMES.md §9) — заводится вместе с включением
// лидерборда в Developer Portal, это действие основателя вне кода (см.
// ТЗ_CRAZYGAMES_ИНТЕГРАЦИЯ.md, «Вход»). Пустая строка — явный, узнаваемый
// плейсхолдер, не забытое пустое значение: submitScoreCrazyGames() ниже
// проверяет его и громко предупреждает в консоль вместо тихого падения.
const CRAZYGAMES_LEADERBOARD_KEY = ''; // TODO(основатель): вставить base64-ключ лидерборда из Developer Portal

// Предохранитель на каждый вызов моста облачных сохранений (Яндекс
// player.setData/getData, VK VKWebAppStorageSet/Get) — то же число, что
// уже проверено в бою в vk_platform.js (см. ТЗ_ОБЛАЧНЫЕ_СОХРАНЕНИЯ.md,
// раздел 1): без него молчащий мост вешает игру на экране загрузки навсегда.
const STORAGE_TIMEOUT_MS = 5000;
// Тот же принцип — на getPayments/getCatalog/getPlayer (см. 2026-09-14,
// регрессия п.2.14 ниже: эти вызовы раньше не имели таймаута вообще).
const YANDEX_API_TIMEOUT_MS = 5000;

const PLATFORM = (() => {
  let kind = 'none'; // 'yandex' | 'vk' | 'none' — итог определения площадки
  let ysdk = null;
  let yandexPayments = null;
  let yandexCatalog = null;
  let yandexPaymentsError = null;
  let yandexPlayer = null;
  let yandexPlayerError = null;
  let vkBridge = null;
  // "local" | "crazygames" | "disabled" — прямой флаг режима SDK (методичка
  // §1), не наша эвристика. На "disabled" все вызовы SDK бросают исключение
  // (чужой домен вне whitelist игры) — дальше SDK вообще не дёргается.
  let crazygamesEnv = null;
  let gameplayActive = false;
  let pauseHook = () => {};
  let resumeHook = () => {};
  let readyResolve;
  const ready = new Promise((res) => { readyResolve = res; });
  let loadingReadyCalled = false;
  // Готовность платежей/плеера ОТДЕЛЬНО от `ready` (см. initYandex ниже) —
  // и язык, и первый экран не должны ждать эти вызовы.
  let paymentsResolve;
  const paymentsReady = new Promise((res) => { paymentsResolve = res; });

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
    // Модерация (2026-09-14, регрессия п.2.14 — "автоопределение языка не
    // реализовано", индикатор у модератора остаётся красным): раньше
    // getPayments/getCatalog/getPlayer вызывались ЗДЕСЬ, последовательно,
    // БЕЗ таймаута — detect() (а значит и applyDetectedLanguage(), и
    // readyResolve(), и через него notifyLoadingReady()) не мог завершиться,
    // пока не отработают ВСЕ три вызова. Известный шрам студии — "заведённый
    // товар в консоли ≠ подключённые покупки" — намекает, что эти вызовы
    // сами по себе не всегда быстрые/надёжные; если в окружении модератора
    // хоть один из них подвисает (не резолвится и не реджектится), язык
    // никогда не определяется, хотя SDK и площадка тут вообще ни при чём.
    // Требование 2.14 явно: детект языка — на старте, индикатор должен
    // зажечься сразу, а не когда-нибудь после сети. Поэтому платежи/плеер
    // теперь грузятся ПАРАЛЛЕЛЬНО, не блокируя ни язык, ни первый экран —
    // см. initYandexPaymentsAndPlayer() и PLATFORM.paymentsReady в game.js.
    initYandexPaymentsAndPlayer();
  }

  // Требование SDK Яндекса (п.1.13.1) — обязателен метод консумирования;
  // каталог нужен, чтобы показывать РЕАЛЬНУЮ цену из консоли (п.1.13.4),
  // а не захардкоженную в коде. Если что-то из этого не удалось — не валим
  // инициализацию площадки целиком, а запоминаем ошибку, чтобы магазин мог
  // громко предупредить при попытке купить (см. game.js). Каждый вызов —
  // со своим таймаутом (см. YANDEX_API_TIMEOUT_MS выше), намеренно НЕ
  // await'ится из initYandex() — см. комментарий там.
  async function initYandexPaymentsAndPlayer() {
    try {
      yandexPayments = await withTimeout(ysdk.getPayments({ signed: true }), YANDEX_API_TIMEOUT_MS);
      yandexCatalog = await withTimeout(yandexPayments.getCatalog(), YANDEX_API_TIMEOUT_MS);
    } catch (e) {
      yandexPaymentsError = e;
    }
    // Облачные сохранения (п.1.13.3) — тем же принципом, что и платежи выше:
    // сбой получения Player не валит инициализацию площадки целиком,
    // saveCloud/loadCloud просто вернут {ok:false} при отсутствии player.
    // Неавторизованный игрок — НЕ ошибка: getPlayer() даёт ID даже без
    // авторизации, setData/getData работают на этот ID как обычно.
    try {
      yandexPlayer = await withTimeout(ysdk.getPlayer(), YANDEX_API_TIMEOUT_MS);
    } catch (e) {
      yandexPlayerError = e;
    }
    paymentsResolve();
  }

  async function initVk() {
    await loadScript(VK_BRIDGE_URL);
    BOOT.mark('VK Bridge загружен');
    vkBridge = window.vkBridge;
    await vkBridge.send('VKWebAppInit');
    BOOT.mark('VKWebAppInit — ответ ВК');
    kind = 'vk';
  }

  // Баннерной рекламы в ВК нет (решение основателя 25.09.2026: боковой
  // баннер снят целиком). Монетизация ВК — только rewarded/interstitial.

  // CrazyGames (методичка МЕТОДИЧКА_ВЫВОД_НА_CRAZYGAMES.md, §1-§2). В
  // отличие от Yandex/VK, скрипт SDK не грузится отсюда через loadScript() —
  // тег `<script src=".../crazygames-sdk-v3.js">` инжектится ТОЛЬКО в
  // CrazyGames-сборку самим build_release.py (§12), до всех остальных
  // <script> игры, поэтому к моменту выполнения этого файла window.CrazyGames
  // уже должен существовать на этой сборке.
  async function initCrazyGames() {
    if (!window.CrazyGames || !window.CrazyGames.SDK) {
      throw new Error('crazygames-sdk-not-present');
    }
    await window.CrazyGames.SDK.init();
    kind = 'crazygames';
    crazygamesEnv = window.CrazyGames.SDK.environment; // "local" | "crazygames" | "disabled"
    if (crazygamesEnv === 'disabled') return; // §1/§12 — вне local/crazygames вызовы SDK бросают исключение, дальше не дёргаем
    const sdkGame = window.CrazyGames.SDK.game;
    sdkGame.loadingStart();
    // muteAudio должен иметь приоритет над собственным тумблером звука игры
    // (§2) — слушатель применяется сразу к текущему значению И на каждое
    // изменение, SFX/MUSIC.setPlatformMuted() см. js/audio.js.
    const applyMuteSetting = (settings) => {
      const forced = !!(settings && settings.muteAudio);
      SFX.setPlatformMuted(forced);
      MUSIC.setPlatformMuted(forced);
    };
    sdkGame.addSettingsChangeListener(applyMuteSetting);
    if (sdkGame.settings) applyMuteSetting(sdkGame.settings);
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
    } else if (kind === 'crazygames') {
      // CrazyGames — фолбэк EN, НЕ RU (в отличие от ВК выше) — требование
      // площадки (методичка §3, Gameplay Requirements/Basic Implementation)
      // и решение основателя 17.09.2026 (см. КОНЦЕПТ_ГДД.md, «Допущения»).
      // I18N.setLang() сама фолбэчится на 'en', если locale отсутствует или
      // не входит в 11 языков (i18n.js, normalize()) — ручной разбор кода
      // региона здесь не нужен, тот же путь, что уже работает для Яндекса.
      const locale = (crazygamesEnv !== 'disabled' && window.CrazyGames && window.CrazyGames.SDK.user
        && window.CrazyGames.SDK.user.systemInfo) ? window.CrazyGames.SDK.user.systemInfo.locale : null;
      I18N.setLang(locale);
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
    // ВАЖНО (2026-09-14, регрессия п.2.14 — см. detect() ниже): флаг
    // ставим ТОЛЬКО когда реально вызвали ysdk.features.LoadingAPI.ready(),
    // а не при каждом заходе в функцию. Раньше флаг ставился всегда — если
    // первый вызов пришёлся на момент, когда kind ещё не успел стать
    // 'yandex' (see race в detect()), настоящий вызов ready() блокировался
    // этим же флагом НАВСЕГДА, хотя SDK чуть позже всё-таки инициализировался.
    if (kind === 'yandex' && ysdk && ysdk.features && ysdk.features.LoadingAPI) {
      loadingReadyCalled = true;
      ysdk.features.LoadingAPI.ready();
    } else if (kind === 'crazygames' && crazygamesEnv !== 'disabled' && window.CrazyGames && window.CrazyGames.SDK.game) {
      // Симметрично Яндексу выше — тот же принцип "не раньше реальной
      // готовности первого экрана", тот же шрам (методичка §2, race condition
      // в detect() у Яндекса — не наступать на него здесь).
      loadingReadyCalled = true;
      window.CrazyGames.SDK.game.loadingStop();
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
      } else if (forced === 'crazygames' || (!forced && override === 'crazygames')) {
        // Таймаут-страховка тем же числом, что у VK выше — на реальной
        // CrazyGames-сборке SDK уже загружен синхронным тегом (см.
        // initCrazyGames()), init() резолвится быстро; страховка на случай
        // сетевого сбоя того же SDK-скрипта.
        await withTimeout(initCrazyGames(), 4000);
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
        //
        // РЕГРЕССИЯ п.2.14 (2026-09-14, найдена по скриншотам панели
        // отладки основателя — "ready called on timeout" И "I18N is not
        // used" ОДНОВРЕМЕННО с "SDK was initialized" в той же панели):
        // раньше здесь стоял withTimeout(initYandex(), 1500) — 1.5с мало
        // для script load + YaGames.init() при небыстрой сети, и
        // Promise.race молча "сдавался" в kind='none' НАВСЕГДА, пока сам
        // initYandex() продолжал крутиться в фоне и позже ВСЁ-ТАКИ успешно
        // ставил kind='yandex' — но applyDetectedLanguage()/readyResolve()
        // к этому моменту уже отработали на 'none', а второго шанса не
        // было. Отсюда и SDK "инициализирован" (правда), и язык "не
        // определён" (тоже правда, просто по другой причине, чем кажется).
        // Таймаут увеличен для меньшей вероятности гонки, НО главное — при
        // опоздании больше не отбрасываем результат: если initYandex()
        // всё же завершится успехом ПОСЛЕ таймаута, переприменяем язык и
        // (через notifyLoadingReady(), см. её же фикс выше) лоадер.
        const yandexAttempt = initYandex();
        try {
          await withTimeout(yandexAttempt, 8000);
        } catch (e) {
          yandexAttempt.then(() => {
            applyDetectedLanguage();
            I18N.applyToDOM();
            notifyLoadingReady();
          }).catch(() => {});
        }
      } else {
        kind = 'none';
      }
    } catch (e) {
      BOOT.mark('площадка не ответила: ' + (e && e.message));
      kind = 'none';
    }
    applyDetectedLanguage();
    BOOT.mark('площадка определена: ' + kind);
    readyResolve();
    // paymentsReady резолвится ВНУТРИ initYandexPaymentsAndPlayer() для
    // Яндекса (после реальной попытки загрузки) — здесь нужно резолвнуть
    // его самостоятельно для ВК/локального теста, иначе PLATFORM.paymentsReady
    // (см. game.js) никогда не сработает на этих площадках.
    if (kind !== 'yandex') paymentsResolve();
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
  // use_waterfall — официальное поле vk-bridge (snake_case, см. типы пакета
  // ShowNativeAdsRequest/CheckNativeAdsRequest): при нехватке rewarded-роликов
  // площадка подставляет interstitial вместо отказа.
  const VK_REWARD_PARAMS = { ad_format: 'reward', use_waterfall: true };
  // Баг 25.09.2026 (скрин основателя, дважды подряд): показ rewarded был
  // обёрнут в таймаут 40с — загрузка + ролик + финальная карточка ВК
  // дольше, игра объявляла «реклама недоступна» ПОВЕРХ идущего ролика, а
  // поздний ответ ВК «досмотрено» выбрасывался — награда терялась. VK
  // отвечает на ShowNativeAds только после закрытия рекламы, поэтому ответ
  // ждём сколько угодно. Предохранитель ниже — только от немого моста:
  // через 3 мин снимает паузу игры/звука, но ответ ВК по-прежнему ждёт.
  const VK_AD_HANG_GUARD_MS = 180000;
  function showVkRewarded() {
    return new Promise((resolve) => {
      if (!vkBridge) { resolve(false); return; }
      pauseHook();
      let resumed = false;
      const resumeOnce = () => { if (!resumed) { resumed = true; resumeHook(); } };
      const guard = setTimeout(resumeOnce, VK_AD_HANG_GUARD_MS);
      const finish = (rewarded) => { clearTimeout(guard); resumeOnce(); resolve(rewarded); };
      vkBridge.send('VKWebAppShowNativeAds', VK_REWARD_PARAMS)
        .then((res) => finish(!!(res && res.result)))
        .catch(() => finish(false));
    });
  }

  // ---- межуровневая реклама (VK/Яндекс; на CrazyGames midgame отключён
  // решением основателя, локально — no-op) --------------------------------
  const INTERSTITIAL_TIMEOUT_MS = 15000;
  // Тот же баг 25.09: таймаут 15с запускал следующую миссию прямо под ещё
  // идущей рекламой. Здесь ответ ВК ждём до предохранителя — дальше игра
  // обязана продолжиться в любом исходе (ГДД, межуровневая по «Далее»).
  function showVkInterstitial() {
    if (!vkBridge) return Promise.resolve(false);
    pauseHook();
    return withTimeout(vkBridge.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' }), VK_AD_HANG_GUARD_MS)
      .then((res) => !!(res && res.result))
      .catch(() => false)
      .then((shown) => { resumeHook(); return shown; });
  }
  function showYandexInterstitial() {
    return new Promise((resolve) => {
      if (!ysdk || !ysdk.adv) { resolve(false); return; }
      let settled = false;
      const finish = (shown) => { if (settled) return; settled = true; resumeHook(); resolve(shown); };
      // Если SDK не ответил ни одним колбэком — игра не должна застрять.
      const guard = setTimeout(() => finish(false), INTERSTITIAL_TIMEOUT_MS * 4);
      ysdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: () => { clearTimeout(guard); pauseHook(); },
          onClose: (wasShown) => { clearTimeout(guard); finish(!!wasShown); },
          onError: () => { clearTimeout(guard); finish(false); },
          onOffline: () => { clearTimeout(guard); finish(false); },
        },
      });
    });
  }
  // По семантике совпадает с showYandexRewarded()/showVkRewarded() выше —
  // та же кнопка "реклама"+награда, та же опциональность, пауза на весь
  // запрос до adFinished ИЛИ adError (ТЗ_CRAZYGAMES_ИНТЕГРАЦИЯ.md, п.3).
  // Midgame — НЕ реализуется (решение основателя, см. КОНЦЕПТ_ГДД.md).
  function showCrazyGamesRewarded() {
    return new Promise((resolve) => {
      if (kind !== 'crazygames' || crazygamesEnv === 'disabled' || !window.CrazyGames.SDK.ad) { resolve(false); return; }
      pauseHook();
      window.CrazyGames.SDK.ad.requestAd('rewarded', {
        adStarted: () => {},
        adFinished: () => { resumeHook(); resolve(true); },
        adError: (error) => {
          // adsDisabledBasicLaunch — штатный случай на Basic Launch
          // (методичка §4/§10, ГДД «Basic Launch первым шагом»), не баг —
          // не шумим в консоль на него, в отличие от прочих кодов ошибки.
          if (!error || error.code !== 'adsDisabledBasicLaunch') {
            console.warn('[platform] CrazyGames rewarded ad error:', error && error.code);
          }
          resumeHook();
          resolve(false);
        },
      });
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
    return withTimeout(vkBridge.send('VKWebAppCheckNativeAds', VK_REWARD_PARAMS), STORAGE_TIMEOUT_MS)
      .then((data) => !!(data && data.result))
      .catch(() => false);
  }
  // Проверка у VK заодно подгружает ролик — зовём заранее, на экране итога,
  // чтобы к нажатию «Далее» межуровневая реклама была готова.
  function preloadVkInterstitial() {
    if (!vkBridge) return;
    withTimeout(vkBridge.send('VKWebAppCheckNativeAds', { ad_format: 'interstitial' }), STORAGE_TIMEOUT_MS)
      .catch(() => {});
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
          // Модерация (2026-09-14, замечание 8, п.1.13.1): раньше
          // consumePurchase() не await'ился (fire-and-forget) и его ошибка
          // тихо гасилась — платформа не могла отличить "консюм прошёл" от
          // "не прошёл и потерялся навсегда". Теперь ждём его результат
          // явно; ревард всё равно выдаём (resolve ok:true) независимо от
          // исхода консюма — оплата у игрока уже прошла, отказывать в
          // товаре из-за сбоя чисто учётного вызова нельзя. Если консюм не
          // удался — не глушим молча, а логируем громко, и он же
          // подхватится на следующий запуск через PLATFORM.reconcilePurchases()
          // (см. game.js) — purchaseToken останется в getPurchases() до
          // тех пор, пока не будет успешно закрыт.
          return yandexPayments.consumePurchase(purchase.purchaseToken)
            .catch((consumeErr) => {
              console.error('[platform] consumePurchase failed, будет повторено при следующем запуске:', consumeErr);
            })
            .then(() => resolve({ ok: true }));
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

  // CrazyGames Data Module (методичка §7). В отличие от Yandex/VK выше — НЕ
  // асинхронный мост с таймаутом, а синхронный API, буквально повторяющий
  // localStorage (setItem/getItem/removeItem). Документация прямо
  // предупреждает: игра не должна писать/читать window.localStorage
  // напрямую на этой площадке, только через SDK.data.* — площадка сама
  // решает физическое хранилище (гостевой localStorage или аккаунт).
  function crazyGamesActive() {
    return kind === 'crazygames' && crazygamesEnv !== 'disabled' && !!(window.CrazyGames && window.CrazyGames.SDK);
  }
  function crazyGamesDataAvailable() {
    return crazyGamesActive() && !!window.CrazyGames.SDK.data;
  }
  // Публикуется отдельно от saveCloud/loadCloud (ниже) — js/save.js
  // использует эти два метода напрямую вместо localStorage.getItem/setItem
  // на ветке crazygames (см. ТЗ_CRAZYGAMES_ИНТЕГРАЦИЯ.md, п.4, «критично»).
  function crazyGamesDataGet(key) {
    if (!crazyGamesDataAvailable()) return null;
    try { return window.CrazyGames.SDK.data.getItem(key); }
    catch (e) { console.warn('[platform] CrazyGames data.getItem failed:', e); return null; }
  }
  function crazyGamesDataSet(key, value) {
    if (!crazyGamesDataAvailable()) return;
    try { window.CrazyGames.SDK.data.setItem(key, value); }
    catch (e) { console.warn('[platform] CrazyGames data.setItem failed:', e); }
  }
  function saveCloudCrazyGames(fullState) {
    if (!crazyGamesDataAvailable()) return Promise.resolve({ ok: false, error: new Error('no-sdk') });
    try {
      window.CrazyGames.SDK.data.setItem(SAVE_KEY, JSON.stringify(fullState));
      return Promise.resolve({ ok: true, error: null });
    } catch (e) {
      return Promise.resolve({ ok: false, error: e });
    }
  }
  function loadCloudCrazyGames() {
    if (!crazyGamesDataAvailable()) return Promise.resolve({ ok: false, data: null, error: new Error('no-sdk') });
    try {
      const raw = window.CrazyGames.SDK.data.getItem(SAVE_KEY);
      return Promise.resolve({ ok: true, data: raw ? JSON.parse(raw) : null, error: null });
    } catch (e) {
      return Promise.resolve({ ok: false, data: null, error: e });
    }
  }

  // ---- лидерборд CrazyGames (методичка §9, клиентский путь Leaderboards
  // SDK — единственный доступный без бэкенда). Сервер требует AES-GCM
  // шифрование очка перед отправкой — код encryptScoreCrazyGames() ниже
  // взят дословно из примера в документации CrazyGames
  // (docs.crazygames.com/sdk/leaderboards-client/), не придуман заново.
  async function encryptScoreCrazyGames(score) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const algorithm = { name: 'AES-GCM', iv };
    const keyBytes = new Uint8Array(
      atob(CRAZYGAMES_LEADERBOARD_KEY).split('').map((c) => c.charCodeAt(0))
    );
    const cryptoKey = await window.crypto.subtle.importKey('raw', keyBytes, algorithm, false, ['encrypt']);
    const dataBuffer = new TextEncoder().encode(score.toString());
    const encryptedBuffer = await window.crypto.subtle.encrypt(algorithm, cryptoKey, dataBuffer);
    const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedBuffer), iv.length);
    return btoa(String.fromCharCode(...combined));
  }
  async function submitScoreCrazyGames(score) {
    if (!crazyGamesActive() || !window.CrazyGames.SDK.user) {
      return { ok: false, reason: 'no-sdk' };
    }
    if (!CRAZYGAMES_LEADERBOARD_KEY) {
      // Ключ ещё не заведён основателем в Developer Portal (см. константу
      // выше) — громкое предупреждение вместо тихого падения/пустого вызова.
      console.warn('[platform] CRAZYGAMES_LEADERBOARD_KEY не задан — submitScore пропущен.');
      return { ok: false, reason: 'no-key' };
    }
    try {
      const encryptedScore = await encryptScoreCrazyGames(score);
      window.CrazyGames.SDK.user.submitScore({ score, encryptedScore });
      return { ok: true };
    } catch (e) {
      console.error('[platform] CrazyGames submitScore failed:', e);
      return { ok: false, reason: 'error', error: e };
    }
  }

  return {
    ready,
    // Готовность платежей/каталога/плеера — отдельно от `ready` (см.
    // initYandex): язык и первый экран не ждут её, но магазину и
    // reconcilePurchases() всё равно нужно знать момент, когда эти данные
    // реально появились (см. game.js).
    paymentsReady,
    notifyLoadingReady,
    kind: () => kind,
    saveCloud(fullState) {
      if (kind === 'yandex') return saveCloudYandex(fullState);
      if (kind === 'vk') return saveCloudVk(fullState);
      if (kind === 'crazygames') return saveCloudCrazyGames(fullState);
      return Promise.resolve({ ok: true, error: null });
    },
    loadCloud() {
      if (kind === 'yandex') return loadCloudYandex();
      if (kind === 'vk') return loadCloudVk();
      if (kind === 'crazygames') return loadCloudCrazyGames();
      return Promise.resolve({ ok: true, data: null, error: null });
    },
    // js/save.js использует эти два метода напрямую вместо localStorage.*
    // на ветке crazygames (см. ТЗ_CRAZYGAMES_ИНТЕГРАЦИЯ.md, п.4) — на других
    // площадках crazyGamesDataAvailable() внутри всегда false, вызовы no-op.
    crazyGamesDataGet,
    crazyGamesDataSet,
    setPauseHooks(pause, resume) { pauseHook = pause; resumeHook = resume; },
    // Вызывается из game.js, showScreen() — гейминг-lifecycle CrazyGames
    // (методичка §2) шире прежних pauseHook/resumeHook (те — только вокруг
    // рекламы): активный геймплей — это экран 'match', всё остальное (меню,
    // пауза, итог, магазин) — не активный геймплей. На остальных площадках
    // no-op (см. проверку kind внутри).
    setGameplayActive(active) {
      if (kind !== 'crazygames' || crazygamesEnv === 'disabled') return;
      if (active === gameplayActive) return;
      gameplayActive = active;
      if (!window.CrazyGames || !window.CrazyGames.SDK.game) return;
      if (active) window.CrazyGames.SDK.game.gameplayStart();
      else window.CrazyGames.SDK.game.gameplayStop();
    },
    showRewardedVideo() {
      const p = kind === 'yandex' ? showYandexRewarded()
        : kind === 'vk' ? showVkRewarded()
        : kind === 'crazygames' ? showCrazyGamesRewarded()
        : showTestAd();
      // Воронка (js/analytics.js, раунд 15): итог ролика — ad_reward_ok/fail.
      return p.then((ok) => {
        try { if (typeof Analytics !== 'undefined') Analytics.adReward(!!ok); } catch (e) { /* аналитика не ломает рекламу */ }
        return ok;
      });
    },
    // true/false — площадка умеет проверять заранее, результат достоверен;
    // null — площадка (Yandex/CrazyGames) такой проверки не даёт, вызывающий
    // код должен вести себя как раньше (не гейтить кнопку проверкой).
    checkRewardedAvailable() {
      if (kind === 'vk') return checkVkRewardedAvailable();
      if (kind === 'yandex' || kind === 'crazygames') return Promise.resolve(null);
      return Promise.resolve(true); // локальный тест — заглушка всегда «готова»
    },
    // Всегда резолвится (true — ролик показан), не бросает: вызывающий код
    // продолжает переход между миссиями в любом исходе.
    showInterstitial() {
      if (kind === 'vk') return showVkInterstitial();
      if (kind === 'yandex') return showYandexInterstitial();
      return Promise.resolve(false);
    },
    supportsInterstitial() { return kind === 'vk' || kind === 'yandex'; },
    preloadInterstitial() { if (kind === 'vk') preloadVkInterstitial(); },
    // Лидерборд (только CrazyGames — см. методичку §9, ГДД «Допущения»).
    // Что именно передаётся как `score` — решает вызывающий код (game.js),
    // этот слой только шифрует и отправляет.
    submitScore(score) {
      if (kind === 'crazygames') return submitScoreCrazyGames(score);
      return Promise.resolve({ ok: false, reason: 'not-supported' });
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
              yandexPayments.consumePurchase(p.purchaseToken)
                .catch((e) => console.error('[platform] reconcile consumePurchase failed, повторим на следующий запуск:', e));
            }
          }
        })
        .catch((e) => console.error('[platform] reconcilePurchases: getPurchases failed:', e));
    },
  };
})();
