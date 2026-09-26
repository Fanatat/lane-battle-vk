// Оркестрация: экраны, игровой цикл, рендер, HUD, ввод. Логика боя — в
// entities.js/ai.js, эта часть только читает/показывает состояние.
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const DOM = {
  hud: document.getElementById('hud'),
  playerCoreFill: document.getElementById('playerCoreFill'),
  playerCoreText: document.getElementById('playerCoreText'),
  enemyCoreFill: document.getElementById('enemyCoreFill'),
  enemyCoreText: document.getElementById('enemyCoreText'),
  goldText: document.getElementById('goldText'),
  goldRow: document.getElementById('goldRow'),
  diamondText: document.getElementById('diamondText'),
  missionTitle: document.getElementById('missionTitle'),
  heroFill: document.getElementById('heroFill'),
  heroReviveBox: document.getElementById('heroReviveBox'),
  heroDownFlash: document.getElementById('heroDownFlash'),
  heroSlotTop: document.getElementById('heroSlotTop'), // r15 И16: портрет + выкуп на таче
  heroMini: document.getElementById('heroMini'),
  heroMiniRing: document.getElementById('heroMiniRing'),
  hudBottom: document.querySelector('.hud-bottom'),
  fortAlert: document.getElementById('fortAlert'), // r15 И16
  fortEdge: document.getElementById('fortEdge'),
  playerCoreBar: document.querySelector('.core-player .bar'),
  btnBuyback: document.getElementById('btnBuyback'),
  buybackCostText: document.getElementById('buybackCostText'),
  buybackShortText: document.getElementById('buybackShortText'), // r15 И12
  toolbar: document.getElementById('toolbar'),
  specialBtn: document.getElementById('specialBtn'),
  specialCd: document.getElementById('specialCd'),
  pickaxeBtn: document.getElementById('pickaxeBtn'),
  pickaxeCd: document.getElementById('pickaxeCd'),
  cryBtn: document.getElementById('cryBtn'),
  cryCd: document.getElementById('cryCd'),
  pauseBtn: document.getElementById('pauseBtn'),
  helpBtn: document.getElementById('helpBtn'),
  screenHelp: document.getElementById('screenHelp'),
  helpList: document.getElementById('helpList'),
  btnBackFromHelp: document.getElementById('btnBackFromHelp'),
  touchControls: document.getElementById('touchControls'),
  joyBase: document.getElementById('joyBase'),
  hudBottomRow: document.querySelector('.hud-bottom-row'),
  joyStick: document.getElementById('joyStick'),
  touchAttack: document.getElementById('touchAttack'),
  touchSpecial: document.getElementById('touchSpecial'),
  touchPickaxe: document.getElementById('touchPickaxe'),
  touchCry: document.getElementById('touchCry'),
  touchAttackCd: document.getElementById('touchAttackCd'),
  touchSpecialCd: document.getElementById('touchSpecialCd'),
  touchPickaxeCd: document.getElementById('touchPickaxeCd'),
  touchCryCd: document.getElementById('touchCryCd'),
  screenMenu: document.getElementById('screenMenu'),
  screenMissions: document.getElementById('screenMissions'),
  screenShop: document.getElementById('screenShop'),
  shopList: document.getElementById('shopList'),
  shopCurrencyText: document.getElementById('shopCurrencyText'),
  btnShop: document.getElementById('btnShop'),
  btnBackFromShop: document.getElementById('btnBackFromShop'),
  screenPause: document.getElementById('screenPause'),
  screenResult: document.getElementById('screenResult'),
  screenPlaylist: document.getElementById('screenPlaylist'),
  chapterTrail: document.getElementById('chapterTrail'),
  playlistList: document.getElementById('playlistList'),
  btnShuffle: document.getElementById('btnShuffle'),
  btnPlaylist: document.getElementById('btnPlaylist'),
  btnBackFromPlaylist: document.getElementById('btnBackFromPlaylist'),
  countdownOverlay: document.getElementById('countdownOverlay'),
  countdownNum: document.getElementById('countdownNum'),
  resultTitle: document.getElementById('resultTitle'),
  resultText: document.getElementById('resultText'),
  resultReward: document.getElementById('resultReward'),
  resultRewardAmount: document.getElementById('resultRewardAmount'),
  resultAdRow: document.getElementById('resultAdRow'),
  resultCard: document.getElementById('resultCard'),
  resultStars: document.getElementById('resultStars'), // раунд 15 (И4)
  btnPlay: document.getElementById('btnPlay'),
  btnMute: document.getElementById('btnMute'),
  btnMuteMusic: document.getElementById('btnMuteMusic'),
  btnMutePause: document.getElementById('btnMutePause'),
  btnMuteMusicPause: document.getElementById('btnMuteMusicPause'),
  btnBackToMenu: document.getElementById('btnBackToMenu'),
  btnResume: document.getElementById('btnResume'),
  btnToMenuFromPause: document.getElementById('btnToMenuFromPause'),
  btnNext: document.getElementById('btnNext'),
  btnShopFromResult: document.getElementById('btnShopFromResult'),
  btnRetry: document.getElementById('btnRetry'),
  btnToMenuFromResult: document.getElementById('btnToMenuFromResult'),
};

let progress = loadProgress();
// Тема оформления (утренняя правка) — весь интерфейс красится через
// CSS-переменные, тема = класс на <body>, который эти переменные
// переопределяет (см. style.css, THEMES в data.js). Применяется сразу при
// загрузке и при каждой смене в магазине.
function applyTheme() {
  THEMES.forEach(t => { if (t.cssClass) document.body.classList.remove(t.cssClass); });
  const theme = THEMES.find(t => t.id === progress.activeTheme) || THEMES[0];
  if (theme.cssClass) document.body.classList.add(theme.cssClass);
}
applyTheme();
// Раунд 10: 2 независимых канала звука по прямому требованию основателя —
// "Отключить звук" (SFX, progress.muted) и "Отключить музыку"
// (progress.musicMuted) никогда не должны пересекаться, ни в коде, ни по
// громкости.
SFX.setMuted(!!progress.muted);
MUSIC.setMusicMuted(!!progress.musicMuted);

// ---------------------------------------------------------------- платформа
// Ночь 07→08.09.2026 (задача на релиз): ИНАП на Яндексе, реклама за
// вознаграждение на VK/Яндексе, DLC за очки на VK/локально. Игровой
// цикл и музыка обязаны ставиться на паузу на время показа рекламы
// (Яндекс, требования к игре, п.4.7) — см. frame() ниже и adPlaying.
let adPlaying = false;
PLATFORM.setPauseHooks(
  () => { adPlaying = true; MUSIC.pauseForAd(); SFX.suspend(); },
  () => { adPlaying = false; if (!pageHidden) { MUSIC.resumeAfterAd(); SFX.resume(); } }
);
// Модерация (2026-09-14, замечания 2-3, п.1.3): звук/музыка не должны играть
// со свёрнутой страницей или в фоновой вкладке — раньше на это не было
// вообще никакого хука (в отличие от рекламы выше). document.hidden — общий
// сигнал и для сворачивания, и для переключения вкладки, так что одного
// слушателя достаточно на оба случая. Отдельный флаг, а не переиспользование
// adPlaying напрямую: показ рекламы и скрытие вкладки — независимые
// причины паузы, и обе могут наложиться (например, реклама показана именно
// в момент, когда игрок переключился на другую вкладку) — resume должен
// сработать только когда ОБЕ причины паузы снялись.
let pageHidden = false;
function onVisibilityChange() {
  pageHidden = document.hidden;
  if (pageHidden) {
    MUSIC.pauseForAd();
    SFX.suspend();
  } else if (!adPlaying) {
    MUSIC.resumeAfterAd();
    SFX.resume();
  }
}
// Незавершённые покупки прошлых сессий (сбой сети/закрытая вкладка между
// purchase() и consumePurchase() на Яндексе) — досчитываем и выдаём, чтобы
// оплаченный контент не терялся молча. ВАЖНО (2026-09-14, попутно найдено
// при фиксе п.2.14): раньше вызывалось СРАЗУ, на верхнем уровне скрипта —
// то есть ДО того, как detect() в platform.js успевал хоть что-то узнать
// про площадку (kind в этот момент всегда 'none'), а внутренняя проверка
// `if (kind !== 'yandex' || !yandexPayments) return` тихо превращала вызов
// в no-op КАЖДУЮ сессию. Теперь ждём PLATFORM.paymentsReady — момент, когда
// платформа реально попыталась загрузить платежи (успешно или нет).
PLATFORM.paymentsReady.then(() => {
  PLATFORM.reconcilePurchases((key) => {
    progress[key] = true;
    progress[key + 'Active'] = true;
    saveProgress(progress);
  });
  if (screen === 'shop') renderShop();
});
// Определение площадки асинхронное (см. platform.js) — если магазин уже
// открыт в момент, когда оно завершилось, перерисовываем, чтобы цена/способ
// оплаты DLC отражали реальную площадку, а не дефолт 'none'. Платежи/каталог
// грузятся отдельно и медленнее (см. PLATFORM.paymentsReady выше) — этот
// перерендер тут нужен для площадки/языка, тот — для реальной цены DLC.
PLATFORM.ready.then(() => { if (screen === 'shop') renderShop(); });

// Облачные сохранения (см. ТЗ_ОБЛАЧНЫЕ_СОХРАНЕНИЯ.md) — best-effort
// немедленная отправка отложенного пуша при закрытии/скрытии вкладки,
// чтобы не терять последнее изменение (дебаунс в save.js — 3000ms).
// Модерация (2026-09-14, замечание 6, п.1.6.2.7): правый клик по игровому
// полю на десктопе открывал системное контекстное меню браузера
// ("Сохранить изображение как", "Исследовать элемент" и т.п.) — блокера не
// было вообще. Нет ни одного места в игре, где браузерное контекстное меню
// нужно функционально (нет ссылок/картинок для сохранения игроком), поэтому
// глушим на всём документе, а не только на арене.
document.addEventListener('contextmenu', (e) => { e.preventDefault(); });
window.addEventListener('pagehide', () => { flushCloudPush(progress); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushCloudPush(progress);
  onVisibilityChange();
});

// Заметное уведомление поверх интерфейса — используется там, где нельзя
// молча проглотить ошибку (сорванная покупка, недоступный товар/реклама):
// площадки прямо требуют не прятать такие случаи (см. ВОПРОСЫ файл сессии).
function showLoudNotice(message) {
  const el = document.createElement('div');
  el.className = 'loud-notice';
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 4500);
}

// Раунд 8: скидка на выкуп — покупка магазина (SHOP.buybackDiscount).
// Определена после loadProgress() — `progress` нужен уже при первом вызове
// (баг-репорт живым QA: ReferenceError из-за TDZ, читалось до объявления).
function currentBuybackCost() {
  return Math.max(5, HERO.buybackCost - (progress.buybackDiscount ? SHOP.buybackDiscount.discount : 0));
}
DOM.buybackCostText.textContent = currentBuybackCost();
function tryBuyback() {
  const hero = match && match.world.hero;
  const cost = currentBuybackCost();
  if (!hero || hero.alive || match.gold < cost) {
    SFX.buyDenied();
    const b = DOM.btnBuyback; // r15 И12: видимый отказ при нехватке золота
    if (hero && !hero.alive) { b.classList.remove('denied'); void b.offsetWidth; b.classList.add('denied'); }
    return;
  }
  match.gold -= cost;
  hero.respawnTimer = 0; // updateHero воскресит героя на следующем тике
  SFX.upgrade();
}
DOM.btnBuyback.addEventListener('click', tryBuyback);

const input = {
  moveAxis: 0, attackPressed: false, specialPressed: false, pickaxePressed: false, cryPressed: false,
  buyPressed: null, upgradePressed: false, pausePressed: false,
};
const keysDown = new Set();

let screen = 'loading'; // loading | menu | missions | match | paused | result (r15 И10: 'loading' — до PLATFORM.ready, #screenLoading)
let match = null; // состояние текущего матча
let lastResult = null; // 'win' | 'lose'

// ---------------------------------------------------------------- canvas и камера (раунд 15, И1)
// Раунд 15 (ТЗ_КАЧЕСТВО_CRAZYGAMES, П1): кадр на ВЕСЬ экран без полос и шва.
// Раньше #arenaWrap держал аспект 2.5:1, а остаток экрана дорисовывал
// отдельный #backdrop своим генератором (groundY = 82% высоты) — на 16:9 это
// читалось как «игра в полосе посреди картинки» со швом по линии земли.
// Теперь канвас боя занимает весь вьюпорт, а мир рисуется через камеру:
// логические координаты (ARENA 1000×400, groundY, laneMin/laneMax, хитбоксы)
// не меняются ни на единицу — меняются только масштаб k и сдвиг кадра.
// Ширина арены всегда целиком в кадре (обе крепости видны), лишняя высота
// уходит в небо и землю — продолжение того же мира тем же генератором
// (terrainFor работает в мировых координатах на [-800, 1800]).
const VIEW = { k: 1, dpr: 1, cssW: ARENA.width, cssH: ARENA.height, x0: 0, y0: 0, w: ARENA.width, h: ARENA.height, rev: 0, fig: 1, fortK: 1, fortKx: 1 };
const VIEW_MIN_H = 430;      // минимум мировой высоты в кадре (ультраширокие экраны)
const VIEW_SKY_FRAC = 0.76;  // доля кадра над линией земли
// Раунд 15 (И5): «крупный план» для широких/низких экранов (телефон в
// альбомной ориентации ~2.16:1, мониторы 21:9). Приблизить камеру нельзя:
// ширину кадра держат обе крепости (рисунок занимает x ≈ 0…985 из 1000), а
// на таком аспекте ширина и так упирается в край — лишняя высота уходит в
// небо (~40% кадра на 844×390). Поэтому на широком кадре крупнее рисуются
// сами фигуры (VIEW.fig: юниты, герой) и крепости (VIEW.fortK — от фасада
// назад, ворота и стена героя на месте), а линия земли чуть выше — ноги не
// уходят под джойстик и тач-кнопки. Только отрисовка: x юнитов, хитбоксы,
// дальности, стена героя не меняются. 16:9 — см. VIEW_FRAME ниже (И7).
const VIEW_WIDE = { from: 1.85, to: 2.15, fig: 0.25, fortK: 0.15, skyDrop: 0.05 };
// Раунд 15 (И7, отчёт куратора): тот же «крупный план» и на 16:9 и близких
// аспектах (≥1.6). На 1280×720/907×510/800×450 в кадр входит ~562 мировых
// px по высоте, юнит (~80 px при scale 1) занимал ~14% кадра — «мелкие
// человечки посреди пустого неба». Теперь масштаб фигур считается от
// высоты кадра: юнит ≈ target доли кадра (не больше maxFig), с плавным
// входом от аспекта from к to (4:3 и портрет — как раньше). Широкий кадр
// берёт максимум из этого и VIEW_WIDE. Крепость растёт на fortShare от
// прироста фигур: по высоте — полностью, по ширине — не больше fortMaxX
// (опора на фасад, левый край крепости при 1.17 доходит до x≈0 — дальше
// вылезла бы из кадра). Юниты/герой — тем же VIEW.fig (И6 не дублирует).
const VIEW_FRAME = { from: 1.4, to: 1.6, unitH: 80, target: 0.205, maxFig: 1.46, fortShare: 0.62, fortMaxX: 1.16 };
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width || window.innerWidth || ARENA.width;
  const cssH = rect.height || window.innerHeight || ARENA.height;
  const k = Math.min(cssW / ARENA.width, cssH / VIEW_MIN_H);
  const w = cssW / k, h = cssH / k;
  const aspect = cssW / cssH;
  const wideT = Math.max(0, Math.min(1, (aspect - VIEW_WIDE.from) / (VIEW_WIDE.to - VIEW_WIDE.from)));
  const frameT = Math.max(0, Math.min(1, (aspect - VIEW_FRAME.from) / (VIEW_FRAME.to - VIEW_FRAME.from)));
  const figFrame = 1 + (Math.max(1, Math.min(VIEW_FRAME.maxFig, VIEW_FRAME.target * h / VIEW_FRAME.unitH)) - 1) * frameT;
  const fig = Math.max(figFrame, 1 + VIEW_WIDE.fig * wideT);
  const fortK = Math.max(1 + (fig - 1) * VIEW_FRAME.fortShare, 1 + VIEW_WIDE.fortK * wideT);
  Object.assign(VIEW, {
    k, dpr, cssW, cssH, w, h,
    x0: (ARENA.width - w) / 2,
    y0: ARENA.groundY - (VIEW_SKY_FRAC - VIEW_WIDE.skyDrop * wideT) * h,
    fig,
    fortK,
    fortKx: Math.min(fortK, VIEW_FRAME.fortMaxX),
    rev: VIEW.rev + 1,
  });
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  applyViewTransform();
  // Пауза/справка не крутят frame() — без перерисовки после смены размера
  // (канвас очищается при присвоении width) под оверлеем была бы пустота.
  if (match && (screen === 'paused' || screen === 'help')) render();
}
function applyViewTransform() {
  const s = VIEW.k * VIEW.dpr;
  ctx.setTransform(s, 0, 0, s, -VIEW.x0 * s, -VIEW.y0 * s);
}
window.addEventListener('resize', resizeCanvas);

