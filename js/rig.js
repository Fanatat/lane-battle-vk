// Процедурный риг стикмена: вся "графика" юнитов/героя — линии и дуги,
// нарисованные по параметрам позы. Осознанное решение по ассетам —
// см. КОНЦЕПТ_ГДД.md, раздел «Допущения».
'use strict';

const RIG = {
  head: 6,
  neck: 3,
  torso: 15,
  legLen: 15,
  armLen: 12,
  lineWidth: 3,
};

// weapon: рисуется как дополнительный штрих в руке персонажа, зависит от
// эпохи (см. AGES[...].weapon) и роли юнита. tint (раунд 8) — цвет тира
// прокачки героя красит именно этот общий штрих клинка/древка (см.
// КОНЦЕПТ_ГДД.md, «Допущения» — почему именно так, не силуэт целиком).
function drawWeapon(ctx, kind, handX, handY, facing, swingT, restWobble = 0, tint = null) {
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(facing < 0 ? Math.PI : 0);
  // В бою — свинг по фазе удара; вне боя — лёгкое покачивание с шагом,
  // а не жёстко зафиксированный угол (иначе оружие «живёт отдельно» от
  // руки на ходу — находка соседней студии, см. ПЛАН.md).
  const swing = swingT === null ? restWobble : (swingT - 0.5) * 1.6; // -0.8..0.8 rad
  ctx.rotate(swing);
  ctx.lineCap = 'round';
  ctx.strokeStyle = tint || '#d8d2c2';
  ctx.lineWidth = 2.4;
  switch (kind) {
    case 'club':
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, -4); ctx.stroke();
      ctx.fillStyle = '#8a7a63';
      ctx.beginPath(); ctx.arc(14, -4, 3.4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'stone_hammer':
      // тяжёлая двуручная кувалда — толще древко, большая гранёная голова
      ctx.lineWidth = 3.6;
      ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(13, -9); ctx.stroke();
      ctx.fillStyle = '#7d7466';
      ctx.beginPath();
      ctx.moveTo(13, -9); ctx.lineTo(20, -14); ctx.lineTo(21, -6); ctx.lineTo(13, -2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case 'stick_spear':
    case 'bronze_spear':
      ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(22, -6); ctx.stroke();
      ctx.fillStyle = '#c9c2ae';
      ctx.beginPath(); ctx.moveTo(22, -6); ctx.lineTo(17, -9); ctx.lineTo(19, -3); ctx.closePath(); ctx.fill();
      break;
    case 'sword':
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(17, -8); ctx.stroke();
      ctx.strokeStyle = '#b8ae90'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(3, -1); ctx.lineTo(6, 6); ctx.stroke();
      break;
    case 'axe':
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(15, -8); ctx.stroke();
      ctx.fillStyle = '#c9c2ae';
      ctx.beginPath(); ctx.moveTo(15, -8); ctx.lineTo(10, -13); ctx.lineTo(19, -12); ctx.closePath(); ctx.fill();
      break;
    case 'sling':
    case 'bow':
      ctx.strokeStyle = '#c9b48a';
      ctx.beginPath(); ctx.arc(6, 0, 9, -1.1, 1.1); ctx.stroke();
      break;
    case 'bayonet':
      // короткая винтовка со штыком — компактный силуэт ближнего боя
      ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(12, -3); ctx.stroke();
      ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(12, -3); ctx.lineTo(17, -5); ctx.stroke();
      break;
    case 'pike':
      // длинная пика без приклада — самый длинный силуэт роли "копейщик"
      ctx.beginPath(); ctx.moveTo(-10, 4); ctx.lineTo(26, -8); ctx.stroke();
      ctx.fillStyle = '#c9c2ae';
      ctx.beginPath(); ctx.moveTo(26, -8); ctx.lineTo(22, -11); ctx.lineTo(23, -5); ctx.closePath(); ctx.fill();
      break;
    case 'rifle':
      // длинная винтовка с прицельной планкой — читается как "дальний бой"
      ctx.beginPath(); ctx.moveTo(-9, 4); ctx.lineTo(20, -4); ctx.stroke();
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath(); ctx.rect(6, -3, 3, 2); ctx.fill();
      break;
    case 'cannonarm':
      // короткий толстый ствол на плече — самый массивный силуэт роли "тяжёлый"
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#4a4d55';
      ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(15, -3); ctx.stroke();
      ctx.fillStyle = '#2c2e33';
      ctx.beginPath(); ctx.arc(15, -3, 3, 0, Math.PI * 2); ctx.fill();
      break;
    default:
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, -3); ctx.stroke();
  }
  ctx.restore();
}

