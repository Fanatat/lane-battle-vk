// Балансные данные игры «Две крепости». Один читаемый файл вместо JSON —
// см. КОНЦЕПТ_ГДД.md, раздел «Предметы и данные».
'use strict';

const ARENA = {
  width: 1000,
  height: 400,
  groundY: 322,
  coreWidth: 64,
  playerCoreX: 8,
  enemyCoreX: 928,
  laneMin: 96,   // левая граница, где могут стоять юниты
  laneMax: 904,  // правая граница
};

// Габариты "донжона" крепости в drawCore() (game.js) — расстояние от
// core.x до ближнего/дальнего края башни-донжона по стороне, обращённой
// к линии боя. Вынесено сюда единым источником истины: раньше вражеские
// защитные башни (ai.js, applyEnemyBaseBuff) ставились по своей отдельной
// формуле от core.x, не учитывающей эти габариты вообще, — вторая башня
// вставала прямо поверх спрайта донжона (баг-репорт основателя, скриншот
// "1788791898991.jpg"). У игрока то же не воспроизводилось только потому,
// что его башни магазина стоят на фиксированных x с запасом, случайно не
// задевающим донжон — не потому, что там была верная формула.
const CORE_KEEP_NEAR = 12; // ближний к core.x край донжона
const CORE_KEEP_FAR = 42;  // дальний (к линии боя) край донжона

// Эпохи: меняют только силуэт оружия и палитру фона, не баланс боя.
const AGES = {
  stone: {
    id: 'stone',
    get name() { return I18N.t('age.stone'); },
    sky: ['#3a2f28', '#6b4f3a'],
    hills: '#4d3a2a',
    hills2: '#6b5138',
    ground: '#8a6a45',
    weapon: { melee: 'club', spear: 'stick_spear', ranged: 'sling', heavy: 'stone_hammer' },
    coreBody: '#8a6a45', coreDark: '#5c4630', coreAccent: '#c9a35a', flame: '#ffb04c',
  },
  bronze: {
    id: 'bronze',
    get name() { return I18N.t('age.bronze'); },
    sky: ['#2c3a33', '#4d6b58'],
    hills: '#2f4a3a',
    hills2: '#3f6048',
    ground: '#5c7a58',
    weapon: { melee: 'sword', spear: 'bronze_spear', ranged: 'bow', heavy: 'axe' },
    coreBody: '#6b6250', coreDark: '#443e32', coreAccent: '#cd8a3c', flame: '#ffb04c',
  },
  iron: {
    id: 'iron',
    get name() { return I18N.t('age.iron'); },
    sky: ['#2a2c33', '#4a4d5c'],
    hills: '#33363f',
    hills2: '#454955',
    ground: '#5a5d68',
    weapon: { melee: 'bayonet', spear: 'pike', ranged: 'rifle', heavy: 'cannonarm' },
    coreBody: '#565b66', coreDark: '#33363d', coreAccent: '#9aa4b0', flame: '#bfe6ff',
  },
};

// Роли юнитов (общий баланс на все эпохи — эпоха меняет только рисунок).
const UNIT_TYPES = {
  infantry: {
    id: 'infantry', get name() { return I18N.t('unit.infantry'); }, role: 'melee', hotkey: '1',
    cost: 20, hp: 60, dmg: 9, range: 26, atkInterval: 0.7, speed: 62,
    unlockMission: 1,
  },
  spear: {
    id: 'spear', get name() { return I18N.t('unit.spear'); }, role: 'spear', hotkey: '2',
    cost: 34, hp: 70, dmg: 15, range: 34, atkInterval: 0.9, speed: 54,
    unlockMission: 3,
  },
  archer: {
    id: 'archer', get name() { return I18N.t('unit.archer'); }, role: 'ranged', hotkey: '3',
    cost: 40, hp: 32, dmg: 11, range: 190, atkInterval: 1.1, speed: 58,
    projectileSpeed: 420,
    unlockMission: 1,
  },
  heavy: {
    id: 'heavy', get name() { return I18N.t('unit.heavy'); }, role: 'heavy', hotkey: '4',
    cost: 70, hp: 170, dmg: 22, range: 30, atkInterval: 1.3, speed: 34,
    unlockMission: 7,
  },
};

