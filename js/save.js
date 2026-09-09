// Прогресс кампании — только localStorage, без сохранения середины миссии
// (см. ГДД, «Явно НЕ входит в MVP»).
'use strict';

const SAVE_KEY = 'dve-kreposti-progress-v1';

function defaultProgress() {
  return {
    unlocked: 1, muted: false,
    // Магазин между раундами (см. ПЛАН.md, раунд 3) — валюта копится из
    // убийств за миссию и переносится между сессиями.
    shopCurrency: 0,
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
  };
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const d = defaultProgress();
    if (!raw) return d;
    const parsed = JSON.parse(raw);
    return Object.assign(d, parsed);
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
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch (e) { /* localStorage недоступен — прогресс просто не сохранится */ }
  scheduleCloudPush(progress);
}

// ---- Слияние локального и облачного сейва (см. ТЗ_ОБЛАЧНЫЕ_СОХРАНЕНИЯ.md,
// раздел 3) -----------------------------------------------------------

function readLocalRaw() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeLocalRaw(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* недоступно — переживём */ }
}

// Конфликт (оба поля непустые и различаются) решается по типу: числа —
// максимум, булевы — ИЛИ (покупка/апгрейд/валюта никогда не может
// уменьшиться или пропасть при слиянии); для остального (строки/объекты —
// тема, текущий плейлист) — побеждает локальное устройство.
function mergeProgress(localData, cloudData) {
  const merged = defaultProgress();
  const keys = new Set([
    ...Object.keys(localData || {}),
    ...Object.keys(cloudData || {}),
  ]);
  for (const k of keys) {
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
  return merged;
}

async function syncProgress() {
  const localRaw = readLocalRaw(); // без дефолтов поверх — дефолты применяются только в mergeProgress
  const cloud = await PLATFORM.loadCloud();
  if (!cloud.ok) {
    // сеть/мост недоступны — работаем только локально, в облако ничего не пишем
    return localRaw ? Object.assign(defaultProgress(), localRaw) : defaultProgress();
  }
  const result = mergeProgress(localRaw, cloud.data); // cloud.data может быть null — mergeProgress уже обрабатывает это как «взять только локальное»
  writeLocalRaw(result);
  scheduleCloudPush(result); // не блокируя — покрывает и случай «в облаке пусто, поднимаем локальное наверх»
  return result;
}