// ---------------------------------------------------------------- фон (раунд 14 → 15)
// Всё статичное (небо, горы, дымка, земля с тропой, крап, камни, трава)
// запекается в offscreen-canvas на прямоугольник кадра (+BG_PAD под тряску)
// в разрешении экрана; в кадре — только drawImage + солнце/луна, облака,
// мошки. Кэш по эпохе и размеру кадра (LRU на 4 записи): смена эпохи в бою
// (И2, onPlayerAgeUp) берёт уже прогретый слой — следующие эпохи миссии
// запекаются заранее в простое (prewarmAgeBackgrounds), а сама смена
// показывается кроссфейдом, без рывка. ctx.shadowBlur не используется.
function seededRandom(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const AGE_SEED = { stone: 7, bronze: 19, iron: 31 };
function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
const TERRAIN_X0 = -800, TERRAIN_X1 = 1800;
const SKY_TOP_Y = -130; // выше — ровный цвет skyTop (насыщенный зенит в верхней части кадра)
// Раунд 15 (И7, отчёт куратора: «m2 выглядит как m1»): у каждой миссии внутри
// эпохи — свой вариант фона. Сид рельефа — номер миссии, набор декора
// среднего плана (роща / камни и руины / озеро) и стартовое время суток
// (утро / день / предвечерье: dayT — стартовая фаза цикла computeDayNight,
// tint — оттенок запечённого неба) — по номеру миссии в главе. Кэш фона —
// по (эпоха, вариант, размер кадра). Меню — вариант миссии 1 без сдвига
// рельефа (seed 0 — прежний рисунок раунда 14).
const BG_VARIANTS = [
  { set: 'grove', dayT: 0.08, tint: 'morning' },
  { set: 'rocks', dayT: 0.2, tint: null },
  { set: 'lake', dayT: 0.33, tint: 'evening' },
];
function bgVariantOf(mission) {
  const id = mission && mission.id ? mission.id : 0;
  const n = id > 0 ? (id - 1) % BG_VARIANTS.length : 0;
  return Object.assign({ n, seed: id, key: 'v' + id }, BG_VARIANTS[n]);
}
// mixHex → rgb(...); здесь нужен hex, чтобы смешивать цепочкой.
function hexMix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}
const SKY_TINT = {
  morning: { top: ['#7fb2ec', 0.22], mid: ['#e4f4ff', 0.3], horizon: ['#ffe9ee', 0.4] },
  evening: { top: ['#4d5a9c', 0.32], mid: ['#f4b88c', 0.42], horizon: ['#ff9d5c', 0.5] },
};
function skyColorsOf(age, variant) {
  const tn = variant && SKY_TINT[variant.tint];
  if (!tn) return { top: age.skyTop, mid: age.skyMid, horizon: age.skyHorizon };
  return {
    top: hexMix(age.skyTop, tn.top[0], tn.top[1]),
    mid: hexMix(age.skyMid, tn.mid[0], tn.mid[1]),
    horizon: hexMix(age.skyHorizon, tn.horizon[0], tn.horizon[1]),
  };
}
const terrainCache = {};
function terrainFor(age, variant) {
  const seed = variant ? variant.seed : 0;
  const set = variant ? variant.set : 'grove';
  const ckey = `${age.id}|${seed}|${set}`;
  if (terrainCache[ckey]) return terrainCache[ckey];
  const rng = seededRandom((AGE_SEED[age.id] || 3) + seed * 7919);
  const span = TERRAIN_X1 - TERRAIN_X0;
  // Гребень в мировых координатах: пики случайной высоты/ширины поверх
  // низкой базы плюс мелкая рваность; smooth — покатые холмы, иначе — пики.
  function ridge(step, peaksPer1000, wMin, wMax, jag, smooth) {
    const pk = [];
    const n = Math.round(peaksPer1000 * span / 1000);
    for (let i = 0; i < n; i++) pk.push({ x: TERRAIN_X0 + rng() * span, h: 0.4 + rng() * 0.6, w: wMin + rng() * (wMax - wMin) });
    const pts = [];
    for (let x = TERRAIN_X0; x <= TERRAIN_X1; x += step) {
      let y = 0.1;
      for (const p of pk) {
        const d = Math.abs(x - p.x) / p.w;
        if (d < 1) y = Math.max(y, p.h * (smooth ? 1 - d * d : 1 - d));
      }
      y += (rng() - 0.5) * jag;
      pts.push({ x, y: Math.max(0.03, Math.min(1, y)) });
    }
    return pts;
  }
  const scatter = (count, depth, extra) => Array.from({ length: count }, () => Object.assign({ x: TERRAIN_X0 + rng() * span, d: rng() * depth }, extra()));
  const t = {
    far: ridge(16, 7, 70, 240, 0.05, false),
    mid: ridge(22, 5, 90, 260, 0.03, true),
    near: ridge(14, 10, 50, 170, 0.12, false),
    rocks: scatter(90, 1, () => ({ r: 1.8 + rng() * 3.4, tone: rng() })),
    tufts: scatter(150, 1, () => ({ h: 3 + rng() * 5, lean: (rng() - 0.5) * 1.4 })),
    stipple: scatter(1700, 1, () => ({ a: rng() })),
    edge: Array.from({ length: Math.ceil(span / 9) + 1 }, () => rng()),
    blades: Array.from({ length: Math.ceil(span / 5) + 1 }, () => ({ h: 2 + rng() * 5, lean: (rng() - 0.5) * 2.2, tone: rng() })),
    motes: Array.from({ length: 16 }, () => ({ x0: rng(), y0: rng(), sp: 0.012 + rng() * 0.02, f: 0.5 + rng() * 0.9, p: rng() * 6.28, r: 0.8 + rng() * 1.3 })),
  };
  // И7: самая дальняя гряда (бледная, со снежными шапками) — заполняет
  // верх кадра на 16:9, где раньше было пустое небо.
  t.distant = ridge(20, 3.2, 170, 420, 0.02, true);
  // Средний план: декор на линии горизонта за полем боя, по набору варианта.
  t.deco = []; t.lakes = [];
  const kinds = MID_DECO[age.id] || MID_DECO.stone;
  const put = (kind, x, s) => t.deco.push({ kind, x, s, v: rng(), w: rng() });
  const clusters = (n, kindsList, per, gapMin, gapMax, sMin, sMax) => {
    for (let i = 0; i < n; i++) {
      let x = TERRAIN_X0 + rng() * span;
      const cnt = per[0] + Math.floor(rng() * (per[1] - per[0] + 1));
      for (let j = 0; j < cnt; j++) {
        put(kindsList[Math.floor(rng() * kindsList.length)], x, sMin + rng() * (sMax - sMin));
        x += gapMin + rng() * (gapMax - gapMin);
      }
    }
  };
  if (set === 'grove') {
    clusters(12, kinds.trees, [2, 5], 12, 26, 0.75, 1.25);
    clusters(8, kinds.small, [1, 2], 10, 20, 0.7, 1.1);
  } else if (set === 'rocks') {
    clusters(9, kinds.stones, [2, 4], 10, 22, 0.8, 1.3);
    clusters(5, kinds.trees, [1, 2], 14, 24, 0.7, 1.05);
    clusters(9, kinds.small, [1, 2], 10, 20, 0.7, 1.1);
  } else {
    for (let i = 0; i < 5; i++) {
      const x0 = TERRAIN_X0 + rng() * span, w = 150 + rng() * 260;
      t.lakes.push({ x0, x1: x0 + w, h: 10 + rng() * 6 });
      for (let j = 0; j < 3; j++) put('reeds', x0 + 10 + rng() * (w - 20), 0.8 + rng() * 0.4);
      put(kinds.trees[0], x0 - 16 - rng() * 20, 0.9 + rng() * 0.3);
    }
    clusters(6, kinds.trees, [1, 3], 14, 24, 0.7, 1.1);
    clusters(6, kinds.small, [1, 2], 10, 20, 0.7, 1.0);
  }
  t.deco.sort((a, b) => a.s - b.s); // мелкие (дальние) раньше
  t.foreSeed = (AGE_SEED[age.id] || 3) * 131 + seed * 17 + 5;
  terrainCache[ckey] = t;
  return t;
}
// Набор декора по эпохе: деревья, камни/руины, мелочь у горизонта.
const MID_DECO = {
  stone: { trees: ['oak', 'pine', 'oak'], stones: ['menhir', 'boulder', 'menhir', 'dolmen'], small: ['shrub', 'boulder'] },
  bronze: { trees: ['cypress', 'olive', 'cypress'], stones: ['column', 'column', 'boulder', 'arch'], small: ['shrub', 'boulder'] },
  iron: { trees: ['deadtree', 'deadtree', 'pole'], stones: ['chimney', 'wallruin', 'boulder', 'pole'], small: ['stump', 'boulder'] },
};
function makeLayerCanvas(rect, s) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(rect.w * s)); c.height = Math.max(1, Math.ceil(rect.h * s));
  const x = c.getContext('2d');
  x.setTransform(s, 0, 0, s, -rect.x * s, -rect.y * s);
  return [c, x];
}
// Небо: градиент от зенита к горизонту + тёплый ореол вдоль горизонта.
// Солнце/луна и облака рисуются поверх в кадре, горы — поверх них.
// И7: оттенок по варианту миссии (утро прохладнее, предвечерье теплее).
function bakeSky(age, rect, s, variant) {
  const [c, x] = makeLayerCanvas(rect, s);
  const gy = ARENA.groundY;
  const col = skyColorsOf(age, variant);
  const g = x.createLinearGradient(0, SKY_TOP_Y, 0, gy);
  g.addColorStop(0, col.top); g.addColorStop(0.5, col.mid); g.addColorStop(1, col.horizon);
  x.fillStyle = g; x.fillRect(rect.x, rect.y, rect.w, rect.h);
  const glowCol = variant && variant.tint === 'evening' ? hexMix(age.sunGlow, '#ffb070', 0.5) : age.sunGlow;
  const glow = x.createRadialGradient(ARENA.width * 0.5, gy - 6, 0, ARENA.width * 0.5, gy - 6, 720);
  glow.addColorStop(0, hexAlpha(glowCol, 0.6));
  glow.addColorStop(0.35, hexAlpha(glowCol, 0.22));
  glow.addColorStop(1, hexAlpha(glowCol, 0));
  x.fillStyle = glow; x.fillRect(rect.x, rect.y, rect.w, gy - rect.y);
  return c;
}
// ---- декор среднего и переднего плана (И7) — простая векторная графика в
// том же языке, что постройки: плоская заливка, тень снизу, тёплый блик.
function decoPalette(age, variant) {
  const hz = skyColorsOf(age, variant).horizon;
  const P = {
    stone: { leaf: '#5d8a38', leafDark: '#3f6526', leafHi: '#8fb85a', trunk: '#6b4a2c', rock: '#9a917f' },
    bronze: { leaf: '#6f8a3c', leafDark: '#4d6a2c', leafHi: '#9fb45e', trunk: '#6a4a2a', rock: '#b3a584' },
    iron: { leaf: '#7a7058', leafDark: '#5a5244', leafHi: '#9a9078', trunk: '#4e4238', rock: '#9c9ea8' },
  }[age.id] || {};
  return { ...P, hz };
}
function drawMidDeco(c, it, px, by, s, pal, haze, age) {
  const H = (col, k = haze) => hexMix(col, pal.hz, k);
  c.lineJoin = 'round'; c.lineCap = 'round';
  switch (it.kind) {
    case 'oak': {
      c.fillStyle = H(pal.trunk); c.fillRect(px - 1.8 * s, by - 17 * s, 3.6 * s, 17 * s);
      const blobs = [[0, -27, 12], [-9, -21, 9], [9, -22, 10], [2, -34, 9], [-6, -31, 7]];
      c.fillStyle = H(pal.leafDark);
      c.beginPath(); for (const [dx, dy, r] of blobs) { c.moveTo(px + dx * s + r * s, by + (dy + 2) * s); c.arc(px + dx * s, by + (dy + 2) * s, r * s, 0, Math.PI * 2); } c.fill();
      c.fillStyle = H(pal.leaf);
      c.beginPath(); for (const [dx, dy, r] of blobs) { c.moveTo(px + dx * s + r * s * 0.92, by + dy * s); c.arc(px + dx * s, by + dy * s, r * s * 0.92, 0, Math.PI * 2); } c.fill();
      c.fillStyle = hexAlpha(H(pal.leafHi), 0.7);
      c.beginPath(); c.arc(px - 4 * s, by - 32 * s, 5 * s, 0, Math.PI * 2); c.arc(px + 7 * s, by - 26 * s, 3.5 * s, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'pine': {
      const h = (40 + it.v * 14) * s;
      c.fillStyle = H(pal.trunk); c.fillRect(px - 1.5 * s, by - 8 * s, 3 * s, 8 * s);
      for (let i = 0; i < 3; i++) {
        const y0 = by - 5 * s - i * h * 0.27, w = (12 - i * 3) * s, th = h * 0.45;
        c.fillStyle = H(pal.leafDark);
        c.beginPath(); c.moveTo(px - w, y0); c.lineTo(px, y0 - th); c.lineTo(px + w, y0); c.closePath(); c.fill();
        c.fillStyle = H(pal.leaf);
        c.beginPath(); c.moveTo(px - w * 0.9, y0 - 1.5 * s); c.lineTo(px, y0 - th); c.lineTo(px + w * 0.15, y0 - 1.5 * s); c.closePath(); c.fill();
      }
      break;
    }
    case 'cypress': {
      const h = (44 + it.v * 18) * s;
      c.fillStyle = H(pal.trunk); c.fillRect(px - 1.3 * s, by - 6 * s, 2.6 * s, 6 * s);
      c.fillStyle = H(pal.leafDark);
      c.beginPath(); c.ellipse(px, by - 4 * s - h / 2, 6 * s, h / 2, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = H(pal.leaf);
      c.beginPath(); c.ellipse(px - 1.5 * s, by - 5 * s - h / 2, 3.6 * s, h / 2 - 2 * s, 0, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'olive': {
      c.strokeStyle = H(pal.trunk); c.lineWidth = 3 * s;
      c.beginPath(); c.moveTo(px, by); c.quadraticCurveTo(px - 4 * s, by - 9 * s, px + 1 * s, by - 16 * s); c.stroke();
      c.fillStyle = H(pal.leafDark);
      c.beginPath(); c.ellipse(px + 1 * s, by - 21 * s, 17 * s, 8 * s, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = H(hexMix(pal.leaf, '#b8c0a0', 0.3));
      c.beginPath(); c.ellipse(px - 2 * s, by - 23 * s, 12 * s, 5.5 * s, 0, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'deadtree': {
      c.strokeStyle = H(pal.trunk); c.lineWidth = 3.2 * s;
      const h = (32 + it.v * 12) * s;
      c.beginPath(); c.moveTo(px, by); c.lineTo(px + 1 * s, by - h); c.stroke();
      c.lineWidth = 1.8 * s;
      c.beginPath();
      c.moveTo(px + 0.5 * s, by - h * 0.55); c.lineTo(px - 10 * s, by - h * 0.85);
      c.moveTo(px + 0.8 * s, by - h * 0.7); c.lineTo(px + 11 * s, by - h * 0.95);
      c.moveTo(px - 5 * s, by - h * 0.72); c.lineTo(px - 7 * s, by - h * 1.02);
      c.stroke();
      break;
    }
    case 'stump': {
      c.fillStyle = H(pal.trunk); c.fillRect(px - 3 * s, by - 6 * s, 6 * s, 6 * s);
      c.fillStyle = H('#c8a878'); c.beginPath(); c.ellipse(px, by - 6 * s, 3 * s, 1.2 * s, 0, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'boulder': {
      const r = (7 + it.v * 6) * s;
      c.fillStyle = H(hexMix(pal.rock, '#000000', 0.18));
      c.beginPath(); c.ellipse(px, by, r * 1.3, r, 0, Math.PI, Math.PI * 2); c.fill();
      c.fillStyle = H(pal.rock);
      c.beginPath(); c.ellipse(px - r * 0.2, by - r * 0.08, r * 1.02, r * 0.86, 0, Math.PI, Math.PI * 2); c.fill();
      c.fillStyle = hexAlpha(H('#fff2d8', haze * 0.6), 0.4);
      c.beginPath(); c.ellipse(px - r * 0.45, by - r * 0.6, r * 0.4, r * 0.18, -0.3, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'menhir': {
      const h = (22 + it.v * 16) * s, w = (5 + it.w * 3) * s;
      c.save(); c.translate(px, by); c.rotate((it.w - 0.5) * 0.14);
      c.fillStyle = H(hexMix(pal.rock, '#000000', 0.2));
      c.beginPath(); c.moveTo(-w, 0); c.lineTo(-w * 0.8, -h * 0.85); c.quadraticCurveTo(0, -h - 3 * s, w * 0.85, -h * 0.8); c.lineTo(w, 0); c.closePath(); c.fill();
      c.fillStyle = H(pal.rock);
      c.beginPath(); c.moveTo(-w, 0); c.lineTo(-w * 0.8, -h * 0.85); c.quadraticCurveTo(-w * 0.2, -h - 2 * s, w * 0.1, -h * 0.9); c.lineTo(w * 0.05, 0); c.closePath(); c.fill();
      c.restore();
      break;
    }
    case 'dolmen': {
      const col = H(pal.rock), dk = H(hexMix(pal.rock, '#000000', 0.22));
      c.fillStyle = dk; c.fillRect(px - 11 * s, by - 15 * s, 5 * s, 15 * s); c.fillRect(px + 6 * s, by - 15 * s, 5 * s, 15 * s);
      c.fillStyle = col; c.beginPath(); c.moveTo(px - 15 * s, by - 14 * s); c.lineTo(px + 15 * s, by - 16 * s); c.lineTo(px + 14 * s, by - 21 * s); c.lineTo(px - 14 * s, by - 20 * s); c.closePath(); c.fill();
      break;
    }
    case 'column': {
      const h = (18 + it.v * 22) * s, w = 4 * s;
      const col = H(hexMix(pal.rock, '#ffffff', 0.12)), dk = H(hexMix(pal.rock, '#000000', 0.15));
      c.fillStyle = dk; c.fillRect(px - w - 1.5 * s, by - 3 * s, 2 * w + 3 * s, 3 * s);
      c.fillStyle = col; c.fillRect(px - w, by - h, 2 * w, h - 3 * s);
      c.fillStyle = dk; c.fillRect(px + w * 0.3, by - h, w * 0.7, h - 3 * s);
      if (it.w > 0.45) { c.fillStyle = col; c.fillRect(px - w - 2 * s, by - h - 3 * s, 2 * w + 4 * s, 3 * s); }
      else { c.fillStyle = col; c.beginPath(); c.moveTo(px - w, by - h); c.lineTo(px - w * 0.2, by - h - 4 * s); c.lineTo(px + w * 0.5, by - h - 1 * s); c.lineTo(px + w, by - h - 3 * s); c.lineTo(px + w, by - h); c.closePath(); c.fill(); }
      break;
    }
    case 'arch': {
      const col = H(hexMix(pal.rock, '#ffffff', 0.1)), dk = H(hexMix(pal.rock, '#000000', 0.2));
      c.fillStyle = col;
      c.beginPath(); c.moveTo(px - 16 * s, by); c.lineTo(px - 16 * s, by - 26 * s); c.lineTo(px + 16 * s, by - 26 * s); c.lineTo(px + 16 * s, by); c.lineTo(px + 8 * s, by); c.lineTo(px + 8 * s, by - 12 * s); c.arc(px, by - 12 * s, 8 * s, 0, Math.PI, true); c.lineTo(px - 8 * s, by); c.closePath(); c.fill();
      c.fillStyle = dk; c.fillRect(px - 17 * s, by - 29 * s, 34 * s, 3 * s);
      break;
    }
    case 'chimney': {
      const h = (46 + it.v * 26) * s;
      const col = H('#8a5a44'), dk = H('#5e3c2e');
      c.fillStyle = dk; c.beginPath(); c.moveTo(px - 6 * s, by); c.lineTo(px - 4.5 * s, by - h); c.lineTo(px + 4.5 * s, by - h); c.lineTo(px + 6 * s, by); c.closePath(); c.fill();
      c.fillStyle = col; c.beginPath(); c.moveTo(px - 6 * s, by); c.lineTo(px - 4.5 * s, by - h); c.lineTo(px + 0.5 * s, by - h); c.lineTo(px + 0.5 * s, by); c.closePath(); c.fill();
      c.fillStyle = H('#3a2a22'); c.fillRect(px - 5.5 * s, by - h - 2 * s, 11 * s, 3 * s);
      c.fillStyle = hexAlpha(H('#d8d4d0', haze * 0.5), 0.45);
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(px + (4 + i * 5) * s, by - h - (6 + i * 7) * s, (3.5 + i * 1.8) * s, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = H('#6e4a38'); c.fillRect(px - 16 * s, by - 12 * s, 11 * s, 12 * s); c.fillRect(px + 6 * s, by - 9 * s, 12 * s, 9 * s);
      break;
    }
    case 'wallruin': {
      c.fillStyle = H('#8a6a54');
      c.beginPath(); c.moveTo(px - 20 * s, by); c.lineTo(px - 20 * s, by - 10 * s); c.lineTo(px - 12 * s, by - 10 * s); c.lineTo(px - 12 * s, by - 16 * s); c.lineTo(px - 2 * s, by - 16 * s); c.lineTo(px - 2 * s, by - 8 * s); c.lineTo(px + 9 * s, by - 8 * s); c.lineTo(px + 9 * s, by - 12 * s); c.lineTo(px + 18 * s, by - 5 * s); c.lineTo(px + 18 * s, by); c.closePath(); c.fill();
      c.strokeStyle = hexAlpha('#3a2a22', 0.35); c.lineWidth = 0.8 * s;
      c.beginPath(); for (let ly = by - 4 * s; ly > by - 15 * s; ly -= 4 * s) { c.moveTo(px - 19 * s, ly); c.lineTo(px + 17 * s, ly); } c.stroke();
      break;
    }
    case 'pole': {
      c.strokeStyle = H('#5a4636'); c.lineWidth = 2 * s;
      c.beginPath(); c.moveTo(px, by); c.lineTo(px, by - 36 * s); c.moveTo(px - 6 * s, by - 32 * s); c.lineTo(px + 6 * s, by - 32 * s); c.stroke();
      c.strokeStyle = hexAlpha(H('#3a2e26'), 0.6); c.lineWidth = 0.8 * s;
      c.beginPath(); c.moveTo(px + 6 * s, by - 32 * s); c.quadraticCurveTo(px + 30 * s, by - 24 * s, px + 56 * s, by - 31 * s); c.stroke();
      break;
    }
    case 'reeds': {
      c.strokeStyle = H(hexMix(pal.leaf, '#c8b060', 0.35)); c.lineWidth = 1.2 * s;
      for (let i = -3; i <= 3; i++) {
        const hx = px + i * 2.2 * s, hh = (9 + ((i * 7 + 11) % 5) * 1.6) * s;
        c.beginPath(); c.moveTo(hx, by); c.lineTo(hx + i * 0.6 * s, by - hh); c.stroke();
        if (i % 2 === 0) { c.fillStyle = H('#7a5a34'); c.beginPath(); c.ellipse(hx + i * 0.6 * s, by - hh + 1.5 * s, 1.1 * s, 2.6 * s, 0, 0, Math.PI * 2); c.fill(); }
      }
      break;
    }
    case 'shrub': default: {
      c.fillStyle = H(pal.leafDark);
      c.beginPath(); c.arc(px - 5 * s, by - 4 * s, 6 * s, 0, Math.PI * 2); c.arc(px + 4 * s, by - 5 * s, 7 * s, 0, Math.PI * 2); c.arc(px, by - 9 * s, 6 * s, 0, Math.PI * 2); c.fill();
      c.fillStyle = H(pal.leaf);
      c.beginPath(); c.arc(px - 2 * s, by - 9 * s, 4 * s, 0, Math.PI * 2); c.arc(px - 6 * s, by - 5 * s, 3.5 * s, 0, Math.PI * 2); c.fill();
      break;
    }
  }
}
// Передний план у нижнего края: крупные кусты/камни/трава (iron — щебень и
// сухая трава), частично срезаны кромкой кадра; гуще по бокам, где нет
// панели покупки. Цвета темнее поля — ближе к зрителю.
function drawForeground(c, age, t, rect, gy, yB, m, pal) {
  const depth = yB - gy;
  if (depth < 60) return;
  const rng = seededRandom(t.foreSeed + Math.round(rect.w));
  const iron = age.id === 'iron';
  const dark = (col, k) => hexMix(col, age.groundDark, k);
  const bush = (px, by, s) => {
    const blobs = [[-14, -8, 13], [0, -14, 16], [15, -9, 12], [6, -22, 11], [-7, -20, 10]];
    c.fillStyle = iron ? dark('#6a5e48', 0.35) : dark(pal.leafDark, 0.35);
    c.beginPath(); for (const [dx, dy, r] of blobs) { c.moveTo(px + dx * s + r * s, by + dy * s); c.arc(px + dx * s, by + dy * s, r * s, 0, Math.PI * 2); } c.fill();
    c.fillStyle = iron ? dark('#8a7c5e', 0.25) : dark(pal.leaf, 0.2);
    c.beginPath(); for (const [dx, dy, r] of blobs) { c.moveTo(px + (dx - 2) * s + r * 0.7 * s, by + (dy - 3) * s); c.arc(px + (dx - 2) * s, by + (dy - 3) * s, r * 0.7 * s, 0, Math.PI * 2); } c.fill();
    c.fillStyle = hexAlpha(iron ? '#b8aa88' : pal.leafHi, 0.55);
    c.beginPath(); c.arc(px - 6 * s, by - 24 * s, 4 * s, 0, Math.PI * 2); c.arc(px + 4 * s, by - 20 * s, 3 * s, 0, Math.PI * 2); c.fill();
    if (!iron && age.id === 'stone' && rng() < 0.6) { // ягоды/цветы
      c.fillStyle = rng() < 0.5 ? '#e05a4a' : '#f2e27a';
      for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(px + (rng() - 0.5) * 30 * s, by - (6 + rng() * 16) * s, 1.6 * s, 0, Math.PI * 2); c.fill(); }
    }
  };
  const rock = (px, by, s) => {
    // округлый валун: тень снизу, тело, светлая грань сверху-слева, мох
    c.fillStyle = 'rgba(0,0,0,.18)';
    c.beginPath(); c.ellipse(px + 2 * s, by + 1 * s, 21 * s, 4 * s, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = dark(age.stone, 0.45);
    c.beginPath(); c.moveTo(px - 19 * s, by);
    c.quadraticCurveTo(px - 20 * s, by - 14 * s, px - 6 * s, by - 19 * s);
    c.quadraticCurveTo(px + 12 * s, by - 22 * s, px + 18 * s, by - 8 * s);
    c.quadraticCurveTo(px + 21 * s, by - 1 * s, px + 17 * s, by); c.closePath(); c.fill();
    c.fillStyle = dark(age.stone, 0.18);
    c.beginPath(); c.moveTo(px - 15 * s, by - 3 * s);
    c.quadraticCurveTo(px - 16 * s, by - 14 * s, px - 5 * s, by - 17 * s);
    c.quadraticCurveTo(px + 8 * s, by - 19 * s, px + 12 * s, by - 10 * s);
    c.quadraticCurveTo(px + 2 * s, by - 6 * s, px - 15 * s, by - 3 * s); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,245,225,.28)';
    c.beginPath(); c.ellipse(px - 6 * s, by - 14 * s, 6 * s, 2.6 * s, -0.35, 0, Math.PI * 2); c.fill();
    if (!iron) {
      c.fillStyle = hexAlpha(pal.leaf, 0.75);
      c.beginPath(); c.ellipse(px - 3 * s, by - 18 * s, 7 * s, 2.2 * s, 0.08, Math.PI, Math.PI * 2); c.fill();
    }
  };
  const grass = (px, by, s) => {
    c.lineCap = 'round';
    for (let i = -5; i <= 5; i++) {
      c.strokeStyle = iron ? (i % 2 ? '#8a7a5a' : '#a89870') : (i % 2 ? dark(age.grass, 0.25) : age.grass);
      c.lineWidth = 2 * s;
      const hh = (12 + ((i * 7 + 13) % 6) * 2.4) * s;
      c.beginPath(); c.moveTo(px + i * 2.4 * s, by); c.quadraticCurveTo(px + i * 3 * s, by - hh * 0.6, px + i * 4.2 * s + (rng() - 0.5) * 4 * s, by - hh); c.stroke();
    }
  };
  const rubble = (px, by, s) => {
    for (let i = 0; i < 6; i++) {
      const rx = px + (rng() - 0.5) * 34 * s, rr = (3 + rng() * 5) * s;
      c.fillStyle = i % 2 ? dark(age.stone, 0.4) : dark('#8a6a54', 0.3);
      c.beginPath(); c.moveTo(rx - rr, by); c.lineTo(rx - rr * 0.6, by - rr); c.lineTo(rx + rr * 0.7, by - rr * 0.8); c.lineTo(rx + rr, by); c.closePath(); c.fill();
    }
  };
  const L = rect.x, W = rect.w;
  const sideItems = iron ? [rubble, rock, grass, bush] : [bush, rock, grass, bush];
  const fs = m * Math.min(1.25, Math.max(0.8, depth / 120));
  for (const side of [0, 1]) {
    const x0 = side ? L + W * 0.8 : L - 12, x1 = side ? L + W + 12 : L + W * 0.2;
    let x = x0 + rng() * 14;
    let i = 0;
    while (x < x1) {
      const f = sideItems[(i + side) % sideItems.length];
      const s = fs * (1.1 + rng() * 0.8);
      f(x, yB + 2 + rng() * 6, s);
      x += (26 + rng() * 26) * s;
      i++;
    }
  }
  // Середина поля — редкие пучки травы/камешки между тропой и панелью покупки.
  const n = Math.round(W / 140);
  for (let i = 0; i < n; i++) {
    const px = L + W * (0.12 + rng() * 0.76);
    const py = gy + 26 + rng() * Math.max(10, depth * 0.4);
    const s = fs * (0.45 + rng() * 0.3) * (0.7 + (py - gy) / depth * 0.6);
    (iron ? (rng() < 0.5 ? rubble : grass) : (rng() < 0.65 ? grass : rock))(px, py, s);
  }
}
// Горы (дальняя гряда со снегом + три слоя с атмосферной перспективой и
// дымкой), средний план (декор варианта), земля со светлой тропой вдоль
// линии боя, трава по кромке, крап, камни, тёмный и передний планы.
function bakeLand(age, rect, s, variant) {
  const [c, x] = makeLayerCanvas(rect, s);
  const t = terrainFor(age, variant);
  const gy = ARENA.groundY;
  const xL = rect.x - 20, xR = rect.x + rect.w + 20, yB = rect.y + rect.h;
  const inX = (px) => px >= xL && px <= xR;
  const sky = skyColorsOf(age, variant);
  // И7: масштаб «декораций» от высоты неба в кадре — на 16:9 горы и
  // деревья выше, на широком кадре (≈2.2:1) — как раньше.
  const m = Math.max(1, Math.min(1.45, (gy - rect.y) / 330));
  function layer(pts, amp, base, color) {
    x.fillStyle = color;
    x.beginPath(); x.moveTo(xL, gy + 2);
    for (const p of pts) if (p.x >= xL - 30 && p.x <= xR + 30) x.lineTo(p.x, gy - base - p.y * amp);
    x.lineTo(xR, gy + 2); x.closePath(); x.fill();
  }
  function hazeBand(top, alphaMul) {
    const hz = x.createLinearGradient(0, top, 0, gy);
    const a = parseFloat(age.haze.match(/[\d.]+\)$/)[0]) * alphaMul;
    const base = age.haze.replace(/[\d.]+\)$/, '');
    hz.addColorStop(0, base + '0)'); hz.addColorStop(0.75, base + a + ')'); hz.addColorStop(1, base + (a * 0.6) + ')');
    x.fillStyle = hz; x.fillRect(xL, top, xR - xL, gy - top);
  }
  const farAmp = (age.farRidge || 170) * m;
  // дальняя гряда: бледная, снежные шапки (iron — без снега, дымка гуще)
  // (на 16:9 гряда выше — неба в кадре не больше ~30%)
  // Дальняя гряда — сплошной «стеной» (долины приподняты: 0.3 + 0.7·y).
  const distT = (m - 1) / 0.45;
  const distAmp = farAmp * (1.1 + 0.5 * distT);
  const distLift = 0.3 * distT;
  const distPts = distLift ? t.distant.map(p => ({ x: p.x, y: distLift + (1 - distLift) * p.y })) : t.distant;
  const distY = (p) => gy - 20 - p.y * distAmp;
  layer(distPts, distAmp, 20, hexMix(age.mountains[0], sky.horizon, 0.64));
  if (age.id !== 'iron') {
    // снежные шапки: полоса вдоль гребня, нижняя кромка — рваная (не ровный срез)
    x.fillStyle = hexAlpha(hexMix('#ffffff', sky.horizon, 0.2), 0.7);
    let run = [];
    const flush = () => {
      if (run.length > 2) {
        x.beginPath();
        run.forEach((p, i) => (i ? x.lineTo(p.x, distY(p)) : x.moveTo(p.x, distY(p))));
        for (let i = run.length - 1; i >= 0; i--) {
          const p = run[i], d = (p.y - 0.74) * distAmp * (0.55 + 0.35 * Math.abs(Math.sin(p.x * 0.09)));
          x.lineTo(p.x, distY(p) + Math.max(0, d));
        }
        x.closePath(); x.fill();
      }
      run = [];
    };
    for (const p of distPts) {
      if (p.x < xL - 30 || p.x > xR + 30) { flush(); continue; }
      if (p.y > 0.74) run.push(p); else flush();
    }
    flush();
  }
  hazeBand(gy - distAmp * 0.9, 1.1);
  layer(t.far, farAmp, 8, mixHex(age.mountains[0], sky.horizon, 0.3));
  hazeBand(gy - farAmp * 0.8, 1.2);
  layer(t.mid, 82 * Math.sqrt(m), 3, mixHex(age.mountains[1], sky.horizon, 0.06));
  hazeBand(gy - 46, 0.6);
  // средний план: мелкий (дальний) декор за ближними холмами
  const pal = decoPalette(age, variant);
  for (const it of t.deco) {
    if (it.s >= 0.9 || !inX(it.x)) continue;
    drawMidDeco(x, it, it.x, gy - 14 - it.v * 8, it.s * 0.7 * m, pal, 0.45, age);
  }
  layer(t.near, 34, 0, age.mountains[2]);
  // озёра у подножия холмов (вариант «озеро»)
  for (const lk of t.lakes) {
    if (lk.x1 < xL || lk.x0 > xR) continue;
    const cx = (lk.x0 + lk.x1) / 2, rx = (lk.x1 - lk.x0) / 2, h = lk.h * m;
    x.fillStyle = hexMix(age.mountains[2], '#2a3a3a', 0.25);
    x.beginPath(); x.ellipse(cx, gy + 1, rx + 4, h + 2, 0, Math.PI, Math.PI * 2); x.fill();
    const wg = x.createLinearGradient(0, gy - h, 0, gy);
    wg.addColorStop(0, hexMix(sky.mid, '#5a8ab0', 0.35)); wg.addColorStop(1, hexMix(sky.horizon, '#8ab8d0', 0.4));
    x.fillStyle = wg;
    x.beginPath(); x.ellipse(cx, gy + 1, rx, h, 0, Math.PI, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1;
    x.beginPath();
    for (let i = 0; i < 4; i++) { const lx = cx - rx * 0.6 + i * rx * 0.35, ly = gy - h * (0.25 + (i % 2) * 0.3); x.moveTo(lx, ly); x.lineTo(lx + rx * 0.18, ly); }
    x.stroke();
  }
  // средний план: основной декор на линии горизонта
  for (const it of t.deco) {
    if (it.s < 0.9 || !inX(it.x)) continue;
    drawMidDeco(x, it, it.x, gy - 1, it.s * m, pal, 0.28, age);
  }
  // земля: светлая кромка → основной тон → тёмный низ
  const gg = x.createLinearGradient(0, gy, 0, gy + 240);
  gg.addColorStop(0, age.groundTop); gg.addColorStop(0.22, age.ground); gg.addColorStop(1, age.groundDark);
  x.fillStyle = gg; x.fillRect(xL, gy, xR - xL, Math.max(0, yB - gy + 2));
  // светлая тропа вдоль линии боя с рваной нижней кромкой
  x.fillStyle = age.pathLight;
  x.beginPath(); x.moveTo(xL, gy);
  for (let i = 0; i < t.edge.length; i++) {
    const px = TERRAIN_X0 + i * 9;
    if (px < xL - 9 || px > xR + 9) continue;
    x.lineTo(px, gy + 6 + t.edge[i] * 6);
  }
  x.lineTo(xR, gy); x.closePath(); x.fill();
  x.fillStyle = 'rgba(60,35,10,.35)'; x.fillRect(xL, gy - 0.6, xR - xL, 1.4);
  // крап
  const depth = Math.max(40, yB - gy - 12);
  for (const p of t.stipple) {
    if (!inX(p.x)) continue;
    x.fillStyle = p.a > 0.5 ? 'rgba(255,240,205,.10)' : 'rgba(40,20,0,.13)';
    x.fillRect(p.x, gy + 13 + p.d * depth, 1 + p.a * 1.2, 1);
  }
  // камни
  for (const r of t.rocks) {
    if (!inX(r.x)) continue;
    const py = gy + 14 + r.d * (depth - 6), rr = r.r * (1 + r.d * 0.6);
    x.fillStyle = mixHex(age.stone, age.groundDark, 0.15 + r.tone * 0.5);
    x.beginPath(); x.ellipse(r.x, py, rr * 1.4, rr * 0.8, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,245,220,.22)';
    x.beginPath(); x.ellipse(r.x - rr * 0.4, py - rr * 0.3, rr * 0.6, rr * 0.28, 0, 0, Math.PI * 2); x.fill();
  }
  // пучки травы (stone/bronze) или щебень (iron) по полю
  x.lineCap = 'round'; x.lineWidth = 1.3;
  for (const g2 of t.tufts) {
    if (!inX(g2.x)) continue;
    const py = gy + 14 + g2.d * (depth - 6);
    if (!age.grass) { x.fillStyle = 'rgba(30,25,20,.3)'; x.fillRect(g2.x, py, 2 + g2.h * 0.4, 1.5); continue; }
    x.strokeStyle = mixHex(age.grass, age.groundDark, g2.d * 0.4);
    for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(g2.x, py); x.lineTo(g2.x + k * 2 + g2.lean * g2.h, py - g2.h + Math.abs(k)); x.stroke(); }
  }
  // трава по кромке — граница «задник/поле боя» читается даже на мелком экране
  if (age.grass) {
    x.lineWidth = 1.4;
    for (let i = 0; i < t.blades.length; i++) {
      const b = t.blades[i], px = TERRAIN_X0 + i * 5;
      if (!inX(px)) continue;
      x.strokeStyle = b.tone > 0.5 ? age.grass : mixHex(age.grass, '#fff6c0', 0.25);
      x.beginPath(); x.moveTo(px, gy + 1.5); x.lineTo(px + b.lean, gy + 1.5 - b.h); x.stroke();
    }
  }
  // тёмный передний план у нижнего края кадра — глубина
  if (yB > gy + 90) {
    const fg = x.createLinearGradient(0, gy + 80, 0, yB);
    fg.addColorStop(0, 'rgba(30,15,0,0)'); fg.addColorStop(1, 'rgba(30,15,0,.28)');
    x.fillStyle = fg; x.fillRect(xL, gy + 80, xR - xL, yB - gy - 80);
  }
  // И7: передний план — кусты/камни/трава у нижней кромки
  drawForeground(x, age, t, rect, gy, yB, m, pal);
  return c;
}
// Арена/меню: слой на прямоугольник кадра с запасом BG_PAD под тряску.
// Разрешение слоя ограничено ~2.4 Мп — фон декоративный, а записи кэша
// по 2 слоя на 4K-экране иначе съели бы сотни мегабайт.
const BG_PAD = 10;
const bgCache = new Map();
function viewBgRect() {
  return { x: VIEW.x0 - BG_PAD, y: VIEW.y0 - BG_PAD, w: VIEW.w + BG_PAD * 2, h: VIEW.h + BG_PAD * 2 };
}
function bakeArenaBackground(age, variant) {
  const rect = viewBgRect();
  let s = VIEW.k * VIEW.dpr;
  const px = rect.w * rect.h * s * s;
  if (px > 2.4e6) s *= Math.sqrt(2.4e6 / px);
  const vkey = variant ? variant.key : 'v0';
  const key = `${age.id}|${vkey}|${VIEW.rev}`;
  let bg = bgCache.get(key);
  if (bg) { bgCache.delete(key); bgCache.set(key, bg); return bg; }
  bg = { ageId: age.id, vkey, rev: VIEW.rev, rect, sky: bakeSky(age, rect, s, variant), land: bakeLand(age, rect, s, variant) };
  bgCache.set(key, bg);
  while (bgCache.size > 5) bgCache.delete(bgCache.keys().next().value);
  return bg;
}
// Прогрев эпох, до которых игрок может дорасти в этой миссии, — в простое,
// по одной за вызов, чтобы смена эпохи в бою не пекла фон в кадре.
function prewarmAgeBackgrounds(mission) {
  if (typeof ageIdAt !== 'function' || typeof ageMaxSteps !== 'function') return;
  const ids = [];
  for (let st = 1; st <= ageMaxSteps(mission); st++) ids.push(ageIdAt(mission, st));
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 250));
  const rev = VIEW.rev;
  const variant = bgVariantOf(mission);
  const next = () => {
    const id = ids.shift();
    if (!id || VIEW.rev !== rev) return;
    bakeArenaBackground(AGES[id], variant);
    if (ids.length) idle(next);
  };
  idle(next);
}
// Кадр фона: небо → солнце/луна → облака → горы+земля. prev — слой прошлой
// эпохи, поверх с убывающей прозрачностью (кроссфейд смены эпохи, 0.8 с).
function drawBgLayer(bg, which, alpha) {
  if (!bg || alpha <= 0) return;
  const r = bg.rect;
  if (alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; }
  ctx.drawImage(bg[which], r.x, r.y, r.w, r.h);
  if (alpha < 1) ctx.restore();
}
function drawSunMoon(age, dn) {
  const top = Math.max(VIEW.y0 + 50, -150);
  const span = ARENA.groundY - 40 - top;
  const bodyX = 90 + dn.localT * (ARENA.width - 180);
  const bodyY = ARENA.groundY - 40 - dn.alt * span;
  const low = 1 - dn.alt;
  const glowR = dn.sunUp ? 80 + low * 110 : 34 + low * 16;
  const glow = ctx.createRadialGradient(bodyX, bodyY, 0, bodyX, bodyY, glowR);
  if (dn.sunUp) {
    glow.addColorStop(0, hexAlpha(age.sunGlow, 0.85));
    glow.addColorStop(0.3, hexAlpha(age.sunGlow, 0.3));
    glow.addColorStop(1, hexAlpha(age.sunGlow, 0));
  } else {
    glow.addColorStop(0, 'rgba(205,218,255,.4)');
    glow.addColorStop(1, 'rgba(205,218,255,0)');
  }
  ctx.fillStyle = glow;
  ctx.fillRect(bodyX - glowR, bodyY - glowR, glowR * 2, glowR * 2);
  ctx.fillStyle = dn.sunUp ? '#fff6d8' : '#e6ecff';
  ctx.beginPath(); ctx.arc(bodyX, bodyY, dn.sunUp ? 18 : 11, 0, Math.PI * 2); ctx.fill();
}
// Высокие облака — без состояния (позиция от времени), только в верхнем
// небе, которое появилось с полноэкранным кадром; боевые облака
// (match.clouds) остаются как были.
const HIGH_CLOUDS = Array.from({ length: 6 }, (_, i) => ({ u: i / 6 + 0.07 * (i % 3), v: (i * 0.37) % 1, s: 0.9 + ((i * 0.53) % 1) * 0.9, sp: 4 + (i % 3) * 2.5 }));
function drawHighClouds(t) {
  if (VIEW.y0 > -10) return;
  const w = VIEW.w + 240;
  for (const c of HIGH_CLOUDS) {
    const x = VIEW.x0 - 120 + ((c.u * w + t * c.sp) % w);
    const y = VIEW.y0 + 30 + c.v * Math.max(20, -VIEW.y0 * 0.7);
    drawCloud(x, y, c.s);
  }
}
// Пылевые мошки — тёплые точки над тропой, дрейф по ветру; без состояния.
function drawMotes(age, t) {
  ctx.fillStyle = hexAlpha(age.sunGlow, 0.45);
  for (const k of terrainFor(age).motes) {
    const x = VIEW.x0 + ((k.x0 + t * k.sp) % 1) * VIEW.w;
    const y = ARENA.groundY - 16 - k.y0 * 120 + Math.sin(t * k.f + k.p) * 9;
    ctx.beginPath(); ctx.arc(x, y, k.r, 0, Math.PI * 2); ctx.fill();
  }
}
// Затемнение ночи (≤ 0.3 — ТЗ раунда 15) — только на фон, на весь кадр.
function drawNightShade(dn) {
  const darkness = (1 - dn.light) * 0.33;
  if (darkness > 0.02) {
    ctx.fillStyle = `rgba(10,14,40,${darkness})`;
    const r = viewBgRect();
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
}
resizeCanvas();

// Второй заход по наложению кнопок нижнего ряда (первый фикс —
// flex-shrink:0 внутри самого ряда — снял внутреннее сжатие, но не был
// причиной на реальном устройстве: там ряд заезжал под АБСОЛЮТНО
// позиционированные джойстик/тач-кнопки способностей — разные системы
// координат, вне потока ряда вообще). Пробовал резервировать место чистым
// CSS (margin/width от тех же %/vmin, что и у джойстика/тач-кнопок) — не
// совпало с реальной отрисовкой на практике (см. историю правки в
// style.css), формула разошлась с оригиналом на незаметную для чтения
// величину. Здесь — не формула-дубликат, а прямое измерение настоящих
// getBoundingClientRect() джойстика и .touch-actions: подгонка ряда под
// РЕАЛЬНО отрисованные соседние элементы, гарантия по построению, а не
// по совпадению с отдельной параллельной формулой.
// r15 И16 (куратор №5, блокер: на 844×390 с м3 «Эра» под кнопкой кирки):
// ряд с margin'ами был, но тулбар из 7 кнопок + портрет в него не влезал —
// хвост ряда (Залп/Эра) уезжал в горизонтальный скролл ПОД тач-кнопки.
// Теперь на таче: (1) тач-кнопки — веером в углу (style.css), (2) портрет
// героя и кнопка выкупа — под своей полосой HP (#heroSlotTop), (3) если ряд
// всё равно не влез (scrollWidth > clientWidth) — кнопки 44px (.row-compact),
// затем «Залп»/«Эра» строкой над тулбаром (.row-stack). Проверка —
// tmp/i16/overlap_check.py (rect-пересечения + elementFromPoint).
function placeHeroHud(coarse) {
  const mini = DOM.heroMini, box = DOM.heroReviveBox;
  if (coarse) {
    if (mini.parentElement !== DOM.heroSlotTop) DOM.heroSlotTop.appendChild(mini);
    if (box.parentElement !== DOM.heroSlotTop) DOM.heroSlotTop.appendChild(box);
    box.classList.add('in-slot');
    box.style.left = ''; box.style.bottom = '';
  } else {
    if (mini.parentElement !== DOM.hudBottomRow) DOM.hudBottomRow.insertBefore(mini, DOM.hudBottomRow.firstChild);
    if (box.parentElement !== DOM.hudBottom) DOM.hudBottom.insertBefore(box, DOM.hudBottom.firstChild);
    box.classList.remove('in-slot');
  }
}
// ПК: кнопка выкупа — над портретом героя (левый край нижнего ряда), не над
// центром поля. Позиция — по реальному rect портрета.
function positionReviveBox() {
  const box = DOM.heroReviveBox;
  if (box.classList.contains('in-slot') || box.classList.contains('hidden')) return;
  const hb = DOM.hudBottom.getBoundingClientRect();
  const hm = DOM.heroMini.getBoundingClientRect();
  const row = DOM.hudBottomRow.getBoundingClientRect(); // верх ряда: кнопки тулбара выше портрета
  if (!hm.width) return;
  box.style.left = Math.max(4, hm.left - hb.left) + 'px';
  box.style.bottom = Math.max(0, hb.bottom - Math.min(hm.top, row.top) + 10) + 'px';
}
// r15 И20 (куратор №7: «на 667×375 „Volley“ и „Age“ выпадают во второй ряд
// над полем рядом со счётчиком золота»): если тулбар не влез в один ряд даже
// компактным — «Залп» и «Эра» уезжают в правый тач-кластер, круглыми
// кнопками над «Кирка»/«Вихрь» (style.css, .touch-actions > #volleyBtn),
// нижний ряд — всегда один. Обработчики click едут вместе с элементами.
function placeVolleyAge(inCluster) {
  const v = document.getElementById('volleyBtn'), a = document.getElementById('ageBtn');
  const ta = document.querySelector('.touch-actions');
  if (!v || !a || !ta) return;
  if (inCluster) {
    if (v.parentElement !== ta) { ta.appendChild(v); ta.appendChild(a); }
  } else if (v.parentElement !== DOM.hudBottomRow) {
    DOM.hudBottomRow.insertBefore(v, DOM.specialBtn);
    DOM.hudBottomRow.insertBefore(a, DOM.specialBtn);
  }
  ta.classList.toggle('with-volley', inCluster);
}
function layoutHudBottomRow() {
  if (match && typeof fitMissionTitle === 'function') fitMissionTitle(); // r15 И18: заголовок в одну строку
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  placeHeroHud(coarse);
  const row = DOM.hudBottomRow;
  if (!coarse) {
    placeVolleyAge(false);
    row.style.marginLeft = '';
    row.style.marginRight = '';
    row.classList.remove('row-compact', 'row-stack');
    DOM.goldRow.style.removeProperty('--warn-max');
    positionReviveBox();
    return;
  }
  const touchActions = document.querySelector('.touch-actions');
  if (!touchActions || DOM.touchControls.classList.contains('hidden')) return; // скрыт -> rect нулевой, мерить нечего
  const joyRect = DOM.joyBase.getBoundingClientRect();
  const touchRect = touchActions.getBoundingClientRect();
  const parentRect = DOM.hudBottom.getBoundingClientRect();
  const pad = 8;
  // .hud-bottom-row теперь align-self:stretch (см. style.css) — margin-left
  // и margin-right ОБА выставляются явно и отступают от настоящих краёв
  // .hud-bottom, а не от центра уже сдвинутого бокса (та самая причина,
  // почему первая попытка одним margin-left не сработала).
  row.style.marginLeft = Math.max(0, joyRect.right - parentRect.left + pad) + 'px';
  row.style.marginRight = Math.max(0, parentRect.right - touchRect.left + pad) + 'px';
  row.classList.remove('row-compact', 'row-stack');
  placeVolleyAge(false);
  const overflows = () => row.scrollWidth > row.clientWidth + 1;
  if (overflows()) row.classList.add('row-compact');
  if (overflows()) { // И20: не второй ряд над полем, а «Залп»/«Эра» — в тач-кластер
    placeVolleyAge(true);
    row.classList.remove('row-compact');
    if (overflows()) row.classList.add('row-compact');
  }
  if (overflows()) row.classList.add('row-stack'); // запасной путь (не должен срабатывать)
  // Предупреждение о золоте справа от счётчика — не дальше левого края веера.
  const gr = DOM.goldRow.getBoundingClientRect();
  DOM.goldRow.style.setProperty('--warn-max', Math.max(90, Math.min(240, touchRect.left - gr.right - 12)) + 'px');
}
window.addEventListener('resize', layoutHudBottomRow);
window.addEventListener('orientationchange', () => setTimeout(layoutHudBottomRow, 50));

// ---------------------------------------------------------------- screens
// Стадия 2 (баг-репорт основателя): пока висел #rotatePrompt (CSS-запрос
// портрет+touch), сам матч за кулисами продолжал считаться — таймеры,
// спавны, ИИ шли своим чередом, хотя игрок ничего не видел и не управлял.
// Принудительно уводим в паузу при развороте; назад САМА пауза не снимается
// никогда — только явным действием игрока (кнопка/хоткей), даже если
// ориентация тем временем вернулась в альбомную.
const PORTRAIT_TOUCH_MQ = window.matchMedia('(pointer: coarse) and (orientation: portrait)');
function showScreen(name) {
  if (name === 'match' && PORTRAIT_TOUCH_MQ.matches) name = 'paused';
  Analytics.screenShown(name, screen); // воронка: menu_shown / shop_open (js/analytics.js)
  screen = name;
  // CrazyGames gameplayStart/Stop (методичка §2) — шире pauseHook/resumeHook
  // (те — только вокруг рекламы, см. PLATFORM.setPauseHooks() ниже): любой
  // переход на/с экрана боя, включая паузу/меню/итог, no-op на других
  // площадках (проверка kind — внутри PLATFORM.setGameplayActive()).
  PLATFORM.setGameplayActive(name === 'match');
  // Отсчёт 3…2…1 (раунд 5) сам прячется только когда update() успевает
  // досчитать до конца — если экран сменился раньше (пауза/выход во время
  // отсчёта), оверлей иначе застревал видимым поверх всех следующих
  // экранов (найдено живым QA раунда 7, не просто теоретический край).
  if (name !== 'match') DOM.countdownOverlay.classList.add('hidden');
  document.getElementById('screenLoading').classList.toggle('hidden', name !== 'loading'); // r15 И10
  DOM.screenMenu.classList.toggle('hidden', name !== 'menu');
  if (name !== 'menu') document.getElementById('settingsPop').classList.add('hidden'); // И1: поповер настроек меню
  DOM.screenMissions.classList.toggle('hidden', name !== 'missions');
  DOM.screenShop.classList.toggle('hidden', name !== 'shop');
  DOM.screenPlaylist.classList.toggle('hidden', name !== 'playlist');
  DOM.screenPause.classList.toggle('hidden', name !== 'paused');
  DOM.screenHelp.classList.toggle('hidden', name !== 'help');
  DOM.screenResult.classList.toggle('hidden', name !== 'result');
  DOM.hud.classList.toggle('hidden', !(name === 'match' || name === 'paused' || name === 'help'));
  const touchCapable = window.matchMedia('(pointer: coarse)').matches;
  DOM.touchControls.classList.toggle('hidden', !(touchCapable && (name === 'match')));
  if (name === 'match') requestAnimationFrame(layoutHudBottomRow); // r15 И16: и на ПК — место кнопки выкупа
  else { DOM.hudBottomRow.style.marginLeft = ''; DOM.hudBottomRow.style.marginRight = ''; }

  // Меню/пауза vs бой играют РАЗНУЮ музыку (раунд 10) — паузу и итог
  // намеренно НЕ переключаем на меню-трек, чтобы не обрывать боевую
  // музыку/атмосферу поверх всё ещё анимированного поля боя (см. раунд 6).
  if (['menu', 'missions', 'shop', 'playlist'].includes(name)) {
    if (MUSIC.current() !== 'menu') MUSIC.play('menu');
  }
  // updateHud() обычно вызывается только внутри игрового цикла (screen ===
  // 'match'), поэтому переход НА ЛЮБОЙ другой экран сам по себе не
  // обновляет HUD ещё один кадр — коробка выкупа героя (скрыта везде,
  // кроме самого боя, второй баг-репорт: пауза починили, справка «?»
  // осталась) иначе оставалась бы видна до следующего кадра боя. Не
  // завязываемся на конкретный список экранов — иначе будем чинить по
  // одному при каждой новой жалобе; вызываем при ЛЮБОМ переходе, пока
  // матч существует, дёшево и без побочных эффектов.
  if (match) updateHud();
}

// Карта глав (раунд 5, доработана в раунде 7 по фидбэку основателя —
// «нарисовать местность, точки не строго в ряд, дорожки волнистой линией,
// не напрямую») — SVG-полоса на главу: мягкий фон-«местность», 3 узла со
// смещением по высоте (не ровный ряд) и волнистые пунктирные дорожки
// между ними вместо прямых линий.
// Раунд 15 (И1): полоса главы в фиксированной пропорции (viewBox 520×100,
// без растяжения кругов в эллипсы), «местность» — полоса земли и холмы от
// края до края внутри рамки со скруглением (не обрезанные прямой кромкой
// эллипсы), звёзды 0–3 под пройденными узлами (progress.missionStars),
// запертые узлы — маленькие приглушённые с SVG-замком, полностью запертая
// глава — приглушённая строка, а не «стена замков».
const CHAPTER_Y_PATTERNS = [
  [52, 30, 60], [54, 62, 32], [34, 58, 44], [58, 32, 54], [44, 62, 34],
];
const CHAPTER_HILLS = [
  'M0,100 L0,74 C70,58 130,52 200,66 S330,84 400,64 S490,50 520,60 L520,100 Z',
  'M0,100 L0,62 C60,76 150,80 230,68 S360,46 430,62 S500,74 520,70 L520,100 Z',
  'M0,100 L0,70 C90,50 170,56 250,72 S380,86 450,66 S505,56 520,58 L520,100 Z',
];
// r15 И16 (куратор №5: «звёзды под узлами ~8px»): звезда 16 → 26 единиц
// viewBox (≥14px на экране при 800×450, см. tmp/i16), полоса главы выше
// (100 → 114), холмы растянуты по высоте, чтобы звёзды нижних узлов влезли.
const CHAPTER_STAR = 26, CHAPTER_SVG_H = 114;
function chapterStarsSVG(cx, y, stars) {
  let s = '';
  const S = CHAPTER_STAR, step = S + 1;
  for (let i = 0; i < 3; i++) {
    const x = cx - step + i * step;
    const on = i < stars;
    s += `<use href="#i-star" x="${x - S / 2}" y="${y - S / 2}" width="${S}" height="${S}" style="color:${on ? '#ffd35c' : 'rgba(40,28,16,.55)'}"/>`;
  }
  return s;
}
function chapterRowSVG(ch, chapterIdx) {
  const W = 520, H = CHAPTER_SVG_H;
  const yPat = CHAPTER_Y_PATTERNS[chapterIdx % CHAPTER_Y_PATTERNS.length];
  const xs = [80, 260, 440];
  const hue = 28 + chapterIdx * 12;
  let svg = `<svg class="chapter-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`;
  svg += `<g transform="scale(1,${H / 100})">`;
  svg += `<path d="${CHAPTER_HILLS[chapterIdx % CHAPTER_HILLS.length]}" fill="hsla(${hue},42%,40%,.45)"/>`;
  svg += `<path d="${CHAPTER_HILLS[(chapterIdx + 1) % CHAPTER_HILLS.length]}" transform="translate(0,14)" fill="hsla(${hue + 18},38%,30%,.45)"/>`;
  svg += '</g>';
  for (let i = 0; i < xs.length - 1; i++) {
    const x1 = xs[i], y1 = yPat[i], x2 = xs[i + 1], y2 = yPat[i + 1];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const wave = (i % 2 === 0 ? 1 : -1) * 18;
    const cleared = (ch.id - 1) * MISSIONS_PER_CHAPTER + i + 1 < progress.unlocked;
    svg += `<path d="M${x1},${y1} Q${mx},${my + wave} ${x2},${y2}" fill="none"
      stroke="${cleared ? 'var(--gold-text)' : 'rgba(255,225,180,.28)'}" stroke-width="3"
      stroke-dasharray="7 6" stroke-linecap="round"/>`;
  }
  const stars = progress.missionStars || {};
  for (let lvl = 1; lvl <= MISSIONS_PER_CHAPTER; lvl++) {
    const missionIndex = (ch.id - 1) * MISSIONS_PER_CHAPTER + (lvl - 1);
    const m = MISSIONS[missionIndex];
    const unlocked = m.id <= progress.unlocked;
    const cleared = m.id < progress.unlocked;
    const current = unlocked && !cleared;
    const cx = xs[lvl - 1], cy = yPat[lvl - 1];
    const cls = 'trail-node-svg' + (unlocked ? '' : ' locked') + (cleared ? ' cleared' : '') + (current ? ' current' : '');
    if (unlocked) {
      const fill = cleared ? 'url(#trailCleared)' : 'url(#trailOpen)';
      svg += `<g class="${cls}" data-mission-index="${missionIndex}" data-unlocked="true">
        <circle class="node-hit" cx="${cx}" cy="${cy}" r="27"/>
        ${current ? `<circle class="node-pulse" cx="${cx}" cy="${cy}" r="22" fill="none" stroke="var(--gold-text)" stroke-width="3"/>` : ''}
        <circle cx="${cx}" cy="${cy}" r="17" fill="${fill}" stroke="var(--ink)" stroke-width="3"/>
        <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-family="'Lilita One',sans-serif" font-size="${m.id >= 10 ? 15 : 17}" fill="#3a2f22">${m.id}</text>
        ${cleared ? chapterStarsSVG(cx, cy + 34, stars[m.id] || 0) : ''}
      </g>`;
    } else {
      svg += `<g class="${cls}" data-mission-index="${missionIndex}" data-unlocked="false">
        <circle cx="${cx}" cy="${cy}" r="12" fill="rgba(40,28,16,.55)" stroke="rgba(26,18,10,.7)" stroke-width="2"/>
        <use href="#i-lock" x="${cx - 7}" y="${cy - 7.5}" width="14" height="14" style="color:#b9a78a"/>
      </g>`;
    }
  }
  svg += '</svg>';
  return svg;
}
function renderChapterTrail() {
  const defs = `<svg width="0" height="0" style="position:absolute"><defs>
    <linearGradient id="trailOpen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#e0a030"/>
    </linearGradient>
    <linearGradient id="trailCleared" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7bd98a"/><stop offset="1" stop-color="#2f8f45"/>
    </linearGradient>
  </defs></svg>`;
  DOM.chapterTrail.innerHTML = defs + CHAPTERS.map((ch, i) => {
    const firstId = (ch.id - 1) * MISSIONS_PER_CHAPTER + 1;
    const locked = firstId > progress.unlocked;
    // Полностью запертая глава — одна компактная строка с замком, без
    // полосы узлов (иначе экран превращался в «стену замков»).
    if (locked) return `
    <div class="chapter-row chapter-locked">
      <div class="chapter-label"><svg class="ico"><use href="#i-lock"/></svg>${I18N.t('missions.chapterLabel', { id: ch.id, name: ch.name })}</div>
    </div>`;
    return `
    <div class="chapter-row">
      <div class="chapter-label">${I18N.t('missions.chapterLabel', { id: ch.id, name: ch.name })}</div>
      ${chapterRowSVG(ch, i)}
    </div>`;
  }).join('');
  DOM.chapterTrail.querySelectorAll('.trail-node-svg[data-unlocked="true"]').forEach(g => {
    g.addEventListener('click', () => startMission(Number(g.dataset.missionIndex)));
  });
}

// Раунд 15 (И4, П2): «Играть» — 1 клик до боя: сразу следующая непройденная
// миссия (progress.unlocked — первая не пройденная; первый запуск — миссия 1,
// вся кампания пройдена — последняя). Выбор миссии — кнопка «Главы».
function nextMissionIndex() {
  return Math.max(0, Math.min(MISSIONS.length, progress.unlocked || 1) - 1);
}
DOM.btnPlay.addEventListener('click', () => { SFX.unlock(); SFX.click(); startMission(nextMissionIndex()); });
// Раунд 15 (И1): «Главы» — отдельная кнопка меню, карта глав.
document.getElementById('btnChapters').addEventListener('click', () => { SFX.unlock(); SFX.click(); renderChapterTrail(); showScreen('missions'); });
DOM.btnBackToMenu.addEventListener('click', () => { SFX.click(); showScreen('menu'); });
DOM.btnShop.addEventListener('click', () => { SFX.unlock(); SFX.click(); renderShop(); showScreen('shop'); });
DOM.btnBackFromShop.addEventListener('click', () => { SFX.click(); showScreen('menu'); });

// ---------------------------------------------------------------- магазин
// Раунд 11 (баг-репорт основателя): заголовок+цена — своя строка, описание —
// отдельная строка на всю ширину карточки. Раньше цена стояла по центру
// сбоку от .si-info и при переносе длинного описания на 2 строки
// визуально наезжала на текст. Теперь наложение физически невозможно,
// т.к. кнопка цены делит место только с однострочным заголовком.
// Раунд 15 (И1): карточка магазина — мини-иконка слева, название, короткое
// описание и строка «было → станет» (из SHOP/HERO, не из текста), справа —
// цена с иконкой кристалла. costText — число (цена в кристаллах, рисуется с
// иконкой) или готовая строка (цена DLC на Яндексе в рублях).
const SHOP_METAL = ['#c98b4a', '#c9d2dc', '#ffd35c', '#ffd35c'];
const SI_SVG = {
  tower: () => `<path d="M14 44 18 20h12l4 24" fill="none" stroke="#5a3b1e" stroke-width="3.2"/><path d="M17 33h14M16 38h16" stroke="#8a5d32" stroke-width="2"/><rect x="11" y="15" width="26" height="6" rx="1" fill="#b07a44" stroke="#2a1a0e" stroke-width="1.6"/><path d="M9 15 24 4l15 11Z" fill="#8a3b22" stroke="#2a1a0e" stroke-width="1.6" stroke-linejoin="round"/><path d="M24 4v-3l6 1.6-6 1.6" fill="#3fae6b"/>`,
  trap: () => `<path d="M6 40h36" stroke="#5a3b1e" stroke-width="3"/><path d="M8 40l4-18 4 18M16 40l4-24 4 24M24 40l4-24 4 24M32 40l4-18 4 18" fill="#b9b2a4" stroke="#2a1a0e" stroke-width="1.6" stroke-linejoin="round"/>`,
  sword: (m) => `<path d="M38 6l4 0 0 4-20 20-4-4Z" fill="${m}" stroke="#2a1a0e" stroke-width="1.8" stroke-linejoin="round"/><path d="M11 25l12 12-3 3-12-12Z" fill="#7a5636" stroke="#2a1a0e" stroke-width="1.8"/><path d="M13 35l-6 6" stroke="#5a3b1e" stroke-width="4.5" stroke-linecap="round"/>`,
  shield: (m) => `<path d="M24 5l16 6v12c0 10-7 17-16 21C15 40 8 33 8 23V11Z" fill="${m}" stroke="#2a1a0e" stroke-width="2" stroke-linejoin="round"/><path d="M24 11v28M13 20h22" stroke="rgba(42,26,14,.45)" stroke-width="2.4"/>`,
  armor: (m) => `<path d="M14 8l5 3h10l5-3 7 7-4 7v20H11V22l-4-7Z" fill="${m}" stroke="#2a1a0e" stroke-width="2" stroke-linejoin="round"/><path d="M19 11c1 6 9 6 10 0M24 17v22M16 28h16" fill="none" stroke="rgba(42,26,14,.45)" stroke-width="2"/>`,
  blade: (m) => `<path d="M42 3l3 3-27 27-3-3Z" fill="${m}" stroke="#2a1a0e" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 26l13 13-2.5 2.5-13-13Z" fill="#7a5636" stroke="#2a1a0e" stroke-width="1.8"/><path d="M11 37l-6 6" stroke="#5a3b1e" stroke-width="4.5" stroke-linecap="round"/>`,
  // r15 И10: боевой рог (как #i-horn в index.html), а не динамик.
  horn: () => `<g transform="translate(1 2) scale(1.9)" stroke="#2a1a0e" stroke-width="1.1" stroke-linejoin="round"><path d="M2.6 15.6C6.2 18.4 10.6 17 13.4 13.4L17.6 4.4 23 10.6 16.6 15.8C12.4 20.8 6.2 21.8 2.2 18.6Z" fill="#f2e6cf"/><ellipse cx="20.3" cy="7.5" rx="3.9" ry="1.5" transform="rotate(49 20.3 7.5)" fill="#5a3214"/><path d="M7.4 16.9 8.6 20.2 10.3 19.6 9.3 16.3ZM12.2 13.9 14.6 16.4 15.9 15.2 13.5 12.7Z" fill="#e0a030" stroke-width=".9"/><circle cx="2.3" cy="17.1" r="1.4" fill="#e0a030" stroke-width=".9"/><path d="M4.5 20.2C8 23 13.5 22 17.2 17.6" fill="none" stroke="#8a5d32" stroke-width="1" stroke-linecap="round"/></g>`,
  coins: () => `<g stroke="#2a1a0e" stroke-width="1.8"><ellipse cx="20" cy="36" rx="12" ry="5" fill="#e0a030"/><path d="M8 30v6M32 30v6" /><ellipse cx="20" cy="30" rx="12" ry="5" fill="#ffd35c"/><ellipse cx="30" cy="22" rx="12" ry="5" fill="#e0a030"/><ellipse cx="30" cy="16" rx="12" ry="5" fill="#ffe08a"/></g>`,
  revive: () => `<path d="M24 8l3.8 8 8.7 1.1-6.4 6 1.7 8.6L24 27.4l-7.8 4.3 1.7-8.6-6.4-6 8.7-1.1Z" fill="#ffd35c" stroke="#2a1a0e" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 34a17 17 0 0 0 30 0" fill="none" stroke="#7bd98a" stroke-width="3.4" stroke-linecap="round"/><path d="M39 28v7h-7" fill="none" stroke="#7bd98a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  music: () => `<path d="M18 36V10l20-5v25" fill="none" stroke="#2a1a0e" stroke-width="3.4"/><path d="M18 36V10l20-5v25" fill="none" stroke="#ffe08a" stroke-width="1.6"/><ellipse cx="13" cy="36" rx="6" ry="4.6" fill="#ffd35c" stroke="#2a1a0e" stroke-width="1.8"/><ellipse cx="33" cy="30" rx="6" ry="4.6" fill="#ffd35c" stroke="#2a1a0e" stroke-width="1.8"/>`,
  sun: () => `<circle cx="20" cy="22" r="9" fill="#ffd35c" stroke="#2a1a0e" stroke-width="1.8"/><g stroke="#ffd35c" stroke-width="3" stroke-linecap="round"><path d="M20 5v4M20 35v4M3 22h4M33 22h4M8 10l3 3M29 31l3 3M8 34l3-3M29 13l3-3"/></g><path d="M38 28a8 8 0 1 1-8-9 6 6 0 0 0 8 9Z" fill="#c9d2ff" stroke="#2a1a0e" stroke-width="1.6"/>`,
  palette: () => `<path d="M24 6C13 6 5 14 5 23c0 8 6 12 11 11 4-1 3-5 6-6 4-1 7 3 11 1 6-3 10-8 10-13C43 10 34 6 24 6Z" fill="#e8d6b0" stroke="#2a1a0e" stroke-width="1.8"/><circle cx="15" cy="18" r="3.4" fill="#c8401e"/><circle cx="24" cy="13" r="3.4" fill="#3a4fd0"/><circle cx="33" cy="16" r="3.4" fill="#3fae6b"/><circle cx="35" cy="25" r="3.4" fill="#e0a030"/>`,
  flag: () => `<path d="M12 44V5" stroke="#5a3b1e" stroke-width="3.2" stroke-linecap="round"/><path d="M13 7h24l-6 8 6 8H13Z" fill="#ffd35c" stroke="#2a1a0e" stroke-width="1.8" stroke-linejoin="round"/>`,
  cloak: () => `<path d="M16 8h16l4 6-2 28-10-4-10 4-2-28Z" fill="#c8401e" stroke="#2a1a0e" stroke-width="1.8" stroke-linejoin="round"/><circle cx="24" cy="9" r="4" fill="#ffd35c" stroke="#2a1a0e" stroke-width="1.6"/><path d="M20 16l-2 20M28 16l2 20" stroke="rgba(0,0,0,.25)" stroke-width="2"/>`,
  skull: () => `<path d="M24 6c-9 0-15 6-15 14 0 5 2 8 5 10v6h20v-6c3-2 5-5 5-10 0-8-6-14-15-14Z" fill="#e8e0d0" stroke="#2a1a0e" stroke-width="1.8"/><circle cx="18" cy="21" r="4" fill="#2a1a0e"/><circle cx="30" cy="21" r="4" fill="#2a1a0e"/><path d="M20 36v-4M24 36v-4M28 36v-4" stroke="#2a1a0e" stroke-width="1.6"/><path d="M4 44l40-6" stroke="#c8401e" stroke-width="3" stroke-linecap="round"/>`,
  fort: () => `<path d="M8 42V20h6v5h5v-5h10v5h5v-5h6v22Z" fill="#9a8c78" stroke="#2a1a0e" stroke-width="1.8" stroke-linejoin="round"/><path d="M20 42v-9a4 4 0 0 1 8 0v9Z" fill="#2a1a0e"/><path d="M36 14V4M36 5h8l-3 3 3 3h-8" fill="#3fae6b" stroke="#2a1a0e" stroke-width="1.4"/><path d="M24 12l4 4h-2.5v4h-3v-4H20Z" fill="#7bd98a" stroke="#2a1a0e" stroke-width="1.2"/>`,
};
function shopIcon(kind, tier) {
  const f = SI_SVG[kind];
  return f ? `<svg class="si-icon" viewBox="0 0 48 48" aria-hidden="true">${f(SHOP_METAL[Math.min(tier || 0, 3)])}</svg>` : '';
}
function priceHTML(cost) { return `<span class="si-price">${cost}</span><span class="diamond-dot"></span>`; }
function shopRow(name, desc, costText, canBuy, owned, onBuy, extra = {}) {
  const row = document.createElement('div');
  row.className = 'shop-item' + (extra.icon ? ' has-icon' : '') + (owned ? ' is-owned' : '');
  const btn = document.createElement('button');
  btn.className = 'si-buy' + (owned ? ' owned' : '');
  if (owned) btn.textContent = extra.ownedText || I18N.t('shop.bought');
  else if (typeof costText === 'number') btn.innerHTML = priceHTML(costText);
  else btn.textContent = costText;
  btn.disabled = owned || !canBuy;
  if (!owned && onBuy) btn.addEventListener('click', onBuy);
  const stat = extra.stat
    ? `<div class="si-stat"><span class="si-stat-label">${extra.stat.label}</span> <b class="si-from">${extra.stat.from}</b><span class="si-arrow">→</span><b class="si-to">${extra.stat.to}</b></div>`
    : '';
  row.innerHTML = `${extra.icon || ''}<div class="si-body"><div class="si-header"><b class="si-title">${name}</b></div>${desc ? `<div class="si-desc">${desc}</div>` : ''}${stat}</div>`;
  row.appendChild(btn);
  return row;
}
function shopSectionTitle(text, iconId) {
  const h = document.createElement('div');
  h.className = 'shop-section-title';
  h.textContent = text;
  // r15 И12: иконка из SVG-спрайта (index.html) вместо эмодзи в строке перевода.
  if (iconId) h.insertAdjacentHTML('afterbegin', `<svg class="ico" aria-hidden="true"><use href="#${iconId}"/></svg>`);
  return h;
}
// r15 И12: значок кнопки внутри строки справки («Кнопка {icon}») — тот же
// SVG, что на самой тач-кнопке, а не эмодзи.
function inlineIcon(id) { return `<svg class="ico ico-inline" aria-hidden="true"><use href="#${id}"/></svg>`; }
function shopNote(text) {
  const p = document.createElement('div');
  p.className = 'shop-note';
  p.textContent = text;
  return p;
}
// Позиции, запертые по главе, — одной компактной строкой внизу секции
// (раньше — полноценные карточки с «замком» вперемешку с доступными).
function shopLockedStrip(items) {
  const el = document.createElement('div');
  el.className = 'shop-locked-strip';
  el.innerHTML = `<svg class="ico"><use href="#i-lock"/></svg><span class="sls-label">${I18N.t('shop.lockedLater')}:</span> ` +
    items.map(it => `<span class="sls-item">${it.name} <em>${I18N.t('shop.lockedChapter', { n: it.chapter })}</em></span>`).join('<span class="sls-sep">·</span>');
  return el;
}
function spend(cost) {
  progress.shopCurrencySpent = (progress.shopCurrencySpent || 0) + cost;
  recalcShopCurrency(progress);
  saveProgress(progress);
  renderShop();
}
// Раунд 11: однотипные покупки сгруппированы по смыслу. Раунд 15 (И1):
// две вкладки — «Улучшения» (постройки, герой, экономика — боевое первым) и
// «Музыка и стиль» (музыка, косметика, DLC). Логика покупок, цены и гейтинг
// по главам не менялись — только раскладка и вид карточек.
let shopTab = 'upgrades';
function renderShopTabs() {
  const tabs = document.getElementById('shopTabs');
  tabs.innerHTML = '';
  [['upgrades', 'shop.tabUpgrades'], ['extras', 'shop.tabExtras']].forEach(([id, key]) => {
    const b = document.createElement('button');
    b.className = 'shop-tab' + (shopTab === id ? ' active' : '');
    b.textContent = I18N.t(key);
    b.addEventListener('click', () => { if (shopTab !== id) { SFX.click(); shopTab = id; renderShop(); document.querySelector('#screenShop .panel-card').scrollTop = 0; } });
    tabs.appendChild(b);
  });
}
function renderShop() {
  DOM.shopCurrencyText.textContent = Math.floor(progress.shopCurrency);
  const cur = progress.shopCurrency;
  const chapterNow = unlockedChapter(progress);
  DOM.shopList.innerHTML = '';
  renderShopTabs();

  function add(el) { DOM.shopList.appendChild(el); }
  const T = (k) => I18N.t(k);
  // Секция: заголовок, доступные карточки, затем компактная строка запертых.
  function section(title, entries) {
    add(shopSectionTitle(title));
    const locked = [];
    for (const e of entries) {
      if (e.gate && chapterNow < e.gate.requiresChapter && !progress[e.key]) { locked.push({ name: e.gate.name, chapter: e.gate.requiresChapter }); continue; }
      add(e.row());
    }
    if (locked.length) add(shopLockedStrip(locked));
  }
  function simple(key, def, desc, icon, stat, extraBuy) {
    return () => shopRow(def.name, desc, def.cost, cur >= def.cost, !!progress[key],
      () => { if (cur >= def.cost) { progress[key] = true; if (extraBuy) extraBuy(); spend(def.cost); } },
      { icon, stat: progress[key] ? null : stat });
  }
  const towers = (progress.towerA ? 1 : 0) + (progress.towerB ? 1 : 0) + (progress.towerC ? 1 : 0);
  const traps = (progress.trap ? 1 : 0) + (progress.trap2 ? 1 : 0);
  const towerStat = { label: T('shop.statTowers'), from: towers, to: towers + 1 };
  const trapStat = { label: T('shop.statTraps'), from: traps, to: traps + 1 };

  if (shopTab === 'upgrades') {
    // ------- Постройки
    section(T('shop.sectionBuildings'), [
      { row: simple('towerA', SHOP.towerA, I18N.t('shop.towerADesc', { dmg: SHOP.towerA.dmg }), shopIcon('tower'), towerStat) },
      { row: () => {
        const canBuyB = progress.towerA && cur >= SHOP.towerB.cost;
        return shopRow(SHOP.towerB.name, progress.towerA ? T('shop.towerBDescOwned') : T('shop.towerBDescLocked'),
          SHOP.towerB.cost, canBuyB, progress.towerB,
          () => { if (canBuyB) { progress.towerB = true; spend(SHOP.towerB.cost); } },
          { icon: shopIcon('tower'), stat: progress.towerB || !progress.towerA ? null : towerStat });
      } },
      // r15 И20 (куратор №7: «Archer Tower III: Towers 0→1 при не купленной I»):
      // III — после II, как II после I: до этого приглушена с «Сначала купите
      // вторую башню», без строки «было → станет».
      { key: 'towerC', gate: SHOP.towerC, row: () => {
        const ready = !!progress.towerB || !!progress.towerC;
        const canBuyC = ready && cur >= SHOP.towerC.cost;
        return shopRow(SHOP.towerC.name, ready ? T('shop.towerCDesc') : T('shop.towerCDescLocked'),
          SHOP.towerC.cost, canBuyC, progress.towerC,
          () => { if (canBuyC) { progress.towerC = true; spend(SHOP.towerC.cost); } },
          { icon: shopIcon('tower'), stat: progress.towerC || !ready ? null : towerStat });
      } },
      { row: simple('trap', SHOP.trap, I18N.t('shop.trapDesc', { cd: SHOP.trap.cooldown }), shopIcon('trap'), trapStat) },
      { key: 'trap2', gate: SHOP.trap2, row: simple('trap2', SHOP.trap2, T('shop.trap2Desc'), shopIcon('trap'), trapStat) },
    ]);
    // ------- Снаряжение и способности героя
    const gearStat = {
      gearSword: (t) => ({ label: T('shop.statDmg'), from: HERO.meleeDmg + t * SHOP.gearSword.dmgPerTier, to: HERO.meleeDmg + (t + 1) * SHOP.gearSword.dmgPerTier }),
      gearShield: (t) => ({ label: T('shop.statHp'), from: HERO.hp + t * SHOP.gearShield.hpPerTier, to: HERO.hp + (t + 1) * SHOP.gearShield.hpPerTier }),
      gearArmor: (t) => ({ label: T('shop.statArmor'), from: Math.round(Math.min(0.5, t * SHOP.gearArmor.reductionPerTier) * 100) + '%', to: Math.round(Math.min(0.5, (t + 1) * SHOP.gearArmor.reductionPerTier) * 100) + '%' }),
      gearLongBlade: (t) => ({ label: T('shop.statRange'), from: Math.round(HERO.meleeRange * (1 + t * SHOP.gearLongBlade.rangeMultPerTier)), to: Math.round(HERO.meleeRange * (1 + (t + 1) * SHOP.gearLongBlade.rangeMultPerTier)) }),
    };
    const gearIcon = { gearSword: 'sword', gearShield: 'shield', gearArmor: 'armor', gearLongBlade: 'blade' };
    const gearEffect = { gearSword: 'shop.gearSwordEffect', gearShield: 'shop.gearShieldEffect', gearArmor: 'shop.gearArmorEffect', gearLongBlade: 'shop.gearLongBladeEffect' };
    section(T('shop.sectionHero'), [
      ...['gearSword', 'gearShield', 'gearArmor', 'gearLongBlade'].map(key => ({ row: () => {
        const def = SHOP[key];
        const tier = progress[key];
        const max = def.costs.length;
        if (tier >= max) {
          return shopRow(`${def.name} <span class="si-tier">${tier}/${max}</span>`, I18N.t('shop.gearMaxLevel', { tier, max }), '', false, true, null,
            { icon: shopIcon(gearIcon[key], tier), ownedText: T('shop.maxed') });
        }
        const cost = def.costs[tier];
        return shopRow(`${def.name} <span class="si-tier">${tier}/${max}</span>`, T(gearEffect[key]), cost, cur >= cost, false,
          () => { if (cur >= cost) { progress[key] += 1; spend(cost); } },
          { icon: shopIcon(gearIcon[key], tier + 1), stat: gearStat[key](tier) });
      } })),
      { row: simple('heroAbilityCry', SHOP.heroAbilityCry, I18N.t('shop.heroCryDesc', {
        dmg: Math.round((SHOP.heroAbilityCry.dmgMult - 1) * 100),
        spd: Math.round((SHOP.heroAbilityCry.speedMult - 1) * 100),
        dur: SHOP.heroAbilityCry.duration,
      }), shopIcon('horn'), null) },
    ]);
    // ------- Экономика (по главе открытия)
    const startGold = 24;
    const buyback = HERO.buybackCost;
    section(T('shop.sectionEconomy'), [
      { key: 'startGoldBoost', gate: SHOP.startGoldBoost, row: simple('startGoldBoost', SHOP.startGoldBoost, I18N.t('shop.startGoldDesc', { n: SHOP.startGoldBoost.amount }), shopIcon('coins'),
        { label: T('shop.statStartGold'), from: startGold, to: startGold + SHOP.startGoldBoost.amount }) },
      { key: 'buybackDiscount', gate: SHOP.buybackDiscount, row: simple('buybackDiscount', SHOP.buybackDiscount, I18N.t('shop.buybackDiscountDesc', { n: SHOP.buybackDiscount.discount }), shopIcon('revive'),
        { label: T('shop.statBuyback'), from: buyback, to: Math.max(5, buyback - SHOP.buybackDiscount.discount) }) },
    ]);
    return;
  }

  // ------- Музыка (раунд 5, реальные mp3 — раунд 10)
  section(T('shop.sectionMusic'), ['musicTrack2', 'musicTrack3'].map(key => ({
    row: simple(key, SHOP[key], T('shop.musicTrackDesc'), shopIcon('music'), null),
  })));
  // ------- Косметика (владение отдельно от выбора — см. timeOfDayRow/themeRow)
  section(T('shop.sectionCosmetics'), [
    { row: timeOfDayRow },
    { row: themeRow },
    { row: () => shopRow(SHOP.cosmeticFlagGold.name, T('shop.flagGoldDesc'), SHOP.cosmeticFlagGold.cost, cur >= SHOP.cosmeticFlagGold.cost, progress.cosmeticFlag === 'gold',
      () => { if (cur >= SHOP.cosmeticFlagGold.cost) { progress.cosmeticFlag = 'gold'; spend(SHOP.cosmeticFlagGold.cost); } },
      { icon: shopIcon('flag') }) },
    { row: simple('ownedCloakRed', SHOP.cosmeticCloakRed, T('shop.cloakRedDesc'), shopIcon('cloak'), null) },
  ]);
  // ------- DLC (реальная оплата на Яндексе, за кристаллы — VK/локально)
  add(shopSectionTitle(T('shop.sectionDlc')));
  const platformKind = PLATFORM.kind();
  if (platformKind === 'yandex') {
    add(shopNote(T('shop.dlcYandexNote')));
    if (PLATFORM.isYandexCatalogBroken()) add(shopNote(T('shop.dlcYandexBroken')));
  } else if (platformKind === 'vk') {
    add(shopNote(T('shop.dlcVkNote')));
  } else {
    add(shopNote(T('shop.dlcLocalNote')));
  }
  add(dlcRow('dlcHardMode', SHOP.dlcHardMode,
    I18N.t('shop.dlcHardDesc', {
      hp: Math.round((SHOP.dlcHardMode.enemyUnitHpMult - 1) * 100),
      dmg: Math.round((SHOP.dlcHardMode.enemyUnitDmgMult - 1) * 100),
      core: Math.round((SHOP.dlcHardMode.enemyCoreHpMult - 1) * 100),
    }),
  ));
  add(dlcRow('dlcPlayerBuff', SHOP.dlcPlayerBuff,
    I18N.t('shop.dlcPlayerDesc', {
      inc: Math.round((SHOP.dlcPlayerBuff.playerIncomeMult - 1) * 100),
      core: Math.round((SHOP.dlcPlayerBuff.playerCoreHpMult - 1) * 100),
    }),
  ));
}

function dlcRow(key, def, effectText) {
  const activeKey = key + 'Active';
  const platformKind = PLATFORM.kind();

  function commitPurchase() {
    progress[key] = true;
    progress[activeKey] = true;
    saveProgress(progress);
    renderShop();
  }
  // VK и локальный тест: своей платёжной API для микротранзакций площадка
  // не даёт (см. КОНЦЕПТ_ГДД.md, «Допущения») — DLC продаётся за
  // внутриигровую валюту, как и всё остальное в магазине.
  function buyWithDiamonds() {
    if (progress.shopCurrency < def.costDiamonds) { SFX.buyDenied(); return; }
    progress.shopCurrencySpent = (progress.shopCurrencySpent || 0) + def.costDiamonds;
    recalcShopCurrency(progress);
    commitPurchase();
  }
  // Яндекс: настоящий ИНАП через SDK. Известный шрам студии — заведённый в
  // консоли товар ≠ подключённые покупки, поэтому недоступность обязана
  // сообщаться громко (алерт-баннер), а не тихой disabled-кнопкой.
  function buyYandex(btn) {
    if (PLATFORM.isYandexCatalogBroken()) {
      showLoudNotice(I18N.t('shop.dlcUnavailable', { name: def.name }));
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = I18N.t('shop.paying'); }
    PLATFORM.purchaseYandexProduct(key).then((res) => {
      if (res.ok) { commitPurchase(); return; }
      const reasonText = res.reason === 'purchase-failed'
        ? I18N.t('shop.dlcReasonPurchaseFailed')
        : I18N.t('shop.dlcReasonUnavailable');
      showLoudNotice(I18N.t('shop.dlcFailed', { name: def.name, reason: reasonText }));
      renderShop();
    });
  }
  function onPurchaseClick(e) {
    if (platformKind === 'yandex') { buyYandex(e && e.currentTarget); } else { buyWithDiamonds(); }
  }

  if (!progress[key]) {
    let costText, canBuy;
    if (platformKind === 'yandex') {
      const price = PLATFORM.getYandexProductPrice(key);
      costText = price || `~${def.costRub} ₽`;
      // Кнопка ВСЕГДА активна — недоступность (SDK/каталог/покупки не
      // подключены) обрабатывается громким уведомлением по клику, а не
      // молчаливым disabled (прямое требование этой задачи).
      canBuy = true;
    } else {
      costText = def.costDiamonds; // И1: число — цена рисуется с иконкой кристалла
      canBuy = progress.shopCurrency >= def.costDiamonds;
    }
    const row = shopRow(def.name, effectText, costText, canBuy, false, onPurchaseClick, { icon: shopIcon(key === 'dlcHardMode' ? 'skull' : 'fort') });
    if (platformKind === 'yandex' && PLATFORM.isYandexCatalogBroken()) {
      const warn = document.createElement('div');
      warn.className = 'si-desc si-warning';
      warn.textContent = I18N.t('shop.priceWarning');
      row.querySelector('.si-body').appendChild(warn);
    }
    return row;
  }
  const row = shopRow(def.name, I18N.t('shop.boughtWithEffect', { effect: effectText }), '', false, true, null, { icon: shopIcon(key === 'dlcHardMode' ? 'skull' : 'fort') });
  const toggle = document.createElement('button');
  toggle.className = 'si-buy toggle-inline' + (progress[activeKey] ? ' owned' : ' off');
  toggle.textContent = progress[activeKey] ? I18N.t('shop.on') : I18N.t('shop.off');
  toggle.addEventListener('click', () => {
    progress[activeKey] = !progress[activeKey];
    saveProgress(progress);
    renderShop();
  });
  row.querySelector('.si-buy').replaceWith(toggle); // И1: тумблер на месте кнопки цены
  return row;
}

// Ночная правка — переключатель времени суток (Цикл/День/Ночь). Покупка
// разблокирует навсегда (progress.ownedTime*), кнопки переключают текущий
// выбор (progress.cosmeticTime) свободно между уже купленными вариантами,
// включая бесплатный возврат на «Цикл».
function timeOfDayRow() {
  const row = document.createElement('div');
  row.className = 'shop-item has-icon option-item';
  row.innerHTML = `${shopIcon('sun')}<div class="si-body"><div class="si-header"><b class="si-title">${I18N.t('shop.timeOfDayTitle')}</b></div>
    <div class="si-desc">${I18N.t('shop.timeOfDayDesc')}</div></div>`;
  const group = document.createElement('div');
  group.className = 'time-select-group';
  row.querySelector('.si-body').appendChild(group);
  const cur = progress.shopCurrency;
  const opts = [
    { id: 'cycle', label: I18N.t('shop.timeCycle'), owned: true, cost: 0 },
    { id: 'day', label: I18N.t('shop.timeDay'), owned: progress.ownedTimeDay, cost: SHOP.cosmeticDay.cost },
    { id: 'night', label: I18N.t('shop.timeNight'), owned: progress.ownedTimeNight, cost: SHOP.cosmeticNight.cost },
  ];
  opts.forEach(o => {
    const selected = progress.cosmeticTime === o.id;
    const btn = document.createElement('button');
    btn.className = 'si-buy time-opt' + (selected ? ' owned' : '');
    btn.innerHTML = selected ? `✓ ${o.label}` : (o.owned ? o.label : `${o.label} · ${priceHTML(o.cost)}`);
    btn.disabled = selected || (!o.owned && cur < o.cost);
    btn.addEventListener('click', () => {
      if (!o.owned) {
        if (progress.shopCurrency < o.cost) return;
        progress.shopCurrencySpent = (progress.shopCurrencySpent || 0) + o.cost;
        recalcShopCurrency(progress);
        if (o.id === 'day') progress.ownedTimeDay = true;
        if (o.id === 'night') progress.ownedTimeNight = true;
      }
      progress.cosmeticTime = o.id;
      saveProgress(progress);
      renderShop();
    });
    group.appendChild(btn);
  });
  return row;
}
// Утренняя правка основателя: тема оформления всего интерфейса — та же
// схема владение/выбор, что у времени суток, только источник вариантов —
// THEMES (data.js), чтобы третья/четвёртая тема добавлялись одной записью
// в реестре, без правок здесь.
function themeRow() {
  const row = document.createElement('div');
  row.className = 'shop-item has-icon option-item';
  row.innerHTML = `${shopIcon('palette')}<div class="si-body"><div class="si-header"><b class="si-title">${I18N.t('shop.themeTitle')}</b></div>
    <div class="si-desc">${I18N.t('shop.themeDesc')}</div></div>`;
  const group = document.createElement('div');
  group.className = 'time-select-group';
  row.querySelector('.si-body').appendChild(group);
  const cur = progress.shopCurrency;
  THEMES.forEach(t => {
    const owned = !t.ownedKey || progress[t.ownedKey];
    const selected = progress.activeTheme === t.id;
    const btn = document.createElement('button');
    btn.className = 'si-buy time-opt' + (selected ? ' owned' : '');
    btn.innerHTML = selected ? `✓ ${t.label}` : (owned ? t.label : `${t.label} · ${priceHTML(t.cost)}`);
    btn.disabled = selected || (!owned && cur < t.cost);
    btn.addEventListener('click', () => {
      if (!owned) {
        if (progress.shopCurrency < t.cost) return;
        progress.shopCurrencySpent = (progress.shopCurrencySpent || 0) + t.cost;
        recalcShopCurrency(progress);
        progress[t.ownedKey] = true;
      }
      progress.activeTheme = t.id;
      saveProgress(progress);
      applyTheme();
      renderShop();
    });
    group.appendChild(btn);
  });
  return row;
}
// Раунд 10: 2 независимых переключателя — звук (SFX) и музыка (mp3-треки),
// каждый в своей паре кнопок (меню + пауза), никогда не трогают друг друга.
function refreshMuteButtons() {
  const sfxText = progress.muted ? I18N.t('menu.soundOff') : I18N.t('menu.soundOn');
  const musicText = progress.musicMuted ? I18N.t('menu.musicOff') : I18N.t('menu.musicOn');
  // Раунд 15 (И1): в меню — строки-переключатели в поповере настроек
  // (подпись + тумблер), в паузе — прежние кнопки с текстом.
  DOM.btnMute.querySelector('.toggle-switch').classList.toggle('on', !progress.muted);
  DOM.btnMuteMusic.querySelector('.toggle-switch').classList.toggle('on', !progress.musicMuted);
  DOM.btnMute.setAttribute('aria-pressed', String(!progress.muted));
  DOM.btnMuteMusic.setAttribute('aria-pressed', String(!progress.musicMuted));
  DOM.btnMutePause.textContent = sfxText;
  DOM.btnMuteMusicPause.textContent = musicText;
}
// Настройки главного меню — поповер у шестерёнки; закрывается повторным
// нажатием, кликом мимо или уходом с экрана меню (showScreen).
const settingsPop = document.getElementById('settingsPop');
function setSettingsOpen(open) {
  settingsPop.classList.toggle('hidden', !open);
  document.getElementById('btnSettings').classList.toggle('active', open);
}
document.getElementById('btnSettings').addEventListener('click', (e) => {
  e.stopPropagation(); SFX.unlock(); SFX.click();
  setSettingsOpen(settingsPop.classList.contains('hidden'));
});
settingsPop.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => { if (!settingsPop.classList.contains('hidden')) setSettingsOpen(false); });
function toggleSfxMuted() {
  progress.muted = !progress.muted;
  SFX.setMuted(progress.muted);
  saveProgress(progress);
  refreshMuteButtons();
  if (!progress.muted) SFX.click();
}
function toggleMusicMuted() {
  progress.musicMuted = !progress.musicMuted;
  MUSIC.setMusicMuted(progress.musicMuted);
  saveProgress(progress);
  refreshMuteButtons();
}
DOM.btnMute.addEventListener('click', toggleSfxMuted);
DOM.btnMutePause.addEventListener('click', toggleSfxMuted);
DOM.btnMuteMusic.addEventListener('click', toggleMusicMuted);
DOM.btnMuteMusicPause.addEventListener('click', toggleMusicMuted);
refreshMuteButtons();

DOM.pauseBtn.addEventListener('click', () => togglePause());
DOM.btnResume.addEventListener('click', () => togglePause());
DOM.btnToMenuFromPause.addEventListener('click', () => { showScreen('menu'); });
DOM.btnToMenuFromResult.addEventListener('click', () => { showScreen('menu'); });
DOM.btnRetry.addEventListener('click', () => startMission(match.missionIndex));
// Магазин доступен сразу с экрана итога миссии (раунд 5, запрос
// основателя), не только из главного меню.
DOM.btnShopFromResult.addEventListener('click', () => { SFX.click(); renderShop(); showScreen('shop'); });
// Межуровневая реклама (решение основателя 23.09.2026): по «Далее», не чаще
// раза в 3 минуты. Отсчёт идёт от загрузки игры и сбрасывается любым
// показанным роликом, включая рекламу за награду.
const INTERSTITIAL_COOLDOWN_MS = 180000;
const AD_RECHECK_INTERVAL_MS = 4000;
const AD_RECHECK_MAX_ATTEMPTS = 8;
let lastAdShownAt = Date.now();
let interstitialInFlight = false;
DOM.btnNext.addEventListener('click', () => {
  if (interstitialInFlight) return;
  const nextIdx = match.missionIndex + 1;
  const goNext = () => { if (nextIdx < MISSIONS.length) startMission(nextIdx); else showScreen('menu'); };
  if (!PLATFORM.supportsInterstitial() || Date.now() - lastAdShownAt < INTERSTITIAL_COOLDOWN_MS) { goNext(); return; }
  interstitialInFlight = true;
  DOM.btnNext.disabled = true;
  PLATFORM.showInterstitial().then((shown) => {
    if (shown) lastAdShownAt = Date.now();
    interstitialInFlight = false;
    DOM.btnNext.disabled = false;
    goNext();
  });
});

function togglePause() {
  if (screen === 'match') { showScreen('paused'); }
  else if (screen === 'paused') { showScreen('match'); }
}
PORTRAIT_TOUCH_MQ.addEventListener('change', (e) => { if (e.matches && screen === 'match') showScreen('paused'); });

// ---------------------------------------------------------------- плейлист (раунд 10)
// Полноценная вкладка в меню (не всплывающий пикер в паузе, как в раунде
// 8-9) — список купленных треков, тумблер вкл/выкл каждого, порядок
// (стрелками, не drag&drop — тот же результат «свой порядок», дешевле в
// реализации), перемешать. Пауза/меню и бой играют РАЗНУЮ музыку (см.
// showScreen) — плейлист управляет именно боевыми треками.
function ownedMusicTrackIds() {
  return Object.keys(MUSIC_TRACKS).filter(id => !MUSIC_TRACKS[id].ownedKey || progress[MUSIC_TRACKS[id].ownedKey]);
}
// Прямая совместимость: если появится новый трек, а у игрока уже есть
// сохранённый плейлист без него — дописываем на лету, не теряя порядок,
// который игрок уже настроил (см. save.js — Object.assign не углубляется
// в вложенные объекты).
function ensurePlaylistHasOwned() {
  const owned = ownedMusicTrackIds();
  for (const id of owned) {
    if (!progress.playlist.order.includes(id)) progress.playlist.order.push(id);
    if (!(id in progress.playlist.enabled)) progress.playlist.enabled[id] = true;
  }
}
function playlistActiveTracks() {
  ensurePlaylistHasOwned();
  const owned = ownedMusicTrackIds();
  return progress.playlist.order.filter(id => owned.includes(id) && progress.playlist.enabled[id] !== false);
}
function pickNextBattleTrack(afterId) {
  const list = playlistActiveTracks();
  if (!list.length) return 'battle_theme'; // бесплатный трек всегда доступен как фолбэк
  if (progress.playlist.shuffle) {
    if (list.length === 1) return list[0];
    let pick;
    do { pick = list[Math.floor(Math.random() * list.length)]; } while (pick === afterId);
    return pick;
  }
  const idx = list.indexOf(afterId);
  return list[(idx + 1) % list.length];
}
// Выход из "Пульса сражения" (см. MUSIC.onEnded) должен вести в ОБЫЧНУЮ
// ротацию, а не иногда обратно в сам пульс — pickNextBattleTrack("трек до
// пульса") в маленьком плейлисте мог легитимно посчитать "следующий" =
// сам battle_pulse (он такой же полноправный пункт плейлиста), и тогда
// MUSIC.play() без force молча не делала ничего (тот же trackId уже
// "current"), оставляя игру без музыки — свежий баг, найден до отправки,
// не из отчёта основателя.
function pickNextNonPulseTrack(afterId) {
  const list = playlistActiveTracks().filter(id => id !== 'battle_pulse');
  if (!list.length) return 'battle_theme';
  if (progress.playlist.shuffle) return list[Math.floor(Math.random() * list.length)];
  const idx = list.indexOf(afterId);
  return list[(idx + 1) % list.length];
}
MUSIC.onEnded((endedId) => {
  if (screen !== 'match' && screen !== 'paused' && screen !== 'result') return;
  if (endedId === 'menu') return; // меню/пауза лупится само (audio.loop=true)
  if (match && match.musicPulseOverride) {
    // Правка основателя: раньше "Пульс сражения" гасился МГНОВЕННО, как
    // только число юнитов падало ниже нижнего порога гистерезиса (проверка
    // каждый кадр в updateMusicMix) — на дребезге числа юнитов вокруг
    // порога трек дёргался туда-обратно в пределах секунды. Теперь порог
    // входа (50) не тронут, но выход проверяется ТОЛЬКО когда трек
    // доиграл целиком — если условие всё ещё держится (юнитов не упало
    // ниже нижнего порога), пульс просто переигрывается ещё раз, а не
    // прерывается; если упало — плавно уходим в обычную ротацию отсюда.
    const totalUnits = match.world.units.length;
    const pulseEligible = progress.musicTrack3 && progress.playlist.enabled.battle_pulse !== false;
    if (pulseEligible && totalUnits >= MUSIC_MIX.pulseThresholdDown) {
      MUSIC.play('battle_pulse', { force: true });
      return;
    }
    match.musicPulseOverride = false;
    const next = pickNextNonPulseTrack(match.currentBattleTrack);
    match.currentBattleTrack = next;
    MUSIC.play(next, { force: true });
    return;
  }
  // Утро 08.09.2026 (баг-репорт основателя — тишина через ~5 минут на
  // экране победы): БЕЗ force это play() молча ничего не делало всякий раз,
  // когда «следующий» трек совпадал с уже «текущим» trackId — ровно
  // ситуация плейлиста из одного трека (только бесплатный battle_theme) или
  // естественного возврата к тому же ID на новом круге ротации. current.audio
  // к этому моменту уже доиграл до конца и стоит на паузе — без force он так
  // и остаётся молча на паузе НАВСЕГДА, ни разу не перезапустившись. С
  // force play() всегда создаёт свежий Audio и стартует его с нуля,
  // независимо от того, совпадает ли trackId с предыдущим.
  const next = pickNextBattleTrack(endedId);
  if (match) match.currentBattleTrack = next;
  MUSIC.play(next, { force: true });
});

function renderPlaylistScreen() {
  ensurePlaylistHasOwned();
  const owned = ownedMusicTrackIds();
  DOM.playlistList.innerHTML = '';
  progress.playlist.order.filter(id => owned.includes(id)).forEach((id, i, arr) => {
    const meta = MUSIC_TRACKS[id];
    const row = document.createElement('div');
    row.className = 'playlist-row';
    const enabled = progress.playlist.enabled[id] !== false;
    row.innerHTML = `
      <button class="toggle-switch ${enabled ? 'on' : ''}" data-act="toggle" title="Включить/выключить"></button>
      <span class="playlist-name">${meta.name}</span>
      <button class="icon-btn small" data-act="up" ${i === 0 ? 'disabled' : ''}>▲</button>
      <button class="icon-btn small" data-act="down" ${i === arr.length - 1 ? 'disabled' : ''}>▼</button>
    `;
    row.querySelector('[data-act="toggle"]').addEventListener('click', () => {
      progress.playlist.enabled[id] = !enabled;
      saveProgress(progress);
      renderPlaylistScreen();
    });
    row.querySelector('[data-act="up"]').addEventListener('click', () => {
      const ord = progress.playlist.order;
      const idx = ord.indexOf(id);
      if (idx > 0) { [ord[idx - 1], ord[idx]] = [ord[idx], ord[idx - 1]]; saveProgress(progress); renderPlaylistScreen(); }
    });
    row.querySelector('[data-act="down"]').addEventListener('click', () => {
      const ord = progress.playlist.order;
      const idx = ord.indexOf(id);
      if (idx < ord.length - 1) { [ord[idx + 1], ord[idx]] = [ord[idx], ord[idx + 1]]; saveProgress(progress); renderPlaylistScreen(); }
    });
    DOM.playlistList.appendChild(row);
  });
  DOM.btnShuffle.textContent = progress.playlist.shuffle ? I18N.t('playlist.shuffleOn') : I18N.t('playlist.shuffleOff');
  DOM.btnShuffle.classList.toggle('active', progress.playlist.shuffle);
}
DOM.btnShuffle.addEventListener('click', () => {
  progress.playlist.shuffle = !progress.playlist.shuffle;
  saveProgress(progress);
  renderPlaylistScreen();
});
DOM.btnPlaylist.addEventListener('click', () => { SFX.click(); renderPlaylistScreen(); showScreen('playlist'); });
DOM.btnBackFromPlaylist.addEventListener('click', () => { SFX.click(); showScreen('menu'); });

// Динамика музыки боя (раунд 10): громкость от числа живых юнитов на поле
// + форс-кроссфейд на "Пульс сражения" при 50+ (с гистерезисом на
// возврат — см. MUSIC_MIX в data.js), но только если трек куплен И
// включён в плейлисте, иначе не переключаем вовсе (прямое требование
// основателя).
function updateMusicMix(m, dt) {
  const totalUnits = m.world.units.length;
  MUSIC.setUnitCount(totalUnits);
  // Ещё одна правка основателя (по факту жалобы на дёрганье): порог входа
  // (50) по-прежнему проверяется каждый кадр здесь, но порог выхода — уже
  // НЕ здесь. "Пусть при достижении этого сценария музыка проигрывается
  // до конца" — трек доигрывает целиком, гистерезис на выход проверяется
  // только когда он естественно закончится (см. MUSIC.onEnded), а не
  // мгновенно на кадре, где число юнитов упало ниже нижнего порога.
  const pulseEligible = progress.musicTrack3 && progress.playlist.enabled.battle_pulse !== false;
  if (!m.musicPulseOverride && pulseEligible && totalUnits >= MUSIC_MIX.pulseThresholdUp) {
    m.musicPulseOverride = true;
    MUSIC.play('battle_pulse', { force: true });
  }
}

// ---------------------------------------------------------------- mission setup
// r15 И11 (куратор №3: «м2 — стена, нужна помощь после 1–2 поражений»).
// После AI_HELP.afterLosses поражений ПОДРЯД на одной миссии следующая
// попытка мягче: доход и «поводок» закупки врага ×0.85 (ai.js), игроку
// +50 золота на старте, неброский тост «Враг ослаб после твоих атак».
// С 4-го поражения подряд — вторая ступень (×0.75, +80). Победа или другая
// миссия сбрасывают счётчик. Счётчик — в памяти сессии, не в progress:
// помощь нужна в серии повторов подряд; сейв и облачное слияние не
// трогаем, а после перезапуска игры игрок получает честную попытку.
// r15 И17 (куратор №6: «м5 — три поражения подряд, помощь после 2 поражений не
// спасла»): в м4–м5 нет поводка, и помощь резала только доход врага ×0.85.
// Теперь ступени сильнее и шире: бойцы врага слабее (statMult — HP и урон,
// entities.js spawnUnit), потолок живых врагов ниже (capDelta), с 3-го
// поражения — вторая ступень, с 4-го — третья.
// r15 И19 (куратор №7: «после помощи — победа с 95 % HP на 3★»): ступени
// мягче со 2-й ступени (было 0.8/0.8/+60/0.88/−2 → 0.72/0.72/+90/0.8/−3 →
// 0.65/0.65/+120/0.72/−4), зато помощь ослабляет и ответ на спам
// (counterMult — доля контров врага, ai.js counterK): м4–м6 сами стали
// проходимее с 1-й попытки (data.js I19_TUNE).
const AI_HELP = [
  { afterLosses: 2, incomeMult: 0.82, leashMult: 0.82, startGold: 50, statMult: 0.9, capDelta: 2, counterMult: 0.25 },
  { afterLosses: 3, incomeMult: 0.8, leashMult: 0.8, startGold: 80, statMult: 0.86, capDelta: 2, counterMult: 0.3 },
  { afterLosses: 4, incomeMult: 0.72, leashMult: 0.72, startGold: 110, statMult: 0.8, capDelta: 3, counterMult: 0 },
];
let lossStreak = { missionId: 0, n: 0 };
function aiHelpFor(mission) {
  if (lossStreak.missionId !== mission.id) return null;
  let h = null;
  for (const step of AI_HELP) if (lossStreak.n >= step.afterLosses) h = step;
  return h;
}
function noteMatchResult(missionId, win) {
  if (win) lossStreak = { missionId: 0, n: 0 };
  else lossStreak = { missionId, n: lossStreak.missionId === missionId ? lossStreak.n + 1 : 1 };
}
// Тост — тот же вид, что «эпоха сбрасывается» (класс .age-tip), после
// отсчёта и после него (если тот показан), ~4.5 с, не блокирует.
const HELP_TIP_SEC = 4.5;
let helpTipEl = null;
function tickHelpTip(dt) {
  const h = match.helpTip;
  if (!h) return;
  const ageTip = document.getElementById('ageTip');
  if (h.t === 0 && ageTip && !ageTip.classList.contains('hidden')) return; // ждём, пока погаснет тост эпохи
  if (!helpTipEl) {
    helpTipEl = document.createElement('div');
    helpTipEl.id = 'helpTip';
    helpTipEl.className = 'age-tip hidden';
    helpTipEl.innerHTML = '<svg class="ico"><use href="#i-hero"/></svg><span class="age-tip-text"></span>';
    document.getElementById('arenaWrap').appendChild(helpTipEl);
  }
  if (h.t === 0) {
    helpTipEl.querySelector('.age-tip-text').textContent = I18N.t(h.key || 'tip.enemyWeakened'); // r15 И17: и тост «Враг отвечает …»
    helpTipEl.classList.remove('out');
  }
  helpTipEl.classList.remove('hidden'); // после паузы — снова виден (frame() прячет его вне боя)
  h.t += dt;
  if (h.t > HELP_TIP_SEC - 0.4) helpTipEl.classList.add('out');
  if (h.t >= HELP_TIP_SEC) { helpTipEl.classList.add('hidden'); match.helpTip = null; }
}
function hideHelpTip() { if (helpTipEl) helpTipEl.classList.add('hidden'); }

function startMission(index, opts = {}) {
  const baseMission = MISSIONS[index];
  // DLC (раунд 5, редизайн — утренняя правка): два раздельных, обратимых
  // тумблера. «Усилить врага» — HP/урон вражеских юнитов (см. spawnUnit) +
  // HP вражеской базы; «Усилить себя» — доход (currentIncomeRate) + HP
  // своей базы. MISSIONS — общие данные, копия не даёт мутировать оригинал.
  const mission = { ...baseMission };
  if (progress.dlcHardModeActive) {
    mission.enemyCoreHp = Math.round(mission.enemyCoreHp * SHOP.dlcHardMode.enemyCoreHpMult);
  }
  if (progress.dlcPlayerBuffActive) {
    mission.playerCoreHp = Math.round(mission.playerCoreHp * SHOP.dlcPlayerBuff.playerCoreHpMult);
  }
  const age = AGES[mission.age];
  const world = {
    units: [], projectiles: [],
    playerCore: makeCore('player', ARENA.playerCoreX + ARENA.coreWidth, mission.playerCoreHp),
    enemyCore: makeCore('enemy', ARENA.enemyCoreX, mission.enemyCoreHp),
    hero: makeHero('player'),
    towers: [],
    enemyTowers: [], // бафы вражеской базы по HP% — башни, зеркальные к покупкам игрока (см. ПЛАН.md, раунд 5)
    trap: null,
    // Раунд 15 (П6): эпоха каждой стороны внутри боя. ageStep — ступень от
    // стартовой эпохи миссии (множители AGE_UP), teamAge — id эпохи для
    // силуэтов; xp — опыт для следующей смены (entities.js, addTeamXp).
    ageStep: { player: 0, enemy: 0 },
    teamAge: { player: mission.age, enemy: mission.age },
    xp: { player: 0, enemy: 0 },
    volleyShells: [], volleyZone: null,
    playerCoreDmgMult: mission.enemyCoreDmgMult || 1, // r15 И11: урон врагов по своей крепости (глава 1)
    enemyRecruit: mission.enemyRecruit || null, // r15 И13: «новобранцы» врага (entities.js spawnUnit)
    enemySiege: mission.enemySiege === true ? 1 : (mission.enemySiege || 0), // r15 И13: +px дальности вражеских стрелков по крепости (entities.js findTarget)
    // r15 И15: потолок живых врагов, «стена» крепости игрока (урон/с), метки
    // удара по ней для сигнала HUD (fortHitAt — с боя, fortHitDps — урон/с за 3 с).
    enemyAliveCap: mission.enemyAliveCap || 0,
    fortGuard: mission.fortGuardPerSec ? makeFortGuard(mission.playerCoreHp, mission.fortGuardPerSec) : null,
    fortHitAt: -Infinity, fortHitDps: 0, fortAbsorbed: 0, clock: 0,
    enemyCoreDmgTakenMult: 1, enemyTowerDmgMult: 1, // r15 И15: овертайм (update)
    heroRangedTaken: mission.heroRangedTaken || 0, // r15 И15: стрелы по герою в гл. 2 (data.js HERO_EARLY)
  };
  // Покупки из магазина — постоянные разблокировки, действуют в каждой
  // миссии (см. ПЛАН.md, раунд 3). HP построек — только для юнита-«раба»
  // (раунд 5), который умеет их атаковать; на баланс башен/капкана не влияет.
  if (progress.towerA) world.towers.push({ x: 150, dmg: SHOP.towerA.dmg, range: SHOP.towerA.range, atkInterval: SHOP.towerA.atkInterval, timer: 0, hp: STRUCTURE_HP.tower, maxHp: STRUCTURE_HP.tower, shopKey: 'towerA' });
  if (progress.towerB) world.towers.push({ x: 195, dmg: SHOP.towerB.dmg, range: SHOP.towerB.range, atkInterval: SHOP.towerB.atkInterval, timer: 0.4, hp: STRUCTURE_HP.tower, maxHp: STRUCTURE_HP.tower, shopKey: 'towerB' });
  // Капканы — теперь массив (раунд 8: второй капкан — покупка магазина,
  // см. SHOP.trap2), не одиночный world.trap.
  world.traps = [];
  if (progress.trap) world.traps.push({ x: 230, dmg: SHOP.trap.dmg, range: SHOP.trap.range, cooldown: 0, cooldownMax: SHOP.trap.cooldown, hp: STRUCTURE_HP.trap, maxHp: STRUCTURE_HP.trap, shopKey: 'trap' });
  if (progress.trap2) world.traps.push({ x: 270, dmg: SHOP.trap2.dmg, range: SHOP.trap2.range, cooldown: 0, cooldownMax: SHOP.trap2.cooldown, hp: STRUCTURE_HP.trap, maxHp: STRUCTURE_HP.trap, shopKey: 'trap2' });
  if (progress.towerC) world.towers.push({ x: 240, dmg: SHOP.towerC.dmg, range: SHOP.towerC.range, atkInterval: SHOP.towerC.atkInterval, timer: 0.6, hp: STRUCTURE_HP.tower, maxHp: STRUCTURE_HP.tower, shopKey: 'towerC' });
  world.spawnCount = { player: 0, enemy: 0 };
  // r15 И15: HP героя в главах 1–2 выше (mission.heroHpMult, data.js HERO_EARLY)
  world.hero.maxHp = Math.round(HERO.hp * (mission.heroHpMult || 1)) + progress.gearShield * SHOP.gearShield.hpPerTier;
  world.hero.hp = world.hero.maxHp;
  world.hero.dmgBonus = progress.gearSword * SHOP.gearSword.dmgPerTier;
  world.hero.dmgReduction = Math.min(0.5, progress.gearArmor * SHOP.gearArmor.reductionPerTier);
  world.hero.meleeRangeMult = 1 + progress.gearLongBlade * SHOP.gearLongBlade.rangeMultPerTier;
  world.hero.cryUnlocked = !!progress.heroAbilityCry; // раунд 9: покупка магазина
  const unlockedUnits = UNIT_ORDER.filter(id => UNIT_TYPES[id].unlockMission <= mission.id);
  const aiHelp = aiHelpFor(mission); // r15 И11: помощь после поражений подряд
  if (aiHelp) { // r15 И17: слабее бойцы врага и ниже потолок его армии (mission — копия)
    world.enemyStatMult = aiHelp.statMult || 1;
    if (aiHelp.capDelta && world.enemyAliveCap) world.enemyAliveCap -= aiHelp.capDelta;
    if (aiHelp.capDelta && mission.enemyMaxAlive) mission.enemyMaxAlive = Math.max(4, mission.enemyMaxAlive - aiHelp.capDelta);
  }
  match = {
    missionIndex: index, mission, age,
    world,
    gold: 24 + (progress.startGoldBoost ? SHOP.startGoldBoost.amount : 0) + (aiHelp ? aiHelp.startGold : 0), // раунд 8: покупка магазина; И11: помощь
    incomeLevel: 0,
    incomeAcc: 0,
    unlockedUnits,
    ai: Object.assign(makeEnemyAI(), { soft: makeSoftStart(mission, world), help: aiHelp }), // И8: мягкий старт м1; И11: помощь
    helpTip: aiHelp ? { t: 0 } : null, // И11: тост «Враг ослаб…»
    shake: { mag: 0, x: 0, y: 0 },
    particles: [],
    clouds: Array.from({ length: 5 }, () => ({
      x: Math.random() * ARENA.width, y: 18 + Math.random() * 55,
      scale: 0.6 + Math.random() * 0.9, speed: 5 + Math.random() * 9,
    })),
    resolved: false,
    elapsed: 0,
    resultElapsed: 0,
    farmPulse: 0,
    heroBackpackCoins: HERO.baseKillCoin, // база рюкзака — предмет из магазина повысит (см. ПЛАН.md)
    shopKills: 0, // валюта «очко» за эту миссию, начисление убывает со временем (раунд 5)
    buffsTriggered: new Set(), // бафы вражеской базы по HP% — по одному разу за миссию (раунд 5)
    buffThresholds: jitterBuffThresholds(), // раунд 8: разброс ±10% считается один раз на миссию
    countdown: opts.intro ? INTRO_COUNTDOWN_SEC : 0, // раунд 15 (И4): 3-2-1 за 1.5 с
    currentBattleTrack: null, musicPulseOverride: false, // раунд 10: плейлист + форс-переключение на "Пульс"
    // Раунд 15 (П6): эпоха врага (для силуэтов/крепости), кулдаун «Залпа»,
    // крупная надпись смены эпохи и вспышка кадра (drawAgeBanner).
    enemyAge: age,
    volleyCd: VOLLEY.firstReadySec,
    ageBanner: null,
    ageFlash: 0,
  };
  // Раунд 14: все эффекты — через vfx.js (типизированные частицы, кольца,
  // щепки, всплывающие «+N»), а не одинаковые квадратики на любой повод.
  world.onCoreHit = (core) => {
    shakeScreen(match, 3);
    VFX.coreHit(match, core.x + (core.team === 'player' ? CORE_KEEP_FAR : -CORE_KEEP_FAR));
  };
  // r15 И15: удар сверх лимита «стены» (entities.js fortGuardAbsorb) — искра
  // отбитого удара на фасаде своей крепости, не чаще раза в 0.15 с.
  world.onFortAbsorb = () => {
    if (world.clock - (match.fortSparkAt || -1) < 0.15) return;
    match.fortSparkAt = world.clock;
    VFX.heroHit(match, world.playerCore.x + CORE_KEEP_FAR + 6, (-40 - Math.random() * 40) * VIEW.fortK, 1, false);
  };
  // r15 И15: «налётчик» м1 вылез из подкопа перед крепостью — земля и пыль.
  world.onRaidEmerge = (x) => {
    VFX.burst(match, 'dust', x, -4, 14, { speed: 140, spread: Math.PI * 0.9, dir: -Math.PI / 2, life: 0.9, size: 7, color: ART.dust, gravity: 30, jitter: 16 });
    VFX.burst(match, 'chip', x, -8, 10, { speed: 200, spread: Math.PI * 0.8, dir: -Math.PI / 2, life: 0.8, size: 3.4, color: ART.woodChip, gravity: 420, jitter: 10 });
    shakeScreen(match, 3);
  };
  world.onCoreDestroyed = (core) => { if (!match.resolved) endMatch(core.team === 'player' ? 'lose' : 'win'); };
  world.onUnitDeath = (u) => VFX.unitDeath(match, u.x);
  world.onImpact = (x) => VFX.impact(match, x);
  // Искры в точке контакта ближнего удара (у дальнего — уже onImpact).
  // И6: роль последнего удара — только для вида смерти (сильный удар —
  // «отлёт»), тяжёлый удар сверху поднимает пыль у ног цели.
  world.onHit = (ref, role) => {
    ref.lastHitRole = role;
    if (role !== 'ranged') VFX.meleeHit(match, ref.x, -34, ref.team !== 'player');
    if (role === 'heavy') VFX.burst(match, 'dust', ref.x, -2, 5, { speed: 90, spread: Math.PI * 0.8, dir: -Math.PI / 2, life: 0.5, size: 4, color: ART.dust, gravity: 40, jitter: 10 });
  };
  world.onHeroDown = () => {
    match.heroFalls = (match.heroFalls || 0) + 1; // r15 И14: условие третьей звезды
    shakeScreen(match, 6);
    SFX.heroDown();
    // Стадия 2 (баг-репорт): статус героя было легко пропустить, если
    // взгляд игрока на другом конце арены — разовая вспышка на весь экран
    // в момент смерти, отдельно от постоянной пульсации коробки выкупа.
    DOM.heroDownFlash.classList.remove('flash');
    void DOM.heroDownFlash.offsetWidth; // рестарт CSS-анимации
    DOM.heroDownFlash.classList.add('flash');
  };
  world.onHeroSpecial = (x) => { VFX.heroSpecial(match, x, HERO.specialRange); shakeScreen(match, 5); };
  world.onHeroKill = (x) => { match.gold += match.heroBackpackCoins; VFX.heroKill(match, x, match.heroBackpackCoins); };
  world.onPickaxe = (x) => { match.gold += HERO.pickaxeGold; VFX.pickaxe(match, x, HERO.pickaxeGold); };
  world.onGlyph = (x) => VFX.burst(match, 'ember', x, -50, 18, { speed: 50, life: 0.9, size: 2.2, colors: ['#8fd6ff', '#d6f0ff'], gravity: 0, jitter: 40 });
  world.onCry = (x) => { VFX.cry(match, x); shakeScreen(match, 4); };
  // Ночная правка (находки ревьюеров): и штраф за золото, и элитные волны/
  // бафы базы раньше были невидимы игроку и не объяснялись при поражении.
  // Запоминаем последнее "опасное" событие с таймстампом — если поражение
  // случилось вскоре после него, называем его причиной (см. endMatch).
  world.onDanger = (tag) => { match.lastDangerTag = tag; match.lastDangerTime = match.elapsed; };
  world.onGoldHoard = (count) => {
    match.lastDangerTag = 'goldHoard';
    match.lastDangerTime = match.elapsed;
    match.goldHoardFlash = 1.4; // видимый сигнал у счётчика золота в HUD
  };
  // Раб с цепью ломает постройку насовсем (раунд 7, баг-репорт): постройка
  // не восстанавливается сама в следующей миссии — сбрасываем постоянную
  // разблокировку из магазина, чтобы её можно было купить заново.
  world.onStructureDestroyed = (kind, ref) => {
    if ((kind === 'tower' || kind === 'trap') && ref.shopKey) progress[ref.shopKey] = false;
    saveProgress(progress);
    VFX.structureDown(match, ref.x);
  };
  // Раунд 15 (П6): враг сменил эпоху сам (ai.js, updateEnemyAge) — своя
  // вспышка у его крепости и короткая надпись; смена игрока — onPlayerAgeUp.
  world.onAgeUp = (team, ageId) => { if (team === 'enemy') onEnemyAgeUp(ageId); };
  // r15 И17: враг ответил на спам игрока контром (ai.js trackPlayerMix) —
  // тост «Враг отвечает копьями! Смешай армию» (тот же вид, что помощь после поражений)
  world.onCounter = (pick) => {
    if (match.helpTip && match.helpTip.t < HELP_TIP_SEC * 0.5) return; // не перебивать свежий тост
    if (match.helpTip) hideHelpTip();
    match.helpTip = { t: 0, key: 'tip.counter_' + pick };
  };
  // r15 И13: за 3 с до «натиска» (ai.js, wave.assault) — надпись в духе
  // баннера эпохи врага: игрок успевает купить бойцов / приготовить Залп.
  world.onAssault = () => {
    match.assaultWarns = (match.assaultWarns || 0) + 1;
    if (match.ageBanner && match.ageBanner.own && match.ageBanner.t < match.ageBanner.life * 0.6) return; // своя «Новая эра» важнее
    // r15 И21 (куратор №8: «„Fort under attack!“ и крупное „The enemy is
    // storming in!“ одновременно»): на экране одно предупреждение, приоритет
    // у натиска. Крупная надпись — не дольше ASSAULT_BANNER.lifeSec; тост
    // «Крепость атакуют!» снят и подавлен, пока она видна, и quietSec после.
    match.ageBanner = { text: I18N.t('hud.enemyAssault'), t: 0, life: ASSAULT_BANNER.lifeSec, own: false, assault: true };
    match.fortAlertQuietUntil = match.elapsed + ASSAULT_BANNER.lifeSec + ASSAULT_BANNER.quietSec;
    hideFortAlert();
  };
  // И6: залп — вспышка/пыль/огонь у каждого снаряда, общая тряска, звук
  // (частота звуков ограничена gap в SFX), убитые им улетают («отлёт»).
  world.onVolleyImpact = (x, kind) => {
    VFX.volleyImpact(match, x, kind);
    shakeScreen(match, kind === 'ball' ? 4.5 : 3);
    if (kind === 'ball') SFX.coreHit(); else if (kind === 'arrow') SFX.hitRanged(); else SFX.hitMelee('heavy');
    for (const u of match.world.units) {
      if (u.state === 'dead' && u.corpseT0 === undefined && Math.abs(u.x - x) <= VOLLEY.radius) u.lastHitRole = 'volley';
    }
  };

  buildToolbar();
  updateHudStatic();
  showScreen('match');
  match.currentBattleTrack = pickNextBattleTrack(null);
  MUSIC.play(match.currentBattleTrack, { force: true });
  Analytics.track('mission_start', { id: mission.id }); // воронка (js/analytics.js)
  if (opts.intro) {
    DOM.countdownOverlay.classList.remove('hidden');
    DOM.countdownNum.textContent = '3';
  }
  beginMatchFx(); // раунд 15 (И4): сброс финала/хит-стопа, туториал миссии 1
}

// Раунд 15 (И4): подсказка новичку из двух строк (9 с, замедление игры,
// увеличенный тулбар) заменена пошаговым туториалом со стрелками —
// js/tutorial.js; он сам ждёт конца отсчёта и сам гаснет по действиям.
function beginMatchFx() {
  hitStopT = 0;
  DOM.hud.classList.remove('r15-finale');
  Tutorial.begin(match);
}

// Утренняя правка основателя: кнопка "?" переоткрывшая на ночной правке
// баннер подсказки мисcии 1 (см. toggleHelpHint выше, до этой правки) была
// бесполезна на поздних миссиях — заменена полноценным экраном справки
// (см. renderHelp() ниже): ставит игру на паузу, показывает хоткеи, ТОЛЬКО
// доступных в текущем бою юнитов (match.unlockedUnits) и способности героя,
// всё с живой анимацией (переиспользует drawStickman/rig.js, не статичные
// картинки).
let helpPrevScreen = 'paused';
DOM.helpBtn.addEventListener('click', () => {
  if (screen !== 'match' && screen !== 'paused') return;
  helpPrevScreen = screen;
  renderHelp();
  showScreen('help');
  const card = DOM.screenHelp.querySelector('.panel-card');
  if (card) card.scrollTop = 0;
});
// r15 И12 (куратор №3: «Esc в справке ведёт в паузу, а не в бой»): справка
// закрывается туда, откуда открыта — из боя (кнопка «?» в HUD) сразу в бой,
// из паузы — обратно в паузу. Так же работают крестик в шапке, «Назад» внизу
// и Esc/P.
function closeHelp() {
  stopHelpAnim();
  showScreen(helpPrevScreen === 'match' ? 'match' : 'paused');
}
DOM.btnBackFromHelp.addEventListener('click', () => { SFX.click(); closeHelp(); });
document.getElementById('btnCloseHelp').addEventListener('click', () => { SFX.click(); closeHelp(); });

function currentIncomeRate() {
  const dlcMult = progress.dlcPlayerBuffActive ? SHOP.dlcPlayerBuff.playerIncomeMult : 1;
  const missionMult = (match.mission && match.mission.playerIncomeMult) || 1; // r15 И11: м1 — меньше «лишнего» золота
  // r15 И15 (куратор №5: «золото до 4600»): в главах 1–2 полная казна —
  // выше ECONOMY.treasury.softCap золота доход фермы ×overMult (плашка
  // «Тратьте золото!» горит с 280). Тратящий игрок порога не касается.
  const T = ECONOMY.treasury;
  const full = T && match.mission && match.mission.chapterId <= T.maxChapter && match.gold > T.softCap ? T.overMult : 1;
  return ECONOMY.baseIncome * Math.pow(1 + ECONOMY.upgrade.incomePctGain, match.incomeLevel) * dlcMult * missionMult * full;
}
function currentUpgradeCost() {
  return Math.round(ECONOMY.upgrade.baseCost * Math.pow(ECONOMY.upgrade.growth, match.incomeLevel));
}
// r15 И15 (куратор №5: «золото до 4600 после апгрейдов дохода»): апгрейдов
// дохода за миссию в главах 1–2 не больше 2 (incomeUpgradeCap, data.js) — дальше кнопка «MAX».
function incomeUpgradeMaxed() {
  return match.incomeLevel >= incomeUpgradeCap(match.mission);
}

// ---------------------------------------------------------------- toolbar (built once per mission)
// Иконки юнитов — те же исходники, что и в игровом мире: мини-рендер того
// же рига стикмена, а не отдельно нарисованные значки (см. 03_АССЕТЫ.md,
// «правило консистентности»).
function drawUnitIcon(canvas, t, age) {
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  // Раунд 14: риг стал в RIG_K раз крупнее — иконка делит масштаб обратно,
  // чтобы влезать в канвас 40×44 (см. buildToolbar). И7: канвас теперь
  // вдвое плотнее (80×88, чёткость на крупной иконке) — масштаб от высоты.
  const u = canvas.height / 44;
  drawStickman(c, {
    x: canvas.width / 2, y: canvas.height - 3 * u, scale: 0.85 * u / RIG_K,
    color: ART.player.fill, outline: ART.player.outline, facing: 1, shadow: false,
    walkPhase: Math.PI * 0.4, moving: true, weapon: age.weapon[t.role], roleAccent: ROLE_ACCENT[t.role],
  });
}
const ROLE_LABEL = {
  get melee() { return I18N.t('role.melee'); },
  get spear() { return I18N.t('role.spear'); },
  get ranged() { return I18N.t('role.ranged'); },
  get heavy() { return I18N.t('role.heavy'); },
};

// ---------------------------------------------------------------- справка «?» (утро, запрос основателя)
// «В углу игры добавил бы вопросительный знак... что делают кнопки, какие
// юниты за что отвечают (но не сразу всех, а доступных в текущем бою),
// что за способности у героя, и анимированными их делать. В этот момент
// игра на паузу должна вставать.» Пауза — уже побочный эффект showScreen()
// (game-loop тикает только при screen==='match'), анимация — тот же риг,
// что и в бою (см. 03_АССЕТЫ.md, «правило консистентности»), не отдельные
// картинки: общий rAF-цикл двигает фазу ходьбы/атаки на всех канвасах
// справки разом, пока экран открыт.
let helpAnimId = null;
let helpAnimPhase = 0;
function stopHelpAnim() {
  if (helpAnimId !== null) cancelAnimationFrame(helpAnimId);
  helpAnimId = null;
}
function drawHelpUnitIcon(canvas, t, age) {
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  drawStickman(c, {
    x: canvas.width / 2, y: canvas.height - 4, scale: 1.1 / RIG_K,
    color: ART.player.fill, outline: ART.player.outline, facing: 1, shadow: false, time: helpAnimPhase / 4,
    walkPhase: helpAnimPhase, moving: true, weapon: age.weapon[t.role], roleAccent: ROLE_ACCENT[t.role],
  });
}
// Утренняя правка (основатель, обратная связь после плейтеста): раздел
// "Юниты в этом бою" он назвал эталоном ("выполнен великолепно"), а
// "Управление"/"Способности героя" — сделанными "на авось" (текстовый
// список хоткеев без анимации). По его же слову переделал в тот же формат
// — карточка на КАЖДУЮ кнопку с живой анимацией, а не абзац текста.
// kind переключает, что именно демонстрирует риг/канвас; общая фаза
// helpAnimPhase двигает все карточки синхронно, пока экран открыт.
function drawHeroActionIcon(canvas, kind) {
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2, groundY = canvas.height - 4;
  const cyclePos = (helpAnimPhase % (Math.PI * 2)) / (Math.PI * 2);
  const heroBase = {
    x: cx, y: groundY, scale: 1.1 / RIG_K, color: ART.hero.fill, outline: ART.hero.outline,
    facing: 1, hero: true, weapon: match.age.weapon.melee, attackProfile: 'hero', shadow: false, time: helpAnimPhase / 4,
  };
  if (kind === 'walk') {
    drawStickman(c, { ...heroBase, walkPhase: helpAnimPhase, moving: true });
  } else if (kind === 'attack') {
    drawStickman(c, { ...heroBase, walkPhase: helpAnimPhase, moving: true, attackPhase: cyclePos });
  } else if (kind === 'special') {
    drawStickman(c, { ...heroBase, walkPhase: helpAnimPhase, moving: false });
    c.save();
    c.globalAlpha = 1 - cyclePos;
    c.strokeStyle = ART.hero.goldGlow; c.lineWidth = 6;
    c.beginPath(); c.ellipse(cx, groundY - 3, cyclePos * (canvas.width * 0.45), cyclePos * (canvas.width * 0.45) * 0.42, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = ART.hero.gold; c.lineWidth = 2;
    c.beginPath(); c.ellipse(cx, groundY - 3, cyclePos * (canvas.width * 0.45), cyclePos * (canvas.width * 0.45) * 0.42, 0, 0, Math.PI * 2); c.stroke();
    c.restore();
  } else if (kind === 'pickaxe') {
    drawStickman(c, { ...heroBase, walkPhase: 0, moving: false, digPhase: cyclePos });
  } else if (kind === 'cry') {
    const pulse = 0.5 + 0.5 * Math.sin(helpAnimPhase * 2);
    drawStickman(c, { ...heroBase, walkPhase: helpAnimPhase, moving: true, buffed: true });
    c.save();
    c.globalAlpha = 0.5 * pulse;
    c.strokeStyle = ART.cryAura; c.lineWidth = 2;
    c.beginPath(); c.ellipse(cx, groundY - 3, canvas.width * 0.42, canvas.width * 0.42 * 0.42, 0, 0, Math.PI * 2); c.stroke();
    c.restore();
  } else if (kind === 'revive') {
    const pulse = 0.5 + 0.5 * Math.sin(helpAnimPhase * 2.2);
    c.save(); c.globalAlpha = 0.35 + 0.4 * pulse;
    drawStickman(c, { ...heroBase, walkPhase: 0, moving: false });
    c.restore();
    c.save();
    c.fillStyle = `rgba(255,232,115,${0.35 + 0.4 * pulse})`;
    c.beginPath(); c.arc(cx, groundY - 18, 4 + pulse * 3, 0, Math.PI * 2); c.fill();
    c.restore();
  } else if (kind === 'joystick') {
    // Основатель: "сейчас анимация крутится как радар — сделать просто
    // свайп влево-вправо". Была круговая (радар), теперь стик ходит по
    // горизонтали туда-сюда, как игрок реально двигает его пальцем.
    const r = canvas.width * 0.28;
    const dx = Math.sin(helpAnimPhase * 1.3) * r * 0.55;
    c.save();
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, groundY - 20, r, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,232,115,.8)';
    c.beginPath(); c.arc(cx + dx, groundY - 20, r * 0.45, 0, Math.PI * 2); c.fill();
    c.restore();
  } else if (kind === 'coin') {
    const bounce = Math.abs(Math.sin(helpAnimPhase * 1.4)) * 10;
    c.save();
    c.fillStyle = '#f2d477'; c.strokeStyle = '#5a3d0f'; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, groundY - 18 - bounce, 9, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#5a3d0f'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('$', cx, groundY - 18 - bounce + 1);
    c.restore();
  }
}
// Основатель: "Купить юнита" в справке рисовалась абстрактной монеткой —
// показывать нужно "так же, как в бою — нижней планкой", т.е. похоже на
// реальный тулбар покупки внизу экрана, а не отвлечённым значком.
// Мини-копия панели: несколько юнитов рядом, с ценой и цифрой клавиши —
// тот же визуальный язык, что и настоящие кнопки тулбара.
function drawBuyUnitBar(canvas) {
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  // И7: все юниты боя (раньше — первые 3 при подписи «Клавиши 1–4»).
  const ids = match.unlockedUnits.slice(0, 4);
  const slotW = canvas.width / ids.length;
  ids.forEach((id, i) => {
    const t = UNIT_TYPES[id];
    const x = slotW * i + slotW / 2;
    c.save();
    c.fillStyle = 'rgba(0,0,0,.22)'; c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1;
    if (c.roundRect) { c.beginPath(); c.roundRect(x - slotW / 2 + 2, 2, slotW - 4, canvas.height - 4, 6); c.fill(); c.stroke(); }
    c.restore();
    drawStickman(c, {
      x, y: canvas.height - 14, scale: 0.62 / RIG_K, color: ART.player.fill, outline: ART.player.outline, shadow: false,
      facing: 1, walkPhase: helpAnimPhase, moving: true, weapon: match.age.weapon[t.role], roleAccent: ROLE_ACCENT[t.role],
    });
    c.fillStyle = '#f2d477'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center';
    c.fillText(String(playerUnitCost(ids[i])), x, canvas.height - 2);
    c.fillStyle = '#eef0ff'; c.font = 'bold 11px sans-serif';
    c.fillText(t.hotkey, x, 12);
  });
}
function helpRow(canvasBuilder, title, desc, canvasWidth = 48) {
  const row = document.createElement('div');
  row.className = 'shop-item help-item';
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth; canvas.height = 52;
  canvas.className = 'help-icon-canvas';
  if (canvasWidth !== 48) canvas.style.width = canvasWidth + 'px';
  const text = document.createElement('div');
  text.className = 'help-item-text';
  text.innerHTML = `<div class="si-header"><b class="si-title">${title}</b></div><div class="si-desc">${desc}</div>`;
  row.appendChild(canvas);
  row.appendChild(text);
  helpCanvasJobs.push(() => canvasBuilder(canvas));
  return row;
}
let helpCanvasJobs = [];
function renderHelp() {
  stopHelpAnim();
  helpCanvasJobs = [];
  DOM.helpList.innerHTML = '';
  const add = (el) => DOM.helpList.appendChild(el);

  // Устройство определяет и иконку (джойстик/кнопки на экране — то, что
  // игрок реально видит и нажимает), и подпись (клавиша — только на ПК,
  // где она физически существует), а не только текст, как раньше.
  const touchDevice = window.matchMedia('(pointer: coarse)').matches;

  add(shopSectionTitle(I18N.t('help.sectionControls'), 'i-gear')); // r15 И12: SVG вместо «⌨️»
  add(helpRow(
    (canvas) => drawHeroActionIcon(canvas, touchDevice ? 'joystick' : 'walk'),
    I18N.t('help.moveHero'), touchDevice ? I18N.t('help.moveJoystick') : I18N.t('help.moveKeys')
  ));
  // r15 И21 (куратор №8: «в справке на ПК среди первых пунктов нет атаки и
  // способностей»): сразу за движением — «Удар — Пробел» и строка клавиш
  // способностей (подписи — те же, что на кнопках тулбара).
  add(helpRow((canvas) => drawHeroActionIcon(canvas, 'attack'), I18N.t('help.abilityAttack'),
    touchDevice ? I18N.t('help.abilityAttackTouch', { icon: inlineIcon('i-sword') }) : I18N.t('help.abilityAttackKey')));
  const abilityKeys = [['V', 'hud.volleyLabel']];
  if (!playerAgeMaxed()) abilityKeys.push(['T', 'hud.ageLabel']);
  abilityKeys.push(['R', 'hud.specialLabel'], ['F', 'hud.pickaxeLabel']);
  if (progress.heroAbilityCry) abilityKeys.push(['E', 'hud.cryLabel']);
  add(helpRow((canvas) => drawHelpGlyphIcon(canvas, '#i-volley'), I18N.t('help.abilitiesTitle'),
    touchDevice ? I18N.t('help.abilitiesTouch') : abilityKeys.map(([k, lbl]) => `<b>${k}</b> — ${I18N.t(lbl)}`).join(' · ')));
  // И7: диапазон клавиш — по реально доступным в бою юнитам («1–3», а не
  // всегда «1–4»).
  const unitKeys = match.unlockedUnits.map(id => UNIT_TYPES[id].hotkey);
  const keyRange = unitKeys.length > 1 ? unitKeys[0] + '–' + unitKeys[unitKeys.length - 1] : String(unitKeys[0] || 1);
  add(helpRow(
    (canvas) => drawBuyUnitBar(canvas),
    I18N.t('help.buyUnit'), touchDevice ? I18N.t('help.buyUnitTouch') : I18N.t('help.buyUnitKeys', { range: keyRange }),
    30 * Math.min(4, match.unlockedUnits.length)
  ));
  add(helpRow((canvas) => drawHeroActionIcon(canvas, 'coin'), I18N.t('help.incomeUpgrade'), touchDevice ? I18N.t('help.incomeUpgradeTouch', { icon: inlineIcon('i-coins') }) : I18N.t('help.incomeUpgradeKey')));
  // Основатель: убрать кнопку "Выкупить" из карточки, дать пояснение
  // дословно по смыслу — герой воскресает сам через минуту, досрочный
  // выкуп за золото это альтернатива, а не единственный путь.
  add(helpRow(
    (canvas) => drawHeroActionIcon(canvas, 'revive'),
    I18N.t('help.heroDeath'),
    I18N.t('help.heroDeathDesc2', { // раунд 15 (И2): респаун 20 с — число из HERO.respawnDelay
      sec: HERO.respawnDelay,
      cost: currentBuybackCost(),
      extra: touchDevice ? I18N.t('help.heroDeathTouchExtra') : I18N.t('help.heroDeathKeyExtra'),
    })
  ));

  add(shopSectionTitle(I18N.t('help.sectionUnits'), 'i-sword'));
  match.unlockedUnits.forEach(id => {
    const t = UNIT_TYPES[id];
    add(helpRow(
      (canvas) => drawHelpUnitIcon(canvas, t, match.age),
      I18N.t('help.unitLine', { name: t.name, cost: playerUnitCost(id) }),
      I18N.t('help.unitStats', { hp: t.hp, dmg: t.dmg, role: ROLE_LABEL[t.role] })
    ));
  });
  // r15 И17: контры ролей (data.js UNIT_COUNTERS) и ответ врага на спам
  add(helpRow((canvas) => drawHelpUnitIcon(canvas, UNIT_TYPES.spear, match.age), I18N.t('help.countersTitle'), I18N.t('help.counters')));

  add(shopSectionTitle(I18N.t('help.sectionAbilities'), 'i-burst'));
  const abilities = [
    { kind: 'attack', title: I18N.t('help.abilityAttack'), how: touchDevice ? I18N.t('help.abilityAttackTouch', { icon: inlineIcon('i-sword') }) : I18N.t('help.abilityAttackKey'), desc: I18N.t('help.abilityAttackDesc') },
    { kind: 'special', title: I18N.t('help.abilitySpecial'), how: touchDevice ? I18N.t('help.abilitySpecialTouch', { icon: inlineIcon('i-spin') }) : I18N.t('help.abilitySpecialKey'), desc: I18N.t('help.abilitySpecialDesc', { cd: HERO.specialCooldown }) },
    { kind: 'pickaxe', title: I18N.t('help.abilityPickaxe'), how: touchDevice ? I18N.t('help.abilityPickaxeTouch', { icon: inlineIcon('i-pick') }) : I18N.t('help.abilityPickaxeKey'), desc: I18N.t('help.abilityPickaxeDesc', { gold: HERO.pickaxeGold, cd: HERO.pickaxeCooldown }) },
  ];
  if (progress.heroAbilityCry) {
    abilities.push({
      kind: 'cry', title: I18N.t('help.abilityCry'), how: touchDevice ? I18N.t('help.abilityCryTouch', { icon: inlineIcon('i-horn') }) : I18N.t('help.abilityCryKey'),
      desc: I18N.t('help.abilityCryDesc', {
        dmg: Math.round((SHOP.heroAbilityCry.dmgMult - 1) * 100),
        spd: Math.round((SHOP.heroAbilityCry.speedMult - 1) * 100),
        cd: SHOP.heroAbilityCry.cooldown,
      }),
    });
  }
  // Раунд 15 (И2): «Залп» и «Новая эра» — иконка-глиф той же кнопки тулбара.
  abilities.push({
    glyph: '#i-volley', title: I18N.t('help.abilityVolley'), how: touchDevice ? I18N.t('help.abilityVolleyTouch') : I18N.t('help.abilityVolleyKey'),
    desc: I18N.t('help.abilityVolleyDesc', { cd: VOLLEY.cooldown }),
  });
  if (!playerAgeMaxed()) {
    abilities.push({
      glyph: '#i-age', title: I18N.t('help.abilityAge'), how: touchDevice ? I18N.t('help.abilityAgeTouch') : I18N.t('help.abilityAgeKey'),
      desc: I18N.t('help.abilityAgeDesc', { pct: Math.round((AGE_UP.statMult - 1) * 100) }),
    });
  }
  abilities.forEach(a => add(helpRow((canvas) => (a.glyph ? drawHelpGlyphIcon(canvas, a.glyph) : drawHeroActionIcon(canvas, a.kind)), I18N.t('help.abilityLine', { title: a.title, how: a.how }), a.desc)));

  (function loop() {
    helpAnimPhase += 0.09;
    for (const job of helpCanvasJobs) job();
    helpAnimId = requestAnimationFrame(loop);
  })();
}

// Утренняя правка основателя (обратная связь с телефона): вся система
// тултипов/долгого нажатия на боевых кнопках УБРАНА целиком, а не только
// починена. Причина не только "один тап = действие" (это чинили раньше и
// это было полдела) — сам факт слушателя mouseenter/touchstart на кнопке
// заставлял мобильный браузер синтезировать событие «наведения» на первый
// тап (классический баг тач-эмуляции hover), и клик срабатывал только со
// второго. Раз пояснения по кнопкам теперь живут в справке «?»
// (см. renderHelp) — на самих боевых кнопках описаниям/тултипам/долгому
// нажатию просто нечего делать: один слушатель click, без побочных.
function buildToolbar() {
  DOM.toolbar.innerHTML = '';
  match.unlockedUnits.forEach(id => {
    const t = UNIT_TYPES[id];
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.dataset.unit = id;
    // Раунд 15: цена — в текущей эпохе игрока (playerUnitCost); хоткеи 1..4
    // идут по порядку показа (UNIT_ORDER и hotkey в data.js совпадают).
    btn.innerHTML = `<canvas class="tool-icon-canvas" width="80" height="88"></canvas><div class="tool-cost">${playerUnitCost(id)}</div><div class="tool-key">${t.hotkey}</div>`;
    btn.addEventListener('click', () => { tryBuyUnit(id); btn.blur(); });
    DOM.toolbar.appendChild(btn);
    drawUnitIcon(btn.querySelector('canvas'), t, match.age);
  });
  const upBtn = document.createElement('button');
  upBtn.className = 'tool-btn';
  upBtn.id = 'upgradeBtn';
  upBtn.innerHTML = `<div class="tool-icon">💲</div><div class="tool-cost" id="upgradeCost"></div><div class="tool-key">Q</div>`;
  upBtn.addEventListener('click', () => { tryUpgrade(); upBtn.blur(); });
  DOM.toolbar.appendChild(upBtn);
}
DOM.specialBtn.addEventListener('click', () => { if (screen === 'match') input.specialPressed = true; });
DOM.pickaxeBtn.addEventListener('click', () => { if (screen === 'match') input.pickaxePressed = true; });
DOM.cryBtn.addEventListener('click', () => { if (screen === 'match') input.cryPressed = true; });

// ---------------------------------------------------------------- раунд 15 (И2, П6): эпоха в бою и «Залп»
const R15_DOM = {
  volleyBtn: document.getElementById('volleyBtn'),
  volleyCd: document.getElementById('volleyCd'),
  ageBtn: document.getElementById('ageBtn'),
  ageRing: document.getElementById('ageRing'), // r15 И21: рамка-прогресс вместо SVG-кольца
};
R15_DOM.volleyBtn.addEventListener('click', () => { if (screen === 'match') tryVolley(); R15_DOM.volleyBtn.blur(); });
R15_DOM.ageBtn.addEventListener('click', () => { if (screen === 'match') tryAgeUp(); R15_DOM.ageBtn.blur(); });

// Раунд 15 (И5): иконка из SVG-спрайта index.html (#i-volley, #i-age) как
// картинка для канваса справки — та же, что на кнопке тулбара (один источник).
const spriteIconCache = {};
function spriteIconImage(id, color) {
  const key = id + color;
  if (spriteIconCache[key]) return spriteIconCache[key];
  const sym = document.getElementById(id);
  if (!sym) return null;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" color="${color}">${sym.innerHTML}</svg>`);
  return (spriteIconCache[key] = img);
}
function drawHelpGlyphIcon(canvas, glyph) {
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  const bob = Math.sin(helpAnimPhase * 1.6) * 3;
  if (glyph[0] === '#') {
    const img = spriteIconImage(glyph.slice(1), ART.hero.gold);
    const s = Math.min(canvas.width, canvas.height) * 0.78;
    if (img && img.complete && img.naturalWidth) c.drawImage(img, (canvas.width - s) / 2, (canvas.height - s) / 2 + bob, s, s);
    return;
  }
  c.font = "28px 'Lilita One', 'Fredoka', sans-serif";
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = ART.hero.gold;
  c.fillText(glyph, canvas.width / 2, canvas.height / 2 + bob);
}
function playerUnitCost(id) { return ageUnitCost(id, match.world.ageStep.player); }
function playerAgeMaxed() { return match.world.ageStep.player >= ageMaxSteps(match.mission); }
function playerAgeXpNeed() { return ageXpNeed(match.mission, match.world.ageStep.player, 'player'); }
function playerAgeReady() {
  return !playerAgeMaxed() && match.countdown <= 0 && match.world.xp.player >= playerAgeXpNeed();
}

function tryAgeUp() {
  if (!match || match.resolved || !playerAgeReady()) { denyAgeBtn(R15_DOM.ageBtn); return; }
  const w = match.world;
  w.xp.player -= playerAgeXpNeed();
  w.ageStep.player += 1;
  w.teamAge.player = ageIdAt(match.mission, w.ageStep.player);
  onPlayerAgeUp();
}
function denyAgeBtn(el) {
  SFX.buyDenied();
  el.classList.remove('denied'); void el.offsetWidth; el.classList.add('denied');
}
// «Вау»-момент смены эпохи: фон/силуэты/иконки тулбара сразу в новой эпохе
// (render() сам перепечёт фон — match.bg проверяет ageId), ударная волна
// от своей крепости, тряска, звук апгрейда + спец-удара, крупная надпись.
// И6: визуальная часть смены эпохи — «переодевание» армии волной от своей
// крепости (до своего момента юнит ещё в старом костюме, потом вспышка и
// новый костюм), герой — сразу; крепость перестраивается за FORT_REBUILD_SEC.
const FORT_REBUILD_SEC = 0.8;
const DRESS_WAVE_SEC = 0.45;
function startDressWave(team, fromAgeId, coreX) {
  const t0 = match.elapsed + (match.resultElapsed || 0);
  for (const u of match.world.units) {
    if (u.team !== team || u.state === 'dead') continue;
    u.dressFrom = fromAgeId;
    u.dressT0 = t0 + Math.min(1, Math.abs(u.x - coreX) / 700) * DRESS_WAVE_SEC;
    u.dressFx = false;
  }
  return t0;
}
function startFortRebuild(side, fromAge) {
  match.fortTrans = match.fortTrans || {};
  match.fortTrans[side] = { from: fromAge, t0: performance.now() };
  const core = side === 'player' ? match.world.playerCore : match.world.enemyCore;
  const sg = side === 'player' ? 1 : -1;
  const wx = lx => core.x + sg * (46 + (lx - 46) * (VIEW.fortKx || 1));
  VFX.fortRebuild(match, Math.min(wx(-40), wx(46)), Math.max(wx(-40), wx(46)), side === 'player' ? match.age : match.enemyAge);
}
function onPlayerAgeUp() {
  const w = match.world;
  const fromAge = match.age;
  match.age = AGES[w.teamAge.player];
  match.heroDressT0 = startDressWave('player', fromAge.id, w.playerCore.x);
  startFortRebuild('player', fromAge);
  buildToolbar();
  updateHudStatic(true); // r15 И16: заголовок — новая эпоха игрока, со вспышкой
  const x = w.playerCore.x + CORE_KEEP_FAR;
  VFX.ageUp(match, x, true);
  shakeScreen(match, 9);
  match.ageFlash = 1;
  match.ageBanner = { text: I18N.t('age.upBanner', { age: match.age.name }), t: 0, life: AGE_UP.bannerSec, own: true };
  SFX.upgrade();
  SFX.heroSpecial();
  Analytics.track('era_up', { id: match.mission.id, age: w.teamAge.player }); // воронка (js/analytics.js)
}
function onEnemyAgeUp(ageId) {
  const fromAge = match.enemyAge || match.age;
  match.enemyAge = AGES[ageId];
  startDressWave('enemy', fromAge.id, match.world.enemyCore.x);
  startFortRebuild('enemy', fromAge);
  VFX.ageUp(match, match.world.enemyCore.x - CORE_KEEP_FAR, false);
  shakeScreen(match, 4);
  // Своя надпись важнее — вражеская не перебивает её, если идёт.
  if (!match.ageBanner || !match.ageBanner.own || match.ageBanner.t > match.ageBanner.life * 0.6) {
    match.ageBanner = { text: I18N.t('age.enemyUpBanner', { age: match.enemyAge.name }), t: 0, life: AGE_UP.bannerSec * 0.8, own: false };
  }
  SFX.heroSpecial();
}

function tryVolley() {
  if (!match || match.resolved || match.countdown > 0 || match.volleyCd > 0) { denyAgeBtn(R15_DOM.volleyBtn); return; }
  const cx = volleyTargetX(match.world, 'player');
  if (cx === null) { denyAgeBtn(R15_DOM.volleyBtn); return; }
  launchVolley(match.world, 'player', cx, match.world.teamAge.player, ageStatMult(match.world.ageStep.player));
  match.volleyCd = VOLLEY.cooldown;
  SFX.shoot();
  SFX.heroSpecial();
}

function updateR15(dt, onKillGold) {
  if (match.volleyCd > 0) match.volleyCd = Math.max(0, match.volleyCd - dt);
  updateVolley(match.world, dt, onKillGold);
  if (match.ageBanner) {
    match.ageBanner.t += dt;
    if (match.ageBanner.t >= match.ageBanner.life) match.ageBanner = null;
  }
  if (match.ageFlash > 0) match.ageFlash = Math.max(0, match.ageFlash - dt / 0.5);
}

function updateHudR15() {
  const w = match.world;
  const volleyFrac = match.volleyCd / (match.elapsed < VOLLEY.firstReadySec ? VOLLEY.firstReadySec : VOLLEY.cooldown);
  R15_DOM.volleyCd.style.height = Math.max(0, Math.min(1, volleyFrac) * 100) + '%';
  const hasTarget = w.units.some(u => u.team === 'enemy' && u.state !== 'dead');
  R15_DOM.volleyBtn.classList.toggle('disabled', match.volleyCd > 0 || !hasTarget);
  // Глава 5 (iron) и уже достигнутый потолок — кнопки эры нет.
  const maxed = playerAgeMaxed();
  R15_DOM.ageBtn.classList.toggle('hidden', maxed);
  if (!maxed) {
    const frac = Math.min(1, w.xp.player / playerAgeXpNeed());
    R15_DOM.ageRing.style.setProperty('--age-p', frac.toFixed(3)); // r15 И21
    const ready = playerAgeReady();
    R15_DOM.ageBtn.classList.toggle('disabled', !ready);
    R15_DOM.ageBtn.classList.toggle('ready', ready);
  }
}

// Крупная надпись смены эпохи (~1.5 с) + вспышка кадра. Вызывается из
// render() поверх частиц, в тех же логических координатах арены.
function drawAgeBanner() {
  if (match.ageFlash > 0) {
    ctx.save();
    ctx.globalAlpha = match.ageFlash * 0.45;
    ctx.fillStyle = ART.hero.goldHi;
    const vr = viewBgRect(); ctx.fillRect(vr.x, vr.y, vr.w, vr.h); // И1: вспышка на весь полноэкранный кадр
    ctx.restore();
  }
  const b = match.ageBanner;
  if (!b) return;
  const k = b.t / b.life;
  const inT = Math.min(1, b.t / 0.18);
  const alpha = k < 0.75 ? 1 : Math.max(0, 1 - (k - 0.75) / 0.25);
  const scale = (b.own ? 1 : 0.62) * (0.6 + 0.4 * (1 - Math.pow(1 - inT, 3))) * (1 + k * 0.06);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(ARENA.width / 2, b.own ? ARENA.height * 0.34 : ARENA.height * 0.2);
  ctx.scale(scale, scale);
  ctx.font = "54px 'Lilita One', 'Fredoka', sans-serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(30,18,8,.9)';
  ctx.strokeText(b.text, 0, 0);
  ctx.fillStyle = b.own ? ART.hero.gold : ART.flags.enemy;
  ctx.fillText(b.text, 0, 0);
  ctx.restore();
}

function tryBuyUnit(id) {
  const cost = playerUnitCost(id);
  // r15 И19: намерение покупки (и неудачной) — для ответа врага на спам
  // (ai.js trackPlayerMix): игрок, жмущий 1-2-3-4 без золота на дорогих,
  // смешивает армию, даже если по карману выходит только пехота.
  const bi = match.world.buyIntents || (match.world.buyIntents = []);
  bi.push({ t: match.ai.elapsed || 0, id });
  if (bi.length > 40) bi.shift();
  if (match.gold >= cost) {
    match.gold -= cost;
    spawnUnit(match.world, 'player', id);
  } else {
    denyButton(`[data-unit="${id}"]`);
  }
}
function tryUpgrade() {
  const cost = currentUpgradeCost();
  if (incomeUpgradeMaxed()) { denyButton('#upgradeBtn'); return; } // r15 И15: потолок апгрейдов
  if (match.gold >= cost) {
    match.gold -= cost;
    match.incomeLevel += 1;
    match.farmPulse = 1;
    SFX.upgrade();
  } else {
    denyButton('#upgradeBtn');
  }
}
function denyButton(sel) {
  SFX.buyDenied();
  const el = DOM.toolbar.querySelector(sel);
  if (el) { el.classList.remove('denied'); void el.offsetWidth; el.classList.add('denied'); }
}

// ---------------------------------------------------------------- HUD sync
// Раунд 15 (И5): индикатор героя в тулбаре (портрет + HP, при смерти — таймер).
const HERO_MINI = { box: document.getElementById('heroMini'), timer: document.getElementById('heroMiniTimer') };
// r15 И13 (куратор №4, п.10: «штраф за копление золота скрыт»): золото выше
// 70 % порога GOLD_HOARD — плашка над счётчиком и красный пульс. Текст честный
// по главе: штраф (лучники врага) работает с главы 3 (ai.js,
// updateGoldHoardPunish), в главах 1–2 — просто совет тратить золото.
// r15 И16 (куратор №5: «плашка „Spend gold…“ висит над полем»): компактно —
// пульс счётчика + 2–3 слова справа от него; полная фраза только первые
// fullSec после включения (и не чаще раза в fullEverySec), дальше короткая.
const GOLD_WARN = { el: document.getElementById('goldWarn'), frac: 0.7, fullSec: 4, fullEverySec: 30 };
function updateGoldWarn() {
  const on = !!GOLD_WARN.el && match.gold > GOLD_HOARD.threshold * GOLD_WARN.frac;
  const wasOn = !!match.hoardWarn;
  match.hoardWarn = on;
  if (!GOLD_WARN.el) return;
  const t = match.elapsed;
  if (on && !wasOn) {
    match.goldWarnSince = t;
    match.goldWarnFull = match.goldWarnFullAt === undefined || t - match.goldWarnFullAt >= GOLD_WARN.fullEverySec;
    if (match.goldWarnFull) match.goldWarnFullAt = t;
  }
  const full = on && match.goldWarnFull && t - match.goldWarnSince < GOLD_WARN.fullSec;
  const hoard = match.mission.chapterId >= 3;
  const key = full ? (hoard ? 'hud.goldHoardWarn' : 'hud.goldSpendHint') : (hoard ? 'hud.goldHoardShort' : 'hud.goldSpendShort');
  if (on && GOLD_WARN.el.dataset.key !== key) {
    GOLD_WARN.el.textContent = I18N.t(key);
    GOLD_WARN.el.dataset.key = key;
    GOLD_WARN.el.classList.toggle('full', full);
  }
  if (GOLD_WARN.el.hidden === on) GOLD_WARN.el.hidden = !on;
  DOM.goldRow.classList.toggle('gold-warn-on', on);
}

// r15 И16 (куратор №5, п.3: «внезапное падение крепости»): сигнал об ударах
// по СВОЕЙ крепости — первый удар за бой и затем сильный натиск (урон за
// последние windowSec выше порога), не чаще раза в cooldownSec: тост
// «Крепость атакуют!» под заголовком + красный край экрана со стороны
// крепости; полоса HP мигает красным на каждом ударе. Урон считается здесь
// же по разнице HP между кадрами (не зависит от полей баланса); если бой
// выставляет world.fortHitDps — берётся большее из двух.
const FORT_ALERT = { windowSec: 3, dpsFrac: 0.012, minDps: 8, cooldownSec: 12, showSec: 2.4, blinkGap: 0.6 };
// r15 И21: крупная надпись натиска — lifeSec с; «Крепость атакуют!» молчит,
// пока она видна, и ещё quietSec с (world.onAssault, updateFortAlert).
const ASSAULT_BANNER = { lifeSec: 1.5, quietSec: 2 };
// textKey — r15 И21: тот же тост и для «Последний рубеж!» (updateLastStand).
function fireFortAlert(t, textKey) {
  if (match.fortAlertQuietUntil !== undefined && t < match.fortAlertQuietUntil) return false; // r15 И21: идёт натиск
  match.fortAlertAt = t;
  match.fortAlertHideAt = t + FORT_ALERT.showSec;
  const el = DOM.fortAlert;
  const span = el.firstElementChild;
  const key = textKey || 'hud.fortAttack';
  if (span && span.dataset.i18n !== key) { span.dataset.i18n = key; span.textContent = I18N.t(key); }
  el.classList.remove('hidden', 'show'); void el.offsetWidth; el.classList.add('show');
  DOM.fortEdge.classList.remove('pulse'); void DOM.fortEdge.offsetWidth; DOM.fortEdge.classList.add('pulse');
  return true;
}
function hideFortAlert() {
  DOM.fortAlert.classList.add('hidden'); DOM.fortAlert.classList.remove('show');
  match.fortAlertHideAt = undefined;
}
function updateFortAlert() {
  const core = match.world.playerCore, t = match.elapsed;
  const prev = match.fortHpPrev;
  match.fortHpPrev = core.hp;
  if (match.fortAlertHideAt !== undefined && t >= match.fortAlertHideAt) hideFortAlert();
  // r15 И21: «Последний рубеж!» — один раз, как только крепость вошла в него
  // (updateLastStand); если в этот миг идёт натиск — сразу после паузы.
  if (match.lastStandAt !== undefined && !match.lastStandToast && !match.resolved && fireFortAlert(t, 'hud.lastStand')) match.lastStandToast = true;
  if (prev === undefined || match.resolved) return;
  const dmg = prev - core.hp;
  const hits = match.fortHits || (match.fortHits = []);
  if (dmg > 0.01) {
    hits.push({ t, dmg });
    if (match.fortBlinkAt === undefined || t - match.fortBlinkAt >= FORT_ALERT.blinkGap) {
      match.fortBlinkAt = t;
      const bar = DOM.playerCoreBar;
      bar.classList.remove('fort-hit'); void bar.offsetWidth; bar.classList.add('fort-hit');
      if (!bar.dataset.hitWired) { bar.dataset.hitWired = '1'; bar.addEventListener('animationend', (e) => { if (e.target === bar) bar.classList.remove('fort-hit'); }); } // r15 И18: не оставлять красный хвост
    }
  }
  while (hits.length && t - hits[0].t > FORT_ALERT.windowSec) hits.shift();
  if (!(dmg > 0.01)) return;
  const dps = Math.max(hits.reduce((s, h) => s + h.dmg, 0) / FORT_ALERT.windowSec, match.world.fortHitDps || 0);
  match.fortHitDpsHud = dps;
  const thr = Math.max(FORT_ALERT.minDps, core.maxHp * FORT_ALERT.dpsFrac);
  // r15 И21: на последнем рубеже тот же тост говорит «Последний рубеж!»
  const key = match.world.lastStand ? 'hud.lastStand' : undefined;
  if (!match.fortAlertFirst) { match.fortAlertFirst = fireFortAlert(t, key); } // r15 И21: подавленный натиском — покажется позже
  else if (dps > thr && t - (match.fortAlertAt || -99) >= FORT_ALERT.cooldownSec) fireFortAlert(t, key);
}

// r15 И16 (куратор №5, п.6: «„Миссия 3 — Каменный век“, а на поле
// мушкетёры»): решение продюсера — рост эпохи в бою остаётся, поэтому
// заголовок показывает ТЕКУЩУЮ эпоху игрока (match.age — её же носят его
// армия и герой) и обновляется при «Новой эре» (onPlayerAgeUp) с короткой
// вспышкой. Нумерация — сквозная «Миссия N», как и узлы карты глав (п.9).
// r15 И18 (куратор №6): заголовок — в одну строку на любом экране и языке.
// Кегль по умолчанию (из CSS) → ужимаем шагом 0.5px до 12px, сначала сняв
// межбуквенный/межсловный отступ (.fit-tight); не влезло и на 12px —
// многоточие (text-overflow в CSS).
const TITLE_MIN_PX = 12;
// scrollWidth округляется до целых — переполнение в доли пикселя (а его
// хватает для многоточия) он не видит. Меряем сам текст (Range) + отступы.
const titleRange = document.createRange();
function titleFits(el) {
  titleRange.selectNodeContents(el);
  const cs = getComputedStyle(el);
  const k = (el.getBoundingClientRect().width / (el.offsetWidth || 1)) || 1; // «пружина» эпохи (scale) не в счёт
  const need = titleRange.getBoundingClientRect().width / k + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  return need <= el.clientWidth - 1;
}
function fitMissionTitle() {
  const el = DOM.missionTitle;
  if (!el || !el.isConnected) return;
  el.style.fontSize = '';
  el.classList.remove('fit-tight');
  if (!el.clientWidth) return; // HUD скрыт — мерить нечего
  if (titleFits(el)) return;
  const fits = () => titleFits(el);
  el.classList.add('fit-tight');
  let px = parseFloat(getComputedStyle(el).fontSize) || 14;
  while (!fits() && px > TITLE_MIN_PX) {
    px = Math.max(TITLE_MIN_PX, px - 0.5);
    el.style.fontSize = px + 'px';
  }
}
// Шрифт Lilita One догружается асинхронно: замер до загрузки (запасной шрифт
// уже) давал многоточие после подмены — перемеряем по загрузке шрифтов и раз
// в секунду в бою, если строка вдруг перестала влезать.
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { if (match) fitMissionTitle(); });
function refitMissionTitleIfNeeded() {
  const now = performance.now();
  if (now - (refitMissionTitleIfNeeded.at || 0) < 1000) return;
  refitMissionTitleIfNeeded.at = now;
  const el = DOM.missionTitle;
  if (el.clientWidth && parseFloat(el.style.fontSize || '99') > TITLE_MIN_PX && !titleFits(el)) fitMissionTitle();
}
// r15 И18 (куратор №6: «эпоха сбрасывается каждую миссию — м6 снова Stone
// Age»): на старте каждого боя под заголовком мелкая строка цели эпох —
// «Старт: Каменный век → дойди до Железного!» (или просто «Старт: …», если в
// миссии эпоху поднять нельзя). Видна на отсчёте (если он есть) и первые
// AGE_GOAL_SEC секунд боя, потом тает; не ловит касания.
const AGE_GOAL_SEC = 5;
function ensureAgeGoalEl() {
  let el = document.getElementById('ageGoal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ageGoal';
    el.className = 'age-goal hidden';
    el.setAttribute('aria-hidden', 'true');
    DOM.missionTitle.parentElement.appendChild(el);
  }
  return el;
}
function showAgeGoal() {
  const el = ensureAgeGoalEl();
  const m = match.mission;
  const startName = AGES[ageIdAt(m, 0)].name;
  const steps = ageMaxSteps(m);
  el.textContent = steps > 0
    ? I18N.t('hud.ageGoal', { start: startName, goal: AGES[ageIdAt(m, steps)].name })
    : I18N.t('hud.ageStart', { start: startName });
  el.classList.remove('hidden', 'out');
  match.ageGoalShown = true;
}
function updateAgeGoal() {
  const el = document.getElementById('ageGoal');
  if (!el || el.classList.contains('hidden')) return;
  const alertOn = !DOM.fortAlert.classList.contains('hidden');
  if (alertOn || match.resolved) { el.classList.add('hidden'); return; }
  const t = DOM.missionTitle; // под заголовком (высота .hud-top на таче больше — там слот героя)
  if (t.offsetHeight) { el.style.top = (t.offsetTop + t.offsetHeight + 2) + 'px'; el.style.left = (t.offsetLeft + t.offsetWidth / 2) + 'px'; }
  if ((match.elapsed >= AGE_GOAL_SEC || match.world.ageStep.player > 0) && !el.classList.contains('out')) {
    el.classList.add('out');
    setTimeout(() => { if (el.classList.contains('out')) el.classList.add('hidden'); }, 450);
  }
}
function updateHudStatic(agePop) {
  DOM.missionTitle.textContent = I18N.t('hud.missionTitle', { n: match.mission.id, age: match.age.name });
  fitMissionTitle(); // r15 И18
  if (!agePop && !match.ageGoalShown) showAgeGoal(); // r15 И18: цель эпох на старте боя
  if (agePop) { const el = DOM.missionTitle; el.classList.remove('age-pop'); void el.offsetWidth; el.classList.add('age-pop'); }
  else { DOM.fortAlert.classList.add('hidden'); DOM.fortAlert.classList.remove('show'); DOM.fortEdge.classList.remove('pulse'); } // новый бой — без хвоста прошлого
  if (GOLD_WARN.el) GOLD_WARN.el.dataset.key = ''; // язык мог смениться — текст плашки перечитать
}
function updateHud() {
  const w = match.world;
  DOM.playerCoreFill.style.width = Math.max(0, w.playerCore.hp / w.playerCore.maxHp * 100) + '%';
  DOM.playerCoreText.textContent = `${Math.max(0, Math.ceil(w.playerCore.hp))}/${w.playerCore.maxHp}`;
  DOM.enemyCoreFill.style.width = Math.max(0, w.enemyCore.hp / w.enemyCore.maxHp * 100) + '%';
  DOM.enemyCoreText.textContent = `${Math.max(0, Math.ceil(w.enemyCore.hp))}/${w.enemyCore.maxHp}`;
  DOM.goldText.textContent = Math.floor(match.gold);
  DOM.diamondText.textContent = Math.floor(match.shopKills);
  // Ночная правка — видимый сигнал штрафа за копление золота (раньше
  // невидимая механика, находка ревьюера №1, подтверждена живым тестом).
  DOM.goldRow.classList.toggle('gold-hoard-flash', match.goldHoardFlash > 0);
  updateGoldWarn();
  updateFortAlert(); // r15 И16: «Крепость атакуют!»
  updateAgeGoal(); // r15 И18: строка цели эпох на старте боя
  refitMissionTitleIfNeeded(); // r15 И18: заголовок в одну строку
  DOM.heroFill.style.width = Math.max(0, w.hero.hp / w.hero.maxHp * 100) + '%';
  HERO_MINI.box.classList.toggle('dead', !w.hero.alive); // И5: серый портрет + таймер респауна

  // Таймер автовоскрешения + выкуп (раунд 7) — видны, только пока герой
  // мёртв. Баг-репорт основателя, второй заход: чинил скрытие только для
  // паузы (там коробка ложилась поверх "Продолжить"), но тот же дефект
  // остался на справке «?» (и логически на любом другом оверлее сверху
  // боя). Правильное условие — не перечислять экраны по одному, а
  // показывать коробку ТОЛЬКО пока реально идёт бой (screen==='match');
  // на любом overlay-экране (паузе, справке, магазине с итога и т.п.) она
  // не нужна вообще — под ним всегда есть свой способ вернуться в бой.
  const reviveHidden = w.hero.alive || screen !== 'match';
  if (DOM.heroReviveBox.classList.contains('hidden') !== reviveHidden) {
    DOM.heroReviveBox.classList.toggle('hidden', reviveHidden);
    if (!reviveHidden) positionReviveBox(); // r15 И16: над портретом (ПК)
  }
  if (!w.hero.alive) {
    const secs = Math.max(0, Math.ceil(w.hero.respawnTimer));
    HERO_MINI.timer.textContent = secs; // И5: таймер респауна — на портрете
    // r15 И16: + кольцо оставшегося времени (вместо панели «Капитан пал: 0:19»)
    DOM.heroMiniRing.setAttribute('stroke-dashoffset', String(Math.round((1 - Math.min(1, Math.max(0, w.hero.respawnTimer) / (HERO.respawnDelay || 1))) * 100)));
    // r15 И12 (куратор №3: «Revive 30 выглядит активной при золоте 16–24»):
    // при нехватке — приглушённая кнопка, заливка накопленной доли и
    // недостача «(−12)». Не disabled: нажатие даёт отказ (звук + дрожь),
    // а не молчит — и на ПК, и на таче.
    const cost = currentBuybackCost();
    const short = Math.max(0, Math.ceil(cost - match.gold));
    DOM.buybackCostText.textContent = cost;
    DOM.btnBuyback.disabled = false;
    DOM.btnBuyback.classList.toggle('is-short', short > 0);
    DOM.btnBuyback.setAttribute('aria-disabled', String(short > 0));
    DOM.btnBuyback.style.setProperty('--fill', Math.round(Math.min(1, Math.max(0, match.gold) / cost) * 100) + '%');
    // r15 И18 (куратор №6: «„Revive 30 (−3)“ непонятно»): «Воскресить 30 ·
    // не хватает 3». На таче (кнопка под полосой HP) недостача — второй
    // строкой внутри кнопки, без точки (.bs-sep скрыт в style.css).
    const shortText = short > 0 ? I18N.t('hud.reviveNeed', { n: short }) : '';
    if (DOM.buybackShortText.dataset.t !== shortText) {
      DOM.buybackShortText.dataset.t = shortText;
      DOM.buybackShortText.innerHTML = shortText ? `<span class="bs-sep">· </span>${shortText}` : '';
    }
  }

  match.unlockedUnits.forEach(id => {
    const btn = DOM.toolbar.querySelector(`[data-unit="${id}"]`);
    btn.classList.toggle('disabled', match.gold < playerUnitCost(id)); // раунд 15: цена в эпохе игрока
  });
  const upBtn = document.getElementById('upgradeBtn');
  const upCost = currentUpgradeCost();
  const upMaxed = incomeUpgradeMaxed(); // r15 И15: потолок апгрейдов дохода — «MAX»
  document.getElementById('upgradeCost').textContent = upMaxed ? I18N.t('hud.incomeMax') : upCost;
  upBtn.classList.toggle('disabled', upMaxed || match.gold < upCost);

  const cdFrac = w.hero.specialCooldown / HERO.specialCooldown;
  DOM.specialCd.style.height = Math.max(0, cdFrac * 100) + '%';
  DOM.specialBtn.classList.toggle('disabled', cdFrac > 0);

  const pickCdFrac = w.hero.pickaxeCooldown / HERO.pickaxeCooldown;
  DOM.pickaxeCd.style.height = Math.max(0, pickCdFrac * 100) + '%';
  DOM.pickaxeBtn.classList.toggle('disabled', pickCdFrac > 0);

  // Боевой клич (раунд 9) — кнопка видна только если способность куплена
  // в магазине (progress.heroAbilityCry), как на десктоп-тулбаре, так и
  // на мобильной touch-кнопке.
  const cryCdFrac = w.hero.cryCooldown / SHOP.heroAbilityCry.cooldown;
  DOM.cryBtn.classList.toggle('hidden', !w.hero.cryUnlocked);
  DOM.touchCry.classList.toggle('hidden', !w.hero.cryUnlocked);
  DOM.cryCd.style.height = Math.max(0, cryCdFrac * 100) + '%';
  DOM.cryBtn.classList.toggle('disabled', cryCdFrac > 0);

  // Мобильные тач-кнопки атаки/спец-удара/кирки/клича — кулдаун прямо на
  // самих кнопках (раунд 5, запрос основателя), не на перках нижней
  // панели, которые на мобильном теперь скрыты (см. style.css).
  const atkCdFrac = w.hero.attackCooldown / HERO.meleeInterval;
  DOM.touchAttackCd.style.height = Math.max(0, atkCdFrac * 100) + '%';
  DOM.touchSpecialCd.style.height = Math.max(0, cdFrac * 100) + '%';
  DOM.touchPickaxeCd.style.height = Math.max(0, pickCdFrac * 100) + '%';
  DOM.touchCryCd.style.height = Math.max(0, cryCdFrac * 100) + '%';
  // r15 И18: второстепенные тач-кнопки на кулдауне — полупрозрачные (0.75),
  // поле за ними видно; главная «Атака» всегда непрозрачная.
  DOM.touchSpecial.classList.toggle('cd-wait', cdFrac > 0);
  DOM.touchPickaxe.classList.toggle('cd-wait', pickCdFrac > 0);
  DOM.touchCry.classList.toggle('cd-wait', cryCdFrac > 0);
  updateHudR15(); // раунд 15: «Залп» и «Новая эра»
}

// ---------------------------------------------------------------- particles & shake
// Раунд 14: частицы живут в vfx.js (типы spark/dust/ember/chip/ring/flash,
// лимит ART.particleCap). Эти две функции — тонкие обёртки с прежней
// сигнатурой для старых вызовов (салют, экран итога); y — по-прежнему
// смещение от линии земли.
function spawnParticles(m, x, y, color, count, type = 'spark') {
  VFX.burst(m, type, x, y, count, { color, speed: 100, life: 0.5, size: 3, lift: 40 });
}
function updateParticles(m, dt) { VFX.update(m, dt); }
function shakeScreen(m, mag) { m.shake.mag = Math.max(m.shake.mag, mag); }
// Раунд 15 (И4): тряска — сумма синусов некратных частот вместо нового
// случайного сдвига каждый кадр (на 120/144 Гц случайный дребезг читался как
// «мельтешение» и укачивал); по вертикали слабее, чем по горизонтали.
function updateShake(m, dt) {
  m.shake.mag = Math.max(0, m.shake.mag - dt * 24);
  m.shake.t = (m.shake.t || 0) + dt;
  if (m.shake.mag > 0.05) {
    const t = m.shake.t, a = m.shake.mag;
    m.shake.x = a * (0.62 * Math.sin(t * 47) + 0.38 * Math.sin(t * 83 + 1.3));
    m.shake.y = a * 0.7 * (0.6 * Math.sin(t * 59 + 0.7) + 0.4 * Math.sin(t * 97 + 2.1));
  } else { m.shake.x = 0; m.shake.y = 0; }
}

// ---------------------------------------------------------------- отдача (раунд 15, И4, П3)
// Хит-стоп: на удар героя и спец-удар логика замирает на 40–60 мс (рендер
// идёт), см. frame(). Берётся максимум, а не сумма — серия попаданий
// спец-удара по пяти врагам даёт одну паузу, а не пять.
let hitStopT = 0;
function requestHitStop(sec) { hitStopT = Math.max(hitStopT, sec); }

// Вызывается из entities.js dealDamage на каждое применённое попадание:
// числа урона (vfx.js; r15 И14: ≤12 на экране, попадания по одной цели в
// пределах 0.38 с складываются в растущее число), хит-стоп и искры удара героя, тряска по ядру сильнее
// прежних 3 px. Урон по своим юнитам числами не подписывается — иначе в
// большой свалке каша из цифр; урон по своему герою и крепости — красным.
function onDamageFx(world, kind, ref, dmg, role) {
  if (!match || match.world !== world) return;
  const byHero = role === 'hero' || role === 'hero_special';
  const ownSide = ref.team === 'player';
  // И7: высота числа/искр — с поправкой на крупный план (VIEW.fig/fortK),
  // иначе на 16:9 цифры висели на груди увеличенных фигур.
  let x = ref.x, y = -52 * VIEW.fig;
  if (kind === 'core') { x = ref.x + (ownSide ? CORE_KEEP_FAR : -CORE_KEEP_FAR); y = -74 * VIEW.fortK; }
  else if (kind === 'hero') y = -66 * VIEW.fig;
  if (byHero) {
    requestHitStop(role === 'hero_special' ? 0.06 : 0.05);
    if (role === 'hero') VFX.heroHit(match, kind === 'core' ? x : ref.x, kind === 'core' ? -56 * VIEW.fortK : -36 * VIEW.fig, world.hero.facing, kind === 'core');
  }
  if (kind === 'core') shakeScreen(match, byHero ? 7 : ownSide ? 4.5 : role === 'ranged' ? 3.5 : 5);
  if (ownSide && kind === 'unit') return;
  VFX.damageNumber(match, x, y, dmg, byHero ? 'hero' : ownSide ? 'hurt' : 'normal', ref);
}

// ---------------------------------------------------------------- end of match
function endMatch(result) {
  match.resolved = true;
  lastResult = result;
  noteMatchResult(match.mission.id, result === 'win'); // r15 И11: счётчик поражений подряд
  hideHelpTip();
  Analytics.track(result === 'win' ? 'mission_win' : 'mission_lose', Object.assign({ id: match.mission.id, sec: Math.round(match.elapsed) }, result === 'win' ? { coreHpPct: Math.round(100 * Math.max(0, match.world.playerCore.hp) / match.world.playerCore.maxHp) } : {})); // воронка (js/analytics.js)
  // Валюта магазина копится за убийства независимо от исхода миссии
  // (см. ПЛАН.md, раунд 3).
  // r15 И13: поражение — не больше половины «эталона победы» (data.js, lossRewardCap).
  const earned = result === 'win' ? Math.round(match.shopKills) : Math.min(Math.round(match.shopKills), lossRewardCap(match.mission));
  progress.shopCurrencyEarned = (progress.shopCurrencyEarned || 0) + earned;
  recalcShopCurrency(progress);
  saveProgress(progress);
  // Округляем — накопление идёт дробными шагами decay-множителя (0.8/0.6/…),
  // без round тут вылезали хвосты вида "+22.7999999999995" (баг-репорт).
  // Утро 08.09.2026 (баг-репорт основателя — окно победы слишком длинное):
  // награда больше не часть предложения, а отдельный крупный виджет
  // (#resultReward) — общий для победы и поражения, чтобы очки за миссию
  // выглядели одинаково узнаваемо на обоих исходах.
  const rewardAmount = earned;
  // Раунд 15 (И4): без «+0» — виджет награды только если что-то заработано;
  // число «накручивается» от 0 после звёзд (showResultScreen).
  DOM.resultReward.classList.toggle('hidden', rewardAmount <= 0);
  DOM.resultRewardAmount.textContent = '0';
  match.resultReward = rewardAmount;
  match.resultStars = 0;
  DOM.resultCard.classList.toggle('win', result === 'win');
  DOM.resultCard.classList.toggle('lose', result !== 'win');
  DOM.btnToMenuFromResult.classList.remove('as-main');
  Tutorial.end(match); // туториал миссии 1 больше не показывается
  // Утро — стинги основателя (Suno) заменяют синтетические SFX.victory()/
  // defeat() на этих экранах ("теперь не нужны — их заменяют стинги").
  // MUSIC.play() сам кроссфейдит с ещё звучащим боевым треком — без этого
  // получалась бы каша из двух музык, отдельно глушить не нужно.
  const isCampaignComplete = result === 'win' && match.missionIndex + 1 >= MISSIONS.length;
  if (result === 'win') {
    MUSIC.play(isCampaignComplete ? 'campaign_victory' : 'victory_sting');
    const nextMission = match.mission.id + 1;
    if (nextMission > progress.unlocked && nextMission <= MISSIONS.length) {
      progress.unlocked = nextMission; saveProgress(progress);
    }
    // Лидерборд CrazyGames (решение сессии 20.09.2026, см. КОНЦЕПТ_ГДД.md,
    // «Допущения» — «Что считать „очком" лидерборда»): номер только что
    // пройденной миссии, не на поражении. На остальных площадках/локально
    // PLATFORM.submitScore() — no-op (см. js/platform.js).
    PLATFORM.submitScore(match.mission.id);
    // Звёзды — три условия (r15 И14, см. computeMissionStars), в прогрессе —
    // лучший результат (карта глав их показывает).
    const starInfo = computeMissionStars();
    const stars = starInfo.stars;
    match.resultStars = stars;
    match.resultStarGoals = starInfo.goals;
    progress.missionStars = progress.missionStars || {};
    progress.missionStars[match.mission.id] = Math.max(progress.missionStars[match.mission.id] || 0, stars);
    saveProgress(progress);
    DOM.resultTitle.textContent = isCampaignComplete ? I18N.t('result.campaignComplete') : I18N.t('result.victory');
    // Утро 08.09.2026 (баг-репорт основателя): окно победы было «явно
    // слишком длинное» — после заголовка убран весь текст, кроме крупной
    // награды выше; кампания целиком — редкий разовый повод, короткая
    // строка-поздравление остаётся, но без слов про награду (та теперь в
    // виджете).
    DOM.resultText.textContent = isCampaignComplete
      ? I18N.t('result.campaignCompleteText')
      : '';
    DOM.resultText.classList.toggle('hidden', !isCampaignComplete);
    DOM.btnNext.classList.toggle('hidden', match.missionIndex + 1 >= MISSIONS.length);
    DOM.btnToMenuFromResult.classList.toggle('as-main', match.missionIndex + 1 >= MISSIONS.length); // конец кампании — «В меню» главной
    // Основатель, утро 08.09.2026: «Повторить» — только при поражении,
    // возврат к нужной главе и так возможен через меню.
    DOM.btnRetry.classList.add('hidden');
    // Ночь 07→08.09.2026 (задача на релиз): реклама за вознаграждение на
    // экране итога — x2 очков за эту миссию (всегда на победе, множитель
    // снижен с x3 по правке баланса основателя) плюс разовый бонус за
    // прохождение последней миссии главы. Проход в следующую главу НЕ
    // гейтится рекламой (см. ВОПРОСЫ файл сессии — Яндекс, требования к
    // игре, п.4.5.2 прямо запрещает рекламе влиять на возможность
    // продолжить игровой процесс), реклама — только бонус.
    renderResultAdRow(rewardAmount, match.mission.id % MISSIONS_PER_CHAPTER === 0);
  } else {
    MUSIC.play('defeat_sting');
    DOM.resultTitle.textContent = I18N.t('result.defeat');
    DOM.resultText.classList.remove('hidden');
    // Ночная правка (находки ревьюеров №1/№3): текст поражения раньше был
    // один и тот же всегда. Причина — по последнему "опасному" событию,
    // если оно было незадолго до конца (см. world.onDanger/onGoldHoard) —
    // формулировка намеренно описательная, не инструктивная (осторожность
    // основателя: слишком явная подсказка научит обходить механику).
    const recentDanger = match.lastDangerTag && (match.elapsed - match.lastDangerTime) < 20;
    const causeText = recentDanger ? ({
      goldHoard: I18N.t('result.causeGoldHoard'),
      adaptive: I18N.t('result.causeAdaptive'),
      elite: I18N.t('result.causeElite'),
      buff: I18N.t('result.causeBuff'),
    }[match.lastDangerTag] || '') : '';
    // Раунд 15 (И4): вместо абзаца — одна строка: причина, если она была
    // (прежняя логика), иначе короткий совет по кругу.
    DOM.resultText.textContent = causeText || I18N.t(pickDefeatTip()); // И8: только уместные советы
    DOM.btnNext.classList.add('hidden');
    DOM.btnRetry.classList.remove('hidden'); // единственный экран, где остаётся
    // Решение основателя 23.09.2026: реклама за награду и после поражения —
    // та же x2 за миссию, помогает купить улучшения к следующей попытке.
    renderResultAdRow(rewardAmount, false);
  }
  DOM.resultText.classList.toggle('result-tip', result !== 'win');
  if (result === 'win') PLATFORM.preloadInterstitial();
  beginFinale(result, isCampaignComplete);
}

// r15 И14 (куратор №4: «три звезды всегда — даже со смертями героя и без
// давления, нет цели для перепрохождения»). Было (И4): звёзды только по HP
// своей крепости (≥80% — 3, ≥40% — 2, иначе 1) — враг почти не доходил до
// крепости, и 3★ выходили сами. Стало — три независимых условия, каждое =
// звезда, игрок видит их галочками на экране итога:
//   ★ победа;
//   ★ крепость цела не меньше чем на STAR_FORT_HP_MIN (70%);
//   ★ герой ни разу не пал (выкуп не спасает — падение уже случилось).
// Третье условие — вместо «быстрее N с»: оно целиком в руках игрока (герой
// под его управлением), понятно без цифр и не зависит от баланса длины
// миссий, который правит И13.
// r15 И15 (куратор №5: «„Hero never fell" не взята ни разу за 15 боёв — герой
// с 220 HP гибнет за ~10 с»): условие — «герой пал не больше
// STAR_HERO_FALLS_MAX (1) раза»; одна ошибка прощается, выкуп — тоже падение.
const STAR_FORT_HP_MIN = 0.7;
const STAR_HERO_FALLS_MAX = 1;
function computeMissionStars() {
  const core = match.world.playerCore;
  const hpFrac = Math.max(0, core.hp) / core.maxHp;
  const goals = [
    { key: 'result.starWin', ok: true },
    { key: 'result.starFort', ok: hpFrac >= STAR_FORT_HP_MIN, params: { pct: Math.round(STAR_FORT_HP_MIN * 100) } },
    { key: 'result.starHero', ok: (match.heroFalls || 0) <= STAR_HERO_FALLS_MAX, params: { n: STAR_HERO_FALLS_MAX } },
  ];
  return { stars: goals.filter(g => g.ok).length, goals, hpFrac };
}

// Раунд 15 (И4): советы на экране поражения — по кругу, со случайного.
// Раунд 15 (И8, замечание куратора: «Save up for a New Age» в миссии 1, где
// эпоха ещё недоступна): в круг идут только уместные советы. Сначала —
// самая частая ошибка новичка, если она видна по бою: копил золото или
// покупал редко → «Покупай бойцов постоянно»; герой пал → «Держи героя
// рядом с армией». «Новая эра» — только если в миссии есть следующая эпоха
// и порог опыта хоть раз набран; «Залп» — только если он успел зарядиться.
let defeatTipIdx = Math.floor(Math.random() * 6);
function pickDefeatTip() {
  const w = match.world;
  const cheapest = Math.min(...match.unlockedUnits.map(id => playerUnitCost(id)));
  const buys = (w.spawnCount && w.spawnCount.player) || 0;
  if (match.gold >= cheapest * 3 || buys < match.elapsed / 12) return 'result.tip5';
  if (!w.hero.alive) return 'result.tip6';
  const tips = ['result.tip3', 'result.tip4', 'result.tip5', 'result.tip6'];
  if (!playerAgeMaxed() && (w.ageStep.player > 0 || w.xp.player >= playerAgeXpNeed())) tips.push('result.tip1');
  if (match.elapsed >= VOLLEY.firstReadySec) tips.push('result.tip2');
  return tips[defeatTipIdx++ % tips.length];
}

// ---------------------------------------------------------------- финал боя (раунд 15, И4, П3)
// Раньше окно итога всплывало через 0.7 с, разрушения крепости не было
// видно. Теперь «добивание»: хит-стоп 0.12 с, взрыв с обломками и дымом у
// разрушенной крепости (drawCore сам рисует руины при hp 0), замедление
// времени ~0.3x, вспышка и виньетка кадра, свои празднуют (победа) — и
// только потом окно итога. Победа 1.8 с, поражение 1.2 с (реального времени).
const FINALE_WIN_SEC = 1.8, FINALE_LOSE_SEC = 1.2;
function beginFinale(result, isCampaignComplete) {
  const win = result === 'win';
  const core = win ? match.world.enemyCore : match.world.playerCore;
  const x = core.x + (win ? -CORE_KEEP_FAR * 0.3 : CORE_KEEP_FAR * 0.3);
  match.finale = { t: 0, dur: win ? FINALE_WIN_SEC : FINALE_LOSE_SEC, win, x, isCampaignComplete, smokeAcc: 0, shocks: win ? [0.3, 0.62] : [0.35] };
  requestHitStop(0.12);
  shakeScreen(match, 9);
  VFX.fortressDestroyed(match, x, !win, win ? (match.enemyAge || match.age) : match.age);
  SFX.heroSpecial();
  DOM.hud.classList.add('r15-finale');
}
// Масштаб времени логики в финале: 0.3x, в последней четверти плавно к 0.6x.
function finaleTimeScale(f) {
  const k = f.t / f.dur;
  return k < 0.75 ? 0.3 : 0.3 + 0.3 * ((k - 0.75) / 0.25);
}
// Реальное время финала (из frame(), после render()): дым, вторичные
// хлопки, вспышка/виньетка поверх кадра, переход к окну итога.
function tickFinale(dt) {
  const f = match.finale;
  f.t += dt;
  // update() гасит тряску масштабированным dt (0.3x) — досчитываем остаток,
  // чтобы в замедлении кадр не качало 1.5 с.
  match.shake.mag = Math.max(0, match.shake.mag - dt * 24 * 0.7);
  f.smokeAcc += dt;
  while (f.smokeAcc >= 0.07) {
    f.smokeAcc -= 0.07;
    VFX.smokePuff(match, f.x + (Math.random() - 0.5) * 60, -20 - Math.random() * 30, 1.1);
  }
  while (f.shocks.length && f.t >= f.shocks[0]) {
    f.shocks.shift();
    VFX.fortressAftershock(match, f.x + (Math.random() - 0.5) * 50);
    shakeScreen(match, 6);
    SFX.coreHit();
  }
  if (f.win && f.t > 0.4) match.resultElapsed += dt; // свои начинают праздновать (render, cheer)
  drawFinaleOverlay(f);
  if (f.t >= f.dur) {
    match.finale = null;
    showResultScreen(f.win, f.isCampaignComplete);
  }
}
function drawFinaleOverlay(f) {
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const flash = Math.max(0, 1 - f.t / 0.35);
  if (flash > 0) {
    ctx.globalAlpha = flash * 0.55;
    ctx.fillStyle = f.win ? '#fff4d0' : '#ff9070';
    ctx.fillRect(0, 0, W, H);
  }
  // виньетка «замедления» — наплывает и держится до окна итога
  ctx.globalAlpha = Math.min(1, f.t / 0.25) * 0.6;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, f.win ? 'rgba(40,24,6,.85)' : 'rgba(60,8,4,.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// r15 И14: под звёздами — три строки-условия с галочкой (выполнено) или
// пустым кружком (нет). Элемент создаётся один раз сразу после #resultStars
// (index.html не трогаем). Условия выполненные и нет различаются и значком,
// и цветом/яркостью текста.
function renderStarGoals(goals) {
  let el = document.getElementById('resultStarGoals');
  if (!el) {
    el = document.createElement('ul');
    el.id = 'resultStarGoals';
    el.className = 'result-star-goals';
    DOM.resultStars.insertAdjacentElement('afterend', el);
  }
  el.classList.toggle('hidden', !goals);
  if (!goals) { el.innerHTML = ''; return; }
  const ICON_OK = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9"/><path d="M5.5 10.4l3 3 6-6.6"/></svg>';
  const ICON_NO = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"/></svg>';
  el.innerHTML = goals.map((g, i) =>
    `<li class="${g.ok ? 'ok' : 'no'}" style="animation-delay:${(0.3 + i * 0.28).toFixed(2)}s">${g.ok ? ICON_OK : ICON_NO}<span>${I18N.t(g.key, g.params)}</span></li>`
  ).join('');
}

// Окно итога после финала: заголовок, звёзды по очереди, «накрутка»
// кристаллов, конфетти/салют (раунд 7) на победу.
let resultAdRowToken = null; // r15 И12: отложенный показ ряда рекламы
function showResultScreen(win, isCampaignComplete) {
  DOM.hud.classList.remove('r15-finale');
  showScreen('result');
  const stars = win ? match.resultStars : 0;
  DOM.resultStars.classList.toggle('hidden', !win);
  // r15 И10: у зажжённой звезды после «влёта» — пульс (второе значение задержки).
  DOM.resultStars.innerHTML = win ? [0, 1, 2].map(i => { const d = 0.25 + i * 0.28; return `<span class="r-star${i < stars ? ' on' : ''}" style="animation-delay:${d.toFixed(2)}s, ${(d + 0.5 + i * 0.12).toFixed(2)}s"><svg viewBox="0 0 24 24"><use href="#i-star"/></svg></span>`; }).join('') : '';
  renderStarGoals(win ? match.resultStarGoals : null); // r15 И14
  const amount = match.resultReward || 0;
  const countDelay = win ? 0.3 + stars * 0.28 : 0.25;
  if (amount > 0) countUpReward(amount, countDelay);
  // r15 И10 (куратор: «+4 кристалла, а Watch ad x2 обещает +10»): ряд рекламы
  // появляется, только когда счётчик докрутился до итоговой суммы.
  const countMs = amount > 0 ? countDelay * 1000 + Math.min(900, 350 + amount * 25) : 0;
  // r15 И12 (куратор №3: «дыра между „Ещё раз“ и „Магазин“»): раньше ряд до
  // своего появления был visibility:hidden через animation-delay и держал
  // пустое место в карточке. Теперь до докрутки он display:none
  // (.ad-row-wait) и вставляется в раскладку только в момент показа.
  const adRowToken = resultAdRowToken = {};
  DOM.resultAdRow.classList.remove('ad-row-in');
  DOM.resultAdRow.style.animationDelay = '';
  DOM.resultAdRow.classList.add('ad-row-wait');
  setTimeout(() => {
    if (adRowToken !== resultAdRowToken || screen !== 'result') return;
    DOM.resultAdRow.classList.remove('ad-row-wait');
    DOM.resultAdRow.classList.add('ad-row-in');
  }, countMs + 100);
  // r15 И10 (куратор: «празднование победы скромное»): лучи за карточкой,
  // конфетти поверх, крупный счётчик кристаллов. Поражение — без них.
  DOM.screenResult.classList.toggle('celebrate', !!win);
  if (win) startConfetti(); else stopConfetti();
  if (win) {
    // Заметный разовый всплеск конфетти у своей базы на победу — чтобы
    // «живой» фон читался с первого взгляда (раунд 7).
    const coreX = match.world.playerCore.x;
    spawnParticles(match, coreX, -60, '#f2c94c', 16);
    spawnParticles(match, coreX, -60, '#8fd6ff', 10);
    spawnParticles(match, coreX, -60, '#ff8a5c', 10);
    // Утро — «под финальный трек он хочет фейерверк: салюты, конфетти,
    // мишура» — залпы по всей ширине арены в течение ~4с (вступление
    // campaign_victory.mp3), не один разовый всплеск у базы.
    if (isCampaignComplete) fireCampaignFireworks(match);
  }
}
// И7: from — с какого числа считать (после рекламы x2 сумма докручивается
// от уже показанной до удвоенной, а не остаётся старой «+11»). Новый вызов
// отменяет незаконченный прежний (token).
let countUpToken = null;
function countUpReward(amount, delaySec, from = 0) {
  const m = match;
  const token = countUpToken = {};
  const t0 = performance.now() + delaySec * 1000;
  const dur = Math.min(900, 350 + Math.abs(amount - from) * 25);
  const el = DOM.resultRewardAmount;
  el.textContent = String(from);
  DOM.resultReward.classList.remove('counted');
  const step = (now) => {
    if (token !== countUpToken) return;
    if (match !== m || screen !== 'result') { el.textContent = String(amount); return; }
    const k = Math.max(0, Math.min(1, (now - t0) / dur));
    el.textContent = String(Math.round(from + (amount - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
    else DOM.resultReward.classList.add('counted');
  };
  requestAnimationFrame(step);
}

// Реклама за вознаграждение на экране итога миссии (ночь 07→08.09.2026).
// Обе кнопки ПРЯМО называют рекламу и награду в тексте (требование
// площадок — Яндекс, требования к игре, п.4.5.1; VK — аналогично, см.
// «Документация ВК — Реклама в играх», раздел «Реклама за вознаграждение»),
// не просто "Получить x3". Ни одна не блокирует «Далее» — обе строго
// опциональный бонус (п.4.5.2: награда не должна влиять на возможность
// продолжить игровой процесс).
const AD_ICON_SVG = '<svg class="ad-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="3.2" fill="currentColor" stroke="#1a120a" stroke-width="1.4"/><path d="M10 9.2v5.6l4.8-2.8z" fill="#f3fff9" stroke="#1a120a" stroke-width="1" stroke-linejoin="round"/></svg>';
// Убирает из строки перевода декоративные эмодзи и стрелки (во всех 11 языках
// они стоят в начале/конце, смысловой текст не трогается).
function plainLabel(s) {
  return String(s).replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{27F5}\u{27F6}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}
// И7: награда за рекламу — сразу в виджете итога (докрутка к новой сумме).
function bumpResultReward(add) {
  if (!match || !(add > 0)) return;
  const from = match.resultReward || 0;
  match.resultReward = from + add;
  DOM.resultReward.classList.remove('hidden');
  countUpReward(match.resultReward, 0.1, from);
}
function renderResultAdRow(earnedDiamonds, isChapterFinal) {
  DOM.resultAdRow.innerHTML = '';
  const showMissionAd = earnedDiamonds > 0;
  DOM.resultAdRow.classList.toggle('hidden', !showMissionAd && !isChapterFinal);

  // r15 И10: tailHTML — своя концовка подписи вместо «(+N 💎)» (x2 за миссию).
  function makeAdButton(label, amount, onGranted, tailHTML) {
    const btn = document.createElement('button');
    btn.className = 'menu-btn ad-reward-btn';
    // Раунд 15 (И4): без эмодзи 🎬/⏳/🚫 и стрелки из строк перевода — вместо
    // них SVG-значок «ролик»; сам текст (реклама + награда) — как требуют площадки.
    const setLabel = () => { btn.innerHTML = `${AD_ICON_SVG}<span>${plainLabel(I18N.t('result.adWatchPrefix'))}${tailHTML ? ' · ' : ' '}${label}</span> ${tailHTML || `<span class="ad-reward-amount">(+${amount} <span class="diamond-dot"></span>)</span>`}`; };
    setLabel();

    function wireClick() {
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = plainLabel(I18N.t('result.adLoading'));
        PLATFORM.showRewardedVideo().then((rewarded) => {
          if (rewarded) {
            lastAdShownAt = Date.now();
            onGranted();
            saveProgress(progress);
            btn.textContent = I18N.t('result.adGranted', { amount });
          } else {
            btn.disabled = false;
            setLabel();
            showLoudNotice(I18N.t('result.adUnavailableNotice'));
          }
        });
      });
    }

    // Утро 08.09.2026 (решение основателя по ВОПРОСЫ_2026-09-08.md, п.3):
    // проверяем готовность рекламы ДО клика, где площадка это реально даёт
    // (VK, локальный тест) — кнопка не должна звать нажать впустую. Яндекс
    // такого API не публикует (см. platform.js) — там сохранено прежнее
    // поведение: кнопка сразу кликабельна, недоступность — по факту клика.
    // null — площадка (Яндекс/CrazyGames) проверки не даёт: кнопка сразу
    // кликабельна. false — ролика пока нет: переспрашиваем, пока игрок на
    // экране итога, иначе одна неудачная проверка гасила кнопку насовсем.
    if (PLATFORM.kind() === 'yandex') {
      wireClick();
    } else {
      btn.disabled = true;
      let attempts = 0;
      const check = () => {
        PLATFORM.checkRewardedAvailable().then((available) => {
          if (!btn.isConnected) return;
          if (available !== false) {
            btn.disabled = false;
            btn.classList.remove('unavailable');
            setLabel();
            wireClick();
            return;
          }
          btn.classList.add('unavailable');
          btn.textContent = plainLabel(I18N.t('result.adUnavailableBtn'));
          if (++attempts < AD_RECHECK_MAX_ATTEMPTS) setTimeout(check, AD_RECHECK_INTERVAL_MS);
        });
      };
      check();
    }
    return btn;
  }

  // r15 И18 (куратор №6: «две кнопки рекламы на итоге победы — навязчиво»):
  // на финале главы было две кнопки — x2 за миссию и бонус главы (+40,
  // решение основателя 08.09). Теперь на экране итога всегда НЕ БОЛЬШЕ ОДНОЙ
  // кнопки рекламы: на финале главы один ролик даёт и удвоение, и бонус
  // главы сразу («Удвоить + бонус: 19 → 78»), суммарная выгода не меньше
  // прежних двух кнопок, а смотреть нужно один ролик вместо двух.
  const chapterBonus = isChapterFinal ? SHOP.adChapterBonus : 0;
  if (showMissionAd) {
    const bonus = earnedDiamonds * (SHOP.adMissionMultiplier - 1) + chapterBonus;
    // Утро 08.09.2026 (баг-репорт основателя — кнопка «очень широкая»):
    // слово-название валюты убрано из середины подписи — тот же смысл
    // передаёт значок в сумме справа, кнопка короче почти на треть.
    // r15 И10 (куратор: «в окне поражения +4, а Watch ad x2 обещает +10»):
    // было «x2 (+N)», где N — прибавка, а виджет в этот момент ещё докручивал
    // сумму. Теперь подпись называет итог прямо: «Удвоить: 10 → 20 💎» — из
    // той же суммы за миссию, что в виджете (earnedDiamonds), а сам ряд
    // рекламы появляется после докрутки (showResultScreen, .ad-row-in).
    const doubled = earnedDiamonds * SHOP.adMissionMultiplier + chapterBonus;
    const doubleLabel = chapterBonus > 0
      ? I18N.t(SHOP.adMissionMultiplier === 2 ? 'result.adDoubleBonus' : 'result.adMultBonus', { from: earnedDiamonds, to: doubled, x: SHOP.adMissionMultiplier }) // r15 И18
      : SHOP.adMissionMultiplier === 2
        ? I18N.t('result.adDouble', { from: earnedDiamonds, to: doubled })
        : `x${SHOP.adMissionMultiplier}: ${earnedDiamonds} → ${doubled}`;
    DOM.resultAdRow.appendChild(makeAdButton(doubleLabel, bonus, () => {
      progress.shopCurrencyEarned = (progress.shopCurrencyEarned || 0) + bonus;
      recalcShopCurrency(progress);
      DOM.shopCurrencyText.textContent = Math.floor(progress.shopCurrency);
      bumpResultReward(bonus);
    }, '<span class="diamond-dot"></span>'));
  }
  if (isChapterFinal && !showMissionAd) { // r15 И18: только если нет x2 — иначе бонус главы уже в ней
    DOM.resultAdRow.appendChild(makeAdButton(I18N.t('result.adBonusLabel'), SHOP.adChapterBonus, () => {
      progress.shopCurrencyEarned = (progress.shopCurrencyEarned || 0) + SHOP.adChapterBonus;
      recalcShopCurrency(progress);
      DOM.shopCurrencyText.textContent = Math.floor(progress.shopCurrency);
      bumpResultReward(SHOP.adChapterBonus);
    }));
  }
}

function fireCampaignFireworks(m) {
  const colors = ['#f2c94c', '#8fd6ff', '#ff8a5c', '#7bfa8a', '#ff6fa0'];
  let bursts = 0;
  const timer = setInterval(() => {
    if (!m || m.resolved !== true || screen !== 'result' || bursts >= 7) { clearInterval(timer); return; }
    const x = ARENA.width * (0.15 + Math.random() * 0.7);
    const color = colors[bursts % colors.length];
    const y = -40 - Math.random() * 60;
    VFX.spawn(m, 'flash', x, y, { size: 30, life: 0.3, color, gravity: 0 });
    VFX.burst(m, 'spark', x, y, 18, { color, speed: 150, life: 0.7, size: 2.8, gravity: 120 });
    bursts++;
  }, 550);
}

// r15 И10: конфетти поверх экрана победы — свой канвас в CSS-пикселях (не
// мир арены), не больше 150 кусочков: два залпа из нижних углов и дождь
// сверху, ~4.5 с, затем канвас прячется. Свой requestAnimationFrame —
// frame()/render() боя не трогаются; уход с экрана итога гасит сразу.
const CONFETTI_COLORS = ['#ffd35c', '#ff8a5c', '#7bd98a', '#8fd6ff', '#ff6fa0', '#fff3c4', '#e0a030'];
const CONFETTI_MAX = 150, CONFETTI_SEC = 4.5;
let confettiRaf = 0;
function stopConfetti() {
  if (confettiRaf) cancelAnimationFrame(confettiRaf);
  confettiRaf = 0;
  const cv = document.getElementById('confettiCanvas');
  if (cv) { cv.classList.add('hidden'); cv.width = 0; cv.height = 0; }
}
function startConfetti() {
  stopConfetti();
  const cv = document.getElementById('confettiCanvas');
  if (!cv) return;
  cv.classList.remove('hidden');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth || window.innerWidth, H = cv.clientHeight || window.innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const c = cv.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const n = reduced ? 40 : CONFETTI_MAX;
  const s = Math.max(0.75, Math.min(1.7, H / 560)); // масштаб кусочков и скоростей от высоты кадра
  const parts = [];
  for (let i = 0; i < n; i++) {
    const kind = i % 3; // 0 — залп слева, 1 — справа, 2 — дождь сверху
    const p = { w: (7 + Math.random() * 5) * s, h: (4 + Math.random() * 3) * s, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 14,
      wob: Math.random() * 6.28, wobV: 5 + Math.random() * 5, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], delay: 0 };
    if (kind === 2) {
      p.x = Math.random() * W; p.y = -10 - Math.random() * 40; p.vx = (Math.random() - 0.5) * 50 * s; p.vy = (60 + Math.random() * 90) * s;
      p.delay = 0.25 + Math.random() * 1.6;
    } else {
      const left = kind === 0;
      const a = -(Math.PI / 2) + (left ? 1 : -1) * (0.18 + Math.random() * 0.5);
      const sp = (520 + Math.random() * 420) * s * Math.min(1.2, H / 450);
      p.x = left ? W * 0.04 : W * 0.96; p.y = H * 0.98;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.delay = Math.random() * 0.25 + (i % 2 ? 0 : 0.5); // два залпа с каждой стороны
    }
    parts.push(p);
  }
  const g = 520 * s;
  let t = 0, last = performance.now();
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    if (screen !== 'result' || t > CONFETTI_SEC + 1.5) { stopConfetti(); return; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const fade = t > CONFETTI_SEC ? Math.max(0, 1 - (t - CONFETTI_SEC) / 1.5) : 1;
    let alive = 0;
    for (const p of parts) {
      if (t < p.delay) { alive++; continue; }
      const drag = Math.pow(0.35, dt); // сопротивление воздуха: быстрый залп тормозит, потом «планирует»
      p.vx *= drag; p.vy = p.vy * drag + g * dt;
      if (p.vy > 150 * s) p.vy = 150 * s; // предельная скорость падения бумажки
      p.wob += p.wobV * dt; p.rot += p.spin * dt;
      p.x += (p.vx + Math.sin(p.wob) * 40 * s) * dt; p.y += p.vy * dt;
      if (p.y > H + 20) continue;
      alive++;
      c.save();
      c.globalAlpha = fade;
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.scale(1, Math.cos(p.wob)); // «переворот» бумажки
      c.fillStyle = p.color;
      c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      c.restore();
    }
    if (!alive || fade <= 0) { stopConfetti(); return; }
    confettiRaf = requestAnimationFrame(step);
  };
  confettiRaf = requestAnimationFrame(step);
}

// ---------------------------------------------------------------- input
// Баг-репорт (раунд 7): спам пробела заодно «спамил» последнюю нажатую
// кнопку тулбара (покупка юнита/апгрейд). Причина — нативное поведение
// <button>: если фокус остался на DOM-кнопке (после клика мышью/тапа), то
// Space/Enter активируют именно её, ПОВЕРХ игрового хоткея атаки. Фикс —
// глушим дефолтное поведение клавиш, которые игра сама обрабатывает, и
// снимаем фокус с любой toolbar-кнопки сразу после клика.
// Раунд 9: спец-удар K -> R, апгрейд дохода U -> Q; K освободился под новую
// способность "Боевой клич" (см. handleHotkey).
// Раунд 15 (П6): V — «Залп», T — «Новая эра» (обе были свободны).
const GAME_KEYS = new Set(['Space', 'KeyJ', 'KeyR', 'KeyE', 'ShiftLeft', 'ShiftRight', 'KeyF', 'KeyQ', 'KeyB', 'KeyV', 'KeyT', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyP', 'Escape']);
window.addEventListener('keydown', (e) => {
  if (screen === 'match' && GAME_KEYS.has(e.code)) e.preventDefault();
  if (keysDown.has(e.code)) return;
  keysDown.add(e.code);
  handleHotkey(e.code, e.key);
});
window.addEventListener('keyup', (e) => keysDown.delete(e.code));

function handleHotkey(code, key) {
  if (code === 'KeyP' || code === 'Escape') {
    if (screen === 'help') { closeHelp(); return; } // r15 И12: туда, откуда открыта
    if (screen === 'match' || screen === 'paused') togglePause();
    return;
  }
  if (screen !== 'match') return;
  if (code === 'Space' || code === 'KeyJ') input.attackPressed = true;
  if (code === 'KeyR' || code === 'ShiftLeft' || code === 'ShiftRight') input.specialPressed = true;
  if (code === 'KeyF') input.pickaxePressed = true;
  if (code === 'KeyE') input.cryPressed = true; // раунд 9: "Боевой клич"; K->E — утренняя правка основателя
  if (code === 'KeyQ') tryUpgrade();
  // Стадия 2 (баг-репорт): выкуп героя был только мышью — единственное
  // действие боя, требующее отвлечься от клавиатуры в самый горячий момент.
  if (code === 'KeyB') tryBuyback();
  if (code === 'KeyV') tryVolley();
  if (code === 'KeyT') tryAgeUp();
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(code)) {
    const n = code.slice(-1);
    const id = match.unlockedUnits.find(u => UNIT_TYPES[u].hotkey === n);
    if (id) tryBuyUnit(id);
  }
}
function computeMoveAxis() {
  let a = 0;
  if (keysDown.has('ArrowLeft') || keysDown.has('KeyA')) a -= 1;
  if (keysDown.has('ArrowRight') || keysDown.has('KeyD')) a += 1;
  return a + touchAxis;
}

// touch joystick
let touchAxis = 0;
let joyTouchId = null;
DOM.joyBase.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0]; joyTouchId = t.identifier; updateJoy(t);
  e.preventDefault();
}, { passive: false });
DOM.joyBase.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) if (t.identifier === joyTouchId) updateJoy(t);
  e.preventDefault();
}, { passive: false });
window.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) if (t.identifier === joyTouchId) { joyTouchId = null; touchAxis = 0; DOM.joyStick.style.transform = 'translate(-50%,-50%)'; }
});
function updateJoy(t) {
  const rect = DOM.joyBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  let dx = (t.clientX - cx) / (rect.width / 2);
  dx = Math.max(-1, Math.min(1, dx));
  touchAxis = Math.abs(dx) > 0.15 ? dx : 0;
  DOM.joyStick.style.transform = `translate(calc(-50% + ${dx * rect.width * 0.28}px),-50%)`;
}
DOM.touchAttack.addEventListener('touchstart', (e) => { input.attackPressed = true; e.preventDefault(); }, { passive: false });
DOM.touchSpecial.addEventListener('touchstart', (e) => { input.specialPressed = true; e.preventDefault(); }, { passive: false });
DOM.touchPickaxe.addEventListener('touchstart', (e) => { input.pickaxePressed = true; e.preventDefault(); }, { passive: false });
DOM.touchCry.addEventListener('touchstart', (e) => { input.cryPressed = true; e.preventDefault(); }, { passive: false });