const UNIT_ORDER = ['infantry', 'spear', 'archer', 'heavy'];

// Спецюниты врага (раунд 5) — не в UNIT_ORDER: игрок их купить не может,
// только вражеская база спавнит их сама (бафы по HP% и рэндом-ростер).
const ENEMY_SPECIAL_TYPES = {
  slave: {
    id: 'slave', get name() { return I18N.t('unit.slave'); }, role: 'breaker',
    // Замах+удар — 2с анимации, кулдаун между ударами — ещё 2с (числа
    // основателя): итоговый цикл "атака" — 4с (см. attackPhase в rig.js,
    // свинг растянут на весь atkInterval).
    cost: 50, hp: 250, speed: 40, heightMult: 1.5,
    buildingDmg: 60, atkInterval: 4,
  },
  rider: {
    id: 'rider', get name() { return I18N.t('unit.rider'); }, role: 'rider',
    cost: 45, hp: 90, speed: 50,
    dmg: 10, range: 160, atkInterval: 1.2, projectileSpeed: 360, // верхний — камни на дистанции
    meleeDmg: 14, meleeRange: 28, meleeInterval: 0.8, // нижний — лоу-кик вплотную
  },
  // Раунд 8: основатель говорил про «4 новых типа для глав 2-5», в коде
  // их было 2 — добавлены ещё 2, см. КОНЦЕПТ_ГДД.md, «Допущения».
  shieldbearer: {
    id: 'shieldbearer', get name() { return I18N.t('unit.shieldbearer'); }, role: 'melee',
    cost: 55, hp: 140, dmg: 14, range: 28, atkInterval: 1.0, speed: 40,
    heightMult: 1.15, dmgReduction: 0.35, shieldProp: true,
  },
  bomber: {
    id: 'bomber', get name() { return I18N.t('unit.bomber'); }, role: 'ranged',
    cost: 55, hp: 45, dmg: 9, range: 170, atkInterval: 1.6, speed: 46,
    projectileSpeed: 300, splash: 24, // сплэш только по юнитам, не по герою/ядру
  },
};
Object.assign(UNIT_TYPES, ENEMY_SPECIAL_TYPES);

// Спецюнит по главам (раунд 8) — глава 1 не считается (её «спецюнит» —
// обычный лучник, уже в общей ротации, см. допущения); главы 2-5 получают
// новый тип, впервые доступный именно в этой главе.
const CHAPTER_SPECIAL_UNIT = { 2: 'slave', 3: 'rider', 4: 'shieldbearer', 5: 'bomber' };
function specialTypesUpToChapter(chapterId) {
  const ids = [];
  for (let c = 2; c <= chapterId; c++) if (CHAPTER_SPECIAL_UNIT[c]) ids.push(CHAPTER_SPECIAL_UNIT[c]);
  return ids;
}

// Адаптивный ИИ (раунд 8). Правка документации, раунд после стадии 3
// (баг-репорт основателя с телефона, запрос отчёта по ИИ): этот
// комментарий раньше описывал счёт по СУММАРНО заспавненным юнитам за
// матч — эта логика была признана багом и заменена в раунде 10 на счёт
// по ЖИВЫМ юнитам сейчас (см. updateAdaptiveAI() в ai.js, использует
// aliveUnitsOf()). Код с раунда 10 всегда был правильным, врал только
// текст здесь — само поведение этой правкой не меняется ни на бит.
// Каждая реакция — свой «перк» с независимым кулдауном; числа стартовые,
// основатель донастроит.
// Правка баланса (по отчёту об ИИ, решение основателя): раньше за один
// кадр могли сработать ВСЕ подходящие пороги разом (до 20 юнитов одним
// пакетом) — теперь добавлен globalCooldownSec, отдельный от кулдауна
// каждого порога: пока он не истёк, проверка вообще не идёт; по истечении
// проверяется текущее состояние заново и реализуется РОВНО ОДИН порог —
// самый высокий из тех, что и совпал по разнице, и свободен по своему
// кулдауну (см. updateAdaptiveAI() в ai.js). Канал выключен в главе 1
// (mission.chapterId < 2).
const ADAPTIVE_AI = {
  cooldownSec: 30,
  globalCooldownSec: 5,
  reactions: [
    { diff: 1, kind: 'react1' },
    { diff: 3, kind: 'react3' },
    { diff: 5, kind: 'react5' },
    { diff: 7, kind: 'react7' },
    { diff: 10, kind: 'react10' },
  ],
};

