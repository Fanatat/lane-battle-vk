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
    elapsed: 0, // раунд 15: часы боя для таймера смены эпохи врага
    soft: null, // раунд 15 (И8): мягкий старт миссии 1 (makeSoftStart)
  };
}

// Раунд 15 (И8, замечание куратора CrazyGames: «миссия 1 наказывает
// медлящего новичка») — мягкий старт миссии 1, пока она ни разу не пройдена
// (туториал ещё не завершён или миссия 1 ещё не выиграна). Числа —
// mission.softStart (data.js). Три части, без видимой паузы:
//  1) «ворота»: враг не копит золото и не покупает, пока игрок не сделал
//     шаги туториала 1–3 (купил бойца, подвигал героя, ударил) — или не
//     прошло gateMaxSec (бездействующий игрок не должен повесить бой);
//  2) «раскачка»: после ворот часы врага (доход, закупка, апгрейды, таймер
//     эпохи) идут со скоростью от rampFrom до 1 за rampSec;
//  3) «поводок»: на юнитов враг тратит не больше spendBase + spendShare ×
//     (сколько игрок вложил в армию) + pressShare × «нажим героя» (урон по
//     ядру, пока герой у стены) — новичок, покупающий раз в 15 с, всё равно
//     сильнее, а раш героем встречает ответ; враг покупает только юниты,
//     открытые игроку, эпоха врага не обгоняет эпоху игрока, ответы крепости
//     на пороги HP слабее (applyEnemyBaseBuff);
//  4) брошенный игроком герой отбивается у своих ворот (softStartHeroGuard).
// Повтор миссии 1 после победы и миссии 2+ — прежний баланс (soft = null).
function makeSoftStart(mission, world) {
  const cfg = mission.softStart;
  if (!cfg) return null;
  if (progress.tutorialDone && (progress.unlocked || 1) > 1) return null;
  return {
    cfg, open: false, gateT: 0, rampT: 0,
    flags: {}, heroLastX: world.hero.x, moved: 0,
    waves: 0,
  };
}

// Раунд 15 (И9): «поводок» закупки врага — не только мягкий старт м1, но и
// миссии 2–3 (mission.enemyLeash, data.js): враг тратит на юнитов не больше
// spendBase + spendShare × (вложения игрока в армию) + pressShare × (урон
// героя по ядру у стены). Куратор CrazyGames: «м2 — резкий скачок, орда
// 8–10 врагов, моя база падает за 20 с» — медленный новичок тратит 2–4
// золота/с, а враг м2 без поводка — весь свой доход 7.9/с + награды.
function enemyLeashCfg(ai, mission) {
  return ai.soft ? ai.soft.cfg : (mission.enemyLeash || null);
}
// Учёт вложений игрока и «нажима героя» — каждый кадр боя, пока есть поводок.
function trackEnemyLeash(world, ai) {
  const L = ai.leash || (ai.leash = { seen: new WeakSet(), playerSpent: 0, enemySpent: 0, press: 0, coreHpLast: world.enemyCore.hp });
  for (const u of world.units) {
    if (u.team === 'player' && !L.seen.has(u)) { L.seen.add(u); L.playerSpent += u.cost || 0; }
  }
  // «Нажим героя»: урон по вражескому ядру, пока герой у его стены, —
  // крепость отвечает бойцами (иначе активный игрок сносил её героем за 30 с).
  const coreDrop = Math.max(0, L.coreHpLast - world.enemyCore.hp);
  L.coreHpLast = world.enemyCore.hp;
  if (coreDrop > 0 && world.hero.alive && world.hero.x >= heroWallX('player') - 60) L.press += coreDrop;
  return L;
}

// Из update() (game.js) каждый кадр боя: множитель времени врага (0 — ворота).
function updateSoftStart(world, ai, dt) {
  const s = ai.soft;
  if (!s) return 1;
  trackEnemyLeash(world, ai);
  if (!s.open) {
    s.gateT += dt;
    const f = s.flags, hero = world.hero;
    if (world.spawnCount && world.spawnCount.player > 0) f.buy = true;
    if (hero.alive && !hero.autoGuard) {
      s.moved += Math.abs(hero.x - s.heroLastX);
      if (s.moved >= 24) f.move = true;
      if (hero.attackAnimT !== null && hero.attackAnimT !== undefined) f.attack = true;
    }
    s.heroLastX = hero.x;
    if ((f.buy && f.move && f.attack) || s.gateT >= s.cfg.gateMaxSec) {
      s.open = true;
      // И9: «казна» к открытию ворот — первая встречная волна (3 бойца)
      // выходит сразу, а не через 15–20 с раскачки дохода.
      ai.gold += s.cfg.openGold || 0;
    }
    return 0;
  }
  s.rampT += dt;
  return s.cfg.rampFrom + (1 - s.cfg.rampFrom) * Math.min(1, s.rampT / s.cfg.rampSec);
}

