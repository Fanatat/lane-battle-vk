// ИИ врага: собственная экономика + периодический "элитный" юнит вместо
// полноценного управляемого героя (см. ГДД, «Допущения»).
'use strict';

function makeEnemyAI() {
  return {
    gold: 0,
    incomeLevel: 0,
    incomeAcc: 0,
    buyAcc: 0,
    nextBuyIn: 1 + Math.random() * 1,
    eliteAcc: 0,
    upgradeAcc: 0,
    nextUpgradeIn: 4 + Math.random() * 2,
    perkCooldowns: {}, // раунд 8: адаптивный ИИ, кулдаун на каждый порог-«перк» отдельно
    // Правка баланса: отдельный ГЛОБАЛЬНЫЙ кулдаун адаптивного ИИ поверх
    // кулдаунов отдельных порогов — см. updateAdaptiveAI().
    adaptiveGlobalCooldown: 0,
    // Раунд 9: несколько независимых трикл-очередей сразу (реакция +7 и
    // наказание за золото — разные каналы, не должны делить одну очередь).
    trickles: [],
    goldHoardCooldown: 0,
  };
}

function aiIncomeRate(ai, mission) {
  return mission.enemyIncome * Math.pow(1 + ECONOMY.upgrade.incomePctGain, ai.incomeLevel);
}
function aiUpgradeCost(ai) {
  return Math.round(ECONOMY.upgrade.baseCost * Math.pow(ECONOMY.upgrade.growth, ai.incomeLevel));
}

function updateEnemyAI(world, ai, mission, dt, playerGold) {
  // ИИ тоже вкладывается в апгрейд дохода — иначе его экономика навсегда
  // остаётся плоской и полностью проигрывает растущему доходу игрока
  // (баланс, найденный живым плейтестом ботом — см. ПЛАН.md, фаза 4).
  ai.incomeAcc += dt;
  const rate = aiIncomeRate(ai, mission);
  while (ai.incomeAcc >= ECONOMY.incomeTickSec) {
    ai.incomeAcc -= ECONOMY.incomeTickSec;
    ai.gold += rate;
  }

  ai.upgradeAcc += dt;
  if (ai.upgradeAcc >= ai.nextUpgradeIn) {
    ai.upgradeAcc = 0;
    ai.nextUpgradeIn = 4 + Math.random() * 3;
    const cost = aiUpgradeCost(ai);
    if (ai.gold >= cost && Math.random() < 0.55) {
      ai.gold -= cost;
      ai.incomeLevel += 1;
    }
  }

  ai.buyAcc += dt;
  if (ai.buyAcc >= ai.nextBuyIn) {
    ai.buyAcc = 0;
    ai.nextBuyIn = 1.1 + Math.random() * 1.2;
    const affordable = UNIT_ORDER.filter(id => UNIT_TYPES[id].cost <= ai.gold);
    if (affordable.length > 0) {
      // в основном тратит с умом (дорогой доступный юнит), изредка — вразнобой
      const byCostDesc = [...affordable].sort((a, b) => UNIT_TYPES[b].cost - UNIT_TYPES[a].cost);
      const pick = Math.random() < 0.7 ? byCostDesc[0] : affordable[Math.floor(Math.random() * affordable.length)];
      ai.gold -= UNIT_TYPES[pick].cost;
      spawnUnit(world, 'enemy', pick);
    }
  }

  ai.eliteAcc += dt;
  if (ai.eliteAcc >= mission.enemyEliteEvery) {
    ai.eliteAcc = 0;
    const pick = UNIT_ORDER[Math.floor(Math.random() * UNIT_ORDER.length)];
    spawnEliteUnit(world, 'enemy', pick, mission.eliteHpMult);
    world.onDanger && world.onDanger('elite');
  }

  // Роутинг спецюнитов врага (раунд 5) — редко подмешиваются в обычный
  // спавн, отдельно от базовой закупки, чтобы не переписывать её логику
  // выбора юнита по золоту (у спецюнитов нет отдельной "цены" для ИИ).
  // Раунд 8: пул спецюнитов ограничен главами, уже пройденными к этой
  // миссии (см. CHAPTER_SPECIAL_UNIT/specialTypesUpToChapter в data.js) —
  // глава 1 не даёт спецюнита вовсе (её «спецюнит» — обычный лучник).
  ai.specialAcc = (ai.specialAcc || 0) + dt;
  if (ai.specialAcc >= 9) {
    ai.specialAcc = 0;
    const pool = specialTypesUpToChapter(mission.chapterId);
    if (pool.length) spawnUnit(world, 'enemy', pool[Math.floor(Math.random() * pool.length)]);
  }

  updateAdaptiveAI(world, ai, mission, dt);
  updateGoldHoardPunish(world, ai, mission, playerGold, dt);
}

