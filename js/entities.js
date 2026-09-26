// Боевая логика: юниты, герой, ядра, снаряды. Чистые функции над объектом
// world — рендер (game.js) читает эти же данные, не хранит копий.
'use strict';

let _uid = 1;
function nextId() { return _uid++; }

function makeCore(team, x, hp) {
  return { kind: 'core', team, x, y: 0, hp, maxHp: hp, hitFlash: 0 };
}

// Счёт заспавненных юнитов по команде (раунд 8, адаптивный ИИ) — сумма за
// весь матч, не число живых сейчас (см. КОНЦЕПТ_ГДД.md, «Допущения»).
function countSpawn(world, team) {
  world.spawnCount = world.spawnCount || { player: 0, enemy: 0 };
  world.spawnCount[team]++;
}

// Раунд 15 (П6): текущая ступень эпохи команды внутри боя (0 — стартовая
// эпоха миссии). world.ageStep заводит startMission; старые миры без поля
// (тесты/промо-страницы) считаются ступенью 0.
function teamAgeStep(world, team) {
  return (world.ageStep && world.ageStep[team]) || 0;
}
// Опыт команды (для смены эпохи) — за убийства и урон по ядру противника.
function addTeamXp(world, team, amount) {
  if (!world.xp || !(amount > 0)) return;
  world.xp[team] = (world.xp[team] || 0) + amount;
}

// Раунд 15 (И9): ряд по глубине для нового юнита (UNIT_LANES, data.js) —
// по кругу order отдельно для каждой стороны: соседи по очереди выхода
// идут в разных рядах, отряд из 3 — во всех трёх. Только отрисовка.
function nextLane(world, team) {
  const seq = world.laneSeq || (world.laneSeq = { player: 0, enemy: 0 });
  const order = UNIT_LANES.order;
  return order[(seq[team]++) % order.length];
}

// r15 И15: общий потолок живых врагов (mission.enemyAliveCap →
// world.enemyAliveCap, ENEMY_ALIVE_CAP в data.js). Считаются все живые враги,
// включая элиты и спецюнитов. Места нет — spawnUnit/spawnEliteUnit врага
// возвращают null; очереди (отряд на выходе, трикл) ждут места сами (ai.js).
function enemyAliveRoom(world) {
  if (!world.enemyAliveCap) return Infinity;
  let n = 0;
  for (const u of world.units) if (u.team === 'enemy' && u.state !== 'dead') n++;
  return world.enemyAliveCap - n;
}

function spawnUnit(world, team, typeId) {
  if (team === 'enemy' && enemyAliveRoom(world) <= 0) return null; // r15 И15: потолок врагов
  const t = UNIT_TYPES[typeId];
  const dir = team === 'player' ? 1 : -1;
  const x = team === 'player' ? ARENA.laneMin + 6 : ARENA.laneMax - 6;
  // DLC «Усилить врага» (утренняя правка основателя) — +HP/+урон именно
  // вражеским юнитам, не бьёт по игроку. hp — сразу в HP юнита (просто
  // масштаб), урон — через dmgMult, читается в updateUnits при атаке
  // (тот же канал, что и бафф "Боевой клич", множители перемножаются).
  const enemyBuff = team === 'enemy' && progress.dlcHardModeActive;
  const step = teamAgeStep(world, team);
  const ageMult = ageStatMult(step); // раунд 15: эпоха в бою
  // r15 И13: «новобранцы» врага в первых миссиях (mission.enemyRecruit →
  // world.enemyRecruit): дешевле и слабее на бойца, но их больше — кадр не
  // пустой, а сила армии на золото та же (hp×dmg ≈ cost²).
  const rec = team === 'enemy' ? world.enemyRecruit : null;
  // r15 И17: помощь после поражений подряд ослабляет и бойцов врага (game.js AI_HELP → world.enemyStatMult)
  const help = team === 'enemy' ? (world.enemyStatMult || 1) : 1;
  const hpMult = (enemyBuff ? SHOP.dlcHardMode.enemyUnitHpMult : 1) * ageMult * (rec ? rec.hp : 1) * help;
  const hp = Math.round(t.hp * hpMult);
  const u = {
    id: nextId(), kind: 'unit', team, typeId, dir,
    x, hp, maxHp: hp,
    state: 'walk', // walk | attack | dead
    walkPhase: Math.random() * Math.PI * 2,
    attackTimer: 0, deathT: 0, hitFlash: 0, knockback: 0,
    targetRef: null, elite: false,
    dmgMult: (enemyBuff ? SHOP.dlcHardMode.enemyUnitDmgMult : 1) * ageMult * (rec ? rec.dmg : 1) * help,
    cost: Math.round(ageUnitCost(typeId, step) * (rec ? rec.cost : 1)), // награда/опыт за убийство — от цены в его эпохе
    lane: nextLane(world, team), // И9: ряд по глубине — только отрисовка
  };
  world.units.push(u);
  countSpawn(world, team);
  SFX.spawn();
  return u;
}

