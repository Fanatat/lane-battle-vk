// Оркестрация: экраны, игровой цикл, рендер, HUD, ввод. Логика боя — в
// entities.js/ai.js, эта часть только читает/показывает состояние.
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const DOM = {
  hud: document.getElementById('hud'),
  firstMissionHint: document.getElementById('firstMissionHint'),
  firstHintLine1: document.getElementById('firstHintLine1'),
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
  heroReviveTimer: document.getElementById('heroReviveTimer'),
  btnBuyback: document.getElementById('btnBuyback'),
  buybackCostText: document.getElementById('buybackCostText'),
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
// Подсказка миссии 1 (первая строка) — основатель попросил СОХРАНИТЬ саму
// подсказку, но на телефоне она звала нажимать WASD/1-4/Q/Пробел/F,
// которых физически нет (та же болезнь, что была у меню и у справки «?»
// до правки на устройство). Вторую строку («юниты держат линию...») не
// трогаем — она одинаково верна везде. Считается один раз при загрузке —
// тип устройства не меняется посреди сессии.
// Локализация (см. i18n.js): раньше это была самовызывающаяся функция —
// теперь обычная, вызывается из блока ожидания PLATFORM.ready ниже, ПОСЛЕ
// того как язык определён (иначе I18N.t() здесь читал бы язык по
// умолчанию 'ru' до того, как SDK успеет ответить).
function setFirstHintLine1() {
  const touchDevice = window.matchMedia('(pointer: coarse)').matches;
  DOM.firstHintLine1.innerHTML = touchDevice
    ? I18N.t('hud.firstHintTouch')
    : I18N.t('hud.firstHintDesktop');
}
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
  if (!hero || hero.alive || match.gold < cost) { SFX.buyDenied(); return; }
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

let screen = 'menu'; // menu | missions | match | paused | result
let match = null; // состояние текущего матча
let lastResult = null; // 'win' | 'lose'

// ---------------------------------------------------------------- canvas
// Баг-репорт основателя 2026-09-21 (пустые поля по краям на широких
// мониторах): раньше здесь всегда выделялось РОВНО ARENA.width×ARENA.height
// (1000×400) физических пикселей × dpr — независимо от того, каким
// реально нарисовался #arenaWrap (CSS сам растягивал канвас на всю его
// ширину/высоту через width:100%/height:100%, см. style.css). Пока
// #arenaWrap был зажат в max-width:1250px, разница была не так заметна;
// без этого потолка на большом экране растяжение фиксированного 1000×400
// битмапа до, например, 1900×760 CSS px дало бы явную замыленную картинку.
// Берём реальный отрендеренный размер бокса (getBoundingClientRect) и
// считаем разрешение канваса от него — тот же приём, что уже работает для
// #backdrop чуть ниже (resizeBackdrop). Игровая логика (entities.js/ai.js и
// т.д.) по-прежнему всегда работает в логических единицах ARENA (0..1000 ×
// 0..400) — трогаем только матрицу трансформации контекста, ни одну
// координату в остальном коде менять не нужно.
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || ARENA.width, h = rect.height || ARENA.height;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform((w * dpr) / ARENA.width, 0, 0, (h * dpr) / ARENA.height, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Декоративный фон-подложка (ночная правка, баг-репорт основателя: чёрные
// пустые поля по краям на широких экранах — #arenaWrap фиксированной
// пропорции 2.5:1 плавает в центре). Не участвует в геймплее, не трогает
// ARENA-координаты/HUD — отдельный canvas позади, дорисовывает небо/холмы
// в палитре текущей эпохи (или каменного века по умолчанию в меню) на весь
// вьюпорт, чтобы вместо черноты было продолжение того же мира.
const backdrop = document.getElementById('backdrop');
const bctx = backdrop.getContext('2d');
function currentBackdropAge() { return (match && match.age) ? match.age : AGES.stone; }

// ---------------------------------------------------------------- фон «под обложку» (раунд 14)
// Всё статичное (небо, горы, дымка, земля с тропой и крапом, камни, трава)
// запекается в offscreen-canvas: арена — один раз на миссию (match.bg),
// #backdrop — при смене размера/эпохи. В кадре только drawImage + солнце/
// луна, облака и пылевые мошки поверх. Профиль рельефа — детерминированный
// псевдослучай по эпохе: горы одной эпохи всегда одинаковы (не «прыгают»
// между кадрами и матчами), арена и подложка строятся из одного профиля.
// ctx.shadowBlur не используется нигде — свечение только градиентами
// (см. ТЗ_ВИЗУАЛ_ПОД_ОБЛОЖКУ.md, «Технические правила»).
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
const terrainCache = {};
function terrainFor(age) {
  if (terrainCache[age.id]) return terrainCache[age.id];
  const rng = seededRandom(AGE_SEED[age.id] || 3);
  // Гребень: несколько пиков случайной высоты/ширины поверх низкой базы
  // плюс мелкая рваность; smooth — покатые холмы, иначе — острые пики.
  function ridge(n, peaks, jag, smooth) {
    const pk = [];
    for (let i = 0; i < peaks; i++) pk.push({ x: rng(), h: 0.4 + rng() * 0.6, w: 0.07 + rng() * 0.17 });
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = i / n;
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
  const t = {
    far: ridge(60, 7, 0.05, false),
    mid: ridge(44, 5, 0.03, true),
    near: ridge(70, 10, 0.12, false),
    rocks: Array.from({ length: 22 }, () => ({ x: rng(), y: rng(), r: 1.6 + rng() * 3, tone: rng() })),
    tufts: Array.from({ length: 36 }, () => ({ x: rng(), y: rng(), h: 3 + rng() * 5, lean: (rng() - 0.5) * 1.4 })),
    stipple: Array.from({ length: 480 }, () => ({ x: rng(), y: rng(), a: rng() })),
    pathEdge: Array.from({ length: 56 }, () => rng()),
    motes: Array.from({ length: 14 }, () => ({ x0: rng(), y0: rng(), sp: 0.012 + rng() * 0.02, f: 0.5 + rng() * 0.9, p: rng() * 6.28, r: 0.8 + rng() * 1.3 })),
  };
  terrainCache[age.id] = t;
  return t;
}
function makeLayerCanvas(w, h, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  return [c, x];
}
// Небо: три ступени градиента + тёплый ореол вдоль горизонта (самый светлый
// в центре, как закат на обложке). Солнце/луна и облака рисуются поверх в
// кадре, а горы — поверх них (bakeLand), поэтому небо — отдельный слой.
function bakeSky(age, w, h, groundY, dpr) {
  const [c, x] = makeLayerCanvas(w, h, dpr);
  const g = x.createLinearGradient(0, 0, 0, groundY);
  g.addColorStop(0, age.skyTop); g.addColorStop(0.55, age.skyMid); g.addColorStop(1, age.skyHorizon);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const glow = x.createRadialGradient(w * 0.5, groundY - 6, 0, w * 0.5, groundY - 6, w * 0.6);
  glow.addColorStop(0, hexAlpha(age.sunGlow, 0.55));
  glow.addColorStop(0.4, hexAlpha(age.sunGlow, 0.2));
  glow.addColorStop(1, hexAlpha(age.sunGlow, 0));
  x.fillStyle = glow; x.fillRect(0, 0, w, groundY);
  return c;
}
// Горы (три слоя с атмосферной перспективой и дымкой между ними), земля со
// светлой тропой вдоль линии боя, крап, камни и трава/щебень. detail<1 —
// для подложки: часть крапа/травы пропускается, там и так мелко.
function bakeLand(age, w, h, groundY, dpr, detail = 1) {
  const [c, x] = makeLayerCanvas(w, h, dpr);
  const t = terrainFor(age);
  const skyH = groundY;
  function layer(pts, amp, base, color) {
    x.fillStyle = color;
    x.beginPath(); x.moveTo(-2, groundY + 2);
    for (const p of pts) x.lineTo(p.x * w, groundY - base - p.y * amp);
    x.lineTo(w + 2, groundY + 2); x.closePath(); x.fill();
  }
  function hazeBand(top, bottom, alphaMul) {
    const hz = x.createLinearGradient(0, top, 0, bottom);
    const a = parseFloat(age.haze.match(/[\d.]+\)$/)[0]) * alphaMul;
    const base = age.haze.replace(/[\d.]+\)$/, '');
    hz.addColorStop(0, base + '0)'); hz.addColorStop(0.75, base + a + ')'); hz.addColorStop(1, base + (a * 0.6) + ')');
    x.fillStyle = hz; x.fillRect(0, top, w, bottom - top);
  }
  layer(t.far, skyH * 0.42, 8, mixHex(age.mountains[0], age.skyHorizon, 0.34));
  hazeBand(groundY - skyH * 0.34, groundY, 1.3);
  layer(t.mid, skyH * 0.22, 3, mixHex(age.mountains[1], age.skyHorizon, 0.08));
  hazeBand(groundY - skyH * 0.16, groundY, 0.7);
  layer(t.near, skyH * 0.1, 0, age.mountains[2]);
  // земля: сверху светлее, к низу темнее
  const gg = x.createLinearGradient(0, groundY, 0, h);
  gg.addColorStop(0, age.groundTop); gg.addColorStop(0.3, age.ground); gg.addColorStop(1, age.groundDark);
  x.fillStyle = gg; x.fillRect(0, groundY, w, h - groundY);
  // светлая тропа вдоль линии боя с рваной нижней кромкой
  const n = t.pathEdge.length - 1;
  x.fillStyle = age.pathLight;
  x.beginPath(); x.moveTo(0, groundY);
  for (let i = 0; i <= n; i++) x.lineTo(i / n * w, groundY + 5 + t.pathEdge[i] * 5);
  x.lineTo(w, groundY); x.closePath(); x.fill();
  x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(0, groundY - 0.5, w, 1.5);
  // крап
  for (const s of t.stipple) {
    if (s.a > detail) continue;
    x.fillStyle = s.a > 0.5 ? 'rgba(255,235,200,.07)' : 'rgba(0,0,0,.12)';
    x.fillRect(s.x * w, groundY + 9 + s.y * (h - groundY - 9), 1 + s.a, 1);
  }
  // камни
  for (const r of t.rocks) {
    const px = r.x * w, py = groundY + 8 + r.y * (h - groundY - 14);
    x.fillStyle = mixHex(age.stone, age.groundDark, r.tone * 0.6);
    x.beginPath(); x.ellipse(px, py, r.r * 1.4, r.r * 0.8, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,240,210,.16)';
    x.beginPath(); x.ellipse(px - r.r * 0.4, py - r.r * 0.3, r.r * 0.6, r.r * 0.28, 0, 0, Math.PI * 2); x.fill();
  }
  // трава (stone/bronze) или щебень (iron)
  x.lineCap = 'round'; x.lineWidth = 1.2;
  x.strokeStyle = mixHex(age.groundTop, age.pathLight, 0.6);
  for (const g2 of t.tufts) {
    if (g2.h / 8 > detail) continue;
    const px = g2.x * w, py = groundY + 6 + g2.y * (h - groundY - 12);
    if (age.id === 'iron') { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(px, py, 2 + g2.h * 0.4, 1.5); continue; }
    for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(px, py); x.lineTo(px + k * 2 + g2.lean * g2.h, py - g2.h + Math.abs(k)); x.stroke(); }
  }
  return c;
}
// Арена: запекается с запасом BG_PAD по краям под тряску экрана (до ±6px).
const BG_PAD = 10;
function bakeArenaBackground(age) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = ARENA.width + BG_PAD * 2, h = ARENA.height + BG_PAD * 2, gy = ARENA.groundY + BG_PAD;
  return { ageId: age.id, sky: bakeSky(age, w, h, gy, dpr), land: bakeLand(age, w, h, gy, dpr, 1) };
}
// Пылевые мошки — тёплые точки над тропой, дрейф по ветру; без состояния,
// позиция считается от времени (update() не трогается).
function drawMotes(age, t) {
  ctx.fillStyle = hexAlpha(age.sunGlow, 0.4);
  for (const k of terrainFor(age).motes) {
    const x = ((k.x0 + t * k.sp) % 1) * ARENA.width;
    const y = ARENA.groundY - 16 - k.y0 * 120 + Math.sin(t * k.f + k.p) * 9;
    ctx.beginPath(); ctx.arc(x, y, k.r, 0, Math.PI * 2); ctx.fill();
  }
}