// Общая обработка трикл-очередей (раунд 9: их может быть несколько сразу —
// реакция +7 и наказание за золото независимы, см. ниже).
function tickTrickles(world, ai, dt) {
  for (const tr of ai.trickles) {
    if (tr.count <= 0) continue;
    tr.timer -= dt;
    if (tr.timer <= 0) {
      tr.timer = tr.interval;
      spawnUnit(world, 'enemy', tr.typeId);
      tr.count--;
    }
  }
  ai.trickles = ai.trickles.filter(tr => tr.count > 0);
}

// Адаптивный ИИ (раунд 8, формула исправлена в раунде 10 — баг-репорт
// основателя): разница считается по ЖИВЫМ юнитам сейчас
// (aliveUnitsOf, entities.js), не по накопленному счёту заспавненных за
// весь матч — тот считал игрока "в плюсе" даже когда у бота живых юнитов
// было больше, просто игрок раньше уже покупал и терял много юнитов в
// бою. Каждый порог диффа — независимый «перк» со своим кулдауном (см.
// data.js ADAPTIVE_AI, числа стартовые).
// Правка баланса (по отчёту об ИИ, решение основателя): раньше все
// подходящие пороги проверялись и срабатывали КАЖДЫЙ кадр без остановки
// на первом совпадении — при резком скачке разницы это давало до 20
// юнитов одним пакетом за секунды. Теперь — отдельный ГЛОБАЛЬНЫЙ кулдаун
// 5с поверх кулдаунов отдельных порогов: пока он не истёк, проверка
// вообще не идёт; когда истёк — проверяется ТЕКУЩЕЕ состояние заново
// (сработавшие ранее пороги не "копятся в очередь" и не "догоняют" потом)
// и реализуется РОВНО ОДИН порог — самый высокий из тех, что и совпал по
// разнице, и свободен по своему 30-секундному кулдауну; если такого нет —
// не срабатывает ничего, и 5 секунд отсчитываются заново. Канал выключен
// в главе 1 целиком (mission.chapterId < 2).
function updateAdaptiveAI(world, ai, mission, dt) {
  for (const key in ai.perkCooldowns) ai.perkCooldowns[key] = Math.max(0, ai.perkCooldowns[key] - dt);
  tickTrickles(world, ai, dt);
  if (mission.chapterId < 2) return;

  ai.adaptiveGlobalCooldown = Math.max(0, ai.adaptiveGlobalCooldown - dt);
  if (ai.adaptiveGlobalCooldown > 0) return;

  const diff = aliveUnitsOf(world, 'player').length - aliveUnitsOf(world, 'enemy').length;
  // От старшего порога к младшему — первый совпавший И свободный по
  // своему кулдауну и есть "самый высокий из подходящих".
  for (let i = ADAPTIVE_AI.reactions.length - 1; i >= 0; i--) {
    const reaction = ADAPTIVE_AI.reactions[i];
    if (diff < reaction.diff) continue;
    if ((ai.perkCooldowns[reaction.kind] || 0) > 0) continue;
    ai.perkCooldowns[reaction.kind] = ADAPTIVE_AI.cooldownSec;
    triggerAdaptiveReaction(world, ai, mission, reaction.kind);
    break;
  }
  ai.adaptiveGlobalCooldown = ADAPTIVE_AI.globalCooldownSec;
}

// Наказание за накопление золота у игрока (раунд 9) — отдельный канал,
// не трогает обычную очередь спавна/кулдауны диффа (явная просьба
// основателя). Счёт золота — актуальный на момент срабатывания, не тот,
// что был при постановке на кулдаун (см. КОНЦЕПТ_ГДД.md, «Допущения»).
// Правка баланса (по отчёту об ИИ, решение основателя): канал выключен в
// главах 1-2 целиком (mission.chapterId < 3) — раньше работал с 1-й главы.
function updateGoldHoardPunish(world, ai, mission, playerGold, dt) {
  if (mission.chapterId < 3) return;
  ai.goldHoardCooldown = Math.max(0, ai.goldHoardCooldown - dt);
  if (ai.goldHoardCooldown > 0) return;
  if (playerGold <= GOLD_HOARD.threshold) return;
  // Раунд 10: округление вверх (было floor/100, стало ceil/150) — смягчает
  // формулу количества, порог срабатывания (>300) не менялся.
  const count = Math.ceil(playerGold / GOLD_HOARD.unit);
  ai.trickles.push({ typeId: GOLD_HOARD.unitType, count, timer: 0, interval: GOLD_HOARD.spawnInterval });
  ai.goldHoardCooldown = GOLD_HOARD.cooldownSec;
  // Ночная правка (находка ревьюера №1, живьём подтверждена): механика
  // реальна, но игрок её никак не видит — просто "вдруг у врага чуть
  // больше лучников". Даём видимый сигнал в HUD и причину для экрана
  // поражения (см. game.js — onGoldHoard/lastDangerTag).
  world.onGoldHoard && world.onGoldHoard(count);
}

