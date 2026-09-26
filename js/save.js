// Прогресс кампании — только localStorage, без сохранения середины миссии
// (см. ГДД, «Явно НЕ входит в MVP»).
'use strict';

const SAVE_KEY = 'dve-kreposti-progress-v1';

function defaultProgress() {
  return {
    unlocked: 1, muted: false,
    // Магазин между раундами (см. ПЛАН.md, раунд 3) — валюта копится из
    // убийств за миссию и переносится между сессиями.
    // Фикс дублирования при слиянии (ТЗ_ФИКС_СЛИЯНИЕ_ВАЛЮТЫ.md): вместо
    // одного поля, которое мержится через Math.max (баг — трата "теряется"
    // при слиянии со старым большим облачным балансом), храним два
    // неубывающих счётчика; актуальный баланс — вычисляемое поле, см.
    // recalcShopCurrency().
    shopCurrencyEarned: 0,
    shopCurrencySpent: 0,
    towerA: false, towerB: false, trap: false,
    gearSword: 0, gearShield: 0, gearArmor: 0, // уровни 0-3
    gearLongBlade: 0, // утро: уровень 0-3, +10%/уровень дальности герою, компенсация за откат facing-фикса
    ownedThemeBlueRed: false, activeTheme: 'classic', // утро: тема оформления — покупка, применяется на весь интерфейс
    ownedCloakRed: false, // утро: плащ героя — покупка, косметика
    cosmeticTime: 'cycle', // cycle | day | night — ТЕКУЩИЙ выбор, не владение
    cosmeticFlag: 'default', // default | gold
    // Ночная правка (баг-репорт всех трёх ревьюеров): владение отдельно от
    // текущего выбора — покупка разблокирует навсегда, cosmeticTime можно
    // свободно переключать между купленными вариантами без потери денег и
    // без потери прежней покупки (было: одно поле на двоих, вторая покупка
    // молча гасила первую, дороги обратно к циклу не было вообще).
    ownedTimeDay: false, ownedTimeNight: false,
    // Раунд 5: музыка (см. ПЛАН.md) — трек по умолчанию бесплатный и всегда
    // "куплен"; DLC — локальная разблокировка-заглушка (см. КОНЦЕПТ_ГДД.md).
    musicTrack2: false, musicTrack3: false,
    // Ночная правка (аудит ревьюера №3): DLC было необратимо навсегда без
    // отмены — владение отдельно от текущего состояния эффекта, тот же
    // паттерн, что и день/ночь.
    dlcHardMode: false, dlcHardModeActive: false, // DLC "Усилить врага"
    dlcPlayerBuff: false, dlcPlayerBuffActive: false, // DLC "Усилить себя" (утренняя правка)
    introSeen: false, // раунд 5: при самом первом запуске игра сразу открывает миссию 1
    trap2: false, towerC: false, startGoldBoost: false, buybackDiscount: false, // раунд 8
    heroAbilityCry: false, // раунд 9
    // Раунд 10: реальные mp3-треки — плейлист боя (порядок/вкл-выкл/шаффл),
    // musicMuted — НЕЗАВИСИМЫЙ от muted (тот теперь только SFX) канал
    // громкости, требование основателя "никогда не смешивать" (см. ГДД).
    musicMuted: false,
    playlist: { order: [...MUSIC_ORDER_DEFAULT], enabled: { battle_theme: true, battle_march: true, battle_pulse: true }, shuffle: false },
    // Раунд 15 (И4): звёзды миссий { [missionId]: 1..3 } — лучший результат
    // (HP своей крепости на победе), сливается поэлементным max, см.
    // mergeProgress; туториал миссии 1 показан (js/tutorial.js).
    missionStars: {},
    tutorialDone: false,
    // r15 И10: разовый тост «эпоха сбрасывается каждую битву» (js/tutorial.js).
    // Булев флаг — при облачном слиянии ИЛИ (показан на любом устройстве —
    // больше не показывается), счётчик начатых миссий — число, слияние max
    // (общий цикл mergeProgress ниже, отдельной ветки не нужно).
    ageResetTipSeen: false,
    missionsStarted: 0,
  };
}