function spawnEliteUnit(world, team, typeId, hpMult) {
  if (team === 'enemy' && enemyAliveRoom(world) <= 0) return null; // r15 И15: потолок врагов
  const t = UNIT_TYPES[typeId];
  const dir = team === 'player' ? 1 : -1;
  const x = team === 'player' ? ARENA.laneMin + 6 : ARENA.laneMax - 6;
  const enemyBuff = team === 'enemy' && progress.dlcHardModeActive;
  const step = teamAgeStep(world, team);
  const ageMult = ageStatMult(step);
  const help = team === 'enemy' ? (world.enemyStatMult || 1) : 1; // r15 И17: помощь после поражений
  const totalHpMult = hpMult * (enemyBuff ? SHOP.dlcHardMode.enemyUnitHpMult : 1) * ageMult * help;
  const hp = Math.round(t.hp * totalHpMult);
  world.units.push({
    id: nextId(), kind: 'unit', team, typeId, dir,
    x, hp, maxHp: hp,
    state: 'walk', walkPhase: 0, attackTimer: 0, deathT: 0, hitFlash: 0, knockback: 0,
    targetRef: null, elite: true,
    dmgMult: (enemyBuff ? SHOP.dlcHardMode.enemyUnitDmgMult : 1) * ageMult * help,
    cost: ageUnitCost(typeId, step),
    lane: nextLane(world, team), // И9: ряд по глубине — только отрисовка
  });
  countSpawn(world, team);
  SFX.spawn();
  return world.units[world.units.length - 1];
}

function aliveUnitsOf(world, team) {
  return world.units.filter(u => u.team === team && u.state !== 'dead');
}

function findTarget(world, unit) {
  const enemyTeam = unit.team === 'player' ? 'enemy' : 'player';
  const enemyCore = enemyTeam === 'player' ? world.playerCore : world.enemyCore;
  // r15 И13 (куратор №4: «ни одного удара по своей крепости»): в первых
  // миссиях (mission.enemySiege → world.enemySiege) вражеские стрелки,
  // дошедшие до дальности выстрела по крепости игрока, бьют крепость, а не
  // ближайшего бойца: прорыв к воротам ощущается «уколом» по крепости до
  // того, как армия игрока проиграна целиком. Урон по крепости игрока в
  // главе 1 и так снижен (playerCoreDmgMult).
  if (world.enemySiege && unit.team === 'enemy' && enemyCore.hp > 0) {
    const ut = UNIT_TYPES[unit.typeId];
    if (ut.role === 'ranged' && Math.abs(enemyCore.x - unit.x) <= ut.range + world.enemySiege) return { kind: 'core', ref: enemyCore };
  }
  // r15 И17 (куратор №6: «крепость врага 2,5 мин держалась на 25/1043 HP при
  // армии у ворот»): бойцы игрока били ближайшего — свежего защитника, который
  // рождается прямо у ворот, а не крепость. Ниже FINISH_HP её HP боец игрока,
  // достающий до крепости, бьёт крепость (добивание).
  if (unit.team === 'player' && enemyCore.hp > 0 && enemyCore.hp < enemyCore.maxHp * FINISH_HP &&
      Math.abs(enemyCore.x - unit.x) <= UNIT_TYPES[unit.typeId].range) return { kind: 'core', ref: enemyCore };
  let best = null, bestDist = Infinity;
  for (const u of world.units) {
    if (u.team !== enemyTeam || u.state === 'dead') continue;
    const d = Math.abs(u.x - unit.x);
    if (d < bestDist) { bestDist = d; best = { kind: 'unit', ref: u }; }
  }
  const hero = world.hero;
  if (hero.team === enemyTeam && hero.alive) {
    const d = Math.abs(hero.x - unit.x);
    if (d < bestDist) { bestDist = d; best = { kind: 'hero', ref: hero }; }
  }
  if (enemyCore.hp > 0) {
    const d = Math.abs(enemyCore.x - unit.x);
    if (d < bestDist) { bestDist = d; best = { kind: 'core', ref: enemyCore }; }
  }
  return best;
}

// «Раб с цепью» (раунд 5) — взаимодействует только со строениями (башни/
// капкан игрока), юнитов/героя/ядро как цель не видит вовсе (см.
// ПЛАН.md, раунд 5, и допущение в КОНЦЕПТ_ГДД.md).
function findBreakerTarget(world) {
  let best = null, bestX = Infinity;
  for (const tw of world.towers) {
    if (Math.abs(tw.x) < bestX) { bestX = Math.abs(tw.x); best = { kind: 'tower', ref: tw }; }
  }
  for (const tr of world.traps) {
    if (Math.abs(tr.x) < bestX) { bestX = Math.abs(tr.x); best = { kind: 'trap', ref: tr }; }
  }
  return best;
}

