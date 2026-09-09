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

function spawnUnit(world, team, typeId) {
  const t = UNIT_TYPES[typeId];
  const dir = team === 'player' ? 1 : -1;
  const x = team === 'player' ? ARENA.laneMin + 6 : ARENA.laneMax - 6;
  // DLC «Усилить врага» (утренняя правка основателя) — +HP/+урон именно
  // вражеским юнитам, не бьёт по игроку. hp — сразу в HP юнита (просто
  // масштаб), урон — через dmgMult, читается в updateUnits при атаке
  // (тот же канал, что и бафф "Боевой клич", множители перемножаются).
  const enemyBuff = team === 'enemy' && progress.dlcHardModeActive;
  const hpMult = enemyBuff ? SHOP.dlcHardMode.enemyUnitHpMult : 1;
  const hp = Math.round(t.hp * hpMult);
  const u = {
    id: nextId(), kind: 'unit', team, typeId, dir,
    x, hp, maxHp: hp,
    state: 'walk', // walk | attack | dead
    walkPhase: Math.random() * Math.PI * 2,
    attackTimer: 0, deathT: 0, hitFlash: 0, knockback: 0,
    targetRef: null, elite: false,
    dmgMult: enemyBuff ? SHOP.dlcHardMode.enemyUnitDmgMult : 1,
  };
  world.units.push(u);
  countSpawn(world, team);
  SFX.spawn();
  return u;
}

function spawnEliteUnit(world, team, typeId, hpMult) {
  const t = UNIT_TYPES[typeId];
  const dir = team === 'player' ? 1 : -1;
  const x = team === 'player' ? ARENA.laneMin + 6 : ARENA.laneMax - 6;
  const enemyBuff = team === 'enemy' && progress.dlcHardModeActive;
  const totalHpMult = hpMult * (enemyBuff ? SHOP.dlcHardMode.enemyUnitHpMult : 1);
  const hp = Math.round(t.hp * totalHpMult);
  world.units.push({
    id: nextId(), kind: 'unit', team, typeId, dir,
    x, hp, maxHp: hp,
    state: 'walk', walkPhase: 0, attackTimer: 0, deathT: 0, hitFlash: 0, knockback: 0,
    targetRef: null, elite: true,
    dmgMult: enemyBuff ? SHOP.dlcHardMode.enemyUnitDmgMult : 1,
  });
  countSpawn(world, team);
  SFX.spawn();
}

function aliveUnitsOf(world, team) {
  return world.units.filter(u => u.team === team && u.state !== 'dead');
}

function findTarget(world, unit) {
  const enemyTeam = unit.team === 'player' ? 'enemy' : 'player';
  const enemyCore = enemyTeam === 'player' ? world.playerCore : world.enemyCore;
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

function dealDamage(world, targetInfo, dmg, onKillTeamGold, attackerRole = 'melee') {
  const ref = targetInfo.ref;
  // Глиф неуязвимости вражеской базы (раунд 5, бафы по HP%) — урон вообще
  // не применяется, пока core.invulnerable > 0 (см. ai.js, applyEnemyBaseBuff).
  if (targetInfo.kind === 'core' && ref.invulnerable > 0) return;
  ref.hitFlash = 1;
  // Броня героя (снаряжение из магазина) снижает урон только ему; щитоносец
  // (раунд 8) — тот же принцип для обычного юнита, дефинировано на его типе.
  const unitReduction = targetInfo.kind === 'unit' ? (UNIT_TYPES[ref.typeId].dmgReduction || 0) : 0;
  const reduction = targetInfo.kind === 'hero' ? (ref.dmgReduction || 0) : unitReduction;
  const finalDmg = dmg * (1 - reduction);
  ref.hp -= finalDmg;
  if (targetInfo.kind === 'core') {
    SFX.coreHit();
    world.onCoreHit && world.onCoreHit(ref);
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
  if (ref.hp <= 0 && ref.state !== 'dead') {
    ref.hp = 0;
    ref.state = 'dead';
    ref.deathT = 0.0001;
    SFX.death();
    const t = UNIT_TYPES[ref.typeId];
    const reward = Math.round(t.cost * ECONOMY.killGoldShare * (ref.elite ? 1.8 : 1));
    onKillTeamGold && onKillTeamGold(ref.team === 'player' ? 'enemy' : 'player', reward);
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
    const target = findTarget(world, u);
    if (!target) { u.state = 'walk'; continue; }
    const dist = Math.abs(target.ref.x - u.x);
    const buffed = u.buffTimer > 0;
    // DLC «Усилить врага» (u.dmgMult, см. spawnUnit) перемножается с
    // Боевым кличем — оба канала независимы, оба могут быть активны разом.
    const cryDmg = (buffed ? SHOP.heroAbilityCry.dmgMult : 1) * (u.dmgMult || 1);
    const crySpeed = buffed ? SHOP.heroAbilityCry.speedMult : 1;
    if (dist <= t.range) {
      u.state = 'attack';
      u.attackTimer -= dt;
      if (u.attackTimer <= 0) {
        u.attackTimer = t.atkInterval;
        if (t.role === 'ranged' || t.role === 'rider') {
          world.projectiles.push({
            team: u.team, x: u.x, y: -30, targetKind: target.kind, targetRef: target.ref,
            vx: (target.ref.x > u.x ? 1 : -1) * t.projectileSpeed, dmg: t.dmg * cryDmg, splash: t.splash || 0,
          });
          SFX.shoot();
        } else {
          dealDamage(world, target, t.dmg * cryDmg, onKillTeamGold, t.role);
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
          if (Math.abs(u2.x - ref.x) <= p.splash) dealDamage(world, { kind: 'unit', ref: u2 }, p.dmg, onKillTeamGold, 'ranged');
        }
      } else {
        dealDamage(world, { kind: p.targetKind, ref }, p.dmg, onKillTeamGold, 'ranged');
      }
      world.onImpact && world.onImpact(ref.x);
      return false;
    }
    return p.x > -50 && p.x < ARENA.width + 50;
  });
}

function makeHero(team) {
  const x = team === 'player' ? ARENA.laneMin - 40 : ARENA.laneMax + 40;
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
      hero.x = ARENA.laneMin - 40;
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
    hero.x += axis * HERO.moveSpeed * dt;
    hero.x = Math.max(ARENA.laneMin - 60, Math.min(ARENA.laneMax + 60, hero.x));
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
    if (nearest && (coreDist >= nearestDist || !(coreDist <= meleeRange))) {
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