// ---------------------------------------------------------------- main loop
let lastTime = performance.now();
const STEP = 1 / 60;
let acc = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (helpTipEl && screen !== 'match') hideHelpTip(); // r15 И11: тост помощи — только в бою
  // Реклама за вознаграждение (Яндекс/VK) обязана ставить игровой процесс
  // на паузу, пока показывается (требования площадок, п.4.7) — см.
  // PLATFORM.setPauseHooks() выше.
  // pageHidden — та же пауза цикла, что и на рекламе (см. onVisibilityChange
  // выше): фоновая вкладка не должна досчитывать бой/анимации, пока
  // невидима игроку (модерация, п.1.3).
  if (adPlaying || pageHidden) { requestAnimationFrame(frame); return; }
  if (screen === 'match') {
    // Раунд 15 (И4): хит-стоп — логика стоит (время в acc не копится),
    // рендер идёт; фиксированный шаг и паузы площадок не затрагиваются.
    if (hitStopT > 0) hitStopT = Math.max(0, hitStopT - dt);
    else acc += dt;
    // Финал боя — замедление ~0.3x: шаг симуляции меньше, число шагов в
    // секунду то же (движение плавное, без «слайд-шоу» на 18 шагах в секунду).
    const timeScale = (match && match.finale) ? finaleTimeScale(match.finale) : 1;
    while (acc >= STEP) { update(STEP * timeScale); acc -= STEP; }
    render();
    if (match && match.finale) tickFinale(dt);
  } else if (screen === 'result' && match) {
    // Экран итога (раунд 5-7): фон не статичен — флаг/день-ночь продолжают
    // жить, юниты-победители радуются (см. render(), unit-цикл); частицы
    // должны и здесь стареть/двигаться, а не застывать первым кадром.
    match.resultElapsed += dt;
    updateParticles(match, dt);
    if (lastResult === 'win') {
      match.resultParticleAcc = (match.resultParticleAcc || 0) + dt;
      if (match.resultParticleAcc >= 1.1) {
        match.resultParticleAcc = 0;
        const celebrants = match.world.units.filter(u => u.team === 'player' && u.state !== 'dead');
        const around = celebrants.length ? celebrants[Math.floor(Math.random() * celebrants.length)].x : match.world.playerCore.x;
        spawnParticles(match, around, -18, '#f2c94c', 5);
      }
    }
    render();
  }
  Tutorial.tick(match, screen, dt); // раунд 15 (И4): стрелки туториала миссии 1
  requestAnimationFrame(frame);
}
const INTRO_COUNTDOWN_SEC = 1.5; // раунд 15 (И4): отсчёт первого захода «3-2-1» — 1.5 с вместо 3