// Поэлементный max двух словарей «id → число» (звёзды миссий): прогресс
// с разных устройств объединяется, лучший результат по каждой миссии
// сохраняется — не сумма (удвоение, как было с валютой) и не затирание.
function mergeMaxMap(a, b) {
  const out = {};
  for (const src of [a, b]) {
    if (!src || typeof src !== 'object') continue;
    for (const id of Object.keys(src)) {
      const v = Number(src[id]);
      if (!Number.isFinite(v)) continue;
      out[id] = Math.max(out[id] || 0, v);
    }
  }
  return out;
}

// CrazyGames Data Module (методичка §7): документация прямо предупреждает —
// не читать/писать window.localStorage напрямую на этой площадке, только
// через PLATFORM.crazyGamesDataGet/Set (SDK.data.getItem/setItem). На
// остальных площадках (yandex/vk/none) — обычный localStorage, как раньше.
// PLATFORM.kind() ещё 'none' в самый первый синхронный момент загрузки
// скрипта (detect() асинхронный) — на этом коротком окне localGet()
// вернёт null вместо реальных данных СrazyGames-игрока; не проблема, эта
// ранняя провизорная загрузка всё равно перезаписывается позже реальным
// syncProgress() (см. game.js, вызывается после PLATFORM.ready).
function localGet() {
  return PLATFORM.kind() === 'crazygames' ? PLATFORM.crazyGamesDataGet(SAVE_KEY) : localStorage.getItem(SAVE_KEY);
}
function localSet(json) {
  if (PLATFORM.kind() === 'crazygames') { PLATFORM.crazyGamesDataSet(SAVE_KEY, json); return; }
  localStorage.setItem(SAVE_KEY, json);
}

// Пересчёт актуального баланса из неубывающих счётчиков (см.
// ТЗ_ФИКС_СЛИЯНИЕ_ВАЛЮТЫ.md) — звать после любого earn/spend в game.js и
// после mergeProgress()/loadProgress().
function recalcShopCurrency(progress) {
  progress.shopCurrency = (progress.shopCurrencyEarned || 0) - (progress.shopCurrencySpent || 0);
  return progress.shopCurrency;
}

// Миграция старого формата (только shopCurrency, без earned/spent) —
// один раз при первой загрузке после обновления, чтобы не обнулить деньги
// уже играющим (ТЗ_ФИКС_СЛИЯНИЕ_ВАЛЮТЫ.md, п.3).
function migrateShopCurrency(data) {
  if (!data) return data;
  const hasEarned = Object.prototype.hasOwnProperty.call(data, 'shopCurrencyEarned');
  const hasSpent = Object.prototype.hasOwnProperty.call(data, 'shopCurrencySpent');
  if (!hasEarned && !hasSpent && Object.prototype.hasOwnProperty.call(data, 'shopCurrency')) {
    data.shopCurrencyEarned = data.shopCurrency || 0;
    data.shopCurrencySpent = 0;
  }
  return data;
}

function loadProgress() {
  try {
    const raw = localGet();
    const d = defaultProgress();
    if (!raw) return d;
    const parsed = migrateShopCurrency(JSON.parse(raw));
    const merged = Object.assign(d, parsed);
    recalcShopCurrency(merged);
    return merged;
  } catch (e) {
    return defaultProgress();
  }
}

// Дебаунс отправки в облако (см. ТЗ_ОБЛАЧНЫЕ_СОХРАНЕНИЯ.md, раздел 3) —
// 3000ms держит частоту вызовов заведомо ниже лимита Яндекса (100
// запросов/5 минут) даже при быстрой серии сохранений (например,
// перестановка треков плейлиста, game.js).
const CLOUD_PUSH_DEBOUNCE_MS = 3000;
let cloudPushTimer = null;

function scheduleCloudPush(progress) {
  clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(() => {
    cloudPushTimer = null;
    PLATFORM.saveCloud(progress);
  }, CLOUD_PUSH_DEBOUNCE_MS);
}