// Из update() до updateHero: герой, которого игрок не трогает дольше
// cfg.guardIdleSec, сам отбивается от врагов у своей крепости (ближе
// cfg.guardZone к её фасаду): подходит, разворачивается, бьёт обычным
// ударом. Медленный новичок оставляет героя у ворот — без этого пара
// прорвавшихся бойцов сносила ядро, пока он думал. На это время
// hero.autoGuard = true: туториал и «ворота» не засчитывают такие шаги
// и удары за действия игрока.
function softStartHeroGuard(world, ai, input, dt) {
  const s = ai.soft, hero = world.hero;
  if (!s || !s.cfg.guardIdleSec) return;
  hero.autoGuard = false;
  if (input.moveAxis || input.attackPressed || input.specialPressed || input.pickaxePressed) { s.heroIdleT = 0; return; }
  s.heroIdleT = (s.heroIdleT || 0) + dt;
  if (!hero.alive || s.heroIdleT < s.cfg.guardIdleSec) return;
  const zoneX = world.playerCore.x + s.cfg.guardZone;
  if (hero.x > zoneX) return; // герой, оставленный в поле, сам к воротам не бежит
  let near = null;
  for (const u of world.units) {
    if (u.team !== 'enemy' || u.state === 'dead' || u.x > zoneX) continue;
    if (!near || Math.abs(u.x - hero.x) < Math.abs(near.x - hero.x)) near = u;
  }
  if (!near) return;
  hero.autoGuard = true;
  const reach = HERO.meleeRange * (hero.meleeRangeMult || 1);
  const d = near.x - hero.x;
  if (Math.abs(d) > reach - 8) { input.moveAxis = Math.sign(d); return; }
  hero.facing = d >= 0 ? 1 : -1;
  input.attackPressed = true;
}

// Сколько ещё золота поводок разрешает потратить на юнитов (Infinity — без поводка).
function enemyLeashRoom(ai, mission) {
  const cfg = enemyLeashCfg(ai, mission);
  if (!cfg) return Infinity;
  const L = ai.leash;
  // И11: spendRate — «поводок со временем» (волны есть и у медленного
  // новичка); ai.help — помощь после поражений подряд (game.js, AI_HELP).
  const k = (ai.help ? ai.help.leashMult : 1) * (ai.overtime ? OVERTIME_STALL.leashMult : 1); // r15 И17: овертайм
  const allowed = (cfg.spendBase + (cfg.spendRate || 0) * (ai.elapsed || 0)) * k;
  if (!L) return allowed;
  // r15 И17: вложения игрока в «спам» одного типа (SPAM_WATCH) — враг отвечает контрами сверх обычного поводка
  const spam = SPAM_WATCH.leashShare * counterK(ai) * (ai.spamSpent || 0);
  return allowed + (cfg.spendShare * L.playerSpent + (cfg.pressShare || 0) * L.press + spam) * k - L.enemySpent;
}

// r15 И17 «Глубина против спама» (куратор №6: «спам бойца „1“ — 95 % покупок,
// м1–м5 за 43–59 с на 3★»). Враг следит за последними покупками игрока
// (SPAM_WATCH.window за memorySec): если ≥ share одного типа — это «спам», враг
// отвечает контром (COUNTER_PICK, первый открытый игроку в этой миссии):
// покупает его с вероятностью pickP, ведёт им натиск, поводок растёт на
// leashShare × вложения в спам-тип (enemyLeashRoom). Контры ролей — data.js
// counterMult, общие для обеих сторон: смешанная армия бьёт ответ врага.
// r15 И19: помощь после поражений подряд (game.js AI_HELP.counterMult) смягчает
// ответ на спам — игрок, упёршийся в контры, по 3-й попытке может дожать.
function counterK(ai) {
  return ai.help && ai.help.counterMult !== undefined ? ai.help.counterMult : 1;
}
function trackPlayerMix(world, ai, mission) {
  const seen = ai.mixSeen || (ai.mixSeen = new WeakSet());
  const buys = ai.mixBuys || (ai.mixBuys = []);
  const now = ai.elapsed || 0;
  for (const u of world.units) {
    if (u.team !== 'player' || seen.has(u)) continue;
    seen.add(u);
    buys.push({ t: now, id: u.typeId, cost: u.cost || 0 });
    if (ai.counter && u.typeId === ai.counter.vs) ai.spamSpent = (ai.spamSpent || 0) + (u.cost || 0);
  }
  while (buys.length && (buys.length > SPAM_WATCH.window || buys[0].t < now - SPAM_WATCH.memorySec)) buys.shift();
  let top = null, n = 0;
  if (buys.length >= SPAM_WATCH.minBuys) {
    const cnt = {};
    for (const b of buys) { cnt[b.id] = (cnt[b.id] || 0) + 1; if (!top || cnt[b.id] > cnt[top]) top = b.id; }
    n = cnt[top];
  }
  let spamType = top && n / buys.length >= SPAM_WATCH.share ? top : null;
  // r15 И19 (куратор №7: «вдумчивый игрок смешивает юниты» — жмёт 1-2-3-4, но
  // по карману при 30 золота только пехота, и враг отвечал копьями как на
  // спам): если по НАЖАТИЯМ (world.buyIntents, game.js tryBuyUnit) за то же
  // окно спам-тип — меньше intentShare, это смешивающий игрок, не спам.
  if (spamType && world.buyIntents) {
    let all = 0, same = 0;
    for (const b of world.buyIntents) if (b.t >= now - SPAM_WATCH.memorySec) { all++; if (b.id === spamType) same++; }
    if (all >= SPAM_WATCH.minBuys && same / all < SPAM_WATCH.intentShare) spamType = null;
  }
  if (!spamType) { ai.counter = null; return; }
  if (ai.counter && ai.counter.vs === spamType) return;
  const pick = (COUNTER_PICK[spamType] || []).find(id => UNIT_TYPES[id].unlockMission <= mission.id);
  if (!pick) { ai.counter = null; return; }
  ai.counter = { vs: spamType, pick };
  // тост игроку: не чаще tipEverySec, не больше tipMax за бой
  if ((ai.counterTips || 0) < SPAM_WATCH.tipMax && now - (ai.counterTipAt === undefined ? -1e9 : ai.counterTipAt) >= SPAM_WATCH.tipEverySec) {
    ai.counterTips = (ai.counterTips || 0) + 1;
    ai.counterTipAt = now;
    world.onCounter && world.onCounter(pick, spamType);
  }
}