// Башни и капкан — покупки из магазина (см. ПЛАН.md, раунд 3), защита
// базы игрока: башни стреляют по ближайшему врагу в радиусе, капкан бьёт
// раз в cooldownMax секунд того, кто на нём стоит.
function updateTowers(dt, onKillGold) {
  const w = match.world;
  for (const tw of w.towers) {
    tw.fireFlash = Math.max(0, (tw.fireFlash || 0) - dt * 3);
    tw.timer -= dt;
    if (tw.timer > 0) continue;
    let best = null, bestD = Infinity;
    for (const u of w.units) {
      if (u.team !== 'enemy' || u.state === 'dead') continue;
      const d = Math.abs(u.x - tw.x);
      if (d <= tw.range && d < bestD) { best = u; bestD = d; }
    }
    if (best) {
      tw.timer = tw.atkInterval;
      tw.fireFlash = 1;
      w.projectiles.push({
        team: 'player', x: tw.x, y: -50, targetKind: 'unit', targetRef: best,
        vx: (best.x > tw.x ? 1 : -1) * 420, dmg: tw.dmg,
      });
      SFX.shoot();
    } else {
      tw.timer = 0.25;
    }
  }
}
// Вражеские башни (раунд 5, баф базы по HP% при 40%/30%) — зеркало
// updateTowers, но по игроку: собственного капкана/HP-запаса у них нет,
// их не может разрушить «раб» (тот атакует только постройки игрока).
function updateEnemyTowers(dt) {
  const w = match.world;
  for (const tw of w.enemyTowers) {
    tw.fireFlash = Math.max(0, (tw.fireFlash || 0) - dt * 3);
    tw.timer -= dt;
    if (tw.timer > 0) continue;
    let best = null, bestD = Infinity;
    for (const u of w.units) {
      if (u.team !== 'player' || u.state === 'dead') continue;
      const d = Math.abs(u.x - tw.x);
      if (d <= tw.range && d < bestD) { best = u; bestD = d; }
    }
    if (best) {
      tw.timer = tw.atkInterval;
      tw.fireFlash = 1;
      w.projectiles.push({
        team: 'enemy', x: tw.x, y: -50, targetKind: 'unit', targetRef: best,
        vx: (best.x > tw.x ? 1 : -1) * 420, dmg: tw.dmg * (w.enemyTowerDmgMult || 1), // r15 И15: овертайм — башни слабее
      });
      SFX.shoot();
    } else {
      tw.timer = 0.25;
    }
  }
}
// Капканы (раунд 8: массив, не одиночный — см. SHOP.trap2, второй капкан).
function updateTrap(dt, onKillGold) {
  for (const trap of match.world.traps) {
    trap.cooldown = Math.max(0, trap.cooldown - dt);
    if (trap.cooldown > 0) continue;
    for (const u of match.world.units) {
      if (u.team !== 'enemy' || u.state === 'dead') continue;
      if (Math.abs(u.x - trap.x) <= trap.range) {
        dealDamage(match.world, { kind: 'unit', ref: u }, trap.dmg, onKillGold, 'trap');
        trap.cooldown = trap.cooldownMax;
        spawnParticles(match, u.x, -4, '#8a6a45', 6);
        break;
      }
    }
  }
}