// Немедленный (не отложенный) пуш — вызывается из game.js на pagehide/
// visibilitychange, чтобы не терять последнее изменение при быстром
// закрытии вкладки.
function flushCloudPush(progress) {
  clearTimeout(cloudPushTimer);
  cloudPushTimer = null;
  PLATFORM.saveCloud(progress);
}

function saveProgress(progress) {
  try {
    localSet(JSON.stringify(progress));
  } catch (e) { /* хранилище недоступно — прогресс просто не сохранится */ }
  scheduleCloudPush(progress);
}

// ---- Слияние локального и облачного сейва (см. ТЗ_ОБЛАЧНЫЕ_СОХРАНЕНИЯ.md,
// раздел 3) -----------------------------------------------------------

function readLocalRaw() {
  try {
    const raw = localGet();
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeLocalRaw(data) {
  try { localSet(JSON.stringify(data)); } catch (e) { /* недоступно — переживём */ }
}

// Конфликт (оба поля непустые и различаются) решается по типу: числа —
// максимум, булевы — ИЛИ (покупка/апгрейд/валюта никогда не может
// уменьшиться или пропасть при слиянии); для остального (строки/объекты —
// тема, текущий плейлист) — побеждает локальное устройство.
// Особый случай — `shopCurrency`: это НЕ монотонное число (тратится), поэтому
// оно исключено из общего цикла и не мержится по Math.max напрямую (иначе
// офлайн-трата "теряется" при слиянии со старым большим облачным балансом,
// см. баг-репорт в ТЗ_ФИКС_СЛИЯНИЕ_ВАЛЮТЫ.md). Вместо этого мержатся два
// неубывающих счётчика shopCurrencyEarned/shopCurrencySpent (обычный числовой
// max-кейс), а актуальный баланс пересчитывается после цикла.
function mergeProgress(localData, cloudData) {
  localData = migrateShopCurrency(localData);
  cloudData = migrateShopCurrency(cloudData);
  const merged = defaultProgress();
  const keys = new Set([
    ...Object.keys(localData || {}),
    ...Object.keys(cloudData || {}),
  ]);
  for (const k of keys) {
    if (k === 'shopCurrency') continue; // пересчитывается ниже из earned/spent, не мержится напрямую
    if (k === 'missionStars') { merged[k] = mergeMaxMap(localData && localData[k], cloudData && cloudData[k]); continue; } // раунд 15 (И4)
    const hasLocal = localData && Object.prototype.hasOwnProperty.call(localData, k);
    const hasCloud = cloudData && Object.prototype.hasOwnProperty.call(cloudData, k);
    if (hasLocal && hasCloud) {
      const lv = localData[k], cv = cloudData[k];
      if (typeof lv === 'number' && typeof cv === 'number') merged[k] = Math.max(lv, cv);
      else if (typeof lv === 'boolean' && typeof cv === 'boolean') merged[k] = lv || cv;
      else merged[k] = lv; // строки/объекты (activeTheme, cosmeticTime, playlist...) — побеждает локальное устройство
    } else if (hasLocal) merged[k] = localData[k];
    else if (hasCloud) merged[k] = cloudData[k];
  }
  recalcShopCurrency(merged);
  return merged;
}

async function syncProgress() {
  const localRaw = readLocalRaw(); // без дефолтов поверх — дефолты применяются только в mergeProgress
  const cloud = await PLATFORM.loadCloud();
  if (!cloud.ok) {
    // сеть/мост недоступны — работаем только локально, в облако ничего не пишем
    if (!localRaw) return defaultProgress();
    const local = Object.assign(defaultProgress(), migrateShopCurrency(localRaw));
    recalcShopCurrency(local);
    return local;
  }
  const result = mergeProgress(localRaw, cloud.data); // cloud.data может быть null — mergeProgress уже обрабатывает это как «взять только локальное»
  writeLocalRaw(result);
  scheduleCloudPush(result); // не блокируя — покрывает и случай «в облаке пусто, поднимаем локальное наверх»
  return result;
}
