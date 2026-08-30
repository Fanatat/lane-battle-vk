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
      levels: { income: 0, base_hp: 0, damage_A: 0, damage_B: 0, damage_C: 0 }
    };
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
    upgradeCost: upgradeCost,
    unlockCost: unlockCost,
    canBuyUnlock: canBuyUnlock,
    canBuyUpgrade: canBuyUpgrade,
    buyUnlock: buyUnlock,
    buyUpgrade: buyUpgrade,
    buildBattleBalance: buildBattleBalance,
    reward: reward
  };
});
