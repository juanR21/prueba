/* Acuasmart Rural · lógica de la aplicación
   Pantallas: Predio, Monitoreo, Historial, Alertas.
   Requisitos cubiertos: RF03–RF07 y RNF04 (ver README). */
(function () {
  'use strict';

  var C = window.ACUA_CONFIG;
  var Sim = window.AcuaSim;
  var LS_KEY = 'acuasmart.v1';
  var RANK = { ok: 0, warn: 1, crit: 2 };
  var STATUS_TEXT = { ok: 'Óptimo', warn: 'Precaución', crit: 'Riesgo crítico' };
  var TAG_TEXT = { ok: 'Normal', warn: 'Precaución', crit: 'Crítico' };

  var ICONS = {
    od:   '<svg viewBox="0 0 24 24"><circle cx="9" cy="14" r="3"/><circle cx="16" cy="8" r="2"/><circle cx="17" cy="16" r="1.5"/></svg>',
    temp: '<svg viewBox="0 0 24 24"><path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z"/></svg>',
    ph:   '<svg viewBox="0 0 24 24"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>',
    flow: '<svg viewBox="0 0 24 24"><path d="M3 8c3 0 3 2 6 2s3-2 6-2 3 2 6 2M3 15c3 0 3 2 6 2s3-2 6-2 3 2 6 2"/></svg>'
  };

  var state = {
    profile: null,
    history: [],
    latest: null,
    lastSync: null,
    pending: [],          // lecturas guardadas en el nodo mientras no hay red (Store-and-Forward)
    online: true,
    hypoxia: false,
    status: {},           // último estado por variable
    alerts: [],
    activeVar: 'od',
    range: '24h',
    screen: 'predio',
    timer: null,
    toastTimer: null
  };

  /* ---------- Utilidades ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function hhmm(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function ddmm(t) { var d = new Date(t); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
  function fmt(key, v) { return Number(v).toFixed(C.vars[key].decimals); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function inRange(v, r) {
    return (r[0] == null || v >= r[0]) && (r[1] == null || v <= r[1]);
  }
  function ranges(key) { return C.species[state.profile.especie].ranges[key]; }
  function statusOf(key, v) {
    var r = ranges(key);
    if (inRange(v, r.ok)) return 'ok';
    if (inRange(v, r.warn)) return 'warn';
    return 'crit';
  }
  function directionOf(key, v) {
    var ok = ranges(key).ok;
    return (ok[0] != null && v < ok[0]) ? 'low' : 'high';
  }
  function worst(map) {
    var w = 'ok';
    Object.keys(map).forEach(function (k) { if (RANK[map[k]] > RANK[w]) w = map[k]; });
    return w;
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  /* ---------- Persistencia local (offline-first) ---------- */
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ profile: state.profile, alerts: state.alerts }));
    } catch (e) { /* almacenamiento no disponible: la app sigue funcionando */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* ---------- Recomendaciones preventivas (RF07) ---------- */
  function recommendations(key, dir) {
    var map = {
      od: {
        low: ['Aumentar la apertura de la compuerta de entrada en 25 % por 45 min.',
              'Limpiar sedimentos en la rejilla de la bocatoma.',
              'Suspender la ración de alimento hasta que el oxígeno se recupere.']
      },
      temp: {
        high: ['Aumentar el caudal de entrada para renovar el agua más fresca.',
               'Dar sombra al estanque en las horas de mayor sol.',
               'Suspender la ración de alimento en las horas de calor.'],
        low:  ['Reducir el recambio de agua en las horas más frías.',
               'Revisar que la fuente no esté recibiendo agua demasiado fría.']
      },
      ph: {
        low:  ['Hacer un recambio parcial de agua con la fuente habitual.',
               'Medir de nuevo con un equipo patrón antes de actuar.'],
        high: ['Hacer un recambio parcial de agua con la fuente habitual.',
               'Medir de nuevo con un equipo patrón antes de actuar.']
      },
      flow: {
        low:  ['Revisar la bocatoma: puede haber obstrucción por hojas o sedimento.',
               'Limpiar la rejilla y comprobar la apertura de la compuerta.'],
        high: ['Reducir la apertura de la compuerta para evitar desbordamientos.',
               'Revisar el estanque por arrastre de sólidos tras la lluvia.']
      }
    };
    return (map[key] && map[key][dir]) || ['Revisar el estanque y verificar la medición.'];
  }

  /* ---------- Alertas (RF06) ---------- */
  function evaluate(reading, silent) {
    Object.keys(C.vars).forEach(function (key) {
      var s = statusOf(key, reading[key]);
      var prev = state.status[key] || 'ok';

      if (s !== 'ok' && RANK[s] > RANK[prev]) {
        state.alerts.unshift({
          id: reading.t + '-' + key,
          t: reading.t,
          key: key,
          value: reading[key],
          status: s,
          dir: directionOf(key, reading[key]),
          limit: ranges(key).ok,
          resolved: false
        });
        if (state.alerts.length > C.maxAlerts) state.alerts.length = C.maxAlerts;
        if (!silent) toast((s === 'crit' ? 'Alerta crítica: ' : 'Precaución: ') + C.vars[key].label.toLowerCase());
      }
      if (s === 'ok' && prev !== 'ok') {
        state.alerts.forEach(function (a) { if (a.key === key) a.resolved = true; });
      }
      state.status[key] = s;
    });
    save();
  }

  /* ---------- Flujo de lecturas ---------- */
  function accept(reading, silent) {
    state.history.push(reading);
    if (state.history.length > C.maxHistoryPoints) state.history.shift();
    state.latest = reading;
    state.lastSync = reading.t;
    evaluate(reading, silent);
  }

  function tick() {
    if (!state.profile) return;
    var base = state.latest || state.history[state.history.length - 1];
    var reading = Sim.next(base, state.profile.especie, state.hypoxia);
    if (state.online) {
      accept(reading, false);
    } else {
      // Sin red: el nodo guarda localmente con sello de tiempo (RF02)
      state.pending.push(reading);
      state.latest = state.latest || base;
      // el generador sigue avanzando desde la última lectura del nodo
      state._nodeLast = reading;
    }
    renderAll();
  }

  // Cuando no hay red, la siguiente lectura debe partir de la última del nodo
  var originalNext = Sim.next;
  Sim.next = function (prev, sp, h) {
    var from = (!state.online && state._nodeLast) ? state._nodeLast : prev;
    return originalNext(from, sp, h);
  };

  function setOnline(on) {
    if (state.online === on) return;
    state.online = on;
    if (on) {
      var n = state.pending.length;
      var queue = state.pending.slice();
      state.pending = [];
      state._nodeLast = null;
      queue.forEach(function (r) { accept(r, true); });
      // alertas surgidas durante el corte se notifican ahora
      if (n) toast('Sincronizado: ' + n + ' lecturas enviadas a la nube');
      else toast('Conexión restablecida');
    } else {
      toast('Sin señal: el nodo guarda las lecturas');
    }
    renderAll();
  }

  /* ---------- Render: general ---------- */
  function renderChrome() {
    var net = $('#netBadge');
    net.textContent = state.online ? '4G' : 'Sin señal';
    net.className = 'net ' + (state.online ? 'net--on' : 'net--off');

    var banner = $('#offlineBanner');
    if (!state.online) {
      banner.hidden = false;
      banner.textContent = 'Sin conexión. Mostrando el último dato sincronizado a las ' + hhmm(state.lastSync || Date.now()) + '.';
    } else {
      banner.hidden = true;
    }

    var open = state.alerts.filter(function (a) { return !a.resolved; }).length;
    var badge = $('#navBadge');
    badge.hidden = open === 0;
    badge.textContent = open;
  }

  function renderMonitoreo() {
    if (!state.latest) return;
    var wrap = $('#cards');
    wrap.textContent = '';

    Object.keys(C.vars).forEach(function (key) {
      var v = state.latest[key];
      var s = statusOf(key, v);
      var dir = directionOf(key, v);
      var tag = s === 'ok' ? TAG_TEXT.ok : (dir === 'low' ? 'Bajo' : 'Alto') + ' · ' + TAG_TEXT[s].toLowerCase();

      var card = el('div', 'card');
      card.dataset.status = s;

      var name = el('div', 'card__name');
      name.innerHTML = ICONS[key];
      name.appendChild(el('span', null, C.vars[key].short));
      card.appendChild(name);

      var val = el('div', 'card__value', fmt(key, v));
      if (C.vars[key].unit) val.appendChild(el('span', 'card__unit', C.vars[key].unit));
      card.appendChild(val);

      card.appendChild(el('span', 'card__tag', tag));
      wrap.appendChild(card);
    });

    var overall = worst(state.status);
    var bar = $('#overall');
    bar.dataset.status = overall;
    $('#t-mon').textContent = STATUS_TEXT[overall];
    $('#syncInfo').textContent = (state.online ? 'Última sincronización: ' : 'Sin conexión desde: ') + hhmm(state.lastSync);

    $('#pendingInfo').textContent = state.pending.length
      ? 'El nodo tiene ' + state.pending.length + ' lecturas guardadas localmente, pendientes de enviar.'
      : '';
    $('#btnOffline').textContent = state.online ? 'Simular pérdida de señal' : 'Restablecer conexión';
    $('#btnHypoxia').disabled = state.hypoxia;
  }

  /* ---------- Render: historial (RF05) ---------- */
  var RANGE_MS = { '24h': 24 * 3600e3, '7d': 7 * 24 * 3600e3, '30d': 30 * 24 * 3600e3 };
  var RANGE_TITLE = { '24h': 'Evolución horaria', '7d': 'Evolución diaria (7 días)', '30d': 'Evolución diaria (30 días)' };

  function bucketize(data, t0, t1, n) {
    var size = (t1 - t0) / n;
    var sums = [], counts = [];
    for (var i = 0; i < n; i++) { sums.push(0); counts.push(0); }
    data.forEach(function (p) {
      var idx = Math.min(n - 1, Math.max(0, Math.floor((p.t - t0) / size)));
      sums[idx] += p.v; counts[idx]++;
    });
    var out = [];
    for (var j = 0; j < n; j++) {
      if (counts[j]) out.push({ t: t0 + size * (j + 0.5), v: sums[j] / counts[j] });
    }
    return out;
  }

  function renderHistorial() {
    if (!state.profile || !state.history.length) return;
    var key = state.activeVar;
    var def = C.vars[key];
    var r = ranges(key);
    var t1 = Date.now();
    var t0 = t1 - RANGE_MS[state.range];

    var raw = state.history
      .filter(function (p) { return p.t >= t0; })
      .map(function (p) { return { t: p.t, v: p[key] }; });
    if (!raw.length) return;

    var pts = bucketize(raw, t0, t1, state.range === '24h' ? 48 : 90);

    $('#chartTitle').textContent = RANGE_TITLE[state.range];
    $('#chartSub').textContent = def.label + (def.unit ? ' (' + def.unit + ')' : '') + ' · ' + C.species[state.profile.especie].name;
    $('#hisSub').textContent = (state.profile.vereda || 'Tu predio') + ' · Tendencias del estanque';

    // Escalas
    var W = 340, H = 200, L = 36, R = 10, T = 12, B = 26;
    var vals = pts.map(function (p) { return p.v; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (r.ok[0] != null) lo = Math.min(lo, r.ok[0]);
    if (r.ok[1] != null) hi = Math.max(hi, r.ok[1]);
    var span = (hi - lo) || 1;
    lo -= span * 0.1; hi += span * 0.1;
    function x(t) { return L + ((t - t0) / (t1 - t0)) * (W - L - R); }
    function y(v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); }

    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    function add(tag, attrs, text) {
      var n = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (text != null) n.textContent = text;
      svg.appendChild(n);
      return n;
    }

    // Rejilla horizontal y etiquetas del eje Y
    for (var g = 0; g <= 4; g++) {
      var gv = lo + ((hi - lo) * g) / 4;
      add('line', { x1: L, x2: W - R, y1: y(gv), y2: y(gv), 'class': 'grid' });
      add('text', { x: L - 6, y: y(gv) + 4, 'text-anchor': 'end' }, gv.toFixed(def.decimals > 0 ? 1 : 0));
    }
    // Etiquetas del eje X
    for (var k = 0; k <= 4; k++) {
      var tt = t0 + ((t1 - t0) * k) / 4;
      var label = state.range === '24h' ? hhmm(tt).slice(0, 2) + ' h' : ddmm(tt);
      add('text', { x: x(tt), y: H - 8, 'text-anchor': k === 0 ? 'start' : (k === 4 ? 'end' : 'middle') }, label);
    }

    // Límites permitidos
    if (r.ok[0] != null) {
      add('line', { x1: L, x2: W - R, y1: y(r.ok[0]), y2: y(r.ok[0]), 'class': 'limit' });
      add('text', { x: W - R, y: y(r.ok[0]) - 4, 'text-anchor': 'end', 'class': 'limit-label' }, 'Mínimo: ' + r.ok[0] + (def.unit ? ' ' + def.unit : ''));
    }
    if (r.ok[1] != null) {
      add('line', { x1: L, x2: W - R, y1: y(r.ok[1]), y2: y(r.ok[1]), 'class': 'limit' });
      add('text', { x: W - R, y: y(r.ok[1]) + 12, 'text-anchor': 'end', 'class': 'limit-label' }, 'Máximo: ' + r.ok[1] + (def.unit ? ' ' + def.unit : ''));
    }

    // Línea y área
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];
    add('path', { d: d + ' L' + x(last.t).toFixed(1) + ' ' + (H - B) + ' L' + x(pts[0].t).toFixed(1) + ' ' + (H - B) + ' Z', 'class': 'area' });
    add('path', { d: d, 'class': 'line' });
    add('circle', { cx: x(last.t), cy: y(last.v), r: 4.5, 'class': 'dot' });

    var chart = $('#chart');
    chart.textContent = '';
    chart.appendChild(svg);

    // Resumen analítico
    var rawVals = raw.map(function (p) { return p.v; });
    var mn = Math.min.apply(null, rawVals), mx = Math.max.apply(null, rawVals);
    var out = rawVals.filter(function (v) { return !inRange(v, r.ok); }).length;
    var pct = Math.round((out / rawVals.length) * 100);
    var worstS = 'ok';
    rawVals.forEach(function (v) { var s = statusOf(key, v); if (RANK[s] > RANK[worstS]) worstS = s; });

    var sum = $('#summary');
    sum.dataset.status = worstS;
    sum.textContent = '';
    sum.appendChild(el('p', 'summary__title',
      worstS === 'ok' ? def.label + ' en rango seguro'
        : (worstS === 'warn' ? def.label + ' con episodios de precaución' : def.label + ' con episodios críticos')));
    sum.appendChild(el('p', 'summary__line', 'Mín. ' + fmt(key, mn) + ' · Máx. ' + fmt(key, mx) + (def.unit ? ' ' + def.unit : '')));
    sum.appendChild(el('p', 'summary__line',
      out === 0 ? 'Sin lecturas fuera del rango normal en este periodo.'
        : pct + ' % de las lecturas estuvo fuera del rango normal.'));
  }

  /* ---------- Render: alertas ---------- */
  function renderAlertas() {
    var open = state.alerts.filter(function (a) { return !a.resolved; });
    var box = $('#activeAlert');
    box.textContent = '';

    $('#aleSub').textContent = open.length
      ? (state.profile ? state.profile.vereda + ' · ' : '') + open.length + (open.length === 1 ? ' alerta por atender' : ' alertas por atender')
      : 'Sin alertas por atender';

    if (!open.length) {
      var none = el('div', 'alert alert--none');
      none.appendChild(el('p', 'alert__tag', 'Todo en orden'));
      none.appendChild(el('p', 'alert__msg', 'Las cuatro variables están dentro del rango normal para tu especie.'));
      box.appendChild(none);
    } else {
      // la más grave y reciente
      var a = open.slice().sort(function (p, q) { return RANK[q.status] - RANK[p.status] || q.t - p.t; })[0];
      var def = C.vars[a.key];
      var card = el('div', 'alert' + (a.status === 'warn' ? ' alert--warn' : ''));
      card.appendChild(el('p', 'alert__tag', a.status === 'crit' ? 'ALERTA CRÍTICA' : 'PRECAUCIÓN'));
      card.appendChild(el('p', 'alert__msg', def.label + (a.dir === 'low' ? ' descendió a' : ' subió a')));
      card.appendChild(el('p', 'alert__big', fmt(a.key, a.value) + (def.unit ? ' ' + def.unit : '')));
      var lim = a.dir === 'low'
        ? 'Por debajo del mínimo de ' + a.limit[0] + (def.unit ? ' ' + def.unit : '')
        : 'Por encima del máximo de ' + a.limit[1] + (def.unit ? ' ' + def.unit : '');
      card.appendChild(el('p', 'alert__meta', hhmm(a.t) + ' · ' + lim));
      box.appendChild(card);

      var recs = el('div', 'recs');
      recs.appendChild(el('h3', 'section-title', 'Acciones recomendadas'));
      recommendations(a.key, a.dir).forEach(function (txt, i) {
        var r = el('div', 'rec');
        r.appendChild(el('p', 'rec__prio', 'Prioridad ' + (i + 1)));
        r.appendChild(el('p', 'rec__text', txt));
        recs.appendChild(r);
      });
      recs.appendChild(el('p', 'recs__note', 'Verifica el valor después de actuar.'));
      var go = el('button', 'btn', 'Ver monitoreo en tiempo real');
      go.type = 'button';
      go.addEventListener('click', function () { show('monitoreo'); });
      recs.appendChild(go);
      box.appendChild(recs);
    }

    var list = $('#alertList');
    list.textContent = '';
    if (!state.alerts.length) {
      list.appendChild(el('li', 'alist__empty', 'Todavía no se han emitido alertas.'));
    }
    state.alerts.forEach(function (a) {
      var def = C.vars[a.key];
      var li = el('li');
      li.dataset.status = a.status;
      li.dataset.resolved = String(a.resolved);
      li.appendChild(el('strong', null,
        def.label + (a.dir === 'low' ? ' bajo: ' : ' alto: ') + fmt(a.key, a.value) + (def.unit ? ' ' + def.unit : '')));
      li.appendChild(el('span', null,
        ddmm(a.t) + ' ' + hhmm(a.t) + ' · ' + (a.status === 'crit' ? 'Crítica' : 'Precaución') + (a.resolved ? ' · Resuelta' : '')));
      list.appendChild(li);
    });
  }

  function renderAll() {
    renderChrome();
    if (!state.profile) return;
    renderMonitoreo();
    if (state.screen === 'historial') renderHistorial();
    if (state.screen === 'alertas') renderAlertas();
  }

  /* ---------- Navegación ---------- */
  function show(name) {
    if (name !== 'predio' && !state.profile) {
      toast('Primero configura tu estanque');
      name = 'predio';
    }
    state.screen = name;
    $$('.screen').forEach(function (s) { s.hidden = s.id !== 'screen-' + name; });
    $$('.nav__btn').forEach(function (b) { b.classList.toggle('is-active', b.dataset.target === name); });
    var main = $('main');
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
    renderAll();
    if (name === 'historial') renderHistorial();
    if (name === 'alertas') renderAlertas();
  }

  /* ---------- Inicio de sesión de monitoreo ---------- */
  function startSession() {
    state.history = Sim.createHistory(state.profile.especie);
    state.latest = state.history[state.history.length - 1];
    state.lastSync = state.latest.t;
    state.pending = [];
    state.online = true;
    state.hypoxia = false;
    state._nodeLast = null;
    state.status = {};
    Object.keys(C.vars).forEach(function (k) { state.status[k] = statusOf(k, state.latest[k]); });
    clearInterval(state.timer);
    state.timer = setInterval(tick, C.tickMs);
  }

  function bindForm() {
    var form = $('#predioForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#productor').value.trim();
      var vereda = $('#vereda').value.trim();
      var nodo = $('#nodo').value.trim();
      var especie = form.elements.especie.value;
      var err = $('#formError');

      if (!name || !vereda || !nodo) {
        err.textContent = 'Completa el nombre, la vereda y el ID del nodo.';
        err.hidden = false;
        return;
      }
      if (!$('#consent').checked) {
        err.textContent = 'Para continuar, autoriza el tratamiento de tus datos.';
        err.hidden = false;
        return;
      }
      err.hidden = true;

      var changedSpecies = !state.profile || state.profile.especie !== especie;
      state.profile = { productor: name, vereda: vereda, especie: especie, nodo: nodo, consent: true };
      $('#nodoOk').hidden = false;
      $('#nodoOk').textContent = 'Nodo ' + nodo + ' sincronizado';

      if (changedSpecies || !state.history.length) {
        state.alerts = [];
        startSession();
      }
      save();
      toast('Estanque guardado');
      show('monitoreo');
    });
  }

  function bindControls() {
    $$('.nav__btn').forEach(function (b) {
      b.addEventListener('click', function () { show(b.dataset.target); });
    });

    var sel = $('#varSelect');
    Object.keys(C.vars).forEach(function (k) {
      var o = el('option', null, C.vars[k].label + (C.vars[k].unit ? ' ' + C.vars[k].unit : ''));
      o.value = k;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { state.activeVar = sel.value; renderHistorial(); });

    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        state.range = t.dataset.range;
        $$('.tab').forEach(function (x) {
          var on = x === t;
          x.classList.toggle('is-active', on);
          x.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        renderHistorial();
      });
    });

    $('#btnHypoxia').addEventListener('click', function () {
      state.hypoxia = true;
      toast('Simulando caída de oxígeno…');
      renderMonitoreo();
    });
    $('#btnOffline').addEventListener('click', function () { setOnline(!state.online); });
    $('#btnReset').addEventListener('click', function () {
      state.hypoxia = false;
      toast('Valores volviendo a la normalidad');
      renderMonitoreo();
    });
  }

  function updateClock() { $('#clock').textContent = hhmm(Date.now()); }

  function init() {
    bindForm();
    bindControls();
    updateClock();
    setInterval(updateClock, 30000);

    var saved = load();
    if (saved && saved.profile) {
      state.profile = saved.profile;
      state.alerts = saved.alerts || [];
      $('#productor').value = saved.profile.productor;
      $('#vereda').value = saved.profile.vereda;
      $('#nodo').value = saved.profile.nodo;
      $('#consent').checked = true;
      var radio = $('input[name="especie"][value="' + saved.profile.especie + '"]');
      if (radio) radio.checked = true;
      $('#nodoOk').hidden = false;
      $('#nodoOk').textContent = 'Nodo ' + saved.profile.nodo + ' sincronizado';
      startSession();
      show('monitoreo');
    } else {
      show('predio');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
