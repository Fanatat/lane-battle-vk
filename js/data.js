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
// Раунд 14 (визуал «под обложку», см. ТЗ_ВИЗУАЛ_ПОД_ОБЛОЖКУ.md) — палитра
// расширена под «силуэтный закат» обложки: небо в три ступени + ореол
// солнца, три слоя гор, земля в три тона + светлая тропа, дерево/камень
// построек. Старые поля sky/hills/hills2/coreBody/coreDark убраны — их
// читали только tools/promo_*.html (не в сборке, см. ТЗ «Известные
// ограничения»); coreAccent остался (бронзовые обручи частокола).
// Раунд 15 (ТЗ_КАЧЕСТВО_CRAZYGAMES_2026-09-25.md, П1): аудит — «коричневое
// на коричневом», сцена без контраста. Все три эпохи светлее и насыщеннее,
// с явным разделением планов: небо (холодный верх → тёплый горизонт) /
// дальние горы в воздушной дымке / ближние холмы средним тоном (на нём
// читаются и светлые свои, и чёрные силуэты врагов) / земля — тёплая,
// светлая тропа вдоль линии боя. grass — цвет травы у тропы и кочек
// (null — эпоха без травы, щебень). farRidge — высота дальних гор в
// мировых единицах (кадр 16:9 показывает больше неба, чем 2.5:1).
const AGES = {
  stone: {
    id: 'stone',
    get name() { return I18N.t('age.stone'); },
    skyTop: '#3b74c4', skyMid: '#8fc3ea', skyHorizon: '#ffe0a3', sunGlow: '#fff0bf',
    mountains: ['#a9a6cc', '#8fa37a', '#6c8a45'],
    haze: 'rgba(255,238,205,.42)',
    groundTop: '#c2935a', ground: '#a3743f', groundDark: '#6f4b27', pathLight: '#e8cc92',
    grass: '#79a23b',
    woodLight: '#b07a44', woodDark: '#6e4424', stone: '#9a8c78',
    weapon: { melee: 'club', spear: 'stick_spear', ranged: 'sling', heavy: 'stone_hammer' },
    coreAccent: '#e0b860', flame: '#ffb04c', farRidge: 190,
    fort: 'palisade', // раунд 15 (И6): облик крепости по эпохе (drawCore)
  },
  bronze: {
    id: 'bronze',
    get name() { return I18N.t('age.bronze'); },
    skyTop: '#2f86b0', skyMid: '#96d6dc', skyHorizon: '#fbeab4', sunGlow: '#fff6cc',
    mountains: ['#a8bcc0', '#98a878', '#7c8c42'],
    haze: 'rgba(245,245,215,.42)',
    groundTop: '#cfae68', ground: '#ad8a4c', groundDark: '#735a30', pathLight: '#eedca0',
    grass: '#8a9c34',
    woodLight: '#a8773f', woodDark: '#644322', stone: '#a89d82',
    weapon: { melee: 'sword', spear: 'bronze_spear', ranged: 'bow', heavy: 'axe' },
    coreAccent: '#e39a42', flame: '#ffb04c', farRidge: 175,
    fort: 'stonewall', masonry: '#b9ad92', masonryDark: '#857a64', roof: '#a2522f', roofDark: '#6e3420',
  },
  iron: {
    id: 'iron',
    get name() { return I18N.t('age.iron'); },
    skyTop: '#5a6c8c', skyMid: '#b3bccb', skyHorizon: '#f6d6aa', sunGlow: '#ffe0b0',
    mountains: ['#a3a8b8', '#8f95a6', '#7a8192'],
    haze: 'rgba(235,225,215,.40)',
    groundTop: '#aea394', ground: '#8e8476', groundDark: '#5e564d', pathLight: '#d4c8b4',
    grass: null,
    woodLight: '#9a7652', woodDark: '#5a412c', stone: '#9c9ea8',
    weapon: { melee: 'bayonet', spear: 'pike', ranged: 'rifle', heavy: 'cannonarm' },
    coreAccent: '#b8c2ce', flame: '#bfe6ff', farRidge: 160,
    fort: 'brickfort', brick: '#b5643f', brickDark: '#7c3b24', brickLight: '#d08a60', cannon: '#2c2d31', cannonHi: '#6a6e78',
  },
};