// «Раб с цепью» (раунд 5, физика/высота поправлены в раунде 7 по
// баг-репорту — шар катился выше линии земли) — цепь и шар волочатся
// сзади, доп. штрих поверх обычного рига (не отдельный скелет, см.
// КОНЦЕПТ_ГДД.md, «Допущения»). lag — насколько шар отстаёт по инерции
// (больше на бегу), taut — рывок натяжения цепи на ударе (0..1).
function drawChainBall(ctx, facing, lag = 6, taut = 0) {
  const BALL_R = 5;
  const anchorX = -facing * 5, anchorY = -9; // у бедра, сзади по ходу
  const ballX = anchorX - facing * (8 + lag);
  const ballY = -BALL_R; // низ шара касается y=0 — линии земли
  ctx.save();
  ctx.strokeStyle = '#555a5f'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  const segs = 5;
  ctx.beginPath(); ctx.moveTo(anchorX, anchorY);
  for (let i = 1; i <= segs; i++) {
    const tt = i / segs;
    const sag = Math.sin(tt * Math.PI) * (4.5 - taut * 3.5); // натянутая цепь почти прямая
    ctx.lineTo(anchorX + (ballX - anchorX) * tt, anchorY + (ballY - anchorY) * tt + sag);
  }
  ctx.stroke();
  ctx.fillStyle = '#3a3d40'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(120,124,128,.9)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ballX - 2, ballY - 1); ctx.lineTo(ballX + 2, ballY + 1.5); ctx.stroke();
  ctx.restore();
}

// Щит — проп в задней руке (раунд 8): используется и на герое (тир
// прокачки красит цвет — бронза/серебро/золото), и на вражеском
// Щитоносце (нейтральный серый, без тира).
function drawShieldProp(ctx, x, y, facing, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color; ctx.strokeStyle = '#221a10'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(-facing * 2, 0, 4.5, 7.5, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-facing * 2, -5); ctx.lineTo(-facing * 2, 5); ctx.stroke();
  ctx.restore();
}
// Броня — нагрудная пластина поверх торса (раунд 8, визуал прокачки).
function drawArmorPlate(ctx, hipY, shoulderY, color) {
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = color; ctx.strokeStyle = '#221a10'; ctx.lineWidth = 1.4;
  const top = shoulderY + 2, bottom = hipY - 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-4.5, top, 9, bottom - top, 2); else ctx.rect(-4.5, top, 9, bottom - top);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// Красный плащ героя (утро, покупка магазина) — асимметричный силуэт за