let backdropCache = null;
function drawBackdrop() {
  const w = backdrop.clientWidth, h = backdrop.clientHeight;
  if (!w || !h) return;
  const age = currentBackdropAge();
  const dn = match ? computeDayNight(match.elapsed + (match.resultElapsed || 0)) : { light: 1 };
  const groundY = h * 0.82;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // фон декоративный — экономим на дискретности
  const key = `${age.id}|${w}x${h}|${dpr}`;
  if (!backdropCache || backdropCache.key !== key) {
    backdropCache = { key, sky: bakeSky(age, w, h, groundY, dpr), land: bakeLand(age, w, h, groundY, dpr, 0.45) };
  }
  bctx.drawImage(backdropCache.sky, 0, 0, w, h);
  bctx.drawImage(backdropCache.land, 0, 0, w, h);
  const darkness = (1 - dn.light) * 0.5;
  if (darkness > 0.02) {
    bctx.fillStyle = `rgba(10,14,40,${darkness})`;
    bctx.fillRect(0, 0, w, h);
  }
}
function resizeBackdrop() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  backdrop.width = backdrop.clientWidth * dpr;
  backdrop.height = backdrop.clientHeight * dpr;
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackdrop();
}
window.addEventListener('resize', resizeBackdrop);
resizeBackdrop();
setInterval(drawBackdrop, 3000); // не кадр в кадр — фон не геймплейный, достаточно догонять день/ночь/эпоху

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
function layoutHudBottomRow() {
  if (!window.matchMedia('(pointer: coarse)').matches) {
    DOM.hudBottomRow.style.marginLeft = '';
    DOM.hudBottomRow.style.marginRight = '';
    return;
  }
  const touchActions = document.querySelector('.touch-actions');
  if (!touchActions || DOM.touchControls.classList.contains('hidden')) return; // скрыт -> rect нулевой, мерить нечего
  const joyRect = DOM.joyBase.getBoundingClientRect();
  const touchRect = touchActions.getBoundingClientRect();
  const parentRect = DOM.hudBottomRow.parentElement.getBoundingClientRect(); // .hud-bottom
  const pad = 8;
  // .hud-bottom-row теперь align-self:stretch (см. style.css) — margin-left
  // и margin-right ОБА выставляются явно и отступают от настоящих краёв
  // .hud-bottom, а не от центра уже сдвинутого бокса (та самая причина,
  // почему первая попытка одним margin-left не сработала).
  DOM.hudBottomRow.style.marginLeft = Math.max(0, joyRect.right - parentRect.left + pad) + 'px';
  DOM.hudBottomRow.style.marginRight = Math.max(0, parentRect.right - touchRect.left + pad) + 'px';
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
  DOM.screenMenu.classList.toggle('hidden', name !== 'menu');
  DOM.screenMissions.classList.toggle('hidden', name !== 'missions');
  DOM.screenShop.classList.toggle('hidden', name !== 'shop');
  DOM.screenPlaylist.classList.toggle('hidden', name !== 'playlist');
  DOM.screenPause.classList.toggle('hidden', name !== 'paused');
  DOM.screenHelp.classList.toggle('hidden', name !== 'help');
  DOM.screenResult.classList.toggle('hidden', name !== 'result');
  DOM.hud.classList.toggle('hidden', !(name === 'match' || name === 'paused' || name === 'help'));
  const touchCapable = window.matchMedia('(pointer: coarse)').matches;
  DOM.touchControls.classList.toggle('hidden', !(touchCapable && (name === 'match')));
  if (touchCapable && name === 'match') requestAnimationFrame(layoutHudBottomRow);
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
const CHAPTER_Y_PATTERNS = [
  [46, 24, 58], [46, 60, 26], [30, 54, 40], [52, 28, 50], [40, 58, 30],
];
function chapterRowSVG(ch, chapterIdx) {
  const W = 300, H = 84;
  const yPat = CHAPTER_Y_PATTERNS[chapterIdx % CHAPTER_Y_PATTERNS.length];
  const xs = [36, 150, 264];
  // Раунд 14 (сепия/дерево): холмы «местности» — тёплые охристые тона,
  // от закатной охры к оливе по мере глав (было — синие hue 210+).
  const hue = 28 + chapterIdx * 10;
  let svg = `<svg class="chapter-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  // «местность» — пара мягких перекрывающихся холмов позади дорожки
  svg += `<ellipse cx="${W * 0.28}" cy="${H * 0.75}" rx="90" ry="30" fill="hsla(${hue},50%,50%,.18)"/>`;
  svg += `<ellipse cx="${W * 0.72}" cy="${H * 0.3}" rx="100" ry="28" fill="hsla(${hue + 20},45%,50%,.14)"/>`;
  // волнистые пунктирные дорожки между соседними узлами (квадратичная
  // безье с перпендикулярным смещением контрольной точки — не прямая)
  for (let i = 0; i < xs.length - 1; i++) {
    const x1 = xs[i], y1 = yPat[i], x2 = xs[i + 1], y2 = yPat[i + 1];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const wave = (i % 2 === 0 ? 1 : -1) * 22;
    const cleared = (ch.id - 1) * MISSIONS_PER_CHAPTER + i + 1 < progress.unlocked;
    svg += `<path d="M${x1},${y1} Q${mx},${my + wave} ${x2},${y2}" fill="none"
      stroke="${cleared ? 'var(--gold-text)' : 'rgba(255,225,180,.35)'}" stroke-width="3"
      stroke-dasharray="7 6" stroke-linecap="round"/>`;
  }
  for (let lvl = 1; lvl <= MISSIONS_PER_CHAPTER; lvl++) {
    const missionIndex = (ch.id - 1) * MISSIONS_PER_CHAPTER + (lvl - 1);
    const m = MISSIONS[missionIndex];
    const unlocked = m.id <= progress.unlocked;
    const cleared = m.id < progress.unlocked;
    const cls = 'trail-node-svg' + (unlocked ? '' : ' locked') + (cleared ? ' cleared' : '');
    const fill = cleared ? 'url(#trailCleared)' : unlocked ? 'url(#trailOpen)' : '#4a3a2c';
    svg += `<g class="${cls}" data-mission-index="${missionIndex}" data-unlocked="${unlocked}">
      <circle cx="${xs[lvl - 1]}" cy="${yPat[lvl - 1]}" r="16" fill="${fill}" stroke="var(--ink)" stroke-width="3"/>
      <text x="${xs[lvl - 1]}" y="${yPat[lvl - 1] + 5}" text-anchor="middle" font-family="'Lilita One',sans-serif" font-size="15" fill="${unlocked ? '#3a2f22' : '#b8a890'}">${unlocked ? lvl : '🔒'}</text>
    </g>`;
  }
  svg += '</svg>';
  return svg;
}
function renderChapterTrail() {
  const defs = `<svg width="0" height="0"><defs>
    <linearGradient id="trailOpen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#e0a030"/>
    </linearGradient>
    <linearGradient id="trailCleared" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7bd98a"/><stop offset="1" stop-color="#2f8f45"/>
    </linearGradient>
  </defs></svg>`;
  DOM.chapterTrail.innerHTML = defs + CHAPTERS.map((ch, i) => `
    <div class="chapter-row">
      <div class="chapter-label">${I18N.t('missions.chapterLabel', { id: ch.id, name: ch.name })}</div>
      ${chapterRowSVG(ch, i)}
    </div>`).join('');
  DOM.chapterTrail.querySelectorAll('.trail-node-svg[data-unlocked="true"]').forEach(g => {
    g.addEventListener('click', () => startMission(Number(g.dataset.missionIndex)));
  });
}

DOM.btnPlay.addEventListener('click', () => { SFX.unlock(); SFX.click(); renderChapterTrail(); showScreen('missions'); });
DOM.btnBackToMenu.addEventListener('click', () => { SFX.click(); showScreen('menu'); });
DOM.btnShop.addEventListener('click', () => { SFX.unlock(); SFX.click(); renderShop(); showScreen('shop'); });
DOM.btnBackFromShop.addEventListener('click', () => { SFX.click(); showScreen('menu'); });

// ---------------------------------------------------------------- магазин
// Раунд 11 (баг-репорт основателя): заголовок+цена — своя строка, описание —
// отдельная строка на всю ширину карточки. Раньше цена стояла по центру
// сбоку от .si-info и при переносе длинного описания на 2 строки
// визуально наезжала на текст. Теперь наложение физически невозможно,
// т.к. кнопка цены делит место только с однострочным заголовком.
function shopRow(name, desc, costText, canBuy, owned, onBuy) {
  const row = document.createElement('div');
  row.className = 'shop-item';
  const btn = document.createElement('button');
  btn.className = 'si-buy' + (owned ? ' owned' : '');
  btn.textContent = owned ? I18N.t('shop.bought') : costText;
  btn.disabled = owned || !canBuy;
  if (!owned) btn.addEventListener('click', onBuy);
  row.innerHTML = `<div class="si-header"><b class="si-title">${name}</b></div><div class="si-desc">${desc}</div>`;
  row.querySelector('.si-header').appendChild(btn);
  return row;
}
function shopSectionTitle(text) {
  const h = document.createElement('div');
  h.className = 'shop-section-title';
  h.textContent = text;
  return h;
}
function shopNote(text) {
  const p = document.createElement('div');
  p.className = 'shop-note';
  p.textContent = text;
  return p;
}
function spend(cost) {
  progress.shopCurrency -= cost;
  saveProgress(progress);
  renderShop();
}
// Раунд 11 (баг-репорт основателя): позиции были расставлены в порядке, в
// котором функции появлялись по раундам (башня I/II рядом, но башня III и
// второй капкан — совсем в другом месте списка, среди разноплановых
// чаптер-гейтед покупок). Теперь однотипные покупки сгруппированы по
// смыслу с подзаголовками, порядок внутри группы — по цене/главе
// открытия. Логика покупок/цены/гейтинг не менялись, только раскладка.
function renderShop() {
  DOM.shopCurrencyText.textContent = Math.floor(progress.shopCurrency);
  const cur = progress.shopCurrency;
  const chapterNow = unlockedChapter(progress);
  DOM.shopList.innerHTML = '';

  function add(el) { DOM.shopList.appendChild(el); }
  function chapterGatedRow(key, def, effect) {
    const reached = chapterNow >= def.requiresChapter;
    return shopRow(
      def.name, reached ? effect : I18N.t('shop.opensAtChapter', { n: def.requiresChapter }),
      reached ? I18N.t('shop.pointsSuffix', { cost: def.cost }) : I18N.t('shop.lockedChapter', { n: def.requiresChapter }), reached && cur >= def.cost, progress[key],
      () => { if (reached && cur >= def.cost) { progress[key] = true; spend(def.cost); } }
    );
  }

  // ------- Постройки (башни + капканы вместе, по возрастанию цены/главы)
  add(shopSectionTitle(I18N.t('shop.sectionBuildings')));
  add(shopRow(
    SHOP.towerA.name, I18N.t('shop.towerADesc', { dmg: SHOP.towerA.dmg }),
    I18N.t('shop.pointsSuffix', { cost: SHOP.towerA.cost }), cur >= SHOP.towerA.cost, progress.towerA,
    () => { if (cur >= SHOP.towerA.cost) { progress.towerA = true; spend(SHOP.towerA.cost); } }
  ));
  const canBuyB = progress.towerA && cur >= SHOP.towerB.cost;
  add(shopRow(
    SHOP.towerB.name, progress.towerA ? I18N.t('shop.towerBDescOwned') : I18N.t('shop.towerBDescLocked'),
    I18N.t('shop.pointsSuffix', { cost: SHOP.towerB.cost }), canBuyB, progress.towerB,
    () => { if (canBuyB) { progress.towerB = true; spend(SHOP.towerB.cost); } }
  ));
  add(chapterGatedRow('towerC', SHOP.towerC, I18N.t('shop.towerCDesc')));
  add(shopRow(
    SHOP.trap.name, I18N.t('shop.trapDesc', { cd: SHOP.trap.cooldown }),
    I18N.t('shop.pointsSuffix', { cost: SHOP.trap.cost }), cur >= SHOP.trap.cost, progress.trap,
    () => { if (cur >= SHOP.trap.cost) { progress.trap = true; spend(SHOP.trap.cost); } }
  ));
  add(chapterGatedRow('trap2', SHOP.trap2, I18N.t('shop.trap2Desc')));

  // ------- Снаряжение и способности героя
  add(shopSectionTitle(I18N.t('shop.sectionHero')));
  [['gearSword', I18N.t('shop.gearSwordEffect')], ['gearShield', I18N.t('shop.gearShieldEffect')], ['gearArmor', I18N.t('shop.gearArmorEffect')], ['gearLongBlade', I18N.t('shop.gearLongBladeEffect')]].forEach(([key, effect]) => {
    const def = SHOP[key];
    const tier = progress[key];
    if (tier >= def.costs.length) {
      add(shopRow(def.name, I18N.t('shop.gearMaxLevel', { tier, max: def.costs.length }), '', false, true, null));
    } else {
      const cost = def.costs[tier];
      add(shopRow(
        `${def.name} (${tier}/${def.costs.length})`, effect, I18N.t('shop.pointsSuffix', { cost }), cur >= cost, false,
        () => { if (cur >= cost) { progress[key] += 1; spend(cost); } }
      ));
    }
  });
  // Раунд 9 — новая покупная способность героя (выбор агента, см.
  // КОНЦЕПТ_ГДД.md, «Допущения»): у героя не было ни одного способа
  // повлиять на СВОЮ армию, только на себя лично.
  add(shopRow(
    SHOP.heroAbilityCry.name,
    I18N.t('shop.heroCryDesc', {
      dmg: Math.round((SHOP.heroAbilityCry.dmgMult - 1) * 100),
      spd: Math.round((SHOP.heroAbilityCry.speedMult - 1) * 100),
      dur: SHOP.heroAbilityCry.duration,
    }),
    I18N.t('shop.pointsSuffix', { cost: SHOP.heroAbilityCry.cost }), cur >= SHOP.heroAbilityCry.cost, progress.heroAbilityCry,
    () => { if (cur >= SHOP.heroAbilityCry.cost) { progress.heroAbilityCry = true; spend(SHOP.heroAbilityCry.cost); } }
  ));

  // ------- Экономика (по главе открытия)
  add(shopSectionTitle(I18N.t('shop.sectionEconomy')));
  add(chapterGatedRow('startGoldBoost', SHOP.startGoldBoost, I18N.t('shop.startGoldDesc', { n: SHOP.startGoldBoost.amount })));
  add(chapterGatedRow('buybackDiscount', SHOP.buybackDiscount, I18N.t('shop.buybackDiscountDesc', { n: SHOP.buybackDiscount.discount })));

  // ------- Музыка (раунд 5, реальные mp3 — раунд 10)
  add(shopSectionTitle(I18N.t('shop.sectionMusic')));
  ['musicTrack2', 'musicTrack3'].forEach(key => {
    const def = SHOP[key];
    add(shopRow(
      def.name, I18N.t('shop.musicTrackDesc'),
      I18N.t('shop.pointsSuffix', { cost: def.cost }), cur >= def.cost, progress[key],
      () => { if (cur >= def.cost) { progress[key] = true; spend(def.cost); saveProgress(progress); } }
    ));
  });

  // ------- Косметика
  add(shopSectionTitle(I18N.t('shop.sectionCosmetics')));
  // Ночная правка (баг всех трёх ревьюеров): было два взаимоисключающих
  // one-way товара, вторая покупка молча гасила первую, дороги обратно к
  // обычному циклу не было вообще — необратимо ломало сохранение. Теперь
  // владение (ownedTimeDay/Night) отдельно от текущего выбора
  // (cosmeticTime) — купил один раз, дальше переключаешься свободно и
  // бесплатно, включая обратно на «Цикл».
  add(timeOfDayRow());
  add(themeRow());
  add(shopRow(
    SHOP.cosmeticFlagGold.name, I18N.t('shop.flagGoldDesc'),
    I18N.t('shop.pointsSuffix', { cost: SHOP.cosmeticFlagGold.cost }), cur >= SHOP.cosmeticFlagGold.cost, progress.cosmeticFlag === 'gold',
    () => { if (cur >= SHOP.cosmeticFlagGold.cost) { progress.cosmeticFlag = 'gold'; spend(SHOP.cosmeticFlagGold.cost); } }
  ));
  add(shopRow(
    SHOP.cosmeticCloakRed.name, I18N.t('shop.cloakRedDesc'),
    I18N.t('shop.pointsSuffix', { cost: SHOP.cosmeticCloakRed.cost }), cur >= SHOP.cosmeticCloakRed.cost, progress.ownedCloakRed,
    () => { if (cur >= SHOP.cosmeticCloakRed.cost) { progress.ownedCloakRed = true; spend(SHOP.cosmeticCloakRed.cost); } }
  ));

  // ------- DLC (реальная оплата — ночь 07→08.09.2026, задача на релиз)
  // Утренняя правка (спецификация основателя): два раздельных DLC вместо
  // одного с путающим описанием («баф игрока или баф врага?») — теперь
  // каждое название прямо говорит, КОГО усиливает, оба одинаково заметны
  // (основателю интересно, что будут покупать чаще). Обратимость (ночная
  // находка) сохранена — владение навсегда, эффект — тумблер.
  add(shopSectionTitle(I18N.t('shop.sectionDlc')));
  const platformKind = PLATFORM.kind();
  if (platformKind === 'yandex') {
    add(shopNote(I18N.t('shop.dlcYandexNote')));
    if (PLATFORM.isYandexCatalogBroken()) {
      add(shopNote(I18N.t('shop.dlcYandexBroken')));
    }
  } else if (platformKind === 'vk') {
    add(shopNote(I18N.t('shop.dlcVkNote')));
  } else {
    add(shopNote(I18N.t('shop.dlcLocalNote')));
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
    progress.shopCurrency -= def.costDiamonds;
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
      costText = I18N.t('shop.pointsSuffix', { cost: def.costDiamonds });
      canBuy = progress.shopCurrency >= def.costDiamonds;
    }
    const row = shopRow(def.name, effectText, costText, canBuy, false, onPurchaseClick);
    if (platformKind === 'yandex' && PLATFORM.isYandexCatalogBroken()) {
      const warn = document.createElement('div');
      warn.className = 'si-desc si-warning';
      warn.textContent = I18N.t('shop.priceWarning');
      row.appendChild(warn);
    }
    return row;
  }
  const row = shopRow(def.name, I18N.t('shop.boughtWithEffect', { effect: effectText }), '', false, true, null);
  const toggle = document.createElement('button');
  toggle.className = 'si-buy toggle-inline' + (progress[activeKey] ? ' owned' : ' off');
  toggle.textContent = progress[activeKey] ? I18N.t('shop.on') : I18N.t('shop.off');
  toggle.addEventListener('click', () => {
    progress[activeKey] = !progress[activeKey];
    saveProgress(progress);
    renderShop();
  });
  row.querySelector('.si-header').appendChild(toggle);
  return row;
}

// Ночная правка — переключатель времени суток (Цикл/День/Ночь). Покупка
// разблокирует навсегда (progress.ownedTime*), кнопки переключают текущий
// выбор (progress.cosmeticTime) свободно между уже купленными вариантами,
// включая бесплатный возврат на «Цикл».
function timeOfDayRow() {
  const row = document.createElement('div');
  row.className = 'shop-item';
  row.innerHTML = `<div class="si-header"><b class="si-title">${I18N.t('shop.timeOfDayTitle')}</b></div>
    <div class="si-desc">${I18N.t('shop.timeOfDayDesc')}</div>`;
  const group = document.createElement('div');
  group.className = 'time-select-group';
  row.appendChild(group);
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
    btn.textContent = selected ? `✓ ${o.label}` : (o.owned ? o.label : `${o.label} — ${I18N.t('shop.pointsSuffix', { cost: o.cost })}`);
    btn.disabled = selected || (!o.owned && cur < o.cost);
    btn.addEventListener('click', () => {
      if (!o.owned) {
        if (progress.shopCurrency < o.cost) return;
        progress.shopCurrency -= o.cost;
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
  row.className = 'shop-item';
  row.innerHTML = `<div class="si-header"><b class="si-title">${I18N.t('shop.themeTitle')}</b></div>
    <div class="si-desc">${I18N.t('shop.themeDesc')}</div>`;
  const group = document.createElement('div');
  group.className = 'time-select-group';
  row.appendChild(group);
  const cur = progress.shopCurrency;
  THEMES.forEach(t => {
    const owned = !t.ownedKey || progress[t.ownedKey];
    const selected = progress.activeTheme === t.id;
    const btn = document.createElement('button');
    btn.className = 'si-buy time-opt' + (selected ? ' owned' : '');
    btn.textContent = selected ? `✓ ${t.label}` : (owned ? t.label : `${t.label} — ${I18N.t('shop.pointsSuffix', { cost: t.cost })}`);
    btn.disabled = selected || (!owned && cur < t.cost);
    btn.addEventListener('click', () => {
      if (!owned) {
        if (progress.shopCurrency < t.cost) return;
        progress.shopCurrency -= t.cost;
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
  DOM.btnMute.textContent = sfxText;
  DOM.btnMutePause.textContent = sfxText;
  DOM.btnMuteMusic.textContent = musicText;
  DOM.btnMuteMusicPause.textContent = musicText;
}
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
  world.hero.maxHp = HERO.hp + progress.gearShield * SHOP.gearShield.hpPerTier;
  world.hero.hp = world.hero.maxHp;
  world.hero.dmgBonus = progress.gearSword * SHOP.gearSword.dmgPerTier;
  world.hero.dmgReduction = Math.min(0.5, progress.gearArmor * SHOP.gearArmor.reductionPerTier);
  world.hero.meleeRangeMult = 1 + progress.gearLongBlade * SHOP.gearLongBlade.rangeMultPerTier;
  world.hero.cryUnlocked = !!progress.heroAbilityCry; // раунд 9: покупка магазина
  const unlockedUnits = UNIT_ORDER.filter(id => UNIT_TYPES[id].unlockMission <= mission.id);
  match = {
    missionIndex: index, mission, age,
    world,
    gold: 24 + (progress.startGoldBoost ? SHOP.startGoldBoost.amount : 0), // раунд 8: покупка магазина
    incomeLevel: 0,
    incomeAcc: 0,
    unlockedUnits,
    ai: makeEnemyAI(),
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
    countdown: opts.intro ? 3 : 0,
    introHintActive: false,
    currentBattleTrack: null, musicPulseOverride: false, // раунд 10: плейлист + форс-переключение на "Пульс"
  };
  // Раунд 14: все эффекты — через vfx.js (типизированные частицы, кольца,
  // щепки, всплывающие «+N»), а не одинаковые квадратики на любой повод.
  world.onCoreHit = (core) => {
    shakeScreen(match, 3);
    VFX.coreHit(match, core.x + (core.team === 'player' ? CORE_KEEP_FAR : -CORE_KEEP_FAR));
  };
  world.onCoreDestroyed = (core) => { if (!match.resolved) endMatch(core.team === 'player' ? 'lose' : 'win'); };
  world.onUnitDeath = (u) => VFX.unitDeath(match, u.x);
  world.onImpact = (x) => VFX.impact(match, x);
  // Искры в точке контакта ближнего удара (у дальнего — уже onImpact).
  world.onHit = (ref, role) => { if (role !== 'ranged') VFX.meleeHit(match, ref.x, -34, ref.team !== 'player'); };
  world.onHeroDown = () => {
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

  buildToolbar();
  updateHudStatic();
  showScreen('match');
  match.currentBattleTrack = pickNextBattleTrack(null);
  MUSIC.play(match.currentBattleTrack, { force: true });
  if (opts.intro) {
    DOM.countdownOverlay.classList.remove('hidden');
    DOM.countdownNum.textContent = '3';
  } else {
    showFirstMissionHint(mission.id === 1);
  }
}

// Подсказка новичку — только в первой миссии, гаснет сама или при первом
// осмысленном действии (см. фидбэк основателя: интерфейс нужно понятнее).
let firstHintTimer = null;
// intro=true — самый первый заход новичка (раунд 5): тулбар увеличенно
// показывается, пока подсказка видна, и игра идёт вдвое медленнее (см.
// currentTimeScale() и frame()).
function showFirstMissionHint(show, intro = false) {
  clearTimeout(firstHintTimer);
  DOM.firstMissionHint.classList.remove('fading');
  DOM.firstMissionHint.classList.toggle('hidden', !show);
  if (match) match.introHintActive = show;
  DOM.hud.classList.toggle('intro-enlarged', show && intro);
  if (show) firstHintTimer = setTimeout(dismissFirstMissionHint, 9000);
}
function dismissFirstMissionHint() {
  clearTimeout(firstHintTimer);
  if (match) match.introHintActive = false;
  DOM.hud.classList.remove('intro-enlarged');
  if (!DOM.firstMissionHint.classList.contains('hidden')) {
    DOM.firstMissionHint.classList.add('fading');
    setTimeout(() => DOM.firstMissionHint.classList.add('hidden'), 600);
  }
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
});
DOM.btnBackFromHelp.addEventListener('click', () => { stopHelpAnim(); showScreen('paused'); });

function currentIncomeRate() {
  const dlcMult = progress.dlcPlayerBuffActive ? SHOP.dlcPlayerBuff.playerIncomeMult : 1;
  return ECONOMY.baseIncome * Math.pow(1 + ECONOMY.upgrade.incomePctGain, match.incomeLevel) * dlcMult;
}
function currentUpgradeCost() {
  return Math.round(ECONOMY.upgrade.baseCost * Math.pow(ECONOMY.upgrade.growth, match.incomeLevel));
}

// ---------------------------------------------------------------- toolbar (built once per mission)
// Иконки юнитов — те же исходники, что и в игровом мире: мини-рендер того
// же рига стикмена, а не отдельно нарисованные значки (см. 03_АССЕТЫ.md,
// «правило консистентности»).
function drawUnitIcon(canvas, t, age) {
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  // Раунд 14: риг стал в RIG_K раз крупнее — иконка делит масштаб обратно,
  // чтобы влезать в тот же канвас 40×44 (см. buildToolbar).
  drawStickman(c, {
    x: canvas.width / 2, y: canvas.height - 3, scale: 0.85 / RIG_K,
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
  const ids = match.unlockedUnits.slice(0, 3);
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
    c.fillStyle = '#f2d477'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center';
    c.fillText(String(t.cost), x, canvas.height - 2);
    c.fillStyle = '#eef0ff'; c.font = 'bold 8px sans-serif';
    c.fillText(t.hotkey, x, 11);
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

  add(shopSectionTitle(I18N.t('help.sectionControls')));
  add(helpRow(
    (canvas) => drawHeroActionIcon(canvas, touchDevice ? 'joystick' : 'walk'),
    I18N.t('help.moveHero'), touchDevice ? I18N.t('help.moveJoystick') : I18N.t('help.moveKeys')
  ));
  add(helpRow(
    (canvas) => drawBuyUnitBar(canvas),
    I18N.t('help.buyUnit'), touchDevice ? I18N.t('help.buyUnitTouch') : I18N.t('help.buyUnitKeys'), 90
  ));
  add(helpRow((canvas) => drawHeroActionIcon(canvas, 'coin'), I18N.t('help.incomeUpgrade'), touchDevice ? I18N.t('help.incomeUpgradeTouch') : I18N.t('help.incomeUpgradeKey')));
  // Основатель: убрать кнопку "Выкупить" из карточки, дать пояснение
  // дословно по смыслу — герой воскресает сам через минуту, досрочный
  // выкуп за золото это альтернатива, а не единственный путь.
  add(helpRow(
    (canvas) => drawHeroActionIcon(canvas, 'revive'),
    I18N.t('help.heroDeath'),
    I18N.t('help.heroDeathDesc', {
      cost: currentBuybackCost(),
      extra: touchDevice ? I18N.t('help.heroDeathTouchExtra') : I18N.t('help.heroDeathKeyExtra'),
    })
  ));

  add(shopSectionTitle(I18N.t('help.sectionUnits')));
  match.unlockedUnits.forEach(id => {
    const t = UNIT_TYPES[id];
    add(helpRow(
      (canvas) => drawHelpUnitIcon(canvas, t, match.age),
      I18N.t('help.unitLine', { name: t.name, cost: t.cost }),
      I18N.t('help.unitStats', { hp: t.hp, dmg: t.dmg, role: ROLE_LABEL[t.role] })
    ));
  });

  add(shopSectionTitle(I18N.t('help.sectionAbilities')));
  const abilities = [
    { kind: 'attack', title: I18N.t('help.abilityAttack'), how: touchDevice ? I18N.t('help.abilityAttackTouch') : I18N.t('help.abilityAttackKey'), desc: I18N.t('help.abilityAttackDesc') },
    { kind: 'special', title: I18N.t('help.abilitySpecial'), how: touchDevice ? I18N.t('help.abilitySpecialTouch') : I18N.t('help.abilitySpecialKey'), desc: I18N.t('help.abilitySpecialDesc', { cd: HERO.specialCooldown }) },
    { kind: 'pickaxe', title: I18N.t('help.abilityPickaxe'), how: touchDevice ? I18N.t('help.abilityPickaxeTouch') : I18N.t('help.abilityPickaxeKey'), desc: I18N.t('help.abilityPickaxeDesc', { gold: HERO.pickaxeGold, cd: HERO.pickaxeCooldown }) },
  ];
  if (progress.heroAbilityCry) {
    abilities.push({
      kind: 'cry', title: I18N.t('help.abilityCry'), how: touchDevice ? I18N.t('help.abilityCryTouch') : I18N.t('help.abilityCryKey'),
      desc: I18N.t('help.abilityCryDesc', {
        dmg: Math.round((SHOP.heroAbilityCry.dmgMult - 1) * 100),
        spd: Math.round((SHOP.heroAbilityCry.speedMult - 1) * 100),
        cd: SHOP.heroAbilityCry.cooldown,
      }),
    });
  }
  abilities.forEach(a => add(helpRow((canvas) => drawHeroActionIcon(canvas, a.kind), I18N.t('help.abilityLine', { title: a.title, how: a.how }), a.desc)));

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
    btn.innerHTML = `<canvas class="tool-icon-canvas" width="40" height="44"></canvas><div class="tool-cost">${t.cost}</div><div class="tool-key">${t.hotkey}</div>`;
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

function tryBuyUnit(id) {
  const t = UNIT_TYPES[id];
  if (match.gold >= t.cost) {
    match.gold -= t.cost;
    spawnUnit(match.world, 'player', id);
    dismissFirstMissionHint();
  } else {
    denyButton(`[data-unit="${id}"]`);
  }
}
function tryUpgrade() {
  const cost = currentUpgradeCost();
  if (match.gold >= cost) {
    match.gold -= cost;
    match.incomeLevel += 1;
    match.farmPulse = 1;
    dismissFirstMissionHint();
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
function updateHudStatic() {
  DOM.missionTitle.textContent = I18N.t('hud.missionTitle', { n: match.mission.id, age: match.age.name });
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
  DOM.heroFill.style.width = Math.max(0, w.hero.hp / w.hero.maxHp * 100) + '%';

  // Таймер автовоскрешения + выкуп (раунд 7) — видны, только пока герой
  // мёртв. Баг-репорт основателя, второй заход: чинил скрытие только для
  // паузы (там коробка ложилась поверх "Продолжить"), но тот же дефект
  // остался на справке «?» (и логически на любом другом оверлее сверху
  // боя). Правильное условие — не перечислять экраны по одному, а
  // показывать коробку ТОЛЬКО пока реально идёт бой (screen==='match');
  // на любом overlay-экране (паузе, справке, магазине с итога и т.п.) она
  // не нужна вообще — под ним всегда есть свой способ вернуться в бой.
  DOM.heroReviveBox.classList.toggle('hidden', w.hero.alive || screen !== 'match');
  if (!w.hero.alive) {
    const secs = Math.max(0, Math.ceil(w.hero.respawnTimer));
    DOM.heroReviveTimer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    DOM.buybackCostText.textContent = currentBuybackCost();
    DOM.btnBuyback.disabled = match.gold < currentBuybackCost();
  }

  match.unlockedUnits.forEach(id => {
    const t = UNIT_TYPES[id];
    const btn = DOM.toolbar.querySelector(`[data-unit="${id}"]`);
    btn.classList.toggle('disabled', match.gold < t.cost);
  });
  const upBtn = document.getElementById('upgradeBtn');
  const upCost = currentUpgradeCost();
  document.getElementById('upgradeCost').textContent = upCost;
  upBtn.classList.toggle('disabled', match.gold < upCost);

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
function updateShake(m, dt) {
  m.shake.mag = Math.max(0, m.shake.mag - dt * 24);
  if (m.shake.mag > 0.05) {
    m.shake.x = (Math.random() * 2 - 1) * m.shake.mag;
    m.shake.y = (Math.random() * 2 - 1) * m.shake.mag;
  } else { m.shake.x = 0; m.shake.y = 0; }
}

// ---------------------------------------------------------------- end of match
function endMatch(result) {
  match.resolved = true;
  lastResult = result;
  // Валюта магазина копится за убийства независимо от исхода миссии
  // (см. ПЛАН.md, раунд 3).
  progress.shopCurrency = (progress.shopCurrency || 0) + Math.round(match.shopKills);
  saveProgress(progress);
  // Округляем — накопление идёт дробными шагами decay-множителя (0.8/0.6/…),
  // без round тут вылезали хвосты вида "+22.7999999999995" (баг-репорт).
  // Утро 08.09.2026 (баг-репорт основателя — окно победы слишком длинное):
  // награда больше не часть предложения, а отдельный крупный виджет
  // (#resultReward) — общий для победы и поражения, чтобы очки за миссию
  // выглядели одинаково узнаваемо на обоих исходах.
  const rewardAmount = Math.round(match.shopKills);
  DOM.resultReward.classList.remove('hidden');
  DOM.resultRewardAmount.textContent = rewardAmount;
  DOM.resultCard.classList.toggle('win', result === 'win');
  DOM.resultCard.classList.toggle('lose', result !== 'win');
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
    DOM.resultText.textContent = I18N.t('result.defeatText', { cause: causeText });
    DOM.btnNext.classList.add('hidden');
    DOM.btnRetry.classList.remove('hidden'); // единственный экран, где остаётся
    // Решение основателя 23.09.2026: реклама за награду и после поражения —
    // та же x2 за миссию, помогает купить улучшения к следующей попытке.
    renderResultAdRow(rewardAmount, false);
  }
  if (result === 'win') PLATFORM.preloadInterstitial();
  setTimeout(() => {
    showScreen('result');
    // Заметный разовый всплеск конфетти у своей базы на победу — чтобы
    // «живой» фон читался с первого взгляда, а не только при пристальном
    // сравнении кадров (раунд 7, повторная жалоба на «статичный» экран).
    if (result === 'win') {
      const coreX = match.world.playerCore.x;
      spawnParticles(match, coreX, -60, '#f2c94c', 16);
      spawnParticles(match, coreX, -60, '#8fd6ff', 10);
      spawnParticles(match, coreX, -60, '#ff8a5c', 10);
      // Утро — «под финальный трек он хочет фейерверк: салюты, конфетти,
      // мишура» — залпы по всей ширине арены в течение ~4с (примерно
      // столько играет вступление campaign_victory.mp3), не один разовый
      // всплеск у базы, как на обычной победе.
      if (isCampaignComplete) fireCampaignFireworks(match);
    }
  }, 700);
}

// Реклама за вознаграждение на экране итога миссии (ночь 07→08.09.2026).
// Обе кнопки ПРЯМО называют рекламу и награду в тексте (требование
// площадок — Яндекс, требования к игре, п.4.5.1; VK — аналогично, см.
// «Документация ВК — Реклама в играх», раздел «Реклама за вознаграждение»),
// не просто "Получить x3". Ни одна не блокирует «Далее» — обе строго
// опциональный бонус (п.4.5.2: награда не должна влиять на возможность
// продолжить игровой процесс).
function renderResultAdRow(earnedDiamonds, isChapterFinal) {
  DOM.resultAdRow.innerHTML = '';
  const showMissionAd = earnedDiamonds > 0;
  DOM.resultAdRow.classList.toggle('hidden', !showMissionAd && !isChapterFinal);

  function makeAdButton(label, amount, onGranted) {
    const btn = document.createElement('button');
    btn.className = 'menu-btn ad-reward-btn';
    const setLabel = () => { btn.innerHTML = `${I18N.t('result.adWatchPrefix')} ${label} <span class="ad-reward-amount">(+${amount} 💎)</span>`; };
    setLabel();

    function wireClick() {
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = I18N.t('result.adLoading');
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
          btn.textContent = I18N.t('result.adUnavailableBtn');
          if (++attempts < AD_RECHECK_MAX_ATTEMPTS) setTimeout(check, AD_RECHECK_INTERVAL_MS);
        });
      };
      check();
    }
    return btn;
  }

  if (showMissionAd) {
    const bonus = earnedDiamonds * (SHOP.adMissionMultiplier - 1);
    // Утро 08.09.2026 (баг-репорт основателя — кнопка «очень широкая»):
    // слово-название валюты убрано из середины подписи — тот же смысл
    // передаёт значок в сумме справа, кнопка короче почти на треть.
    DOM.resultAdRow.appendChild(makeAdButton(`x${SHOP.adMissionMultiplier}`, bonus, () => {
      progress.shopCurrency += bonus;
      DOM.shopCurrencyText.textContent = Math.floor(progress.shopCurrency);
    }));
  }
  if (isChapterFinal) {
    DOM.resultAdRow.appendChild(makeAdButton(I18N.t('result.adBonusLabel'), SHOP.adChapterBonus, () => {
      progress.shopCurrency += SHOP.adChapterBonus;
      DOM.shopCurrencyText.textContent = Math.floor(progress.shopCurrency);
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

// ---------------------------------------------------------------- input
// Баг-репорт (раунд 7): спам пробела заодно «спамил» последнюю нажатую
// кнопку тулбара (покупка юнита/апгрейд). Причина — нативное поведение
// <button>: если фокус остался на DOM-кнопке (после клика мышью/тапа), то
// Space/Enter активируют именно её, ПОВЕРХ игрового хоткея атаки. Фикс —
// глушим дефолтное поведение клавиш, которые игра сама обрабатывает, и
// снимаем фокус с любой toolbar-кнопки сразу после клика.
// Раунд 9: спец-удар K -> R, апгрейд дохода U -> Q; K освободился под новую
// способность "Боевой клич" (см. handleHotkey).
const GAME_KEYS = new Set(['Space', 'KeyJ', 'KeyR', 'KeyE', 'ShiftLeft', 'ShiftRight', 'KeyF', 'KeyQ', 'KeyB', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyP', 'Escape']);
window.addEventListener('keydown', (e) => {
  if (screen === 'match' && GAME_KEYS.has(e.code)) e.preventDefault();
  if (keysDown.has(e.code)) return;
  keysDown.add(e.code);
  handleHotkey(e.code, e.key);
});
window.addEventListener('keyup', (e) => keysDown.delete(e.code));

function handleHotkey(code, key) {
  if (code === 'KeyP' || code === 'Escape') {
    if (screen === 'help') { stopHelpAnim(); showScreen('paused'); return; }
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
  // Реклама за вознаграждение (Яндекс/VK) обязана ставить игровой процесс
  // на паузу, пока показывается (требования площадок, п.4.7) — см.
  // PLATFORM.setPauseHooks() выше.
  // pageHidden — та же пауза цикла, что и на рекламе (см. onVisibilityChange
  // выше): фоновая вкладка не должна досчитывать бой/анимации, пока
  // невидима игроку (модерация, п.1.3).
  if (adPlaying || pageHidden) { requestAnimationFrame(frame); return; }
  if (screen === 'match') {
    acc += dt;
    // Подсказка новичку замедляет игру на 50% (запрос основателя, раунд 5) —
    // шаг симуляции уменьшается вдвое, число шагов в секунду не меняется.
    const timeScale = (match && match.introHintActive) ? 0.5 : 1;
    while (acc >= STEP) { update(STEP * timeScale); acc -= STEP; }
    render();
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
  requestAnimationFrame(frame);
}

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
        vx: (best.x > tw.x ? 1 : -1) * 420, dmg: tw.dmg,
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

function update(dt) {
  // Отсчёт 3…2…1 перед первым заходом новичка (раунд 5) — бой и экономика
  // заморожены, рендер продолжается (см. frame()), отсчёт идёт в реальном
  // времени (сюда всегда приходит немасштабированный dt, т.к. слоу-мо
  // подсказки включается только после отсчёта).
  if (match.countdown > 0) {
    match.countdown -= dt;
    if (match.countdown > 0) {
      DOM.countdownNum.textContent = String(Math.ceil(match.countdown));
    } else {
      DOM.countdownOverlay.classList.add('hidden');
      showFirstMissionHint(true, true);
    }
    return;
  }

  match.elapsed += dt;
  input.moveAxis = computeMoveAxis();

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

  updateUnits(match.world, dt, onKillGold);
  updateHero(match.world, dt, input, onKillGold);
  updateEnemyAI(match.world, match.ai, match.mission, dt, match.gold);
  updateEnemyBaseBuffs(match);
  updateTowers(dt, onKillGold);
  updateEnemyTowers(dt);
  updateTrap(dt, onKillGold);
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
  const dn = computeDayNight(displayElapsed);
  // Статичные слои запечены один раз на миссию (bakeArenaBackground):
  // небо → солнце/луна → облака → горы+земля → мошки → ночное затемнение.
  if (!match.bg || match.bg.ageId !== age.id) match.bg = bakeArenaBackground(age);
  const bgW = ARENA.width + BG_PAD * 2, bgH = ARENA.height + BG_PAD * 2;
  ctx.save();
  ctx.translate(match.shake.x, match.shake.y);
  ctx.drawImage(match.bg.sky, -BG_PAD, -BG_PAD, bgW, bgH);

  // солнце/луна по дуге неба; ореол у горизонта — большой и тёплый (закат
  // обложки), в зените — компактнее
  const bodyX = 90 + dn.localT * (ARENA.width - 180);
  const bodyY = ARENA.groundY - 30 - dn.alt * 210;
  const low = 1 - dn.alt;
  const glowR = dn.sunUp ? 70 + low * 110 : 34 + low * 16;
  const glow = ctx.createRadialGradient(bodyX, bodyY, 0, bodyX, bodyY, glowR);
  if (dn.sunUp) {
    glow.addColorStop(0, hexAlpha(age.sunGlow, 0.8));
    glow.addColorStop(0.3, hexAlpha(age.sunGlow, 0.3));
    glow.addColorStop(1, hexAlpha(age.sunGlow, 0));
  } else {
    glow.addColorStop(0, 'rgba(205,218,255,.4)');
    glow.addColorStop(1, 'rgba(205,218,255,0)');
  }
  ctx.fillStyle = glow;
  ctx.fillRect(bodyX - glowR, bodyY - glowR, glowR * 2, glowR * 2);
  ctx.fillStyle = dn.sunUp ? '#fff1c8' : '#e6ecff';
  ctx.beginPath(); ctx.arc(bodyX, bodyY, dn.sunUp ? 16 : 11, 0, Math.PI * 2); ctx.fill();

  // облака — между солнцем и горами, дрейфуют по ветру
  for (const c of match.clouds) drawCloud(c.x, c.y, c.scale);

  ctx.drawImage(match.bg.land, -BG_PAD, -BG_PAD, bgW, bgH);
  drawMotes(age, displayElapsed);

  // ночное затемнение — только фон/окружение (постройки, юниты и HUD
  // рисуются после и остаются читаемыми в любое время суток), синеватое
  const darkness = (1 - dn.light) * 0.5;
  if (darkness > 0.02) {
    ctx.fillStyle = `rgba(10,14,40,${darkness})`;
    ctx.fillRect(-BG_PAD, -BG_PAD, bgW, bgH);
  }

  drawCore(match.world.playerCore, 1, age);
  drawCore(match.world.enemyCore, -1, age);
  drawFarm(16, match.incomeLevel, match.farmPulse, age);
  for (const tw of match.world.towers) drawTower(tw);
  for (const tw of match.world.enemyTowers) drawTower(tw);
  for (const tr of match.world.traps) drawTrap(tr);

  // Раунд 14: снаряды со своей формой и дугой полёта (vfx.js), не жёлтые
  // капли; юниты — свои светлые, враги чёрные силуэты (ART, решение
  // основателя 2026-09-19), время — для дыхания в покое и пульса ауры.
  for (const p of match.world.projectiles) VFX.drawProjectile(ctx, p, age, ARENA.groundY);

  const celebrate = screen === 'result' && lastResult === 'win';
  const poseTime = match.elapsed + (match.resultElapsed || 0);
  for (const u of match.world.units) {
    const t = UNIT_TYPES[u.typeId];
    const weapon = age.weapon[t.role] || null;
    const attackPhase = u.state === 'attack' ? (1 - Math.max(0, u.attackTimer) / t.atkInterval) : null;
    const deathT = u.state === 'dead' ? u.deathT : null;
    const cheer = celebrate && u.team === 'player' && !deathT;
    const enemy = u.team !== 'player';
    const commonPose = {
      x: u.x + (u.knockback || 0), y: ARENA.groundY,
      scale: (u.elite ? 1.35 : 1) * (t.heightMult || 1),
      color: enemy ? ART.enemy.fill : ART.player.fill,
      outline: enemy ? (u.elite ? ART.enemy.eliteOutline : ART.enemy.outline) : ART.player.outline,
      enemy, elite: !!u.elite, buffed: u.buffTimer > 0, time: poseTime + (u.id % 7) * 0.9,
      facing: u.dir,
      walkPhase: cheer ? match.resultElapsed * 6 : u.walkPhase,
      moving: cheer ? true : u.state === 'walk',
      attackPhase, deathT, hitFlash: u.hitFlash, cheer,
      roleAccent: ROLE_ACCENT[t.role],
    };
    if (t.role === 'rider') {
      drawRiderPair(ctx, commonPose);
    } else if (t.role === 'breaker') {
      drawStickman(ctx, {
        ...commonPose, weapon: null, bent: !cheer, chainBall: true,
        chainLag: u.chainLag, chainTaut: u.chainTaut,
      });
    } else {
      // Щитоносец (раунд 8) — нейтральный серый щит-проп, отдельный от
      // тиров прокачки героя (та же drawShieldProp, другой параметр цвета).
      drawStickman(ctx, { ...commonPose, weapon: cheer ? null : weapon, shieldColor: t.shieldProp ? '#8a8a8a' : null });
    }
  }

  const hero = match.world.hero;
  if (hero.alive) {
    drawStickman(ctx, {
      x: hero.x + (hero.knockback || 0), y: ARENA.groundY, scale: 1.12,
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

  // Частицы и всплывающие «+N» — p.y хранится как смещение от линии земли
  // (не абсолютная канвас-координата — баг раунда 3, см. историю).
  VFX.draw(ctx, match, ARENA.groundY);

  ctx.restore();
}

// Постройки «под обложку» (раунд 14, ТЗ_ВИЗУАЛ_ПОД_ОБЛОЖКУ.md): дерево и
// камень из палитры эпохи (AGES.woodLight/woodDark/stone), тёмные щели,
// тёплые блики. Здание апгрейда дохода — хижина, растёт с уровнем, при
// покупке подскакивает (фидбэк основателя, раунд 3: доход должен быть
// виден на поле, не только числом в HUD). Стоит у подножия холма
// крепости (x=16), левее частокола — на холме её закрыла бы стена.
function drawFarm(x, level, pulse, age) {
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
  // табличка уровня
  ctx.fillStyle = '#d9c39a'; ctx.strokeStyle = age.woodDark; ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-6, -h + 2, 12, 8, 1.5); else ctx.rect(-6, -h + 2, 12, 8);
  ctx.fill(); ctx.stroke();
  ctx.font = 'bold 7px sans-serif'; ctx.fillStyle = '#3a2a16'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(level), 0, -h + 8.5);
  ctx.restore();
}

// Башня лучника — покупка магазина (ПЛАН.md, раунд 3): вышка в стиле
// сторожевой башни крепости — столбы с перекрестьем, открытая площадка с
// перилами и лучник, который натягивает лук (tw.fireFlash — вспышка
// выстрела, см. updateTowers/updateEnemyTowers). Вражеские башни (ai.js)
// рисуются той же функцией — своя/чужая определяется половиной арены
// (все постройки игрока стоят в левой), лучник врага — чёрный силуэт.
function drawTower(tw) {
  const age = match.age;
  const enemy = tw.x > ARENA.width / 2;
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
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 34);
  g.addColorStop(0, 'rgba(255,236,210,.2)'); g.addColorStop(1, 'rgba(255,236,210,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, 36, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,222,.15)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 8, 0, 0, Math.PI * 2);
  ctx.ellipse(16, -4, 15, 7, 0, 0, Math.PI * 2);
  ctx.ellipse(-15, -3, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();
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
function drawPalisade(age, x0, x1, baseY, top, hpFrac, bronze) {
  const count = 12, pitch = (x1 - x0) / count, lw = pitch - 1;
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
}
// Кладка (iron): тело стены, ряды блоков со сдвигом, зубцы поверху, железные
// накладки с заклёпками. Повреждения — трещина и выбитые блоки.
function drawMasonryWall(age, x0, x1, baseY, top, hpFrac) {
  ctx.fillStyle = age.stone; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.rect(x0, top + 4, x1 - x0, baseY - top - 4); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1;
  let row = 0;
  for (let ly = top + 12; ly < baseY - 2; ly += 8, row++) {
    ctx.beginPath(); ctx.moveTo(x0, ly); ctx.lineTo(x1, ly); ctx.stroke();
    for (let lx = x0 + (row % 2 ? 6 : 0); lx < x1; lx += 12) { ctx.beginPath(); ctx.moveTo(lx, ly - 8); ctx.lineTo(lx, ly); ctx.stroke(); }
  }
  ctx.fillStyle = age.stone; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2;
  for (let lx = x0; lx < x1 - 4; lx += 12) { ctx.beginPath(); ctx.rect(lx, top - 4, 7, 8); ctx.fill(); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
  for (const [px, py] of [[x0 + 6, top + 22], [x0 + 46, top + 22], [x0 + 26, top + 38]]) {
    ctx.fillStyle = '#5e636c';
    ctx.beginPath(); ctx.rect(px, py, 16, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a8aeb8';
    for (const [rx, ry] of [[2, 2], [13, 2], [2, 6], [13, 6]]) ctx.fillRect(px + rx, py + ry, 1.5, 1.5);
  }
  if (hpFrac < 0.6) {
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x0 + 30, top + 6); ctx.lineTo(x0 + 34, top + 18); ctx.lineTo(x0 + 29, top + 30); ctx.lineTo(x0 + 35, top + 44); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(x0 + 12, top + 12, 12, 8);
    if (hpFrac < 0.4) ctx.fillRect(x0 + 60, top + 28, 12, 8);
  }
  ctx.fillStyle = 'rgba(255,235,210,.08)'; ctx.fillRect(x0, top + 4, x1 - x0, 2);
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
  const poleTop = apexY - 30;
  ctx.strokeStyle = '#2a1c10'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, apexY + 2); ctx.lineTo(cx, poleTop); ctx.stroke();
  const wave = Math.sin(now / 300) * 5, wave2 = Math.sin(now / 300 + 1.3) * 3;
  ctx.fillStyle = (side > 0 && progress.cosmeticFlag === 'gold') ? ART.flags.gold : (side > 0 ? ART.flags.player : ART.flags.enemy);
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, poleTop);
  ctx.quadraticCurveTo(cx - 12, poleTop + 3 + wave2, cx - 24 - wave, poleTop + 6);
  ctx.quadraticCurveTo(cx - 12, poleTop + 9 + wave2, cx, poleTop + 13);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}
// Разрушенная крепость: обломки столбов башни, упавшие брёвна под углом,
// груда камней, уцелевший кусок стены, дым из руин.
function drawRuins(age, x0, x1, baseY, now) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = age.woodDark; ctx.lineWidth = 3.2;
  for (const [px, h] of [[-31, 22], [-7, 14]]) { ctx.beginPath(); ctx.moveTo(px, baseY); ctx.lineTo(px + 2, baseY - h); ctx.stroke(); }
  ctx.fillStyle = age.stone; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.2;
  for (const [dx, r] of [[-14, 7], [8, 9], [26, 6], [-30, 5]]) { ctx.beginPath(); ctx.ellipse(dx, baseY - 2, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  for (let i = 0; i < 5; i++) {
    const lx = x0 + 6 + i * 17, ang = -0.25 - (i % 3) * 0.22;
    ctx.save(); ctx.translate(lx, baseY - 2); ctx.rotate(ang);
    ctx.fillStyle = i % 2 ? age.woodDark : age.woodLight; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.rect(0, -3, 26 + (i % 2) * 8, 6); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = age.woodLight; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2;
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
function drawCore(core, side, age) {
  const alive = core.hp > 0;
  const hpFrac = core.maxHp > 0 ? Math.max(0, core.hp / core.maxHp) : 0;
  const now = performance.now();
  const iron = age.id === 'iron', bronze = age.id === 'bronze';
  const flash = core.hitFlash > 0 ? core.hitFlash : 0;
  if (flash > 0) core.hitFlash = Math.max(0, flash - 0.06);
  ctx.save();
  ctx.translate(core.x, ARENA.groundY);
  ctx.scale(side, 1);
  ctx.lineJoin = 'round';

  const moundH = bronze ? 16 : iron ? 14 : 11;
  const wallX0 = -40, wallX1 = 46, wallH = 54;
  const gateX0 = 20, gateX1 = 42, gateH = 34;
  const top = -moundH - wallH;

  // каменный холм-основание с кладкой
  ctx.fillStyle = age.stone; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-54, 0); ctx.lineTo(-46, -moundH); ctx.lineTo(56, -moundH); ctx.lineTo(62, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1;
  for (let ly = -moundH + 5; ly < -1; ly += 5) { ctx.beginPath(); ctx.moveTo(-50, ly); ctx.lineTo(60, ly); ctx.stroke(); }
  for (let lx = -44; lx < 58; lx += 11) { const o = ((lx / 11) | 0) % 2 ? 2.5 : 0; ctx.beginPath(); ctx.moveTo(lx, -moundH + o); ctx.lineTo(lx, -moundH + o + 5); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,235,200,.10)'; ctx.fillRect(-46, -moundH, 102, 2);

  if (alive) {
    drawWatchtower(age, -19, -moundH, top - 26, side, now, iron);
    if (iron) drawMasonryWall(age, wallX0, wallX1, -moundH, top, hpFrac);
    else drawPalisade(age, wallX0, wallX1, -moundH, top, hpFrac, bronze);
    // ворота — тёмная арка со стороны линии боя, перемычка сверху
    const gcx = (gateX0 + gateX1) / 2, gcy = -moundH - gateH + 11;
    ctx.fillStyle = '#1a100a';
    ctx.beginPath(); ctx.moveTo(gateX0, -moundH); ctx.lineTo(gateX0, gcy); ctx.arc(gcx, gcy, 11, Math.PI, 0); ctx.lineTo(gateX1, -moundH); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,170,.18)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(gateX0 + 1, -moundH); ctx.lineTo(gateX0 + 1, gcy); ctx.arc(gcx, gcy, 10, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = age.woodDark; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.2;
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
    // вспышка попадания по стене
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.55})`; ctx.fillRect(wallX0, top - 8, wallX1 - wallX0, wallH + 8); }
    if (hpFrac < 0.3) drawSmoke(-19, top - 20, now, 3, 'rgba(70,60,55,.4)');
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

requestAnimationFrame(frame);
// Локализация (Яндекс, п.2.14 — см. ТЗ_ЛОКАЛИЗАЦИЯ_11_ЯЗЫКОВ.md): первая
// отрисовка ЛЮБОГО экрана (в т.ч. #screenMenu, который по умолчанию скрыт
// в разметке — см. index.html) откладывается до PLATFORM.ready, чтобы язык
// (см. platform.js, applyDetectedLanguage()) был определён и применён
// (I18N.applyToDOM()) ДО того, как игрок увидит хоть один экран — игра
// обязана открыться сразу на нужном языке, без мигания русским.
PLATFORM.ready.then(async () => {
  I18N.applyToDOM();
  setFirstHintLine1();
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
    // Ночная правка (жалоба ревьюеров №1/№2): раньше игра проваливалась в
    // бой мгновенно, игрок не успевал узнать, что вообще есть меню/магазин/
    // плейлист. Даём меню мелькнуть на 0.7с перед авто-стартом — сам
    // авто-старт (осознанное решение раунда 5) не убираем.
    showScreen('menu');
    setTimeout(() => startMission(0, { intro: true }), 700);
  } else {
    showScreen('menu');
  }
  BOOT.firstScreen();
  // Сэмплы SFX — сразу после первого экрана, чтобы первый бой уже звучал;
  // старт не ждёт.
  SFX.preload();
});
