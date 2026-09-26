// VFX «под обложку» (раунд 14, ТЗ_ВИЗУАЛ_ПОД_ОБЛОЖКУ.md): типизированные
// частицы вместо 4-пиксельных квадратиков, снаряды с формой и дугой,
// всплывающие «+N», эффекты способностей. Состояние живёт в match
// (match.particles, match.floaters) — рендер (game.js) только вызывает
// VFX.draw(). Никакого shadowBlur: свечение — градиенты и слои штрихов.
// Цвета — из ART/AGES (data.js), локальных литералов минимум.
'use strict';

const VFX = (() => {
  const CAP = (typeof ART !== 'undefined' && ART.particleCap) || 400;

  function push(m, p) {
    if (m.particles.length >= CAP) m.particles.shift(); // старейшая уступает место
    m.particles.push(p);
  }

  // y — смещение от линии земли (отрицательное = выше), как и раньше в
  // spawnParticles (см. комментарий в render() до раунда 14).
  function spawn(m, type, x, y, o = {}) {
    const p = {
      type, x, y,
      vx: o.vx || 0, vy: o.vy || 0,
      life: o.life || 0.5, age: 0,
      size: o.size || 3, color: o.color || '#ffd77a',
      rot: o.rot || 0, vrot: o.vrot || 0,
      gravity: o.gravity !== undefined ? o.gravity : 220,
      width: o.width || 3, glow: o.glow || null,
    };
    push(m, p);
    return p;
  }

  function burst(m, type, x, y, count, o = {}) {
    const speed = o.speed || 90, spread = o.spread !== undefined ? o.spread : Math.PI * 2;
    const dir = o.dir !== undefined ? o.dir : -Math.PI / 2;
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const sp = speed * (0.4 + Math.random() * 0.8);
      const colors = o.colors || (o.color ? [o.color] : ART.spark);
      spawn(m, type, x + (Math.random() - 0.5) * (o.jitter || 0), y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.lift || 0),
        life: (o.life || 0.5) * (0.7 + Math.random() * 0.6),
        size: (o.size || 3) * (0.7 + Math.random() * 0.6),
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2, vrot: (Math.random() - 0.5) * 12,
        gravity: o.gravity, glow: o.glow,
      });
    }
  }

  function update(m, dt) {
    for (const p of m.particles) {
      p.age += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      if (p.type === 'spark' || p.type === 'chip' || p.type === 'dust') p.vy += p.gravity * dt;
      if (p.type === 'dust') { p.vx *= Math.max(0, 1 - dt * 3); p.vy *= Math.max(0, 1 - dt * 3); }
      if (p.type === 'ember') p.vx += Math.sin(p.age * 7 + p.rot) * 12 * dt;
      if (p.type === 'smoke') { p.vx *= Math.max(0, 1 - dt * 1.2); p.vy += p.gravity * dt; }
    }
    m.particles = m.particles.filter(p => p.age < p.life);
    if (m.floaters) {
      for (const f of m.floaters) f.age += dt;
      m.floaters = m.floaters.filter(f => f.age < f.life);
    }
    if (m.dmgNums && m.dmgNums.length) {
      for (const d of m.dmgNums) { d.age += dt; d.total += dt; d.sinceHit += dt; d.pop += dt; } // r15 И14
      m.dmgNums = m.dmgNums.filter(d => d.age < d.life);
    }
  }

  function draw(ctx, m, groundY) {
    for (const p of m.particles) {
      const t = p.age / p.life;
      const a = Math.max(0, 1 - t);
      const px = p.x, py = groundY + p.y;
      ctx.globalAlpha = a;
      switch (p.type) {
        case 'spark': {
          ctx.strokeStyle = p.color; ctx.lineWidth = p.size * 0.6; ctx.lineCap = 'round';
          const k = 0.028;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - p.vx * k, py - p.vy * k); ctx.stroke();
          break;
        }
        case 'dust': {
          const r = p.size * (1 + t * 1.6);
          ctx.globalAlpha = a * 0.55;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'ember': {
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(px, py, p.size * (1 - t * 0.5), 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'chip': {
          ctx.save(); ctx.translate(px, py); ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
          ctx.restore();
          break;
        }
        case 'ring': {
          const r = p.size * (0.15 + 0.85 * (1 - Math.pow(1 - t, 2)));
          if (p.glow) {
            ctx.strokeStyle = p.glow; ctx.lineWidth = p.width * 3.2;
            ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.5, p.width * (1 - t));
          ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'flash': {
          const r = p.size * (0.5 + t);
          const g = ctx.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(255,200,120,0)');
          ctx.globalAlpha = a * 0.8;
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'smoke': { // раунд 15 (И4): клубы дыма разрушенной крепости — растут и тают
          const r = p.size * (0.6 + t * 1.8);
          ctx.globalAlpha = Math.min(1, t * 6) * a * 0.62;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    if (m.floaters && m.floaters.length) {
      ctx.save();
      // r15 И10: было 13 (10.4px на 800×450); r15 И14: не мельче 14 CSS px при любом масштабе камеры
      ctx.font = `bold ${Math.max(16, 14 / screenScale(ctx)).toFixed(1)}px 'Lilita One', 'Fredoka', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const f of m.floaters) {
        const t = f.age / f.life;
        ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        const yy = groundY + f.y - t * 28;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(30,18,8,.85)';
        ctx.strokeText(f.text, f.x, yy);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, yy);
      }
      ctx.restore();
    }
    drawDamageNumbers(ctx, m, groundY);
  }

  // --- раунд 15 (И4): числа урона ---------------------------------------
  // Пул на match.dmgNums, не больше DMG_CAP одновременно (старейшее уступает
  // место). Удары по одной цели в пределах DMG_MERGE_SEC складываются в одно
  // число (залп, сплэш, частые тики) — вместо россыпи мелких цифр.
  // style: 'hero' — удар героя (жёлтое, крупнее, с «пружиной»), 'hurt' —
  // урон по своим (красноватое, мелкое), иначе — белое мелкое.
  // r15 И14 (куратор №4: «цифры ~10px слипаются в стопки „9 9 11“»):
  // - экранный размер не мельче DMG_MIN_PX CSS-px при любом масштабе камеры
  //   (берётся из текущей матрицы ctx, т.е. учитывает VIEW.k и крупный план
  //   на телефоне): на 800×450 обычное число 13px, удар героя 16px;
  // - попадания по одной цели одного стиля в окне DMG_MERGE_SEC от
  //   последнего попадания складываются в одно растущее число (с новой
  //   «пружиной»), пока число не старше DMG_MERGE_MAX_AGE — потом новое;
  // - новое число не ложится на соседнее: разброс по X и подъём на строку
  //   вверх, если рядом уже висит число; не больше DMG_CAP на экране.
  const DMG_CAP = 12;
  const DMG_MERGE_SEC = 0.38;
  const DMG_MERGE_MAX_AGE = 0.9;
  const DMG_STYLE = {
    // size — мировые px (нижняя граница), minPx — минимум на экране в CSS px
    normal: { size: 15, minPx: 13, color: '#ffffff', life: 0.8, rise: 22 },
    hero: { size: 20, minPx: 16, color: '#ffd84a', life: 1.0, rise: 30 },
    hurt: { size: 15, minPx: 13, color: '#ff9a7c', life: 0.8, rise: 20 },
  };
  // Масштаб «мировой px → CSS px» по текущей матрице канваса.
  function screenScale(ctx) {
    const tr = ctx.getTransform ? ctx.getTransform() : null;
    const dpr = (typeof VIEW !== 'undefined' && VIEW.dpr) || window.devicePixelRatio || 1;
    const k = tr ? Math.hypot(tr.a, tr.b) / dpr : 1;
    return k > 0.05 ? k : 1;
  }
  function dmgNumPos(d, groundY) {
    const t = d.age / d.life;
    return { x: d.x + d.vx * t, y: groundY + d.y + d.dy - d.style.rise * (1 - (1 - t) * (1 - t)) };
  }
  function damageNumber(m, x, y, amount, style, key) {
    const v = Math.round(amount);
    if (!(v >= 1)) return;
    m.dmgNums = m.dmgNums || [];
    const st = DMG_STYLE[style] || DMG_STYLE.normal;
    if (key) {
      for (let i = m.dmgNums.length - 1; i >= 0; i--) {
        const d = m.dmgNums[i];
        if (d.key === key && d.style === st && d.sinceHit < DMG_MERGE_SEC && d.total < DMG_MERGE_MAX_AGE) {
          d.value += v; d.sinceHit = 0; d.pop = 0;
          d.age = Math.min(d.age, 0.25); // растущее число не тает, пока по цели бьют
          d.x += (x - d.x) * 0.5;          // держится над движущейся целью
          return;
        }
      }
    }
    while (m.dmgNums.length >= DMG_CAP) m.dmgNums.shift();
    const nd = { x: x + (Math.random() - 0.5) * 18, y, dy: -Math.random() * 4, vx: (Math.random() - 0.5) * 20, value: v, style: st, key, age: 0, total: 0, sinceHit: 0, pop: 0, life: st.life };
    // Развод по вертикали: если в «строке» нового числа уже висит другое
    // (близко по X и Y) — поднимаем новое на строку, до трёх раз.
    const rowH = st.size * 1.05, colW = st.size * 1.6;
    for (let step = 0; step < 3; step++) {
      const p = dmgNumPos(nd, 0);
      const hit = m.dmgNums.some(d => { const q = dmgNumPos(d, 0); return Math.abs(q.x - p.x) < colW && Math.abs(q.y - p.y) < rowH; });
      if (!hit) break;
      nd.dy -= rowH;
      nd.x += (Math.random() < 0.5 ? -1 : 1) * st.size * 0.35;
    }
    m.dmgNums.push(nd);
  }
  function drawDamageNumbers(ctx, m, groundY) {
    if (!m.dmgNums || !m.dmgNums.length) return;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const k = screenScale(ctx);
    // r15 И18 (куратор №6: «у ворот врага цифры урона налезают на маркер
    // героя»): маркер над головой героя (rig.js кладёт его экранную точку в
    // ctx.heroMarkerAt в этом же кадре) — зона, куда цифры не заходят:
    // число, задевшее маркер, уходит вбок от него (сторона запоминается,
    // чтобы число не прыгало), маркер остаётся читаемым.
    let mk = null;
    const hm = ctx.heroMarkerAt;
    if (hm && m.world && m.world.hero && m.world.hero.alive && performance.now() - hm.at < 100 && ctx.getTransform) {
      const tr = ctx.getTransform();
      const q = tr.inverse().transformPoint(hm.p);
      mk = { x: q.x, y: q.y, r: hm.r / (Math.hypot(tr.a, tr.b) || 1) };
    }
    let lastFont = '';
    for (const d of m.dmgNums) {
      const st = d.style;
      const t = d.age / d.life;
      // Сумма растёт — число чуть крупнее (до +30% на сотнях урона).
      const grow = 1 + Math.min(0.3, Math.max(0, Math.log10(d.value) - 1) * 0.2);
      const size = Math.max(st.size, st.minPx / k) * grow;
      const font = `${size.toFixed(1)}px 'Lilita One', 'Fredoka', sans-serif`;
      if (font !== lastFont) { ctx.font = font; lastFont = font; }
      // появление с «пружиной» (1.45 → 1), подъём с замедлением, угасание в конце;
      // каждое слияние перезапускает «пружину» (слабее — 1.3)
      const pop = d.pop < 0.12 ? 1 + (d.total > d.pop ? 0.3 : 0.45) * (1 - d.pop / 0.12) : 1;
      const p = dmgNumPos(d, groundY);
      const s = String(d.value);
      if (mk) {
        const hw = ctx.measureText(s).width * 0.5 * pop + size * 0.15, hh = size * 0.5 * pop;
        if (Math.abs(p.x - mk.x) < hw + mk.r && Math.abs(p.y - mk.y) < hh + mk.r) {
          if (!d.mside) d.mside = p.x >= mk.x ? 1 : -1;
          p.x = mk.x + d.mside * (hw + mk.r + 1);
        }
      }
      ctx.globalAlpha = t < 0.65 ? 1 : Math.max(0, 1 - (t - 0.65) / 0.35);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (pop !== 1) ctx.scale(pop, pop);
      ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = 'rgba(26,14,6,.9)';
      ctx.strokeText(s, 0, 0);
      ctx.fillStyle = st.color;
      ctx.fillText(s, 0, 0);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Удар героя: вспышка, веер искр по направлению удара, короткий «росчерк».
  function heroHit(m, x, y, dir, big) {
    spawn(m, 'flash', x, y, { size: big ? 34 : 22, life: 0.16, color: 'rgba(255,244,200,.95)', gravity: 0 });
    burst(m, 'spark', x, y, big ? 14 : 9, { speed: big ? 240 : 190, spread: Math.PI * 0.9, dir: dir > 0 ? -0.35 : Math.PI + 0.35, life: 0.32, size: 3, colors: ['#fff6d8', '#ffd77a', '#ffb04c'], gravity: 260 });
    spawn(m, 'ring', x, y, { size: big ? 26 : 18, width: 3, life: 0.2, color: 'rgba(255,240,200,.9)', gravity: 0 });
  }

  // Разрушение крепости (финал боя): вспышка, две ударные волны, веер
  // обломков брёвен/камня, пыль, угли и столб дыма. own — своя крепость
  // (поражение): волна красноватая. ~110 частиц — в пределах CAP.
  function fortressDestroyed(m, x, own, age) {
    const wood = age ? [age.woodDark, age.woodLight, age.stone] : [ART.woodChip, '#7a5636', '#8a7e70'];
    spawn(m, 'flash', x, -55, { size: 150, life: 0.5, color: own ? 'rgba(255,170,120,.95)' : 'rgba(255,244,200,.98)', gravity: 0 });
    spawn(m, 'ring', x, -6, { size: 260, width: 9, life: 0.8, color: own ? ART.enemy.eliteOutline : ART.hero.gold, glow: own ? ART.enemy.eliteGlow : ART.hero.goldGlow, gravity: 0 });
    spawn(m, 'ring', x, -6, { size: 150, width: 5, life: 0.6, color: 'rgba(255,240,210,.9)', gravity: 0 });
    burst(m, 'chip', x, -45, 34, { speed: 300, spread: Math.PI * 1.1, dir: -Math.PI / 2, life: 1.3, size: 4.2, colors: wood, gravity: 420, jitter: 50 });
    burst(m, 'spark', x, -50, 26, { speed: 320, life: 0.7, size: 3.4, colors: ART.spark, lift: 60 });
    burst(m, 'dust', x, -4, 16, { speed: 150, spread: Math.PI, dir: -Math.PI / 2, life: 1.2, size: 8, color: ART.dust, gravity: 20, jitter: 60 });
    burst(m, 'ember', x, -40, 14, { speed: 80, spread: Math.PI * 0.8, dir: -Math.PI / 2, life: 1.6, size: 2.4, colors: ART.spark, gravity: 0, jitter: 50 });
    for (let i = 0; i < 8; i++) smokePuff(m, x + (Math.random() - 0.5) * 70, -30 - Math.random() * 40, 1.3);
  }
  function smokePuff(m, x, y, scale = 1) {
    const g = 60 + Math.floor(Math.random() * 30);
    spawn(m, 'smoke', x, y, {
      vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 30, gravity: -8,
      life: 1.4 + Math.random() * 0.8, size: (7 + Math.random() * 6) * scale,
      color: `rgb(${g},${g - 6},${g - 10})`,
    });
  }
  // Вторичный хлопок при «добивании» (на 0.3–0.8 с финала).
  function fortressAftershock(m, x) {
    spawn(m, 'flash', x, -40, { size: 60, life: 0.25, color: 'rgba(255,220,160,.9)', gravity: 0 });
    burst(m, 'chip', x, -35, 10, { speed: 220, spread: Math.PI, dir: -Math.PI / 2, life: 1.0, size: 3.4, color: ART.woodChip, gravity: 420, jitter: 30 });
    burst(m, 'spark', x, -35, 10, { speed: 200, life: 0.5, size: 2.8, colors: ART.spark });
  }

  function floater(m, x, y, text, color) {
    m.floaters = m.floaters || [];
    m.floaters.push({ x, y, text, color: color || ART.hero.gold, age: 0, life: 0.85 });
  }

  // --- снаряды --------------------------------------------------------
  // Дуга: по прогрессу x0→tx (записываются в entities.js при спавне);
  // цель может подойти ближе — тогда снаряд просто долетает раньше.
  function projectileArc(p) {
    const x0 = p.x0 !== undefined ? p.x0 : p.x;
    const tx = p.tx !== undefined ? p.tx : p.x;
    const span = Math.max(1, Math.abs(tx - x0));
    const prog = Math.max(0, Math.min(1, (p.x - x0) / (tx - x0 || 1)));
    const h = Math.min(60, span * 0.16);
    const y = -30 - Math.sin(prog * Math.PI) * h;
    // наклон по касательной к дуге
    const dy = -Math.cos(prog * Math.PI) * Math.PI * h / span;
    const dir = p.vx >= 0 ? 1 : -1;
    return { y, angle: Math.atan2(dy * dir, 1) * dir, prog };
  }

  function projectileKind(p, age) {
    if (p.splash) return 'bomb';
    if (p.role === 'rider') return 'stone';
    const w = age.weapon.ranged;
    if (w === 'sling') return 'stone';
    if (w === 'rifle') return 'tracer';
    return 'arrow';
  }

  function drawProjectile(ctx, p, age, groundY) {
    const kind = projectileKind(p, age);
    const dir = p.vx >= 0 ? 1 : -1;
    const dark = p.team === 'enemy';
    ctx.save();
    if (kind === 'tracer') {
      ctx.translate(p.x, groundY - 32);
      ctx.strokeStyle = 'rgba(255,230,160,.9)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-dir * 16, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,180,80,.35)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-dir * 10, 0); ctx.stroke();
      ctx.restore();
      return;
    }
    const arc = projectileArc(p);
    ctx.translate(p.x, groundY + arc.y);
    if (kind === 'arrow') {
      ctx.rotate(arc.angle);
      ctx.scale(dir, 1);
      ctx.lineCap = 'round';
      ctx.strokeStyle = dark ? '#2a201a' : '#d8c8a0'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(7, 0); ctx.stroke();
      ctx.fillStyle = dark ? '#3a2c20' : '#e8e0d0';
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(5.5, -2); ctx.lineTo(5.5, 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = dark ? '#4a3a2a' : '#f3e7c8'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-6, -2.5); ctx.moveTo(-9, 0); ctx.lineTo(-6, 2.5);
      ctx.moveTo(-6.5, 0); ctx.lineTo(-3.5, -2.5); ctx.moveTo(-6.5, 0); ctx.lineTo(-3.5, 2.5); ctx.stroke();
    } else if (kind === 'stone') {
      ctx.rotate(arc.prog * Math.PI * 4 * dir);
      ctx.fillStyle = dark ? '#3a3230' : '#8a7e70'; ctx.strokeStyle = '#221a10'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-3.5, -1); ctx.lineTo(-1, -3.5); ctx.lineTo(3, -2.5); ctx.lineTo(3.5, 1.5); ctx.lineTo(0.5, 3.5); ctx.lineTo(-3, 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else { // bomb
      ctx.fillStyle = '#1e1a18'; ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const fl = 0.5 + 0.5 * Math.sin(performance.now() / 40);
      ctx.fillStyle = `rgba(255,200,90,${0.6 + fl * 0.4})`;
      ctx.beginPath(); ctx.arc(-dir * 2, -5, 1.6 + fl, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // --- готовые эффекты (вызываются из хуков world.on* в game.js) --------
  function heroSpecial(m, x, range) {
    spawn(m, 'ring', x, -6, { size: range, width: 7, life: 0.55, color: ART.hero.gold, glow: ART.hero.goldGlow, gravity: 0 });
    spawn(m, 'ring', x, -6, { size: range * 0.7, width: 3, life: 0.4, color: ART.hero.goldHi, gravity: 0 });
    spawn(m, 'flash', x, -22, { size: 46, life: 0.28, color: 'rgba(255,236,170,.9)', gravity: 0 });
    burst(m, 'spark', x, -20, 22, { speed: 190, life: 0.5, size: 3.2, colors: ART.spark, lift: 40 });
    burst(m, 'dust', x, -3, 12, { speed: 120, spread: Math.PI * 0.9, dir: -Math.PI / 2, life: 0.7, size: 5, color: ART.dust, gravity: 40, jitter: 40 });
  }
  function cry(m, x) {
    spawn(m, 'ring', x, -6, { size: 90, width: 5, life: 0.6, color: ART.cryAura, gravity: 0 });
    spawn(m, 'ring', x, -6, { size: 60, width: 3, life: 0.45, color: 'rgba(255,200,120,.7)', gravity: 0 });
    burst(m, 'ember', x, -28, 18, { speed: 60, spread: Math.PI * 0.8, dir: -Math.PI / 2, life: 0.9, size: 2.2, colors: ['#ff8a3c', '#ffb04c', '#ffd77a'], gravity: 0, jitter: 30 });
  }
  function pickaxe(m, x, gold) {
    burst(m, 'dust', x, -2, 8, { speed: 110, spread: Math.PI * 0.8, dir: -Math.PI / 2, life: 0.55, size: 3.5, color: 'rgba(90,62,36,.7)', gravity: 260, jitter: 8 });
    burst(m, 'spark', x, -4, 8, { speed: 120, spread: Math.PI * 0.9, dir: -Math.PI / 2, life: 0.45, size: 2.6, colors: ART.spark });
    if (gold) floater(m, x, -40, `+${gold}`, ART.hero.gold);
  }
  // Раунд 15 (И4): искры богаче — 6 вместо 4, разный размер, падают дугой,
  // плюс маленькое белое кольцо-«тычок» в точке контакта.
  function meleeHit(m, x, y, enemyTarget) {
    burst(m, 'spark', x, y, 6, { speed: 150, life: 0.3, size: 2.6, colors: enemyTarget ? ['#fff6d8', ...ART.spark] : ['#fff0d0', '#ffd77a'], gravity: 300 });
    spawn(m, 'ring', x, y, { size: 12, width: 2, life: 0.16, color: 'rgba(255,245,220,.85)', gravity: 0 });
  }
  function coreHit(m, x) {
    burst(m, 'chip', x, -30, 7, { speed: 150, spread: Math.PI * 1.2, dir: -Math.PI / 2, life: 0.65, size: 3.2, color: ART.woodChip, gravity: 320, jitter: 16 });
    burst(m, 'spark', x, -36, 3, { speed: 130, life: 0.28, size: 2.4, colors: ART.spark, gravity: 200, jitter: 10 });
    burst(m, 'dust', x, -6, 4, { speed: 60, spread: Math.PI, dir: -Math.PI / 2, life: 0.6, size: 4, color: ART.dust, gravity: 30, jitter: 16 });
  }
  function unitDeath(m, x) {
    burst(m, 'dust', x, -2, 9, { speed: 70, spread: Math.PI * 0.9, dir: -Math.PI / 2, life: 0.7, size: 4.5, color: ART.dust, gravity: 30, jitter: 18 });
  }
  function heroKill(m, x, gold) {
    burst(m, 'spark', x, -24, 6, { speed: 100, life: 0.4, size: 2.4, colors: ART.spark });
    if (gold) floater(m, x, -46, `+${gold}`, ART.hero.gold);
  }
  function impact(m, x) {
    burst(m, 'spark', x, -30, 4, { speed: 90, life: 0.3, size: 2.2, colors: ART.spark });
  }
  function structureDown(m, x) {
    burst(m, 'chip', x, -20, 10, { speed: 140, spread: Math.PI * 1.4, dir: -Math.PI / 2, life: 0.7, size: 3.2, color: ART.woodChip, gravity: 320, jitter: 12 });
    burst(m, 'dust', x, -4, 8, { speed: 80, spread: Math.PI, dir: -Math.PI / 2, life: 0.8, size: 5, color: ART.dust, gravity: 30, jitter: 14 });
  }

  // --- раунд 15 (И2): «Залп» — падающие снаряды и метка участка ----------
  // Логика снарядов — entities.js (launchVolley/updateVolley), здесь только
  // рисунок: камень/стрела/ядро по эпохе стреляющего, полёт сверху по
  // диагонали с ускорением, короткий след; под участком — пульсирующая
  // метка-«тень», чтобы было видно, куда ляжет град.
  // Раунд 15 (И6): залп «плотный и зрелищный». Вид — по эпохе стреляющего
  // (ART.volley): огненные камни с искрами / горящие стрелы / ядра с
  // дымным следом. У каждого снаряда — трассер из трёх слоёв (широкое
  // свечение, середина, яркое ядро) по точкам той же траектории, и тень на
  // земле, которая растёт и темнеет к моменту удара. Частиц в полёте нет —
  // только штрихи; частицы рождаются в volleyImpact (≈12 на снаряд).
  // SHELL_K — снаряды в масштабе крупного плана фигур (VIEW.fig × rigScale):
  // при 1.0 камни и стрелы терялись рядом с юнитами («горсть камешков»).
  const TRAIL_STEPS = 6, TRAIL_DP = 0.07, SHELL_K = 1.7;
  function volleyPos(s, p, groundY) {
    return [s.sx + (s.x - s.sx) * p, groundY + s.sy * (1 - p * p)];
  }
  function drawVolley(ctx, world, groundY) {
    const z = world.volleyZone;
    const V = ART.volley;
    if (z) {
      const k = Math.min(1, z.t / 0.15) * Math.max(0, 1 - Math.max(0, z.t - (z.life - 0.3)) / 0.3);
      ctx.save();
      ctx.globalAlpha = 0.3 * k;
      ctx.fillStyle = V.shadow;
      ctx.beginPath(); ctx.ellipse(z.x, groundY + 2, z.w / 2, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.7 * k;
      ctx.strokeStyle = ART.spark[1]; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.ellipse(z.x, groundY + 2, z.w / 2, 7, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (!world.volleyShells || !world.volleyShells.length) return;
    const now = performance.now();
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // тени на земле — отдельным проходом, под снарядами
    ctx.fillStyle = V.shadow;
    for (const s of world.volleyShells) {
      if (s.delay > 0.25) continue;
      const p = s.delay > 0 ? 0 : Math.min(1, s.t / s.fall);
      ctx.globalAlpha = 0.25 + 0.75 * p;
      const r = 3 + p * (s.kind === 'ball' ? 9 : 7);
      ctx.beginPath(); ctx.ellipse(s.x, groundY + 1, r, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    }
    const pts = [];
    for (const s of world.volleyShells) {
      if (s.delay > 0) continue;
      const pal = V[s.kind] || V.stone;
      const p = Math.min(1, s.t / s.fall);
      pts.length = 0;
      for (let i = 0; i < TRAIL_STEPS; i++) pts.push(volleyPos(s, Math.max(0, p - i * TRAIL_DP), groundY));
      const [x, y] = pts[0];
      const ang = Math.atan2(-s.sy * 2 * p, s.x - s.sx);
      // трассер: широкое свечение по всей длине, середина, ядро — короче
      const ball = s.kind === 'ball', arrow = s.kind === 'arrow';
      const layers = ball
        ? [[TRAIL_STEPS, 13, 0.3, pal.smoke], [4, 7, 0.5, pal.smoke], [2, 3, 0.85, pal.trail + '.9)']]
        : [[TRAIL_STEPS, arrow ? 7 : 12, 0.32, pal.trail + '.55)'], [4, arrow ? 3.6 : 6, 0.65, pal.trail + '.85)'], [3, arrow ? 1.6 : 2.8, 0.95, pal.fireHi]];
      for (const [n, w, a, col] of layers) {
        ctx.globalAlpha = a;
        ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const fl = 0.75 + 0.25 * Math.sin(now / 45 + s.x);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(SHELL_K, SHELL_K);
      if (arrow) {
        ctx.rotate(ang);
        ctx.strokeStyle = pal.rim; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(9, 0); ctx.stroke();
        ctx.strokeStyle = pal.core; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(9, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(-9.5, -3.4); ctx.moveTo(-13, 0); ctx.lineTo(-9.5, 3.4); ctx.stroke();
        // пылающая пакля у наконечника
        ctx.fillStyle = pal.fire; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.ellipse(5, 0, 5.5 * fl, 3.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = pal.fireHi; ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.ellipse(6, 0, 2.6, 1.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = pal.rim;
        ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(8.5, -2.6); ctx.lineTo(8.5, 2.6); ctx.closePath(); ctx.fill();
      } else if (ball) {
        ctx.fillStyle = pal.core; ctx.strokeStyle = pal.rim; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,240,210,.35)';
        ctx.beginPath(); ctx.arc(-2, -2, 2, 0, Math.PI * 2); ctx.fill();
        // горящий запал бомбы-ядра
        ctx.fillStyle = pal.fire; ctx.globalAlpha = fl;
        ctx.beginPath(); ctx.arc(-Math.cos(ang) * 6.5, -Math.sin(ang) * 6.5, 2.6 * fl, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        // огненный камень: пламя-корона, сам камень, светлая сердцевина
        // пламя «кометой» назад по траектории + ореол вокруг камня
        ctx.save(); ctx.rotate(ang);
        ctx.fillStyle = pal.fire; ctx.globalAlpha = 0.75;
        ctx.beginPath(); ctx.ellipse(-6 * fl, 0, 12 * fl, 5.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = pal.fireHi; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.ellipse(-3, 0, 7 * fl, 3.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = pal.fire; ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.arc(0, 0, 8 * fl, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.rotate(p * Math.PI * 3);
        ctx.scale(1.35, 1.35);
        ctx.fillStyle = pal.core; ctx.strokeStyle = pal.rim; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-3.5, -1); ctx.lineTo(-1, -3.5); ctx.lineTo(3, -2.5); ctx.lineTo(3.5, 1.5); ctx.lineTo(0.5, 3.5); ctx.lineTo(-3, 2);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = pal.fireHi;
        ctx.beginPath(); ctx.arc(-0.6, -0.6, 1.3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  // Удар снаряда залпа: вспышка, кольцо по земле, пыль и по эпохе —
  // осколки камня с углями / искры от стрел / взрыв ядра с дымом.
  // ≈12 частиц на снаряд (16 снарядов за 0.9 с ≈ 190) — в пределах CAP.
  function volleyImpact(m, x, kind) {
    const pal = ART.volley[kind] || ART.volley.stone;
    const ball = kind === 'ball', arrow = kind === 'arrow';
    spawn(m, 'flash', x, ball ? -12 : -6, { size: ball ? 40 : arrow ? 20 : 28, life: ball ? 0.22 : 0.16, color: ball ? pal.fireHi : pal.trail + '.95)', gravity: 0 });
    if (ball) spawn(m, 'flash', x, -18, { size: 62, life: 0.32, color: pal.fire, gravity: 0 }); // огненный шар взрыва
    spawn(m, 'ring', x, -2, { size: ball ? 60 : 34, width: ball ? 4 : 2.5, life: ball ? 0.35 : 0.24, color: ball ? pal.fireHi : pal.trail + '.8)', gravity: 0 });
    burst(m, 'dust', x, -3, ball ? 5 : 4, { speed: ball ? 130 : 80, spread: Math.PI * 0.9, dir: -Math.PI / 2, life: 0.65, size: ball ? 7 : 5, color: ART.dust, gravity: 40, jitter: 10 });
    if (ball) {
      burst(m, 'spark', x, -8, 4, { speed: 230, spread: Math.PI * 0.9, dir: -Math.PI / 2, life: 0.4, size: 2.8, colors: [pal.fireHi, pal.fire, ART.spark[2]], gravity: 320 });
      smokePuff(m, x, -14, 0.8);
    } else if (arrow) {
      burst(m, 'spark', x, -4, 4, { speed: 140, spread: Math.PI * 0.8, dir: -Math.PI / 2, life: 0.35, size: 2.4, colors: [pal.fireHi, pal.fire], gravity: 300 });
      burst(m, 'ember', x, -6, 2, { speed: 40, spread: Math.PI * 0.6, dir: -Math.PI / 2, life: 0.7, size: 2, colors: [pal.fire, pal.fireHi], gravity: 0, jitter: 6 });
    } else {
      burst(m, 'chip', x, -4, 3, { speed: 150, spread: Math.PI * 0.8, dir: -Math.PI / 2, life: 0.5, size: 2.6, colors: [pal.core, pal.rim], gravity: 320 });
      burst(m, 'ember', x, -6, 3, { speed: 70, spread: Math.PI * 0.8, dir: -Math.PI / 2, life: 0.7, size: 2.2, colors: [pal.fire, pal.fireHi], gravity: 0, jitter: 6 });
    }
  }
  // Смена эпохи: ударная волна от крепости — два кольца, вспышка, искры и
  // угли вверх. gold=true — своя сторона (золото героя), иначе тёмно-красная.
  function ageUp(m, x, own) {
    const col = own ? ART.hero.gold : ART.enemy.eliteOutline;
    const glow = own ? ART.hero.goldGlow : ART.enemy.eliteGlow;
    spawn(m, 'ring', x, -8, { size: own ? 420 : 200, width: 10, life: own ? 1.0 : 0.7, color: col, glow, gravity: 0 });
    spawn(m, 'ring', x, -8, { size: own ? 260 : 120, width: 5, life: 0.75, color: own ? ART.hero.goldHi : col, gravity: 0 });
    spawn(m, 'flash', x, -50, { size: own ? 120 : 60, life: 0.45, color: own ? 'rgba(255,240,190,.95)' : 'rgba(200,60,30,.7)', gravity: 0 });
    burst(m, 'spark', x, -50, own ? 36 : 16, { speed: 260, life: 0.8, size: 3.4, colors: ART.spark, lift: 60 });
    burst(m, 'ember', x, -40, own ? 26 : 10, { speed: 70, spread: Math.PI * 0.8, dir: -Math.PI / 2, life: 1.4, size: 2.4, colors: ART.spark, gravity: 0, jitter: 60 });
  }

  // Раунд 15 (И6): «переодевание» юнита при смене эпохи — золотое кольцо
  // у ног и пара искр вверх (≈4 частицы на юнита). own=false — красное.
  function dressUp(m, x, own) {
    spawn(m, 'ring', x, -3, { size: 26, width: 2.5, life: 0.45, color: own ? ART.hero.goldHi : ART.enemy.eliteOutline, gravity: 0 });
    burst(m, 'spark', x, -30, 3, { speed: 120, spread: Math.PI * 0.7, dir: -Math.PI / 2, life: 0.45, size: 2.4, colors: ART.spark, gravity: 120, jitter: 10 });
  }
  // Перестройка крепости: пыль и щепа/камень по фасаду (x0..x1 в мире).
  function fortRebuild(m, x0, x1, age) {
    const cols = age ? [age.woodDark, age.woodLight, age.stone] : [ART.woodChip];
    for (let i = 0; i < 5; i++) {
      const x = x0 + (x1 - x0) * (i + 0.5) / 5;
      burst(m, 'dust', x, -6, 4, { speed: 90, spread: Math.PI * 0.9, dir: -Math.PI / 2, life: 1.0, size: 7, color: ART.dust, gravity: 10, jitter: 14 });
      burst(m, 'chip', x, -50, 2, { speed: 140, spread: Math.PI, dir: -Math.PI / 2, life: 0.8, size: 3, colors: cols, gravity: 380, jitter: 10 });
    }
  }

  return {
    dressUp, fortRebuild, // раунд 15 (И6)
    spawn, burst, update, draw, floater, drawProjectile, heroSpecial, cry, pickaxe, meleeHit, coreHit, unitDeath, heroKill, impact, structureDown, drawVolley, volleyImpact, ageUp,
    damageNumber, heroHit, fortressDestroyed, fortressAftershock, smokePuff, // раунд 15 (И4)
  };
})();
