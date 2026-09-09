// Все SFX — синтез через WebAudio, без внешних сэмплов (см. ГДД, «Аудио»).
'use strict';

const SFX = (() => {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function env(gainNode, t0, attack, hold, release, peak) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.setValueAtTime(peak, t0 + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  }

  function tone({ freq = 440, freq2 = null, dur = 0.15, type = 'sine', peak = 0.5, delay = 0 }) {
    if (muted) return;
    const c = ensure();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freq2 !== null) osc.frequency.exponentialRampToValueAtTime(freq2, t0 + dur);
    env(gain, t0, 0.005, dur * 0.3, dur * 0.7, peak);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst({ dur = 0.12, peak = 0.4, filterFreq = 1200, delay = 0 }) {
    if (muted) return;
    const c = ensure();
    const t0 = c.currentTime + delay;
    const bufferSize = Math.floor(c.sampleRate * dur);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    env(gain, t0, 0.002, dur * 0.2, dur * 0.8, peak);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    setMuted(v) { muted = v; },
    isMuted() { return muted; },
    unlock() { ensure(); },
    // роль атакующего задаёт тембр удара — тяжёлый глухой, копьё резкое,
    // герой отдельно узнаваем (см. ГДД, «Аудио: звук на все события мира»)
    hitMelee(role) {
      const cfg = {
        melee: { filterFreq: 900, dur: 0.09 },
        spear: { filterFreq: 1300, dur: 0.07 },
        heavy: { filterFreq: 480, dur: 0.16 },
        hero: { filterFreq: 750, dur: 0.11 },
        hero_special: { filterFreq: 550, dur: 0.15 },
      }[role] || { filterFreq: 900, dur: 0.09 };
      noiseBurst({ dur: cfg.dur, peak: 0.5, filterFreq: cfg.filterFreq });
    },
    hitRanged() { tone({ freq: 900, freq2: 300, dur: 0.08, type: 'triangle', peak: 0.3 }); },
    shoot() { tone({ freq: 500, freq2: 700, dur: 0.08, type: 'sine', peak: 0.2 }); },
    death() { noiseBurst({ dur: 0.22, peak: 0.45, filterFreq: 400 }); tone({ freq: 220, freq2: 80, dur: 0.25, type: 'sawtooth', peak: 0.2, delay: 0.02 }); },
    spawn() { tone({ freq: 300, freq2: 500, dur: 0.12, type: 'square', peak: 0.18 }); },
    buyDenied() { tone({ freq: 160, dur: 0.1, type: 'square', peak: 0.25 }); },
    upgrade() { tone({ freq: 400, freq2: 900, dur: 0.25, type: 'sine', peak: 0.3 }); tone({ freq: 600, freq2: 1200, dur: 0.25, type: 'sine', peak: 0.2, delay: 0.06 }); },
    mine() { noiseBurst({ dur: 0.06, peak: 0.35, filterFreq: 2200 }); tone({ freq: 1400, freq2: 1900, dur: 0.12, type: 'triangle', peak: 0.25, delay: 0.05 }); },
    heroSpecial() { noiseBurst({ dur: 0.3, peak: 0.5, filterFreq: 600 }); tone({ freq: 150, freq2: 60, dur: 0.35, type: 'sawtooth', peak: 0.3 }); },
    heroHurt() { tone({ freq: 250, freq2: 100, dur: 0.15, type: 'square', peak: 0.3 }); },
    // Отдельный, более тревожный сигнал именно на смерть героя (не просто
    // урон) — стадия 2, баг-репорт: игрок должен заметить это, даже глядя
    // в другой конец арены, не только по надписи в углу HUD.
    heroDown() {
      noiseBurst({ dur: 0.35, peak: 0.5, filterFreq: 250 });
      [220, 160, 110].forEach((f, i) => tone({ freq: f, dur: 0.4, type: 'sawtooth', peak: 0.3, delay: i * 0.14 }));
    },
    click() { tone({ freq: 700, dur: 0.05, type: 'sine', peak: 0.2 }); },
    coreHit() { noiseBurst({ dur: 0.18, peak: 0.4, filterFreq: 300 }); },
  };
})();