// r15 И17: «огонь со стен» вражеской крепости (mission.gateGuard, data.js
// GATE_GUARD, с м2). Раньше у ворот врага стояла только одноразовая защита по
// порогам HP (башни/рой), и армия дешёвой пехоты, дойдя до ворот, сносила
// крепость за 5–10 с, а свежие защитники рождались прямо в её толпу. Горшок с
// огнём летит из донжона в ближайшего бойца игрока (или героя) не дальше range
// от фасада и жжёт всех в splash px: толпа у ворот горит, тяжёлый выдерживает,
// лучники (дальность 190) бьют крепость из-за границы огня.
function updateGateGuard(world, ai, mission, dt) {
  const G = mission.gateGuard;
  if (!G || world.enemyCore.hp <= 0) return;
  ai.gateT = (ai.gateT === undefined ? G.interval : ai.gateT) - dt;
  if (ai.gateT > 0) return;
  const face = ARENA.enemyCoreX - CORE_KEEP_FAR;
  const edge = face - G.range;
  let best = null, bestX = -Infinity, kind = 'unit';
  for (const u of world.units) {
    if (u.team !== 'player' || u.state === 'dead' || u.x < edge) continue;
    if (u.x > bestX) { bestX = u.x; best = u; }
  }
  // огонь бьёт армию; героя — только когда рядом нет бойцов (и слабее, heroMult):
  // иначе герой у стены сгорал за бой несколько раз (звезда «герой не пал»)
  const h = world.hero;
  if (!best && h.alive && h.x >= edge) { best = h; bestX = h.x; kind = 'hero'; }
  if (!best) { ai.gateT = 0.2; return; }
  ai.gateT = G.interval;
  const x0 = ARENA.enemyCoreX - CORE_KEEP_NEAR - 8;
  world.projectiles.push({
    team: 'enemy', x: x0, y: -60, targetKind: kind, targetRef: best,
    // полный огонь — только в ответ на спам (ai.counter), иначе ×gateBase
    vx: -300, dmg: G.dmg * (ai.counter && !world.overtime ? 1 : SPAM_WATCH.gateBase) * (world.enemyTowerDmgMult || 1) * (world.enemyStatMult || 1),
    splash: G.splash, heroSplash: G.heroMult, cRole: 'gate', x0, tx: best.x, role: 'gate',
  });
  SFX.shoot();
}
// r15 И17: налёт (mission.raidI17 = I15_RAID + RAID_I17) в м2–м5 — своя
// очередь, потому что в м4–м5 нет отрядов (updateEnemyWave). Налётчики
// вылезают перед крепостью игрока и бьют стену (entities.js makeRaider).
function updateRaidI17(world, ai, mission, dt) {
  const R = mission.raidI17;
  if (!R) return;
  if (ai.raid17At === undefined) ai.raid17At = R.atSec[0] + Math.random() * (R.atSec[1] - R.atSec[0]);
  if (!ai.raid17Sent && (ai.elapsed || 0) >= ai.raid17At) {
    ai.raid17Sent = true;
    ai.raid17Q = [];
    for (let i = 0; i < R.raiders; i++) ai.raid17Q.push({ delay: i * R.gap });
    world.onAssault && world.onAssault();
  }
  const q = ai.raid17Q;
  if (!q || !q.length) return;
  for (const o of q) o.delay -= dt;
  while (q.length && q[0].delay <= 0 && enemyAliveRoom(world) > 0) {
    q.shift();
    const u = spawnUnit(world, 'enemy', 'infantry');
    if (u) makeRaider(world, u, R);
  }
}
// r15 И19 (куратор №7: «спамер м2 — 415 с, HP вражеской крепости 600/600 весь
// бой; невнимательный м3 — с 130 по 330 с счёт не меняется»). Анти-пат: если
// STALL_ESC.assaultSec с ни одна крепость не получила урона (game.js
// updateI15), враг идёт на штурм — бесплатный отряд по размеру армии игрока
// (как натиск И13) в пределах потолка поля. Возвращает false, если места нет.
function launchStallAssault(world, ai, mission) {
  const E = STALL_ESC;
  const room = enemyAliveRoom(world);
  if (room <= 0) return false;
  let value = 0;
  for (const u of world.units) if (u.team === 'player' && u.state !== 'dead') value += u.cost || 0;
  const step = teamAgeStep(world, 'enemy');
  const pool = UNIT_ORDER.filter(id => UNIT_TYPES[id].unlockMission <= mission.id && UNIT_TYPES[id].role !== 'heavy');
  const avg = pool.reduce((s, id) => s + ageUnitCost(id, step), 0) / pool.length;
  const n = Math.min(room, Math.max(E.minN, Math.min(E.maxN, Math.round(E.k * value / avg))));
  const q = ai.escQ || (ai.escQ = []);
  let ranged = 0;
  for (let i = 0; i < n; i++) {
    let id = pool[Math.floor(Math.random() * pool.length)];
    if (ai.counter && Math.random() < SPAM_WATCH.assaultP * counterK(ai)) id = ai.counter.pick;
    if (UNIT_TYPES[id].role === 'ranged' && ranged >= E.maxRanged) id = 'infantry';
    if (UNIT_TYPES[id].role === 'ranged') ranged++;
    q.push({ typeId: id, delay: i * E.gap });
  }
  world.onAssault && world.onAssault();
  return true;
}
function updateStallAssault(world, ai, dt) {
  const q = ai.escQ;
  if (!q || !q.length) return;
  for (const o of q) o.delay -= dt;
  while (q.length && q[0].delay <= 0 && enemyAliveRoom(world) > 0) spawnUnit(world, 'enemy', q.shift().typeId);
}
function enemyLeashAllows(ai, mission, cost) {
  return cost <= enemyLeashRoom(ai, mission);
}