// спиной, читаемый признак направления даже без черт лица на стикмене.
// Висит в сторону, противоположную facing; лёгкое развевание от walkPhase
// (сильнее на бегу), кратковременный "порыв ветра" cloakFlareT — при
// развороте (см. entities.js, updateHero) распахивается заметно шире на
// ~0.35с, а не просто плавно перетекает в зеркальное положение.
function drawCloak(ctx, hipY, shoulderY, facing, walkPhase, moving, cloakFlareT) {
  const back = -facing;
  const sway = Math.sin(walkPhase * (moving ? 1 : 0.35)) * (moving ? 5 : 1.5);
  const flare = cloakFlareT > 0 ? Math.sin(cloakFlareT * Math.PI) * 12 : 0;
  const attachY = shoulderY + 3;
  const midY = (shoulderY + hipY) / 2;
  const midX = back * (9 + sway + flare);
  const botX = back * (6 + sway * 1.4 + flare * 1.3);
  const botY = hipY + 4;
  ctx.save();
  ctx.fillStyle = '#c62828';
  ctx.strokeStyle = '#5a0f0f';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-back * 1.2, attachY);
  ctx.quadraticCurveTo(midX, midY, botX, botY);
  ctx.lineTo(back * 1.2, hipY - 1);
  ctx.quadraticCurveTo(midX * 0.65, midY, -back * 1.2, attachY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Рисует стикмена. Все координаты pose — в мировых пикселях, x/y = точка
 * стопы на земле (контакт с ground line).
 */
function drawStickman(ctx, o) {
  const {
    x, y, scale = 1, color = '#e9e3d6', outline = '#221a10', facing = 1,
    walkPhase = 0, moving = false, attackPhase = null, deathT = null, hitFlash = 0,
    weapon = null, hero = false, roleAccent = null,
    bent = false, cheer = false, chainBall = false, chainLag = 6, chainTaut = 0,
    digPhase = null,
    // Раунд 8 — визуал прокачки героя (0 = нет уровня) и щит-проп юнита:
    gearSwordTier = 0, gearShieldTier = 0, gearArmorTier = 0, shieldColor = null,
    cloak = false, cloakFlareT = 0, // утро — плащ героя (косметика магазина)
  } = o;
  const s = scale;
  ctx.save();
  ctx.translate(x, y);
  if (deathT !== null) {
    ctx.translate(0, -1);
    ctx.rotate(facing * deathT * (Math.PI / 2));
    ctx.globalAlpha = 1 - deathT * 0.55;
  }
  // «Прыгает и радуется» на экране победы (раунд 5) — подскок всей фигурой.
  const cheerBounce = (cheer && deathT === null) ? Math.abs(Math.sin(walkPhase)) * 7 : 0;
  if (cheerBounce) ctx.translate(0, -cheerBounce);
  ctx.scale(s, s);
  // «Раб» идёт согнутым, уставшим (см. ПЛАН.md, раунд 5) — лёгкий наклон
  // корпуса вперёд по ходу движения, а не отдельная поза скелета.
  if (bent && deathT === null) ctx.rotate(facing * 0.16);

  // Ноги идут по факту движения, а не по тому, бьёт ли рука прямо сейчас —
  // иначе герой замирает в стойке на полушаге, если ударил на ходу
  // (найдено живым тестом соседней студии на их же риге, см. ПЛАН.md).
  const legsMoving = moving && deathT === null;
  const legSwing = legsMoving ? Math.sin(walkPhase) * 9 : 0;
  const legSwing2 = legsMoving ? Math.sin(walkPhase + Math.PI) * 9 : 0;
  const bob = legsMoving ? Math.abs(Math.cos(walkPhase)) * 2 : 0;

  const hipY = -RIG.legLen - bob;
  const shoulderY = hipY - RIG.torso;
  const headY = shoulderY - RIG.neck - RIG.head;

  ctx.strokeStyle = outline;
  ctx.lineWidth = RIG.lineWidth + 1.6;
  ctx.lineCap = 'round';

  function limbPair(originX, originY, len, swingBack, swingFront, backFoot, frontFoot) {
    ctx.beginPath();
    ctx.moveTo(originX, originY); ctx.lineTo(backFoot.x, backFoot.y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(originX, originY); ctx.lineTo(frontFoot.x, frontFoot.y); ctx.stroke();
  }

  // back leg first (drawn behind), then front leg — draws outline then fill pass
  const legBack = { x: facing * legSwing2 * 0.6, y: 0 };
  const legFront = { x: facing * legSwing * 0.6, y: 0 };

  // Рука (атака) и ноги (ходьба) — независимые источники позы: юнит может
  // одновременно идти и бить (герой на ходу), одно не должно гасить другое.
  let armBack, armFront, attackHand = null;
  if (deathT !== null) {
    armBack = { x: -facing * 8, y: shoulderY + 6 };
    armFront = { x: facing * 8, y: shoulderY + 6 };
  } else {
    armBack = legsMoving
      ? { x: -facing * 3 + Math.sin(walkPhase) * 7 * 0.3, y: shoulderY + RIG.armLen }
      : { x: -facing * 3, y: shoulderY + RIG.armLen * 0.8 };
    if (attackPhase !== null) {
      const swing = Math.sin(attackPhase * Math.PI);
      const ax = facing * (RIG.armLen * 0.4 + swing * RIG.armLen * 0.9);
      const ay = shoulderY - RIG.armLen * 0.5 + swing * RIG.armLen * 0.5;
      attackHand = { x: ax, y: ay };
      armFront = attackHand;
    } else if (legsMoving) {
      armFront = { x: facing * 3 + Math.sin(walkPhase + Math.PI) * 7 * 0.3, y: shoulderY + RIG.armLen };
    } else {
      armFront = { x: facing * 3, y: shoulderY + RIG.armLen };
    }
  }
  if (cheer && deathT === null) {
    const wave = Math.sin(walkPhase * 2) * 3;
    armBack = { x: -facing * 9 + wave, y: shoulderY - RIG.armLen * 0.7 };
    armFront = { x: facing * 9 - wave, y: shoulderY - RIG.armLen * 0.7 };
  }
  // Копание (раунд 7, баг-репорт) — своя поза, не переиспользует боковой
  // мах атаки: замах над головой (первая половина фазы), удар вниз к
  // земле перед ногами (вторая половина).
  let digHand = null;
  if (digPhase !== null && deathT === null) {
    let dax, day;
    if (digPhase < 0.5) {
      const p = digPhase / 0.5;
      dax = facing * RIG.armLen * 0.3;
      day = shoulderY - p * RIG.armLen * 1.15;
    } else {
      const p = (digPhase - 0.5) / 0.5;
      dax = facing * (RIG.armLen * 0.3 + p * RIG.armLen * 0.9);
      day = (shoulderY - RIG.armLen * 1.15) + p * (RIG.armLen * 1.15 + RIG.legLen * 0.95);
    }
    digHand = { x: dax, y: day };
    armFront = digHand;
  }

  // Плащ — рисуется первым (позади торса/рук), висит НАЗАД (противоположно
  // facing = взгляду/движению), поэтому сам факт направления читается по
  // силуэту даже на симметричной "болванке" стикмена без черт лица.
  if (cloak && deathT === null) drawCloak(ctx, hipY, shoulderY, facing, walkPhase, moving, cloakFlareT);

  // legs
  for (const pass of [0, 1]) {
    ctx.lineWidth = pass === 0 ? RIG.lineWidth + 1.6 : RIG.lineWidth;
    ctx.strokeStyle = pass === 0 ? outline : color;
    ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(legBack.x, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(legFront.x, 0); ctx.stroke();
    // torso
    ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(0, shoulderY); ctx.stroke();
    // back arm
    ctx.beginPath(); ctx.moveTo(0, shoulderY); ctx.lineTo(armBack.x, armBack.y); ctx.stroke();
    // front arm
    ctx.beginPath(); ctx.moveTo(0, shoulderY); ctx.lineTo(armFront.x, armFront.y); ctx.stroke();
  }

  // Перевязь по роли — второй, независимый от оружия сигнал, чтобы роль
  // читалась и на маленьком масштабе, где линия оружия едва различима
  // (см. ПЛАН.md, раунд 3: юниты визуально слились друг с другом).
  if (roleAccent && deathT === null) {
    ctx.strokeStyle = roleAccent;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4, shoulderY + 2);
    ctx.lineTo(4, hipY - 2);
    ctx.stroke();
  }

  // head
  ctx.fillStyle = hitFlash > 0 ? `rgba(255,255,255,${hitFlash})` : color;
  ctx.strokeStyle = outline;
  ctx.lineWidth = RIG.lineWidth - 1;
  ctx.beginPath(); ctx.arc(0, headY, RIG.head, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (hero) {
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.moveTo(-RIG.head * 0.8, headY - RIG.head * 0.6);
    ctx.lineTo(RIG.head * 0.8, headY - RIG.head * 0.6);
    ctx.lineTo(0, headY - RIG.head * 1.7);
    ctx.closePath(); ctx.fill();
  }

  if (hitFlash > 0 && !hero) {
    ctx.save();
    ctx.globalAlpha = hitFlash;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, headY, RIG.head, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Визуал прокачки героя (раунд 8) — броня и щит рисуются как надетые
  // пропы, до оружия (оружие в руке должно перекрывать щит на замахе, а
  // не наоборот); цвет берётся по тиру (см. GEAR_TIER_COLORS в data.js).
  if (deathT === null) {
    if (hero && gearArmorTier > 0) drawArmorPlate(ctx, hipY, shoulderY, GEAR_TIER_COLORS[gearArmorTier - 1]);
    if (hero && gearShieldTier > 0) drawShieldProp(ctx, armBack.x, armBack.y, facing, GEAR_TIER_COLORS[gearShieldTier - 1]);
    else if (shieldColor) drawShieldProp(ctx, armBack.x, armBack.y, facing, shieldColor);
  }

  if (weapon) {
    const handPos = digHand || attackHand || armFront;
    const restWobble = legsMoving && attackPhase === null && !digHand ? Math.sin(walkPhase) * 0.15 : 0;
    const tint = hero && gearSwordTier > 0 ? GEAR_TIER_COLORS[gearSwordTier - 1] : null;
    drawWeapon(ctx, weapon, handPos.x, handPos.y, facing, digHand ? null : attackPhase, restWobble, tint);
  }
  if (chainBall && deathT === null) drawChainBall(ctx, facing, chainLag, chainTaut);

  ctx.restore();
}

// «Наездник» (раунд 5) — составной риг: нижний несёт (обычная поза
// ходьбы, бьёт лоу-киком), верхний сидит сверху и стреляет камнями
// (переиспользует drawWeapon('sling'), не новый скелет — см.
// КОНЦЕПТ_ГДД.md, «Допущения»).
function drawRiderPair(ctx, o) {
  const {
    x, y, scale = 1, facing = 1, walkPhase = 0, moving = false,
    attackPhase = null, deathT = null, hitFlash = 0, roleAccent = null,
  } = o;
  drawStickman(ctx, {
    x, y, scale, facing, walkPhase, moving, deathT, hitFlash,
    color: '#c9d3dd', outline: '#221a10', roleAccent,
  });
  if (deathT !== null) return; // при смерти верхний наездник не отрисовывается отдельно
  const topScale = scale * 0.8;
  const riderHeight = (RIG.legLen + RIG.torso * 0.55) * scale;
  drawStickman(ctx, {
    x, y: y - riderHeight, scale: topScale, facing, walkPhase: 0, moving: false,
    attackPhase, hitFlash,
    color: '#e9dcc0', outline: '#221a10', weapon: 'sling',
  });
}