// r15 И15 (куратор №5: «м3 у небрежного игрока 6,5 мин, крепость врага ~2 мин
// стоит на 161 HP; в м4 90 с на 452»). Каждый кадр боя из update():
//  • «стена» крепости игрока — пополнение лимита урона и урон/с за окно
//    (entities.js updateFortGuard; world.fortHitAt/fortHitDps — для HUD, И16);
//  • овертайм: после OVERTIME.atSec с крепость врага «сдаёт» — урон по ней
//    ×1.5, башни её ответа ×0.5, баннер «Final assault!» (hud.overtime) тем же
//    механизмом, что «Новая эра» (drawAgeBanner, золотой — событие в пользу игрока);
//  • огненный след «налётчиков» м1 (entities.js updateRaider).
// r15 И21 (куратор №8: «своя крепость держится на 1–5 % HP до 85 с»):
// «последний рубеж» — ниже LAST_STAND.hpFrac HP лимит FORT_GUARD снят
// (w.lastStand → entities.js fortGuardAbsorb), и под давлением врага
// крепость сама теряет hpFrac × макс. HP за sec с: от 10 % до поражения —
// не дольше ~15 с давления. Давление — удар по крепости за pressureSec с или
// хоть один живой враг на поле; поле чисто — отсчёт стоит. Первый вариант
// (враг ближе 400 px к стене) оставлял агонию до 104 с: игрок отгонял
// врага за середину поля, и крепость висела на 1 % (tmp/i21, стратегия
// panic). Сигнал — тост «Последний рубеж!» (updateFortAlert).
function updateLastStand(dt) {
  const w = match.world, core = w.playerCore, L = LAST_STAND;
  if (match.resolved || core.hp <= 0) return;
  if (!w.lastStand) {
    if (core.hp >= core.maxHp * L.hpFrac) return;
    w.lastStand = true;
    match.lastStandAt = match.elapsed;
  }
  const hitRecently = match.elapsed - (w.fortHitAt === undefined ? -Infinity : w.fortHitAt) <= L.pressureSec;
  const pressed = hitRecently || w.units.some(u => u.team === 'enemy' && u.state !== 'dead');
  if (!pressed) return;
  match.lastStandT = (match.lastStandT || 0) + dt;
  core.hp = Math.max(0, core.hp - core.maxHp * L.hpFrac / L.sec * dt);
  if (core.hp <= 0) w.onCoreDestroyed && w.onCoreDestroyed(core);
}
function updateI15(dt) {
  const w = match.world;
  updateFortGuard(w, dt, match.elapsed);
  updateLastStand(dt); // r15 И21
  // r15 И17 (куратор №6: «пассивно м1 — 5 мин, м2 — 9 мин, крепость врага 4+ мин
  // на 100 %»): овертайм и раньше 180 с — если HP крепости врага не менялось
  // OVERTIME_STALL.stallSec с подряд (любой урон по ней сбрасывает счёт).
  if (match.eCoreSeenHp !== w.enemyCore.hp) { match.eCoreSeenHp = w.enemyCore.hp; match.eCoreStillT = 0; }
  else match.eCoreStillT = (match.eCoreStillT || 0) + dt;
  // r15 И19 (куратор №7: «патовые бои 3–7 минут»): анти-пат. Урон «в бою» —
  // изменение HP любой крепости с прошлого кадра (горение овертайма ниже
  // вычитается после замера и пат не сбрасывает). STALL_ESC.assaultSec с без
  // урона — враг идёт на штурм (ai.js launchStallAssault), ещё overtimeSec —
  // овертайм.
  // Отсчёт — с graceSec: первая встреча армий в начале боя — не пат.
  if (match.pCoreSeenHp !== undefined && (match.pCoreSeenHp !== w.playerCore.hp || match.eCoreHitSeen !== w.enemyCore.hp)) match.lastFortDmgT = match.elapsed;
  const stallT = match.elapsed - (match.lastFortDmgT === undefined ? STALL_ESC.graceSec : match.lastFortDmgT);
  if (stallT >= STALL_ESC.assaultSec && match.elapsed - (match.escAssaultT === undefined ? -1e9 : match.escAssaultT) >= STALL_ESC.repeatSec) {
    if (launchStallAssault(w, match.ai, match.mission)) {
      match.escAssaultT = match.elapsed;
      if (match.escAt === undefined) match.escAt = match.elapsed;
    }
  }
  const stallNow = stallT >= STALL_ESC.assaultSec + STALL_ESC.overtimeSec;
  if (!match.overtime && (match.elapsed >= OVERTIME.atSec || match.eCoreStillT >= OVERTIME_STALL.stallSec || stallNow)) {
    match.overtime = true;
    w.overtime = true; // ai.js: враг «сдаёт» и в закупке
    match.overtimeAt = match.elapsed;
    w.enemyCoreDmgTakenMult = OVERTIME.enemyCoreDmgMult;
    w.enemyTowerDmgMult = OVERTIME.enemyTowerDmgMult;
    match.ageBanner = { text: I18N.t('hud.overtime'), t: 0, life: OVERTIME.bannerSec, own: true };
    match.ageFlash = 0.6;
    shakeScreen(match, 4);
    SFX.heroSpecial();
  }
  // r15 И19: настоящий пат (ни одна крепость не получала урона assaultSec +
  // overtimeSec с) — «патовый овертайм» до конца боя: урон по ОБЕИМ крепостям
  // растёт (+step каждые everySec) и обе «горят» (OVERTIME_RAMP); своя — через
  // лимит FORT_GUARD, без обхода. Обычный овертайм (180 с / крепость врага
  // не тронута 90 с) — как в И17: сдаёт только крепость врага.
  // С OVERTIME_RAMP.hardSec — тот же режим в любом бою («развязка»), и рост
  // ускоряется (+hardStep каждые everySec): бой не тянется дольше ~5 минут.
  if ((stallNow || match.elapsed >= OVERTIME_RAMP.hardSec) && match.stallOTAt === undefined) {
    match.stallOTAt = match.elapsed;
    match.otBasePlayerMult = w.playerCoreDmgMult || 1;
  }
  if (match.stallOTAt !== undefined) {
    const R = OVERTIME_RAMP;
    const ramp = 1 + R.step * Math.floor((match.elapsed - match.stallOTAt) / R.everySec)
      + (match.elapsed >= R.hardSec ? R.hardStep * Math.floor((match.elapsed - R.hardSec) / R.everySec) : 0);
    w.enemyCoreDmgTakenMult = OVERTIME.enemyCoreDmgMult * ramp;
    w.playerCoreDmgMult = match.otBasePlayerMult * (1 + (ramp - 1) * R.playerBurnMult); // своя «сдаёт» медленнее
    match.otRamp = ramp;
    const burnE = w.enemyCore.maxHp * R.burnPerSec * ramp * dt;
    if (w.enemyCore.hp > 0 && !(w.enemyCore.invulnerable > 0)) {
      w.enemyCore.hp = Math.max(0, w.enemyCore.hp - burnE);
      if (w.enemyCore.hp <= 0) w.onCoreDestroyed && w.onCoreDestroyed(w.enemyCore);
    }
    const burnP = w.playerCore.maxHp * R.burnPerSec * R.playerBurnMult * ramp * dt;
    if (w.playerCore.hp > 0 && !match.resolved) {
      const ok = w.fortGuard ? Math.min(burnP, Math.max(0, w.fortGuard.budget)) : burnP;
      if (w.fortGuard) w.fortGuard.budget -= ok;
      w.playerCore.hp = Math.max(0, w.playerCore.hp - ok);
      if (w.playerCore.hp <= 0) w.onCoreDestroyed && w.onCoreDestroyed(w.playerCore);
    }
  }
  // r15 И19: крепость врага ниже FINISH_ONE_HIT «рушится сама» (FINISH_CRUMBLE
  // доли HP в секунду, после щита последнего рубежа) — бой не висит минутами на
  // 4 % HP, пока натиск врага отбрасывает армию игрока от ворот.
  if (w.enemyCore.hp > 0 && w.enemyCore.hp < w.enemyCore.maxHp * FINISH_ONE_HIT && !(w.enemyCore.invulnerable > 0) && !match.resolved) {
    w.enemyCore.hp = Math.max(0, w.enemyCore.hp - w.enemyCore.maxHp * FINISH_CRUMBLE * dt);
    if (w.enemyCore.hp <= 0) w.onCoreDestroyed && w.onCoreDestroyed(w.enemyCore);
  }
  match.pCoreSeenHp = w.playerCore.hp;
  match.eCoreHitSeen = w.enemyCore.hp;
  match.raidFxT = (match.raidFxT || 0) - dt;
  if (match.raidFxT <= 0) {
    match.raidFxT = 0.12;
    for (const u of w.units) {
      if (u.raid && u.state !== 'dead') VFX.burst(match, 'ember', u.x, -30 * VIEW.fig, 2, { speed: 40, spread: Math.PI * 0.6, dir: -Math.PI / 2, life: 0.6, size: 2.2, colors: ART.spark, gravity: 0, jitter: 6 });
    }
  }
}