// Арт-спецификация «под обложку» (раунд 14, ТЗ_ВИЗУАЛ_ПОД_ОБЛОЖКУ.md):
// единый источник цветов/толщин для рига, VFX и построек. Решения
// основателя 2026-09-19: свои — светлые, враги — чёрные силуэты, фигуры
// ~1.5x. Литералы по коду не дублировать — менять здесь.
// Раунд 15 (П1): свои — светлые с тёмным контуром; герой — золотой
// (заливка + золотой ореол-кромка поверх тёмного контура + маркер над
// головой: ART.hero.marker), чтобы его было видно среди своих с первого
// взгляда; враги — чёрные силуэты со СВЕТЛОЙ тёплой кромкой (тёмно-
// коричневая кромка раунда 14 терялась на фоне). rigScale 1.5 → 1.65:
// кадр стал на весь экран, фигуры — крупнее (только отрисовка).
const ART = {
  rigScale: 1.65,
  player: { fill: '#f6ecd2', outline: '#2a1a0e' },
  hero: { fill: '#ffd35c', outline: '#3a2406', gold: '#f6c94a', goldGlow: 'rgba(255,214,90,.45)', goldHi: '#fff3c4', rim: '#fff0a8', marker: '#ffcf3a' },
  enemy: { fill: '#16120e', outline: '#c98d55', eliteOutline: '#ff4a2a', eliteGlow: 'rgba(220,48,30,.45)' },
  shadow: 'rgba(40,20,0,.30)',
  slash: { hero: 'rgba(246,201,74,.55)', player: 'rgba(255,240,210,.45)', enemy: 'rgba(40,25,15,.55)', enemyRim: 'rgba(200,140,80,.5)' },
  spark: ['#ffd77a', '#ffb04c', '#ff8a3c'],
  dust: 'rgba(214,170,120,.35)',
  woodChip: '#4a2f1a',
  cryAura: 'rgba(255,138,60,.45)',
  flags: { player: '#5fb35a', enemy: '#c8301e', gold: '#f2c94c' },
  particleCap: 400,
  // Раунд 15 (И6): костюмы «роль × эпоха» (rig.js, drawStickman). Куратор:
  // «юниты безликие, после смены эпохи армия не меняется». У каждой роли в
  // каждой эпохе свой головной убор, корпус, щит/наплечники — узнаваемый
  // силуэт (референс — Stick War Legacy, Age of War). Свои — светлое тело
  // и синяя форма (accent — цвет стороны), враги — тот же покрой тёмным
  // силуэтом с тёплой кромкой и красным плюмажем; герой — золото.
  // head: band|bone|furcap|skull|crest|crestT|cone|corinth|shako|tricorne|
  //   morion|spike|heroStone|heroBronze|heroIron|none
  // body: hide|fur|cuirass|tunic|coat|rags; shield: wicker|hide|round|tower;
  // pads: fur|plate|epaulette; bulk — массивность (толще линии и корпус).
  costume: {
    pal: {
      player: {
        accent: '#3a78d0', cloth: '#4a86d4', clothDark: '#2b5a96', trim: '#f6ecd4',
        leather: '#c99b62', leatherDark: '#8a6238', fur: '#efe0bb', furDark: '#c2a06a',
        bronze: '#e6ad52', bronzeDark: '#a06c2c', steel: '#d3d8df', steelDark: '#88909c',
        wicker: '#d8b577', bone: '#f5edd8', hat: '#262c3c', trouser: '#ece6d8', slit: '#1a120a',
      },
      enemy: {
        accent: '#c23a22', cloth: '#2a1914', clothDark: '#140d0a', trim: '#5e2418',
        leather: '#261b14', leatherDark: '#120d09', fur: '#30261d', furDark: '#1a140f',
        bronze: '#3a2c1d', bronzeDark: '#1a140c', steel: '#34343b', steelDark: '#1c1c21',
        wicker: '#2c2218', bone: '#433628', hat: '#110d0b', trouser: '#16120e', slit: '#ff6a3a',
      },
      hero: {
        accent: '#d8372a', cloth: '#eaa92f', clothDark: '#b27316', trim: '#fff3c4',
        leather: '#e0a23c', leatherDark: '#99621a', fur: '#fff0bd', furDark: '#dcb55c',
        bronze: '#ffd65e', bronzeDark: '#b98518', steel: '#ffe28c', steelDark: '#b98518',
        wicker: '#e8c060', bone: '#fff6dc', hat: '#2c1f30', trouser: '#fff0c4', slit: '#3a2406',
        cape: '#2f6fd0', capeDark: '#15326e', // плащ героя — цвет своей стороны, контраст с золотом
      },
    },
    stone: {
      melee: { head: 'band', body: 'hide', shield: 'wicker' },
      spear: { head: 'bone', body: 'hide', strap: true },
      ranged: { head: 'furcap', body: 'fur' },
      heavy: { head: 'skull', body: 'hide', pads: 'fur', shield: 'hide', bulk: 1.3 },
      shieldbearer: { head: 'skull', body: 'hide', shield: 'tower' },
      bomber: { head: 'furcap', body: 'fur', satchel: true },
      hero: { head: 'heroStone', body: 'fur', cape: true },
    },
    bronze: {
      melee: { head: 'crest', body: 'cuirass', skirt: true, shield: 'round', greaves: true },
      spear: { head: 'crestT', body: 'cuirass', skirt: true, greaves: true },
      ranged: { head: 'cone', body: 'tunic', quiver: true },
      heavy: { head: 'corinth', body: 'cuirass', skirt: true, pads: 'plate', shield: 'round', greaves: true, bulk: 1.3 },
      shieldbearer: { head: 'corinth', body: 'cuirass', skirt: true, shield: 'tower', greaves: true },
      bomber: { head: 'cone', body: 'tunic', satchel: true },
      hero: { head: 'heroBronze', body: 'cuirass', skirt: true, cape: true, greaves: true },
    },
    iron: {
      melee: { head: 'shako', body: 'coat', belts: true, sleeves: true, trousers: true },
      spear: { head: 'morion', body: 'coat', sash: true, sleeves: true, trousers: true },
      ranged: { head: 'tricorne', body: 'coat', belts: true, sleeves: true, trousers: true },
      heavy: { head: 'spike', body: 'coat', pads: 'epaulette', sleeves: true, trousers: true, bulk: 1.3 },
      shieldbearer: { head: 'spike', body: 'coat', shield: 'tower', sleeves: true, trousers: true },
      bomber: { head: 'shako', body: 'coat', satchel: true, sleeves: true, trousers: true },
      hero: { head: 'heroIron', body: 'coat', pads: 'epaulette', cape: true, sleeves: true, trousers: true },
    },
    // вне эпох: «раб» — набедренная повязка и ошейник, носильщик «наездника»
    common: {
      slave: { head: 'none', body: 'rags', collar: true, headK: 0.62 },
      riderMount: { head: 'band', body: 'rags' },
    },
  },
  // Раунд 15 (И6): «Залп» по эпохе — огненные камни / горящие стрелы / ядра.
  volley: {
    stone: { core: '#6e5a48', rim: '#2a1a0e', fire: '#ffb04c', fireHi: '#fff0b0', trail: 'rgba(255,150,60,', smoke: 'rgba(90,70,55,.55)' },
    arrow: { core: '#e8dcc0', rim: '#3a2616', fire: '#ff9a3c', fireHi: '#fff4c8', trail: 'rgba(255,180,90,', smoke: 'rgba(120,100,80,.45)' },
    ball: { core: '#24211e', rim: '#6a5a4a', fire: '#ffcf6a', fireHi: '#fffbe0', trail: 'rgba(200,190,175,', smoke: 'rgba(70,66,62,.6)' },
    shadow: 'rgba(30,15,0,.42)',
  },
};

// Раунд 15 (И9, куратор: «воины идут одной линией на одной высоте и
// перекрывают друг друга — строй гуськом, глубины нет»). Три ряда по
// глубине, как в Stick War: юнит при спавне получает ряд (entities.js,
// spawnUnit — по кругу order, соседи по очереди в разных рядах); рисуется
// ниже линии земли на dy мировых px (дальний ряд — выше и чуть мельче),
// все фигуры сортируются по y (дальние — раньше). ТОЛЬКО отрисовка:
// x, хитбоксы, дальности, цели не меняются. Тень — на своём ряду.
// heroLane — ряд героя (он сортируется вместе с юнитами).
const UNIT_LANES = { dy: [0, 9, 18], scale: [0.95, 1, 1.04], order: [1, 0, 2], heroLane: 1 };