// Тир прокачки героя (меч/щит/броня) — визуально красится по уровню.
const GEAR_TIER_COLORS = ['#cd7f32', '#c0c0c0', '#ffd23f']; // бронза/серебро/золото

// Наказание за накопление золота у игрока (раунд 9, числа основателя):
// каждый раз, когда этот канал не на кулдауне, если золото > threshold —
// спавн floor(gold/unit) лучников с интервалом spawnInterval, независимо
// от прочих порогов ИИ (см. КОНЦЕПТ_ГДД.md, «Допущения»).
// Раунд 10 (правка основателя): было floor(gold/100), стало ceil(gold/150) —
// формула количества смягчена, порог срабатывания (>300) не менялся.
// Правка баланса (по отчёту об ИИ, решение основателя): порог 300 → 400,
// периодичность 10с → 12с, формула количества (ceil/150, без потолка) не
// менялась — основатель сверил её на примерах и она его устраивает. Канал
// выключен в главах 1-2 (mission.chapterId < 3), см. updateGoldHoardPunish()
// в ai.js.
const GOLD_HOARD = { threshold: 400, unit: 150, cooldownSec: 12, spawnInterval: 0.2, unitType: 'archer' };

// Различимость юнитов не должна держаться только на мелких линиях оружия —
// у каждой роли ещё и свой цвет опознавательной перевязи на торсе (см.
// ПЛАН.md, раунд 3: основатель отметил, что юниты визуально слились).
const ROLE_ACCENT = {
  melee: '#c94f3a',
  spear: '#3fae6b',
  ranged: '#3f8fd6',
  heavy: '#c99a3f',
};

const ECONOMY = {
  baseIncome: 6,       // золота в секунду у игрока на старте миссии
  incomeTickSec: 1,
  killGoldShare: 0.42, // доля стоимости юнита, выдаваемая убийце
  upgrade: {
    baseCost: 40,
    growth: 1.55,
    incomePctGain: 0.28, // +28% к доходу за апгрейд
  },
};

const HERO = {
  hp: 220,
  moveSpeed: 150,
  meleeRange: 40,
  meleeDmg: 16,
  meleeInterval: 0.5,
  specialRange: 110,
  specialDmg: 34,
  specialCooldown: 8,
  // Раунд 7 (баг-репорт): герой воскресал мгновенно/незаметно — задержка
  // поднята до минуты, чтобы смерть героя реально что-то значила, взамен
  // добавлен досрочный выкуп за золото (см. HERO.buybackCost, game.js).
  respawnDelay: 60,
  buybackCost: 50,
  pickaxeCooldown: 3,
  pickaxeGold: 4,
  baseKillCoin: 1, // золото герою за килл лично им — база рюкзака (см. ПЛАН.md)
};

// Кампания (раунд 5): главы — метрика прогресса, не отдельная визуальная
// эпоха (см. КОНЦЕПТ_ГДД.md, «Допущения») — 5 глав × 3 миссии = 15 миссий,
// эпоха продолжает меняться по диапазону миссий, не 1:1 с главой.
const CHAPTERS = [
  { id: 1, get name() { return I18N.t('chapter.1'); }, age: 'stone' },
  { id: 2, get name() { return I18N.t('chapter.2'); }, age: 'stone' },
  { id: 3, get name() { return I18N.t('chapter.3'); }, age: 'bronze' },
  { id: 4, get name() { return I18N.t('chapter.4'); }, age: 'bronze' },
  { id: 5, get name() { return I18N.t('chapter.5'); }, age: 'iron' },
];
const MISSIONS_PER_CHAPTER = 3;