// Раунд 15 (И9, куратор: «в м1 нет боя — враг выпускает бойцов поодиночке,
// армия игрока доходит до крепости без сопротивления»). Волны: закупка врага
// копится в отряд из wave.size[0]…wave.size[1] бойцов и выходит пачкой (по
// wave.gap с между бойцами) — армии встречаются группами. Конфиг — softStart.wave
// (м1 первого прохождения) или mission.enemyWave (м1–м3). Отряд выходит
// раньше, если бойцы игрока подошли к крепости врага (защита) или если он
// ждёт дольше wave.maxWait с и в нём уже ≥2 бойца (не копить вечно).
function enemyWaveCfg(ai, mission) {
  return ai.soft ? (ai.soft.cfg.wave || null) : (mission.enemyWave || null);
}
// Бойцы игрока или герой ближе wave.guardDist к крепости врага.
function enemyFortThreat(world, wave) {
  const edge = ARENA.enemyCoreX - wave.guardDist;
  if (world.hero.alive && world.hero.x >= edge) return true;
  for (const u of world.units) {
    if (u.team === 'player' && u.state !== 'dead' && u.x >= edge) return true;
  }
  return false;
}
// И11: волна по расписанию (wave.every) — выходит не раньше срока
// ai.waveClock (часы врага), дальше — как наберёт отряд или size[0], не
// позже maxWait после срока (с тем, что есть). Бойцы игрока у крепости —
// выход сразу, как и раньше.
function waveReady(world, ai, wave, q) {
  if (enemyFortThreat(world, wave)) return true;
  if (!wave.every) return q.length >= ai.waveTarget || (q.length >= 2 && ai.waveWait >= wave.maxWait);
  if (ai.waveClock > 0) return false;
  return q.length >= ai.waveTarget || q.length >= wave.size[0] || ai.waveClock <= -wave.maxWait;
}
// r15 И13 (куратор №4: «в м1–м3 нет угрозы: ни одного удара по своей
// крепости, у врага на поле 0–3 бойца, бой у вражеских ворот»). «Натиск» —
// волна по расписанию (wave.assault: first/every — часы врага, с), о которой
// предупреждает надпись за warn с. Размер — от армии игрока на поле:
// k × (цена живых бойцов игрока) + heroValue за живого героя, в бойцах —
// от minN до maxN (и не выше потолка поля maxAlive + extra). Бойцы натиска
// бесплатные (как элита и спецюниты), поводок и казну не трогают: это «такт»
// давления — фронт откатывается через середину, крепость получает удар, — а
// не рост экономики врага. Поэтому игрок, который отбил натиск, дожимает.
function enemyAssaultPool(world, ai, mission, wave) {
  if (wave.clubsUntil && ai.elapsed < wave.clubsUntil) return ['infantry'];
  return UNIT_ORDER.filter(id => UNIT_TYPES[id].unlockMission <= mission.id && UNIT_TYPES[id].role !== 'heavy');
}
function launchEnemyAssault(world, ai, mission, wave, A) {
  let value = world.hero.alive ? (A.heroValue || 0) : 0;
  for (const u of world.units) if (u.team === 'player' && u.state !== 'dead') value += u.cost || 0;
  const step = teamAgeStep(world, 'enemy');
  const rec = world.enemyRecruit ? world.enemyRecruit.cost : 1;
  const pool = enemyAssaultPool(world, ai, mission, wave);
  const avg = pool.reduce((s, id) => s + ageUnitCost(id, step) * rec, 0) / pool.length;
  let n = Math.max(A.minN, Math.min(A.maxN, Math.round(A.k * value / avg)));
  // потолок поля — жёсткий: живые враги + уже идущие на выход + натиск ≤ maxAlive + extra
  const alive = world.units.filter(u => u.team === 'enemy' && u.state !== 'dead' && !u.elite).length + (ai.waveOut ? ai.waveOut.length : 0) + (ai.waveQ ? ai.waveQ.length : 0);
  if (wave.maxAlive) n = Math.min(n, wave.maxAlive + (A.extra || 0) - alive);
  const out = ai.waveOut || (ai.waveOut = []);
  // r15 И15: первый натиск м1 ведут «налётчики» (A.raiders, data.js I15_RAID) —
  // они выходят первыми и бегут к стене мимо армии игрока. Сверх размера
  // натиска и потолка отряда (общий потолок поля — enemyAliveRoom — действует).
  const R = A.raiders;
  if (R && !ai.raidSent) {
    ai.raidSent = true;
    for (let i = 0; i < R.raiders; i++) out.push({ typeId: 'infantry', raid: R, delay: Math.max(0, out.length ? out[out.length - 1].delay + R.gap : 0) });
  }
  if (n <= 0) return;
  let ranged = 0;
  for (let i = 0; i < n; i++) {
    let id = pool[Math.floor(Math.random() * pool.length)];
    // r15 И17: натиск против спама ведут контры (trackPlayerMix)
    if (ai.counter && Math.random() < SPAM_WATCH.assaultP * counterK(ai)) id = ai.counter.pick;
    if (UNIT_TYPES[id].role === 'ranged' && ranged >= (A.maxRanged || 1)) id = 'infantry';
    if (UNIT_TYPES[id].role === 'ranged') ranged++;
    out.push({ typeId: id, delay: Math.max(0, out.length ? out[out.length - 1].delay + (A.gap || wave.gap) : 0) });
  }
  ai.assaults = (ai.assaults || 0) + 1;
}
function updateEnemyAssault(world, ai, mission, wave, dt) {
  const A = wave.assault;
  if (!A || (A.count && (ai.assaults || 0) >= A.count)) return; // A.count — натисков за бой, дальше игрок дожимает
  if (ai.assaultClock === undefined) ai.assaultClock = A.first;
  ai.assaultClock -= dt;
  if (!ai.assaultWarned && ai.assaultClock <= (A.warn || 0)) {
    ai.assaultWarned = true;
    world.onAssault && world.onAssault();
  }
  if (ai.assaultClock > 0) return;
  ai.assaultClock = A.every;
  ai.assaultWarned = false;
  launchEnemyAssault(world, ai, mission, wave, A);
  // обычный отряд не выходит вплотную за натиском — пауза до следующего
  if (wave.every && ai.waveClock !== undefined) ai.waveClock = Math.max(ai.waveClock, A.pause || 0);
}
function updateEnemyWave(world, ai, wave, dt, mission) {
  // r15 И15: налёт м1 гарантирован по часам боя (R.atSec), даже если натиск
  // ещё не вышел (быстрый игрок сносил крепость врага до первого натиска).
  const R = wave.assault && wave.assault.raiders;
  // r15 И19 (куратор №7: «первый удар налёта на 58–60-й с, у быстрого — ни
  // одного»): срок — по часам БОЯ (world.clock), а не врага: в мягком старте
  // часы врага идут медленнее. atSec — [от, до], секунда выбирается на бой.
  if (R && R.atSec && ai.raidAt === undefined) ai.raidAt = Array.isArray(R.atSec) ? R.atSec[0] + Math.random() * (R.atSec[1] - R.atSec[0]) : R.atSec;
  if (R && R.atSec && !ai.raidSent && (world.clock || ai.elapsed || 0) >= ai.raidAt) {
    ai.raidSent = true;
    const out = ai.waveOut || (ai.waveOut = []);
    const raid = [];
    for (let i = 0; i < R.raiders; i++) raid.push({ typeId: 'infantry', raid: R, delay: i * R.gap });
    out.unshift(...raid);
    world.onAssault && world.onAssault();
  }
  if (mission) updateEnemyAssault(world, ai, mission, wave, dt);
  const q = ai.waveQ || (ai.waveQ = []);
  if (wave.every) {
    if (ai.waveClock === undefined) ai.waveClock = wave.firstAt || 0;
    ai.waveClock -= dt;
  }
  if (q.length) ai.waveWait = (ai.waveWait || 0) + dt;
  if (q.length) {
    if (waveReady(world, ai, wave, q)) {
      if (wave.every) ai.waveClock = wave.every[0] + Math.random() * (wave.every[1] - wave.every[0]);
      const out = ai.waveOut || (ai.waveOut = []);
      for (const typeId of q) out.push({ typeId, delay: Math.max(0, out.length ? out[out.length - 1].delay + wave.gap : 0) });
      q.length = 0;
      ai.waveWait = 0;
      ai.waveTarget = 0;
      if (ai.soft) ai.soft.waves++;
      ai.wavesOut = (ai.wavesOut || 0) + 1;
    }
  }
  if (ai.waveOut && ai.waveOut.length) {
    for (const o of ai.waveOut) o.delay -= dt;
    // r15 И15: общий потолок (enemyAliveRoom) — боец ждёт места, а не пропадает
    while (ai.waveOut.length && ai.waveOut[0].delay <= 0 && enemyAliveRoom(world) > 0) {
      const o = ai.waveOut.shift();
      const u = spawnUnit(world, 'enemy', o.typeId);
      if (u && o.raid) makeRaider(world, u, o.raid); // r15 И15: «налётчик» м1
    }
  }
}

