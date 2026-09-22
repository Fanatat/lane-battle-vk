// Процедурный риг стикмена: вся "графика" юнитов/героя — линии и дуги,
// нарисованные по параметрам позы. Осознанное решение по ассетам —
// см. КОНЦЕПТ_ГДД.md, раздел «Допущения».
//
// Раунд 14 (визуал «под обложку», ТЗ_ВИЗУАЛ_ПОД_ОБЛОЖКУ.md): фигуры
// в ART.rigScale раз крупнее (внутренняя геометрия рига не менялась —
// множитель применяется одним ctx.scale, оружие/плащ/щит/цепь едут вместе),
// конечности двухсегментные (колено/локоть), атака в три фазы с корпусом и
// следом-дугой, враги — чёрные силуэты с тёплой кромкой, тень под ногами.
// Цвета — только из ART/GEAR_TIER_COLORS (data.js), литералов не плодить.
'use strict';

const RIG = {
  head: 6,
  neck: 3,
  torso: 15,
  legLen: 15,
  armLen: 12,
  lineWidth: 3.4,
};
const RIG_K = (typeof ART !== 'undefined' && ART.rigScale) || 1.5;
// Сегменты чуть длиннее половины прямой конечности — иначе колено/локоть
// никогда не сгибаются (сустав лежит ровно на прямой между концами).
const LEG_SEG = RIG.legLen * 0.56;
const ARM_SEG = RIG.armLen * 0.56;
const RANGED_WEAPONS = new Set(['bow', 'sling', 'rifle']);