// Сложность растёт прямопропорционально номеру миссии (запрос основателя),
// от значений бывшей миссии 1 (620/7/1×) до бывшей миссии 5 умноженной на
// запас для нового, более длинного хвоста кампании.
const MISSIONS = [];
(function generateMissions() {
  const total = CHAPTERS.length * MISSIONS_PER_CHAPTER;
  for (let i = 0; i < total; i++) {
    const t = i / (total - 1);
    const chapter = CHAPTERS[Math.floor(i / MISSIONS_PER_CHAPTER)];
    const levelInChapter = (i % MISSIONS_PER_CHAPTER) + 1;
    MISSIONS.push({
      id: i + 1,
      // Геттер, не строка: chapter.name сам геттер (I18N.t) — язык может
      // определиться уже ПОСЛЕ того, как этот массив сгенерирован при
      // загрузке скрипта (см. platform.js, асинхронное определение SDK),
      // значение обязано читаться заново при каждом обращении к .name.
      get name() { return `${chapter.name} ${levelInChapter}/${MISSIONS_PER_CHAPTER}`; },
      chapterId: chapter.id,
      age: chapter.age,
      playerCoreHp: 1000,
      enemyCoreHp: Math.round(600 + t * 1550),
      enemyIncome: +(7 + t * 13).toFixed(1),
      enemyEliteEvery: i === 0 ? 999 : Math.round(34 - t * 21),
      eliteHpMult: +(1 + t * 1.6).toFixed(2),
    });
  }
})();

