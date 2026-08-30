/*
 * campaign.js — мета-слой ТЗ №08: состояние кампании (трофеи, апгрейды,
 * разблокировки), сборка боевого balance.json под конкретную битву. Без
 * DOM/Canvas — общий модуль для main.js (браузер) и tests/campaign_sim.js
 * (Node), как engine.js. В рантайме нет генераторов/солверов: все числа —
 * из balance.json.campaign, здесь только арифметика по ним.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LaneCampaign = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function freshCampaignState() {
    return {
      battleNumber: 1,
      trophies: 0,
      unlocked: { unlock_B: false, unlock_C: false },
      levels: { income: 0, base_hp: 0, damage_A: 0, damage_B: 0, damage_C: 0 },
      // ТЗ №11: N-12/K-24 (ежедневный крючок) + закон 9/K-18 (финал-событие).
      dailyStreak: 0,
      lastDailyUTCDay: null, // Date.UTC(y,m,d) целого дня последнего забранного бонуса
      milestoneShown: false
    };
  }

  // ТЗ №10: S-03 (сейв пишется целиком) + S-05 (номер схемы для миграций).
  // ТЗ №11: v1→v2 — добавлены dailyStreak/lastDailyUTCDay/milestoneShown
  // (N-12/K-24, закон 9). Реальное первое изменение схемы (S-05) — старый
  // v1-сейв ниже мигрирует явно, не через "поле просто отсутствует".
  var SAVE_SCHEMA_VERSION = 2;

  function serializeForSave(state) {
    return {
      v: SAVE_SCHEMA_VERSION,
      battleNumber: state.battleNumber,
      trophies: state.trophies,
      unlocked: { unlock_B: !!state.unlocked.unlock_B, unlock_C: !!state.unlocked.unlock_C },
      levels: {
        income: state.levels.income, base_hp: state.levels.base_hp,
        damage_A: state.levels.damage_A, damage_B: state.levels.damage_B, damage_C: state.levels.damage_C
      },
      dailyStreak: state.dailyStreak,
      lastDailyUTCDay: state.lastDailyUTCDay,
      milestoneShown: !!state.milestoneShown
    };
  }

  // S-05: функция миграции обязана существовать до первого реального
  // изменения схемы. Сейв v1 (фаза 10) — РЕАЛЬНЫЙ старый формат в этом
  // треке: не нёс дневной стрик и флаг финал-события вовсе — они
  // корректно стартуют с нуля/false для мигрируемого игрока (не потеря
  // прогресса — это НОВЫЕ системы фазы 11, у v1-игрока их и не было).
  // Версия сейва НОВЕЕ текущей (билд откатили, G-14) не читается частично.
  function migrateSave(raw) {
    var fresh = freshCampaignState();
    if (!raw || typeof raw !== 'object') return fresh;
    if (typeof raw.v === 'number' && raw.v > SAVE_SCHEMA_VERSION) {
      console.error('[campaign] сейв версии ' + raw.v + ' новее текущей (' + SAVE_SCHEMA_VERSION + ') — используются дефолты вместо частичного чтения');
      return fresh;
    }
    var out = fresh;
    if (typeof raw.battleNumber === 'number' && raw.battleNumber >= 1) out.battleNumber = raw.battleNumber;
    if (typeof raw.trophies === 'number' && raw.trophies >= 0) out.trophies = raw.trophies;
    if (raw.unlocked && typeof raw.unlocked === 'object') {
      out.unlocked.unlock_B = !!raw.unlocked.unlock_B;
      // C без B — невозможное состояние графа разблокировок (ГРАФ_РАЗБЛОКИРОВОК_ТЗ08.md),
      // не доверяем повреждённому сейву слепо.
      out.unlocked.unlock_C = !!raw.unlocked.unlock_C && out.unlocked.unlock_B;
    }
    if (raw.levels && typeof raw.levels === 'object') {
      ['income', 'base_hp', 'damage_A', 'damage_B', 'damage_C'].forEach(function (k) {
        if (typeof raw.levels[k] === 'number' && raw.levels[k] >= 0) out.levels[k] = raw.levels[k];
      });
    }
    // v1→v2 (ТЗ №11): поля просто отсутствуют у v1-сейва — fresh уже даёт
    // корректные дефолты (0/null/false), явную ветку по raw.v здесь
    // писать не на чем ветвить осмысленно за пределами того же дефолта.
    if (typeof raw.dailyStreak === 'number' && raw.dailyStreak >= 0) out.dailyStreak = raw.dailyStreak;
    if (typeof raw.lastDailyUTCDay === 'number') out.lastDailyUTCDay = raw.lastDailyUTCDay;
    if (typeof raw.milestoneShown === 'boolean') out.milestoneShown = raw.milestoneShown;
    return out;
  }

  // ---------- Ежедневный крючок возвращения (ТЗ №11, N-12/K-24) ----------
  // Единая точка времени — вызывающая сторона обязана передавать nowMs от
  // Platform.now() (K-24: "функция индекса и функция «сегодня» берут дату
  // из ОДНОГО источника"), не Date.now() напрямую — здесь только чистая
  // арифметика по уже полученному значению.
  function utcDayKey(nowMs) {
    var d = new Date(nowMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  // Чистая функция (K-06: явный boolean) — не мутирует state, чтобы UI мог
  // спросить "есть ли что забрать" без побочных эффектов.
  function dailyAvailable(state, nowMs) {
    return state.lastDailyUTCDay !== utcDayKey(nowMs);
  }

  // Мутирует state. Идемпотентна в пределах одного UTC-дня (повторный
  // вызов в тот же день ничего не начисляет повторно). Пропуск дня
  // СНИЖАЕТ стрик на streak_decay_on_miss, а не обнуляет («стрик
  // восстанавливается, а не сгорает дотла» — формулировка порога ТЗ №11;
  // полного текста N-12 в 01_СТАНДАРТЫ.txt нет, decay=1 — решение
  // исполнителя, см. BLOCKERS.md). Возвращает начисленные трофеи (0, если
  // уже забирали сегодня).
  function claimDaily(campaign, state, nowMs) {
    var todayKey = utcDayKey(nowMs);
    if (state.lastDailyUTCDay === todayKey) return 0;
    var ONE_DAY_MS = 24 * 60 * 60 * 1000;
    if (state.lastDailyUTCDay === null) {
      state.dailyStreak = 1; // самый первый заход
    } else if (todayKey - state.lastDailyUTCDay === ONE_DAY_MS) {
      state.dailyStreak += 1; // подряд
    } else {
      state.dailyStreak = Math.max(1, state.dailyStreak - campaign.daily.streak_decay_on_miss);
    }
    state.lastDailyUTCDay = todayKey;
    return campaign.daily.bonus_trophies;
  }

  function upgradeCost(campaign, key, state) {
    var def = campaign.upgrades[key];
    var nextLevel = state.levels[key] + 1;
    if (nextLevel > def.max_level) return null;
    return Math.round(def.cost_base * nextLevel);
  }

  function unlockCost(campaign, key) {
    return campaign.unlocks[key].cost;
  }

  function canBuyUnlock(campaign, key, state) {
    if (state.unlocked[key]) return false;
    var def = campaign.unlocks[key];
    if (def.requires && !state.unlocked[def.requires]) return false;
    return state.trophies >= def.cost;
  }

  function canBuyUpgrade(campaign, key, state) {
    var def = campaign.upgrades[key];
    if (def.requires && !state.unlocked[def.requires]) return false;
    var cost = upgradeCost(campaign, key, state);
    if (cost === null) return false;
    return state.trophies >= cost;
  }

  function buyUnlock(campaign, key, state) {
    if (!canBuyUnlock(campaign, key, state)) return false;
    state.trophies -= unlockCost(campaign, key);
    state.unlocked[key] = true;
    return true;
  }

  function buyUpgrade(campaign, key, state) {
    if (!canBuyUpgrade(campaign, key, state)) return false;
    var cost = upgradeCost(campaign, key, state);
    state.trophies -= cost;
    state.levels[key] += 1;
    return true;
  }

  // Собирает боевой balance для конкретной битвы: клонирует базовый
  // baseBalance, применяет апгрейды игрока (player_unit_overrides,
  // production_rate, base_hp) и сложность врага (сжатие расписания волн по
  // номеру битвы, дефолт-формула из campaign.difficulty). Не мутирует
  // baseBalance/state. Урон/HP вражеских юнитов НЕ растут по номеру битвы —
  // balance.units общий для игрока и врага (см. ГРАФ_РАЗБЛОКИРОВОК_ТЗ08.md).
  function buildBattleBalance(baseBalance, state, battleNumber) {
    var b = JSON.parse(JSON.stringify(baseBalance));
    var campaign = baseBalance.campaign;

    b.player.production_rate += state.levels.income * campaign.upgrades.income.step;
    b.player.base_hp += state.levels.base_hp * campaign.upgrades.base_hp.step;

    b.player_unit_overrides = {
      A: { damage_bonus: state.levels.damage_A * campaign.upgrades.damage_A.step },
      B: { damage_bonus: state.levels.damage_B * campaign.upgrades.damage_B.step },
      C: { damage_bonus: state.levels.damage_C * campaign.upgrades.damage_C.step }
    };

    var diff = campaign.difficulty;
    var mult = Math.max(diff.schedule_time_floor, Math.pow(diff.schedule_time_mult_per_battle, battleNumber - 1));
    b.enemy.schedule.forEach(function (w) { w.time = w.time * mult; });

    b.campaignUnlocked = { A: true, B: !!state.unlocked.unlock_B, C: !!state.unlocked.unlock_C };
    return b;
  }

  function reward(baseBalance, battleNumber, won) {
    var r = baseBalance.campaign.reward;
    var base = won ? r.win_base : r.lose_base;
    var step = won ? r.win_per_battle_step : r.lose_per_battle_step;
    return Math.round(base + (battleNumber - 1) * step);
  }

  return {
    freshCampaignState: freshCampaignState,
    SAVE_SCHEMA_VERSION: SAVE_SCHEMA_VERSION,
    serializeForSave: serializeForSave,
    migrateSave: migrateSave,
    upgradeCost: upgradeCost,
    unlockCost: unlockCost,
    canBuyUnlock: canBuyUnlock,
    canBuyUpgrade: canBuyUpgrade,
    buyUnlock: buyUnlock,
    buyUpgrade: buyUpgrade,
    buildBattleBalance: buildBattleBalance,
    reward: reward,
    dailyAvailable: dailyAvailable,
    claimDaily: claimDaily
  };
});