// Раунд 15 (П6): враг взрослеет сам — по своему опыту (как игрок, но порог
// выше на AGE_UP.enemyXpMult) или по таймеру AGE_UP.enemyTimerSec, что
// наступит раньше. Таймер держит баланс: если игрок задавил и враг почти
// не убивает, эпоха врага всё равно не отстанет навсегда. Опыт при смене
// тратится (как у игрока), лишнее переносится.
function updateEnemyAge(world, ai, mission) {
  if (!world.ageStep) return;
  const step = world.ageStep.enemy;
  if (step >= ageMaxSteps(mission)) return;
  // r15 И13 (куратор №4: «мушкетёры и кирпичный форт против пещерных
  // людей»): mission.enemyAgeMaxGap — эпохи сторон расходятся не больше чем
  // на столько ступеней. Враг не уходит вперёд дальше, а если игрок ушёл
  // вперёд на 2 ступени (две «Новые эры» до таймера врага), враг сразу
  // догоняет до разрыва 1 — по одной ступени, скачка через эпоху нет.
  const gap = mission.enemyAgeMaxGap;
  const behind = gap !== undefined && world.ageStep.player - step > gap;
  if (gap !== undefined && step - world.ageStep.player >= gap) return;
  if ((ai.soft || mission.enemyAgeNoLead) && step >= world.ageStep.player) return; // И8: мягкий старт (И11: и м1–м2) — не старше игрока
  const need = ageXpNeed(mission, step, 'enemy');
  const byXp = mission.chapterId >= AGE_UP.enemyXpFromChapter && (world.xp.enemy || 0) >= need;
  const byTimer = ai.elapsed >= AGE_UP.enemyTimerSec[Math.min(step, AGE_UP.enemyTimerSec.length - 1)] * (mission.enemyAgeTimerMult || 1);
  if (!byXp && !byTimer && !behind) return;
  world.xp.enemy = Math.max(0, (world.xp.enemy || 0) - need);
  world.ageStep.enemy = step + 1;
  world.teamAge.enemy = ageIdAt(mission, step + 1);
  world.onAgeUp && world.onAgeUp('enemy', world.teamAge.enemy);
}