function triggerAdaptiveReaction(world, ai, mission, kind) {
  world.onDanger && world.onDanger('adaptive');
  switch (kind) {
    case 'react1': // +1 юнит разницы — 1 вражеский лучник
      spawnUnit(world, 'enemy', 'archer');
      break;
    case 'react3': // +3 — 2 обычных вражеских солдата
      spawnUnit(world, 'enemy', 'infantry');
      spawnUnit(world, 'enemy', 'infantry');
      break;
    case 'react5': // +5 — 5 вражеских лучников
      for (let i = 0; i < 5; i++) spawnUnit(world, 'enemy', 'archer');
      break;
    case 'react7': // +7 — 10 солдат трикл-очередью по 0.3с, не разом
      ai.trickles.push({ typeId: 'infantry', count: 10, timer: 0, interval: 0.3 });
      break;
    case 'react10': { // +10 — 2 спецюнита ИМЕННО этой главы (см. допущения)
      const pick = CHAPTER_SPECIAL_UNIT[mission.chapterId] || 'archer';
      spawnUnit(world, 'enemy', pick);
      spawnUnit(world, 'enemy', pick);
      break;
    }
  }
}

// Бафы вражеской базы по остатку HP% (раунд 5) — одноразовый триггер на
// каждый порог, числа основателя (см. ПЛАН.md). Раунд 8: пороги читаются
// из match.buffThresholds — результат жеребьёвки (порог×баф) на старте
// миссии (см. game.js/startMission, data.js/jitterBuffThresholds), не
// общий константный массив, — иначе и разброс, и распределение бафов по
// порогам были бы общими на все миссии сразу, а не свежими каждый раз.
function updateEnemyBaseBuffs(match) {
  const core = match.world.enemyCore;
  if (core.maxHp <= 0 || core.hp <= 0) return;
  const frac = core.hp / core.maxHp;
  for (const buff of match.buffThresholds) {
    if (frac > buff.hpFrac || match.buffsTriggered.has(buff.kind)) continue;
    match.buffsTriggered.add(buff.kind);
    applyEnemyBaseBuff(match, buff);
  }
}

function applyEnemyBaseBuff(match, buff) {
  const kind = buff.kind;
  const world = match.world;
  world.onDanger && world.onDanger('buff');
  switch (kind) {
    case 'giant':
      spawnEliteUnit(world, 'enemy', 'heavy', match.mission.eliteHpMult * 1.3);
      break;
    case 'archers2':
      spawnUnit(world, 'enemy', 'archer');
      spawnUnit(world, 'enemy', 'archer');
      break;
    case 'swarm5':
      for (let i = 0; i < 5; i++) spawnUnit(world, 'enemy', 'infantry');
      break;
    case 'tower1':
    case 'tower2': {
      // Баг-репорт основателя (скриншот): вторая башня вставала прямо на
      // спрайт вражеского донжона — старая формула (`enemyCoreX - 34 -
      // idx*46`) отсчитывалась от ЦЕНТРА ядра, а не от реального края
      // донжона (тот занимает [core.x-CORE_KEEP_FAR, core.x-CORE_KEEP_NEAR],
      // см. drawCore()/data.js), и залезала внутрь него. У игрока то же не
      // воспроизводилось не потому, что там верная формула — там просто
      // фиксированные x (150/195/240 в startMission), которые случайно не
      // задевают свой донжон (край на playerCoreX+CORE_KEEP_FAR=50, отступ
      // до первой башни — 100, дальше шаг 45). Здесь — тот же принцип
      // (тот же отступ 100 от реального края донжона, тот же шаг 45),
      // отзеркаленный по направлению — считается от реального края, не от
      // центра ядра константой на глаз.
      const idx = world.enemyTowers.length;
      const castleOuterEdge = ARENA.enemyCoreX - CORE_KEEP_FAR;
      world.enemyTowers.push({
        x: castleOuterEdge - 100 - idx * 45, dmg: SHOP.towerA.dmg,
        range: SHOP.towerA.range, atkInterval: SHOP.towerA.atkInterval, timer: 0.3,
      });
      break;
    }
    case 'glyph':
      // Неуязвимость (4с, раунд 8 — было 3) — визуально как глиф в Dota 2
      // (см. КОНЦЕПТ_ГДД.md, «Допущения»): drawCore рисует свечение, пока
      // core.invulnerable > 0. Длительность — в конфиге (buff.duration),
      // не хардкод, основатель попросил.
      world.enemyCore.invulnerable = buff.duration || 4;
      world.onGlyph && world.onGlyph(world.enemyCore.x);
      break;
  }
}