// Роли юнитов (общий баланс на все эпохи — эпоха меняет только рисунок).
// Раунд 15: смена эпохи ВНУТРИ боя дополнительно умножает статы и цену
// новых юнитов (AGE_UP ниже) — от стартовой эпохи миссии, не абсолютно.
const UNIT_TYPES = {
  infantry: {
    id: 'infantry', get name() { return I18N.t('unit.infantry'); }, role: 'melee', hotkey: '1',
    cost: 20, hp: 60, dmg: 9, range: 26, atkInterval: 0.7, speed: 62,
    unlockMission: 1,
  },
  spear: {
    id: 'spear', get name() { return I18N.t('unit.spear'); }, role: 'spear', hotkey: '2',
    cost: 34, hp: 70, dmg: 15, range: 34, atkInterval: 0.9, speed: 54,
    // Раунд 15 (П6): 3 юнита уже в миссии 1 — копейщик с 1 (было 3).
    unlockMission: 1,
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
    unlockMission: 3, // раунд 15 (П6): было 7
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
    // maxLevelByChapter — r15 И15 (ниже, блок I15): в главах 1–2 апгрейдов дохода за миссию не больше 2
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
  // Раунд 15 (П6, решение основателя): 60 → 20 с — минута без героя в
  // первых боях выглядела как «игра сломалась». Выкуп пересчитан под
  // короткий таймер: 50 → 30 золота.
  respawnDelay: 20,
  buybackCost: 30,
  pickaxeCooldown: 3,
  pickaxeGold: 4,
  baseKillCoin: 1, // золото герою за килл лично им — база рюкзака (см. ПЛАН.md)
};

// Раунд 15 (П6, ТЗ_КАЧЕСТВО_CRAZYGAMES_2026-09-25.md, ГДД «Допущения») —
// смена эпохи прямо в бою. Опыт команды копится за убийства (стоимость
// убитого юнита) и урон по вражескому ядру; на пороге кнопка «Новая эра»
// переводит армию игрока в следующую эпоху. Ступень считается от
// СТАРТОВОЙ эпохи миссии (эпохи главы): в главе 3 bronze — это ступень 0
// с множителем 1, баланс поздних глав не сдвигается. Враг взрослеет сам
// (ai.js, updateEnemyAge) — по своему опыту или по таймеру, что раньше.
const AGE_ORDER = ['stone', 'bronze', 'iron'];
const AGE_UP = {
  statMult: 1.35,   // HP и урон новых юнитов — за каждую ступень
  costMult: 1.15,   // цена юнитов — за каждую ступень (выгода ~+17% силы на золото)
  xpNeed: [450, 800], // опыт на 1-ю и 2-ю смену эпохи в миссии 1 (дальше — масштаб)
  // Порог растёт с миссией медленнее, чем доход врага (больше убийств
  // в поздних миссиях): need × (1 + (enemyIncome/7 − 1) × missionScale).
  missionScale: 0.6,
  xpPerCoreDmg: 0.5, // опыт за 1 HP урона по вражескому ядру
  enemyXpMult: 1.3,  // врагу нужно на 30% больше опыта, чем игроку
  // В главах 1–2 (каменный век) враг взрослеет ТОЛЬКО по таймеру: иначе
  // игрок, теряющий юнитов, «кормит» врагу опыт и получает снежный ком
  // (бот: с опытом врага с главы 2 умный бот проигрывал миссии 4–6).
  enemyXpFromChapter: 3,
  enemyTimerSec: [120, 240], // …но не позже этих секунд боя (1-я и 2-я смена)
  bannerSec: 1.6,
};

// Раунд 15 (П6) — «Залп»: защита базы с миссии 1, без магазина. Град
// снарядов эпохи игрока (камни/стрелы/ядра) на участок сразу за передним
// краем врага, урон по площади только по юнитам (не по ядру/герою).
// Урон тоже растёт с эпохой игрока (AGE_UP.statMult) — иначе к поздней
// эпохе врага залп перестал бы что-то значить.
const VOLLEY = {
  cooldown: 42,
  firstReadySec: 12, // первый заряд — через 12 с после начала боя
  shells: 16,
  spreadSec: 0.9,    // за сколько секунд падают все снаряды
  fallSec: 0.5,      // полёт одного снаряда
  width: 150,        // ширина участка
  lead: 35,          // центр участка — на столько за передним врагом
  radius: 26,        // радиус урона одного снаряда
  dmg: 12,           // урон одного снаряда
};

function ageStartIndex(mission) { return Math.max(0, AGE_ORDER.indexOf(mission.age)); }
function ageMaxSteps(mission) { return AGE_ORDER.length - 1 - ageStartIndex(mission); }
function ageIdAt(mission, step) { return AGE_ORDER[Math.min(AGE_ORDER.length - 1, ageStartIndex(mission) + step)]; }
function ageStatMult(step) { return Math.pow(AGE_UP.statMult, step || 0); }
function ageUnitCost(typeId, step) { return Math.round(UNIT_TYPES[typeId].cost * Math.pow(AGE_UP.costMult, step || 0)); }
// Опыт на переход со ступени step на step+1 (team — 'player' | 'enemy').
function ageXpNeed(mission, step, team) {
  const base = AGE_UP.xpNeed[Math.min(step, AGE_UP.xpNeed.length - 1)];
  const scale = 1 + Math.max(0, mission.enemyIncome / 7 - 1) * AGE_UP.missionScale;
  return Math.round(base * scale * (team === 'enemy' ? AGE_UP.enemyXpMult : 1));
}

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
// Раунд 15 (И9) — первые миссии (индекс 0 = м1). Отряд врага: size — от/до
// бойцов, gap — с между выходом бойцов, maxWait — через сколько с отряд из
// ≥2 выходит неполным, guardDist — бойцы игрока ближе этого к крепости
// врага выпускают отряд сразу (оборона).
const EARLY_WAVE = { size: [3, 4], firstMax: 5, gap: 0.4, maxWait: 20, guardDist: 230 };
const EARLY_LEASH = { 1: { spendBase: 60, spendShare: 0.8, pressShare: 0.6 }, 2: { spendBase: 80, spendShare: 1.0, pressShare: 0.6 } };
const EARLY_ELITE_FIRST = { 2: 70 };
// Числа, заданные поверх формулы кривой (enemyIncome/enemyEliteEvery …).
// м2: без элит (босс с м3). м4 (глава 2, первый бой с рабом/адаптивным ИИ):
// доход 9.8 → 7, раб раз в 20 с (было 9), элита раз в 50 с (было ~30),
// первая — на 60-й с; адаптивный ИИ — с 90-й с; апгрейд дохода врага с 30-й с.
const EARLY_TUNE = {
  1: { enemyEliteEvery: 999 },
  3: { enemyIncome: 7, enemySpecialEvery: 20, enemyEliteEvery: 50, enemyEliteFirst: 60, enemyUpgradeDelay: 30, adaptiveFromSec: 90 },
};
// r15 И11 (куратор №3, играл клавишами как человек: «м1 без угрозы, м2 —
// стена: 0 побед из 22»). Кривая м1 → м2 для живого игрока:
//  • волны ПО РАСПИСАНИЮ (wave.every, ai.js updateEnemyWave): отряд size
//    бойцов выходит раз в every с (первый — на firstAt с часов врага); не
//    собрался к сроку — выходит, как наберёт size[0], или через maxWait
//    с тем, что есть; бойцы игрока у крепости (guardDist) — выход сразу;
//  • поводок со временем (spendRate — золота/с часов врага сверх spendBase):
//    волны есть и у медленного новичка, но не растут от накопленного дохода;
//  • enemyCoreDmgMult — урон вражеских бойцов по крепости игрока (глава 1):
//    прорвавшаяся пара дубинщиков — «укол», а не снос крепости за 20 с;
//  • enemyAgeNoLead — враг не старше игрока по эпохе (м1–м2);
//  • playerIncomeMult — доход игрока в миссии (м1 ×0.75);
//  • buffSwarm — бойцов в ответе крепости «рой» (было 5 на все миссии);
//  • maxRanged / maxRangedAlive — стрелков в отряде / живых на поле (1 / 2–3);
//  • buffTowerDmgMult — урон башен ответа крепости (м1–м2 ×0.3, м3 ×0.7).
// м1: 2–3 дубинщика раз в 15–20 с с 10-й с; м2 ≈ м1 + 30 %: 2–3 бойца раз в
// 13–17 с, поводок +25–30 %; м3 — ещё ступень (11–14 с, поводок 1.4 + 0.45).
// Числа до/после и приёмка скриптами куратора — ГДД, «Допущения», И11.
const M1_WAVE = { size: [2, 3], every: [15, 20], firstAt: 10, gap: 0.5, maxWait: 8, guardDist: 230, clubsUntil: 50, maxRanged: 1, maxRangedAlive: 2 };
const M2_WAVE = { size: [2, 3], every: [13, 17], firstAt: 10, gap: 0.45, maxWait: 8, guardDist: 230, maxRanged: 1, maxRangedAlive: 2 };
const M3_WAVE = { size: [2, 3], every: [11, 14], firstAt: 10, gap: 0.45, maxWait: 8, guardDist: 230, maxRanged: 1, maxRangedAlive: 3 };
const I11_TUNE = {
  0: {
    enemyWave: M1_WAVE, enemyCoreDmgMult: 0.4, enemyAgeNoLead: true, buffSwarm: 3, buffTowerDmgMult: 0.3, playerIncomeMult: 0.75,
    enemyLeash: { spendBase: 40, spendRate: 0.5, spendShare: 0.25, pressShare: 0.3 },
  },
  1: {
    enemyWave: M2_WAVE, enemyCoreDmgMult: 0.5, enemyAgeNoLead: true, buffSwarm: 3, buffTowerDmgMult: 0.3,
    enemyLeash: { spendBase: 50, spendRate: 0.65, spendShare: 0.3, pressShare: 0.3 },
  },
  2: {
    enemyWave: M3_WAVE, enemyCoreDmgMult: 0.7, buffSwarm: 4, buffTowerDmgMult: 0.7,
    enemyLeash: { spendBase: 60, spendRate: 1.4, spendShare: 0.45, pressShare: 0.6 },
  },
};
// Мягкий старт м1 (первое прохождение): те же волны, первая — через 2 с
// после «ворот» (ворота — не дольше 10 с, было 12); казна к воротам 100 → 40.
// Поводок первого прохождения мягче повтора: 0.3 золота/с часов врага +
// 0.4 × вложений игрока — медленному новичку (боец за 20 раз в 15 с = 1.33/с,
// герой стоит) враг отвечает ~0.85/с (меньше, чем тратит игрок, — он
// дожимает), активному (~4/с) — ~1.9/с, отряды по 2–3 раз в ~15–20 с.
// playerIncomeMult (м1): доход игрока 6 → 4.5/с — куратор копил 250+ золота.
const M1_SOFT_I11 = { gateMaxSec: 10, openGold: 40, spendBase: 40, spendRate: 0.3, spendShare: 0.4, wave: Object.assign({}, M1_WAVE, { firstAt: 2 }) };
// r15 И13 «Давление без стены» (куратор №4: «м1–м3 без угрозы — ни одного
// удара по своей крепости, у врага 0–3 бойца, бой у вражеских ворот; м4 —
// скачок, отряд элит, до 22 врагов»). Новые поля (ai.js / entities.js):
//  • wave.maxAlive — потолок врагов на поле (живые + отряд в сборе/на выходе);
//  • wave.ramp — размеры первых отрядов (3 → 4), дальше size[0]…size[1];
//  • wave.assault — «натиск»: count раз за бой (first, потом каждые every с
//    часов врага) выходит отряд бесплатных бойцов размером k × цена живой
//    армии игрока (от minN до maxN, не выше maxAlive + extra), до maxRanged
//    стрелков; за warn с — надпись «Враг идёт на штурм!»; обычный отряд после
//    натиска ждёт pause с. Растёт вместе с армией игрока — у активного
//    игрока фронт откатывается через середину, у медленного — 1–2 бойца;
//  • enemyRecruit — «новобранцы» (м1–м3): боец врага дешевле и слабее
//    (цена/HP/урон ×0.8) — при том же поводке их на поле больше;
//  • enemySiege (px) — стрелок врага бьёт крепость игрока, если она ближе
//    его дальности + enemySiege: фронт, перешедший середину, = удар по
//    крепости (урон по ней в главе 1 и так снижен enemyCoreDmgMult);
//  • enemyAgeMaxGap — эпохи сторон расходятся не больше чем на 1 ступень;
//  • eliteMaxAlive — элит врага на поле разом (м3 — 1, м4 — 2);
//  • adaptiveMaxDiff — старший порог адаптивного ИИ (м4: только +1/+3);
//  • enemyMaxAlive — потолок врагов на поле без отрядов (м4).
// Числа до/после и приёмка — КОНЦЕПТ_ГДД.md, «Допущения», И13.
const I13_ASSAULT = { every: 35, k: 1.2, heroValue: 0, minN: 1, maxN: 8, extra: 2, warn: 3, pause: 10, gap: 0.2, maxRanged: 3 };
const I13_WAVE = { size: [3, 5], ramp: [3, 4], every: [15, 19], firstAt: 8, gap: 0.45, maxWait: 8, guardDist: 230, maxRanged: 1, maxRangedAlive: 2, maxAlive: 6 };
const I13_RECRUIT = { hp: 0.8, dmg: 0.8, cost: 0.8 };
const I13_M1_WAVE = Object.assign({}, I13_WAVE, { clubsUntil: 35, assault: Object.assign({}, I13_ASSAULT, { first: 40, count: 3, k: 1.3 }) });
const I13_M1_LEASH = { spendBase: 60, spendRate: 0, spendShare: 0.65, pressShare: 0.3 };
const I13_TUNE = {
  0: {
    enemyCoreHp: 520, enemyRecruit: I13_RECRUIT, enemySiege: 300, enemyAgeMaxGap: 1,
    enemyWave: Object.assign({}, I13_M1_WAVE, { firstAt: 10 }), enemyLeash: I13_M1_LEASH,
  },
  1: {
    enemyCoreHp: 600, enemyRecruit: I13_RECRUIT, enemySiege: 300, enemyAgeMaxGap: 1,
    enemyWave: Object.assign({}, I13_WAVE, { assault: Object.assign({}, I13_ASSAULT, { first: 30, count: 2, k: 1.3 }) }),
    enemyLeash: { spendBase: 100, spendRate: 0, spendShare: 0.6, pressShare: 0.3 },
  },
  2: {
    enemyRecruit: I13_RECRUIT, enemySiege: 300, enemyAgeMaxGap: 1, eliteMaxAlive: 1,
    enemyWave: Object.assign({}, I13_WAVE, { maxRangedAlive: 3, assault: Object.assign({}, I13_ASSAULT, { first: 35, count: 2, k: 1.1 }) }),
    enemyLeash: { spendBase: 60, spendRate: 0.5, spendShare: 0.7, pressShare: 0.6 },
  },
  3: { adaptiveMaxDiff: 3, eliteMaxAlive: 2, enemyCoreDmgMult: 0.75, enemyAgeMaxGap: 1, enemyMaxAlive: 12 },
};
// Мягкий старт м1 (первое прохождение): те же отряды и натиск, первый отряд
// — через 2 с после «ворот»; казна к воротам 40 → 250 (при поводке — не
// «орда», а готовность ответить активному игроку сразу, без 30 с голода).
const M1_SOFT_I13 = { openGold: 250, spendBase: 60, spendRate: 0, spendShare: 0.65, pressShare: 0.3, wave: Object.assign({}, I13_M1_WAVE, { firstAt: 2 }) };
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
      // Раунд 15 (бот баланса): миссия 1 — обучение. Доход врага 7 → 6,
      // апгрейд дохода враг начинает только с 45-й секунды, эпоху меняет
      // по таймеру ×1.5 (180/360 с). Наивный бот (без апгрейдов и эпох)
      // иначе проигрывал ~половину боёв; с правкой — 8/10, с «Залпом» 5/5.
      enemyIncome: i === 0 ? 6 : +(7 + t * 13).toFixed(1),
      enemyUpgradeDelay: i === 0 ? 45 : 0,
      enemyAgeTimerMult: i === 0 ? 1.5 : 1,
      enemyEliteEvery: i === 0 ? 999 : Math.round(34 - t * 21),
      eliteHpMult: +(1 + t * 1.6).toFixed(2),
      // Раунд 15 (И8): мягкий старт миссии 1, пока она ни разу не выиграна
      // (ai.js, makeSoftStart/updateSoftStart): враг ждёт шагов туториала
      // 1–3 (не дольше gateMaxSec), потом его часы разгоняются от rampFrom
      // до 1 за rampSec; на юнитов тратит не больше spendBase + spendShare ×
      // вложения игрока в армию + pressShare × урон героя по ядру у стены.
      // Брошенный на guardIdleSec герой отбивает врагов в guardZone px от
      // своей крепости. Повтор после победы — обычный баланс.
      // И9 (куратор: «в м1 нет боя, враг выходит по одному»): поводок мягче
      // (spendBase 20 → 60, spendShare 0.35 → 0.5), ворота ждут не дольше
      // 12 с (было 25), разгон с 0.6 (было 0.4), к открытию ворот враг
      // получает openGold 100, закупка выходит отрядами (wave, ai.js).
      softStart: i === 0 ? { gateMaxSec: 12, rampFrom: 0.6, rampSec: 30, spendBase: 60, spendShare: 0.5, pressShare: 0.6, guardIdleSec: 2, guardZone: 170, openGold: 100, wave: EARLY_WAVE } : null,
      // И9 (куратор: «м2 — резкий скачок: орда 8–10 с боссом, база падает за
      // 20 с; нужно м2 ≈ м1 + 30 %, босс не раньше м3–4»). Миссии 1–3:
      // враг выходит отрядами (enemyWave); м2–м3 — поводок закупки от
      // вложений игрока (enemyLeash); элитный «босс» — с м3, первый не
      // раньше enemyEliteFirst; «гигант» бафа крепости до м3 — обычный
      // тяжёлый (enemyBoss). Миссии 5–15 не меняются.
      enemyWave: i <= 2 ? EARLY_WAVE : null,
      enemyLeash: EARLY_LEASH[i] || null,
      enemyBoss: i >= 2,
      enemyEliteFirst: EARLY_ELITE_FIRST[i] || 0,
    });
    if (EARLY_TUNE[i]) Object.assign(MISSIONS[i], EARLY_TUNE[i]);
    if (I11_TUNE[i]) Object.assign(MISSIONS[i], I11_TUNE[i]); // r15 И11
    if (i === 0) Object.assign(MISSIONS[i].softStart, M1_SOFT_I11);
    if (I13_TUNE[i]) Object.assign(MISSIONS[i], I13_TUNE[i]); // r15 И13
    if (i === 0) Object.assign(MISSIONS[i].softStart, M1_SOFT_I13);
  }
})();