function updateBreakerUnit(world, u, t, dt) {
  // Цепь+шар — простая инерционная «физика» без реального солвера (раунд
  // 7): chainLag тянется к целевому значению (шар отстаёт при ходьбе,
  // подтягивается ближе на замахе), chainTaut — рывок натяжения на ударе.
  u.chainLag = u.chainLag || 0;
  u.chainTaut = u.chainTaut || 0;
  const target = findBreakerTarget(world);
  if (!target) {
    // Нет построек на поле — идёт к ядру, но не атакует его (не его цель).
    u.state = 'walk';
    u.walkPhase += dt * (t.speed / 12);
    u.x += u.dir * t.speed * dt;
    u.x = Math.max(ARENA.laneMin, Math.min(ARENA.laneMax, u.x));
    u.chainLag += (6 - u.chainLag) * Math.min(1, dt * 3);
    u.chainTaut = Math.max(0, u.chainTaut - dt * 2);
    return;
  }
  const dist = Math.abs(target.ref.x - u.x);
  const STRUCTURE_MELEE_RANGE = 20;
  if (dist <= STRUCTURE_MELEE_RANGE) {
    u.state = 'attack';
    u.chainTaut = Math.min(1, u.chainTaut + dt * 4);
    u.chainLag += (2 - u.chainLag) * Math.min(1, dt * 4);
    u.attackTimer -= dt;
    if (u.attackTimer <= 0) {
      u.attackTimer = t.atkInterval;
      target.ref.hp -= t.buildingDmg;
      SFX.hitMelee('heavy');
      if (target.ref.hp <= 0) {
        if (target.kind === 'tower') world.towers = world.towers.filter(tw => tw !== target.ref);
        else world.traps = world.traps.filter(tr => tr !== target.ref);
        // Раунд 7: разрушенная постройка не восстанавливается сама собой —
        // сброс постоянной покупки (progress.towerA/B/trap) делает game.js
        // через этот хук, чтобы магазин снова предложил её купить.
        world.onStructureDestroyed && world.onStructureDestroyed(target.kind, target.ref);
      }
      world.onImpact && world.onImpact(target.ref.x);
    }
  } else {
    u.state = 'walk';
    u.walkPhase += dt * (t.speed / 12);
    u.x += u.dir * t.speed * dt;
    u.x = Math.max(ARENA.laneMin, Math.min(ARENA.laneMax, u.x));
    u.chainLag += (6 - u.chainLag) * Math.min(1, dt * 3);
    u.chainTaut = Math.max(0, u.chainTaut - dt * 2);
  }
}

// r15 И15 (куратор №5: «м4 — 90 с на 1000, потом за 19 с до 86»; «м5 —
// крепость 1000 → 0 за 10 с»). «Стена» крепости игрока: урон по ней не
// быстрее FORT_GUARD.perSec × макс. HP в секунду — «ведро» ёмкостью burstSec
// секунд, пополняется непрерывно (updateFortGuard). Сверх лимита удар
// поглощается (world.fortAbsorbed, искра через world.onFortAbsorb). Итог: за
// любые 10 с — не больше ~35–38 % HP, полная крепость держится ≥ 30 с даже
// против толпы — у игрока всегда есть время вернуть героя, дать «Залп»,
// купить бойцов. Метки для сигнала «Fort under attack!» (HUD, И16):
// world.fortHitAt — время последнего удара (с боя), world.fortHitDps —
// урон/с за последние dpsWindowSec.
function makeFortGuard(maxHp, perSec) {
  const rate = maxHp * perSec;
  return { rate, cap: rate * FORT_GUARD.burstSec, budget: rate * FORT_GUARD.burstSec, hits: [] };
}
function fortGuardAbsorb(world, dmg) {
  const g = world.fortGuard;
  // r15 И21: «последний рубеж» (ниже LAST_STAND.hpFrac HP) — лимит снят,
  // стена не продлевает агонию (game.js updateLastStand)
  const ok = world.lastStand ? dmg : Math.min(dmg, Math.max(0, g.budget));
  g.budget -= ok;
  world.fortHitAt = world.clock || 0;
  if (ok > 0) g.hits.push([world.fortHitAt, ok]);
  if (dmg - ok > 0.01) {
    world.fortAbsorbed = (world.fortAbsorbed || 0) + (dmg - ok);
    world.onFortAbsorb && world.onFortAbsorb(dmg - ok);
  }
  return ok;
}
// Из update() (game.js) каждый кадр боя: пополнение «ведра» и урон/с за окно.
function updateFortGuard(world, dt, now) {
  world.clock = now;
  const g = world.fortGuard;
  if (!g) return;
  g.budget = Math.min(g.cap, g.budget + g.rate * dt);
  while (g.hits.length && g.hits[0][0] < now - FORT_GUARD.dpsWindowSec) g.hits.shift();
  let sum = 0;
  for (const h of g.hits) sum += h[1];
  world.fortHitDps = sum / FORT_GUARD.dpsWindowSec;
}

// r15 И15 (куратор №5: «в м1 нет угрозы: 1000/1000 в 3 из 4 прогонов»):
// «налётчик» — боец врага из первого натиска м1 (wave.assault.raiders,
// data.js I15_RAID). Активная армия игрока стоит у вражеских ворот и
// перемалывает любой отряд на выходе (бегущих сквозь строй убивало за 1–2 с),
// поэтому налётчики идут подкопом: вылезают из-под земли (пыль) в emergeDx px
// перед своей крепостью игрока, бегут к стене быстрее обычного (speedMult),
// не отвлекаясь на бойцов и героя, бьют стену blows раз по blowFrac × макс.
// HP и уходят обратно к своим воротам (там исчезают). Отбиться: герой у
// ворот, «Залп» (налётчики — передний край врага), свежекупленные бойцы
// (появляются прямо у стены). За убийство — обычная награда. Огненная аура
// (u.buffTimer, как у «Боевого клича») и искры — чтобы их было видно.
function makeRaider(world, u, cfg) {
  u.raid = { phase: 'charge', blows: cfg.blows, blowDmg: world.playerCore.maxHp * cfg.blowFrac, speedMult: cfg.speedMult };
  u.buffTimer = 1;
  if (cfg.emergeDx) {
    u.x = world.playerCore.x + cfg.emergeDx;
    world.onRaidEmerge && world.onRaidEmerge(u.x);
  }
}
function updateRaider(world, u, t, dt) {
  const R = u.raid, core = world.playerCore;
  u.buffTimer = 1;
  const speed = t.speed * R.speedMult;
  if (R.phase === 'charge' && core.hp > 0 && Math.abs(core.x - u.x) <= t.range) {
    u.state = 'attack';
    u.attackTimer -= dt;
    if (u.attackTimer <= 0) {
      u.attackTimer = t.atkInterval;
      // blowDmg — доля HP крепости; множитель главы (playerCoreDmgMult) не режет удар
      dealDamage(world, { kind: 'core', ref: core }, R.blowDmg / (world.playerCoreDmgMult || 1), null, t.role);
      if (--R.blows <= 0) { R.phase = 'flee'; u.dir = 1; }
    }
    return;
  }
  if (R.phase === 'charge' && core.hp <= 0) { R.phase = 'flee'; u.dir = 1; }
  u.state = 'walk';
  u.walkPhase += dt * (speed / 12);
  u.x += u.dir * speed * dt;
  u.x = Math.max(ARENA.laneMin, Math.min(ARENA.laneMax, u.x));
  if (R.phase === 'flee' && u.x >= ARENA.laneMax - 1) { u.state = 'dead'; u.deathT = 1; } // ушёл за свои ворота — без трупа и награды
}

