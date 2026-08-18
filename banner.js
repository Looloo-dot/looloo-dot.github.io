/* =====================================================================
   banner.js — the breaking wave

   A recognisable scene drawn only with text characters: one curling
   wave, a hollow barrel, moving water bands, foam, moon or sun, and a
   small sailboat for scale. The drawing is authored with Bezier paths,
   then animated with slow control-point motion and sub-pixel layer drift.

   Hover draws a live eddy, dragging leaves a wake, and clicking throws
   a splash with expanding rings. Reduced motion receives the same scene
   as a still. No canvas and no dependencies.
   ===================================================================== */

(function () {
  'use strict';

  var host = document.getElementById('field');
  if (!host || host.dataset.scene !== 'wave') return;

  var farEl = host.querySelector('pre.l-far');
  var ghostEl = host.querySelector('pre.l-ghost');
  var midEl = host.querySelector('pre.l-mid');
  var nearEl = host.querySelector('pre.l-near');
  var accentEl = host.querySelector('pre.crest');
  var stack = host.querySelector('.stack');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var cols = 0;
  var rows = 0;
  var horizon = 0;
  var grid = null;
  var running = false;
  var visible = true;
  var raf = 0;
  var startTime = 0;
  var lastPaint = 0;

  var pointer = {
    on: false,
    x: 0.68,
    y: 0.70,
    targetX: 0.68,
    targetY: 0.70
  };
  var lastTrail = { x: 0, y: 0, at: 0 };
  var wakes = [];
  var splashes = [];

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function measureCols() {
    var probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit';
    probe.textContent = '0'.repeat(100);
    farEl.appendChild(probe);
    var width = probe.getBoundingClientRect().width / 100;
    probe.remove();
    return Math.max(42, Math.floor(farEl.clientWidth / width));
  }

  function makeGrid() {
    var out = [];
    for (var r = 0; r < rows; r++) out.push(new Array(cols).fill(' '));
    return out;
  }

  function configure() {
    cols = measureCols();
    rows = cols < 70 ? 22 : (cols < 108 ? 25 : 28);
    horizon = rows < 24 ? 7 : 9;
    grid = {
      far: makeGrid(),
      ghost: makeGrid(),
      mid: makeGrid(),
      near: makeGrid(),
      accent: makeGrid()
    };
  }

  function clearAll() {
    var names = ['far', 'ghost', 'mid', 'near', 'accent'];
    for (var n = 0; n < names.length; n++) {
      var layer = grid[names[n]];
      for (var r = 0; r < rows; r++) layer[r].fill(' ');
    }
  }

  function put(layer, x, y, char, overwrite) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= cols || y < 0 || y >= rows) return;
    if (overwrite || layer[y][x] === ' ') layer[y][x] = char;
  }

  function point(nx, ny) {
    return { x: nx * (cols - 1), y: ny * (rows - 1) };
  }

  function glyphFor(dx, dy, style, step) {
    var ax = Math.abs(dx);
    var ay = Math.abs(dy);
    if (ay > ax * 1.8) return '|';
    if (ax > ay * 2.2) {
      if (style === 'foam') return step % 4 === 0 ? '~' : '_';
      if (style === 'water') return step % 7 === 0 ? '~' : '_';
      if (style === 'fine') return step % 3 === 0 ? '.' : '-';
      return '_';
    }
    return dx * dy >= 0 ? '\\' : '/';
  }

  function drawSegment(layer, a, b, style, overwrite, stepSeed) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    var glyph = glyphFor(dx, dy, style, stepSeed || 0);
    for (var i = 0; i <= steps; i++) {
      var u = i / steps;
      put(layer, a.x + dx * u, a.y + dy * u, glyph, overwrite);
    }
  }

  function bezierPoint(p0, p1, p2, p3, t) {
    var q = 1 - t;
    return {
      x: q * q * q * p0.x + 3 * q * q * t * p1.x + 3 * q * t * t * p2.x + t * t * t * p3.x,
      y: q * q * q * p0.y + 3 * q * q * t * p1.y + 3 * q * t * t * p2.y + t * t * t * p3.y
    };
  }

  function drawBezier(layer, points, style, options) {
    options = options || {};
    var samples = options.samples || Math.max(50, Math.round(cols * 0.85));
    var previous = bezierPoint(points[0], points[1], points[2], points[3], 0);
    for (var i = 1; i <= samples; i++) {
      var t = i / samples;
      var next = bezierPoint(points[0], points[1], points[2], points[3], t);
      var dash = options.dash || 0;
      var gap = dash && ((i + (options.offset || 0)) % dash < (options.gap || 1));
      if (!gap) drawSegment(layer, previous, next, style, options.overwrite, i);
      previous = next;
    }
  }

  function waterGlyph(delta, c, phase, weight) {
    if (delta < -0.34) return '/';
    if (delta > 0.34) return '\\';
    var tick = Math.floor(phase * 5);
    return ((c + tick + weight * 3) % (weight === 0 ? 8 : 11) === 0) ? '~' : '_';
  }

  function drawWaterBand(layer, baseY, amp, frequency, phase, start, end, weight) {
    var first = Math.max(0, Math.floor(start * cols));
    var last = Math.min(cols - 1, Math.ceil(end * cols));
    var previousY = baseY;
    for (var c = first; c <= last; c++) {
      var x = c / Math.max(1, cols - 1);
      var y = baseY
        + amp * Math.sin(x * frequency * Math.PI * 2 - phase)
        + 0.28 * Math.sin(x * 19 + phase * 0.42 + weight);
      var gap = ((c + weight * 17 + Math.floor(phase * 3)) % 47) < (weight + 1);
      if (!gap) put(layer, c, y, waterGlyph(y - previousY, c, phase, weight), true);
      previousY = y;
    }
  }

  function drawSky(t) {
    var cx = Math.round(cols * (cols < 70 ? 0.82 : 0.85));
    var cy = rows < 24 ? 3 : 4;
    var day = new Date().getHours() >= 6 && new Date().getHours() < 18;
    var marks = day
      ? [[-3, 0], [-2, -2], [0, -3], [2, -2], [3, 0], [2, 2], [0, 3], [-2, 2]]
      : [[1, -3], [-1, -2], [-2, 0], [-1, 2], [1, 3], [2, -2], [1, 0], [2, 2]];
    for (var i = 0; i < marks.length; i++) {
      var shimmer = (i + Math.floor(t * 1.2)) % 5 === 0 ? "'" : '.';
      put(grid.mid, cx + marks[i][0], cy + marks[i][1], shimmer, true);
    }
  }

  function drawSurveyVessel(t) {
    var x = Math.round(cols * (cols < 70 ? 0.72 : 0.73));
    var y = Math.round(horizon + 4 + 0.32 * Math.sin(t * 1.05));
    var vessel = cols < 70
      ? ['   |\\   ', '  /| \\  ', ' /_|__\\ ', '__[o]___', ' \\____/ ']
      : ['      |\\      ', '     /| \\     ', '    / |  \\    ', '   /__|___\\   ', '  ___[o]____  ', '   \\_______/   '];
    var top = y - vessel.length + 1;
    var left = x - Math.floor(vessel[0].length / 2);
    for (var r = 0; r < vessel.length; r++) {
      for (var c = 0; c < vessel[r].length; c++) {
        var ch = vessel[r][c];
        if (ch === ' ') continue;
        var target = ch === 'o' ? grid.accent : grid.near;
        put(target, left + c, top + r, ch, true);
      }
    }
    put(grid.mid, x, y + 1, ':', true);

    /* The vessel periodically lowers one reading into a sea that will
       not hold still. Several surfaces are touched, but no axis or label
       turns the scene into a chart. */
    var phase = t % 15;
    var progress = 0;
    if (phase >= 0.8 && phase < 2.4) progress = (phase - 0.8) / 1.6;
    else if (phase >= 2.4 && phase < 6.0) progress = 1;
    else if (phase >= 6.0 && phase < 7.4) progress = 1 - (phase - 6.0) / 1.4;
    if (progress > 0) {
      var from = y + 1;
      var to = Math.round(from + (rows - 2 - from) * progress);
      for (var py = from; py <= to; py++) {
        if ((py - from) % 2 === 0) put(grid.mid, x, py, ':', true);
      }
      var readings = [Math.round(rows * 0.60), Math.round(rows * 0.80), Math.round(rows * 0.90)];
      for (var q = 0; q < readings.length; q++) {
        if (readings[q] <= to) {
          put(grid.accent, x - 1, readings[q], '[', true);
          put(grid.accent, x, readings[q], '.', true);
          put(grid.accent, x + 1, readings[q], ']', true);
        }
      }
    }
  }

  function drawWave(t) {
    var pulse = 0.009 * Math.sin(t * 0.72);
    var curl = 0.012 * Math.sin(t * 0.93 + 0.8);

    /* The back rises from the foreground into one unmistakable crest. */
    drawBezier(grid.near, [
      point(0.015, 0.86),
      point(0.17, 0.84),
      point(0.12 + pulse, 0.39),
      point(0.305 + pulse, 0.225)
    ], 'water', { overwrite: true });

    /* The lip travels over open air before the face falls away. */
    drawBezier(grid.accent, [
      point(0.305 + pulse, 0.225),
      point(0.365, 0.105 - pulse),
      point(0.475 + curl, 0.155),
      point(0.45 + curl, 0.305)
    ], 'foam', { overwrite: true });

    drawBezier(grid.near, [
      point(0.45 + curl, 0.305),
      point(0.505, 0.43),
      point(0.455, 0.68),
      point(0.555, 0.80)
    ], 'water', { overwrite: true });

    /* The inward hook makes a hollow barrel rather than a mountain. */
    drawBezier(grid.accent, [
      point(0.448 + curl, 0.30),
      point(0.41, 0.215),
      point(0.325, 0.225 + pulse),
      point(0.355, 0.39 + curl)
    ], 'foam', { overwrite: true, samples: Math.round(cols * 0.55) });

    drawBezier(grid.near, [
      point(0.355, 0.39 + curl),
      point(0.385, 0.355),
      point(0.42, 0.39),
      point(0.435, 0.47)
    ], 'fine', { overwrite: true, samples: Math.round(cols * 0.35) });

    /* Long face strokes follow the wave instead of repeating its outline. */
    var backOffsets = [0, 1, 2, 3, 4];
    for (var i = 0; i < backOffsets.length; i++) {
      var k = backOffsets[i];
      drawBezier(i < 2 ? grid.mid : grid.ghost, [
        point(0.035 + k * 0.024, 0.835 - k * 0.012),
        point(0.14 + k * 0.018, 0.79 - k * 0.035),
        point(0.145 + k * 0.019, 0.46 + k * 0.014),
        point(0.285 + k * 0.008, 0.255 + k * 0.026)
      ], 'fine', {
        dash: 17 + k * 2,
        gap: 2,
        offset: k * 5,
        samples: Math.round(cols * 0.65)
      });
    }

    for (var f = 0; f < 4; f++) {
      drawBezier(f < 2 ? grid.mid : grid.ghost, [
        point(0.35 + f * 0.017, 0.29 + f * 0.018),
        point(0.445 + f * 0.008, 0.39),
        point(0.415 + f * 0.022, 0.61),
        point(0.49 + f * 0.018, 0.745)
      ], 'fine', {
        dash: 15 + f * 3,
        gap: 2,
        offset: f * 7,
        samples: Math.round(cols * 0.48)
      });
    }

    /* Three foam fingers and a handful of spray marks. */
    var fingers = [
      [0.335, 0.18, 0.355, 0.11, 0.39, 0.15, 0.385, 0.235],
      [0.37, 0.16, 0.405, 0.08, 0.445, 0.15, 0.425, 0.245],
      [0.405, 0.17, 0.455, 0.11, 0.49, 0.20, 0.452, 0.28]
    ];
    for (var j = 0; j < fingers.length; j++) {
      var a = fingers[j];
      drawBezier(grid.accent, [
        point(a[0], a[1] + pulse),
        point(a[2], a[3] - pulse),
        point(a[4] + curl, a[5]),
        point(a[6] + curl, a[7])
      ], 'foam', { overwrite: true, samples: Math.round(cols * 0.28) });
    }

    var spray = [
      [0.28, 0.16, '.'], [0.31, 0.105, "'"], [0.345, 0.075, '.'],
      [0.39, 0.06, '.'], [0.435, 0.095, "'"], [0.475, 0.125, '.'],
      [0.505, 0.19, '.']
    ];
    for (var s = 0; s < spray.length; s++) {
      var flicker = (s + Math.floor(t * 2)) % 6 === 0 ? '*' : spray[s][2];
      put(grid.accent, spray[s][0] * cols, (spray[s][1] + pulse) * rows, flicker, true);
    }
  }

  function drawEllipse(layer, cx, cy, rx, ry, charStyle, overwrite) {
    var samples = Math.max(18, Math.round(rx * 5));
    var previous = null;
    for (var i = 0; i <= samples; i++) {
      var a = i / samples * Math.PI * 2;
      var p = { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
      if (previous) drawSegment(layer, previous, p, charStyle, overwrite, i);
      previous = p;
    }
  }

  function drawInteraction(t) {
    if (pointer.on) {
      var px = pointer.x * (cols - 1);
      var py = clamp(Math.max(pointer.y, 0.76) * (rows - 1), horizon + 1, rows - 2);
      var breathe = 0.45 * Math.sin(t * 3.2);
      drawEllipse(grid.accent, px, py, 2.8 + breathe, 1.0, 'foam', true);
      put(grid.accent, px, py, '~', true);
    }

    for (var w = wakes.length - 1; w >= 0; w--) {
      var wake = wakes[w];
      var age = t - wake.born;
      if (age > 1.6) {
        wakes.splice(w, 1);
        continue;
      }
      var wx = wake.x * (cols - 1);
      var wy = clamp(Math.max(wake.y, 0.76) * (rows - 1), horizon + 1, rows - 2);
      var target = age < 0.7 ? grid.accent : (age < 1.4 ? grid.near : grid.ghost);
      put(target, wx - 1, wy, '~', true);
      put(target, wx, wy, '_', true);
    }

    for (var i = splashes.length - 1; i >= 0; i--) {
      var splash = splashes[i];
      var elapsed = t - splash.born;
      if (elapsed > 2.1) {
        splashes.splice(i, 1);
        continue;
      }
      var sx = splash.x * (cols - 1);
      var sy = clamp(Math.max(splash.y, 0.76) * (rows - 1), horizon + 1, rows - 2);
      var ringX = 2.5 + elapsed * Math.min(18, cols * 0.062);
      var ringY = 0.75 + elapsed * 1.25;
      var ringLayer = elapsed < 0.8 ? grid.accent : grid.near;
      drawEllipse(ringLayer, sx, sy, ringX, ringY, 'foam', true);
      if (elapsed > 0.35) drawEllipse(grid.ghost, sx, sy, ringX * 0.58, Math.max(0.7, ringY * 0.62), 'water', true);

      if (elapsed < 0.72) {
        var lift = Math.max(1, Math.round(Math.sin(elapsed / 0.72 * Math.PI) * 4.5));
        for (var h = 1; h <= lift; h++) put(grid.accent, sx, sy - h, '|', true);
        put(grid.accent, sx - 2, sy - Math.max(1, lift - 1), '/', true);
        put(grid.accent, sx + 2, sy - Math.max(1, lift - 1), '\\', true);
        put(grid.accent, sx - 3, sy - lift - 1, '.', true);
        put(grid.accent, sx + 3, sy - lift, "'", true);
      }
    }
  }

  function textFor(layer) {
    var out = '';
    for (var r = 0; r < rows; r++) out += layer[r].join('') + '\n';
    return out;
  }

  function render(t) {
    clearAll();
    pointer.x += (pointer.targetX - pointer.x) * 0.22;
    pointer.y += (pointer.targetY - pointer.y) * 0.22;

    drawSky(t);
    drawWaterBand(grid.far, horizon, 0.42, 4.8, t * 0.28, 0.03, 0.98, 2);
    drawWaterBand(grid.mid, rows * 0.60, 0.70, 3.8, t * 0.55, 0.30, 0.99, 1);
    drawWaterBand(grid.near, rows * 0.80, 0.92, 3.2, t * 0.82, 0.46, 1, 0);
    drawWaterBand(grid.ghost, rows * 0.90, 0.62, 4.4, t * 0.44, 0.02, 0.98, 2);
    drawWave(t);
    drawSurveyVessel(t);
    drawInteraction(t);

    farEl.textContent = textFor(grid.far);
    ghostEl.textContent = textFor(grid.ghost);
    midEl.textContent = textFor(grid.mid);
    nearEl.textContent = textFor(grid.near);
    accentEl.textContent = textFor(grid.accent);
  }

  function animateLayers(t) {
    var farY = 0.18 * Math.sin(t * 0.52);
    var midY = 0.34 * Math.sin(t * 0.68 + 0.7);
    var nearY = 0.62 * Math.sin(t * 0.84 + 1.1);
    farEl.style.transform = 'translate3d(0,' + farY.toFixed(2) + 'px,0)';
    ghostEl.style.transform = 'translate3d(' + (0.28 * Math.sin(t * 0.34)).toFixed(2) + 'px,' + midY.toFixed(2) + 'px,0)';
    midEl.style.transform = 'translate3d(' + (0.38 * Math.sin(t * 0.42)).toFixed(2) + 'px,' + midY.toFixed(2) + 'px,0)';
    nearEl.style.transform = 'translate3d(0,' + nearY.toFixed(2) + 'px,0)';
    accentEl.style.transform = 'translate3d(0,' + nearY.toFixed(2) + 'px,0)';
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!startTime) startTime = now;
    var t = (now - startTime) / 1000;
    animateLayers(t);
    if (now - lastPaint >= 32) {
      lastPaint = now;
      render(t);
    }
  }

  function play() {
    if (running || reduce) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }

  function pause() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function eventPoint(e) {
    var rect = stack.getBoundingClientRect();
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0.02, 0.98),
      y: clamp((e.clientY - rect.top) / rect.height, 0.05, 0.95)
    };
  }

  function secondsAt(now) {
    return startTime ? (now - startTime) / 1000 : 0;
  }

  function boot() {
    configure();
    render(0);
    host.classList.add('live');
    if (reduce) return;

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          visible = entry.isIntersecting;
          if (visible) play(); else pause();
        });
      }, { threshold: 0.05 }).observe(host);
    } else {
      play();
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause(); else if (visible) play();
    });

    stack.addEventListener('pointerenter', function (e) {
      var p = eventPoint(e);
      pointer.on = true;
      pointer.x = pointer.targetX = p.x;
      pointer.y = pointer.targetY = p.y;
      lastTrail = { x: p.x, y: p.y, at: performance.now() };
    });

    stack.addEventListener('pointermove', function (e) {
      var p = eventPoint(e);
      var now = performance.now();
      pointer.on = true;
      pointer.targetX = p.x;
      pointer.targetY = p.y;
      var distance = Math.hypot(p.x - lastTrail.x, (p.y - lastTrail.y) * 0.7);
      if (distance > 0.042 && now - lastTrail.at > 55) {
        wakes.push({ x: p.x, y: p.y, born: secondsAt(now) });
        if (wakes.length > 24) wakes.shift();
        lastTrail = { x: p.x, y: p.y, at: now };
      }
    });

    stack.addEventListener('pointerleave', function () {
      pointer.on = false;
    });

    stack.addEventListener('pointerdown', function (e) {
      var p = eventPoint(e);
      var now = performance.now();
      splashes.push({ x: p.x, y: p.y, born: secondsAt(now) });
      if (splashes.length > 5) splashes.shift();
    });
  }

  if (document.fonts && document.fonts.load) {
    Promise.race([
      document.fonts.load('11.5px "IBM Plex Mono"'),
      new Promise(function (resolve) { setTimeout(resolve, 400); })
    ]).then(boot, boot);
  } else {
    boot();
  }

  var resizeTimer = 0;
  addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var nextCols = measureCols();
      if (nextCols === cols) return;
      configure();
      render(reduce ? 0 : secondsAt(performance.now()));
    }, 150);
  });
})();