// r15 И15 «Без стен и обвалов» (куратор №5: «м5 — стена: к 84-й с у врага
// 27 живых против 3–4 наших, крепость 1000 → 0 за 10 с»; «м4: 90 с на 1000,
// потом за 19 с до 86»; «третья звезда не взята ни разу»; «в м1 нет угрозы»;
// «м3 — 6,5 мин, крепость врага 2 мин стоит на 161 HP»; «золото до 4600»).
// Числа до/после и приёмка — КОНЦЕПТ_ГДД.md, «Допущения», И15.
//  • ENEMY_ALIVE_CAP — общий потолок живых врагов на поле по главам (все
//    каналы: закупка, отряды, элиты, спецюниты, адаптивный ИИ, трикл-очереди,
//    ответы крепости). Откуда было 27 в м5: без поводка и потолка доход
//    10.7/с + адаптивный ИИ бесплатно (+5 лучников, +10 бойцов трикл-очередью
//    за разницу армий ≥ 5/7 — у активного игрока она есть с 20-й с) + раб
//    каждые 9 с + элита каждые 28 с без лимита. Потолок — очередь: закупка и
//    трикл ждут места, а не пропадают;
//  • FORT_GUARD — урон по крепости игрока не быстрее perSec × макс. HP в
//    секунду («ведро» на burstSec с); сверх — поглощает стена (искра). Так
//    от полной крепости до нуля ≥ 30 с: у игрока всегда есть время ответить.
//    world.fortHitAt / fortHitDps — метка удара и урон/с за dpsWindowSec
//    (сигнал «Fort under attack!» в HUD — И16);
//  • OVERTIME — после atSec с боя крепость врага «сдаёт»: урон по ней ×1.5,
//    башни её ответа ×0.5, баннер «Final assault!» (hud.overtime);
//  • ECONOMY.upgrade.maxLevelByChapter — в главах 1–2 апгрейдов дохода за
//    миссию не больше 2
//    (доход 6 → 9.8/с, было без предела: 3 апгрейда = 12.6/с, 5 = 20.6/с —
//    обычный игрок тратит ~13/с и копил 1000–1900); враг — тот же потолок;
//  • ECONOMY.treasury — «полная казна» в главах 1–2: выше softCap золота
//    доход фермы ×overMult (золото за убийства — полностью). В главе 3+
//    копление наказывает GOLD_HOARD; здесь — просто нет смысла копить;
//  • HERO_EARLY — HP героя в главах 1–2 (×1.35 / ×1.15): гибнет от отряда
//    бойцов в ближнем бою (70–80 % урона — дубинщики и копейщики), а не от
//    стрел, поэтому +HP, а не броня от стрел; в главе 2 — наоборот: 40–60 %
//    урона по герою дают вражеские стрелки из-за спин своих, поэтому там
//    урон стрел по герою ×rangedTaken (0.7) при меньшей прибавке HP;
//  • wave.assault.raiders — м1: в первом натиске «налётчики» (огненная аура
//    как у «Клича») вылезают подкопом в emergeDx px перед крепостью игрока,
//    бьют стену blows раз по blowFrac × макс. HP и уходят назад; отбиться —
//    герой у ворот, «Залп», свежие бойцы (entities.js updateRaider).
const ENEMY_ALIVE_CAP = { 1: 12, 2: 12, 3: 14, 4: 16, 5: 18 };
// И19: главы 1–2 — 0.032 → 0.027 (куратор №7: «1000 → 0 за 25–30 с»; ведро 1.5 с
// + 3.2 %/с давали ровно 29.8 с — лимит работал, обхода нет; теперь ≥ 35 с)
const FORT_GUARD = { perSec: { 1: 0.027, 2: 0.027, 3: 0.034, 4: 0.034, 5: 0.034 }, burstSec: 1.5, dpsWindowSec: 3 };
// r15 И21 (куратор №8: «затянутое поражение: своя крепость держится на 1–5 %
// HP до 85 с»). Причина: ниже 10 % давление на крепость рваное — поводок
// закупки врага (у пассивного игрока, ×0.6 в овертайме) шлёт по 1–3 бойца,
// их добивают свежекупленные бойцы игрока у самой стены, а редкие удары
// FORT_GUARD ещё и режет. «Последний рубеж»: ниже hpFrac HP лимит FORT_GUARD
// снят, и, пока крепость под давлением (удар по ней за pressureSec с или хоть
// один живой враг на поле), она сама теряет hpFrac × макс. HP за sec с — от
// 10 % до нуля не дольше sec с давления (game.js updateLastStand). Числа
// врагов и экономики не тронуты.
const LAST_STAND = { hpFrac: 0.10, sec: 15, pressureSec: 4 };
const OVERTIME = { atSec: 180, enemyCoreDmgMult: 1.5, enemyTowerDmgMult: 0.5, bannerSec: 2.8 };
ECONOMY.upgrade.maxLevelByChapter = { 1: 2, 2: 2 }; // гл. 3+ — без предела (там копление штрафует GOLD_HOARD)
function incomeUpgradeCap(mission) { return (mission && ECONOMY.upgrade.maxLevelByChapter[mission.chapterId]) || Infinity; }
ECONOMY.treasury = { softCap: 400, overMult: 0.2, maxChapter: 2 }; // порог = GOLD_HOARD.threshold
const HERO_EARLY = { 1: { hpMult: 1.35 }, 2: { hpMult: 1.15, rangedTaken: 0.7 } };
const I15_RAID = { raiders: 3, speedMult: 1.4, blows: 3, blowFrac: 0.016, gap: 0.9, emergeDx: 175, atSec: [37, 45] }; // atSec — налёт м1 на этой секунде БОЯ (И19: случайно 37–45, первый удар по стене на 40–48-й; было 44 по часам врага ≈ 58-я боя), даже без натиска
// м5 (второй бой главы 2) — темп как в м4 (EARLY_TUNE[3] + I13_TUNE[3]), шаг
// сложности — в статах юнитов и HP крепости по кривой: доход 10.7 → 7.3, раб
// раз в 18 с (было 9), элита раз в 50 с (было 28), первая на 60-й, адаптивный
// ИИ — только малые реакции с 90-й с, урон по крепости ×0.8, закупка — не
// больше 10 живых. м4: закупка — не больше 10 живых (было 12).
const I15_TUNE = {
  2: { eliteLeashed: true }, // м3: элита — в счёт поводка закупки (ai.js)
  3: { enemyMaxAlive: 10, enemyAgeTimerMult: 0.85 },
  4: {
    enemyIncome: 7.3, enemySpecialEvery: 18, enemyEliteEvery: 50, enemyEliteFirst: 60, enemyUpgradeDelay: 30,
    adaptiveFromSec: 90, adaptiveMaxDiff: 3, eliteMaxAlive: 2, enemyCoreDmgMult: 0.8, enemyAgeMaxGap: 1, enemyMaxAlive: 10, enemyAgeTimerMult: 0.85,
  },
};
(function applyI15() {
  for (let i = 0; i < MISSIONS.length; i++) {
    const m = MISSIONS[i];
    m.enemyAliveCap = ENEMY_ALIVE_CAP[m.chapterId];
    m.fortGuardPerSec = FORT_GUARD.perSec[m.chapterId];
    m.heroHpMult = (HERO_EARLY[m.chapterId] || {}).hpMult || 1;
    m.heroRangedTaken = (HERO_EARLY[m.chapterId] || {}).rangedTaken || 0;
    if (I15_TUNE[i]) Object.assign(m, I15_TUNE[i]);
  }
  // м1: «налётчики» в первом натиске — и в первом прохождении, и в повторе
  const raid = w => { if (w && w.assault) w.assault = Object.assign({}, w.assault, { raiders: I15_RAID }); };
  raid(MISSIONS[0].enemyWave);
  raid(MISSIONS[0].softStart.wave);
})();