function dealDamage(world, targetInfo, dmg, onKillTeamGold, attackerRole = 'melee', counterRole = null) {
  const ref = targetInfo.ref;
  // r15 И17: контры ролей (data.js counterMult) — только боец по бойцу;
  // counterRole — роль бойца-атакующего (у башен, «Залпа», героя её нет).
  if (counterRole && targetInfo.kind === 'unit') dmg *= counterMult(counterRole, UNIT_TYPES[ref.typeId].role);
  // Глиф неуязвимости вражеской базы (раунд 5, бафы по HP%) — урон вообще
  // не применяется, пока core.invulnerable > 0 (см. ai.js, applyEnemyBaseBuff).
  if (targetInfo.kind === 'core' && ref.invulnerable > 0) return;
  ref.hitFlash = 1;
  // Броня героя (снаряжение из магазина) снижает урон только ему; щитоносец
  // (раунд 8) — тот же принцип для обычного юнита, дефинировано на его типе.
  const unitReduction = targetInfo.kind === 'unit' ? (UNIT_TYPES[ref.typeId].dmgReduction || 0) : 0;
  let reduction = targetInfo.kind === 'hero' ? (ref.dmgReduction || 0) : unitReduction;
  // r15 И15: в главах 1–2 стрелы и камни бьют героя слабее (mission.heroRangedTaken
  // → world.heroRangedTaken): в главе 2 это 40–60 % урона по нему — вражеские
  // стрелки из-за спин своих выбирают героя, стоящего впереди армии.
  if (targetInfo.kind === 'hero' && attackerRole === 'ranged' && world.heroRangedTaken) reduction = 1 - (1 - reduction) * world.heroRangedTaken;
  // r15 И11: урон по крепости ИГРОКА в главе 1 ниже (mission.enemyCoreDmgMult
  // → world.playerCoreDmgMult, game.js startMission) — прорыв пары бойцов
  // в м1–м3 не сносит крепость за 20 с. По вражеской крепости — без изменений.
  // r15 И15: овертайм (game.js, OVERTIME) — крепость врага «сдаёт», урон по ней выше.
  const coreMult = targetInfo.kind !== 'core' ? 1 : ref.team === 'player' ? (world.playerCoreDmgMult || 1) : (world.enemyCoreDmgTakenMult || 1);
  let finalDmg = dmg * (1 - reduction) * coreMult;
  // r15 И19 (куратор №7: «вражеская крепость висит на 45→29 HP 60+ с»):
  // ниже FINISH_ONE_HIT её HP любой удар бойца, героя или «Залпа» игрока
  // добивает. Крепость ИГРОКА так не падает (её держит FORT_GUARD).
  if (targetInfo.kind === 'core' && ref.team === 'enemy' && ref.hp < ref.maxHp * FINISH_ONE_HIT) finalDmg = Math.max(finalDmg, ref.hp);
  if (targetInfo.kind === 'core' && ref.team === 'player' && world.fortGuard) {
    finalDmg = fortGuardAbsorb(world, finalDmg);
    if (finalDmg <= 0) return; // весь удар приняла стена — искра в world.onFortAbsorb
  }
  ref.hp -= finalDmg;
  if (typeof onDamageFx === 'function') onDamageFx(world, targetInfo.kind, ref, finalDmg, attackerRole); // раунд 15 (И4): числа урона, хит-стоп, тряска (game.js)
  if (targetInfo.kind === 'core') {
    SFX.coreHit();
    // Раунд 15: урон по ядру даёт опыт стороне-атакующему (смена эпохи).
    addTeamXp(world, ref.team === 'player' ? 'enemy' : 'player', Math.min(finalDmg, finalDmg + ref.hp) * AGE_UP.xpPerCoreDmg);
    world.onCoreHit && world.onCoreHit(ref, finalDmg);
    if (ref.hp <= 0) { ref.hp = 0; world.onCoreDestroyed && world.onCoreDestroyed(ref); }
    return;
  }
  if (targetInfo.kind === 'hero') {
    ref.knockback = -ref.facing * 4;
    SFX.heroHurt();
    if (ref.hp <= 0 && ref.alive) { ref.hp = 0; ref.alive = false; ref.respawnTimer = HERO.respawnDelay; world.onHeroDown && world.onHeroDown(); }
    return;
  }
  // unit — лёгкий визуальный откат назад (не влияет на боевую логику,
  // только на отрисовку) для читаемости попадания
  ref.knockback = -ref.dir * 4;
  // Раунд 14: хук только для VFX (искры в точке контакта), логики нет.
  world.onHit && world.onHit(ref, attackerRole);
  if (ref.hp <= 0 && ref.state !== 'dead') {
    ref.hp = 0;
    ref.state = 'dead';
    ref.deathT = 0.0001;
    SFX.death();
    const t = UNIT_TYPES[ref.typeId];
    const killerTeam = ref.team === 'player' ? 'enemy' : 'player';
    const unitCost = ref.cost || t.cost; // раунд 15: цена в эпохе, в которой юнит родился
    const reward = Math.round(unitCost * ECONOMY.killGoldShare * (ref.elite ? 1.8 : 1));
    onKillTeamGold && onKillTeamGold(killerTeam, reward);
    addTeamXp(world, killerTeam, unitCost * (ref.elite ? 1.8 : 1)); // раунд 15: опыт = цена убитого
    // Личный килл героя — отдельная монета "в рюкзак", сверх обычной
    // командной награды (см. ПЛАН.md, раунд 3: рюкзак героя).
    if (attackerRole === 'hero' || attackerRole === 'hero_special') {
      world.onHeroKill && world.onHeroKill(ref.x);
    }
    world.onUnitDeath && world.onUnitDeath(ref);
  } else if (attackerRole === 'ranged') {
    SFX.hitRanged();
  } else {
    SFX.hitMelee(attackerRole);
  }
}