// Музыка (раунд 10) — реальные mp3-треки (Suno), процедурный WebAudio-луп
// раунда 5 полностью убран (основатель прослушал — «очень посредственно»,
// см. КОНЦЕПТ_ГДД.md). Канал НЕЗАВИСИМ от SFX: свой мьют, свой источник
// звука (<audio>, не WebAudio-осцилляторы) — «никогда не смешивать» было
// прямым требованием основателя. Кроссфейд — ручной fade двух <audio>
// одновременно, без Web Audio graph: для двух перекрёстно затухающих
// mp3-файлов этого достаточно, не усложняем.
const MUSIC = (() => {
  let musicMuted = false;
  let baseVolume = 0.7;
  let unitVolumeMult = 1; // множитель от числа юнитов на поле (см. setUnitCount)
  let current = null; // { audio, trackId, fading }
  let endedCb = null;

  function trackMeta(trackId) {
    if (trackId === 'menu') return MENU_MUSIC_TRACK;
    return MUSIC_TRACKS[trackId] || EVENT_TRACKS[trackId];
  }
  function effectiveVolume() {
    return musicMuted ? 0 : baseVolume * unitVolumeMult;
  }
  // Несколько fadeTo на один и тот же <audio> одновременно (например,
  // setUnitCount дёргается почти каждый кадр, пока юниты гибнут пачками, и
  // накладывается на ещё не завершённый кроссфейд) писали в audio.volume
  // из разных независимых rAF-циклов с разными опорными start/t0 —
  // экстраполяция от рассинхронизированных точек иногда даёт волну чуть
  // ниже 0, а `audio.volume` бросает исключение на значении вне [0,1]
  // (баг-репорт живого QA, раунд 10). Fix — счётчик поколений на элементе:
  // новый fadeTo отменяет предыдущий цикл того же <audio>, плюс clamp на
  // случай остаточной погрешности плавающей точки.
  function fadeTo(audio, target, dur, onDone) {
    const gen = (audio._fadeGen || 0) + 1;
    audio._fadeGen = gen;
    const start = audio.volume, t0 = performance.now();
    (function step(now) {
      if (audio._fadeGen !== gen) return; // отменён более новым fadeTo
      const p = dur <= 0 ? 1 : Math.min(1, (now - t0) / (dur * 1000));
      audio.volume = Math.max(0, Math.min(1, start + (target - start) * p));
      if (p < 1) requestAnimationFrame(step);
      else if (onDone) onDone();
    })(t0);
  }

  // Ретрай воспроизведения на первый реальный пользовательский жест —
  // браузер разрешает play() только после него (см. play() выше).
  function armResumeOnGesture(audio) {
    const retry = () => { audio.play().catch(() => {}); cleanup(); };
    function cleanup() {
      document.removeEventListener('pointerdown', retry, true);
      document.removeEventListener('keydown', retry, true);
    }
    document.addEventListener('pointerdown', retry, true);
    document.addEventListener('keydown', retry, true);
  }

  return {
    setMusicMuted(v) {
      musicMuted = v;
      if (current) fadeTo(current.audio, effectiveVolume(), 0.3);
    },
    isMusicMuted() { return musicMuted; },
    // Динамическая громкость от количества живых юнитов на поле (раунд 10,
    // MUSIC_MIX.unitsForMaxVolume/volumeBoostAtMaxUnits) — не режет резко,
    // применяется тем же fadeTo с коротким временем сглаживания.
    setUnitCount(n) {
      const frac = Math.max(0, Math.min(1, n / MUSIC_MIX.unitsForMaxVolume));
      const mult = 1 + frac * MUSIC_MIX.volumeBoostAtMaxUnits;
      if (Math.abs(mult - unitVolumeMult) < 0.01) return;
      unitVolumeMult = mult;
      if (current && !current.fading) fadeTo(current.audio, effectiveVolume(), 0.4);
    },
    play(trackId, opts = {}) {
      const meta = trackMeta(trackId);
      if (!meta) return;
      if (current && current.trackId === trackId && !opts.force) return;
      const dur = opts.instant ? 0.05 : MUSIC_MIX.crossfadeSec;
      const audio = new Audio(meta.file);
      audio.loop = trackId === 'menu'; // меню/пауза — простой луп, без плейлиста
      audio.volume = 0;
      audio.addEventListener('ended', () => { if (endedCb) endedCb(trackId); });
      // Автоплей до первого пользовательского жеста браузер молча блокирует
      // (`play()` реджектится, `audio.paused` остаётся true) — без ретрая
      // это означает, что музыка меню НИКОГДА не звучит игроку, который
      // сначала полистал меню/магазин, а не сразу нажал «Играть» (баг-репорт
      // живого QA, ночная правка). Регистрируем ретрай на первый же жест.
      const tryPlay = () => audio.play().catch(() => armResumeOnGesture(audio));
      tryPlay();
      fadeTo(audio, effectiveVolume(), dur);
      const old = current;
      current = { audio, trackId, fading: true };
      setTimeout(() => { if (current && current.audio === audio) current.fading = false; }, dur * 1000 + 50);
      if (old) fadeTo(old.audio, 0, dur, () => { old.audio.pause(); old.audio.src = ''; });
    },
    current() { return current ? current.trackId : null; },
    // Для живой диагностики (утренняя проверка баг-репортов) — реальное
    // состояние аудио-элемента, не только "назначенный" трек.
    debugState() {
      if (!current) return null;
      return { trackId: current.trackId, paused: current.audio.paused, volume: current.audio.volume, currentTime: current.audio.currentTime };
    },
    stop() { if (current) { current.audio.pause(); current = null; } },
    onEnded(cb) { endedCb = cb; },
    // Пауза/возобновление трека на время полноэкранной рекламы (требование
    // площадок — Яндекс п.4.7: звук и игровой процесс должны ставиться на
    // паузу при показе interstitial/rewarded video). Не трогает current —
    // трек продолжается с той же позиции, не перезапускается.
    pauseForAd() { if (current) current.audio.pause(); },
    resumeAfterAd() { if (current && current.audio.paused) current.audio.play().catch(() => {}); },
  };
})();
