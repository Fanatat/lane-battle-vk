/*
 * dev.js — панель отладки поверх сцены. Скрыта по умолчанию, тоггл клавишей D.
 * Ползунок на каждое число из balance.json, рестарт боя, живая статистика,
 * копирование текущего balance.json.
 */
(function () {
  'use strict';

  var STYLE = '' +
    '#devPanel{position:fixed;top:0;right:0;bottom:0;width:320px;max-width:88vw;' +
    'background:rgba(16,18,24,0.96);color:#eee;font:12px/1.4 system-ui,sans-serif;' +
    'overflow-y:auto;z-index:50;padding:10px;box-sizing:border-box;' +
    'border-left:1px solid #333;}' +
    '#devPanel h2{font-size:13px;margin:14px 0 6px;color:#3fa7ff;border-top:1px solid #2a2e38;padding-top:8px;}' +
    '#devPanel h2:first-child{margin-top:0;border-top:none;padding-top:0;}' +
    '#devPanel .row{margin:6px 0;}' +
    '#devPanel label{display:flex;justify-content:space-between;gap:6px;margin-bottom:2px;color:#ccc;}' +
    '#devPanel input[type=range]{width:100%;}' +
    '#devPanel .val{font-variant-numeric:tabular-nums;color:#5fd15f;}' +
    '#devPanel .stats div{display:flex;justify-content:space-between;padding:1px 0;}' +
    '#devPanel button{width:100%;margin:4px 0;padding:8px;border:none;border-radius:8px;' +
    'background:#3fa7ff;color:#06121e;font-weight:700;cursor:pointer;}' +
    '#devPanel button.secondary{background:#5fd15f;}' +
    '#devPanel .hint{color:#888;font-size:11px;margin-top:4px;}';

  var styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  var panel = document.getElementById('devPanel');
  var visible = false;

  function waitForGame() {
    if (window.Game && window.Game.getBalance()) {
      buildPanel();
    } else {
      setTimeout(waitForGame, 50);
    }
  }

  function buildPanel() {
    var balance = window.Game.getBalance();

    panel.innerHTML = '';

    var statsBox = document.createElement('div');
    statsBox.className = 'stats';
    statsBox.innerHTML =
      '<h2>Статистика (живая)</h2>' +
      '<div><span>Время боя</span><span id="devTime">0</span></div>' +
      '<div><span>Заспавнено</span><span id="devSpawned">0</span></div>' +
      '<div><span>Убито</span><span id="devKilled">0</span></div>' +
      '<div><span>DPS игрока</span><span id="devDps">0</span></div>' +
      '<div><span>Еда</span><span id="devFood">0</span></div>' +
      '<h2>Последний рубеж (ТЗ №06)</h2>' +
      '<div><span>Точка подкрепления</span><span id="devReinforceOffset">0</span></div>' +
      '<div><span>Радиус залпа базы</span><span id="devDefenseRange">0</span></div>' +
      '<div><span>Мин.HP базы игрока</span><span id="devMinPlayerHp">0</span></div>' +
      '<div><span>Мин.HP базы врага</span><span id="devMinEnemyHp">0</span></div>' +
      '<h2>Геометрия и вариативность (ТЗ №07)</h2>' +
      '<div><span>Разрешение канваса</span><span id="devResolution">0</span></div>' +
      '<div><span>Логическая полоса</span><span id="devLaneLogical">0</span></div>' +
      '<div><span>px на 1 лог.ед.</span><span id="devPxPerLogical">0</span></div>' +
      '<div><span>Джиттер</span><span id="devJitter">0</span></div>' +
      '<h2>Кампания (ТЗ №08)</h2>' +
      '<div><span>Битва</span><span id="devBattle">0</span></div>' +
      '<div><span>Трофеи</span><span id="devTrophies">0</span></div>' +
      '<div><span>B / C открыты</span><span id="devUnlocks">0</span></div>' +
      '<div><span>Уровни апгрейдов</span><span id="devLevels">0</span></div>';
    panel.appendChild(statsBox);

    var controlsBox = document.createElement('div');
    controlsBox.innerHTML = '<h2>Управление</h2>';
    var restartBtn = document.createElement('button');
    restartBtn.textContent = 'Рестарт боя';
    restartBtn.onclick = function () { window.Game.restart(); };
    controlsBox.appendChild(restartBtn);

    var resetCampaignBtn = document.createElement('button');
    resetCampaignBtn.className = 'secondary';
    resetCampaignBtn.textContent = 'Сбросить кампанию (битва 1)';
    resetCampaignBtn.onclick = function () { window.Game.resetCampaign(); };
    controlsBox.appendChild(resetCampaignBtn);

    var copyBtn = document.createElement('button');
    copyBtn.className = 'secondary';
    copyBtn.textContent = 'Скопировать текущий balance.json';
    copyBtn.onclick = function () { copyBalance(balance, copyBtn); };
    controlsBox.appendChild(copyBtn);

    var hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'D — скрыть/показать панель. Изменения чисел применяются сразу; для базы/еды жми «Рестарт боя».';
    controlsBox.appendChild(hint);
    panel.appendChild(controlsBox);

    // ТЗ №07, блок 1: дистанции — логические (доля lane_length_logical),
    // не зависят от разрешения — показываем как есть из balance.json, без
    // пересчёта в px (иначе разойдёмся с движком, который px вообще не читает).
    document.getElementById('devReinforceOffset').textContent = balance.geometry.reinforce_offset_logical + ' лог.ед.';
    document.getElementById('devDefenseRange').textContent =
      (balance.base_defense ? balance.base_defense.range_logical + ' лог.ед.' : '—');

    var slidersBox = document.createElement('div');
    slidersBox.appendChild(sectionTitle('balance.json'));
    buildSliders(balance, [], slidersBox);
    panel.appendChild(slidersBox);

    startStatsLoop();
  }

  function sectionTitle(text) {
    var h = document.createElement('h2');
    h.textContent = text;
    return h;
  }

  var SKIP_KEYS = { _comment: true, label: true, role: true, color: true, type: true };

  function buildSliders(node, path, container) {
    Object.keys(node).forEach(function (key) {
      if (SKIP_KEYS[key]) return;
      var value = node[key];
      var childPath = path.concat(key);

      if (typeof value === 'number') {
        container.appendChild(makeSlider(node, key, childPath.join('.')));
        return;
      }
      if (Array.isArray(value)) {
        if (value.every(function (v) { return typeof v === 'number'; })) {
          var wrap = document.createElement('div');
          wrap.appendChild(sectionTitle(childPath.join('.')));
          value.forEach(function (_, idx) {
            wrap.appendChild(makeArraySlider(value, idx, childPath.join('.') + '[' + idx + ']'));
          });
          container.appendChild(wrap);
        } else {
          var arrWrap = document.createElement('div');
          arrWrap.appendChild(sectionTitle(childPath.join('.')));
          value.forEach(function (item, idx) {
            if (item && typeof item === 'object') {
              var itemWrap = document.createElement('div');
              itemWrap.style.paddingLeft = '8px';
              itemWrap.style.borderLeft = '2px solid #2a2e38';
              itemWrap.style.marginBottom = '6px';
              var label = document.createElement('div');
              label.className = 'hint';
              label.textContent = '#' + idx + (item.type ? ' (' + item.type + ')' : '');
              itemWrap.appendChild(label);
              buildSliders(item, childPath.concat(idx), itemWrap);
              arrWrap.appendChild(itemWrap);
            }
          });
          container.appendChild(arrWrap);
        }
        return;
      }
      if (value && typeof value === 'object') {
        var box = document.createElement('div');
        box.appendChild(sectionTitle(childPath.join('.')));
        buildSliders(value, childPath, box);
        container.appendChild(box);
        return;
      }
    });
  }

  function sliderRange(key, value) {
    if (key === 'unit_height_screen_fraction') {
      return { min: 0.125, max: 0.2, step: 0.005 }; // 1/8 экрана — жёсткий минимум из ТЗ
    }
    var abs = Math.abs(value);
    var step = abs === 0 ? 0.1 : (abs < 2 ? 0.01 : (abs < 20 ? 0.1 : 1));
    var max = abs === 0 ? 10 : Math.max(abs * 3, abs + 10);
    return { min: 0, max: round2(max), step: step };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function makeSlider(obj, key, pathLabel) {
    var value = obj[key];
    var range = sliderRange(key, value);
    var row = document.createElement('div');
    row.className = 'row';

    var label = document.createElement('label');
    var nameSpan = document.createElement('span');
    nameSpan.textContent = pathLabel;
    var valSpan = document.createElement('span');
    valSpan.className = 'val';
    valSpan.textContent = value;
    label.appendChild(nameSpan);
    label.appendChild(valSpan);

    var input = document.createElement('input');
    input.type = 'range';
    input.min = range.min;
    input.max = range.max;
    input.step = range.step;
    input.value = value;
    input.oninput = function () {
      var v = parseFloat(input.value);
      obj[key] = v;
      valSpan.textContent = v;
    };

    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  function makeArraySlider(arr, idx, pathLabel) {
    var value = arr[idx];
    var range = sliderRange(pathLabel, value);
    var row = document.createElement('div');
    row.className = 'row';

    var label = document.createElement('label');
    var nameSpan = document.createElement('span');
    nameSpan.textContent = pathLabel;
    var valSpan = document.createElement('span');
    valSpan.className = 'val';
    valSpan.textContent = value;
    label.appendChild(nameSpan);
    label.appendChild(valSpan);

    var input = document.createElement('input');
    input.type = 'range';
    input.min = range.min;
    input.max = range.max;
    input.step = range.step;
    input.value = value;
    input.oninput = function () {
      var v = parseFloat(input.value);
      arr[idx] = v;
      valSpan.textContent = v;
    };

    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  function copyBalance(balance, btn) {
    var text = JSON.stringify(balance, null, 2);
    var done = function (ok) {
      var original = 'Скопировать текущий balance.json';
      btn.textContent = ok ? 'Скопировано!' : 'Не удалось скопировать';
      setTimeout(function () { btn.textContent = original; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    done(ok);
  }

  var statsTimer = null;
  function startStatsLoop() {
    if (statsTimer) return;
    statsTimer = setInterval(function () {
      if (!visible) return;
      var s = window.Game.getState();
      var devTime = document.getElementById('devTime');
      if (!devTime || !s) return; // ТЗ №09: на экране меню/после выхода из боя движка ещё/уже нет
      devTime.textContent = s.timeElapsed.toFixed(1) + ' с';
      document.getElementById('devSpawned').textContent = s.spawnedCount;
      document.getElementById('devKilled').textContent = s.killedCount;
      document.getElementById('devDps').textContent = Math.round(s.dpsLastSecond);
      document.getElementById('devFood').textContent = Math.floor(s.food) + ' / ' + s.foodCap;

      var layout = window.Game.getLayout();
      document.getElementById('devMinPlayerHp').textContent =
        (s.minPlayerBaseHp / s.playerBaseMaxHp * 100).toFixed(1) + '%';
      document.getElementById('devMinEnemyHp').textContent =
        (s.minEnemyBaseHp / s.enemyBaseMaxHp * 100).toFixed(1) + '%';

      document.getElementById('devResolution').textContent = Math.round(layout.w) + '×' + Math.round(layout.h);
      document.getElementById('devLaneLogical').textContent = '0 — ' + layout.laneLengthLogical;
      document.getElementById('devPxPerLogical').textContent = layout.pxPerLogical.toFixed(2) + ' px';
      document.getElementById('devJitter').textContent = window.Game.isDeterministic()
        ? 'выключен (deterministic), сид ' + window.Game.getSeed()
        : 'включён, сид ' + window.Game.getSeed();

      var cs = window.Game.getCampaignState();
      document.getElementById('devBattle').textContent = cs.battleNumber;
      document.getElementById('devTrophies').textContent = cs.trophies;
      document.getElementById('devUnlocks').textContent =
        (cs.unlocked.unlock_B ? 'да' : 'нет') + ' / ' + (cs.unlocked.unlock_C ? 'да' : 'нет');
      document.getElementById('devLevels').textContent = Object.keys(cs.levels).map(function (k) {
        return k + '=' + cs.levels[k];
      }).join(', ');
    }, 150);
  }

  function setVisible(v) {
    visible = v;
    panel.classList.toggle('hidden', !visible);
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'd' || e.key === 'D') {
      if (!window.Game || !window.Game.getBalance()) return;
      setVisible(!visible);
    }
  });

  setVisible(false);
  waitForGame();
})();