function updateUnits(world, dt, onKillTeamGold) {
  for (const u of world.units) {
    if (u.hitFlash > 0) u.hitFlash = Math.max(0, u.hitFlash - dt * 4);
    if (u.knockback) u.knockback *= Math.max(0, 1 - dt * 10);
    if (u.state === 'dead') { u.deathT = Math.min(1, u.deathT + dt / 0.6); continue; }
    if (u.buffTimer > 0) u.buffTimer = Math.max(0, u.buffTimer - dt); // раунд 9: Боевой клич
    const t = UNIT_TYPES[u.typeId];
    if (t.role === 'breaker') { updateBreakerUnit(world, u, t, dt); continue; }
    if (u.raid) { updateRaider(world, u, t, dt); continue; } // r15 И15: «налётчик» м1
    const target = findTarget(world, u);
    if (!target) { u.state = 'walk'; continue; }
    const dist = Math.abs(target.ref.x - u.x);
    const buffed = u.buffTimer > 0;
    // DLC «Усилить врага» (u.dmgMult, см. spawnUnit) перемножается с
    // Боевым кличем — оба канала независимы, оба могут быть активны разом.
    const cryDmg = (buffed ? SHOP.heroAbilityCry.dmgMult : 1) * (u.dmgMult || 1);
    const crySpeed = buffed ? SHOP.heroAbilityCry.speedMult : 1;
    // r15 И13: «поджигатели» (world.enemySiege, px) — стрелок врага бьёт
    // крепость игрока с дальности t.range + enemySiege (навесом через строй).
    const range = (world.enemySiege && u.team === 'enemy' && target.kind === 'core') ? t.range + world.enemySiege : t.range;
    if (dist <= range) {
      u.state = 'attack';
      u.attackTimer -= dt;
      if (u.attackTimer <= 0) {
        u.attackTimer = t.atkInterval;
        if (t.role === 'ranged' || t.role === 'rider') {
          world.projectiles.push({
            team: u.team, x: u.x, y: -30, targetKind: target.kind, targetRef: target.ref,
            vx: (target.ref.x > u.x ? 1 : -1) * t.projectileSpeed, dmg: t.dmg * cryDmg, splash: t.splash || 0,
            // Раунд 14: только для отрисовки (vfx.js — дуга полёта и вид
            // снаряда по роли), в логике попадания не участвует.
            x0: u.x, tx: target.ref.x, role: t.role,
            cRole: t.role, // r15 И17: контры ролей
          });
          SFX.shoot();
        } else {
          dealDamage(world, target, t.dmg * cryDmg, onKillTeamGold, t.role, t.role);
        }
      }
    } else {
      u.state = 'walk';
      u.walkPhase += dt * (t.speed * crySpeed / 12);
      u.x += u.dir * t.speed * crySpeed * dt;
      u.x = Math.max(ARENA.laneMin, Math.min(ARENA.laneMax, u.x));
    }
    // «Наездник» — нижний боец вдобавок бьёт лоу-киком вплотную, на своём
    // независимом кулдауне (верхний в это же время может ещё стрелять
    // камнями — см. ПЛАН.md, раунд 5).
    if (t.role === 'rider') {
      u.meleeTimer = (u.meleeTimer || 0) - dt;
      if (dist <= t.meleeRange && u.meleeTimer <= 0) {
        u.meleeTimer = t.meleeInterval;
        dealDamage(world, target, t.meleeDmg * cryDmg, onKillTeamGold, 'melee');
      }
    }
  }
  world.units = world.units.filter(u => u.state !== 'dead' || u.deathT < 1);

  for (const p of world.projectiles) {
    p.x += p.vx * dt;
  }
  world.projectiles = world.projectiles.filter(p => {
    const ref = p.targetRef;
    const dead = (p.targetKind === 'unit' && ref.state === 'dead') ||
      (p.targetKind === 'hero' && !ref.alive) ||
      (p.targetKind === 'core' && ref.hp <= 0);
    if (dead) return false;
    const reached = (p.vx > 0 && p.x >= ref.x) || (p.vx < 0 && p.x <= ref.x);
    if (reached) {
      if (p.splash) {
        // Бомбардир (раунд 8) — сплэш только по юнитам, не по герою/ядру
        // (см. КОНЦЕПТ_ГДД.md, «Допущения») — иначе неожиданный урон по
        // площади прилетал бы игроку, просто стоящему рядом с юнитом.
        const enemyTeam = p.team === 'player' ? 'enemy' : 'player';
        for (const u2 of world.units) {
          if (u2.team !== enemyTeam || u2.state === 'dead') continue;
          if (Math.abs(u2.x - ref.x) <= p.splash) dealDamage(world, { kind: 'unit', ref: u2 }, p.dmg, onKillTeamGold, 'ranged', p.cRole);
        }
        // r15 И17: «огонь со стен» (ai.js updateGateGuard) задевает и героя
        const h = world.hero;
        if (p.heroSplash && h.team === enemyTeam && h.alive && Math.abs(h.x - ref.x) <= p.splash) dealDamage(world, { kind: 'hero', ref: h }, p.dmg * p.heroSplash, onKillTeamGold, 'ranged');
      } else {
        dealDamage(world, { kind: p.targetKind, ref }, p.dmg, onKillTeamGold, 'ranged', p.cRole);
      }
      world.onImpact && world.onImpact(ref.x);
      return false;
    }
    return p.x > -50 && p.x < ARENA.width + 50;
  });
}