// Магазин между раундами — валюта = убийства за миссию + остаток с
// прошлых раз (см. ПЛАН.md, раунд 3). Покупки — постоянные разблокировки,
// действуют в каждой следующей миссии (не однократная постройка в бою).
const SHOP = {
  towerA: { get name() { return I18N.t('shopname.towerA'); }, cost: 15, dmg: 9, range: 170, atkInterval: 1.3 },
  towerB: { get name() { return I18N.t('shopname.towerB'); }, cost: 25, dmg: 9, range: 170, atkInterval: 1.3, requires: 'towerA' },
  trap: { get name() { return I18N.t('shopname.trap'); }, cost: 20, dmg: 14, range: 20, cooldown: 2 },
  gearSword: { get name() { return I18N.t('shopname.gearSword'); }, costs: [10, 20, 35], dmgPerTier: 6 },
  gearShield: { get name() { return I18N.t('shopname.gearShield'); }, costs: [10, 20, 35], hpPerTier: 40 },
  gearArmor: { get name() { return I18N.t('shopname.gearArmor'); }, costs: [10, 20, 35], reductionPerTier: 0.1 },
  // Утренняя правка основателя: компенсация за возврат проверки facing у
  // удара по ядру (см. entities.js, updateHero) — платная дальность вместо
  // бесплатного изменения правила. Основатель ожидал ступенчатую покупку,
  // как остальное снаряжение героя (меч/щит/броня) — три уровня, не одна
  // покупка: +10% за уровень, суммарно +30% на III.
  gearLongBlade: { get name() { return I18N.t('shopname.gearLongBlade'); }, costs: [12, 22, 38], rangeMultPerTier: 0.1 },
  // cosmeticDay/cosmeticNight: .name нигде не читается (см. timeOfDayRow()
  // в game.js — там свои литералы 'День'/'Ночь', ключи shop.timeDay/
  // shop.timeNight) — оставлены как есть, переводить нечего.
  cosmeticDay: { name: 'Косметика: вечный день', cost: 8 },
  cosmeticNight: { name: 'Косметика: вечная ночь', cost: 8 },
  cosmeticFlagGold: { get name() { return I18N.t('shopname.cosmeticFlagGold'); }, cost: 6 },
  // Утренняя правка: «Героя можно не узнать» — плащ как отдельный,
  // асимметричный силуэт даёт герою читаемый визуальный якорь и заодно
  // явно продаёт разворот (плащ раскрывается при смене facing).
  cosmeticCloakRed: { get name() { return I18N.t('shopname.cosmeticCloakRed'); }, cost: 20 },
  // Утренняя правка основателя: сине-красная гамма (изначально сделанная
  // только для магазина) переезжает из "по умолчанию" в платную "обёртку"
  // интерфейса — покупка за внутриигровую валюту, применяется на ВЕСЬ
  // интерфейс (не только магазин), владение отдельно от выбора темы, как
  // день/ночь. См. THEMES в этом файле.
  themeBlueRed: { get name() { return I18N.t('shopname.themeBlueRed'); }, cost: 50 },
  musicTrack2: { get name() { return I18N.t('shopname.musicTrack2'); }, cost: 12, trackId: 'battle_march' },
  musicTrack3: { get name() { return I18N.t('shopname.musicTrack3'); }, cost: 18, trackId: 'battle_pulse' },
  // DLC — два разных пути оплаты по площадкам (ночь 07→08.09.2026, задача
  // на релиз): на Яндексе — реальный ИНАП через SDK (costRub — только
  // ориентировочная подпись на случай, если каталог Яндекса ещё не
  // загрузился; настоящая цена берётся из консоли, см. js/platform.js).
  // На VK и в локальном тесте — покупка за очки (costDiamonds),
  // площадка не даёт своего API для внутренних микроплатежей игр без
  // отдельной денежной интеграции, а завести реальные деньги на VK —
  // отдельная задача с бэкендом, не входит в этот пакет (см. ВОПРОСЫ).
  // Утренняя правка (спецификация основателя): было одно DLC с путающим
  // описанием («кого именно усиливает?»), стало два раздельных, с чёткой
  // адресацией и тумблером вкл/выкл у каждого (обратимость — ночная
  // находка, необратимости в новой версии тоже нет).
  dlcHardMode: { get name() { return I18N.t('shopname.dlcHardMode'); }, costRub: 100, costDiamonds: 100, enemyUnitHpMult: 1.2, enemyUnitDmgMult: 1.2, enemyCoreHpMult: 1.5 },
  dlcPlayerBuff: { get name() { return I18N.t('shopname.dlcPlayerBuff'); }, costRub: 100, costDiamonds: 100, playerIncomeMult: 1.2, playerCoreHpMult: 1.2 },
  // Реклама за вознаграждение на экране итога миссии (ночь 07→08.09.2026):
  // xN очков за просмотр (adMissionMultiplier — множитель ИТОГОВОЙ суммы,
  // т.е. доплата = earned*(multiplier-1)) на каждой победе, и разовый бонус
  // за прохождение последней миссии главы (adChapterBonus).
  // Утро 08.09.2026, живой прогон основателя на реальном Яндекс-билде:
  // x3 ломает баланс экономики (сам это отметил) — снижено до x2; бонус
  // главы менялся дважды в одно утро — сначала 15→50 (ВОПРОСЫ_2026-09-08.md,
  // п.4), затем этим же прогоном 50→40 (финальное значение).
  adMissionMultiplier: 2,
  adChapterBonus: 40,
  // Раунд 8, п.H — новые покупки, разблокируемые по мере прохождения глав
  // (идея основателя + предложения агента, см. КОНЦЕПТ_ГДД.md/ПЛАН.md).
  trap2: { get name() { return I18N.t('shopname.trap2'); }, cost: 22, dmg: 14, range: 20, cooldown: 2, requiresChapter: 2 },
  towerC: { get name() { return I18N.t('shopname.towerC'); }, cost: 35, dmg: 9, range: 170, atkInterval: 1.3, requiresChapter: 3 },
  startGoldBoost: { get name() { return I18N.t('shopname.startGoldBoost'); }, cost: 18, amount: 20, requiresChapter: 4 },
  buybackDiscount: { get name() { return I18N.t('shopname.buybackDiscount'); }, cost: 20, discount: 15, requiresChapter: 5 },
  // Раунд 9 — новая способность героя (выбор агента, см. КОНЦЕПТ_ГДД.md,
  // «Допущения»): бафф своим юнитам на поле, хоткей K (освободился после
  // переноса спец-удара на R).
  // Раунд 10: кулдаун снижен с 20 до 15с по правке основателя.
  heroAbilityCry: { get name() { return I18N.t('shopname.heroAbilityCry'); }, cost: 30, dmgMult: 1.3, speedMult: 1.25, duration: 5, cooldown: 15 },
};