// r15 И17 «Глубина против спама» (куратор №6: «спам бойца „1“ (≈95 % покупок)
// проходит м1–м5 за 43–59 с на 3★, крепость ни разу не задета; спирмен,
// лучник, тяжёлый и апгрейды для победы не нужны»). Причины и числа —
// КОНЦЕПТ_ГДД.md, «Допущения», И17.
//  • UNIT_COUNTERS / UNIT_ARMOR — контры ролей (обе стороны): множитель урона
//    атакующей роли по роли цели × «броня» цели от роли атакующего.
//    Круг: пехота режет стрелков → стрелки бьют копейщиков → копья держат
//    пехоту и тяжёлых; тяжёлый в латах давит стрелков. Раньше контр не было:
//    дубинщик (20 золота) — лучший боец на золото (HP×урон/цена² ≈ 1.9 против
//    1.0 у копейщика и 0.6 у тяжёлого), поэтому спам «1» выигрывал всё;
//  • COUNTER_PICK / SPAM_WATCH — враг следит за последними покупками игрока:
//    ≥ share одного типа (из ≥ minBuys за memorySec; 8 из 10 за 30 с — при
//    70 % ложно срабатывало у обычного смешанного игрока) — «спам»; тогда враг
//    покупает контр (pickP), ведёт им натиск (assaultP), поводок закупки
//    растёт на leashShare × вложения игрока в этот тип; игроку — тост
//    «Враг отвечает копьями! Смешай армию» (tip.counter*, не чаще tipEverySec);
//  • GATE_GUARD — «огонь со стен» вражеской крепости с м2: горшок с огнём по
//    переднему бойцу у ворот (splash px; героя — только если бойцов рядом нет,
//    ×heroMult). Тяжёлый в латах держит огонь (UNIT_ARMOR.heavy.gate), лучники
//    за передней линией не под огнём; толпа дешёвой пехоты или голые лучники горят.
//    Пока враг не видит спама, огонь слабый (×SPAM_WATCH.gateBase): ворота
//    «укрепляются» в ответ на спам, смешанную армию огонь почти не тормозит.
//    Овертайм — ×OVERTIME.enemyTowerDmgMult и снова ×gateBase;
//  • FINISH_HP — крепость врага ниже этой доли HP: бойцы игрока в дальности
//    бьют её, а не свежих защитников у ворот (раньше 2,5 мин на 25/1043 HP);
//  • OVERTIME_STALL — овертайм раньше 180 с, если HP крепости врага не
//    менялось stallSec с (пассивный новичок: м1 5 мин, м2 9 мин);
//  • RAID_I17 — налёт на крепость игрока и в м2–м5.
const UNIT_COUNTERS = { melee: { ranged: 1.5 }, spear: { melee: 1.5, heavy: 1.5, rider: 1.5 }, ranged: { spear: 1.5 }, heavy: { ranged: 1.4 } };
const UNIT_ARMOR = { spear: { melee: 0.67 }, heavy: { ranged: 0.7, gate: 0.5 } };
function counterMult(attRole, tgtRole) {
  if (!attRole || !tgtRole) return 1;
  return ((UNIT_COUNTERS[attRole] || {})[tgtRole] || 1) * ((UNIT_ARMOR[tgtRole] || {})[attRole] || 1);
}
// спам типа → чем отвечает враг (первый открытый игроку в этой миссии)
const COUNTER_PICK = { infantry: ['spear'], spear: ['archer'], archer: ['infantry'], heavy: ['spear'] };
const SPAM_WATCH = { fromMission: 2, window: 10, minBuys: 8, share: 0.8, intentShare: 0.6, memorySec: 30, pickP: 0.8, assaultP: 0.6, leashShare: 0.35, tipEverySec: 45, tipMax: 3, gateBase: 0.25 }; // И19: intentShare — доля спам-типа в нажатиях покупки (и неудачных)
const GATE_GUARD = {
  // индекс миссии → огонь со стен (dmg за выстрел, interval с, range px от
  // фасада, splash px, heroMult — по герою). м1 — без огня (обучение).
  1: { dmg: 10, interval: 1.8, range: 150, splash: 30, heroMult: 0.5 },
  2: { dmg: 14, interval: 1.6, range: 150, splash: 32, heroMult: 0.5 },
  3: { dmg: 18, interval: 1.5, range: 150, splash: 34, heroMult: 0.5 },
  4: { dmg: 20, interval: 1.5, range: 150, splash: 34, heroMult: 0.5 },
};
const FINISH_HP = 0.15;
// в овертайме враг «сдаёт» и в закупке (поводок ×leashMult), огонь со стен —
// слабый и против спама (иначе спам-армия стояла у ворот до 300+ с)
const OVERTIME_STALL = { stallSec: 90, leashMult: 0.6 };
// налёт (I15_RAID) и в м2–м5: случайная секунда из atSec, без привязки к
// отрядам (в м4–м5 их нет). Куратор №6: «крепость ни разу не задета» —
// армия у ворот врага держала весь фронт; налёт требует вернуть героя.
const RAID_I17 = { atSec: [50, 80] };
(function applyI17() {
  for (let i = 0; i < MISSIONS.length; i++) if (GATE_GUARD[i]) {
    MISSIONS[i].gateGuard = GATE_GUARD[i];
    MISSIONS[i].raidI17 = Object.assign({}, I15_RAID, RAID_I17);
  }
})();