// Раунд 15: правая граница хода героя — фасад вражеской крепости (край
// донжона CORE_KEEP_FAR от ядра, минус полкорпуса героя). Единый источник
// и для ограничения хода, и для правила «вплотную к стене — удар по ядру».
const HERO_WALL_GAP = 8;
function heroWallX(team) {
  return team === 'player' ? ARENA.enemyCoreX - CORE_KEEP_FAR - HERO_WALL_GAP : ARENA.laneMax + 60;
}

// Раунд 15 (И9, куратор: «на старте герой стоит внутри своей крепости и
// перекрывает её»): старт и воскрешение героя — перед воротами, за
// подножием холма крепости (фасад — core.x + 46, холм — до +62 при
// масштабе крепости до ×1.16), а не за стеной (было laneMin − 40 = 56).
const HERO_HOME_GAP = 90;
function heroHomeX(team) {
  return team === 'player' ? ARENA.playerCoreX + ARENA.coreWidth + HERO_HOME_GAP : ARENA.laneMax + 40;
}

// r15 И11 (куратор №3: «враги проходят мимо героя прямо к крепости»). Две
// причины: 1) герой проходил СКВОЗЬ вражеский строй — шёл дальше, враги
// оставались у него за спиной, дошагивали до крепости; 2) у своих ворот герой
// мог уйти за стену (laneMin − 60 = 36, сзади ядра x = 72) — враги у ядра
// били ядро как ближайшую цель, а герой оставался позади них. Теперь:
//  • HERO_BODY_GAP — герой не проходит сквозь живого вражеского бойца (кроме
//    «раба», у которого нет боевой цели): упирается в него, как в стену, и
//    враг у него на пути бьёт героя как ближайшую цель (findTarget);
//  • heroMinX — левая граница своего героя — фасад своих ворот (ядро + 48):
//    враг, идущий к ядру, всегда сначала встречает героя.
const HERO_BODY_GAP = 16;
function heroMinX(team) {
  return team === 'player' ? ARENA.playerCoreX + ARENA.coreWidth + 48 : ARENA.laneMin - 60;
}
function heroBlockedX(world, hero, oldX, newX) {
  const enemyTeam = hero.team === 'player' ? 'enemy' : 'player';
  for (const u of world.units) {
    if (u.team !== enemyTeam || u.state === 'dead' || UNIT_TYPES[u.typeId].role === 'breaker') continue;
    if (newX > oldX && u.x >= oldX) newX = Math.min(newX, Math.max(oldX, u.x - HERO_BODY_GAP));
    else if (newX < oldX && u.x <= oldX) newX = Math.max(newX, Math.min(oldX, u.x + HERO_BODY_GAP));
  }
  return newX;
}

function makeHero(team) {
  const x = heroHomeX(team);
  return {
    kind: 'hero', team, x, hp: HERO.hp, maxHp: HERO.hp, alive: true,
    facing: team === 'player' ? 1 : -1, respawnTimer: 0,
    attackCooldown: 0, attackAnimT: null, specialCooldown: 0, specialAnimT: null,
    pickaxeCooldown: 0, pickaxeAnimT: null,
    cryCooldown: 0, cryUnlocked: false, // раунд 9: способность "Боевой клич", покупка магазина
    hitFlash: 0, knockback: 0, walkPhase: 0, moving: false,
    dmgBonus: 0, dmgReduction: 0, // снаряжение из магазина (см. ПЛАН.md, раунд 3)
    cloakFlareT: 0, // утро: плащ (косметика) — раскрытие при развороте
  };
}

