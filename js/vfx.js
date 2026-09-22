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
    }
    m.particles = m.particles.filter(p => p.age < p.life);
    if (m.floaters) {
      for (const f of m.floaters) f.age += dt;
      m.floaters = m.floaters.filter(f => f.age < f.life);
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
      }
    }
    ctx.globalAlpha = 1;
    if (m.floaters && m.floaters.length) {
      ctx.save();
      ctx.font = "bold 13px 'Lilita One', 'Fredoka', sans-serif";
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
  function meleeHit(m, x, y, enemyTarget) {
    burst(m, 'spark', x, y, 4, { speed: 110, life: 0.3, size: 2.4, colors: enemyTarget ? ART.spark : ['#fff0d0', '#ffd77a'] });
  }
  function coreHit(m, x) {
    burst(m, 'chip', x, -30, 6, { speed: 130, spread: Math.PI * 1.2, dir: -Math.PI / 2, life: 0.6, size: 3, color: ART.woodChip, gravity: 320, jitter: 16 });
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

  return { spawn, burst, update, draw, floater, drawProjectile, heroSpecial, cry, pickaxe, meleeHit, coreHit, unitDeath, heroKill, impact, structureDown };
})();