// r15 И19 «Последняя шлифовка кривой» (куратор №7). Числа до/после и
// приёмка — КОНЦЕПТ_ГДД.md, «Допущения», И19.
//  • FINISH_ONE_HIT — крепость врага ниже этой доли HP падает от любого удара
//    бойца, героя или «Залпа» игрока (entities.js dealDamage/updateVolley), а
//    без ударов сама рушится за ~6 с (FINISH_CRUMBLE, game.js updateI15);
//  • STALL_ESC — анти-пат (game.js updateI15): assaultSec с без урона по обеим
//    крепостям — враг идёт на штурм (ai.js launchStallAssault: бесплатный отряд
//    k × цена армии игрока, minN…maxN, в пределах потолка поля; повтор не
//    чаще repeatSec); ещё overtimeSec без урона — «патовый овертайм». Отсчёт
//    пата — не раньше graceSec с начала боя (первая встреча армий — не пат);
//  • OVERTIME_RAMP — в патовом овертайме урон по обеим крепостям растёт на step
//    каждые everySec, и обе крепости «горят»: burnPerSec × макс. HP в секунду ×
//    тот же рост (у своей и горение, и прибавка роста — ×playerBurnMult, урон
//    — через лимит FORT_GUARD: развязка в пользу атакующего игрока). С hardSec
//    с боя этот режим включается в любом бою, и рост ускоряется (+hardStep
//    каждые everySec) — «развязка»: ни один бой не тянется дольше ~5 минут,
//    у кого крепость ниже в процентах — тот и падает первым. Обычный овертайм
//    (180 с / крепость врага не тронута 90 с, И15/И17) — как был.
const FINISH_ONE_HIT = 0.05;
const FINISH_CRUMBLE = 0.008; // ниже FINISH_ONE_HIT крепость врага сама теряет 0.8 % HP/с (≤ ~6 с до падения)
const STALL_ESC = { graceSec: 30, assaultSec: 45, overtimeSec: 30, repeatSec: 45, k: 1.0, minN: 3, maxN: 7, maxRanged: 2, gap: 0.3 };
const OVERTIME_RAMP = { everySec: 15, step: 0.1, burnPerSec: 0.006, playerBurnMult: 0.34, hardSec: 200, hardStep: 0.4 };
// Глава 2 (м4–м6, куратор №7: «стена — крепость 1000→0 за 25–30 с дважды,
// потом с помощью победа на 95 % HP»). Ступень от м3, а не обрыв:
//  • поводок закупки, как в м3 (enemyLeash: база + золото/с + доля вложений
//    игрока и нажима героя) — у пассивного игрока враг не копит орду;
//  • «новобранцы» (enemyRecruit ×0.85…0.92) и элита в счёт поводка, по одной;
//  • враг не старше игрока по эпохе (enemyAgeNoLead) — ленивый не получает
//    армию следующей эпохи против своей;
//  • раб реже (enemySpecialEvery), первая элита позже (enemyEliteFirst);
//  • м6 — в семью м4–м5 (раньше — формула кривой: доход 11.6, элита раз в
//    26 с с первой минуты, раб раз в 9 с, полный адаптивный ИИ), с огнём со
//    стен и налётом, как м5 (без них м6 проходился за 58 с без удара по стене).
const I19_TUNE = {
  3: {
    enemyLeash: { spendBase: 60, spendRate: 0.35, spendShare: 0.7, pressShare: 0.6 }, enemyRecruit: { hp: 0.85, dmg: 0.85, cost: 0.85 },
    eliteLeashed: true, eliteMaxAlive: 1, enemyEliteFirst: 80, enemySpecialEvery: 30, enemyAgeNoLead: true,
  },
  4: {
    enemyLeash: { spendBase: 50, spendRate: 0.3, spendShare: 0.6, pressShare: 0.6 }, enemyRecruit: { hp: 0.9, dmg: 0.9, cost: 0.9 },
    eliteLeashed: true, eliteMaxAlive: 1, enemyEliteFirst: 75, enemySpecialEvery: 36, enemyAgeNoLead: true,
  },
  5: {
    enemyIncome: 8.5, enemySpecialEvery: 24, enemyEliteEvery: 50, enemyEliteFirst: 75, enemyUpgradeDelay: 30,
    adaptiveFromSec: 90, adaptiveMaxDiff: 3, eliteMaxAlive: 2, eliteLeashed: true, enemyCoreDmgMult: 0.85,
    enemyAgeMaxGap: 1, enemyAgeNoLead: true, enemyMaxAlive: 10, enemyAgeTimerMult: 0.9,
    enemyLeash: { spendBase: 60, spendRate: 0.7, spendShare: 0.8, pressShare: 0.6 },
  },
};
(function applyI19() {
  for (const i in I19_TUNE) Object.assign(MISSIONS[i], I19_TUNE[i]);
  MISSIONS[5].gateGuard = GATE_GUARD[4];
  MISSIONS[5].raidI17 = Object.assign({}, I15_RAID, RAID_I17);
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
// r15 И13 (куратор №4: «поражение дало +22 кристалла, победа — +6…8»).
// Причина: награда — за каждое убийство (DIAMOND_DECAY: после 40-й с по 0.2),
// а долгое поражение против толпы — это много убийств; победа короче. Числа
// DIAMOND_DECAY — основателя, не меняются. Правило поверх: поражение платит не
// больше LOSS_REWARD.share от «эталона победы» миссии (winRef — медиана
// награды за первую победу в прогонах И13: м1–м4 ≈ 15–20, дальше +1 за
// миссию). Победа всегда выгоднее поражения; реклама x2 удваивает оба.
const LOSS_REWARD = { share: 0.5, winRefBase: 14, winRefPerMission: 1 };
function lossRewardCap(mission) {
  return Math.floor(LOSS_REWARD.share * (LOSS_REWARD.winRefBase + LOSS_REWARD.winRefPerMission * mission.id));
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