function rigLerp(a, b, t) { return a + (b - a) * t; }
function rigEaseOut(t) { return 1 - Math.pow(1 - t, 3); }
function rigEaseInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function rigEaseOutBack(t) { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

// Сустав двухсегментной конечности: точка на серединном перпендикуляре
// отрезка «начало → конец», сдвинутая в сторону bendDir. Если конец дальше,
// чем два сегмента, конец подтягивается на предел досягаемости.
function limbPoints(ox, oy, tx, ty, seg, bendDir) {
  let dx = tx - ox, dy = ty - oy;
  let d = Math.hypot(dx, dy) || 0.001;
  if (d > seg * 2) { dx *= (seg * 2) / d; dy *= (seg * 2) / d; d = seg * 2; }
  const half = d / 2;
  const h = Math.sqrt(Math.max(0, seg * seg - half * half));
  const nx = -dy / d, ny = dx / d;
  return {
    joint: { x: ox + dx / 2 + nx * h * bendDir, y: oy + dy / 2 + ny * h * bendDir },
    end: { x: ox + dx, y: oy + dy },
  };
}

// Таймлайн удара ближнего боя. theta — угол руки от плеча (рад, для
// facing=1: 0 = вперёд, -PI/2 = вверх), rot — поворот оружия в руке,
// lean — наклон корпуса (+ вперёд), sweep — какая доля дуги следа уже
// пройдена, slashA — яркость следа, reach — вытянутость руки.
// Два профиля, потому что момент урона разный: юнит наносит урон в КОНЦЕ
// фазы (entities.js: attackTimer<=0 => p=1) — замах долгий, удар в самом
// конце; герой — мгновенно по нажатию (updateHero) — короткий рывок и
// сразу удар, иначе управление ощущалось бы «ватным».
const ATK_REST = 1.32, ATK_BACK = -1.9, ATK_FRONT = 0.35;
function attackTimeline(p, profile) {
  let theta, rot, lean, reach, sweep = 0, slashA = 0;
  if (profile === 'hero') {
    if (p < 0.08) {
      const t = p / 0.08;
      theta = rigLerp(ATK_REST, ATK_BACK * 0.8, t); rot = rigLerp(0, -1.5, t); lean = rigLerp(0, -0.1, t); reach = rigLerp(0.85, 1, t);
    } else if (p < 0.34) {
      const t = rigEaseOut((p - 0.08) / 0.26);
      theta = rigLerp(ATK_BACK * 0.8, ATK_FRONT, t); rot = rigLerp(-1.5, 1.15, t); lean = rigLerp(-0.1, 0.18, t); reach = 1;
      sweep = t; slashA = 0.95;
    } else if (p < 0.55) {
      const t = (p - 0.34) / 0.21;
      theta = ATK_FRONT; rot = 1.15; lean = rigLerp(0.18, 0.1, t); reach = 1; sweep = 1; slashA = 0.95 * (1 - t);
    } else {
      const t = rigEaseInOut((p - 0.55) / 0.45);
      theta = rigLerp(ATK_FRONT, ATK_REST, t); rot = rigLerp(1.15, 0, t); lean = rigLerp(0.1, 0, t); reach = rigLerp(1, 0.85, t);
    }
  } else {
    if (p < 0.15) {
      const t = rigEaseInOut(p / 0.15);
      theta = rigLerp(ATK_FRONT, ATK_REST, t); rot = rigLerp(1.15, 0, t); lean = rigLerp(0.18, 0, t); reach = rigLerp(1, 0.85, t);
    } else if (p < 0.7) {
      const t = rigEaseInOut((p - 0.15) / 0.55);
      theta = rigLerp(ATK_REST, ATK_BACK, t); rot = rigLerp(0, -1.6, t); lean = rigLerp(0, -0.12, t); reach = rigLerp(0.85, 1, t);
    } else if (p < 0.93) {
      const t = rigEaseOut((p - 0.7) / 0.23);
      theta = rigLerp(ATK_BACK, ATK_FRONT, t); rot = rigLerp(-1.6, 1.15, t); lean = rigLerp(-0.12, 0.18, t); reach = 1;
      sweep = t; slashA = 0.9;
    } else {
      const t = (p - 0.93) / 0.07;
      theta = ATK_FRONT; rot = 1.15; lean = 0.18; reach = 1; sweep = 1; slashA = 0.9 * (1 - t * 0.6);
    }
  }
  return { theta, rot, lean, reach, sweep, slashA };
}

// Дальний бой: draw — натяжение (0..1), flash — вспышка выстрела сразу
// после p=0 (снаряд уже вылетел в entities.js), whirl — угол раскрутки
// пращи. Урон/снаряд — в конце фазы, как у всех юнитов.
function rangedTimeline(p) {
  let draw, flash = 0;
  if (p < 0.15) { draw = 0; flash = 1 - p / 0.15; }
  else if (p < 0.85) draw = rigEaseInOut((p - 0.15) / 0.7);
  else draw = 1;
  const whirl = p < 0.15 ? 0 : (p - 0.15) / 0.85 * Math.PI * 3;
  return { draw, flash, whirl, lean: flash * -0.08 };
}

const WEAPON_PAL_LIGHT = { main: '#d8d2c2', accent: '#c9c2ae', dark: '#8a7a63', metal: '#9aa0a8', wood: '#c9b48a' };
const WEAPON_PAL_DARK = { main: '#1e1813', accent: '#3a2c20', dark: '#2a2018', metal: '#3a3a40', wood: '#3a2c20' };

// Основная ось оружия — для ореола (герой) рисуется отдельным широким
// полупрозрачным штрихом ПОД самим оружием, без shadowBlur.
function weaponShaft(kind) {
  switch (kind) {
    case 'club': return [0, 0, 14, -4];
    case 'stone_hammer': return [-4, 4, 13, -9];
    case 'stick_spear': case 'bronze_spear': return [-6, 2, 22, -6];
    case 'sword': return [0, 4, 17, -8];
    case 'axe': return [0, 2, 15, -8];
    case 'bayonet': return [-6, 3, 17, -5];
    case 'pike': return [-10, 4, 26, -8];
    case 'rifle': return [-9, 4, 20, -4];
    case 'cannonarm': return [0, 1, 15, -3];
    default: return [0, 0, 12, -3];
  }
}

// weapon: рисуется как дополнительный штрих в руке персонажа, зависит от
// эпохи (см. AGES[...].weapon) и роли юнита. rot — поворот в руке (рад,
// null = покой с лёгким покачиванием restWobble). tint — цвет тира
// прокачки героя (GEAR_TIER_COLORS) красит общий штрих клинка/древка (см.
// КОНЦЕПТ_ГДД.md, «Допущения»). opts: pal (палитра стороны), glow (цвет
// ореола — герой), flash (0..1, вспышка у дула/тетивы), draw (натяжение
// лука 0..1), pull {x,y} (точка тетивы относительно кисти), whirl (праща).
function drawWeapon(ctx, kind, handX, handY, facing, rot, restWobble = 0, tint = null, opts = {}) {
  const pal = opts.pal || WEAPON_PAL_LIGHT;
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(facing < 0 ? Math.PI : 0);
  ctx.rotate(rot === null || rot === undefined ? restWobble : rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (opts.glow && !RANGED_WEAPONS.has(kind)) {
    const [x0, y0, x1, y1] = weaponShaft(kind);
    ctx.save();
    ctx.strokeStyle = opts.glow;
    ctx.lineWidth = 6.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = tint || pal.main;
  ctx.lineWidth = 2.4;
  switch (kind) {
    case 'club':
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, -4); ctx.stroke();
      ctx.fillStyle = tint || pal.dark;
      ctx.beginPath(); ctx.arc(14, -4, 3.4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'stone_hammer':
      // тяжёлая двуручная кувалда — толще древко, большая гранёная голова
      ctx.lineWidth = 3.6;
      ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(13, -9); ctx.stroke();
      ctx.fillStyle = tint || pal.dark;
      ctx.beginPath();
      ctx.moveTo(13, -9); ctx.lineTo(20, -14); ctx.lineTo(21, -6); ctx.lineTo(13, -2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case 'stick_spear':
    case 'bronze_spear':
      ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(22, -6); ctx.stroke();
      ctx.fillStyle = tint || pal.accent;
      ctx.beginPath(); ctx.moveTo(22, -6); ctx.lineTo(17, -9); ctx.lineTo(19, -3); ctx.closePath(); ctx.fill();
      break;
    case 'sword':
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(17, -8); ctx.stroke();
      if (opts.glow) {
        // блик по кромке клинка — читается как «золотой меч» с обложки
        ctx.strokeStyle = opts.glowHi || pal.main; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(3, 1.2); ctx.lineTo(16, -8.2); ctx.stroke();
        ctx.strokeStyle = tint || pal.main;
      }
      ctx.strokeStyle = tint || pal.accent; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(3, -1); ctx.lineTo(6, 6); ctx.stroke();
      break;
    case 'axe':
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(15, -8); ctx.stroke();
      ctx.fillStyle = tint || pal.accent;
      ctx.beginPath(); ctx.moveTo(15, -8); ctx.lineTo(10, -13); ctx.lineTo(19, -12); ctx.closePath(); ctx.fill();
      break;
    case 'sling': {
      // Праща: ремень от кисти к «карману» с камнем; при раскрутке карман
      // идёт по кругу за кистью, в покое висит вниз.
      const w = opts.whirl || 0;
      const a = w > 0 ? w + Math.PI * 0.5 : Math.PI * 0.5; // в покое карман висит вниз
      const px = Math.cos(a) * 9, py = Math.sin(a) * 9;
      ctx.strokeStyle = pal.wood; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(px, py); ctx.stroke();
      ctx.fillStyle = tint || pal.accent;
      ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'bow': {
      // Лук в передней руке, тетива уходит к задней кисти (opts.pull —
      // относительно кисти, в СИСТЕМЕ ДО поворота — сюда приходит уже
      // повёрнутой на facing), стрела на тетиве при натяжении.
      const draw = opts.draw || 0;
      ctx.strokeStyle = pal.wood; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(2, 0, 10, -1.2, 1.2); ctx.stroke();
      const tipTopX = 2 + Math.cos(-1.2) * 10, tipTopY = Math.sin(-1.2) * 10;
      const tipBotX = 2 + Math.cos(1.2) * 10, tipBotY = Math.sin(1.2) * 10;
      const pull = opts.pull || { x: 0, y: 0 };
      ctx.strokeStyle = pal.main; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(tipTopX, tipTopY); ctx.lineTo(pull.x, pull.y); ctx.lineTo(tipBotX, tipBotY); ctx.stroke();
      if (draw > 0.05) {
        ctx.strokeStyle = tint || pal.main; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(pull.x, pull.y); ctx.lineTo(pull.x + 17, pull.y * 0.4); ctx.stroke();
        ctx.fillStyle = pal.accent;
        ctx.beginPath(); ctx.moveTo(pull.x + 17, pull.y * 0.4); ctx.lineTo(pull.x + 13, pull.y * 0.4 - 1.6); ctx.lineTo(pull.x + 13, pull.y * 0.4 + 1.6); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'bayonet':
      // короткая винтовка со штыком — компактный силуэт ближнего боя
      ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(12, -3); ctx.stroke();
      ctx.strokeStyle = tint || pal.metal; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(12, -3); ctx.lineTo(17, -5); ctx.stroke();
      break;
    case 'pike':
      // длинная пика без приклада — самый длинный силуэт роли "копейщик"
      ctx.beginPath(); ctx.moveTo(-10, 4); ctx.lineTo(26, -8); ctx.stroke();
      ctx.fillStyle = tint || pal.accent;
      ctx.beginPath(); ctx.moveTo(26, -8); ctx.lineTo(22, -11); ctx.lineTo(23, -5); ctx.closePath(); ctx.fill();
      break;
    case 'rifle': {
      // длинная винтовка с прицельной планкой — читается как "дальний бой"
      ctx.beginPath(); ctx.moveTo(-9, 4); ctx.lineTo(20, -4); ctx.stroke();
      ctx.fillStyle = pal.dark;
      ctx.beginPath(); ctx.rect(6, -3, 3, 2); ctx.fill();
      const flash = opts.flash || 0;
      if (flash > 0) {
        const g = ctx.createRadialGradient(24, -5, 0, 24, -5, 6 + flash * 4);
        g.addColorStop(0, `rgba(255,240,190,${0.9 * flash})`);
        g.addColorStop(0.5, `rgba(255,180,80,${0.55 * flash})`);
        g.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(24, -5, 6 + flash * 4, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'cannonarm':
      // короткий толстый ствол на плече — самый массивный силуэт роли "тяжёлый"
      ctx.lineWidth = 6;
      ctx.strokeStyle = tint || pal.metal;
      ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(15, -3); ctx.stroke();
      ctx.fillStyle = pal.dark;
      ctx.beginPath(); ctx.arc(15, -3, 3, 0, Math.PI * 2); ctx.fill();
      break;
    default:
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, -3); ctx.stroke();
  }
  ctx.restore();
}

// След-дуга удара (slash arc) — серп по траектории оружия вокруг плеча.
// Рисуется в системе верхней части тела (плечо — начало координат), до
// самой фигуры, чтобы фигура перекрывала след. style: fill, rim, glow.
function drawSlashArc(ctx, facing, sweep, alpha, r, style) {
  if (sweep <= 0.02 || alpha <= 0.02) return;
  const a0 = ATK_BACK, a1 = rigLerp(ATK_BACK, ATK_FRONT, sweep);
  ctx.save();
  ctx.scale(facing, 1);
  ctx.globalAlpha = alpha;
  const sickle = (rOut, rIn) => {
    ctx.beginPath();
    ctx.arc(0, 0, rOut, a0, a1);
    ctx.arc(0, 0, rIn, a1, a0 + (a1 - a0) * 0.3, true);
    ctx.closePath();
    ctx.fill();
  };
  if (style.glow) {
    ctx.fillStyle = style.glow;
    sickle(r * (style.glowR || 1.28), r * 0.42);
    if (style.glowR) sickle(r * 1.22, r * 0.5); // второй, более плотный слой ореола
  }
  ctx.fillStyle = style.fill; sickle(r, r * 0.6);
  if (style.rim) {
    ctx.strokeStyle = style.rim; ctx.lineWidth = style.rimW || 1.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r, a0 + (a1 - a0) * 0.15, a1); ctx.stroke();
  }
  ctx.restore();
}

// «Раб с цепью» (раунд 5, физика/высота поправлены в раунде 7 по
// баг-репорту — шар катился выше линии земли) — цепь и шар волочатся
// сзади, доп. штрих поверх обычного рига (не отдельный скелет, см.
// КОНЦЕПТ_ГДД.md, «Допущения»). lag — насколько шар отстаёт по инерции
// (больше на бегу), taut — рывок натяжения цепи на ударе (0..1).
function drawChainBall(ctx, facing, lag = 6, taut = 0, pal = WEAPON_PAL_LIGHT) {
  const BALL_R = 5;
  const anchorX = -facing * 5, anchorY = -9; // у бедра, сзади по ходу
  const ballX = anchorX - facing * (8 + lag);
  const ballY = -BALL_R; // низ шара касается y=0 — линии земли
  ctx.save();
  ctx.strokeStyle = pal.metal; ctx.lineWidth = 2; ctx.lineCap = 'round';
  const segs = 5;
  ctx.beginPath(); ctx.moveTo(anchorX, anchorY);
  for (let i = 1; i <= segs; i++) {
    const tt = i / segs;
    const sag = Math.sin(tt * Math.PI) * (4.5 - taut * 3.5); // натянутая цепь почти прямая
    ctx.lineTo(anchorX + (ballX - anchorX) * tt, anchorY + (ballY - anchorY) * tt + sag);
  }
  ctx.stroke();
  ctx.fillStyle = pal.dark; ctx.strokeStyle = pal.metal; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ballX - 2, ballY - 1); ctx.lineTo(ballX + 2, ballY + 1.5); ctx.stroke();
  ctx.restore();
}

// Щит — проп в задней руке (раунд 8): используется и на герое (тир
// прокачки красит цвет — бронза/серебро/золото), и на вражеском
// Щитоносце (нейтральный серый, без тира).
function drawShieldProp(ctx, x, y, facing, color, outline = '#221a10') {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color; ctx.strokeStyle = outline; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(-facing * 2, 0, 4.5, 7.5, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-facing * 2, -5); ctx.lineTo(-facing * 2, 5); ctx.stroke();
  ctx.restore();
}
// Броня — нагрудная пластина поверх торса (раунд 8, визуал прокачки).
function drawArmorPlate(ctx, hipY, shoulderY, color, outline = '#221a10') {
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = color; ctx.strokeStyle = outline; ctx.lineWidth = 1.4;
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
 * стопы на земле (контакт с ground line). Размер фигуры = RIG × scale ×
 * RIG_K (иконки HUD/справки передают scale/RIG_K, чтобы влезть в канвас).
 *
 * Новое в раунде 14: enemy (силуэт: чёрная заливка + тёплая кромка,
 * тёмное оружие), elite (красная кромка + свечение под ногами),
 * attackProfile ('unit' — урон в конце фазы, 'hero' — мгновенно),
 * buffed (аура Боевого клича), time (секунды — дыхание в покое, пульс ауры),
 * shadow (тень-эллипс, по умолчанию есть).
 */
function drawStickman(ctx, o) {
  const {
    x, y, scale = 1, color = ART.player.fill, outline = ART.player.outline, facing = 1,
    walkPhase = 0, moving = false, attackPhase = null, deathT = null, hitFlash = 0,
    weapon = null, hero = false, roleAccent = null,
    bent = false, cheer = false, chainBall = false, chainLag = 6, chainTaut = 0,
    digPhase = null,
    // Раунд 8 — визуал прокачки героя (0 = нет уровня) и щит-проп юнита:
    gearSwordTier = 0, gearShieldTier = 0, gearArmorTier = 0, shieldColor = null,
    cloak = false, cloakFlareT = 0, // утро — плащ героя (косметика магазина)
    enemy = false, elite = false, attackProfile = 'unit', buffed = false, time = 0, shadow = true,
  } = o;
  const s = scale * RIG_K;
  const wpal = enemy ? WEAPON_PAL_DARK : WEAPON_PAL_LIGHT;
  const isRanged = weapon !== null && RANGED_WEAPONS.has(weapon);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // --- земля: тень, свечение элиты, аура клича (до поворота смерти) ---
  const dt0 = deathT === null ? 0 : deathT;
  if (shadow && dt0 < 0.7) {
    ctx.fillStyle = ART.shadow;
    ctx.globalAlpha = 1 - dt0 / 0.7;
    ctx.beginPath(); ctx.ellipse(0, 0.5, 11 * (1 + dt0 * 0.8), 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (elite && enemy && deathT === null) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    g.addColorStop(0, ART.enemy.eliteGlow); g.addColorStop(1, 'rgba(200,48,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0.5, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (buffed && deathT === null) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 9);
    ctx.save();
    ctx.strokeStyle = ART.cryAura; ctx.lineWidth = 2 + pulse;
    ctx.globalAlpha = 0.55 + pulse * 0.35;
    ctx.beginPath(); ctx.ellipse(0, 0.5, 12 + pulse * 2, 4 + pulse * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // --- смерть: падение назад с ease-out и подскоком, затухание ---
  if (deathT !== null) {
    const t = Math.min(1, deathT);
    const fall = rigEaseOutBack(Math.min(1, t / 0.8));
    ctx.translate(0, -1 - Math.sin(Math.min(1, t / 0.4) * Math.PI) * 2.5);
    ctx.rotate(-facing * fall * (Math.PI / 2)); // назад — от того, кто ударил
    ctx.globalAlpha = t < 0.55 ? 1 : 1 - ((t - 0.55) / 0.45) * 0.8;
  }
  // «Прыгает и радуется» на экране победы (раунд 5) — подскок всей фигурой.
  const cheerBounce = (cheer && deathT === null) ? Math.abs(Math.sin(walkPhase)) * 7 : 0;
  if (cheerBounce) ctx.translate(0, -cheerBounce);
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
  // Маховая нога отрывается от земли (колено поднимается), опорная — нет.
  const liftFront = legsMoving ? Math.max(0, Math.cos(walkPhase)) * 4 : 0;
  const liftBack = legsMoving ? Math.max(0, Math.cos(walkPhase + Math.PI)) * 4 : 0;
  const breath = (!legsMoving && deathT === null && !cheer) ? Math.sin(time * 2.2) * 0.6 : 0;

  const hipY = -RIG.legLen - bob;
  const T = RIG.torso;
  const shoulderLocal = -T + breath; // в системе бедра (0,0)
  const headLocal = shoulderLocal - RIG.neck - RIG.head;

  // Ноги (в базовой системе)
  const legBack = limbPoints(0, hipY, facing * legSwing2 * 0.6, -liftBack, LEG_SEG, -facing);
  const legFront = limbPoints(0, hipY, facing * legSwing * 0.6, -liftFront, LEG_SEG, -facing);

  // Рука (атака) и ноги (ходьба) — независимые источники позы: юнит может
  // одновременно идти и бить (герой на ходу), одно не должно гасить другое.
  let armBack, armFront, lean = 0, weaponRot = null, atk = null, rng = null;
  let pullPoint = null;
  if (deathT !== null) {
    armBack = { x: -facing * 8, y: shoulderLocal + 6 };
    armFront = { x: facing * 8, y: shoulderLocal + 6 };
  } else {
    armBack = legsMoving
      ? { x: -facing * 3 + Math.sin(walkPhase) * 7 * 0.3, y: shoulderLocal + RIG.armLen }
      : { x: -facing * 3, y: shoulderLocal + RIG.armLen * 0.8 };
    if (attackPhase !== null && isRanged) {
      rng = rangedTimeline(attackPhase);
      lean = rng.lean;
      if (weapon === 'sling') {
        // раскрутка над головой: кисть идёт по малому кругу выше головы
        const a = -Math.PI / 2 + rng.whirl;
        const cx = facing * 2, cy = headLocal - RIG.head - 4;
        armFront = rng.whirl > 0
          ? { x: cx + Math.cos(a) * 4 * facing, y: cy + Math.sin(a) * 2.5 }
          : { x: facing * RIG.armLen * 0.9, y: shoulderLocal + 2 };
        weaponRot = rng.whirl > 0 ? (a + Math.PI * 0.5) * facing : null;
      } else if (weapon === 'bow') {
        const recoil = rng.flash * 1.5;
        armFront = { x: facing * (RIG.armLen * 0.98 - recoil), y: shoulderLocal - 0.5 };
        const cheek = { x: -facing * 1.5, y: shoulderLocal - RIG.neck * 0.6 };
        const nearBow = { x: facing * (RIG.armLen * 0.75), y: shoulderLocal - 0.5 };
        armBack = { x: rigLerp(nearBow.x, cheek.x, rng.draw), y: rigLerp(nearBow.y, cheek.y, rng.draw) };
        pullPoint = { x: (armBack.x - armFront.x) * facing, y: armBack.y - armFront.y };
        weaponRot = 0;
      } else { // rifle
        const recoil = rng.flash * 3;
        armFront = { x: facing * (RIG.armLen * 0.95 - recoil), y: shoulderLocal + 1.5 };
        armBack = { x: facing * (RIG.armLen * 0.45 - recoil), y: shoulderLocal + 4 };
        weaponRot = 0;
      }
    } else if (attackPhase !== null) {
      atk = attackTimeline(attackPhase, attackProfile);
      lean = atk.lean;
      const r = RIG.armLen * 1.05 * atk.reach;
      armFront = { x: facing * Math.cos(atk.theta) * r, y: shoulderLocal + Math.sin(atk.theta) * r };
      weaponRot = atk.rot;
      // задняя рука уравновешивает удар — уходит назад-вниз
      armBack = { x: -facing * (3 + atk.reach * 4), y: shoulderLocal + RIG.armLen * 0.7 };
    } else if (isRanged) {
      // дальнобойный в покое/на ходу держит оружие перед собой
      armFront = { x: facing * RIG.armLen * 0.85, y: shoulderLocal + 3 };
      if (weapon !== 'sling') armBack = { x: facing * RIG.armLen * 0.4, y: shoulderLocal + 5 };
      weaponRot = 0;
    } else if (legsMoving) {
      armFront = { x: facing * 3 + Math.sin(walkPhase + Math.PI) * 7 * 0.3, y: shoulderLocal + RIG.armLen };
    } else {
      armFront = { x: facing * 3, y: shoulderLocal + RIG.armLen };
    }
    if (legsMoving) lean += facing > 0 ? 0.07 : 0.07;
  }
  if (cheer && deathT === null) {
    const wave = Math.sin(walkPhase * 2) * 3;
    armBack = { x: -facing * 9 + wave, y: shoulderLocal - RIG.armLen * 0.7 };
    armFront = { x: facing * 9 - wave, y: shoulderLocal - RIG.armLen * 0.7 };
    lean = 0;
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
      day = shoulderLocal - p * RIG.armLen * 1.15;
      lean = -0.08 * p;
    } else {
      const p = (digPhase - 0.5) / 0.5;
      dax = facing * (RIG.armLen * 0.3 + p * RIG.armLen * 0.9);
      day = (shoulderLocal - RIG.armLen * 1.15) + p * (RIG.armLen * 1.15 + RIG.legLen * 0.95);
      lean = rigLerp(-0.08, 0.22, p);
    }
    digHand = { x: dax, y: day };
    armFront = digHand;
    weaponRot = digPhase < 0.5 ? -1.2 * (digPhase / 0.5) : rigLerp(-1.2, 1.3, (digPhase - 0.5) / 0.5);
  }

  // Локти: назад по ходу (bendDir по знаку facing), при ударе — по дуге
  const armB = limbPoints(0, shoulderLocal, armBack.x, armBack.y, ARM_SEG, facing);
  const armF = limbPoints(0, shoulderLocal, armFront.x, armFront.y, ARM_SEG, facing);

  // --- проходы отрисовки: контур → заливка → вспышка попадания ---
  // Верх тела (торс, руки, голова, оружие) рисуется в системе бедра,
  // повёрнутой на lean — наклон корпуса в замахе/ударе, на ходу и при копании.
  const upperTransform = () => { ctx.translate(0, hipY); ctx.rotate(facing * lean); };
  const strokeLegs = (w, col) => {
    ctx.lineWidth = w; ctx.strokeStyle = col;
    for (const L of [legBack, legFront]) {
      ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(L.joint.x, L.joint.y); ctx.lineTo(L.end.x, L.end.y); ctx.stroke();
    }
  };
  const strokeUpper = (w, col) => {
    ctx.lineWidth = w; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, shoulderLocal); ctx.stroke();
    for (const A of [armB, armF]) {
      ctx.beginPath(); ctx.moveTo(0, shoulderLocal); ctx.lineTo(A.joint.x, A.joint.y); ctx.lineTo(A.end.x, A.end.y); ctx.stroke();
    }
  };

  // Плащ — рисуется первым (позади торса/рук), висит НАЗАД (противоположно
  // facing = взгляду/движению), поэтому сам факт направления читается по
  // силуэту даже на симметричной "болванке" стикмена без черт лица.
  // След-дуга удара — тоже позади фигуры.
  ctx.save(); upperTransform();
  if (cloak && deathT === null) drawCloak(ctx, 0, shoulderLocal, facing, walkPhase, moving, cloakFlareT);
  if (atk && atk.slashA > 0 && weapon && !cheer) {
    ctx.save(); ctx.translate(0, shoulderLocal);
    const reach = RIG.armLen * 1.05 + (weapon === 'pike' || weapon === 'stick_spear' || weapon === 'bronze_spear' ? 22 : 15);
    // У героя след заметно шире и ярче — это «золотая дуга» с обложки,
    // главный визуальный якорь его удара.
    const style = hero
      ? { fill: ART.slash.hero, glow: ART.hero.goldGlow, rim: ART.hero.goldHi, rimW: 2.2, glowR: 1.5 }
      : enemy ? { fill: ART.slash.enemy, rim: ART.slash.enemyRim } : { fill: ART.slash.player };
    drawSlashArc(ctx, facing, atk.sweep, atk.slashA, hero ? reach * 1.15 : reach, style);
    ctx.restore();
  }
  ctx.restore();

  const outlineW = RIG.lineWidth + 1.6;
  // контур
  strokeLegs(outlineW, outline);
  ctx.save(); upperTransform(); strokeUpper(outlineW, outline); ctx.restore();
  // заливка
  strokeLegs(RIG.lineWidth, color);
  ctx.save(); upperTransform(); strokeUpper(RIG.lineWidth, color); ctx.restore();

  ctx.save(); upperTransform();
  // Перевязь по роли — второй, независимый от оружия сигнал, чтобы роль
  // читалась и на маленьком масштабе, где линия оружия едва различима
  // (см. ПЛАН.md, раунд 3: юниты визуально слились друг с другом).
  if (roleAccent && deathT === null) {
    ctx.strokeStyle = roleAccent;
    ctx.lineWidth = 3;
    ctx.globalAlpha = enemy ? 0.85 : 1;
    ctx.beginPath();
    ctx.moveTo(-4, shoulderLocal + 2);
    ctx.lineTo(4, -2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // голова: заливка + контур; у светлых — блик сверху (объём), у силуэта —
  // ровная чернота с тёплой кромкой
  ctx.fillStyle = color;
  ctx.strokeStyle = outline;
  ctx.lineWidth = RIG.lineWidth - 1;
  ctx.beginPath(); ctx.arc(0, headLocal, RIG.head, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (!enemy && deathT === null) {
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.arc(-facing * 1.5, headLocal - 1.5, RIG.head * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  if (hero) {
    ctx.fillStyle = ART.hero.gold;
    ctx.strokeStyle = ART.hero.outline; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-RIG.head * 0.8, headLocal - RIG.head * 0.6);
    ctx.lineTo(RIG.head * 0.8, headLocal - RIG.head * 0.6);
    ctx.lineTo(0, headLocal - RIG.head * 1.7);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // Визуал прокачки героя (раунд 8) — броня и щит рисуются как надетые
  // пропы, до оружия (оружие в руке должно перекрывать щит на замахе, а
  // не наоборот); цвет берётся по тиру (см. GEAR_TIER_COLORS в data.js).
  if (deathT === null) {
    if (hero && gearArmorTier > 0) drawArmorPlate(ctx, 0, shoulderLocal, GEAR_TIER_COLORS[gearArmorTier - 1], outline);
    if (hero && gearShieldTier > 0) drawShieldProp(ctx, armB.end.x, armB.end.y, facing, GEAR_TIER_COLORS[gearShieldTier - 1], outline);
    else if (shieldColor) drawShieldProp(ctx, armB.end.x, armB.end.y, facing, shieldColor, outline);
  }

  if (weapon && !cheer) {
    const hand = armF.end;
    const restWobble = legsMoving && attackPhase === null && !digHand ? Math.sin(walkPhase) * 0.15 : 0;
    const tint = hero && gearSwordTier > 0 ? GEAR_TIER_COLORS[gearSwordTier - 1] : (hero ? ART.hero.gold : null);
    const wopts = { pal: wpal };
    if (hero) { wopts.glow = ART.hero.goldGlow; wopts.glowHi = ART.hero.goldHi; }
    if (rng) { wopts.draw = rng.draw; wopts.flash = rng.flash; wopts.whirl = rng.whirl; }
    if (pullPoint) wopts.pull = pullPoint;
    else if (weapon === 'bow') wopts.pull = { x: -6, y: 0 };
    drawWeapon(ctx, weapon, hand.x, hand.y, facing, weaponRot, restWobble, tint, wopts);
    // вспышка спуска тетивы — короткий светлый блик у лука сразу после выстрела
    if (rng && weapon === 'bow' && rng.flash > 0) {
      ctx.fillStyle = `rgba(255,240,200,${0.5 * rng.flash})`;
      ctx.beginPath(); ctx.arc(hand.x + facing * 6, hand.y, 3 + rng.flash * 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // вспышка попадания — вся фигура на миг светлеет (у силуэта — тёплая)
  if (hitFlash > 0 && deathT === null) {
    ctx.restore(); // выйти из upperTransform, чтобы нарисовать и ноги
    ctx.save();
    // у силуэта вспыхивает только тёплая кромка (заливка остаётся чёрной),
    // у светлых — вся фигура белеет
    ctx.globalAlpha = Math.min(1, hitFlash) * (enemy ? 0.9 : 0.85);
    const flashCol = enemy ? '#ffd7a8' : '#ffffff';
    const flashW = enemy ? RIG.lineWidth + 1.6 : RIG.lineWidth;
    strokeLegs(flashW, flashCol);
    ctx.save(); upperTransform(); strokeUpper(flashW, flashCol);
    if (enemy) {
      ctx.strokeStyle = flashCol; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, headLocal, RIG.head, 0, Math.PI * 2); ctx.stroke();
      strokeUpper(RIG.lineWidth, color); // вернуть чёрную сердцевину поверх кромки
    } else {
      ctx.fillStyle = flashCol;
      ctx.beginPath(); ctx.arc(0, headLocal, RIG.head, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (enemy) strokeLegs(RIG.lineWidth, color);
    ctx.restore();
  } else {
    ctx.restore();
  }

  if (chainBall && deathT === null) drawChainBall(ctx, facing, chainLag, chainTaut, wpal);

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
    color = ART.enemy.fill, outline = ART.enemy.outline, enemy = true, elite = false, buffed = false, time = 0,
  } = o;
  drawStickman(ctx, {
    x, y, scale, facing, walkPhase, moving, deathT, hitFlash,
    color, outline, roleAccent, enemy, elite, buffed, time,
  });
  if (deathT !== null) return; // при смерти верхний наездник не отрисовывается отдельно
  const topScale = scale * 0.8;
  const riderHeight = (RIG.legLen + RIG.torso * 0.55) * scale * RIG_K;
  drawStickman(ctx, {
    x, y: y - riderHeight, scale: topScale, facing, walkPhase: 0, moving: false,
    attackPhase, hitFlash, time,
    color, outline, weapon: 'sling', enemy, shadow: false,
  });
}