function update(dt) {
  // Отсчёт 3…2…1 перед первым заходом новичка (раунд 5) — бой и экономика
  // заморожены, рендер продолжается (см. frame()), отсчёт идёт в реальном
  // времени. Раунд 15 (И4): «3-2-1» за INTRO_COUNTDOWN_SEC (1.5 с), по
  // окончании туториал миссии 1 сам показывает первый шаг (js/tutorial.js).
  if (match.countdown > 0) {
    match.countdown -= dt;
    if (match.countdown > 0) {
      const n = String(Math.ceil(match.countdown / INTRO_COUNTDOWN_SEC * 3));
      if (DOM.countdownNum.textContent !== n) {
        DOM.countdownNum.textContent = n;
        DOM.countdownNum.style.animation = 'none'; void DOM.countdownNum.offsetWidth; DOM.countdownNum.style.animation = ''; // «пружина» на каждой цифре
      }
    } else {
      DOM.countdownOverlay.classList.add('hidden');
    }
    return;
  }

  match.elapsed += dt;
  input.moveAxis = computeMoveAxis();
  if (match.helpTip) tickHelpTip(dt); // r15 И11: тост помощи после поражений

  const onKillGold = (team, amount) => {
    if (team === 'player') {
      match.gold += amount;
      // Валюта «очко» — награда за килл убывает по времени матча
      // (раунд 5, см. data.js: DIAMOND_DECAY/diamondMultAt).
      match.shopKills += diamondMultAt(match.elapsed);
    } else match.ai.gold += amount;
  };

  match.incomeAcc += dt;
  const rate = currentIncomeRate();
  while (match.incomeAcc >= ECONOMY.incomeTickSec) {
    match.incomeAcc -= ECONOMY.incomeTickSec;
    match.gold += rate;
  }

  for (const c of match.clouds) {
    c.x += c.speed * dt;
    if (c.x > ARENA.width + 90) c.x = -90;
  }

  if (match.world.enemyCore.invulnerable > 0) {
    match.world.enemyCore.invulnerable = Math.max(0, match.world.enemyCore.invulnerable - dt);
  }

  updateI15(dt); // r15 И15: «стена» крепости, овертайм, след «налётчиков»
  updateUnits(match.world, dt, onKillGold);
  softStartHeroGuard(match.world, match.ai, input, dt); // И8: мягкий старт м1 — брошенный герой отбивается сам
  updateHero(match.world, dt, input, onKillGold);
  // И8: мягкий старт миссии 1 — время врага 0 (ворота) → rampFrom…1 (ai.js).
  updateEnemyAI(match.world, match.ai, match.mission, dt * updateSoftStart(match.world, match.ai, dt), match.gold);
  updateEnemyBaseBuffs(match);
  updateTowers(dt, onKillGold);
  updateEnemyTowers(dt);
  updateTrap(dt, onKillGold);
  updateR15(dt, onKillGold); // раунд 15: «Залп», надпись смены эпохи
  updateParticles(match, dt);
  updateShake(match, dt);
  if (match.farmPulse > 0) match.farmPulse = Math.max(0, match.farmPulse - dt * 2.2);
  if (match.goldHoardFlash > 0) match.goldHoardFlash = Math.max(0, match.goldHoardFlash - dt);
  updateMusicMix(match, dt);
  updateHud();

  input.attackPressed = false;
  input.specialPressed = false;
  input.pickaxePressed = false;
  input.cryPressed = false;
}