function updateHero(world, dt, input, onKillTeamGold) {
  const hero = world.hero;
  if (hero.hitFlash > 0) hero.hitFlash = Math.max(0, hero.hitFlash - dt * 4);
  if (hero.knockback) hero.knockback *= Math.max(0, 1 - dt * 10);
  // Плащ (косметика магазина) — при развороте на 0.35с усиленно "раскрывается"
  // (ветром), как будто засёк смену направления; вне разворота — обычное
  // лёгкое развевание в drawCloak() по walkPhase/moving.
  if (hero.cloakFlareT > 0) hero.cloakFlareT = Math.max(0, hero.cloakFlareT - dt / 0.35);
  if (!hero.alive) {
    hero.respawnTimer -= dt;
    if (hero.respawnTimer <= 0) {
      hero.alive = true;
      hero.hp = hero.maxHp;
      hero.x = heroHomeX(hero.team); // И9: перед воротами
    }
    return;
  }
  hero.attackCooldown = Math.max(0, hero.attackCooldown - dt);
  hero.specialCooldown = Math.max(0, hero.specialCooldown - dt);
  hero.pickaxeCooldown = Math.max(0, hero.pickaxeCooldown - dt);
  hero.cryCooldown = Math.max(0, hero.cryCooldown - dt);
  if (hero.attackAnimT !== null) {
    hero.attackAnimT += dt / 0.35;
    if (hero.attackAnimT >= 1) hero.attackAnimT = null;
  }
  if (hero.specialAnimT !== null) {
    hero.specialAnimT += dt / 0.5;
    if (hero.specialAnimT >= 1) hero.specialAnimT = null;
  }
  if (hero.pickaxeAnimT !== null) {
    hero.pickaxeAnimT += dt / 0.4;
    if (hero.pickaxeAnimT >= 1) hero.pickaxeAnimT = null;
  }

  const axis = input.moveAxis || 0;
  hero.moving = axis !== 0;
  if (axis !== 0) {
    const newFacing = axis > 0 ? 1 : -1;
    if (newFacing !== hero.facing) hero.cloakFlareT = 1;
    hero.facing = newFacing;
    const oldX = hero.x;
    hero.x += axis * HERO.moveSpeed * dt;
    // Раунд 15 (решение основателя): герой упирается в фасад вражеской
    // крепости, а не пробегает за неё (раньше laneMax+60 — удар «в пустоту»
    // за донжоном выглядел как баг). И11: и в свои ворота (heroMinX), и во
    // вражеского бойца на пути (heroBlockedX) — сквозь строй не проходит.
    hero.x = Math.max(heroMinX(hero.team), Math.min(heroWallX(hero.team), hero.x));
    hero.x = heroBlockedX(world, hero, oldX, hero.x);
    hero.walkPhase += dt * (HERO.moveSpeed / 12);
  }

  if (input.attackPressed && hero.attackCooldown <= 0) {
    hero.attackCooldown = HERO.meleeInterval;
    hero.attackAnimT = 0.0001;
    const enemyTeam = hero.team === 'player' ? 'enemy' : 'player';
    // «Длинное лезвие» (магазин) — платное +30% дальности только герою,
    // компенсация основателя за возврат проверки facing (см. ниже).
    const meleeRange = HERO.meleeRange * (hero.meleeRangeMult || 1);
    // Обычный удар — по одной ближайшей цели в радиусе и по направлению
    // взгляда (не AOE — площадной урон только у спец-удара, см. ГДД).
    let nearest = null, nearestDist = Infinity;
    for (const u of world.units) {
      if (u.team !== enemyTeam || u.state === 'dead') continue;
      const d = Math.abs(u.x - hero.x);
      if (d <= meleeRange && Math.sign(u.x - hero.x || hero.facing) === hero.facing && d < nearestDist) {
        nearest = u; nearestDist = d;
      }
    }
    const core = enemyTeam === 'player' ? world.playerCore : world.enemyCore;
    const coreDist = Math.abs(core.x - hero.x);
    // Раунд 15: вплотную к фасаду (у стены heroWallX) удар ВСЕГДА идёт по
    // ядру — независимо от дальности и взгляда: дальше герой пройти не
    // может, «развернуться и добить» больше не нужно.
    const atWall = hero.team === 'player' && hero.x >= heroWallX(hero.team) - 6;
    if (atWall && core.hp > 0) {
      dealDamage(world, { kind: 'core', ref: core }, (HERO.meleeDmg + hero.dmgBonus), onKillTeamGold, 'hero');
    } else if (nearest && (coreDist >= nearestDist || !(coreDist <= meleeRange))) {
      dealDamage(world, { kind: 'unit', ref: nearest }, (HERO.meleeDmg + hero.dmgBonus), onKillTeamGold, 'hero');
    } else if (coreDist <= meleeRange && Math.sign(core.x - hero.x || hero.facing) === hero.facing) {
      // ОТКАТ стадии 2 (прямое слово основателя): проскок героя за базу и
      // необходимость развернуться, чтобы добить — не баг, задуманная
      // механика («визуально видно, что герой прошёл мимо — пусть
      // разворачивается»). Проверка facing возвращена как было. Компенсация
      // основателя за это — платное «Длинное лезвие» (+30% дальности герою,
      // магазин), не изменение самого правила.
      dealDamage(world, { kind: 'core', ref: core }, (HERO.meleeDmg + hero.dmgBonus), onKillTeamGold, 'hero');
    } else {
      SFX.click();
    }
  }

  if (input.specialPressed && hero.specialCooldown <= 0) {
    hero.specialCooldown = HERO.specialCooldown;
    hero.specialAnimT = 0.0001;
    const enemyTeam = hero.team === 'player' ? 'enemy' : 'player';
    for (const u of world.units) {
      if (u.team !== enemyTeam || u.state === 'dead') continue;
      if (Math.abs(u.x - hero.x) <= HERO.specialRange) {
        dealDamage(world, { kind: 'unit', ref: u }, (HERO.specialDmg + hero.dmgBonus), onKillTeamGold, 'hero_special');
      }
    }
    SFX.heroSpecial();
    world.onHeroSpecial && world.onHeroSpecial(hero.x);
  }

  // Кирка — не боевое действие: монета из-под земли на отдельном
  // кулдауне, без цели/урона (см. ПЛАН.md, раунд 3, идея основателя).
  // Раунд 7 (баг-репорт): анимация копания больше не переиспользует
  // attackAnimT — своя поза (замах над головой + удар вниз), см. rig.js.
  if (input.pickaxePressed && hero.pickaxeCooldown <= 0) {
    hero.pickaxeCooldown = HERO.pickaxeCooldown;
    hero.pickaxeAnimT = 0.0001;
    SFX.mine();
    world.onPickaxe && world.onPickaxe(hero.x);
  }

  // Боевой клич (раунд 9, покупка магазина) — временный бафф урона/скорости
  // своим юнитам, живым на момент каста (см. КОНЦЕПТ_ГДД.md, «Допущения»).
  if (input.cryPressed && hero.cryUnlocked && hero.cryCooldown <= 0) {
    hero.cryCooldown = SHOP.heroAbilityCry.cooldown;
    for (const u of world.units) {
      if (u.team === hero.team && u.state !== 'dead') u.buffTimer = SHOP.heroAbilityCry.duration;
    }
    SFX.heroSpecial();
    world.onCry && world.onCry(hero.x);
  }
}