// Реестр тем оформления интерфейса (утренняя правка основателя) — вся
// разметка (панели, кнопки, HUD, паузы, итоги) уже красится через CSS
// custom properties (--royal-*/--cta-*/--secondary-*/--alert-*/--gold-text),
// поэтому новая тема — это просто набор значений этих переменных под
// `body.<cssClass>` (см. style.css) плюс запись здесь. Третья/четвёртая
// тема добавляются так же, без переписывания разметки или JS-логики
// применения (см. applyTheme() в game.js).
const THEMES = [
  { id: 'classic', get label() { return I18N.t('theme.classic'); }, cssClass: null, cost: 0, ownedKey: null },
  { id: 'blueRed', get label() { return SHOP.themeBlueRed.name; }, cssClass: 'theme-blue-red', cost: SHOP.themeBlueRed.cost, ownedKey: 'ownedThemeBlueRed' },
];

// Текущая глава по прогрессу (для чаптер-гейтинга покупок магазина и ИИ).
function unlockedChapter(progress) {
  const m = MISSIONS.find(mm => mm.id === progress.unlocked) || MISSIONS[MISSIONS.length - 1];
  return m.chapterId;
}

// Музыка (раунд 10) — реальные mp3 от основателя (Suno), процедурный
// WebAudio-луп из раунда 5 полностью убран (признан "посредственным", см.
// КОНЦЕПТ_ГДД.md). ownedKey — прогресс-флаг покупки, null = всегда доступен.
const MUSIC_TRACKS = {
  battle_theme: { get name() { return I18N.t('music.battle_theme'); }, file: 'assets/audio/battle_theme.mp3', ownedKey: null },
  battle_march: { get name() { return I18N.t('music.battle_march'); }, file: 'assets/audio/battle_march.mp3', ownedKey: 'musicTrack2' },
  battle_pulse: { get name() { return I18N.t('music.battle_pulse'); }, file: 'assets/audio/battle_pulse.mp3', ownedKey: 'musicTrack3' },
};
const MENU_MUSIC_TRACK = { name: 'Меню и пауза', file: 'assets/audio/menu_theme.mp3' };
// Утро — стинги на экраны итога (Suno, основатель): отдельный реестр, НЕ
// MUSIC_TRACKS — те попадают в плейлист боя (переключаемые треки), а эти
// не выбираются игроком, включаются автоматически по событию (см.
// endMatch() в game.js). Заменяют синтетические SFX.victory()/defeat() —
// основатель прямо попросил не смешивать с боевым треком, MUSIC.play()
// сам делает кроссфейд, дублировать канал не нужно.
const EVENT_TRACKS = {
  victory_sting: { name: 'Победа', file: 'assets/audio/victory_sting.mp3' },
  defeat_sting: { name: 'Поражение', file: 'assets/audio/defeat_sting.mp3' },
  campaign_victory: { name: 'Финал кампании', file: 'assets/audio/campaign_victory.mp3' },
};
const MUSIC_ORDER_DEFAULT = ['battle_theme', 'battle_march', 'battle_pulse'];

// Микс музыки (раунд 10, числа основателя): громкость растёт с числом
// живых юнитов на поле (+30% на 30+, плавно от 0), кроссфейд между
// треками, форс-переключение на "Пульс сражения" при 50+ юнитах — только
// если куплен и включён в плейлисте — с гистерезисом на возврат (не
// запрошено явно, но без него музыка дёргалась бы туда-обратно на
// границе 50, см. КОНЦЕПТ_ГДД.md).
const MUSIC_MIX = {
  crossfadeSec: 1.5,
  unitsForMaxVolume: 30,
  volumeBoostAtMaxUnits: 0.3,
  pulseThresholdUp: 50,
  pulseThresholdDown: 40,
};