/* =====================================================================
   The moving frontier

   This is the active scene. The earlier breaking-wave study remains
   above, behind data-scene="wave", so changing one HTML attribute can
   restore it. Here, a small perspective renderer turns a changing
   capability field into a legible wireframe terrain. The teal frontier
   is a lifted, layered band; it moves because the surface being measured
   moves too. The camera uses a real world rotation, so the landscape can
   be orbited through a complete 360 degrees without flattening into a
   fake two-dimensional skew.

   Hover locally deforms the field, dragging orbits the camera, and a
   click sends an evaluation pulse over the surface. Everything remains
   typed text in five stacked <pre> elements: no canvas, WebGL or SVG.
   ===================================================================== */

(function () {
  'use strict';

  var host = document.getElementById('field');
  if (!host || host.dataset.scene !== 'frontier') return;

  var farEl = host.querySelector('pre.l-far');
  var ghostEl = host.querySelector('pre.l-ghost');
  var midEl = host.querySelector('pre.l-mid');
  var nearEl = host.querySelector('pre.l-near');
  var accentEl = host.querySelector('pre.crest');
  var stack = host.querySelector('.stack');
  var readout = host.querySelector('.frontier-readout');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var cols = 0;
  var rows = 0;
  var grid = null;
  var depthBuffer = null;
  var running = false;
  var visible = true;
  var raf = 0;
  var startTime = 0;
  var lastPaint = 0;
  var resizeTimer = 0;
  var readoutText = '';
  var currentTime = 3.6;

  var view = {
    yaw: -0.22,
    targetYaw: -0.22,
    tilt: 0.01,
    targetTilt: 0.01,
    velocityYaw: 0,
    velocityTilt: 0
  };

  var pointer = {
    on: false,
    down: false,
    moved: false,
    x: 0.56,
    y: 0.58,
    u: 0.08,
    d: 0.58,
    strength: 0,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastMoveAt: 0
  };

  var pulses = [];

  /* The landmarks are capability regions, not a leaderboard. Their
     positions separate kinds of evaluation across the terrain; no height
     encodes a real score. Labels stay abbreviated so the scene remains art
     before it becomes annotation. */
  var benchmarkSites = [
    { u: -0.82, d: 0.30, label: 'MMLU/HELM', mobile: 'MMLU', amp: 0.11, spreadU: 0.13, spreadD: 0.09 },
    { u: -0.50, d: 0.66, label: 'HLE',       mobile: 'HLE',  amp: 0.18, spreadU: 0.11, spreadD: 0.08 },
    { u: -0.15, d: 0.36, label: 'SWE-B',     mobile: 'SWE',  amp: 0.13, spreadU: 0.12, spreadD: 0.09 },
    { u:  0.18, d: 0.72, label: 'TERM2.1',   mobile: null,   amp: 0.15, spreadU: 0.11, spreadD: 0.08 },
    { u:  0.52, d: 0.40, label: 'GDPVAL',    mobile: 'GDP',  amp: 0.13, spreadU: 0.13, spreadD: 0.10 },
    { u:  0.82, d: 0.68, label: 'TAU3-B',    mobile: 'TAU3', amp: 0.14, spreadU: 0.11, spreadD: 0.08 }
  ];

  function clamp(value, low, high) {
    return value < low ? low : (value > high ? high : value);
  }

  function mix(a, b, amount) {
    return a + (b - a) * amount;
  }

  function measureCols() {
    var probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit';
    probe.textContent = '0'.repeat(100);
    farEl.appendChild(probe);
    var charWidth = probe.getBoundingClientRect().width / 100;
    probe.remove();
    return Math.max(44, Math.floor(farEl.clientWidth / charWidth));
  }

  function makeGrid() {
    var result = [];
    for (var r = 0; r < rows; r++) result.push(new Array(cols).fill(' '));
    return result;
  }

  function configure() {
    cols = measureCols();
    rows = cols < 70 ? 23 : (cols < 110 ? 26 : 29);
    grid = {
      far: makeGrid(),
      ghost: makeGrid(),
      mid: makeGrid(),
      near: makeGrid(),
      accent: makeGrid()
    };
    depthBuffer = [];
    for (var r = 0; r < rows; r++) depthBuffer.push(new Array(cols).fill(-Infinity));
  }

  function clearAll() {
    var names = ['far', 'ghost', 'mid', 'near', 'accent'];
    for (var n = 0; n < names.length; n++) {
      for (var r = 0; r < rows; r++) grid[names[n]][r].fill(' ');
    }
    for (var d = 0; d < rows; d++) depthBuffer[d].fill(-Infinity);
  }

  function put(layer, x, y, character, overwrite, depth) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= cols || y < 0 || y >= rows) return;
    if (Number.isFinite(depth) && layer !== grid.accent) {
      if (depth < depthBuffer[y][x] - 0.028) return;
      depthBuffer[y][x] = Math.max(depthBuffer[y][x], depth);
    }
    if (overwrite || layer[y][x] === ' ') layer[y][x] = character;
  }

  function write(layer, x, y, value, overwrite) {
    var left = Math.round(x - value.length / 2);
    for (var i = 0; i < value.length; i++) put(layer, left + i, y, value[i], overwrite);
  }

  function lineGlyph(dx, dy, style, step) {
    var ax = Math.abs(dx);
    var ay = Math.abs(dy);
    if (style === 'mist') return step % 3 === 0 ? '.' : ' ';
    if (ay > ax * 1.7) return style === 'scan' ? ':' : '|';
    if (ax > ay * 2.1) {
      if (style === 'far') return step % 4 === 0 ? '.' : '-';
      if (style === 'rail') return step % 5 === 0 ? '.' : '-';
      if (style === 'scan') return step % 4 === 0 ? '=' : '-';
      if (style === 'frontier') return '_';
      return '_';
    }
    return dx * dy >= 0 ? '\\' : '/';
  }

  function drawSegment(layer, a, b, style, overwrite, seed, dashed) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    var character = lineGlyph(dx, dy, style, seed || 0);
    for (var i = 0; i <= steps; i++) {
      if (dashed && ((i + (seed || 0)) % dashed) >= dashed - 2) continue;
      var amount = i / steps;
      var depth = Number.isFinite(a.depth) && Number.isFinite(b.depth)
        ? mix(a.depth, b.depth, amount)
        : undefined;
      put(layer, a.x + dx * amount, a.y + dy * amount, character, overwrite, depth);
    }
  }

  function ridgeU(depth, t) {
    return -0.36 + depth * 0.64
      + 0.075 * Math.sin(depth * 5.2 - t * 0.22)
      + 0.025 * Math.sin(t * 0.41);
  }

  function terrain(u, depth, t) {
    var center = ridgeU(depth, t);
    var ridgeWidth = 0.17 + depth * 0.055;
    var ridge = Math.exp(-Math.pow((u - center) / ridgeWidth, 2));
    var ridgeHeight = 0.60 + 0.15 * Math.sin(depth * 5.6 - t * 0.20);

    var secondCenter = 0.58 - depth * 0.46 + 0.06 * Math.sin(t * 0.16 + depth * 4.1);
    var second = Math.exp(-Math.pow((u - secondCenter) / 0.23, 2));
    var secondHeight = 0.30 + 0.08 * Math.cos(depth * 7.4 + t * 0.17);

    var folds = 0.055 * Math.sin(u * 7.2 + depth * 5.8 + t * 0.12)
      + 0.032 * Math.cos(u * 11.1 - depth * 8.0 - t * 0.15);
    var shelf = 0.09 * Math.sin((u + depth * 0.72) * 3.2 - t * 0.08);
    var height = 0.12 + ridge * ridgeHeight + second * secondHeight + folds + shelf;

    /* Each named benchmark is a real topographic feature. The modest
       Gaussian relief keeps these as regions in one landscape rather than
       six disconnected chart columns. */
    for (var b = 0; b < benchmarkSites.length; b++) {
      var site = benchmarkSites[b];
      var siteU = (u - site.u) / site.spreadU;
      var siteD = (depth - site.d) / site.spreadD;
      height += site.amp * Math.exp(-(siteU * siteU + siteD * siteD));
    }

    if (pointer.strength > 0.001) {
      var du = u - pointer.u;
      var dd = depth - pointer.d;
      var lens = Math.exp(-(du * du / 0.032 + dd * dd / 0.020));
      height += lens * 0.24 * pointer.strength;
    }

    for (var i = 0; i < pulses.length; i++) {
      var pulse = pulses[i];
      var age = t - pulse.born;
      if (age < 0 || age > 2.8) continue;
      var distance = Math.sqrt(Math.pow((u - pulse.u) * 0.85, 2) + Math.pow(depth - pulse.d, 2));
      var ring = Math.exp(-Math.pow((distance - age * 0.22) / 0.045, 2));
      height += ring * 0.09 * (1 - age / 2.8);
    }

    return clamp(height, 0.025, 0.98);
  }

  function projectionScale(angle) {
    var extent = Math.abs(Math.cos(angle)) * 1.06 + Math.abs(Math.sin(angle)) * 0.70;
    return 0.42 * Math.min(1, 1.08 / Math.max(0.01, extent));
  }

  function projectionDepthScale(angle) {
    var extent = Math.abs(Math.sin(angle)) * 1.06 + Math.abs(Math.cos(angle)) * 0.70;
    return 0.46 / Math.max(0.01, extent);
  }

  function project(u, depth, height) {
    var angle = view.yaw;
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    var worldZ = (depth - 0.5) * 1.40;
    var rotatedU = u * cos - worldZ * sin;
    var rotatedZ = u * sin + worldZ * cos;
    var rotatedDepth = clamp(0.5 + rotatedZ * projectionDepthScale(angle), 0.018, 0.982);
    var perspective = 0.82 + rotatedDepth * 0.16;
    var nx = 0.5 + rotatedU * projectionScale(angle) * perspective;
    /* Distant vertical relief compresses while the near face opens up.
       Besides reading more like perspective, this keeps a full orbit
       comfortably inside the frame without flattening the foreground. */
    var ny = 0.14 + rotatedDepth * 0.76
      - height * (0.08 + rotatedDepth * 0.25)
      + view.tilt * (rotatedDepth - 0.5) * 0.22;
    return {
      x: nx * (cols - 1),
      y: ny * (rows - 1),
      depth: rotatedDepth
    };
  }

  function layerFor(depth, rail) {
    if (rail && depth < 0.30) return grid.ghost;
    if (depth < 0.31) return grid.far;
    if (depth < 0.66) return grid.mid;
    return grid.near;
  }

  function drawTerrain(t) {
    var sideView = Math.abs(Math.sin(view.yaw));
    var depthLines = cols < 70 ? 6 : 8;
    var railLines = cols < 70 ? 7 : 9;
    if (sideView > 0.72) {
      depthLines -= 1;
      railLines -= cols < 70 ? 1 : 2;
    }
    var samples = cols < 70 ? 32 : 52;
    var i;
    var s;

    /* Cross-contours establish depth, drawn from the vanishing edge out. */
    for (i = 0; i < depthLines; i++) {
      var depth = 0.055 + i / (depthLines - 1) * 0.925;
      var previous = null;
      for (s = 0; s <= samples; s++) {
        var u = -1.06 + s / samples * 2.12;
        var point = project(u, depth, terrain(u, depth, t));
        if (previous) {
          var contourDepth = (previous.depth + point.depth) / 2;
          drawSegment(
            layerFor(contourDepth, false),
            previous,
            point,
            contourDepth < 0.31 ? 'far' : 'mesh',
            contourDepth >= 0.31,
            i + s,
            contourDepth < 0.22 ? 7 : 0
          );
        }
        previous = point;
      }
    }

    /* Long rails make the contour field read as one coherent 3D surface. */
    for (i = 0; i < railLines; i++) {
      var railU = -1.0 + i / (railLines - 1) * 2.0;
      var last = null;
      for (s = 0; s <= samples; s++) {
        var railDepth = 0.055 + s / samples * 0.925;
        var railPoint = project(railU, railDepth, terrain(railU, railDepth, t));
        if (last) {
          var visualDepth = (last.depth + railPoint.depth) / 2;
          drawSegment(
            layerFor(visualDepth, true),
            last,
            railPoint,
            visualDepth < 0.30 ? 'mist' : 'rail',
            visualDepth >= 0.28,
            i + s,
            visualDepth < 0.22 ? 5 : 0
          );
        }
        last = railPoint;
      }
    }
  }

  function drawFrontEdge(t) {
    /* A closed top perimeter makes the object honest at every azimuth.
       Keeping it to one contour avoids turning the organic field into a
       boxed slab when the camera reaches a side view. */
    var samples = cols < 70 ? 44 : 80;
    var topPrevious = null;
    for (var s = 0; s <= samples; s++) {
      var phase = s / samples * 4;
      var side = Math.min(3, Math.floor(phase));
      var amount = phase - side;
      var u;
      var depth;
      if (side === 0) {
        u = -1.06 + amount * 2.12;
        depth = 0.055;
      } else if (side === 1) {
        u = 1.06;
        depth = 0.055 + amount * 0.925;
      } else if (side === 2) {
        u = 1.06 - amount * 2.12;
        depth = 0.98;
      } else {
        u = -1.06;
        depth = 0.98 - amount * 0.925;
      }

      var top = project(u, depth, terrain(u, depth, t));
      if (topPrevious) {
        var topDepth = (topPrevious.depth + top.depth) / 2;
        drawSegment(layerFor(topDepth, false), topPrevious, top, 'mesh', true, s, 0);
      }
      topPrevious = top;
    }
  }

  function frontierDepthAt(u, t) {
    return 0.50
      + 0.150 * Math.sin(u * 2.35 - t * 0.30)
      + 0.055 * Math.sin(u * 5.4 + t * 0.19);
  }

  function frontierLiftAt(u, t) {
    return 0.260 + 0.050 * Math.sin(u * 2.6 - t * 0.52);
  }

  function drawFrontier(t) {
    /* One camera-facing lower edge and one petrol crown are enough to
       describe a raised ribbon. Sparse supports reveal its volume; the
       hidden edge stays hidden, avoiding the old X-ray tangle. */
    var samples = cols < 70 ? 34 : 64;
    var lower = [];
    var crowns = [];
    var s;
    for (s = 0; s <= samples; s++) {
      var u = -1.02 + s / samples * 2.04;
      var depth = frontierDepthAt(u, t);
      var halfWidth = 0.052 + 0.008 * Math.sin(u * 3.1 + t * 0.32);
      var lift = frontierLiftAt(u, t);
      var farSide = project(u, depth - halfWidth, terrain(u, depth - halfWidth, t) + 0.012);
      var nearSide = project(u, depth + halfWidth, terrain(u, depth + halfWidth, t) + 0.012);
      var centerHeight = terrain(u, depth, t);
      lower.push(farSide.depth > nearSide.depth ? farSide : nearSide);
      crowns.push(project(u, depth, centerHeight + lift + 0.018));
    }

    var supportEvery = cols < 70 ? 9 : 12;
    for (s = 0; s <= samples; s += supportEvery) {
      var ribDepth = (lower[s].depth + crowns[s].depth) / 2;
      drawSegment(layerFor(ribDepth, true), lower[s], crowns[s], 'rail', true, s, 0);
      put(grid.accent, crowns[s].x, crowns[s].y, '+', true);
    }

    var previousLower = null;
    var previousCrown = null;
    for (s = 0; s <= samples; s++) {
      if (previousLower) {
        var lowerDepth = (previousLower.depth + lower[s].depth) / 2;
        drawSegment(layerFor(lowerDepth, false), previousLower, lower[s], 'rail', true, s, 0);
        drawSegment(grid.accent, previousCrown, crowns[s], 'frontier', true, s, 0);
      }
      previousLower = lower[s];
      previousCrown = crowns[s];
    }
  }

  function drawScan(t) {
    var cycle = (t * 0.075) % 1;
    var depth = 0.11 + cycle * 0.80;
    var samples = cols < 70 ? 32 : 60;
    var previous = null;
    for (var s = 0; s <= samples; s++) {
      var u = -1.02 + s / samples * 2.04;
      var point = project(u, depth, terrain(u, depth, t) + 0.018);
      if (previous) {
        var scanDepth = (previous.depth + point.depth) / 2;
        drawSegment(layerFor(scanDepth, false), previous, point, 'scan', true, s + Math.floor(t * 5), 6);
      }
      previous = point;
    }

    var ridge = ridgeU(depth, t);
    var target = project(ridge, depth, terrain(ridge, depth, t) + 0.04);
    put(grid.mid, target.x, target.y, '+', true);
  }

  function drawBenchmarkLandmarks(t) {
    var labels = [];
    for (var i = 0; i < benchmarkSites.length; i++) {
      var site = benchmarkSites[i];
      if (cols < 70 && site.mobile === null) continue;
      var label = cols < 70 ? site.mobile : site.label;
      var height = terrain(site.u, site.d, t);
      var foot = project(site.u, site.d, height + 0.012);
      var head = project(site.u, site.d, height + (cols < 70 ? 0.11 : 0.13));
      var depthLayer = layerFor(head.depth, false);
      var crossing = Math.abs(site.d - frontierDepthAt(site.u, t)) < 0.075;
      var labelLayer = crossing ? grid.accent : depthLayer;

      labels.push({
        index: i,
        foot: foot,
        head: head,
        layer: labelLayer,
        depthLayer: depthLayer,
        crossing: crossing,
        text: label,
        score: head.depth
      });
    }

    /* Let the nearest regions earn labels. The others remain as quiet
       surface points and rotate into prominence instead of competing all
       at once. */
    var maxLabels = cols < 70 ? 3 : 4;
    var ranked = labels.slice().sort(function (a, b) { return b.score - a.score; });
    var selected = {};
    for (var n = 0; n < Math.min(maxLabels, ranked.length); n++) selected[ranked[n].index] = true;

    var visibleLabels = [];
    for (var p = 0; p < labels.length; p++) {
      var landmark = labels[p];
      if (!selected[landmark.index]) {
        put(landmark.depthLayer, landmark.foot.x, landmark.foot.y, '.', true, landmark.foot.depth);
        continue;
      }
      drawSegment(landmark.depthLayer, landmark.foot, landmark.head, 'rail', true, landmark.index, 0);
      put(landmark.layer, landmark.head.x, landmark.head.y, landmark.crossing ? '*' : '+', true);
      visibleLabels.push(landmark);
    }

    /* Billboard labels remain horizontal for quick reading. At side
       angles their anchors converge, so stagger labels by whole text rows
       instead of allowing an illegible knot. */
    visibleLabels.sort(function (a, b) { return a.head.x - b.head.x; });
    var occupied = [];
    for (var q = 0; q < visibleLabels.length; q++) {
      var item = visibleLabels[q];
      var baseY = Math.round(item.head.y) - 1;
      var candidates = [baseY, baseY - 3, baseY + 3, baseY - 6, baseY + 6];
      var chosenY = clamp(baseY, 1, rows - 2);
      for (var c = 0; c < candidates.length; c++) {
        var labelY = clamp(candidates[c], 1, rows - 2);
        var left = Math.round(item.head.x - item.text.length / 2) - 1;
        var right = left + item.text.length + 1;
        var collides = false;
        for (var o = 0; o < occupied.length; o++) {
          var box = occupied[o];
          if (right >= box.left && left <= box.right && labelY + 1 >= box.top && labelY - 1 <= box.bottom) {
            collides = true;
            break;
          }
        }
        if (!collides) {
          chosenY = labelY;
          occupied.push({ left: left, right: right, top: labelY - 1, bottom: labelY + 1 });
          break;
        }
      }
      eraseLabelZone(item.head.x, chosenY, item.text.length);
      if (Math.abs(chosenY - baseY) > 1) {
        var connectorY = chosenY < item.head.y ? chosenY + 2 : chosenY - 2;
        drawSegment(item.layer, item.head, { x: item.head.x, y: connectorY }, 'scan', false, q, 2);
      }
      write(item.layer, item.head.x, chosenY, item.text, true);
    }
  }

  function eraseLabelZone(centerX, centerY, length) {
    var left = Math.round(centerX - length / 2) - 2;
    var right = left + length + 3;
    var layers = [grid.far, grid.ghost, grid.mid, grid.near, grid.accent];
    for (var y = Math.max(0, centerY - 1); y <= Math.min(rows - 1, centerY + 1); y++) {
      for (var x = Math.max(0, left); x <= Math.min(cols - 1, right); x++) {
        for (var l = 0; l < layers.length; l++) layers[l][y][x] = ' ';
      }
    }
  }

  function drawDataRing(layer, u, depth, radius, t, dashed) {
    var samples = cols < 70 ? 22 : 38;
    var previous = null;
    for (var i = 0; i <= samples; i++) {
      var angle = i / samples * Math.PI * 2;
      var ringU = u + Math.cos(angle) * radius * 1.18;
      var ringDepth = depth + Math.sin(angle) * radius;
      if (ringU < -1.08 || ringU > 1.08 || ringDepth < 0.045 || ringDepth > 0.99) {
        previous = null;
        continue;
      }
      var point = project(ringU, ringDepth, terrain(ringU, ringDepth, t) + 0.025);
      if (previous) drawSegment(layer, previous, point, 'scan', true, i, dashed);
      previous = point;
    }
  }

  function drawInteraction(t) {
    if (pointer.strength > 0.04) {
      var hoverPoint = project(pointer.u, pointer.d, terrain(pointer.u, pointer.d, t) + 0.035);
      drawDataRing(grid.accent, pointer.u, pointer.d, 0.055 + pointer.strength * 0.018, t, 4);
      put(grid.accent, hoverPoint.x, hoverPoint.y, '+', true);
    }

    for (var i = pulses.length - 1; i >= 0; i--) {
      var pulse = pulses[i];
      var age = t - pulse.born;
      if (age > 2.8) {
        pulses.splice(i, 1);
        continue;
      }
      var radius = 0.035 + age * 0.22;
      drawDataRing(age < 1.45 ? grid.accent : grid.near, pulse.u, pulse.d, radius, t, age > 1.5 ? 5 : 0);
      if (age < 0.72) {
        var center = project(pulse.u, pulse.d, terrain(pulse.u, pulse.d, t) + 0.11);
        write(grid.accent, center.x, center.y, age < 0.42 ? '[EVAL]' : '[....]', true);
      }
    }
  }

  function drawHorizon(t) {
    var count = cols < 70 ? 5 : 9;
    for (var i = 0; i < count; i++) {
      var u = -0.92 + i / Math.max(1, count - 1) * 1.84;
      var point = project(u, 0.035, 0.01);
      var character = (i + Math.floor(t * 0.7)) % 4 === 0 ? ':' : '.';
      put(layerFor(point.depth, true), point.x, point.y + 1, character, true);
    }
  }

  function textFor(layer) {
    var output = '';
    for (var r = 0; r < rows; r++) output += layer[r].join('') + '\n';
    return output;
  }

  function setReadout(value) {
    if (!readout || value === readoutText) return;
    readoutText = value;
    readout.textContent = value;
  }

  function render(t) {
    currentTime = t;
    clearAll();
    if (!pointer.down) {
      view.targetYaw += view.velocityYaw;
      view.targetTilt = clamp(view.targetTilt + view.velocityTilt, -0.18, 0.18);
      view.velocityYaw *= 0.86;
      view.velocityTilt *= 0.78;
      if (Math.abs(view.velocityYaw) < 0.00002) view.velocityYaw = 0;
      if (Math.abs(view.velocityTilt) < 0.00002) view.velocityTilt = 0;
    }
    view.yaw = mix(view.yaw, view.targetYaw, pointer.down ? 0.30 : 0.14);
    view.tilt = mix(view.tilt, view.targetTilt, pointer.down ? 0.24 : 0.11);

    /* Keep long spinning sessions numerically tidy without creating a
       visible jump: current and target lose the same whole revolutions. */
    if (Math.abs(view.yaw) > Math.PI * 100) {
      var wholeTurns = Math.round(view.yaw / (Math.PI * 2)) * Math.PI * 2;
      view.yaw -= wholeTurns;
      view.targetYaw -= wholeTurns;
    }

    if (pointer.on) {
      var mapped = surfacePointFromNormalized(pointer.x, pointer.y);
      pointer.u = mapped.u;
      pointer.d = mapped.d;
    }
    pointer.strength = mix(pointer.strength, pointer.on && !pointer.down ? 1 : 0, 0.18);

    drawTerrain(t);
    drawFrontEdge(t);
    drawFrontier(t);
    drawInteraction(t);
    drawBenchmarkLandmarks(t);

    farEl.textContent = textFor(grid.far);
    ghostEl.textContent = textFor(grid.ghost);
    midEl.textContent = textFor(grid.mid);
    nearEl.textContent = textFor(grid.near);
    accentEl.textContent = textFor(grid.accent);

    if (pointer.down) {
      var yaw = ((Math.round(view.targetYaw * 57.3) % 360) + 360) % 360;
      var tilt = Math.round(view.targetTilt * 57.3);
      setReadout('azimuth ' + String(yaw).padStart(3, '0') + '\u00b0 / tilt ' + (tilt >= 0 ? '+' : '') + tilt + '\u00b0');
    } else if (pointer.on) {
      setReadout('surface responds / click to test');
    } else {
      setReadout('drag to orbit 360\u00b0 / click to test');
    }
  }

  function animateLayers(t) {
    var commonY = 0.22 * Math.sin(t * 0.34);
    farEl.style.transform = 'translate3d(' + (0.15 * Math.sin(t * 0.17)).toFixed(2) + 'px,' + (commonY * 0.35).toFixed(2) + 'px,0)';
    ghostEl.style.transform = 'translate3d(0,' + (commonY * 0.65).toFixed(2) + 'px,0)';
    midEl.style.transform = 'translate3d(0,' + commonY.toFixed(2) + 'px,0)';
    nearEl.style.transform = 'translate3d(0,' + (commonY * 1.15).toFixed(2) + 'px,0)';
    accentEl.style.transform = 'translate3d(0,' + (commonY * 1.15).toFixed(2) + 'px,0)';
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!startTime) startTime = now;
    var t = (now - startTime) / 1000;
    animateLayers(t);
    if (now - lastPaint >= 14) {
      lastPaint = now;
      render(t);
    }
  }

  function play() {
    if (running || reduce) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }

  function pause() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function secondsAt(now) {
    return startTime ? (now - startTime) / 1000 : 0;
  }

  function surfacePointFromNormalized(x, y) {
    var cameraDepth = clamp((y - 0.14) / 0.76, 0.02, 0.98);
    var angle = view.yaw;
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    var u = 0;
    var depth = 0.5;

    /* Two inverse-projection passes account for the terrain height that
       displaced this cell vertically. This keeps hover and click attached
       to the surface even after a half-turn. */
    for (var pass = 0; pass < 3; pass++) {
      var perspective = 0.82 + cameraDepth * 0.16;
      var rotatedU = (x - 0.5) / Math.max(0.01, projectionScale(angle) * perspective);
      var rotatedZ = (cameraDepth - 0.5) / projectionDepthScale(angle);
      u = rotatedU * cos + rotatedZ * sin;
      var worldZ = -rotatedU * sin + rotatedZ * cos;
      depth = worldZ / 1.40 + 0.5;
      var height = terrain(clamp(u, -1.06, 1.06), clamp(depth, 0.055, 0.98), currentTime);
      var numerator = y - 0.14 + height * 0.08 + view.tilt * 0.11;
      var denominator = 0.76 - height * 0.25 + view.tilt * 0.22;
      cameraDepth = clamp(numerator / Math.max(0.2, denominator), 0.02, 0.98);
    }
    return { u: clamp(u, -1.05, 1.05), d: clamp(depth, 0.055, 0.98) };
  }

  function eventPoint(event) {
    var rect = stack.getBoundingClientRect();
    var x = clamp((event.clientX - rect.left) / rect.width, 0.02, 0.98);
    var y = clamp((event.clientY - rect.top) / rect.height, 0.04, 0.96);
    var surface = surfacePointFromNormalized(x, y);
    return { x: x, y: y, u: surface.u, d: surface.d };
  }

  function updatePointer(event) {
    var point = eventPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.u = point.u;
    pointer.d = point.d;
  }

  function addPulse(u, depth, now) {
    pulses.push({ u: clamp(u, -1.02, 1.02), d: clamp(depth, 0.07, 0.96), born: secondsAt(now) });
    if (pulses.length > 4) pulses.shift();
  }

  function attachInteraction() {
    stack.addEventListener('pointerenter', function (event) {
      pointer.on = true;
      updatePointer(event);
    });

    stack.addEventListener('pointermove', function (event) {
      updatePointer(event);
      pointer.on = true;
      if (!pointer.down) return;

      var dx = event.clientX - pointer.lastX;
      var dy = event.clientY - pointer.lastY;
      var now = performance.now();
      var elapsed = Math.max(8, now - pointer.lastMoveAt);
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      pointer.lastMoveAt = now;
      if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 4) pointer.moved = true;
      var yawDelta = -dx * 0.0060;
      var tiltDelta = dy * 0.0025;
      view.targetYaw += yawDelta;
      view.targetTilt = clamp(view.targetTilt + tiltDelta, -0.18, 0.18);
      view.velocityYaw = yawDelta * clamp(16 / elapsed, 0.35, 1.8) * 0.10;
      view.velocityTilt = tiltDelta * clamp(16 / elapsed, 0.35, 1.8) * 0.08;
    });

    stack.addEventListener('pointerleave', function () {
      if (!pointer.down) pointer.on = false;
    });

    stack.addEventListener('pointerdown', function (event) {
      pointer.down = true;
      pointer.moved = false;
      pointer.startX = pointer.lastX = event.clientX;
      pointer.startY = pointer.lastY = event.clientY;
      pointer.lastMoveAt = performance.now();
      view.velocityYaw = 0;
      view.velocityTilt = 0;
      stack.classList.add('is-dragging');
      if (stack.setPointerCapture) stack.setPointerCapture(event.pointerId);
    });

    stack.addEventListener('pointerup', function (event) {
      updatePointer(event);
      if (!pointer.moved) addPulse(pointer.u, pointer.d, performance.now());
      pointer.down = false;
      stack.classList.remove('is-dragging');
      if (stack.releasePointerCapture && stack.hasPointerCapture(event.pointerId)) stack.releasePointerCapture(event.pointerId);
    });

    stack.addEventListener('pointercancel', function () {
      pointer.down = false;
      pointer.on = false;
      stack.classList.remove('is-dragging');
    });

    host.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        view.velocityYaw = 0;
        view.targetYaw += event.key === 'ArrowLeft' ? -Math.PI / 12 : Math.PI / 12;
        event.preventDefault();
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        view.velocityTilt = 0;
        view.targetTilt = clamp(view.targetTilt + (event.key === 'ArrowUp' ? -0.05 : 0.05), -0.18, 0.18);
        event.preventDefault();
      } else if (event.key === 'Enter' || event.key === ' ') {
        addPulse(0, 0.55, performance.now());
        event.preventDefault();
      }
    });
  }

  function boot() {
    configure();
    render(3.6);
    host.classList.add('live');
    if (reduce) return;

    attachInteraction();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          visible = entry.isIntersecting;
          if (visible) play(); else pause();
        });
      }, { threshold: 0.04 }).observe(host);
    } else {
      play();
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause(); else if (visible) play();
    });
  }

  if (document.fonts && document.fonts.load) {
    Promise.race([
      document.fonts.load('11.5px "IBM Plex Mono"'),
      new Promise(function (resolve) { setTimeout(resolve, 400); })
    ]).then(boot, boot);
  } else {
    boot();
  }

  addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var nextCols = measureCols();
      if (nextCols === cols) return;
      configure();
      render(reduce ? 3.6 : secondsAt(performance.now()));
    }, 150);
  });
})();