function aiIncomeRate(ai, mission) {
  return mission.enemyIncome * Math.pow(1 + ECONOMY.upgrade.incomePctGain, ai.incomeLevel) * (ai.help ? ai.help.incomeMult : 1);
}
function aiUpgradeCost(ai) {
  return Math.round(ECONOMY.upgrade.baseCost * Math.pow(ECONOMY.upgrade.growth, ai.incomeLevel));
}

function updateEnemyAI(world, ai, mission, dt, playerGold) {
  // ИИ тоже вкладывается в апгрейд дохода — иначе его экономика навсегда
  // остаётся плоской и полностью проигрывает растущему доходу игрока
  // (баланс, найденный живым плейтестом ботом — см. ПЛАН.md, фаза 4).
  ai.elapsed = (ai.elapsed || 0) + dt;
  updateEnemyAge(world, ai, mission);
  ai.incomeAcc += dt;
  const rate = aiIncomeRate(ai, mission);
  while (ai.incomeAcc >= ECONOMY.incomeTickSec) {
    ai.incomeAcc -= ECONOMY.incomeTickSec;
    ai.gold += rate;
  }

  // Раунд 15: в миссии 1 (обучение) враг начинает качать доход не сразу —
  // mission.enemyUpgradeDelay (data.js), иначе новичок без апгрейдов
  // проигрывал ей примерно в каждом третьем бою (бот, ПЛАН.md раунд 15).
  if (ai.elapsed >= (mission.enemyUpgradeDelay || 0)) ai.upgradeAcc += dt;
  if (ai.upgradeAcc >= ai.nextUpgradeIn) {
    ai.upgradeAcc = 0;
    ai.nextUpgradeIn = 4 + Math.random() * 3;
    const cost = aiUpgradeCost(ai);
    // r15 И15: у врага тот же потолок апгрейдов дохода, что у игрока
    // (incomeUpgradeCap, data.js). При потолке живых врагов золото копилось и
    // уходило в доход: 7 → 25–30/с к 3-й минуте, поле мгновенно пополнялось.
    const maxed = ai.incomeLevel >= incomeUpgradeCap(mission);
    if (!maxed && ai.gold >= cost && Math.random() < 0.55) {
      ai.gold -= cost;
      ai.incomeLevel += 1;
    }
  }

  const leash = enemyLeashCfg(ai, mission);
  if (leash && !ai.soft) trackEnemyLeash(world, ai); // в мягком старте учёт — в updateSoftStart
  ai.overtime = !!world.overtime; // r15 И17: game.js updateI15
  if (mission.id >= SPAM_WATCH.fromMission) trackPlayerMix(world, ai, mission); // r15 И17: ответ на спам
  updateGateGuard(world, ai, mission, dt); // r15 И17: огонь со стен (м2+)
  updateRaidI17(world, ai, mission, dt); // r15 И17: налёт на крепость игрока (м2+)
  updateStallAssault(world, ai, dt); // r15 И19: штурм против пата (game.js updateI15)
  const wave = enemyWaveCfg(ai, mission);
  ai.buyAcc += dt;
  if (ai.buyAcc >= ai.nextBuyIn) {
    ai.buyAcc = 0;
    ai.nextBuyIn = 1.1 + Math.random() * 1.2;
    // Раунд 15: цена — в текущей эпохе врага (ageUnitCost), как у игрока.
    const step = teamAgeStep(world, 'enemy');
    const recCost = world.enemyRecruit ? world.enemyRecruit.cost : 1; // r15 И13: «новобранцы» дешевле
    const costOf = id => Math.round(ageUnitCost(id, step) * recCost);
    // И8/И9: враг покупает только юниты, открытые игроку в этой миссии
    // (тяжёлый — с м3, как у игрока); с м3 открыты все — поздние миссии
    // не меняются.
    // И11: м1 — первые волны только дубинщики (wave.clubsUntil, часы врага).
    const pool = (wave && wave.clubsUntil && ai.elapsed < wave.clubsUntil) ? ['infantry']
      : UNIT_ORDER.filter(id => UNIT_TYPES[id].unlockMission <= mission.id);
    const cheapest = Math.min(...pool.map(costOf));
    // И11: в отряде не больше wave.maxRanged стрелков (м1–м3) — пачка из 3–4
    // лучников за спинами расстреливала одиночных бойцов новичка на подходе.
    // maxRangedAlive — и на поле живых стрелков врага (с очередью) не больше N:
    // уцелевшие лучники копились у крепости игрока (куратор: 5–7 в ряд).
    const isRanged = id => UNIT_TYPES[id].role === 'ranged';
    const rangedCapped = () => {
      if (!wave || !ai.waveQ) return false;
      const inQ = ai.waveQ.filter(isRanged).length;
      if (wave.maxRanged !== undefined && inQ >= wave.maxRanged) return true;
      if (wave.maxRangedAlive === undefined) return false;
      const alive = world.units.filter(u => u.team === 'enemy' && u.state !== 'dead' && isRanged(u.typeId)).length;
      return alive + inQ >= wave.maxRangedAlive;
    };
    // r15 И13: потолок армии врага на поле (wave.maxAlive): живые + отряд в
    // сборе + на выходе. Давление есть, а снежного кома (13–17 врагов при
    // медленном игроке) — нет: враг «полон» и ждёт, пока его бойцы падут.
    // (mission.enemyMaxAlive — тот же потолок без отрядов, м4.)
    const aliveCap = (wave && wave.maxAlive) || mission.enemyMaxAlive || 0;
    const aliveNow = aliveCap ? world.units.filter(u => u.team === 'enemy' && u.state !== 'dead' && !u.elite).length + (ai.waveOut ? ai.waveOut.length : 0) : 0;
    // r15 И15: и общий потолок поля (все живые враги + отряд в сборе и на
    // выходе) — золото не тратится, пока места нет.
    const globalRoom = enemyAliveRoom(world) - (ai.waveOut ? ai.waveOut.length : 0);
    const buyOne = (reserve) => {
      if (aliveCap && aliveNow + (ai.waveQ ? ai.waveQ.length : 0) >= aliveCap) return null;
      if (globalRoom - (ai.waveQ ? ai.waveQ.length : 0) <= 0) return null;
      const noRanged = rangedCapped();
      const affordable = pool.filter(id => costOf(id) + reserve <= ai.gold && enemyLeashAllows(ai, mission, costOf(id) + reserve) && !(noRanged && UNIT_TYPES[id].role === 'ranged'));
      if (!affordable.length) return null;
      // в основном тратит с умом (дорогой доступный юнит), изредка — вразнобой
      const byCostDesc = [...affordable].sort((a, b) => costOf(b) - costOf(a));
      let pick = Math.random() < 0.7 ? byCostDesc[0] : affordable[Math.floor(Math.random() * affordable.length)];
      // r15 И17: ответ на спам игрока — контр (trackPlayerMix)
      if (ai.counter && affordable.includes(ai.counter.pick) && Math.random() < SPAM_WATCH.pickP * counterK(ai)) pick = ai.counter.pick;
      ai.gold -= costOf(pick);
      if (ai.leash) ai.leash.enemySpent += costOf(pick);
      return pick;
    };
    if (wave) {
      // И9: набор отряда — за тик покупает, сколько позволяют золото и
      // поводок, оставляя запас на самых дешёвых бойцов до размера отряда
      // (отряд собирается целиком за один тик). Первый отряд — wave.first (или size[0])
      // бойцов, дальше — случайно size[0]…size[1]. Если бойцы игрока уже у
      // крепости — покупает без запаса: оборона важнее полного отряда.
      const q = ai.waveQ || (ai.waveQ = []);
      if (!ai.waveTarget) {
        // r15 И13: wave.ramp — размеры первых отрядов (разгон 3 → 4 → 5),
        // дальше — случайно size[0]…size[1].
        if (wave.ramp && (ai.wavesOut || 0) < wave.ramp.length) ai.waveTarget = wave.ramp[ai.wavesOut || 0];
        else if (ai.wavesOut || !wave.firstMax) ai.waveTarget = wave.size[0] + Math.floor(Math.random() * (wave.size[1] - wave.size[0] + 1));
        // Первый отряд — сколько позволяют золото и поводок (от size[0] до
        // firstMax): у медленного новичка — 3, у активного игрока — 4–5,
        // чтобы встреча в поле была боем, а не стычкой с одиночкой.
        else ai.waveTarget = Math.max(wave.size[0], Math.min(wave.firstMax, Math.floor(Math.min(ai.gold, enemyLeashRoom(ai, mission)) / cheapest)));
      }
      const threat = enemyFortThreat(world, wave);
      let guard = 6;
      while (q.length < ai.waveTarget && guard-- > 0) {
        const pick = buyOne(threat ? 0 : cheapest * Math.max(0, ai.waveTarget - q.length - 1));
        if (!pick) break;
        q.push(pick);
      }
    } else {
      const pick = buyOne(0);
      if (pick) spawnUnit(world, 'enemy', pick);
    }
  }
  if (wave) updateEnemyWave(world, ai, wave, dt, mission);

  ai.eliteAcc += dt;
  // И9: первый элитный («босс» с красной кромкой) — не раньше
  // enemyEliteFirst с боя (м3 — позже обычного периода), дальше — по периоду.
  // r15 И13 (куратор №4: «м3 → м4 скачок, An elite squad turned the tide»):
  // mission.eliteMaxAlive — сколько элит врага может быть на поле разом
  // (м3 — 1, м4 — 2); пока лимит занят, следующий ждёт.
  const eliteRoom = !mission.eliteMaxAlive || world.units.filter(u => u.team === 'enemy' && u.elite && u.state !== 'dead').length < mission.eliteMaxAlive;
  // r15 И15: mission.eliteLeashed (м3) — элита тоже «на поводке»: выходит,
  // только когда игрок вложил в армию достаточно (цена элиты ×2 списывается с
  // поводка). Иначе к 70-й с редко покупающий игрок (9 бойцов) встречал
  // «босса» почти без армии и проигрывал к 100-й с.
  const elitePick = ai.elitePick || (ai.elitePick = UNIT_ORDER[Math.floor(Math.random() * UNIT_ORDER.length)]);
  const eliteLeashCost = mission.eliteLeashed ? UNIT_TYPES[elitePick].cost * 2 : 0;
  const eliteLeashOk = !eliteLeashCost || enemyLeashAllows(ai, mission, eliteLeashCost);
  if (eliteRoom && eliteLeashOk && enemyAliveRoom(world) > 0 && ai.eliteAcc >=(ai.elitesSent ? mission.enemyEliteEvery : (mission.enemyEliteFirst || mission.enemyEliteEvery))) {
    ai.elitesSent = (ai.elitesSent || 0) + 1;
    ai.eliteAcc = 0;
    const pick = elitePick;
    ai.elitePick = null;
    if (eliteLeashCost && ai.leash) ai.leash.enemySpent += eliteLeashCost;
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
  // И9: период — mission.enemySpecialEvery (м4 — реже, первая миссия с
  // «рабом»), по умолчанию 9 с, как раньше.
  if (ai.specialAcc >= (mission.enemySpecialEvery || 9)) {
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
    if (tr.timer <= 0 && enemyAliveRoom(world) > 0) { // r15 И15: при полном поле — ждёт места
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
  if (mission.adaptiveFromSec && ai.elapsed < mission.adaptiveFromSec) return; // И9: м4 — не с первых секунд

  ai.adaptiveGlobalCooldown = Math.max(0, ai.adaptiveGlobalCooldown - dt);
  if (ai.adaptiveGlobalCooldown > 0) return;

  const diff = aliveUnitsOf(world, 'player').length - aliveUnitsOf(world, 'enemy').length;
  // От старшего порога к младшему — первый совпавший И свободный по
  // своему кулдауну и есть "самый высокий из подходящих".
  for (let i = ADAPTIVE_AI.reactions.length - 1; i >= 0; i--) {
    const reaction = ADAPTIVE_AI.reactions[i];
    if (diff < reaction.diff) continue;
    // r15 И13: м4 — только малые реакции (+1 лучник, +2 бойца): «+5 лучников»
    // и «+10 бойцов» бесплатно давали толпу до 22 врагов (куратор №4).
    if (mission.adaptiveMaxDiff && reaction.diff > mission.adaptiveMaxDiff) continue;
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
  // И8: мягкий старт миссии 1 — ответ крепости слабее (копейщик вместо
  // гиганта, 1 лучник вместо 2, 2 бойца вместо 5, без башен): медленный
  // новичок иначе терял всю армию на первом же пороге, а башни у крепости
  // не давали его бойцам по одному дойти до ядра.
  const soft = !!(match.ai && match.ai.soft);
  if (soft && (kind === 'tower1' || kind === 'tower2')) return;
  world.onDanger && world.onDanger('buff');
  switch (kind) {
    case 'giant':
      if (soft) spawnUnit(world, 'enemy', 'spear');
      // И9 (куратор: «босс не раньше миссии 3–4»): до mission.enemyBoss
      // «гигант» — обычный тяжёлый, без элитного контура и множителя HP.
      else if (match.mission.enemyBoss === false) spawnUnit(world, 'enemy', 'heavy');
      else spawnEliteUnit(world, 'enemy', 'heavy', match.mission.eliteHpMult * 1.3);
      break;
    case 'archers2':
      spawnUnit(world, 'enemy', 'archer');
      if (!soft) spawnUnit(world, 'enemy', 'archer');
      break;
    case 'swarm5':
      for (let i = 0; i < (soft ? 2 : (match.mission.buffSwarm || 5)); i++) spawnUnit(world, 'enemy', 'infantry'); // И11: м1–м2 — 3, м3 — 4
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
        // И11: глава 1 — башни ответа слабее (mission.buffTowerDmgMult):
        // одиночные бойцы новичка у 2 башен гибли, не дойдя до ядра (пат).
        x: castleOuterEdge - 100 - idx * 45, dmg: SHOP.towerA.dmg * (match.mission.buffTowerDmgMult || 1),
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