// Валюта «очко» (раунд 5, переименована из «бриллиант» 08.09.2026 — три
// разных слова на одну сущность в бою/магазине/текстах основателя,
// единое название и значок см. КОНЦЕПТ_ГДД.md, «Допущения»): награда за
// килл убывает по времени матча —
// первые 10с 100%, дальше по -20 п.п. каждые 10с, с 41-й секунды и далее
// плато на 20% (числа основателя, см. ПЛАН.md, раунд 5).
const DIAMOND_DECAY = [
  { untilSec: 10, mult: 1 },
  { untilSec: 20, mult: 0.8 },
  { untilSec: 30, mult: 0.6 },
  { untilSec: 40, mult: 0.4 },
  { untilSec: Infinity, mult: 0.2 },
];
function diamondMultAt(elapsedSec) {
  for (const step of DIAMOND_DECAY) if (elapsedSec < step.untilSec) return step.mult;
  return 0.2;
}

// Бафы вражеской базы по остатку HP% — одноразовый триггер на каждый порог,
// пройденный сверху вниз (числа основателя, см. ПЛАН.md, раунд 5).
// Раунд 8: глиф — 4с (было 3, основатель попросил длиннее), и ко всем
// порогам применяется случайный разброс ±BUFF_THRESHOLD_JITTER — считается
// один раз на миссию (см. game.js/startMission), не каждый кадр.
// Правка баланса (по отчёту об ИИ, решение основателя): раньше было жёсткое
// соответствие «этот процент → этот баф», случайным был только сдвиг
// порога. Теперь порог и разброс уже, но случайным становится ещё и САМ
// БАФ — набор из пяти бафов перемешивается между пятью порогами один раз
// при старте миссии (см. jitterBuffThresholds ниже), заранее неизвестно,
// какой баф на каком пороге выпадет. Основатель сознательно принял
// следствие: обе башни могут выпасть на два самых ранних порога (90% и
// 70%) — тогда бой станет заметно тяжелее, это не баг.
const ENEMY_BASE_BUFF_THRESHOLDS = [0.90, 0.70, 0.50, 0.30, 0.15];
const ENEMY_BASE_BUFF_KINDS = ['giant', 'archers2', 'swarm5', 'tower1', 'tower2'];
const BUFF_THRESHOLD_JITTER = 0.05; // ±5% (было ±10%)
// Глиф неуязвимости на 5% HP — ОТДЕЛЬНО от жеребьёвки, всегда, без
// разброса (иначе порог мог бы уехать в ноль и не сработать никогда).
// Длительность (4с) не менялась — основатель просил изменить только
// внешний вид (см. радиус глифа, game.js/drawCore).
const ENEMY_GLYPH_THRESHOLD = 0.05;
const ENEMY_GLYPH_DURATION = 4;
function jitterBuffThresholds() {
  const kinds = [...ENEMY_BASE_BUFF_KINDS];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const rows = ENEMY_BASE_BUFF_THRESHOLDS.map((hpFrac, i) => ({
    kind: kinds[i],
    hpFrac: Math.max(0.04, Math.min(0.96, hpFrac + (Math.random() * 2 - 1) * BUFF_THRESHOLD_JITTER)),
  }));
  rows.push({ kind: 'glyph', duration: ENEMY_GLYPH_DURATION, hpFrac: ENEMY_GLYPH_THRESHOLD });
  return rows;
}

// HP построек (для юнита-«раба», который ломает только строения, см.
// ПЛАН.md, раунд 5): капкан — 2 удара до уничтожения, башня — 3 удара
// (buildingDmg раба — 60, см. ENEMY_SPECIAL_TYPES.slave).
const STRUCTURE_HP = { trap: 120, tower: 180 };