// Цикл дня/ночи ~2 минуты: солнце идёт по дуге и садится, восходит луна —
// см. ПЛАН.md, раунд 3, «мир живее».
const DAY_CYCLE_SEC = 120;
function computeDayNight(elapsed) {
  // Косметика из магазина отключает цикл целиком (см. ПЛАН.md, раунд 3).
  if (progress.cosmeticTime === 'day') return { sunUp: true, localT: 0.5, alt: 1, light: 1 };
  if (progress.cosmeticTime === 'night') return { sunUp: false, localT: 0.5, alt: 1, light: 0.15 };
  const t = (elapsed % DAY_CYCLE_SEC) / DAY_CYCLE_SEC;
  const sunUp = t < 0.5;
  const localT = sunUp ? t / 0.5 : (t - 0.5) / 0.5;
  const alt = Math.sin(Math.PI * localT); // 0..1 — высота дуги
  // Раунд 14: дневная фаза не проваливается в полумрак у горизонта — на
  // старте матча (elapsed≈0) солнце как раз у горизонта, и при light=alt
  // арена в первые секунды была затемнена на 50% синеватой плёнкой, а
  // закат обложки — тёплый и светлый. Ночь (лунная фаза) не менялась.
  const light = sunUp ? 0.45 + 0.55 * alt : alt * 0.15; // лунный свет много слабее
  return { sunUp, localT, alt, light };
}

// ---------------------------------------------------------------- render
function render() {
  const age = match.age;
  // На экране итога (раунд 5) день/ночь и ветер продолжают идти по
  // resultElapsed, пока match.elapsed заморожен на моменте конца боя —
  // фон не превращается в статичный кадр (см. frame()).
  const displayElapsed = match.elapsed + (match.resultElapsed || 0);
  // И7: вариант фона миссии — рельеф/декор/оттенок неба и стартовая фаза суток.
  const bgVar = match.bgVariant || (match.bgVariant = bgVariantOf(match.mission));
  const dn = computeDayNight(displayElapsed + bgVar.dayT * DAY_CYCLE_SEC);
  // Статичные слои — из кэша bakeArenaBackground (эпоха + вариант + размер кадра):
  // небо → солнце/луна → облака → горы+земля → мошки → ночное затемнение.
  // Раунд 15 (И1): смена эпохи в бою — кроссфейд со слоем прошлой эпохи,
  // следующие эпохи миссии прогреваются заранее (prewarmAgeBackgrounds).
  const nowMs = performance.now();
  if (!match.bg || match.bg.ageId !== age.id || match.bg.rev !== VIEW.rev) {
    const ageChanged = match.bg && match.bg.ageId !== age.id && match.bg.rev === VIEW.rev;
    match.bgPrev = ageChanged ? match.bg : null;
    match.bgFadeT0 = nowMs;
    match.bg = bakeArenaBackground(age, bgVar);
    if (!match.bgWarmed) { match.bgWarmed = true; prewarmAgeBackgrounds(match.mission); }
  }
  const fadeA = match.bgPrev ? 1 - (nowMs - match.bgFadeT0) / 800 : 0;
  if (fadeA <= 0) match.bgPrev = null;
  ctx.save();
  ctx.translate(match.shake.x, match.shake.y);
  drawBgLayer(match.bg, 'sky', 1);
  drawBgLayer(match.bgPrev, 'sky', fadeA);
  // солнце/луна по дуге неба; ореол у горизонта — большой и тёплый
  drawSunMoon(age, dn);
  // облака — между солнцем и горами, дрейфуют по ветру
  drawHighClouds(displayElapsed);
  for (const c of match.clouds) drawCloud(c.x, c.y, c.scale);

  drawBgLayer(match.bg, 'land', 1);
  drawBgLayer(match.bgPrev, 'land', fadeA);
  drawMotes(age, displayElapsed);

  // ночное затемнение — только фон/окружение (постройки, юниты и HUD
  // рисуются после и остаются читаемыми в любое время суток), синеватое
  drawNightShade(dn);

  const fortTrans = match.fortTrans || {}; // И6: перестройка крепости при смене эпохи
  drawCore(match.world.playerCore, 1, age, fortTrans.player);
  drawCore(match.world.enemyCore, -1, match.enemyAge || age, fortTrans.enemy); // раунд 15 (И2): своя эпоха врага
  drawFarm(16, match.incomeLevel, match.farmPulse, age, currentIncomeRate()); // r15 И12: плашка «+доход/с»
  for (const tw of match.world.towers) drawTower(tw);
  for (const tw of match.world.enemyTowers) drawTower(tw);
  for (const tr of match.world.traps) drawTrap(tr);

  // Раунд 14: снаряды со своей формой и дугой полёта (vfx.js), не жёлтые
  // капли; юниты — свои светлые, враги чёрные силуэты (ART, решение
  // основателя 2026-09-19), время — для дыхания в покое и пульса ауры.
  // Раунд 15 (И2): снаряд — в эпохе своей стороны (эпохи игрока и врага в бою могут различаться).
  const teamAgeOf = (team) => (team === 'player' ? age : (match.enemyAge || age));
  for (const p of match.world.projectiles) VFX.drawProjectile(ctx, p, teamAgeOf(p.team), ARENA.groundY);

  const celebrate = (screen === 'result' || (match.finale && match.finale.t > 0.4)) && lastResult === 'win'; // И4: танец уже в «добивании»
  const poseTime = match.elapsed + (match.resultElapsed || 0);
  // Раунд 15 (И6): тела — отдельный список match.corpses. Логика убирает
  // юнита из world.units через 0.6 с, а тело должно упасть (одна из трёх
  // поз), полежать и осесть/раствориться за DEATH_TOTAL (rig.js). Часы —
  // poseTime: замедление финала и хит-стоп действуют и на тела; на экране
  // итога (идёт resultElapsed) тела растворяются, а не застывают в позах.
  const corpses = match.corpses || (match.corpses = []);
  for (const u of match.world.units) {
    if (u.state !== 'dead' || u.corpseT0 !== undefined) continue;
    u.corpseT0 = poseTime;
    const r = u.lastHitRole;
    u.deathKind = (r === 'heavy' || r === 'hero' || r === 'hero_special' || r === 'breaker' || r === 'volley') ? 'fly' : (u.id % 2 ? 'knees' : 'back');
    corpses.push(u);
  }
  if (corpses.length) match.corpses = corpses.filter(u => poseTime - u.corpseT0 < DEATH_TOTAL);
  const drawUnitFigure = (u, deathSec) => {
    const t = UNIT_TYPES[u.typeId];
    // И6: волна «переодевания» — до своего момента юнит в старой эпохе
    const dressing = u.dressT0 !== undefined && poseTime < u.dressT0 && u.dressFrom;
    const sideAge = dressing ? AGES[u.dressFrom] : teamAgeOf(u.team);
    if (u.dressT0 !== undefined && !dressing && !u.dressFx && deathSec === null) { u.dressFx = true; VFX.dressUp(match, u.x, u.team === 'player'); }
    const weapon = sideAge.weapon[t.role] || null; // раунд 15 (И2): силуэт в эпохе стороны
    const attackPhase = u.state === 'attack' ? (1 - Math.max(0, u.attackTimer) / t.atkInterval) : null;
    const dead = deathSec !== null;
    const cheer = celebrate && u.team === 'player' && !dead;
    const enemy = u.team !== 'player';
    const lane = u.lane === undefined ? 1 : u.lane; // И9: ряд по глубине (UNIT_LANES)
    const commonPose = {
      x: u.x + (u.knockback || 0), y: ARENA.groundY + UNIT_LANES.dy[lane],
      // И6: тяжёлый — массивнее (только рисунок, хитбокс прежний)
      scale: (u.elite ? 1.35 : 1) * (t.heightMult || 1) * (t.role === 'heavy' ? 1.12 : 1) * UNIT_LANES.scale[lane] * VIEW.fig, // И5: крупный план на широком кадре
      color: enemy ? ART.enemy.fill : ART.player.fill,
      outline: enemy ? (u.elite ? ART.enemy.eliteOutline : ART.enemy.outline) : ART.player.outline,
      enemy, elite: !!u.elite, buffed: u.buffTimer > 0, time: poseTime + (u.id % 7) * 0.9,
      facing: u.dir,
      walkPhase: cheer ? match.resultElapsed * 6 : u.walkPhase,
      moving: cheer ? true : (!dead && u.state === 'walk'),
      attackPhase: dead ? null : attackPhase, deathSec, deathKind: u.deathKind || 'back', hitFlash: dead ? 0 : u.hitFlash, cheer,
      roleAccent: ROLE_ACCENT[t.role], shade: u.id % 2, // И20: тон тела врага чередуется в строю
      // И6: костюм «роль × эпоха» и вспышка «переодевания» при смене эпохи
      ageId: sideAge.id, outfit: ENEMY_SPECIAL_TYPES[u.typeId] ? u.typeId : t.role,
      dressFlash: (u.dressT0 !== undefined && !dressing) ? Math.max(0, 1 - (poseTime - u.dressT0) / 0.55) : 0,
    };
    if (t.role === 'rider') {
      drawRiderPair(ctx, commonPose);
    } else if (t.role === 'breaker') {
      drawStickman(ctx, {
        ...commonPose, weapon: null, bent: !cheer, chainBall: true,
        chainLag: u.chainLag, chainTaut: u.chainTaut,
      });
    } else {
      // Щитоносец — ростовой щит из костюма (ART.costume, shieldbearer).
      drawStickman(ctx, { ...commonPose, weapon: cheer ? null : weapon });
    }
  };
  // И6: в толпе (>28 фигур) — упрощённая детализация костюмов (RIG_LOD, rig.js)
  RIG_LOD.lite = match.world.units.length + match.corpses.length > 28;
  // И9: порядок по глубине — тела (лежат на земле) по рядам, затем живые по
  // рядам, дальний ряд раньше; герой — в своём ряду (UNIT_LANES.heroLane),
  // бойцы ближнего ряда проходят перед ним. Сортировка стабильна.
  const laneOf = (u) => (u.lane === undefined ? 1 : u.lane);
  const byLane = (a, b) => laneOf(a) - laneOf(b);
  for (const u of match.corpses.slice().sort(byLane)) drawUnitFigure(u, poseTime - u.corpseT0);
  const living = match.world.units.filter(u => u.state !== 'dead').sort(byLane);
  let li = 0;
  for (; li < living.length && laneOf(living[li]) <= UNIT_LANES.heroLane; li++) drawUnitFigure(living[li], null);
  RIG_LOD.lite = false;
  drawHeroFigure();
  RIG_LOD.lite = living.length + match.corpses.length > 28;
  for (; li < living.length; li++) drawUnitFigure(living[li], null);
  RIG_LOD.lite = false;
  function drawHeroFigure() {
  const hero = match.world.hero;
  if (hero.alive) {
    drawStickman(ctx, {
      ageId: age.id, outfit: 'hero', // И6: корона/шлем и доспех героя по эпохе
      dressFlash: match.heroDressT0 !== undefined ? Math.max(0, 1 - (poseTime - match.heroDressT0) / 0.55) : 0,
      // Раунд 15 (И1): герой крупнее своих, золотой ореол и маркер над головой.
      x: hero.x + (hero.knockback || 0), y: ARENA.groundY + UNIT_LANES.dy[UNIT_LANES.heroLane], scale: 1.2 * VIEW.fig, marker: true, // И9: ряд героя
      color: ART.hero.fill, outline: ART.hero.outline, facing: hero.facing,
      walkPhase: hero.walkPhase, moving: hero.moving,
      attackPhase: hero.attackAnimT, attackProfile: 'hero', time: poseTime,
      digPhase: hero.pickaxeAnimT,
      hitFlash: hero.hitFlash,
      weapon: age.weapon.melee,
      hero: true,
      // Визуал прокачки (раунд 8) — тир снаряжения из магазина красит
      // экипировку прямо на модели (бронза/серебро/золото).
      gearSwordTier: progress.gearSword, gearShieldTier: progress.gearShield, gearArmorTier: progress.gearArmor,
      cloak: !!progress.ownedCloakRed, cloakFlareT: hero.cloakFlareT || 0,
    });
    // Кольцо спец-удара — теперь ударная волна из vfx.js (world.onHeroSpecial).
  }
  }

  // Частицы и всплывающие «+N» — p.y хранится как смещение от линии земли
  // (не абсолютная канвас-координата — баг раунда 3, см. историю).
  VFX.draw(ctx, match, ARENA.groundY);
  // Раунд 15 (И2): «Залп» (снаряды и метка участка) и надпись смены эпохи.
  VFX.drawVolley(ctx, match.world, ARENA.groundY);
  drawAgeBanner();

  ctx.restore();
}