// ---------------------------------------------------------------- раунд 15: «Залп»
// Защита базы с миссии 1 (П6, ГДД «Допущения»): град снарядов эпохи
// стреляющей стороны на участок сразу за передним краем противника. Урон по
// площади только по юнитам (не по ядру и не по герою). Снаряды живут в
// world.volleyShells: логика — здесь, отрисовка — VFX.drawVolley (vfx.js).
const VOLLEY_KIND = { stone: 'stone', bronze: 'arrow', iron: 'ball' };

// Центр участка залпа или null, если бить некого.
function volleyTargetX(world, team) {
  const enemyTeam = team === 'player' ? 'enemy' : 'player';
  let front = null;
  for (const u of world.units) {
    if (u.team !== enemyTeam || u.state === 'dead') continue;
    if (front === null || (team === 'player' ? u.x < front : u.x > front)) front = u.x;
  }
  if (front === null) return null;
  const dir = team === 'player' ? 1 : -1;
  const half = VOLLEY.width / 2;
  return Math.max(ARENA.laneMin + half * 0.5, Math.min(ARENA.laneMax - half * 0.5, front + dir * VOLLEY.lead));
}

function launchVolley(world, team, centerX, ageId, dmgMult) {
  world.volleyShells = world.volleyShells || [];
  const dir = team === 'player' ? 1 : -1;
  const n = VOLLEY.shells;
  for (let i = 0; i < n; i++) {
    // стратифицированный разброс по ширине — без «дыр» и без кучи в центре
    const lx = centerX + ((i + Math.random()) / n - 0.5) * VOLLEY.width;
    const fall = VOLLEY.fallSec * (0.85 + Math.random() * 0.3);
    world.volleyShells.push({
      team, x: lx, delay: Math.random() * VOLLEY.spreadSec, t: 0, fall,
      sx: lx - dir * (110 + Math.random() * 50), sy: -330 - Math.random() * 40,
      kind: VOLLEY_KIND[ageId] || 'stone', dmg: VOLLEY.dmg * (dmgMult || 1), radius: VOLLEY.radius,
    });
  }
  world.volleyZone = { x: centerX, w: VOLLEY.width, t: 0, life: VOLLEY.spreadSec + VOLLEY.fallSec * 1.2, team };
}

function updateVolley(world, dt, onKillTeamGold) {
  if (world.volleyZone) {
    world.volleyZone.t += dt;
    if (world.volleyZone.t >= world.volleyZone.life) world.volleyZone = null;
  }
  if (!world.volleyShells || !world.volleyShells.length) return;
  for (const s of world.volleyShells) {
    if (s.delay > 0) { s.delay -= dt; continue; }
    s.t += dt;
    if (s.t < s.fall) continue;
    s.done = true;
    const enemyTeam = s.team === 'player' ? 'enemy' : 'player';
    for (const u of world.units) {
      if (u.team !== enemyTeam || u.state === 'dead') continue;
      if (Math.abs(u.x - s.x) <= s.radius) dealDamage(world, { kind: 'unit', ref: u }, s.dmg, onKillTeamGold, 'ranged');
    }
    // r15 И19: «Залп» игрока добивает крепость врага ниже FINISH_ONE_HIT
    // (снаряд лёг на донжон); выше порога залп крепость не бьёт, как раньше.
    const ec = world.enemyCore;
    if (s.team === 'player' && ec.hp > 0 && ec.hp < ec.maxHp * FINISH_ONE_HIT && Math.abs(ec.x - s.x) <= s.radius + CORE_KEEP_FAR) {
      dealDamage(world, { kind: 'core', ref: ec }, ec.hp, onKillTeamGold, 'volley');
    }
    world.onVolleyImpact && world.onVolleyImpact(s.x, s.kind);
  }
  world.volleyShells = world.volleyShells.filter(s => !s.done);
}