// Постройки «под обложку» (раунд 14, ТЗ_ВИЗУАЛ_ПОД_ОБЛОЖКУ.md): дерево и
// камень из палитры эпохи (AGES.woodLight/woodDark/stone), тёмные щели,
// тёплые блики. Здание апгрейда дохода — хижина, растёт с уровнем, при
// покупке подскакивает (фидбэк основателя, раунд 3: доход должен быть
// виден на поле, не только числом в HUD). Стоит у подножия холма
// крепости (x=16), левее частокола — на холме её закрыла бы стена.
function drawFarm(x, level, pulse, age, income) {
  const inMenu = income === undefined; // сцена меню (r15 И14: без плашки дохода)
  const bounce = pulse > 0 ? Math.sin(pulse * Math.PI) * 5 : 0;
  const lvl = Math.min(level, 6);
  const h = 14 + lvl * 4 + bounce;
  const w = 10 + Math.min(lvl, 4);
  ctx.save();
  ctx.translate(x, ARENA.groundY);
  ctx.fillStyle = age.woodLight; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.rect(-w, -h, w * 2, h); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1;
  for (let ly = -h + 4; ly < -3; ly += 4) { ctx.beginPath(); ctx.moveTo(-w + 1, ly); ctx.lineTo(w - 1, ly); ctx.stroke(); }
  ctx.fillStyle = '#1a100a'; ctx.fillRect(-3, -9, 6, 9);
  const peak = h + 9 + Math.min(lvl, 4) * 1.5;
  ctx.fillStyle = age.woodDark; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-w - 4, -h); ctx.lineTo(0, -peak); ctx.lineTo(w + 4, -h); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,190,.16)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-w - 3, -h - 1); ctx.lineTo(-1, -peak + 2); ctx.stroke();
  // труба и дымок — доход «работает»
  ctx.fillStyle = age.stone; ctx.fillRect(w - 6, -h - 9, 4, 9);
  drawSmoke(w - 4, -h - 10, performance.now(), 2, 'rgba(216,208,200,.3)', 0.5);
  ctx.restore();
  // r15 И14 (куратор №4: «в меню висит плашка фермы „+10“ — хвост боевого
  // HUD»): плашка дохода — только в бою; сцена меню зовёт drawFarm без income.
  if (!inMenu) drawFarmBadge(x, ARENA.groundY - peak + 1, income, pulse);
}
// r15 И12 (куратор №3: «домик с „0/2“ у левой крепости ~10px, непонятно»):
// вместо таблички уровня 7px (≈5.6px на экране 800×450) — плашка над
// крышей: монета + доход в секунду («+6»), шрифт не мельче FARM_LABEL_MIN
// экранных px при любом масштабе камеры (VIEW.k). Плашка не выходит за
// левый край кадра.
const FARM_LABEL_MIN = 13;
function farmLabelPx() { return Math.max(9, FARM_LABEL_MIN / (VIEW.k || 1)); }
function drawFarmBadge(cx, bottomY, income, pulse) {
  const fs = farmLabelPx();
  const text = '+' + Math.round(income);
  ctx.save();
  ctx.font = `${fs.toFixed(1)}px 'Lilita One', 'Fredoka', sans-serif`;
  const tw = ctx.measureText(text).width;
  const r = fs * 0.5;                 // радиус монеты
  const padX = fs * 0.35, gap = fs * 0.25;
  const bw = padX * 2 + r * 2 + gap + tw, bh = fs * 1.35;
  const left = Math.max(VIEW.x0 + 3, cx - bw / 2);
  const top = bottomY - bh - (pulse > 0 ? Math.sin(pulse * Math.PI) * 4 : 0);
  ctx.fillStyle = 'rgba(26,18,10,.78)'; ctx.strokeStyle = 'rgba(255,215,122,.75)'; ctx.lineWidth = Math.max(1, fs * 0.09);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(left, top, bw, bh, bh / 2); else ctx.rect(left, top, bw, bh);
  ctx.fill(); ctx.stroke();
  // монета
  const ccx = left + padX + r, ccy = top + bh / 2;
  const g = ctx.createRadialGradient(ccx - r * 0.3, ccy - r * 0.35, r * 0.1, ccx, ccy, r);
  g.addColorStop(0, '#fff6d0'); g.addColorStop(0.45, '#f2c14a'); g.addColorStop(1, '#c8821e');
  ctx.fillStyle = g; ctx.strokeStyle = '#1a120a'; ctx.lineWidth = Math.max(1, fs * 0.1);
  ctx.beginPath(); ctx.arc(ccx, ccy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // число
  ctx.fillStyle = '#ffd77a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, ccx + r + gap, ccy + fs * 0.04);
  ctx.restore();
}

// Башня лучника — покупка магазина (ПЛАН.md, раунд 3): вышка в стиле
// сторожевой башни крепости — столбы с перекрестьем, открытая площадка с
// перилами и лучник, который натягивает лук (tw.fireFlash — вспышка
// выстрела, см. updateTowers/updateEnemyTowers). Вражеские башни (ai.js)
// рисуются той же функцией — своя/чужая определяется половиной арены
// (все постройки игрока стоят в левой), лучник врага — чёрный силуэт.
function drawTower(tw) {
  const enemy = tw.x > ARENA.width / 2;
  const age = enemy ? (match.enemyAge || match.age) : match.age; // И6: башня в эпохе своей стороны
  const fig = enemy ? ART.enemy : ART.player;
  const face = enemy ? -1 : 1;
  ctx.save();
  ctx.translate(tw.x, ARENA.groundY);
  const top = -50;
  ctx.lineCap = 'round';
  ctx.strokeStyle = age.woodDark; ctx.lineWidth = 4;
  for (const px of [-8, 8]) { ctx.beginPath(); ctx.moveTo(px * 1.4, 0); ctx.lineTo(px, top + 2); ctx.stroke(); }
  ctx.strokeStyle = age.woodLight; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(9, -28); ctx.moveTo(10, -10); ctx.lineTo(-9, -28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-9, -28); ctx.lineTo(9, -28); ctx.stroke();
  // площадка с перилами
  ctx.fillStyle = age.woodLight; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.rect(-14, top - 2, 28, 5); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = age.woodDark; ctx.lineWidth = 2;
  for (const px of [-13, -4.5, 4.5, 13]) { ctx.beginPath(); ctx.moveTo(px, top - 2); ctx.lineTo(px, top - 11); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(-14, top - 11); ctx.lineTo(14, top - 11); ctx.stroke();
  // лучник — тот же силуэтный язык, что у юнитов (ART.player/ART.enemy)
  const flash = tw.fireFlash || 0;
  const base = top - 2;
  ctx.strokeStyle = fig.outline; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(-1, base); ctx.lineTo(-1, base - 12); ctx.stroke();
  ctx.strokeStyle = fig.fill; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-1, base); ctx.lineTo(-1, base - 12); ctx.stroke();
  ctx.fillStyle = fig.fill; ctx.strokeStyle = fig.outline; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(-1, base - 16, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // лук и тетива — натяжение растёт с flash, вспышка у наконечника на выстреле
  const bx = -1 + face * 5;
  ctx.strokeStyle = age.woodLight; ctx.lineWidth = 1.8;
  ctx.beginPath();
  if (face > 0) ctx.arc(bx, base - 9, 6.5, -1.2, 1.2); else ctx.arc(bx, base - 9, 6.5, Math.PI - 1.2, Math.PI + 1.2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(240,230,210,.9)'; ctx.lineWidth = 1;
  const pull = 2 + flash * 5;
  ctx.beginPath(); ctx.moveTo(bx, base - 15.4); ctx.lineTo(bx - face * pull, base - 9); ctx.lineTo(bx, base - 2.6); ctx.stroke();
  if (flash > 0.35) {
    ctx.fillStyle = `rgba(255,240,180,${Math.min(1, flash) * 0.7})`;
    ctx.beginPath(); ctx.arc(bx + face * 8, base - 9, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
// Облака — мягкие, с тёплым оттенком заката: радиальный градиент подложкой
// и три полупрозрачных эллипса (без shadowBlur, та же canvas-геометрия,
// что и остальной визуал — см. 03_АССЕТЫ.md, консистентность).
function drawCloud(x, y, scale) {
  // Раунд 15 (И1): небо стало светлее — облака плотные и белые, с тенью
  // снизу (объём), вместо почти прозрачной дымки раунда 14.
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const puffs = [[0, -4, 13], [-14, 0, 10], [14, -1, 11], [-24, 4, 7], [25, 4, 7], [5, -11, 9]];
  const blob = (dy, grow) => {
    ctx.beginPath();
    for (const [px, py, r] of puffs) { ctx.moveTo(px + r + grow, py + dy); ctx.arc(px, py + dy, r + grow, 0, Math.PI * 2); }
    ctx.rect(-28, dy, 56, 8);
    ctx.fill();
  };
  ctx.fillStyle = 'rgba(190,200,225,.55)'; blob(3, 0.5);
  ctx.fillStyle = 'rgba(255,255,255,.9)'; blob(0, 0);
  ctx.restore();
}
// Капкан — шипы из камня эпохи с тёплым бликом по левой грани.
function drawTrap(trap) {
  const age = match.age;
  ctx.save();
  ctx.translate(trap.x, ARENA.groundY);
  ctx.lineJoin = 'round';
  ctx.fillStyle = mixHex(age.stone, '#ffffff', 0.18); ctx.strokeStyle = age.woodDark; ctx.lineWidth = 1.5;
  for (let i = -10; i <= 10; i += 5) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 2, -10); ctx.lineTo(i + 4, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,230,190,.35)'; ctx.lineWidth = 1;
  for (let i = -10; i <= 10; i += 5) { ctx.beginPath(); ctx.moveTo(i + 0.8, -1); ctx.lineTo(i + 2, -8); ctx.stroke(); }
  ctx.restore();
}
// Дым — клубы, всплывающие по синусоиде и растущие; n клубов в цикле.
function drawSmoke(x, y, now, n, color, speed = 0.35) {
  const t = now / 1000;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const p = (t * speed + i / n) % 1;
    ctx.globalAlpha = (1 - p) * 0.9;
    ctx.beginPath(); ctx.arc(x + Math.sin(t * 1.1 + i * 2.1) * 4 + p * 6, y - p * 30, 2.5 + p * 7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
// Частокол: брёвна с заострёнными верхушками, чередование светлого/тёмного
// дерева, тёплый блик по левой кромке, высоты чуть разные (детерминированно
// по индексу). При HP<60% часть брёвен обломана и по стене идёт трещина.
// bronze — две бронзовые полосы-обруча поперёк стены.
function drawPalisade(age, x0, x1, baseY, top, hpFrac, bronze, flash = 0) {
  const count = 12, pitch = (x1 - x0) / count, lw = pitch - 1;
  const flashPath = flash > 0 ? new Path2D() : null; // r15 И20: вспышка по силуэту кольев
  for (let i = 0; i < count; i++) {
    const lx = x0 + i * pitch;
    const hv = ((i * 7) % 5) - 2;
    const broken = hpFrac < 0.6 && (i === 3 || i === 8 || (hpFrac < 0.4 && i === 5));
    const lt = broken ? top + 20 + ((i * 3) % 6) : top + hv;
    ctx.fillStyle = i % 2 ? age.woodDark : age.woodLight;
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(lx, baseY);
    ctx.lineTo(lx, lt + 5);
    if (broken) { ctx.lineTo(lx + lw * 0.3, lt + 2); ctx.lineTo(lx + lw * 0.6, lt + 6); ctx.lineTo(lx + lw, lt + 3); }
    else ctx.lineTo(lx + lw / 2, lt);
    ctx.lineTo(lx + lw, lt + 5);
    ctx.lineTo(lx + lw, baseY);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (flashPath) {
      flashPath.moveTo(lx, baseY); flashPath.lineTo(lx, lt + 5);
      if (broken) { flashPath.lineTo(lx + lw * 0.3, lt + 2); flashPath.lineTo(lx + lw * 0.6, lt + 6); flashPath.lineTo(lx + lw, lt + 3); }
      else flashPath.lineTo(lx + lw / 2, lt);
      flashPath.lineTo(lx + lw, lt + 5); flashPath.lineTo(lx + lw, baseY); flashPath.closePath();
    }
    ctx.strokeStyle = 'rgba(255,230,190,.16)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx + 1.2, baseY - 1); ctx.lineTo(lx + 1.2, lt + 6); ctx.stroke();
  }
  if (hpFrac < 0.6) {
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x0 + 14, top + 24); ctx.lineTo(x0 + 18, top + 34); ctx.lineTo(x0 + 15, top + 46); ctx.stroke();
  }
  if (bronze) {
    ctx.fillStyle = age.coreAccent; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1;
    for (const fy of [top + 18, top + 38]) { ctx.beginPath(); ctx.rect(x0, fy, x1 - x0 - 2, 3); ctx.fill(); ctx.stroke(); }
  }
  if (flashPath) { ctx.fillStyle = `rgba(255,244,224,${flash * 0.5})`; ctx.fill(flashPath); }
}
// Раунд 15 (И6): каменная стена (бронза, age.masonry — тёсаные блоки с
// тоном, зубцы, бронзовый пояс, бойницы) и кирпичная (железо, age.brick —
// мелкий кирпич, каменный карниз, плоские мерлоны, пушечные порты).
// Повреждения — трещина и выбитые блоки, как раньше.
function drawMasonryWall(age, x0, x1, baseY, top, hpFrac, brick, flash = 0) {
  const base = brick ? age.brick : (age.masonry || age.stone);
  const dark = brick ? age.brickDark : (age.masonryDark || age.woodDark);
  const bodyTop = top + 4;
  ctx.fillStyle = base; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.rect(x0, bodyTop, x1 - x0, baseY - bodyTop); ctx.fill(); ctx.stroke();
  const rowH = brick ? 5 : 9, blk = brick ? 10 : 16;
  // тон блоков — детерминированно по ряду/колонке
  ctx.fillStyle = brick ? hexAlpha(age.brickLight, 0.35) : 'rgba(0,0,0,.07)';
  let row = 0;
  for (let ly = bodyTop + 2; ly < baseY - 1; ly += rowH, row++) {
    const off = row % 2 ? blk / 2 : 0;
    for (let lx = x0 - off, c = 0; lx < x1; lx += blk, c++) {
      if ((row * 3 + c * 5) % 4 === 0) ctx.fillRect(Math.max(x0, lx) + 0.5, ly + 0.5, Math.min(blk, x1 - Math.max(x0, lx)) - 1, rowH - 1);
    }
  }
  ctx.strokeStyle = brick ? hexAlpha(dark, 0.75) : 'rgba(0,0,0,.28)'; ctx.lineWidth = 1;
  ctx.beginPath();
  row = 0;
  for (let ly = bodyTop + 2; ly < baseY - 1; ly += rowH, row++) {
    ctx.moveTo(x0, ly); ctx.lineTo(x1, ly);
    for (let lx = x0 + (row % 2 ? blk / 2 : 0); lx < x1; lx += blk) { ctx.moveTo(lx, ly); ctx.lineTo(lx, Math.min(baseY, ly + rowH)); }
  }
  ctx.stroke();
  // карниз и зубцы
  if (brick) {
    ctx.fillStyle = age.stone; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.rect(x0 - 2, top + 1, x1 - x0 + 4, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = base;
    for (let lx = x0; lx < x1 - 6; lx += 15) { ctx.beginPath(); ctx.rect(lx, top - 7, 10, 8); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = age.stone;
    for (let lx = x0; lx < x1 - 6; lx += 15) ctx.fillRect(lx - 0.5, top - 8.5, 11, 2);
  } else {
    ctx.fillStyle = base; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2;
    for (let lx = x0; lx < x1 - 4; lx += 13) { ctx.beginPath(); ctx.rect(lx, top - 5, 8, 9); ctx.fill(); ctx.stroke(); }
    // бронзовый пояс под зубцами
    ctx.fillStyle = age.coreAccent; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.rect(x0, top + 7, x1 - x0, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    for (let lx = x0 + 4; lx < x1; lx += 9) ctx.fillRect(lx, top + 8, 1.5, 1.5);
  }
  // бойницы / пушечные порты
  ctx.fillStyle = '#1a100a';
  for (const bx of [x0 + 12, x0 + 44]) {
    if (brick) { ctx.beginPath(); ctx.arc(bx, top + 22, 3.2, Math.PI, 0); ctx.lineTo(bx + 3.2, top + 26); ctx.lineTo(bx - 3.2, top + 26); ctx.closePath(); ctx.fill(); }
    else ctx.fillRect(bx - 1.2, top + 16, 2.4, 10);
  }
  if (hpFrac < 0.6) {
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x0 + 30, top + 6); ctx.lineTo(x0 + 34, top + 18); ctx.lineTo(x0 + 29, top + 30); ctx.lineTo(x0 + 35, top + 44); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(x0 + 12, top + 30, 12, 8);
    if (hpFrac < 0.4) ctx.fillRect(x0 + 58, top + 36, 12, 8);
  }
  ctx.fillStyle = 'rgba(255,235,210,.14)'; ctx.fillRect(x0, bodyTop, x1 - x0, 2);
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(x1 - 5, bodyTop, 5, baseY - bodyTop);
  if (flash > 0) { // r15 И20: вспышка по силуэту стены с зубцами, не прямоугольником
    const fp = new Path2D();
    fp.rect(x0, bodyTop, x1 - x0, baseY - bodyTop);
    if (brick) { fp.rect(x0 - 2, top + 1, x1 - x0 + 4, 4); for (let lx = x0; lx < x1 - 6; lx += 15) fp.rect(lx, top - 7, 10, 8); }
    else for (let lx = x0; lx < x1 - 4; lx += 13) fp.rect(lx, top - 5, 8, 9);
    ctx.fillStyle = `rgba(255,244,224,${flash * 0.5})`; ctx.fill(fp, 'nonzero');
  }
}
// Флаг на шесте (развевается прочь от линии боя, ART.flags; «золотой
// флаг» из магазина — только у своей крепости). k — размер полотнища.
function drawFortFlag(cx, poleBase, poleTop, side, now, k = 1) {
  ctx.strokeStyle = '#2a1c10'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, poleBase); ctx.lineTo(cx, poleTop); ctx.stroke();
  const wave = Math.sin(now / 300) * 5 * k, wave2 = Math.sin(now / 300 + 1.3) * 3 * k;
  ctx.fillStyle = (side > 0 && progress.cosmeticFlag === 'gold') ? ART.flags.gold : (side > 0 ? ART.flags.player : ART.flags.enemy);
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, poleTop);
  ctx.quadraticCurveTo(cx - 12 * k, poleTop + 3 * k + wave2, cx - 24 * k - wave, poleTop + 6 * k);
  ctx.quadraticCurveTo(cx - 12 * k, poleTop + 9 * k + wave2, cx, poleTop + 13 * k);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}
// Каменная башня (бронза: зубцы и черепичный шатёр; железо: кирпичный
// донжон, плоские мерлоны, высокий флагшток и дымоход).
function drawStoneTower(age, cx, baseY, platY, side, now, brick) {
  const hw = brick ? 17 : 15;
  const base = brick ? age.brick : (age.masonry || age.stone);
  const dark = brick ? age.brickDark : (age.masonryDark || age.woodDark);
  ctx.fillStyle = base; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - hw - 2, baseY); ctx.lineTo(cx - hw, platY); ctx.lineTo(cx + hw, platY); ctx.lineTo(cx + hw + 2, baseY); ctx.closePath(); ctx.fill(); ctx.stroke();
  // кладка
  const rowH = brick ? 5 : 9, blk = brick ? 10 : 14;
  ctx.strokeStyle = brick ? hexAlpha(dark, 0.75) : 'rgba(0,0,0,.26)'; ctx.lineWidth = 1;
  ctx.beginPath();
  let row = 0;
  for (let ly = platY + rowH; ly < baseY - 1; ly += rowH, row++) {
    ctx.moveTo(cx - hw, ly); ctx.lineTo(cx + hw, ly);
    for (let lx = cx - hw + (row % 2 ? blk / 2 : 0) + blk; lx < cx + hw; lx += blk) { ctx.moveTo(lx, ly); ctx.lineTo(lx, Math.min(baseY, ly + rowH)); }
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(cx + hw - 6, platY, 6, baseY - platY);
  ctx.fillStyle = 'rgba(255,235,210,.14)'; ctx.fillRect(cx - hw, platY, 3, baseY - platY);
  // окно с огнём
  const wy = platY + 12;
  ctx.fillStyle = '#1a100a';
  ctx.beginPath(); ctx.moveTo(cx - 4, wy + 10); ctx.lineTo(cx - 4, wy + 3); ctx.arc(cx, wy + 3, 4, Math.PI, 0); ctx.lineTo(cx + 4, wy + 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = hexAlpha(age.flame, 0.6); ctx.fillRect(cx - 2.5, wy + 3, 5, 6);
  // карниз и зубцы
  ctx.fillStyle = brick ? age.stone : dark; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.rect(cx - hw - 3, platY - 4, hw * 2 + 6, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = base;
  const mw = brick ? 8 : 6.5, n = 4, step = (hw * 2 + 6 - mw) / (n - 1);
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.rect(cx - hw - 3 + i * step, platY - 12, mw, 8); ctx.fill(); ctx.stroke(); }
  if (brick) {
    ctx.fillStyle = age.stone;
    for (let i = 0; i < n; i++) ctx.fillRect(cx - hw - 3.5 + i * step, platY - 13.5, mw + 1, 2);
    // дымоход и высокий флагшток
    ctx.fillStyle = age.brickDark; ctx.fillRect(cx + 8, platY - 22, 5, 12);
    drawSmoke(cx + 10.5, platY - 24, now, 2, 'rgba(120,120,130,.3)');
    drawFortFlag(cx - 4, platY - 4, platY - 78, side, now, 1.25);
  } else {
    // шатёр из черепицы с бронзовым навершием
    const roofY = platY - 10, apexY = roofY - 30;
    ctx.fillStyle = age.roof || age.woodDark; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - hw - 6, roofY); ctx.lineTo(cx, apexY); ctx.lineTo(cx + hw + 6, roofY); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = age.roofDark || 'rgba(0,0,0,.3)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const f of [0.3, 0.55, 0.8]) { const yy = apexY + (roofY - apexY) * f, hx = (hw + 6) * f; ctx.moveTo(cx - hx, yy); ctx.lineTo(cx + hx, yy); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,190,.22)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx - hw - 4, roofY - 1); ctx.lineTo(cx - 1, apexY + 2); ctx.stroke();
    ctx.fillStyle = age.coreAccent;
    ctx.beginPath(); ctx.arc(cx, apexY, 2.4, 0, Math.PI * 2); ctx.fill();
    drawFortFlag(cx, apexY, apexY - 30, side, now, 1);
  }
}
// Пушка на стене (железо): лафет, колесо, ствол к линии боя (локальный +x).
function drawWallCannon(age, x, y) {
  ctx.fillStyle = age.woodDark; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x - 5, y - 6); ctx.lineTo(x + 5, y - 6); ctx.lineTo(x + 7, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.translate(x, y - 8); ctx.rotate(-0.18);
  ctx.fillStyle = age.cannon || '#2c2d31';
  ctx.beginPath(); ctx.moveTo(-7, -3.6); ctx.lineTo(15, -2.6); ctx.lineTo(15, 2.6); ctx.lineTo(-7, 3.6); ctx.arc(-7, 0, 3.6, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillRect(13, -3.4, 3, 6.8);
  ctx.strokeStyle = age.cannonHi || '#6a6e78'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-6, -1.8); ctx.lineTo(13, -1.3); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = age.woodLight; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(x - 1, y - 2.5, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = age.woodDark; ctx.beginPath(); ctx.arc(x - 1, y - 2.5, 1.2, 0, Math.PI * 2); ctx.fill();
}
// Сторожевая башня: четыре столба (задние темнее), площадка с перилами,
// стенка с окном (iron — труба с дымом), пирамидальная крыша с выносом,
// флаг на шесте выше крыши (ART.flags; косметика «золотой флаг» — только у
// своей крепости). Флаг развевается прочь от линии боя — в зеркале тоже.
function drawWatchtower(age, cx, baseY, platY, side, now, iron) {
  const hw = 15;
  const roofY = platY - 12, apexY = roofY - 22;
  ctx.lineCap = 'round';
  ctx.strokeStyle = age.woodDark; ctx.lineWidth = 3.2;
  for (const dx of [-8, 8]) { ctx.beginPath(); ctx.moveTo(cx + dx * 1.15, baseY); ctx.lineTo(cx + dx, platY); ctx.stroke(); }
  ctx.strokeStyle = age.woodLight; ctx.lineWidth = 3.6;
  for (const dx of [-12, 12]) { ctx.beginPath(); ctx.moveTo(cx + dx * 1.15, baseY); ctx.lineTo(cx + dx, platY); ctx.stroke(); }
  ctx.strokeStyle = age.woodDark; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(cx - 12, baseY - 14); ctx.lineTo(cx + 12, platY + 14); ctx.moveTo(cx + 12, baseY - 14); ctx.lineTo(cx - 12, platY + 14); ctx.stroke();
  ctx.fillStyle = age.woodLight; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.rect(cx - hw - 3, platY - 1, hw * 2 + 6, 5); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = age.woodDark; ctx.lineWidth = 1.8;
  for (const dx of [-hw - 2, -hw / 2, 0, hw / 2, hw + 2]) { ctx.beginPath(); ctx.moveTo(cx + dx, platY - 1); ctx.lineTo(cx + dx, platY - 9); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx - hw - 3, platY - 9); ctx.lineTo(cx + hw + 3, platY - 9); ctx.stroke();
  ctx.fillStyle = iron ? age.stone : age.woodDark; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.rect(cx - hw + 2, roofY, hw * 2 - 4, platY - 9 - roofY); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1a100a'; ctx.fillRect(cx - 3, roofY + 3, 6, 6);
  ctx.fillStyle = hexAlpha(age.flame, 0.55); ctx.fillRect(cx - 2, roofY + 4, 4, 4);
  ctx.fillStyle = age.woodDark; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - hw - 7, roofY); ctx.lineTo(cx, apexY); ctx.lineTo(cx + hw + 7, roofY); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,190,.18)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(cx - hw - 5, roofY - 1); ctx.lineTo(cx - 1, apexY + 2); ctx.stroke();
  if (iron) { ctx.fillStyle = age.stone; ctx.fillRect(cx + 6, apexY + 8, 4, 10); drawSmoke(cx + 8, apexY + 6, now, 2, 'rgba(120,120,130,.3)'); }
  drawFortFlag(cx, apexY + 2, apexY - 30, side, now, 1);
}
// Разрушенная крепость: обломки столбов башни, упавшие брёвна под углом,
// груда камней, уцелевший кусок стены, дым из руин.
function drawRuins(age, x0, x1, baseY, now) {
  // И6: у каменной/кирпичной крепости обломки — блоки кладки, не брёвна
  const fort = age.fort || 'palisade';
  const matL = fort === 'brickfort' ? age.brick : fort === 'stonewall' ? (age.masonry || age.stone) : age.woodLight;
  const matD = fort === 'brickfort' ? age.brickDark : fort === 'stonewall' ? (age.masonryDark || age.stone) : age.woodDark;
  ctx.lineCap = 'round';
  ctx.strokeStyle = age.woodDark; ctx.lineWidth = 3.2;
  for (const [px, h] of [[-31, 22], [-7, 14]]) { ctx.beginPath(); ctx.moveTo(px, baseY); ctx.lineTo(px + 2, baseY - h); ctx.stroke(); }
  ctx.fillStyle = age.stone; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.2;
  for (const [dx, r] of [[-14, 7], [8, 9], [26, 6], [-30, 5]]) { ctx.beginPath(); ctx.ellipse(dx, baseY - 2, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  for (let i = 0; i < 5; i++) {
    const lx = x0 + 6 + i * 17, ang = -0.25 - (i % 3) * 0.22;
    ctx.save(); ctx.translate(lx, baseY - 2); ctx.rotate(ang);
    ctx.fillStyle = i % 2 ? matD : matL; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2;
    if (fort === 'palisade') { ctx.beginPath(); ctx.rect(0, -3, 26 + (i % 2) * 8, 6); ctx.fill(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.rect(0, -5, 14 + (i % 2) * 5, 9); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
  ctx.fillStyle = matL; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2;
  for (const [lx, h] of [[x1 - 10, 20], [x1 - 4, 26]]) {
    ctx.beginPath(); ctx.moveTo(lx, baseY); ctx.lineTo(lx, baseY - h + 3); ctx.lineTo(lx + 3, baseY - h); ctx.lineTo(lx + 6, baseY - h + 4); ctx.lineTo(lx + 6, baseY); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  drawSmoke(-6, baseY - 12, now, 4, 'rgba(70,60,55,.4)');
}
// Крепость «под обложку» (раунд 14): деревянный частокол с заострёнными
// брёвнами, ворота со стороны линии боя (юниты спавнятся на core.x±30 —
// внутри арки, «выходят из ворот»), сторожевая башня с крышей и флагом,
// факел, каменный холм-основание. Рисуется для side=+1 и зеркалится
// ctx.scale(side, 1); хитбокс CORE_KEEP_NEAR/FAR (data.js) не меняется —
// это координаты для расстановки башен, не рисунок. Материал по эпохе:
// stone — сырые брёвна, bronze — брёвна с бронзовыми обручами и каменное
// основание выше, iron — кладка с железными накладками и трубой.
// Повреждения: <60% HP — обломанные брёвна и трещины, <30% — дым;
// разрушено — упавшие брёвна, обломки башни, дым из руин.
// Раунд 15 (И6): облик по AGES[].fort — stone: частокол + деревянная
// вышка; bronze: каменная стена с зубцами и бронзовым поясом + башня под
// черепичным шатром; iron: кирпичный форт с пушкой на стене + донжон с
// высоким флагштоком. trans = {from, t0} — перестройка при смене эпохи:
// новая крепость «вырастает» снизу вверх (клип), выше линии стройки ещё
// старая, на линии — леса из жердей и настил (FORT_REBUILD_SEC).
function drawFortBody(age, side, now, hpFrac, flash, moundH, top) {
  const wallX0 = -40, wallX1 = 46, wallH = 54;
  const gateX0 = 20, gateX1 = 42, gateH = 34;
  const fort = age.fort || 'palisade';
  if (fort === 'stonewall' || fort === 'brickfort') {
    const brick = fort === 'brickfort';
    drawStoneTower(age, -19, -moundH, top - 26, side, now, brick);
    drawMasonryWall(age, wallX0, wallX1, -moundH, top, hpFrac, brick, flash);
    if (brick) drawWallCannon(age, 6, top - 1);
  } else {
    drawWatchtower(age, -19, -moundH, top - 26, side, now, false);
    drawPalisade(age, wallX0, wallX1, -moundH, top, hpFrac, false, flash);
  }
  // ворота — тёмная арка со стороны линии боя, перемычка сверху
  const gcx = (gateX0 + gateX1) / 2, gcy = -moundH - gateH + 11;
  ctx.fillStyle = '#1a100a';
  ctx.beginPath(); ctx.moveTo(gateX0, -moundH); ctx.lineTo(gateX0, gcy); ctx.arc(gcx, gcy, 11, Math.PI, 0); ctx.lineTo(gateX1, -moundH); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,170,.18)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(gateX0 + 1, -moundH); ctx.lineTo(gateX0 + 1, gcy); ctx.arc(gcx, gcy, 10, Math.PI, 0); ctx.stroke();
  if (fort === 'brickfort') { // решётка ворот
    ctx.strokeStyle = hexAlpha(age.cannonHi || '#6a6e78', 0.8); ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let gx = gateX0 + 4; gx < gateX1; gx += 4.5) { ctx.moveTo(gx, gcy - 7); ctx.lineTo(gx, -moundH - 14); }
    ctx.moveTo(gateX0 + 1, gcy - 1); ctx.lineTo(gateX1 - 1, gcy - 1);
    ctx.stroke();
  }
  ctx.fillStyle = fort === 'palisade' ? age.woodDark : (fort === 'brickfort' ? age.stone : (age.masonryDark || age.woodDark));
  ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.rect(gateX0 - 3, -moundH - gateH - 5, gateX1 - gateX0 + 6, 5); ctx.fill(); ctx.stroke();
  // факел у ворот
  const torchX = wallX1 - 3, torchY = top - 2;
  ctx.strokeStyle = '#2a1c10'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(torchX, torchY + 6); ctx.lineTo(torchX, torchY - 8); ctx.stroke();
  const flick = 3 + Math.sin(now / 90) * 1.2 + Math.random() * 1.2;
  const flameGrad = ctx.createRadialGradient(torchX, torchY - 11, 0, torchX, torchY - 11, flick + 4);
  flameGrad.addColorStop(0, '#fff7d6'); flameGrad.addColorStop(0.45, age.flame); flameGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = flameGrad;
  ctx.beginPath(); ctx.arc(torchX, torchY - 11, flick + 4, 0, Math.PI * 2); ctx.fill();
  // Вспышка попадания по стене. r15 И20 (куратор №7: «белый прямоугольник
  // поверх частокола»): заливка — по силуэту кольев/кладки (drawPalisade/
  // drawMasonryWall, flash), плюс мягкий радиальный блик у фасада, куда бьют.
  if (flash > 0) {
    const hx = wallX1 - 4, hy = top + wallH * 0.42, hr = 26;
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
    g.addColorStop(0, `rgba(255,236,190,${flash * 0.55})`); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  if (hpFrac < 0.3) drawSmoke(-19, top - 20, now, 3, 'rgba(70,60,55,.4)');
}
// Леса стройки на линии buildY: жерди от земли, настил, косые связи.
function drawScaffold(age, buildY, baseY, p, wallTop) {
  // выше стены леса только вокруг башни (x -40..2), ниже — по всему фасаду
  const high = buildY < wallTop - 6;
  const xs = high ? [-42, -30, -8, 4] : [-44, -20, 6, 30, 50];
  const x0 = xs[0] - 4, x1 = xs[xs.length - 1] + 4;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = Math.min(1, (1 - p) * 4);
  ctx.strokeStyle = age.woodDark; ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (const px of xs) { ctx.moveTo(px, high ? wallTop : baseY); ctx.lineTo(px, buildY - 12); }
  for (let i = 0; i < xs.length - 1; i++) { ctx.moveTo(xs[i], buildY + 22); ctx.lineTo(xs[i + 1], buildY - 4); }
  ctx.stroke();
  ctx.fillStyle = age.woodLight; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.rect(x0, buildY - 2, x1 - x0, 4); ctx.fill(); ctx.stroke();
  // светлая кромка «свежей кладки» на линии стройки
  ctx.fillStyle = 'rgba(255,244,210,.55)';
  ctx.fillRect(x0 + 2, buildY + 2, x1 - x0 - 4, 2);
  ctx.restore();
}
function drawCore(core, side, age, trans) {
  const alive = core.hp > 0;
  const hpFrac = core.maxHp > 0 ? Math.max(0, core.hp / core.maxHp) : 0;
  const now = performance.now();
  const iron = age.id === 'iron', bronze = age.id === 'bronze';
  const flash = core.hitFlash > 0 ? core.hitFlash : 0;
  if (flash > 0) core.hitFlash = Math.max(0, flash - 0.06);
  ctx.save();
  ctx.translate(core.x, ARENA.groundY);
  ctx.scale(side, 1);
  // И5: на широком кадре крепость крупнее (VIEW.fortK) — от фасада (x=46,
  // сторона линии боя) назад: ворота, спавн и стена героя остаются на месте.
  // И7: по ширине — не больше VIEW.fortKx (крепость целиком в кадре), по высоте — VIEW.fortK.
  if (VIEW.fortK !== 1) { ctx.translate(46, 0); ctx.scale(VIEW.fortKx, VIEW.fortK); ctx.translate(-46, 0); }
  ctx.lineJoin = 'round';

  const moundH = bronze ? 16 : iron ? 14 : 11;
  const wallX0 = -40, wallX1 = 46, wallH = 54;
  const top = -moundH - wallH;

  // каменный холм-основание с кладкой
  ctx.fillStyle = age.stone; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-54, 0); ctx.lineTo(-46, -moundH); ctx.lineTo(56, -moundH); ctx.lineTo(62, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1;
  for (let ly = -moundH + 5; ly < -1; ly += 5) { ctx.beginPath(); ctx.moveTo(-50, ly); ctx.lineTo(60, ly); ctx.stroke(); }
  for (let lx = -44; lx < 58; lx += 11) { const o = ((lx / 11) | 0) % 2 ? 2.5 : 0; ctx.beginPath(); ctx.moveTo(lx, -moundH + o); ctx.lineTo(lx, -moundH + o + 5); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,235,200,.10)'; ctx.fillRect(-46, -moundH, 102, 2);

  if (alive) {
    const tp = (trans && trans.from && trans.from !== age) ? (now - trans.t0) / (FORT_REBUILD_SEC * 1000) : 1;
    if (tp < 1) {
      const e = 1 - Math.pow(1 - Math.max(0, tp), 2);
      const hiY = top - 110;
      const buildY = -moundH + (hiY + moundH) * e;
      ctx.save(); ctx.beginPath(); ctx.rect(-90, buildY, 200, -buildY + 2); ctx.clip();
      drawFortBody(age, side, now, hpFrac, flash, moundH, top);
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(-90, hiY - 60, 200, buildY - (hiY - 60)); ctx.clip();
      drawFortBody(trans.from, side, now, hpFrac, flash, moundH, top);
      ctx.restore();
      drawScaffold(age, buildY, -moundH, tp, top);
    } else {
      drawFortBody(age, side, now, hpFrac, flash, moundH, top);
    }
  } else {
    drawRuins(age, wallX0, wallX1, -moundH, now);
  }

  // Глиф неуязвимости (баф вражеской базы, раунд 5) — светящийся купол над
  // крепостью, как глиф в Dota 2 (КОНЦЕПТ_ГДД.md). Голубой оставлен
  // намеренно — сигнал «не бей»; пунктир заменён мягким сплошным кольцом.
  // Радиус растёт вместе с крепостью (раньше 34px при башне 30px шириной,
  // теперь 56px при стене 86px) — купол по-прежнему накрывает постройку.
  if (alive && core.invulnerable > 0) {
    const cx = 3, cy = top / 2 - 6, r = 56;
    ctx.save();
    ctx.globalAlpha = 0.55 + Math.sin(now / 150) * 0.15;
    const glyphGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glyphGrad.addColorStop(0, 'rgba(140,220,255,.05)');
    glyphGrad.addColorStop(0.8, 'rgba(120,200,255,.35)');
    glyphGrad.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = glyphGrad;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(220,245,255,.3)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(180,230,255,.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- сцена меню (раунд 15, И1)
// За логотипом и кнопками главного меню (и за картой глав/магазином/
// плейлистом) — своя живая сцена: две крепости, герой с замахом, свой
// отряд слева, силуэты врагов справа, тот же фон тем же генератором и той
// же камерой, что в бою. Раньше под меню оставался последний кадр матча
// (или пустота). Свой цикл requestAnimationFrame — frame() и игровой цикл
// не трогаются; рисует только когда открыт один из экранов вне боя.
const MENU_SCENE_SCREENS = new Set(['loading', 'menu', 'missions', 'shop', 'playlist']); // r15 И10: и под экраном загрузки
const menuScene = {
  t0: performance.now(),
  cores: [
    { kind: 'core', x: ARENA.playerCoreX + ARENA.coreWidth, hp: 1, maxHp: 1, hitFlash: 0, invulnerable: 0 },
    { kind: 'core', x: ARENA.enemyCoreX, hp: 1, maxHp: 1, hitFlash: 0, invulnerable: 0 },
  ],
  clouds: [{ x: 120, y: 40, s: 1.1, sp: 7 }, { x: 520, y: 22, s: 0.8, sp: 5 }, { x: 830, y: 62, s: 1.3, sp: 9 }],
  allies: [{ x: 178, role: 'ranged' }, { x: 206, role: 'spear' }, { x: 236, role: 'melee' }],
  foes: [{ x: 690, role: 'melee' }, { x: 722, role: 'spear' }, { x: 758, role: 'ranged' }, { x: 800, role: 'heavy' }],
};
function menuSceneAge() {
  const idx = Math.max(0, Math.min(MISSIONS.length, progress.unlocked || 1) - 1);
  return AGES[(MISSIONS[idx] || MISSIONS[0]).age] || AGES.stone;
}
function drawMenuScene(now) {
  const t = (now - menuScene.t0) / 1000;
  const age = menuSceneAge();
  const bg = bakeArenaBackground(age);
  applyViewTransform();
  drawBgLayer(bg, 'sky', 1);
  drawSunMoon(age, { sunUp: true, localT: 0.28, alt: 0.72, light: 1 });
  drawHighClouds(t);
  for (const c of menuScene.clouds) drawCloud(((c.x + t * c.sp) % 1200) - 100, c.y, c.s);
  drawBgLayer(bg, 'land', 1);
  drawMotes(age, t);
  drawCore(menuScene.cores[0], 1, age);
  drawCore(menuScene.cores[1], -1, age);
  drawFarm(16, 2, 0, age);
  const gy = ARENA.groundY;
  menuScene.allies.forEach((a, i) => drawStickman(ctx, {
    x: a.x, y: gy, color: ART.player.fill, outline: ART.player.outline, facing: 1, scale: VIEW.fig, // И7: тот же крупный план, что в бою
    weapon: age.weapon[a.role] || null, roleAccent: ROLE_ACCENT[a.role], time: t + i * 0.9,
  }));
  menuScene.foes.forEach((f, i) => drawStickman(ctx, {
    x: f.x, y: gy, color: ART.enemy.fill, outline: ART.enemy.outline, facing: -1, enemy: true,
    weapon: age.weapon[f.role] || null, roleAccent: ROLE_ACCENT[f.role], time: t + i * 1.3,
    scale: (f.role === 'heavy' ? 1.15 : 1) * VIEW.fig,
  }));
  // герой: шаг вперёд-назад и замах раз в 2.6 с
  const cyc = t % 2.6;
  const heroX = 300 + Math.sin(t * 0.7) * 10;
  drawStickman(ctx, {
    x: heroX, y: gy, scale: 1.2 * VIEW.fig, marker: true, hero: true,
    color: ART.hero.fill, outline: ART.hero.outline, facing: 1,
    walkPhase: t * 3, moving: Math.cos(t * 0.7) > 0.55,
    attackPhase: cyc < 0.35 ? cyc / 0.35 : null, attackProfile: 'hero', time: t,
    weapon: age.weapon.melee,
    gearSwordTier: progress.gearSword, gearShieldTier: progress.gearShield, gearArmorTier: progress.gearArmor,
    cloak: !!progress.ownedCloakRed,
  });
}
function menuSceneLoop(now) {
  if (MENU_SCENE_SCREENS.has(screen) && !pageHidden && !adPlaying) drawMenuScene(now);
  requestAnimationFrame(menuSceneLoop);
}
requestAnimationFrame(menuSceneLoop);

requestAnimationFrame(frame);
// Локализация (Яндекс, п.2.14 — см. ТЗ_ЛОКАЛИЗАЦИЯ_11_ЯЗЫКОВ.md): первая
// отрисовка ЛЮБОГО экрана (в т.ч. #screenMenu, который по умолчанию скрыт
// в разметке — см. index.html) откладывается до PLATFORM.ready, чтобы язык
// (см. platform.js, applyDetectedLanguage()) был определён и применён
// (I18N.applyToDOM()) ДО того, как игрок увидит хоть один экран — игра
// обязана открыться сразу на нужном языке, без мигания русским.
PLATFORM.ready.then(async () => {
  I18N.applyToDOM();
  // refreshMuteButtons() уже отработал один раз при загрузке скрипта (до
  // того, как язык определился, см. вызов чуть ниже её объявления) —
  // перевызываем, чтобы подписи "Звук"/"Музыка" отражали реальный язык.
  refreshMuteButtons();
  // Облачные сохранения (см. ТЗ_ОБЛАЧНЫЕ_СОХРАНЕНИЯ.md, разделы 3-4) —
  // слияние локального и облачного прогресса. await безопасен по времени:
  // syncProgress()/loadCloud() никогда не бросает исключение и гарантированно
  // укладывается в STORAGE_TIMEOUT_MS (см. platform.js, withTimeout) — при
  // молчащем мосте/SDK экран меню просто откроется с задержкой не более
  // ~5с, не зависнет. Повторное применение темы/звука — на случай, если
  // слияние с облаком изменило их по сравнению с тем, что применилось
  // синхронно на строке ~88.
  BOOT.mark('чтение облачного сейва…');
  progress = await syncProgress();
  BOOT.mark('облачный сейв прочитан');
  applyTheme();
  SFX.setMuted(!!progress.muted);
  MUSIC.setMusicMuted(!!progress.musicMuted);
  // Панель отладки Яндекса, "ready" called on timeout (2026-09-09): здесь
  // (не раньше) игра реально готова показать первый экран — тема, язык,
  // звук и облачный прогресс уже применены, ниже сразу идёт showScreen()
  // в обеих ветках. См. platform.js, notifyLoadingReady().
  PLATFORM.notifyLoadingReady();
  // При самом первом запуске игры сразу открывается миссия 1 с отсчётом
  // 3…2…1 (запрос основателя, раунд 5) — минуя главное меню; при всех
  // следующих запусках — обычное меню.
  if (!progress.introSeen) {
    progress.introSeen = true;
    saveProgress(progress);
    SFX.unlock();
    // r15 И10 (куратор CrazyGames: «титульный экран мигает ~2 с и исчезает —
    // кнопки видны, но нажать нельзя, бой стартует сам — выглядит как баг»):
    // прежнее «мелькание меню на 0.7 с» перед авто-стартом убрано. Первый
    // запуск: экран загрузки → сразу бой миссии 1 с отсчётом 3-2-1; меню с
    // магазином игрок увидит после итога боя («В меню») и при следующих
    // запусках. Порядок площадки: loadingStop (notifyLoadingReady выше) →
    // gameplayStart (showScreen('match') внутри startMission).
    startMission(0, { intro: true });
  } else {
    showScreen('menu');
  }
  BOOT.firstScreen();
  // Сэмплы SFX — сразу после первого экрана, чтобы первый бой уже звучал;
  // старт не ждёт.
  SFX.preload();
});
