/* eslint-disable */
// Ported from the approved design prototype (js/sim, stage, sections, outage, arch, main); edit here, the prototype is frozen.
// The prototype's six vanilla scripts run inside one closure so the page can be torn down:
// every window/document listener, rAF loop, timer, IntersectionObserver and ScrollTrigger is
// tracked and released by the returned dispose().
export function initHome(HOME, env) {
  const { gsap, ScrollTrigger, base, fonts } = env;
  const FONT = { mono: fonts.mono + ', monospace', zh: fonts.zh + ', sans-serif' };
  const SHARED = { ink: null };
  const disposers = [];
  const timers = new Set();
  let dead = false;
  const ABORT = new Error('home disposed');
  const raf = (fn) => (dead ? 0 : requestAnimationFrame((t) => { if (!dead) fn(t); }));
  const caf = (id) => cancelAnimationFrame(id);
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); return id; };
  const onWin = (type, fn, opt) => { window.addEventListener(type, fn, opt); disposers.push(() => window.removeEventListener(type, fn, opt)); };
  const onDoc = (type, fn, opt) => { document.addEventListener(type, fn, opt); disposers.push(() => document.removeEventListener(type, fn, opt)); };
  class TrackedIO extends IntersectionObserver {
    constructor(cb, opt) { super(cb, opt); disposers.push(() => this.disconnect()); }
  }
  const fetchData = (name) => fetch(base + '/scenarios/' + name).then((r) => { if (dead) throw ABORT; return r; });
  const HOME_PRE_OFF = () => document.documentElement.classList.remove('sbh-pre');

// ===== sim.js =====
/* Shared simulation clock driven by transient_hybrid.json.
   Every visual (hero wave, stage scene, scope, readouts) subscribes to one clock. */
const Sim = (function () {
  'use strict';
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const subs = [];
  const st = { S: null, T: null, N: 0, DUR: 0, t: 0, speed: 0.25, playing: false, ready: false };
  let last = 0, rafOn = false;

  function idx(t) {
    const T = st.T, N = st.N;
    if (t <= T[0]) return 0;
    if (t >= T[N - 1]) return N - 1;
    let lo = 0, hi = N - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    return lo;
  }
  function emit(now, dt) {
    const f = { t: st.t, i: idx(st.t), S: st.S, T: st.T, N: st.N, DUR: st.DUR, now, dt, playing: st.playing, idx };
    for (const s of subs) { try { s(f); } catch (e) { console.error(e); } }
  }
  function loop(now) {
    if (!st.playing) { rafOn = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    st.t += dt * st.speed; if (st.t > st.DUR) st.t -= st.DUR;
    emit(now, dt);
    raf(loop);
  }
  function play() {
    if (!st.ready) return;
    st.playing = true; HOME.classList.remove('sim-paused');
    if (!rafOn) { rafOn = true; last = performance.now(); raf(loop); }
    emit(performance.now(), 0);
  }
  function pause() { st.playing = false; HOME.classList.add('sim-paused'); emit(performance.now(), 0); }
  function seek(t) { st.t = Math.max(0, Math.min(st.DUR, t)); emit(performance.now(), 0); }

  async function load() {
    const r = await fetchData('transient_hybrid.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    st.S = d.series; st.T = d.series.t; st.N = st.T.length; st.DUR = st.T[st.N - 1]; st.ready = true;
    return d;
  }

  return {
    RM, load, play, pause, seek, idx,
    on(fn) { subs.push(fn); },
    refresh() { if (st.ready) emit(performance.now(), 0); },
    setSpeed(v) { st.speed = v; },
    get t() { return st.t; }, get playing() { return st.playing; }, get ready() { return st.ready; },
    get DUR() { return st.DUR; }, get S() { return st.S; }, get T() { return st.T; }, get N() { return st.N; },
  };
})();

// ===== stage.js =====
/* Stage: isometric hardware scene + readouts + scope + hero wave, all driven by Sim */
const Stage = (function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  function mk(tag, a, p) { const e = document.createElementNS(NS, tag); if (a) for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  const f1 = (v) => (+v).toFixed(1);

  // ---------------- isometric helpers ----------------
  const SC = 44, CO = Math.cos(Math.PI / 6), SI = 0.5, OX = 400, OY = 140;
  const P = (x, y, z = 0) => [OX + (x - y) * CO * SC, OY + (x + y) * SI * SC - z * SC];
  const pt = (x, y, z) => P(x, y, z).map(f1).join(',');
  const poly = (arr) => arr.map((a) => pt(a[0], a[1], a[2] || 0)).join(' ');
  const mLeft = (x0, y1, z1) => { const [X, Y] = P(x0, y1, z1); return `matrix(${CO},${SI},0,1,${f1(X)},${f1(Y)})`; };
  const mRight = (x1, y1, z1) => { const [X, Y] = P(x1, y1, z1); return `matrix(${CO},${-SI},0,1,${f1(X)},${f1(Y)})`; };
  const mTop = (x0, y0, z1) => { const [X, Y] = P(x0, y0, z1); return `matrix(${CO},${SI},${-CO},${SI},${f1(X)},${f1(Y)})`; };

  function box(g, x0, y0, z0, dx, dy, dz, f) {
    const x1 = x0 + dx, y1 = y0 + dy, z1 = z0 + dz;
    mk('polygon', { points: poly([[x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [x1, y0, z0]]), fill: f.right }, g);
    mk('polygon', { points: poly([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]), fill: f.left }, g);
    mk('polygon', { points: poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]), fill: f.top }, g);
    if (f.edge) {
      mk('polyline', { points: poly([[x0, y1, z1], [x1, y1, z1], [x1, y0, z1]]), fill: 'none', stroke: f.edge, 'stroke-width': 1, 'stroke-linejoin': 'round' }, g);
      mk('polyline', { points: poly([[x0, y0, z1], [x0, y1, z1]]), fill: 'none', stroke: f.edge, 'stroke-opacity': 0.45, 'stroke-width': 1 }, g);
      mk('polyline', { points: poly([[x1, y0, z1], [x0, y0, z1]]), fill: 'none', stroke: f.edge, 'stroke-opacity': 0.3, 'stroke-width': 1 }, g);
      mk('polyline', { points: poly([[x1, y1, z1], [x1, y1, z0]]), fill: 'none', stroke: f.edge, 'stroke-opacity': 0.55, 'stroke-width': 1 }, g);
    }
  }
  function cyl(g, cx, cy, z0, r, h, f) {
    const [X, Yb] = P(cx, cy, z0), Yt = Yb - h * SC;
    const rx = r * SC * 1.2247, ry = r * SC * 0.7071;
    const body = mk('path', { d: `M${f1(X - rx)} ${f1(Yt)} V${f1(Yb)} A${f1(rx)} ${f1(ry)} 0 0 0 ${f1(X + rx)} ${f1(Yb)} V${f1(Yt)} Z`, fill: f.body }, g);
    const top = mk('ellipse', { cx: f1(X), cy: f1(Yt), rx: f1(rx), ry: f1(ry), fill: f.top, stroke: f.stroke || 'none', 'stroke-width': 0.8 }, g);
    return { X, Yt, Yb, rx, ry, body, top };
  }

  const DEFS = `
  <linearGradient id="gLfpL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232b30"/><stop offset="1" stop-color="#121719"/></linearGradient>
  <linearGradient id="gLfpR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151b1e"/><stop offset="1" stop-color="#0a0d0f"/></linearGradient>
  <linearGradient id="gLfpT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a575d"/><stop offset=".55" stop-color="#2d363b"/><stop offset="1" stop-color="#3a454a"/></linearGradient>
  <linearGradient id="gMetal" x1="0" x2="1"><stop offset="0" stop-color="#2a3236"/><stop offset=".28" stop-color="#a7b3b6"/><stop offset=".5" stop-color="#4b565a"/><stop offset=".85" stop-color="#1b2124"/><stop offset="1" stop-color="#3b4549"/></linearGradient>
  <linearGradient id="gCan" x1="0" x2="1"><stop offset="0" stop-color="#08100e"/><stop offset=".26" stop-color="#244a40"/><stop offset=".42" stop-color="#14302a"/><stop offset=".8" stop-color="#0a1513"/><stop offset="1" stop-color="#132622"/></linearGradient>
  <linearGradient id="gCanTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a9896"/><stop offset=".5" stop-color="#3c4846"/><stop offset="1" stop-color="#252e2c"/></linearGradient>
  <linearGradient id="gTrayL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#18221f"/><stop offset="1" stop-color="#0e1412"/></linearGradient>
  <linearGradient id="gRackL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151c20"/><stop offset="1" stop-color="#0b1013"/></linearGradient>
  <linearGradient id="gRackR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1215"/><stop offset="1" stop-color="#07090b"/></linearGradient>
  <linearGradient id="gRackT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#36424a"/><stop offset="1" stop-color="#1f272c"/></linearGradient>
  <linearGradient id="gPlateT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#121a1e"/><stop offset="1" stop-color="#0c1215"/></linearGradient>
  <linearGradient id="gFill" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffb23e" stop-opacity=".62"/><stop offset=".8" stop-color="#ffb23e" stop-opacity=".2"/><stop offset="1" stop-color="#ffd896" stop-opacity=".55"/></linearGradient>
  <linearGradient id="gGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".09"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset=".62" stop-color="#fff" stop-opacity=".045"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="gFloor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#3dff9a" stop-opacity=".16"/><stop offset="1" stop-color="#3dff9a" stop-opacity="0"/></radialGradient>
  <filter id="fGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="fHalo" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="fShadow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="16"/></filter>`;

  // geometry constants
  const LFP = { x: 1, y: 4.4, dx: 4.4, dy: 1.9, dz: 4.8 };
  const TRAY = { x: 6.5, y: 4.0, dx: 4.0, dy: 2.6, dz: 0.32 };
  const CANS = [[7.3, 4.7], [8.5, 4.7], [7.3, 5.9], [9.7, 4.7], [8.5, 5.9], [9.7, 5.9]];
  const RACK = { x: 11.8, y: 1.0, dx: 2.8, dy: 2.6, dz: 6.6 };
  const LANE = 7.5;
  const ROUTES = {
    lfpLoad: [[3.2, 6.3], [3.2, LANE], [8.5, LANE], [13.2, LANE], [13.2, 3.6]],
    licLoad: [[8.5, 6.6], [8.5, LANE], [13.2, LANE], [13.2, 3.6]],
    lfpLic: [[3.2, 6.3], [3.2, LANE], [8.5, LANE], [8.5, 6.6]],
  };
  // window mapping inside LFP left face (local px)
  const WIN = { x: 16, y: 26, w: 162, h: 166 };
  const cellY = (v) => WIN.y + WIN.h - 4 - ((v - 3.0) / 0.5) * (WIN.h - 10);
  const CAN_R = 0.46, CAN_H = 2.5;

  const E = {}; // element refs
  const FOCI = {};

  function build() {
    const svg = $('scene');
    const defs = mk('defs', {}, svg); defs.innerHTML = DEFS;
    const cam = mk('g', { id: 'cam' }, svg); E.cam = cam;

    // shadow + plate
    const PL = { x: 0, y: 0, dx: 15.6, dy: 8.6 };
    mk('polygon', { points: poly([[0.6, 1.2, -0.9], [15.8, 1.2, -0.9], [15.8, 9.4, -0.9], [0.6, 9.4, -0.9]]), fill: '#000', opacity: 0.75, filter: 'url(#fShadow)' }, cam);
    box(cam, PL.x, PL.y, -0.42, PL.dx, PL.dy, 0.42, { top: 'url(#gPlateT)', left: '#0b1013', right: '#07090b', edge: 'rgba(200,230,220,.16)' });
    const grid = mk('g', { transform: mTop(0, 0, 0), opacity: 0.9 }, cam);
    for (let u = 1; u < PL.dx; u++) mk('line', { x1: u * SC, y1: 0, x2: u * SC, y2: PL.dy * SC, stroke: 'rgba(120,170,155,.07)' }, grid);
    for (let v = 1; v < PL.dy; v++) mk('line', { x1: 0, y1: v * SC, x2: PL.dx * SC, y2: v * SC, stroke: 'rgba(120,170,155,.07)' }, grid);
    mk('text', { x: 14, y: PL.dy * SC - 12, fill: 'rgba(160,190,180,.35)', 'font-size': 11, 'letter-spacing': 2 }, grid).textContent = 'SYSBLADE · HYPERBUFFER · DC BUS';
    // floor glow under LIC
    E.floorGlow = mk('ellipse', { cx: f1(P(8.5, 5.3)[0]), cy: f1(P(8.5, 5.3)[1]), rx: 170, ry: 98, fill: 'url(#gFloor)', opacity: 0 }, cam);

    // traces
    const tg = mk('g', {}, cam);
    const route = (r) => r.map(([x, y]) => pt(x, y, 0.02)).join(' ');
    const allLines = [ROUTES.lfpLoad, ROUTES.licLoad.slice(0, 2)];
    allLines.forEach((r) => mk('polyline', { points: route(r), fill: 'none', stroke: '#141d22', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, tg));
    allLines.forEach((r) => mk('polyline', { points: route(r), fill: 'none', stroke: '#2a3a42', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, tg));
    E.glow = {
      lfp: mk('polyline', { points: route([[3.2, 6.3], [3.2, LANE], [8.5, LANE]]), fill: 'none', stroke: '#ffb23e', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', filter: 'url(#fGlow)', opacity: 0 }, tg),
      lic: mk('polyline', { points: route(ROUTES.licLoad.slice(0, 2)), fill: 'none', stroke: '#3dff9a', 'stroke-width': 2.4, 'stroke-linecap': 'round', filter: 'url(#fGlow)', opacity: 0 }, tg),
      bus: mk('polyline', { points: route([[8.5, LANE], [13.2, LANE], [13.2, 3.6]]), fill: 'none', stroke: '#f2f5f3', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', filter: 'url(#fGlow)', opacity: 0 }, tg),
    };
    [[3.2, 6.3], [3.2, LANE], [8.5, LANE], [13.2, LANE], [8.5, 6.6], [13.2, 3.6]].forEach(([x, y]) => {
      const [X, Y] = P(x, y, 0.02);
      mk('ellipse', { cx: f1(X), cy: f1(Y), rx: 7.5, ry: 4.3, fill: '#1a252b', stroke: '#3d4f57', 'stroke-width': 0.8 }, tg);
    });

    // ---------- LFP battery ----------
    const gL = mk('g', { class: 'fg f-lfp' }, cam);
    E.lfpHalo = mk('ellipse', { cx: f1(P(3.2, 5.35, 2.4)[0]), cy: f1(P(3.2, 5.35, 2.4)[1]), rx: 150, ry: 150, fill: '#ffb23e', opacity: 0.05, filter: 'url(#fHalo)' }, gL);
    box(gL, LFP.x, LFP.y, 0, LFP.dx, LFP.dy, LFP.dz, { top: 'url(#gLfpT)', left: 'url(#gLfpL)', right: 'url(#gLfpR)', edge: 'rgba(255,255,255,.28)' });
    // left (front) face: cutaway window
    const x1 = LFP.x + LFP.dx, y1 = LFP.y + LFP.dy, z1 = LFP.dz;
    const face = mk('g', { transform: mLeft(LFP.x, y1, z1) }, gL);
    const W = WIN;
    mk('rect', { x: W.x - 3, y: W.y - 3, width: W.w + 6, height: W.h + 6, rx: 5, fill: '#0b0f11', stroke: 'rgba(255,255,255,.08)' }, face);
    mk('rect', { x: W.x, y: W.y, width: W.w, height: W.h, rx: 3, fill: '#040607' }, face);
    const cp = mk('clipPath', { id: 'cWin' }, face); mk('rect', { x: W.x, y: W.y, width: W.w, height: W.h, rx: 3 }, cp);
    const inner = mk('g', { 'clip-path': 'url(#cWin)' }, face);
    E.level = mk('rect', { x: W.x, y: 120, width: W.w, height: 80, fill: 'url(#gFill)' }, inner);
    for (let y = W.y + 3, i = 0; y < W.y + W.h; y += 4.4, i++) {
      mk('line', { x1: W.x, x2: W.x + W.w, y1: f1(y), y2: f1(y), stroke: i % 2 ? '#3a2a10' : '#1a2326', 'stroke-width': 1.3, opacity: 0.85 }, inner);
    }
    mk('line', { x1: W.x + W.w * 0.5, x2: W.x + W.w * 0.5, y1: W.y, y2: W.y + W.h, stroke: '#020304', 'stroke-width': 3 }, inner);
    E.meniscus = mk('rect', { x: W.x, y: 120, width: W.w, height: 1.6, fill: '#ffe1a8', filter: 'url(#fGlow)' }, inner);
    E.ions = [];
    const ionG = mk('g', {}, inner);
    for (let i = 0; i < 22; i++) {
      const c = mk('circle', { r: 1.5, fill: '#ffe2b0', opacity: 0.7 }, ionG);
      E.ions.push({ c, x: W.x + 6 + Math.random() * (W.w - 12), y: W.y + Math.random() * W.h, v: 0.55 + Math.random() * 0.9 });
    }
    mk('rect', { x: W.x, y: W.y, width: W.w, height: 7, fill: '#000', opacity: 0.55 }, inner);
    mk('rect', { x: W.x, y: W.y, width: 5, height: W.h, fill: '#000', opacity: 0.4 }, inner);
    mk('rect', { x: W.x, y: W.y, width: W.w, height: W.h, fill: 'url(#gGlass)' }, inner);
    mk('rect', { x: W.x, y: W.y, width: W.w, height: W.h, rx: 3, fill: 'none', stroke: 'rgba(255,178,62,.45)', 'stroke-width': 1 }, face);
    E.vmark = mk('path', { d: 'M180 0 l7 -4.5 v9z', fill: '#ffd38a' }, face);
    // right face: branding
    const rf = mk('g', { transform: mRight(x1, y1, z1) }, gL);
    for (let u = 8; u < LFP.dy * SC; u += 9) mk('line', { x1: u, x2: u, y1: 60, y2: LFP.dz * SC - 10, stroke: 'rgba(255,255,255,.035)' }, rf);
    mk('text', { x: 12, y: 32, fill: '#ffb23e', 'font-size': 17, 'font-weight': 600, 'letter-spacing': 3 }, rf).textContent = 'LFP';
    mk('text', { x: 12, y: 47, fill: '#6f7f7b', 'font-size': 8, 'letter-spacing': 1 }, rf).textContent = 'PyBaMM DFN';
    mk('rect', { x: 12, y: 56, width: 52, height: 1, fill: 'rgba(255,178,62,.5)' }, rf);
    // top face details
    const tf = mk('g', { transform: mTop(LFP.x, LFP.y, z1) }, gL);
    mk('rect', { x: 8, y: 8, width: LFP.dx * SC - 16, height: LFP.dy * SC - 16, rx: 6, fill: 'none', stroke: 'rgba(255,255,255,.08)' }, tf);
    mk('ellipse', { cx: LFP.dx * SC / 2, cy: LFP.dy * SC / 2, rx: 16, ry: 11, fill: '#20282c', stroke: 'rgba(255,255,255,.14)' }, tf);
    mk('ellipse', { cx: LFP.dx * SC / 2, cy: LFP.dy * SC / 2, rx: 9, ry: 6, fill: 'none', stroke: 'rgba(255,255,255,.08)' }, tf);
    E.lfpLed = mk('circle', { cx: LFP.dx * SC / 2 + 34, cy: LFP.dy * SC / 2, r: 3, fill: '#ffb23e', filter: 'url(#fGlow)' }, tf);
    cyl(gL, 1.75, 5.35, z1, 0.3, 0.32, { body: 'url(#gMetal)', top: '#b9c4c6', stroke: '#6b777a' });
    cyl(gL, 4.65, 5.35, z1, 0.3, 0.32, { body: 'url(#gMetal)', top: '#b9c4c6', stroke: '#6b777a' });
    const tp = mk('g', { transform: mTop(LFP.x, LFP.y, z1) }, gL);
    mk('text', { x: 46, y: 50, fill: '#ffb23e', 'font-size': 13, 'font-weight': 600 }, tp).textContent = '+';
    mk('text', { x: 156, y: 50, fill: '#8a9895', 'font-size': 13, 'font-weight': 600 }, tp).textContent = '−';

    // ---------- LIC bank ----------
    const gC = mk('g', { class: 'fg f-lic' }, cam);
    box(gC, TRAY.x, TRAY.y, 0, TRAY.dx, TRAY.dy, TRAY.dz, { top: '#18231f', left: 'url(#gTrayL)', right: '#0a0f0e', edge: 'rgba(160,255,210,.16)' });
    E.cans = [];
    CANS.forEach(([cx, cy]) => {
      const g = mk('g', {}, gC);
      const [hx, hy] = P(cx, cy, TRAY.dz + CAN_H * 0.55);
      const halo = mk('ellipse', { cx: f1(hx), cy: f1(hy), rx: 34, ry: 62, fill: '#3dff9a', opacity: 0, filter: 'url(#fHalo)' }, g);
      const c = cyl(g, cx, cy, TRAY.dz, CAN_R, CAN_H, { body: 'url(#gCan)', top: 'url(#gCanTop)', stroke: '#6d7a78' });
      const X = c.X, rx = c.rx, ry = c.ry;
      const band = (yy, w, col, op) => mk('path', { d: `M${f1(X - rx)} ${f1(yy)} A${f1(rx)} ${f1(ry)} 0 0 0 ${f1(X + rx)} ${f1(yy)}`, fill: 'none', stroke: col, 'stroke-width': w, opacity: op }, g);
      const ring = band(c.Yt + 9, 2.2, '#3dff9a', 0.3);
      band(c.Yt + 14, 0.8, '#3dff9a', 0.18);
      // level slit
      const sTop = c.Yt + 24, sBot = c.Yb + ry - 10;
      mk('rect', { x: f1(X - 2.4), y: f1(sTop), width: 4.8, height: f1(sBot - sTop), rx: 2.4, fill: '#030605', stroke: 'rgba(61,255,154,.2)', 'stroke-width': 0.6 }, g);
      const lvl = mk('rect', { x: f1(X - 1.6), y: f1(sTop), width: 3.2, height: 1, rx: 1.6, fill: '#3dff9a' }, g);
      const uv = sBot - ((38 - 30) / 22) * (sBot - sTop);
      mk('line', { x1: f1(X - 5), x2: f1(X + 5), y1: f1(uv), y2: f1(uv), stroke: '#ff4d5e', 'stroke-width': 1 }, g);
      // cap details
      mk('ellipse', { cx: f1(X), cy: f1(c.Yt), rx: f1(rx * 0.62), ry: f1(ry * 0.62), fill: 'none', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 1 }, g);
      const capRing = mk('ellipse', { cx: f1(X), cy: f1(c.Yt), rx: f1(rx * 0.86), ry: f1(ry * 0.86), fill: 'none', stroke: '#3dff9a', 'stroke-width': 1.4, opacity: 0.15 }, g);
      [-0.32, 0.32].forEach((k) => { mk('ellipse', { cx: f1(X + rx * k), cy: f1(c.Yt - 1), rx: 3.4, ry: 2, fill: '#c9d3d1', stroke: '#596462', 'stroke-width': 0.5 }, g); });
      E.cans.push({ halo, ring, capRing, lvl, sTop, sBot });
    });
    // busbar strap across cans
    mk('polyline', { points: poly([[7.3, 5.3, TRAY.dz + CAN_H + 0.05], [9.7, 5.3, TRAY.dz + CAN_H + 0.05]]), stroke: '#8f9c9a', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.0 }, gC);

    // ---------- rack ----------
    const gR = mk('g', { class: 'fg f-load' }, cam);
    box(gR, RACK.x, RACK.y, 0, RACK.dx, RACK.dy, RACK.dz, { top: 'url(#gRackT)', left: 'url(#gRackL)', right: 'url(#gRackR)', edge: 'rgba(255,255,255,.22)' });
    const rx1 = RACK.x + RACK.dx, ry1 = RACK.y + RACK.dy;
    const fr = mk('g', { transform: mLeft(RACK.x, ry1, RACK.dz) }, gR);
    const FW = RACK.dx * SC, FH = RACK.dz * SC;
    mk('rect', { x: 5, y: 6, width: FW - 10, height: FH - 12, rx: 3, fill: '#080b0d', stroke: 'rgba(255,255,255,.07)' }, fr);
    E.leds = [];
    const nB = 13, bh = (FH - 24) / nB;
    for (let i = 0; i < nB; i++) {
      const y = 12 + i * bh;
      mk('rect', { x: 10, y: f1(y), width: FW - 20, height: f1(bh - 3.4), rx: 1.5, fill: '#0f1518', stroke: '#1c272c', 'stroke-width': 0.8 }, fr);
      for (let k = 0; k < 7; k++) mk('line', { x1: 16 + k * 5, x2: 16 + k * 5, y1: f1(y + 4), y2: f1(y + bh - 7.5), stroke: '#1e292e', 'stroke-width': 1.2 }, fr);
      mk('rect', { x: FW - 26, y: f1(y + 3), width: 2.5, height: f1(bh - 9.5), fill: '#26323a' }, fr);
      const row = [];
      for (let k = 0; k < 3; k++) row.push(mk('rect', { x: 62 + k * 8, y: f1(y + bh / 2 - 3.2), width: 4, height: 2.6, rx: 0.8, fill: '#f2f5f3', opacity: 0.15 }, fr));
      E.leds.push(row);
    }
    E.rackGlow = mk('rect', { x: 8, y: 8, width: FW - 16, height: FH - 16, fill: '#f2f5f3', opacity: 0, filter: 'url(#fHalo)' }, fr);
    const rr = mk('g', { transform: mRight(rx1, ry1, RACK.dz) }, gR);
    for (let u = 10; u < RACK.dy * SC - 6; u += 7) mk('line', { x1: u, x2: u, y1: 14, y2: FH - 14, stroke: 'rgba(255,255,255,.04)', 'stroke-width': 2 }, rr);
    const rt = mk('g', { transform: mTop(RACK.x, RACK.y, RACK.dz) }, gR);
    E.fans = [];
    [[RACK.dx * SC * 0.3, RACK.dy * SC * 0.5], [RACK.dx * SC * 0.72, RACK.dy * SC * 0.5]].forEach(([cx, cy]) => {
      mk('circle', { cx, cy, r: 27, fill: '#0b0f12', stroke: 'rgba(255,255,255,.12)' }, rt);
      const blades = mk('g', {}, rt);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        mk('path', { d: `M${cx} ${cy} q ${f1(Math.cos(a) * 14 - Math.sin(a) * 8)} ${f1(Math.sin(a) * 14 + Math.cos(a) * 8)} ${f1(Math.cos(a) * 23)} ${f1(Math.sin(a) * 23)}`, fill: 'none', stroke: '#3a474e', 'stroke-width': 3, 'stroke-linecap': 'round' }, blades);
      }
      mk('circle', { cx, cy, r: 5, fill: '#2f3a40' }, rt);
      E.fans.push({ g: blades, cx, cy, a: 0 });
    });

    // particles (above everything on the floor lane)
    E.part = mk('g', {}, cam);

    // ---------- callouts ----------
    const callout = (cls, ax, ay, bx, by, lx, title, sub, liveId, col) => {
      const g = mk('g', { class: 'fg ' + cls }, cam);
      mk('polyline', { points: `${f1(ax)},${f1(ay)} ${f1(bx)},${f1(by)} ${f1(lx)},${f1(by)}`, fill: 'none', stroke: 'rgba(227,235,232,.35)', 'stroke-width': 0.9 }, g);
      mk('circle', { cx: f1(ax), cy: f1(ay), r: 3, fill: col }, g);
      mk('circle', { cx: f1(ax), cy: f1(ay), r: 7, fill: 'none', stroke: col, opacity: 0.4 }, g);
      const tx = Math.min(bx, lx);
      mk('text', { x: f1(tx), y: f1(by - 46), class: 'zh co-t', fill: '#eef3f1', 'font-size': 18, 'font-weight': 700 }, g).textContent = title;
      mk('text', { x: f1(tx), y: f1(by - 26), class: 'co-s', fill: '#8b9b97', 'font-size': 12 }, g).textContent = sub;
      const lv = mk('text', { x: f1(tx), y: f1(by - 8), class: 'co-v', fill: col, 'font-size': 13.5, 'font-weight': 500 }, g);
      lv.textContent = '—'; E[liveId] = lv;
    };
    const aL = P(LFP.x, y1, 3.9), aC = P(8.5, 4.7, TRAY.dz + CAN_H + 0.02), aR = P(13.2, 2.3, RACK.dz);
    callout('f-lfp', aL[0] + 8, aL[1] + 4, aL[0] - 30, aL[1] - 54, aL[0] - 170, 'LFP 電池', 'PyBaMM DFN · Prada2013', 'cvLfp', '#ffb23e');
    callout('f-lic', aC[0], aC[1] - 4, aC[0], aC[1] - 86, aC[0] + 150, 'LIC 電容組', '332 F · ESR 2.5 mΩ · UVLO 38 V', 'cvLic', '#3dff9a');
    callout('f-load', aR[0], aR[1] - 2, aR[0], aR[1] - 70, aR[0] + 150, 'AI 機櫃負載', '56 ↔ 104 kW · 5 Hz', 'cvLoad', '#f2f5f3');

    // focus points for the camera
    FOCI.load = P(13.0, 2.3, 5.2); FOCI.lic = P(8.5, 5.3, 1.6); FOCI.lfp = P(3.2, 5.35, 2.6);
    // fit viewBox to content
    const bb = cam.getBBox();
    const pad = 40;
    E.vb = { x: bb.x - pad, y: bb.y - pad, w: bb.width + pad * 2, h: bb.height + pad * 2 };
    svg.setAttribute('viewBox', `${f1(E.vb.x)} ${f1(E.vb.y)} ${f1(E.vb.w)} ${f1(E.vb.h)}`);
    FOCI.all = [E.vb.x + E.vb.w / 2, E.vb.y + E.vb.h / 2];
    E.camState = { k: 1, fx: FOCI.all[0], fy: FOCI.all[1] };
    applyCam();

    // particle paths in screen space
    E.paths = {};
    for (const k in ROUTES) {
      const pts = ROUTES[k].map(([x, y]) => P(x, y, 0.06));
      const seg = []; let L = 0;
      for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1b, y1b] = pts[i]; const l = Math.hypot(x1b - x0, y1b - y0); seg.push({ x0, y0, x1: x1b, y1: y1b, l, s: L }); L += l; }
      E.paths[k] = { seg, L };
    }
  }

  function applyCam() {
    const c = E.camState, vb = E.vb;
    const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    E.cam.setAttribute('transform', `translate(${f1(cx)} ${f1(cy)}) scale(${c.k.toFixed(4)}) translate(${f1(-c.fx)} ${f1(-c.fy)})`);
  }
  function camTo(focus, k) {
    const [fx, fy] = FOCI[focus] || FOCI.all;
    return { k, fx, fy };
  }

  // ---------------- particles ----------------
  const pool = [];
  const acc = { lfpLoad: 0, licLoad: 0, lfpLic: 0 };
  const PCOL = { lfpLoad: ['#ffb23e', '#ffe6bd'], licLoad: ['#3dff9a', '#c9ffe2'], lfpLic: ['#ffb23e', '#ffe6bd'] };
  const SPEED = 260, K = 0.3;
  function at(p, d) {
    for (const s of p.seg) if (d <= s.s + s.l) { const k = (d - s.s) / s.l; return [s.x0 + (s.x1 - s.x0) * k, s.y0 + (s.y1 - s.y0) * k]; }
    const s = p.seg[p.seg.length - 1]; return [s.x1, s.y1];
  }
  function spawn(kind, d) {
    let p = pool.find((o) => !o.alive);
    if (!p) {
      const g = mk('g', {}, E.part);
      const h = mk('circle', { r: 6, opacity: 0.22 }, g), c = mk('circle', { r: 2.1 }, g);
      p = { g, h, c }; pool.push(p);
    }
    p.kind = kind; p.d = d || 0; p.alive = true; p.g.style.display = '';
    p.h.setAttribute('fill', PCOL[kind][0]); p.c.setAttribute('fill', PCOL[kind][1]);
  }
  function flows(S, i) {
    const pt_ = S.p_total_kw[i], pl = S.p_lic_kw[i], pf = S.p_lfp_kw[i];
    return { lfpLoad: Math.min(pf, pt_), licLoad: Math.max(0, pl), lfpLic: Math.max(0, -pl) };
  }
  function clearParticles() { pool.forEach((p) => { p.alive = false; p.g.style.display = 'none'; }); }
  function seedStatic(S, i) {
    clearParticles();
    const f = flows(S, i);
    for (const k in f) { const L = E.paths[k].L; const n = Math.round(f[k] * K * (L / SPEED)); for (let j = 0; j < n; j++) spawn(k, (j + 0.5) * (L / n)); }
    placeParticles();
  }
  function placeParticles() {
    for (const p of pool) { if (!p.alive) continue; const [x, y] = at(E.paths[p.kind], p.d); p.g.setAttribute('transform', `translate(${f1(x)} ${f1(y)})`); }
  }

  // ---------------- per-frame render ----------------
  let lastText = 0;
  const els = {};
  function render(f) {
    const { S, i, dt, playing, now } = f;
    const pt_ = S.p_total_kw[i], pl = S.p_lic_kw[i], pf = S.p_lfp_kw[i], vc = S.v_cell[i], vl = S.v_lic[i];
    // LFP
    const ly = cellY(vc);
    E.level.setAttribute('y', f1(ly)); E.level.setAttribute('height', f1(WIN.y + WIN.h - ly));
    E.meniscus.setAttribute('y', f1(ly - 0.8));
    E.vmark.setAttribute('transform', `translate(0 ${f1(ly)})`);
    E.lfpLed.setAttribute('opacity', (0.5 + 0.5 * (pf / 82)).toFixed(2));
    E.lfpHalo.setAttribute('opacity', (0.03 + 0.07 * (pf / 82)).toFixed(3));
    // LIC
    const a = Math.max(0, pl) / 47.5, r = Math.max(0, -pl) / 26.4;
    E.cans.forEach((c) => {
      c.halo.setAttribute('opacity', (a * 0.42).toFixed(3));
      c.ring.setAttribute('opacity', (0.25 + a * 0.75).toFixed(3));
      c.capRing.setAttribute('opacity', (0.12 + a * 0.8 + r * 0.15).toFixed(3));
      const y = c.sBot - ((vl - 30) / 22) * (c.sBot - c.sTop);
      c.lvl.setAttribute('y', f1(y)); c.lvl.setAttribute('height', f1(Math.max(1, c.sBot - y)));
    });
    E.floorGlow.setAttribute('opacity', (a * 0.9).toFixed(3));
    // rack
    const lh = pt_ / 104;
    E.leds.forEach((row, k) => row.forEach((l, j) => {
      l.setAttribute('opacity', lh > 0.8 ? (0.55 + 0.45 * Math.abs(Math.sin(now * 0.005 + k * 1.3 + j * 2.1))).toFixed(2) : '0.18');
    }));
    E.rackGlow.setAttribute('opacity', lh > 0.8 ? '0.07' : '0');
    E.fans.forEach((fn) => { fn.a = (fn.a + dt * 360 * (0.6 + lh)) % 360; fn.g.setAttribute('transform', `rotate(${fn.a.toFixed(1)} ${fn.cx} ${fn.cy})`); });
    // traces
    E.glow.lfp.setAttribute('opacity', (0.25 + 0.6 * (pf / 82)).toFixed(3));
    E.glow.lic.setAttribute('stroke', pl >= 0 ? '#3dff9a' : '#ffb23e');
    E.glow.lic.setAttribute('opacity', (Math.abs(pl) / 47.5 * 0.95).toFixed(3));
    E.glow.bus.setAttribute('opacity', (0.15 + 0.55 * lh * lh).toFixed(3));
    // particles
    if (playing && dt > 0) {
      const fl = flows(S, i);
      for (const k in fl) { acc[k] += fl[k] * K * dt; while (acc[k] >= 1) { acc[k] -= 1; spawn(k, Math.random() * 8); } }
      for (const p of pool) { if (!p.alive) continue; p.d += SPEED * dt; if (p.d >= E.paths[p.kind].L) { p.alive = false; p.g.style.display = 'none'; } }
      placeParticles();
      const sp = (pf / 80) * 34 * dt;
      for (const o of E.ions) {
        o.y -= sp * o.v; if (o.y < ly + 3) { o.y = WIN.y + WIN.h - 3; o.x = WIN.x + 6 + Math.random() * (WIN.w - 12); }
        o.c.setAttribute('cx', f1(o.x)); o.c.setAttribute('cy', f1(o.y));
      }
    } else {
      for (const o of E.ions) { if (o.y < ly + 3) o.y = ly + 6 + Math.random() * (WIN.y + WIN.h - ly - 8); o.c.setAttribute('cx', f1(o.x)); o.c.setAttribute('cy', f1(o.y)); }
    }
    // text (throttled)
    if (!playing || now - lastText > 90) {
      lastText = now;
      els.load.textContent = pt_.toFixed(1);
      els.lic.textContent = (pl > 0.05 ? '+' : pl < -0.05 ? '−' : '') + Math.abs(pl).toFixed(1);
      els.lfp.textContent = pf.toFixed(1);
      els.vcell.textContent = vc.toFixed(3);
      const hot = pl > 1;
      els.roLic.classList.toggle('hot', hot);
      els.licState.textContent = hot ? '放電 · 吸收瞬態' : pl < -1 ? '回充 · 由 LFP 補能' : '待機';
      E.cvLfp.textContent = `P ${pf.toFixed(1)} kW · V_cell ${vc.toFixed(3)} V`;
      E.cvLic.textContent = `P ${(pl >= 0 ? '+' : '−') + Math.abs(pl).toFixed(1)} kW · V_LIC ${vl.toFixed(2)} V`;
      E.cvLoad.textContent = `P ${pt_.toFixed(1)} kW`;
      els.navV.textContent = `P_LOAD ${pt_.toFixed(1).padStart(5, ' ')} kW`;
      els.navChip.classList.toggle('hi', pt_ > 80);
      els.waveVal.textContent = pt_.toFixed(1);
      els.tc.textContent = f.T[i].toFixed(3).padStart(6, '0');
    }
    if (document.activeElement !== els.scrub) els.scrub.value = f.t.toFixed(3);
    els.scrub.style.setProperty('--p', ((f.t / f.DUR) * 100).toFixed(2) + '%');
  }

  // ---------------- scope (dark) ----------------
  const scope = { cv: null, cx: null, w: 0, h: 0, dpr: 1, hoverX: -1 };
  function sizeCanvas(o) { o.dpr = Math.min(2, window.devicePixelRatio || 1); const r = o.cv.getBoundingClientRect(); o.w = r.width; o.h = r.height; o.cv.width = Math.round(o.w * o.dpr); o.cv.height = Math.round(o.h * o.dpr); }
  function drawScope(f) {
    const o = scope, cx = o.cx; if (!o.w) return;
    const { S, T, DUR, t, idx } = f, WINs = 1.0;
    cx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0); cx.clearRect(0, 0, o.w, o.h);
    const yOf = (kw) => { const top = 16, bot = o.h - 8; return bot - ((kw + 30) / 140) * (bot - top); };
    cx.strokeStyle = '#111a1e'; cx.lineWidth = 1; cx.beginPath();
    for (let k = 1; k < 10; k++) { const x = Math.round((k / 10) * o.w) + 0.5; cx.moveTo(x, 0); cx.lineTo(x, o.h); }
    cx.stroke();
    cx.strokeStyle = '#22303a'; cx.setLineDash([3, 4]); cx.beginPath(); const y0 = Math.round(yOf(0)) + 0.5; cx.moveTo(0, y0); cx.lineTo(o.w, y0); cx.stroke(); cx.setLineDash([]);
    cx.fillStyle = '#4d5b58'; cx.font = '10px ' + FONT.mono;
    cx.fillText('100 ms/div', 0, 11); cx.fillText('0 kW', o.w - 34, y0 - 4);
    const t0 = t - WINs;
    const ranges = t0 < 0 ? [[DUR + t0, DUR, -DUR], [0, t, 0]] : [[t0, t, 0]];
    for (const [key, col, step, lw, blur] of [['p_total_kw', '#f2f5f3', true, 1.3, 0], ['p_lic_kw', '#3dff9a', true, 1.7, 7], ['p_lfp_kw', '#ffb23e', false, 2, 7]]) {
      cx.strokeStyle = col; cx.lineWidth = lw; cx.shadowColor = col; cx.shadowBlur = blur; cx.beginPath();
      for (const [a, b, off] of ranges) {
        let first = true, py = 0;
        for (let j = idx(a); j < f.N && T[j] <= b + 1e-9; j++) {
          const x = ((T[j] + off - t0) / WINs) * o.w, y = yOf(S[key][j]);
          if (first) { cx.moveTo(x, y); first = false; } else { if (step) cx.lineTo(x, py); cx.lineTo(x, y); }
          py = y;
        }
      }
      cx.stroke();
    }
    cx.shadowBlur = 0;
    const tip = $('trace-cursor');
    if (o.hoverX >= 0) {
      cx.strokeStyle = 'rgba(227,235,232,.5)'; cx.beginPath(); cx.moveTo(o.hoverX + 0.5, 0); cx.lineTo(o.hoverX + 0.5, o.h); cx.stroke();
      let th = t0 + (o.hoverX / o.w) * WINs; if (th < 0) th += DUR;
      const j = idx(th);
      tip.hidden = false;
      tip.innerHTML = `t ${T[j].toFixed(3)} s　<b style="color:#f2f5f3;font-weight:500">LOAD ${S.p_total_kw[j].toFixed(1)}</b> · <b style="color:#3dff9a;font-weight:500">LIC ${S.p_lic_kw[j].toFixed(1)}</b> · <b style="color:#ffb23e;font-weight:500">LFP ${S.p_lfp_kw[j].toFixed(1)}</b> kW`;
      tip.style.left = Math.min(Math.max(0, o.hoverX + 12), o.w - tip.offsetWidth) + 'px';
    } else tip.hidden = true;
  }

  // ---------------- hero wave (paper) ----------------
  const wave = { cv: null, cx: null, w: 0, h: 0, dpr: 1 };
  function drawWave(f) {
    const o = wave, cx = o.cx; if (!o.w) return;
    const { S, T, DUR, t, idx } = f, WINs = 2.4;
    cx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0); cx.clearRect(0, 0, o.w, o.h);
    const ink = SHARED.ink || '#111111';
    const yOf = (kw) => { const top = 8, bot = o.h - 8; return bot - ((kw - 50) / 60) * (bot - top); };
    cx.strokeStyle = ink; cx.globalAlpha = 0.14; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(0, yOf(56) + 0.5); cx.lineTo(o.w, yOf(56) + 0.5); cx.stroke(); cx.globalAlpha = 1;
    const t0 = t - WINs;
    const ranges = t0 < 0 ? [[DUR + t0, DUR, -DUR], [0, t, 0]] : [[t0, t, 0]];
    const headX = o.w * 0.86;
    cx.lineWidth = 1.6; cx.strokeStyle = ink; cx.lineJoin = 'miter'; cx.beginPath();
    let lastXY = null;
    for (const [a, b, off] of ranges) {
      let first = true, py = 0;
      for (let j = idx(a); j < f.N && T[j] <= b + 1e-9; j++) {
        const x = ((T[j] + off - t0) / WINs) * headX, y = yOf(S.p_total_kw[j]);
        if (first) { cx.moveTo(x, y); first = false; } else { cx.lineTo(x, py); cx.lineTo(x, y); }
        py = y; lastXY = [x, y];
      }
    }
    if (lastXY) cx.lineTo(headX, lastXY[1]);
    cx.stroke();
    // future: faint dotted continuation
    cx.setLineDash([2, 5]); cx.globalAlpha = 0.25; cx.beginPath(); cx.moveTo(headX, lastXY ? lastXY[1] : 0); cx.lineTo(o.w, lastXY ? lastXY[1] : 0); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1;
    if (lastXY) {
      cx.fillStyle = '#ff4f1a'; cx.beginPath(); cx.arc(headX, lastXY[1], 4, 0, Math.PI * 2); cx.fill();
      cx.globalAlpha = 0.18; cx.beginPath(); cx.arc(headX, lastXY[1], 10, 0, Math.PI * 2); cx.fill(); cx.globalAlpha = 1;
    }
  }

  // ---------------- hero sketch (paper line art, foreshadows the stage) ----------------
  function buildSketch() {
    const svg = $('hero-sketch'); if (!svg) return;
    const g = mk('g', {}, svg);
    const face = (pts) => mk('polygon', { points: poly(pts), class: 'sk-face' }, g);
    const sbox = (x0, y0, z0, dx, dy, dz) => { const x1 = x0 + dx, y1 = y0 + dy, z1 = z0 + dz;
      face([[x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [x1, y0, z0]]); face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]); face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]); };
    const scyl = (cx, cy, z0, r, h) => { const [X, Yb] = P(cx, cy, z0), Yt = Yb - h * SC, rx = r * SC * 1.2247, ry = r * SC * 0.7071;
      mk('path', { d: `M${f1(X - rx)} ${f1(Yt)} V${f1(Yb)} A${f1(rx)} ${f1(ry)} 0 0 0 ${f1(X + rx)} ${f1(Yb)} V${f1(Yt)} Z`, class: 'sk-face' }, g);
      mk('ellipse', { cx: f1(X), cy: f1(Yt), rx: f1(rx), ry: f1(ry), class: 'sk-face' }, g); };
    sbox(0, 0, -0.42, 15.6, 8.6, 0.42);
    mk('polyline', { points: ROUTES.lfpLoad.map(([x, y]) => pt(x, y, 0)).join(' '), class: 'sk-route' }, g);
    mk('polyline', { points: ROUTES.licLoad.slice(0, 2).map(([x, y]) => pt(x, y, 0)).join(' '), class: 'sk-route' }, g);
    sbox(LFP.x, LFP.y, 0, LFP.dx, LFP.dy, LFP.dz);
    const lf = mk('g', { transform: mLeft(LFP.x, LFP.y + LFP.dy, LFP.dz) }, g);
    mk('rect', { x: WIN.x, y: WIN.y, width: WIN.w, height: WIN.h, rx: 3, class: 'sk-thin' }, lf);
    for (let y = WIN.y + 14; y < WIN.y + WIN.h; y += 14) mk('line', { x1: WIN.x, x2: WIN.x + WIN.w, y1: y, y2: y, class: 'sk-thin' }, lf);
    mk('line', { x1: WIN.x, x2: WIN.x + WIN.w, y1: cellY(3.3), y2: cellY(3.3), class: 'sk-lvl' }, lf);
    scyl(1.75, 5.35, LFP.dz, 0.3, 0.32); scyl(4.65, 5.35, LFP.dz, 0.3, 0.32);
    sbox(TRAY.x, TRAY.y, 0, TRAY.dx, TRAY.dy, TRAY.dz);
    CANS.forEach(([cx, cy]) => scyl(cx, cy, TRAY.dz, CAN_R, CAN_H));
    sbox(RACK.x, RACK.y, 0, RACK.dx, RACK.dy, RACK.dz);
    const rf = mk('g', { transform: mLeft(RACK.x, RACK.y + RACK.dy, RACK.dz) }, g);
    for (let i = 1; i < 13; i++) mk('line', { x1: 10, x2: RACK.dx * SC - 10, y1: 12 + i * 21.5, y2: 12 + i * 21.5, class: 'sk-thin' }, rf);
    const lbl = (x, y, z, t) => { const [X, Y] = P(x, y, z); mk('line', { x1: f1(X), y1: f1(Y), x2: f1(X), y2: f1(Y - 34), class: 'sk-thin' }, g); mk('text', { x: f1(X - 2), y: f1(Y - 42), class: 'sk-lbl' }, g).textContent = t; };
    lbl(1.6, 4.4, LFP.dz + 0.3, 'LFP'); lbl(8.5, 4.7, TRAY.dz + CAN_H, 'LIC'); lbl(12.6, 1.0, RACK.dz, 'LOAD');
    const bb = g.getBBox();
    svg.setAttribute('viewBox', `${f1(bb.x - 4)} ${f1(bb.y - 4)} ${f1(bb.width + 8)} ${f1(bb.height + 8)}`);
  }

  // ---------------- public ----------------
  function init() {
    els.load = $('ro-load'); els.lic = $('ro-lic'); els.lfp = $('ro-lfp'); els.vcell = $('ro-vcell');
    els.roLic = document.querySelector('.ro[data-k=lic]'); els.licState = $('ro-lic-state');
    els.tc = $('tc'); els.scrub = $('scrub'); els.navV = $('nav-chip-v'); els.navChip = document.querySelector('.nav-chip'); els.waveVal = $('wave-val');
    build();
    buildSketch();
    scope.cv = $('scope'); scope.cx = scope.cv.getContext('2d');
    wave.cv = $('wave'); wave.cx = wave.cv.getContext('2d');
    const resize = () => { sizeCanvas(scope); sizeCanvas(wave); Sim.refresh(); };
    resize(); onWin('resize', resize);
    scope.cv.addEventListener('pointermove', (e) => { scope.hoverX = e.clientX - scope.cv.getBoundingClientRect().left; if (!Sim.playing) Sim.refresh(); });
    scope.cv.addEventListener('pointerleave', () => { scope.hoverX = -1; if (!Sim.playing) Sim.refresh(); });

    Sim.on((f) => { render(f); drawScope(f); drawWave(f); });

    const stage = $('stage');
    const setUI = () => {
      const p = Sim.playing;
      stage.classList.toggle('paused', !p);
      $('btn-play').setAttribute('aria-label', p ? '暫停' : '播放');
      $('btn-play').setAttribute('aria-pressed', String(p));
    };
    $('btn-play').addEventListener('click', () => { if (Sim.playing) Sim.pause(); else Sim.play(); setUI(); });
    els.scrub.max = Sim.DUR.toFixed(3);
    els.scrub.addEventListener('input', () => { if (Sim.playing) { Sim.pause(); setUI(); } Sim.seek(+els.scrub.value); seedStatic(Sim.S, Sim.idx(Sim.t)); Sim.refresh(); });
    document.querySelectorAll('#stage .speed button').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#stage .speed button').forEach((x) => x.classList.toggle('on', x === b));
      Sim.setSpeed(+b.dataset.speed); if (!Sim.playing) { Sim.play(); setUI(); }
    }));

    const q = new URLSearchParams(location.search);
    if (q.has('t') || Sim.RM) {
      Sim.seek(q.has('t') ? +q.get('t') : 0.105);
      seedStatic(Sim.S, Sim.idx(Sim.t));
      Sim.pause();
    } else Sim.play();
    setUI();
  }

  return {
    init,
    setFocus(focus) {
      $('scene').setAttribute('data-focus', focus);
      $('readouts').setAttribute('data-focus', focus);
    },
    camTo, applyCam,
    iso: { P, pt, poly, mLeft, mRight, mTop, box, cyl, mk, f1, SC, CO, SI, DEFS },
    get cam() { return E.camState; },
  };
})();

// ===== sections.js =====
/* Paper sections: pain compare, τ split, AI scatter, verify grid */
const Sections = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const q = new URLSearchParams(location.search);
  const INSTANT = RM || q.has('static');
  const DPR = () => Math.min(2, window.devicePixelRatio || 1);
  const BAD = '#c8372d';
  const pal = () => {
    const dark = HOME.classList.contains('is-dark');
    return dark
      ? { ink: '#e3ebe8', dim: '#7d8d89', line: '#1e2a30', grid: 'rgba(227,235,232,.08)', good: '#3dff9a', lfp: '#ffb23e', bg: '#07090b' }
      : { ink: '#111111', dim: '#5f5e58', line: '#d6d2c6', grid: 'rgba(17,17,17,.06)', good: '#078a4e', lfp: '#b56a00', bg: '#f4f2ec' };
  };
  function fit(cv) {
    const r = cv.getBoundingClientRect(), d = DPR();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (cv.width !== w * d || cv.height !== h * d) { cv.width = w * d; cv.height = h * d; }
    const cx = cv.getContext('2d'); cx.setTransform(d, 0, 0, d, 0, 0);
    return { cx, w, h };
  }
  function onView(el, fn, margin) {
    if (INSTANT || !('IntersectionObserver' in window)) { fn(true); return; }
    const io = new TrackedIO((es) => es.forEach((e) => { if (e.isIntersecting) { io.disconnect(); fn(false); } }), { rootMargin: margin || '0px 0px -25% 0px' });
    io.observe(el);
  }
  const ease = (k) => 1 - Math.pow(1 - k, 3);
  function tween(dur, step, done) {
    const t0 = performance.now();
    (function f(now) { const k = Math.min(1, (now - t0) / dur); step(ease(k)); if (k < 1) raf(f); else if (done) done(); })(t0);
  }
  const fmt = (v, d) => (+v).toFixed(d);

  /* =========================================================
     1 · PAIN — same load, two BBUs
     ========================================================= */
  const pain = { mode: 'both', reveal: 0, hx: -1 };
  function painSetup(L, H) {
    // Window = the steady-state window the headline stat is computed on
    // (generate_twin_scenarios.py _stable_window_pp: t0 = 4.0, t1 = 6.0), so the bracket and the number agree.
    const t0 = 4.0, t1 = 6.0;
    const idx = [];
    H.series.t.forEach((t, i) => { if (t >= t0 && t <= t1) idx.push(i); });
    pain.t0 = t0; pain.t1 = t1; pain.idx = idx;
    pain.T = H.series.t; pain.load = H.series.p_total_kw;
    pain.pBad = L.series.p_total_kw; // pure-battery BBU: battery carries the whole load
    pain.pGood = H.series.p_lfp_kw;
    pain.vBad = L.series.v_cell; pain.vGood = H.series.v_cell;
    pain.ppBad = L.stats.v_cell_pp_stable; pain.ppGood = H.stats.v_cell_pp_stable;
    let lo = 9, hi = 0;
    const env = (a) => { let l = 9, h = 0; idx.forEach((i) => { l = Math.min(l, a[i]); h = Math.max(h, a[i]); }); return [l, h]; };
    pain.eBad = env(pain.vBad); pain.eGood = env(pain.vGood);
    lo = Math.min(pain.eBad[0], pain.eGood[0]); hi = Math.max(pain.eBad[1], pain.eGood[1]);
    // extra room under the traces for the edge annotation
    pain.vlo = lo - (hi - lo) * 0.62; pain.vhi = hi + (hi - lo) * 0.1;
    // load edges inside the window (series are on one shared grid since the 10/09 fix)
    pain.edges = idx.filter((i) => i > 0 && pain.load[i] !== pain.load[i - 1]);
    pain.rises = pain.edges.filter((i) => pain.load[i] > pain.load[i - 1]);
    // featured event: a rising edge near the middle of the window
    pain.feat = pain.rises[Math.min(pain.rises.length - 1, Math.floor(pain.rises.length / 2))];
    pain.hEdge = -1;
    pain.cv = $('cmp'); pain.tip = $('cmp-tip');
    pain.cv.addEventListener('pointermove', (e) => { pain.hx = e.clientX - pain.cv.getBoundingClientRect().left; drawPain(); });
    pain.cv.addEventListener('pointerleave', () => { pain.hx = -1; pain.tip.hidden = true; drawPain(); });
    document.querySelectorAll('#compare .seg button').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#compare .seg button').forEach((x) => x.classList.toggle('on', x === b));
      const from = { ...pain.alpha }, to = alphaFor(b.dataset.mode);
      pain.mode = b.dataset.mode;
      if (INSTANT) { pain.alpha = to; drawPain(); return; }
      tween(380, (k) => { pain.alpha = { bad: from.bad + (to.bad - from.bad) * k, good: from.good + (to.good - from.good) * k }; drawPain(); });
    }));
    pain.alpha = alphaFor('both');
    onView($('compare'), (inst) => {
      if (inst) { pain.reveal = 1; drawPain(); return; }
      tween(1900, (k) => { pain.reveal = k; drawPain(); }, startPulse);
    });
  }
  const alphaFor = (m) => ({ bad: m === 'hyb' ? 0.1 : 1, good: m === 'lfp' ? 0.1 : 1 });
  // Causality pulse: every few seconds a dot runs down the annotated switching instant, from the load
  // step to the voltage edge, and the voltage edge rings. Runs only while the chart is on screen.
  pain.pulse = -1;
  function startPulse() {
    if (INSTANT || pain.pulsing) return;
    pain.pulsing = true;
    let vis = true, t0 = performance.now() + 400;
    if ('IntersectionObserver' in window) new TrackedIO((es) => es.forEach((e) => (vis = e.isIntersecting))).observe(pain.cv);
    const PER = 2800, DUR = 1100;
    (function f(now) {
      if (vis && !document.hidden) {
        const ph = (now - t0) % PER;
        const p = now < t0 ? -1 : ph < DUR ? ph / DUR : -1;
        if (p >= 0 || pain.pulse >= 0) { pain.pulse = p; drawPain(); }
      }
      raf(f);
    })(performance.now());
  }

  function drawPain() {
    if (!pain.cv) return;
    const { cx, w, h } = fit(pain.cv), C = pal();
    const narrow = w < 560;
    const L = 0, R = narrow ? 50 : 72, T = 22, B = 26;
    const pw = w - L - R, ph = h - T - B;
    // voltage is the hero lane: it gets the most height, and sits directly under the load it reacts to
    const lanes = { a: [0, 0.17], b: [0.25, 0.45], c: [0.54, 1] };
    const X = (t) => L + ((t - pain.t0) / (pain.t1 - pain.t0)) * pw;
    const Y = (lane, v, lo, hi) => { const [a, b] = lanes[lane]; return T + ph * (b - ((v - lo) / (hi - lo)) * (b - a)); };
    const VY = (v) => Y('c', v, pain.vlo, pain.vhi);
    const mono = (s) => (cx.font = (s || '') + ' 10.5px ' + FONT.mono);
    const sans = (s) => (cx.font = (s || '500') + ' 11px ' + FONT.zh);
    cx.clearRect(0, 0, w, h);
    mono();

    // hovered load edge (snaps the crosshair to the nearest switching instant)
    let best = -1;
    if (pain.hx >= L && pain.hx <= L + pw && pain.reveal > 0.98) {
      const t = pain.t0 + ((pain.hx - L) / pw) * (pain.t1 - pain.t0);
      best = pain.idx[0];
      pain.idx.forEach((i) => { if (Math.abs(pain.T[i] - t) < Math.abs(pain.T[best] - t)) best = i; });
    }
    const near = best < 0 ? -1 : pain.edges.reduce((m, i) => (Math.abs(pain.T[i] - pain.T[best]) < Math.abs(pain.T[m] - pain.T[best]) ? i : m), pain.edges[0]);
    const snap = near >= 0 && Math.abs(X(pain.T[near]) - X(pain.T[best])) < 10;
    const ev = snap ? near : pain.feat; // the edge we annotate

    // lane frames + labels
    const laneLbl = [['a', 'P_LOAD 負載功率', 40, 120, (v) => v + ' kW', [56, 104]], ['b', '電池端功率', 40, 120, (v) => v + ' kW', [56, 104]], ['c', '電芯電壓 V_cell', pain.vlo, pain.vhi, null, []]];
    laneLbl.forEach(([k, lbl, lo, hi, f, ticks]) => {
      const [a, b] = lanes[k];
      cx.strokeStyle = C.grid; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(L, T + ph * b + 0.5); cx.lineTo(L + pw, T + ph * b + 0.5); cx.stroke();
      cx.fillStyle = k === 'c' ? C.ink : C.dim; cx.textAlign = 'left';
      sans(k === 'c' ? '700' : '500');
      cx.fillText(lbl, L, T + ph * a - 7);
      mono();
      ticks.forEach((v) => {
        const y = Y(k, v, lo, hi);
        cx.strokeStyle = C.grid; cx.setLineDash([2, 4]); cx.beginPath(); cx.moveTo(L, y); cx.lineTo(L + pw, y); cx.stroke(); cx.setLineDash([]);
        cx.fillStyle = C.dim; cx.textAlign = 'left'; cx.fillText(f(v), L + pw + 8, y + 3.5);
      });
    });
    // x axis
    cx.fillStyle = C.dim; cx.textAlign = 'center';
    for (let t = pain.t0; t <= pain.t1 + 1e-6; t += 0.5) cx.fillText(t.toFixed(1) + ' s', Math.min(L + pw - 16, Math.max(L + 16, X(t))), h - 8);
    if (!narrow) { cx.textAlign = 'right'; cx.fillText('穩態窗 4–6 s', L + pw, T + ph * lanes.c[0] - 7); }

    const rx = L + pw * pain.reveal;
    cx.save(); cx.beginPath(); cx.rect(0, 0, rx + 1, h); cx.clip();

    // switching instants: one hairline per load rise, running through all three lanes —
    // the eye can follow the same instant from the load step down to the voltage drop
    const top = T + ph * lanes.a[0] - 2, bot = T + ph * lanes.c[1];
    pain.rises.forEach((i) => {
      if (i === ev) return;
      const x = Math.round(X(pain.T[i])) + 0.5;
      cx.strokeStyle = C.ink; cx.globalAlpha = 0.07; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(x, top); cx.lineTo(x, bot); cx.stroke();
    });
    cx.globalAlpha = 1;

    // Draw a series; at load-edge samples the segment is drawn vertical so the voltage edge
    // lands on exactly the same x as the load edge (the data change on the same sample).
    const trace = (arr, lane, lo, hi, col, lw, a, allStep) => {
      cx.globalAlpha = a; cx.strokeStyle = col; cx.lineWidth = lw; cx.lineJoin = 'round'; cx.beginPath();
      pain.idx.forEach((i, n) => {
        const x = X(pain.T[i]), y = Y(lane, arr[i], lo, hi);
        if (!n) { cx.moveTo(x, y); return; }
        if (allStep || pain.load[i] !== pain.load[i - 1]) cx.lineTo(x, Y(lane, arr[pain.idx[n - 1]], lo, hi));
        cx.lineTo(x, y);
      });
      cx.stroke(); cx.globalAlpha = 1;
    };
    // lane a
    trace(pain.load, 'a', 40, 120, C.ink, 1.6, 1, true);
    // lane b
    trace(pain.pBad, 'b', 40, 120, BAD, 1.6, pain.alpha.bad, true);
    trace(pain.pGood, 'b', 40, 120, C.good, 2.4, pain.alpha.good);
    // lane c: envelope bands (min..max inside the stats window)
    const band = (e, col, a) => { cx.globalAlpha = 0.06 * a; cx.fillStyle = col; cx.fillRect(L, VY(e[1]), pw, VY(e[0]) - VY(e[1])); cx.globalAlpha = 1; };
    band(pain.eBad, BAD, pain.alpha.bad);
    band(pain.eGood, C.good, pain.alpha.good);
    trace(pain.vBad, 'c', pain.vlo, pain.vhi, BAD, 2, pain.alpha.bad);
    trace(pain.vGood, 'c', pain.vlo, pain.vhi, C.good, 2.4, pain.alpha.good);
    cx.restore();

    // annotated switching instant: load +48 kW and voltage −49.6 mV on the same sample
    if (pain.reveal > 0.98 && ev > 0) {
      const i = ev, x = Math.round(X(pain.T[i])) + 0.5;
      const dP = pain.load[i] - pain.load[i - 1];
      const dVb = (pain.vBad[i] - pain.vBad[i - 1]) * 1000, dVg = (pain.vGood[i] - pain.vGood[i - 1]) * 1000;
      const up = dP > 0;
      cx.strokeStyle = C.ink; cx.globalAlpha = snap ? 0.55 : 0.35; cx.lineWidth = 1; cx.setLineDash([3, 3]);
      cx.beginPath(); cx.moveTo(x, top); cx.lineTo(x, bot); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1;
      // edge dots
      const dot = (y, col) => { cx.fillStyle = C.bg; cx.beginPath(); cx.arc(x, y, 4.5, 0, 7); cx.fill(); cx.fillStyle = col; cx.beginPath(); cx.arc(x, y, 3, 0, 7); cx.fill(); };
      const yLa = Y('a', (pain.load[i] + pain.load[i - 1]) / 2, 40, 120);
      dot(yLa, C.ink);
      const yVb0 = VY(pain.vBad[i - 1]), yVb1 = VY(pain.vBad[i]);
      if (pain.alpha.bad > 0.5) dot((yVb0 + yVb1) / 2, BAD);
      if (pain.pulse >= 0 && !snap) {
        const p = pain.pulse, yv = (yVb0 + yVb1) / 2;
        if (p < 0.45) {
          const k = ease(p / 0.45), y = yLa + (yv - yLa) * k;
          const g = cx.createLinearGradient(0, y - 26, 0, y);
          g.addColorStop(0, 'rgba(200,55,45,0)'); g.addColorStop(1, 'rgba(200,55,45,.55)');
          cx.strokeStyle = g; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(x, Math.max(yLa, y - 26)); cx.lineTo(x, y); cx.stroke();
          cx.fillStyle = BAD; cx.beginPath(); cx.arc(x, y, 3.2, 0, 7); cx.fill();
        } else if (pain.alpha.bad > 0.5) {
          const q = (p - 0.45) / 0.55;
          cx.strokeStyle = BAD; cx.globalAlpha = (1 - q) * 0.8; cx.lineWidth = 1.5;
          cx.beginPath(); cx.arc(x, yv, 5 + ease(q) * 16, 0, 7); cx.stroke(); cx.globalAlpha = 1;
        }
      }
      // labels sit on the side with more room
      const right = x < L + pw * 0.62, ax = right ? x + 10 : x - 10;
      cx.textAlign = right ? 'left' : 'right';
      mono('600'); cx.fillStyle = C.ink;
      cx.fillText(`${up ? '+' : '−'}${Math.abs(dP).toFixed(0)} kW`, ax, yLa + 4);
      const yb = Math.max(yVb0, yVb1) + 22;
      if (pain.alpha.bad > 0.5) {
        cx.font = '600 16px ' + FONT.mono; cx.fillStyle = BAD;
        cx.fillText(`純電池 ${dVb > 0 ? '+' : '−'}${Math.abs(dVb).toFixed(1)} mV`, ax, yb);
      }
      if (pain.alpha.good > 0.5) {
        mono('600'); cx.fillStyle = C.good;
        cx.fillText(`HyperBuffer ${dVg > 0 ? '+' : '−'}${Math.abs(dVg).toFixed(1)} mV`, ax, yb + (pain.alpha.bad > 0.5 ? 19 : 0));
      }
      // instant label at the top of the guide
      mono(); cx.fillStyle = C.ink; cx.globalAlpha = 0.8;
      cx.fillText(`${up ? '負載上跳' : '負載下降'}瞬間 · t = ${pain.T[i].toFixed(3)} s`, ax, T + ph * lanes.a[0] - 7);
      cx.globalAlpha = 1;
    }

    // pp brackets: stats.v_cell_pp_stable drawn to scale from the top of each envelope
    if (pain.reveal > 0.98) {
      const br = (e, pp, col, a, xo, lbl, below) => {
        if (a < 0.2) return;
        const y0 = VY(e[1]), y1 = VY(e[1] - pp), x = L + pw + xo;
        cx.globalAlpha = a; cx.strokeStyle = col; cx.fillStyle = col; cx.lineWidth = 1.5;
        cx.beginPath(); cx.moveTo(x - 4, y0); cx.lineTo(x, y0); cx.lineTo(x, y1); cx.lineTo(x - 4, y1); cx.stroke();
        cx.textAlign = 'left'; mono('600');
        const ly = below ? y1 + 15 : y0 + 4;
        cx.fillText(lbl, x + 6, ly);
        if (!narrow) { mono(); cx.globalAlpha = a * 0.75; cx.fillText('峰對峰', x + 6, ly + 13); }
        cx.globalAlpha = 1;
      };
      br(pain.eBad, pain.ppBad, BAD, pain.alpha.bad, 6, (pain.ppBad * 1000).toFixed(1) + ' mV', false);
      br(pain.eGood, pain.ppGood, C.good, pain.alpha.good, pain.alpha.bad > 0.2 ? 14 : 6, (pain.ppGood * 1000).toFixed(1) + ' mV', pain.alpha.bad > 0.2);
    }

    // hover crosshair + readout
    if (best >= 0) {
      const x = X(pain.T[best]);
      if (!snap) { cx.strokeStyle = C.ink; cx.globalAlpha = 0.35; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(x + 0.5, T - 6); cx.lineTo(x + 0.5, T + ph); cx.stroke(); cx.globalAlpha = 1; }
      const i = snap ? near : best;
      const tip = pain.tip; tip.hidden = false;
      tip.innerHTML = `t ${pain.T[i].toFixed(3)} s · 負載 <b>${pain.load[i].toFixed(0)} kW</b>${snap ? ' · 切換瞬間' : ''}<br>` +
        `<span style="color:#ff8a80">純電池</span> ${pain.pBad[i].toFixed(1)} kW · ${pain.vBad[i].toFixed(4)} V<br>` +
        `<span style="color:#6fe3a7">HyperBuffer</span> ${pain.pGood[i].toFixed(1)} kW · ${pain.vGood[i].toFixed(4)} V`;
      const tw = tip.offsetWidth, xx = X(pain.T[i]);
      tip.style.left = Math.max(0, Math.min(w - tw, xx + 12 + tw > w ? xx - tw - 12 : xx + 12)) + 'px';
      tip.style.top = Math.round(T + ph * lanes.b[0] - 4) + 'px';
    }
  }

  /* =========================================================
     2 · SPLIT — live first-order complementary filter
     ========================================================= */
  const split = {};
  function splitSetup(H) {
    split.T = H.series.t; split.x = H.series.p_total_kw; split.ref = H.series.p_lfp_kw;
    split.capKJ = H.stats.lic_energy_kj_capacity;
    split.ref05 = { std: H.stats.p_lfp_std_kw, peak: H.stats.lic_peak_kw, exc: H.stats.lic_peak_excursion_kj };
    split.refRipple = ripple(split.ref);
    split.cv = $('splitc');
    const inp = $('tau');
    const go = () => { compute(+inp.value); drawSplit(); };
    inp.addEventListener('input', go);
    go();
  }
  // mean peak-to-peak of P_LFP per 200 ms load period, steady state (t >= 5 s)
  function ripple(y) {
    const T = split.T; let sum = 0, n = 0;
    for (let k = 5; k + 0.2 <= 10 + 1e-9; k += 0.2) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < T.length; i++) if (T[i] >= k && T[i] < k + 0.2) { lo = Math.min(lo, y[i]); hi = Math.max(hi, y[i]); }
      if (hi >= lo) { sum += hi - lo; n++; }
    }
    return n ? sum / n : 0;
  }
  function compute(tau) {
    const { T, x } = split, N = T.length;
    const y = new Float64Array(N), lic = new Float64Array(N);
    y[0] = x[0];
    for (let i = 1; i < N; i++) { const dt = T[i] - T[i - 1]; y[i] = y[i - 1] + (dt / (tau + dt)) * (x[i] - y[i - 1]); }
    let m = 0, peak = 0, E = 0, eMin = 0, eMax = 0, se = 0, me = 0;
    for (let i = 0; i < N; i++) { lic[i] = x[i] - y[i]; m += y[i]; peak = Math.max(peak, Math.abs(lic[i])); }
    m /= N;
    let v = 0;
    for (let i = 0; i < N; i++) {
      v += (y[i] - m) ** 2;
      if (i) { E += 0.5 * (lic[i] + lic[i - 1]) * (T[i] - T[i - 1]); eMin = Math.min(eMin, E); eMax = Math.max(eMax, E); }
      const d = y[i] - split.ref[i]; se += d * d; me = Math.max(me, Math.abs(d));
    }
    Object.assign(split, { tau, y, lic, std: Math.sqrt(v / N), rip: ripple(y), peak, exc: eMax - eMin, rms: Math.sqrt(se / N), maxe: me });
    const adopt = Math.abs(tau - 0.5) < 1e-6;
    $('tau-v').textContent = fmt(tau, 2);
    $('m-fc').textContent = fmt(1 / (2 * Math.PI * tau), 2);
    $('m-std').textContent = fmt(split.rip, 1);
    $('m-peak').textContent = fmt(split.peak, 1);
    $('m-exc').textContent = fmt(split.exc, 1);
    $('tau').style.setProperty('--p', (((tau - 0.05) / 1.95) * 100).toFixed(2) + '%');
    $('tau-badge').classList.toggle('alt', !adopt);
    $('tau-badge-t').textContent = adopt ? '採用值 · 與 PyBaMM 模擬同一控制律' : '前端示意計算 · 不是 PyBaMM 結果';
    $('split-note').innerHTML = adopt
      ? `τ = 0.5 s 時，前端重算的 P_LFP 與 PyBaMM 結果相差 RMS <b class="mono">${fmt(split.rms, 2)} kW</b>（最大 ${fmt(split.maxe, 1)} kW）。PyBaMM 對照：漣波 <b class="mono">${fmt(split.refRipple, 1)} kW</b>（同法計算）、LIC 峰值 <b class="mono">${fmt(split.ref05.peak, 1)} kW</b>、能量擺幅 <b class="mono">${fmt(split.ref05.exc, 1)} kJ</b>。`
      : tau > 0.5
        ? `τ 越大，LFP 越平穩（漣波 <b class="mono">${fmt(split.rip, 1)} kW</b>），但 LIC 得吸收更多能量（擺幅 <b class="mono">${fmt(split.exc, 1)} kJ</b>；LIC 模組可用 ${fmt(split.capKJ, 0)} kJ）。此為前端示意計算，不是 PyBaMM 結果。`
        : `τ 越小，LIC 負擔越輕（擺幅 <b class="mono">${fmt(split.exc, 1)} kJ</b>），但 LFP 直接承受更多跳動（漣波 <b class="mono">${fmt(split.rip, 1)} kW</b>）。此為前端示意計算，不是 PyBaMM 結果。`;
  }
  function drawSplit() {
    if (!split.cv || !split.y) return;
    const { cx, w, h } = fit(split.cv), C = pal();
    const narrow = w < 560;
    const L = 0, R = narrow ? 44 : 58, T = 12, B = 26, pw = w - L - R, ph = h - T - B;
    const t0 = 0, t1 = 3;
    const top = [0, 0.6], bot = [0.7, 1];
    const X = (t) => L + ((t - t0) / (t1 - t0)) * pw;
    const Yt = (v) => T + ph * (top[1] - ((v - 40) / 80) * (top[1] - top[0]));
    const Yb = (v) => T + ph * (bot[0] + ((60 - v) / 120) * (bot[1] - bot[0]));
    cx.clearRect(0, 0, w, h);
    cx.font = '10.5px ' + FONT.mono;
    // grid
    [[56, Yt], [80, Yt], [104, Yt]].forEach(([v, f]) => { const y = f(v); cx.strokeStyle = C.grid; cx.setLineDash([2, 4]); cx.beginPath(); cx.moveTo(L, y); cx.lineTo(L + pw, y); cx.stroke(); cx.setLineDash([]); cx.fillStyle = C.dim; cx.textAlign = 'left'; cx.fillText(v + ' kW', L + pw + 8, y + 3.5); });
    [[50, Yb], [0, Yb], [-50, Yb]].forEach(([v, f]) => { const y = f(v); cx.strokeStyle = v ? C.grid : C.dim; cx.globalAlpha = v ? 1 : 0.5; cx.setLineDash(v ? [2, 4] : []); cx.beginPath(); cx.moveTo(L, y); cx.lineTo(L + pw, y); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1; cx.fillStyle = C.dim; cx.fillText((v > 0 ? '+' : '') + v + ' kW', L + pw + 8, y + 3.5); });
    cx.font = '500 11px ' + FONT.zh; cx.fillStyle = C.dim; cx.textAlign = 'left';
    cx.fillText('LIC 分到的功率（＋放電／−充電）', L, T + ph * bot[0] - 8);
    cx.font = '10.5px ' + FONT.mono; cx.textAlign = 'center';
    for (let t = t0; t <= t1 + 1e-6; t += 0.5) cx.fillText(t.toFixed(1) + ' s', Math.min(L + pw - 16, Math.max(L + 16, X(t))), h - 8);

    const I = []; split.T.forEach((t, i) => { if (t <= t1 + 1e-9) I.push(i); });
    const path = (f, arr, stepwise) => { cx.beginPath(); I.forEach((i, n) => { const x = X(split.T[i]), y = f(arr[i]); if (!n) cx.moveTo(x, y); else if (stepwise) { cx.lineTo(x, f(arr[I[n - 1]])); cx.lineTo(x, y); } else cx.lineTo(x, y); }); };
    // load
    cx.strokeStyle = C.ink; cx.globalAlpha = 0.55; cx.lineWidth = 1.2; path(Yt, split.x, true); cx.stroke(); cx.globalAlpha = 1;
    // PyBaMM reference
    cx.strokeStyle = C.ink; cx.lineWidth = 1.2; cx.setLineDash([4, 4]); cx.globalAlpha = 0.7; path(Yt, split.ref, false); cx.stroke(); cx.setLineDash([]); cx.globalAlpha = 1;
    // LFP computed
    cx.strokeStyle = C.lfp; cx.lineWidth = 2.6; cx.lineJoin = 'round'; path(Yt, split.y, false); cx.stroke();
    // LIC area
    cx.beginPath(); cx.moveTo(X(0), Yb(0));
    I.forEach((i, n) => { const x = X(split.T[i]); if (n) cx.lineTo(x, Yb(split.lic[I[n - 1]])); cx.lineTo(x, Yb(split.lic[i])); });
    cx.lineTo(X(split.T[I[I.length - 1]]), Yb(0)); cx.closePath();
    cx.fillStyle = C.good; cx.globalAlpha = 0.14; cx.fill(); cx.globalAlpha = 1;
    cx.strokeStyle = C.good; cx.lineWidth = 1.4; path(Yb, split.lic, true); cx.stroke();
  }

  /* =========================================================
     3 · AI — predicted vs actual (log-log), points appear one by one
     ========================================================= */
  function mk(tag, a, p) { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function aiSetup(M) {
    const svg = $('scatter'), tip = $('ai-tip');
    const W = 640, H = 500, l = 58, r = 18, t = 18, b = 50;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const lo = 2, hi = Math.log10(30000);
    const X = (v) => l + ((Math.log10(v) - lo) / (hi - lo)) * (W - l - r);
    const Y = (v) => H - b - ((Math.log10(v) - lo) / (hi - lo)) * (H - t - b);
    const g = mk('g', {}, svg);
    [100, 300, 1000, 3000, 10000, 30000].forEach((v) => {
      mk('line', { x1: X(v), x2: X(v), y1: t, y2: H - b, style: 'stroke:var(--line);stroke-width:1' }, g);
      mk('line', { x1: l, x2: W - r, y1: Y(v), y2: Y(v), style: 'stroke:var(--line);stroke-width:1' }, g);
      const lb = v >= 1000 ? v / 1000 + 'k' : String(v);
      mk('text', { x: X(v), y: H - b + 18, 'text-anchor': 'middle', style: 'fill:var(--fg2);font-size:11px' }, g).textContent = lb;
      mk('text', { x: l - 8, y: Y(v) + 4, 'text-anchor': 'end', style: 'fill:var(--fg2);font-size:11px' }, g).textContent = lb;
    });
    mk('text', { x: (l + W - r) / 2, y: H - 8, 'text-anchor': 'middle', style: 'fill:var(--fg2);font-size:11.5px;font-family:var(--f-zh)' }, g).textContent = '實際壽命（cycles）';
    mk('text', { x: 14, y: (t + H - b) / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${(t + H - b) / 2})`, style: 'fill:var(--fg2);font-size:11.5px;font-family:var(--f-zh)' }, g).textContent = '預測壽命（cycles）';
    mk('line', { x1: X(100), y1: Y(100), x2: X(30000), y2: Y(30000), style: 'stroke:var(--fg2);stroke-width:1.2;stroke-dasharray:5 5' }, g);
    mk('text', { x: X(22000), y: Y(22000) + 18, 'text-anchor': 'end', style: 'fill:var(--fg2);font-size:10.5px;font-family:var(--f-zh)' }, g).textContent = '預測 = 實際';
    const cnt = mk('text', { x: l + 12, y: t + 22, style: 'fill:var(--fg);font-size:13px;font-weight:500' }, g);
    const pts = M.predicted_vs_actual.slice().sort((a, b2) => a.actual - b2.actual);
    const pg = mk('g', {}, svg);
    const nodes = pts.map((p) => {
      const test = p.split === 'test', bbu = p.batch === 'bbu';
      const st = test ? 'fill:var(--fg)' : 'fill:var(--line);stroke:var(--fg2);stroke-width:.8';
      const c = mk('circle', { cx: X(p.actual).toFixed(1), cy: Y(p.predicted).toFixed(1), r: test ? 4.2 : 3.6, style: st + (bbu ? ';stroke:var(--acc);stroke-width:1.8' : '') + ';opacity:0;transition:opacity .35s, r .35s' }, pg);
      c._p = p; return c;
    });
    const nTest = pts.filter((p) => p.split === 'test').length;
    const show = (n) => { for (let i = 0; i < n; i++) nodes[i].style.opacity = 1; cnt.textContent = `${n} / ${pts.length} 顆電芯 · 測試 ${nTest}`; };
    show(0);
    onView(svg, (inst) => {
      if (inst) { show(nodes.length); return; }
      tween(2600, (k) => show(Math.round(k * nodes.length)));
    }, '0px 0px -20% 0px');
    // hover
    svg.addEventListener('pointermove', (e) => {
      const r0 = svg.getBoundingClientRect(), s = W / r0.width;
      const mx = (e.clientX - r0.left) * s, my = (e.clientY - r0.top) * s;
      let best = null, bd = 14 * s;
      nodes.forEach((c) => { if (c.style.opacity !== '1') return; const d = Math.hypot(c.cx.baseVal.value - mx, c.cy.baseVal.value - my); if (d < bd) { bd = d; best = c; } });
      nodes.forEach((c) => c.setAttribute('r', c === best ? 7 : c._p.split === 'test' ? 4.2 : 3.6));
      if (!best) { tip.hidden = true; return; }
      const p = best._p, err = ((p.predicted - p.actual) / p.actual) * 100;
      tip.hidden = false;
      tip.innerHTML = `${p.cell_id} · ${p.batch === 'bbu' ? '合成 BBU 工況' : '批次 ' + p.batch} · ${p.split === 'test' ? '測試' : '訓練／校準'}<br>實際 <b>${Math.round(p.actual).toLocaleString()}</b> · 預測 <b>${Math.round(p.predicted).toLocaleString()}</b> · 誤差 ${err > 0 ? '+' : ''}${err.toFixed(1)}%`;
      const px = best.cx.baseVal.value / s, py = best.cy.baseVal.value / s, tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(r0.width - tw, px + 14 + tw > r0.width ? px - tw - 14 : px + 14)) + 'px';
      tip.style.top = Math.max(0, py - 52) + 'px';
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; nodes.forEach((c) => c.setAttribute('r', c._p.split === 'test' ? 4.2 : 3.6)); });
    // PI bars grow on view
    const bars = document.querySelectorAll('.pi-bar');
    bars.forEach((bEl) => bEl.style.setProperty('--s', INSTANT ? 1 : 0));
    onView(document.querySelector('.ai-pi'), () => bars.forEach((bEl) => bEl.style.setProperty('--s', 1)));
  }

  /* =========================================================
     4 · VERIFY — V1–V8 light up, then 43/43
     ========================================================= */
  const VC = [
    ['V1', '物理擬合', '2.15<small>% RMS</small>', 'PyBaMM 放電曲線對照 Severson 實測，門檻 5%（僅 3 顆電芯）', 'pybamm_lfp_fit_error.json:11', ''],
    ['V2', '電容 RC 模型', '≤2.93<small>% 壓降低估</small>', 'RC 模型對照元件規格書壓降曲線，門檻 10%', 'lic_rc_fit_error.json:66,69', ''],
    ['V3', '斷電 60 秒', '2.66<small>% DoD</small>', '8 台並聯撐整櫃 60 秒（模擬），電芯最高 25.1°C', 'rack_60s_graceful.json → stats', ''],
    ['V4', 'N−1 故障', '1.71<small>C 單台</small>', 't = 15 s 拔一台，其餘 7 台仍在 2.5C 上限內', 'rack_n_minus_1.json → stats', ''],
    ['V5', '跨工況', '80.20<small>% MAPE</small>', 'bagged-GBT 基線（非 TCN）：實驗室工況 9.04% → BBU 工況 80.20%，公開揭露', 'severson_transfer_mape.json:5,31-32', 'disc'],
    ['V6', '一鍵全驗', '6/6<small> · 55.2 s</small>', '6/6 PASS（略過 V1：需另下載 8.3 GB）；V7 為獨立腳本', 'verify_all_report.json:5-7', ''],
    ['V7', '電芯不均衡', '−13.3<small>% 最弱電芯</small>', '15 串參數不一致時的最弱電芯瞬態負擔；篩檢項，非門檻', 'README.md:68', 'scr'],
    ['V8', '自適應分頻', '6.06→5.47<small>C</small>', '老化到 80% 後 τ 調到 0.75 s，峰值倍率降回', 'adaptive_split.json → stats', ''],
  ];
  function verifySetup() {
    const ol = $('vgrid');
    ol.innerHTML = VC.map(([id, name, m, n, s, k]) => `<li class="vc ${k}"><div class="vc-top"><span>${id}</span><span class="vc-st">${k === 'disc' ? '揭露' : k === 'scr' ? '篩檢' : '通過'}</span></div><span class="vc-name">${name}</span><span class="vc-m">${m}</span><span class="vc-n">${n}</span><span class="vc-s">${s}</span></li>`).join('');
    const cards = [...ol.children], vx = $('v-x'), big = document.querySelector('.vrun-big');
    onView(ol, (inst) => {
      if (inst) { cards.forEach((c) => c.classList.add('lit')); vx.textContent = '43'; big.classList.add('done'); return; }
      cards.forEach((c, i) => later(() => c.classList.add('lit'), 160 * i));
      later(() => tween(1300, (k) => { vx.textContent = Math.round(43 * k); }, () => big.classList.add('done')), 160 * cards.length + 100);
    }, '0px 0px -30% 0px');
  }

  /* ========================================================= */
  async function init() {
    const get = (f) => fetchData(f).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
    const [L, H, M] = await Promise.all([get('transient_lfp_only.json'), get('transient_hybrid.json'), get('model_validation.json')]);
    painSetup(L, H);
    splitSetup(H);
    aiSetup(M);
    verifySetup();
    const redraw = () => { drawPain(); drawSplit(); };
    let rq = 0;
    onWin('resize', () => { caf(rq); rq = raf(redraw); });
    onDoc('themechange', redraw);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
    redraw();
  }
  return { init, redraw: () => { drawPain(); drawSplit(); } };
})();

// ===== outage.js =====
/* Outage theatre: 8-BBU rack rides through a 60 s grid loss (rack_60s_graceful / rack_n_minus_1) */
const Outage = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const f1 = (v) => (+v).toFixed(1);
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const q = new URLSearchParams(location.search);
  const DPR = () => Math.min(2, window.devicePixelRatio || 1);
  const KJ_PER_BBU = 2.5 * 3600; // 2.5 kWh
  const PMAX_BBU = 15; // kW, full scale of the per-BBU bar (= peak 6C if LFP carried the whole peak)
  const C = { ink: '#e3ebe8', dim: '#7d8d89', dim2: '#4d5b58', line: '#18232a', lic: '#3dff9a', lfp: '#ffb23e', bad: '#ff6b6b' };

  const st = { sc: 'normal', u: 0, t: 0, speed: 6, playing: false, userPaused: false, hold: 0, visible: false };
  const D = {};
  const E = { drawers: [], lic: [], rows: [] };

  // warped timeline: 0–3 s gets 30 % of the axis
  const uOf = (t) => (t <= 3 ? (0.3 * t) / 3 : 0.3 + (0.7 * (t - 3)) / 57);
  const tOf = (u) => (u <= 0.3 ? (u / 0.3) * 3 : 3 + ((u - 0.3) / 0.7) * 57);

  function prep(name, d) {
    const s = d.series, N = s.t.length;
    const per = [];
    for (let k = 0; k < 8; k++) per.push(new Float64Array(N));
    for (let i = 0; i < N; i++) {
      const pb = s.p_lfp_per_bbu_kw ? s.p_lfp_per_bbu_kw[i] : s.p_lfp_kw[i] / 8;
      const n = s.n_bbu_active ? s.n_bbu_active[i] : 8;
      for (let k = 0; k < 8; k++) per[k][i] = k < n ? pb : 0;
    }
    const soc = per.map((p) => {
      const a = new Float64Array(N); let e = 0;
      for (let i = 1; i < N; i++) { e += 0.5 * (p[i] + p[i - 1]) * (s.t[i] - s.t[i - 1]); a[i] = 100 * (1 - e / KJ_PER_BBU); }
      a[0] = 100; return a;
    });
    D[name] = { s, N, per, soc, n: s.n_bbu_active || null, fault: d.fault_injection ? d.fault_injection.fault_time_s : null };
  }
  function idx(t) {
    const T = D[st.sc].s.t; let lo = 0, hi = T.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    return lo;
  }

  /* ---------------- iso cabinet ---------------- */
  function buildCab() {
    const I = Stage.iso, { mk, box, mLeft, mRight, mTop, P, f1, SC } = I;
    const svg = $('cab');
    svg.innerHTML = `<defs>
      <linearGradient id="oL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#172025"/><stop offset="1" stop-color="#0b1013"/></linearGradient>
      <linearGradient id="oR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e1417"/><stop offset="1" stop-color="#06080a"/></linearGradient>
      <linearGradient id="oT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a4750"/><stop offset="1" stop-color="#1c252a"/></linearGradient>
      <linearGradient id="oBar" x1="0" x2="1"><stop offset="0" stop-color="#9c6418"/><stop offset="1" stop-color="#ffb23e"/></linearGradient>
      <radialGradient id="oFloor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb23e" stop-opacity=".14"/><stop offset="1" stop-color="#ffb23e" stop-opacity="0"/></radialGradient>
      <filter id="oGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="oBlur" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="14"/></filter>
    </defs>`;
    const g = mk('g', {}, svg);
    const X0 = 0, Y0 = 0, DX = 5.0, DY = 2.4, DZ = 9.4;
    // floor glow + shadow
    const fp = (x, y) => P(x, y, 0);
    const [fx, fy] = fp(X0 + DX / 2, Y0 + DY / 2);
    E.floor = mk('ellipse', { cx: f1(fx), cy: f1(fy + 8), rx: 190, ry: 92, fill: 'url(#oFloor)' }, g);
    mk('polygon', { points: I.poly([[X0 - 0.3, Y0 - 0.3], [X0 + DX + 0.5, Y0 - 0.3], [X0 + DX + 0.5, Y0 + DY + 0.6], [X0 - 0.3, Y0 + DY + 0.6]]), fill: '#000', opacity: 0.55, filter: 'url(#oBlur)' }, g);
    // floor grid ticks
    for (let k = -1; k <= 5; k++) mk('polyline', { points: I.poly([[X0 - 1.6, Y0 + k * 0.9], [X0 + DX + 1.8, Y0 + k * 0.9]]), fill: 'none', stroke: '#13201f', 'stroke-width': 1 }, g);
    box(g, X0, Y0, 0, DX, DY, DZ, { top: 'url(#oT)', left: 'url(#oL)', right: 'url(#oR)', edge: '#53646b' });

    // right face: vents
    const rf = mk('g', { transform: mRight(X0 + DX, Y0 + DY, DZ) }, g);
    const RW = DY * SC, H = DZ * SC;
    for (let y = 30; y < H - 30; y += 9) mk('line', { x1: 18, x2: RW - 18, y1: y, y2: y, stroke: '#1a2428', 'stroke-width': 3, 'stroke-linecap': 'round' }, rf);
    // top face: cable glands
    const tf = mk('g', { transform: mTop(X0, Y0, DZ) }, g);
    [[0.9, 0.8], [2.4, 0.8]].forEach(([x, y]) => { mk('circle', { cx: x * SC, cy: y * SC, r: 9, fill: '#11181b', stroke: '#4a5960', 'stroke-width': 1 }, tf); mk('circle', { cx: x * SC, cy: y * SC, r: 4, fill: '#060809' }, tf); });

    // front face
    const ff = mk('g', { transform: mLeft(X0, Y0 + DY, DZ) }, g);
    const W = DX * SC;
    mk('rect', { x: 4, y: 4, width: W - 8, height: H - 8, rx: 3, fill: 'none', stroke: '#26343a', 'stroke-width': 1 }, ff);
    // LIC modules
    for (let k = 0; k < 2; k++) {
      const y = 14 + k * 40;
      const gg = mk('g', {}, ff);
      mk('rect', { x: 10, y, width: W - 20, height: 34, rx: 3, fill: '#0a1311', stroke: '#1e3a31', 'stroke-width': 1 }, gg);
      for (let c = 0; c < 12; c++) mk('circle', { cx: 74 + c * 10.6, cy: y + 11, r: 3.8, fill: '#11221d', stroke: '#24463b', 'stroke-width': 0.8 }, gg);
      mk('text', { x: 18, y: y + 14.5, fill: C.lic, 'font-size': 10, 'letter-spacing': 0.5 }, gg).textContent = 'LIC-' + 'AB'[k];
      mk('rect', { x: 18, y: y + 22, width: W - 36, height: 6, rx: 2, fill: '#0f1a17' }, gg);
      const bar = mk('rect', { x: 18, y: y + 22, width: 0, height: 6, rx: 2, fill: C.lic, filter: 'url(#oGlow)' }, gg);
      const halo = mk('rect', { x: 10, y, width: W - 20, height: 34, rx: 3, fill: 'none', stroke: C.lic, 'stroke-width': 1.4, opacity: 0 }, gg);
      E.lic.push({ bar, halo, w: W - 36 });
    }
    mk('line', { x1: 10, x2: W - 10, y1: 96, y2: 96, stroke: '#26343a', 'stroke-width': 1 }, ff);
    // 8 BBU drawers
    for (let k = 0; k < 8; k++) {
      const y = 104 + k * 38;
      const gg = mk('g', {}, ff);
      const frame = mk('rect', { x: 10, y, width: W - 20, height: 34, rx: 2.5, fill: '#0d1316', stroke: '#222f35', 'stroke-width': 1 }, gg);
      mk('rect', { x: 15, y: y + 6, width: 3, height: 22, rx: 1.5, fill: '#2b383e' }, gg);
      const lbl = mk('text', { x: 26, y: y + 14, fill: C.dim, 'font-size': 10, 'letter-spacing': 0.4 }, gg); lbl.textContent = 'BBU-' + (k + 1);
      mk('rect', { x: 26, y: y + 20, width: W - 66, height: 7, rx: 2, fill: '#141c20' }, gg);
      const bar = mk('rect', { x: 26, y: y + 20, width: 0, height: 7, rx: 2, fill: 'url(#oBar)' }, gg);
      const led = mk('circle', { cx: W - 24, cy: y + 17, r: 3.6, fill: C.lic, filter: 'url(#oGlow)' }, gg);
      E.drawers.push({ frame, bar, led, lbl, w: W - 66 });
    }
    // callouts (screen space). Leaders are geometry; the labels live in their own <g> so they can be
    // counter-scaled when the cabinet is drawn small (one-screen layout on short viewports).
    const labels = [];
    const call = (p, dx, txt, sub, anchor) => {
      const [x, y] = p;
      const x2 = x + dx;
      mk('polyline', { points: `${f1(x)},${f1(y)} ${f1(x2)},${f1(y)}`, fill: 'none', stroke: '#33454c', 'stroke-width': 1 }, g);
      mk('circle', { cx: f1(x), cy: f1(y), r: 2.2, fill: C.ink }, g);
      labels.push([x2, y, txt, sub, anchor]);
    };
    const fz = (z) => P(X0, Y0 + DY, DZ - z / SC);
    call(fz(31), -70, 'LIC ×2', '吸收前 2 秒的峰值', 'end');
    call(fz(104 + 4 * 38 - 2), -70, 'BBU ×8', '每台 2.5 kWh LFP', 'end');
    const [rx, ry] = P(X0 + DX, Y0 + DY * 0.5, DZ * 0.62);
    call([rx, ry], 62, '並聯輸出', '→ 機櫃負載', 'start');
    E.geoBB = g.getBBox ? g.getBBox() : null;
    E.calls = labels.map(([x2, y, txt, sub, anchor], n) => {
      const lg = mk('g', { transform: `translate(${f1(x2)},${f1(y)})` }, g);
      const o = anchor === 'end' ? -6 : 6;
      mk('text', { x: o, y: -3, 'text-anchor': anchor, fill: C.ink, 'font-size': 14 }, lg).textContent = txt;
      mk('text', { x: o, y: 15, 'text-anchor': anchor, fill: C.dim, 'font-size': 11.5 }, lg).textContent = sub;
      if (n === 2) E.out = mk('text', { x: 6, y: 38, fill: C.ink, 'font-size': 22, 'font-weight': 500 }, lg);
      return { lg, x: x2, y };
    });
    E.out.textContent = '120.0 kW';
    E.fullBB = g.getBBox ? g.getBBox() : null;
    fitCab();
  }
  // Wide one-screen layout: frame the cabinet geometry only and counter-scale the labels so they stay
  // ~13 px on screen however small the cabinet gets. Narrow layouts keep the original framing.
  const WIDE = window.matchMedia('(min-width: 1101px)');
  function fitCab() {
    const svg = $('cab');
    if (!svg || !E.fullBB) return;
    const wide = WIDE.matches && E.geoBB;
    const bb = wide ? E.geoBB : E.fullBB, pad = wide ? 4 : 12;
    const vb = [bb.x - pad, bb.y - pad, bb.width + pad * 2, bb.height + pad * 2];
    svg.setAttribute('viewBox', vb.map(f1).join(' '));
    let s = 1;
    if (wide) {
      const r = svg.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const k = 1 / Math.min(r.width / vb[2], r.height / vb[3]); // viewBox units per CSS px
        s = Math.max(1, Math.min(2.2, (13 * k) / 14));
      }
    }
    E.calls.forEach((c) => c.lg.setAttribute('transform', `translate(${f1(c.x)},${f1(c.y)}) scale(${s.toFixed(3)})`));
  }

  /* ---------------- list ---------------- */
  function buildList() {
    const ol = $('bbu-list');
    ol.innerHTML = '<li class="bh" aria-hidden="true"><span>台</span><span>LFP 輸出功率</span><span style="text-align:right">剩餘電量</span><span style="text-align:right">C-rate</span></li>' +
      Array.from({ length: 8 }, (_, k) => `<li><span class="bn">BBU-${k + 1}</span><span class="bb"><i></i></span><span class="bs">100.00%</span><span class="bc">—</span></li>`).join('');
    E.rows = [...ol.querySelectorAll('li:not(.bh)')].map((li) => ({ li, bar: li.querySelector('.bb i'), soc: li.querySelector('.bs'), c: li.querySelector('.bc') }));
  }

  /* ---------------- timeline ---------------- */
  const tl = {};
  function drawTL() {
    const cv = tl.cv; if (!cv) return;
    const r = cv.getBoundingClientRect(), d = DPR();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (cv.width !== w * d || cv.height !== h * d) { cv.width = w * d; cv.height = h * d; }
    const cx = cv.getContext('2d'); cx.setTransform(d, 0, 0, d, 0, 0); cx.clearRect(0, 0, w, h);
    const narrow = w < 560;
    const L = 0, R = narrow ? 40 : 52, T = 22, B = 20, pw = w - L - R, ph = h - T - B;
    const X = (t) => L + uOf(t) * pw;
    const Y = (v) => T + ph * (1 - (v + 30) / 155);
    const { s, fault } = D[st.sc];
    cx.font = '10px ' + FONT.mono;
    // stage bands
    const band = (a, b, lbl, col) => { cx.fillStyle = col; cx.fillRect(X(a), T, X(b) - X(a), ph); };
    band(0, 0.5, '', 'rgba(255,79,26,.08)');
    band(0.5, 2, '', 'rgba(255,178,62,.05)');
    cx.fillStyle = C.dim; cx.textAlign = 'left';
    cx.fillText(narrow ? '峰值→斜降' : '峰值 0.5 s → 斜降 1.5 s', X(0) + 4, T - 8);
    cx.fillStyle = C.dim; cx.fillText(narrow ? '連續 30 kW' : '連續輸出 30 kW · 58 s', X(3) + 6, T - 8);
    cx.strokeStyle = C.dim2; cx.setLineDash([3, 3]); cx.beginPath(); cx.moveTo(X(3) + 0.5, T - 4); cx.lineTo(X(3) + 0.5, T + ph); cx.stroke(); cx.setLineDash([]);
    // grid
    // 0 and 30 kW sit close on short timelines: nudge their labels apart instead of overlapping
    const tight = Y(0) - Y(30) < 13;
    [0, 30, 120].forEach((v) => { const y = Y(v); cx.strokeStyle = v ? 'rgba(227,235,232,.06)' : 'rgba(227,235,232,.18)'; cx.beginPath(); cx.moveTo(L, y + 0.5); cx.lineTo(L + pw, y + 0.5); cx.stroke(); cx.fillStyle = C.dim; cx.textAlign = 'left'; cx.fillText(v + ' kW', L + pw + 6, y + 3.5 + (tight ? (v === 30 ? -4 : v === 0 ? 5 : 0) : 0)); });
    cx.textAlign = 'center';
    (narrow ? [0, 3, 15, 30, 45, 60] : [0, 1, 2, 3, 15, 30, 45, 60]).forEach((t) => cx.fillText(t + ' s', Math.max(L + 10, Math.min(L + pw - 12, X(t))), h - 4));
    // fault marker
    if (fault != null) {
      const x = X(fault);
      cx.strokeStyle = C.bad; cx.setLineDash([3, 3]); cx.beginPath(); cx.moveTo(x + 0.5, T - 4); cx.lineTo(x + 0.5, T + ph); cx.stroke(); cx.setLineDash([]);
      cx.fillStyle = C.bad; cx.textAlign = 'left'; cx.fillText(narrow ? 'N−1' : 'BBU-8 離線', x + 5, T + 10);
    }
    const series = (arr, col, lw, fill) => {
      cx.beginPath(); for (let i = 0; i < s.t.length; i++) { const x = X(s.t[i]), y = Y(arr[i]); if (i) cx.lineTo(x, y); else cx.moveTo(x, y); }
      if (fill) { cx.save(); cx.lineTo(X(60), Y(0)); cx.lineTo(X(0), Y(0)); cx.closePath(); cx.fillStyle = fill; cx.fill(); cx.restore(); cx.beginPath(); for (let i = 0; i < s.t.length; i++) { const x = X(s.t[i]), y = Y(arr[i]); if (i) cx.lineTo(x, y); else cx.moveTo(x, y); } }
      cx.strokeStyle = col; cx.lineWidth = lw; cx.lineJoin = 'round'; cx.stroke();
    };
    const draw = () => { series(s.p_lic_kw, C.lic, 1.4, 'rgba(61,255,154,.10)'); series(s.p_total_kw, C.ink, 1.2); series(s.p_lfp_kw, C.lfp, 2); };
    const px = X(st.t);
    cx.save(); cx.globalAlpha = 0.28; draw(); cx.restore();
    cx.save(); cx.beginPath(); cx.rect(0, 0, px, h); cx.clip(); draw(); cx.restore();
    // playhead
    cx.strokeStyle = C.ink; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(px + 0.5, T - 4); cx.lineTo(px + 0.5, T + ph); cx.stroke();
    const i = idx(st.t);
    [[s.p_lfp_kw[i], C.lfp], [s.p_lic_kw[i], C.lic], [s.p_total_kw[i], C.ink]].forEach(([v, col]) => { cx.fillStyle = col; cx.beginPath(); cx.arc(px, Y(v), 3, 0, 7); cx.fill(); });
  }

  /* ---------------- frame ---------------- */
  let lastN = 8;
  function render() {
    const d = D[st.sc], s = d.s, i = idx(st.t), t = st.t;
    const n = d.n ? d.n[i] : 8;
    const stg = $('o-stage');
    stg.textContent = t < 0.5 ? '峰值保持' : t < 2 ? '斜降' : '連續輸出';
    $('o-p').textContent = s.p_total_kw[i].toFixed(1);
    const plv = Math.abs(s.p_lic_kw[i]) < 0.05 ? 0 : s.p_lic_kw[i];
    $('o-lic').textContent = (plv < 0 ? '−' : '') + Math.abs(plv).toFixed(1);
    $('o-lic-s').textContent = plv > 0.05 ? '放電 · 吸收峰值' : plv < -0.05 ? '回充' : '待命';
    const pb = d.per[0][i];
    $('o-c').textContent = (pb / 2.5).toFixed(2);
    const on = $('o-n'); on.textContent = n < 8 ? '7 台運作 · BBU-8 離線' : '8 台運作'; on.classList.toggle('warn', n < 8);
    $('o-temp').textContent = s.t_cell_c[i].toFixed(2);
    $('o-tc').textContent = (t < 10 ? '0' : '') + t.toFixed(1);
    const sc = $('o-scrub'); sc.value = t.toFixed(2); sc.style.setProperty('--p', ((t / 60) * 100).toFixed(2) + '%');
    // cabinet
    const pl = s.p_lic_kw[i];
    E.lic.forEach((m) => {
      const k = Math.min(1, Math.abs(pl) / 45);
      m.bar.setAttribute('width', (m.w * k).toFixed(1));
      m.bar.setAttribute('fill', pl >= 0 ? C.lic : '#2a8f63');
      m.halo.setAttribute('opacity', (pl > 0 ? Math.min(1, pl / 60) : 0).toFixed(2));
    });
    E.drawers.forEach((dr, k) => {
      const p = d.per[k][i], off = k >= n;
      dr.bar.setAttribute('width', ((dr.w * Math.min(1, p / PMAX_BBU)) || 0).toFixed(1));
      dr.led.setAttribute('fill', off ? C.bad : C.lic);
      dr.frame.setAttribute('stroke', off ? '#7a2a2e' : '#222f35');
      dr.lbl.textContent = off ? 'BBU-' + (k + 1) + ' OFFLINE' : 'BBU-' + (k + 1);
      dr.lbl.setAttribute('fill', off ? C.bad : C.dim);
      const row = E.rows[k];
      row.li.classList.toggle('off', off);
      row.bar.style.width = (Math.min(1, p / PMAX_BBU) * 100).toFixed(1) + '%';
      row.soc.textContent = d.soc[k][i].toFixed(2) + '%';
      row.c.textContent = off ? '離線' : (p / 2.5).toFixed(2) + 'C';
    });
    if (E.out) E.out.textContent = s.p_total_kw[i].toFixed(1) + ' kW';
    if (n !== lastN && n < 8 && gsap && !RM) {
      gsap.fromTo(E.drawers[7].frame, { attr: { 'stroke-width': 4 } }, { attr: { 'stroke-width': 1 }, duration: 0.9, ease: 'power2.out' });
      gsap.fromTo('#o-c', { color: '#ffffff' }, { color: C.lfp, duration: 1.2 });
    }
    lastN = n;
    drawTL();
  }

  /* ---------------- transport ---------------- */
  function setPlaying(p) {
    st.playing = p;
    $('outage').classList.toggle('paused-o', !p);
    $('o-play').setAttribute('aria-label', p ? '暫停' : '播放');
    $('o-play').setAttribute('aria-pressed', String(p));
  }
  let last = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (st.playing) {
      if (st.u >= 1) { st.hold += dt; if (st.hold > 2.2) { st.hold = 0; st.u = 0; } }
      else st.u = Math.min(1, st.u + (dt * st.speed) / 60);
      st.t = tOf(st.u);
      render();
    }
    raf(loop);
  }
  function seek(t) { st.t = Math.max(0, Math.min(60, t)); st.u = uOf(st.t); st.hold = 0; render(); }

  async function init() {
    const get = (f) => fetchData(f).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
    const [g, n1] = await Promise.all([get('rack_60s_graceful.json'), get('rack_n_minus_1.json')]);
    prep('normal', g); prep('n1', n1);
    tl.cv = $('otl');
    buildCab(); buildList();
    $('o-play').addEventListener('click', () => { if (st.u >= 1) seek(0); setPlaying(!st.playing); st.userPaused = !st.playing; });
    $('o-scrub').addEventListener('input', (e) => { setPlaying(false); st.userPaused = true; seek(+e.target.value); });
    document.querySelectorAll('[data-ospeed]').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('[data-ospeed]').forEach((x) => x.classList.toggle('on', x === b));
      st.speed = +b.dataset.ospeed; if (!st.playing) { if (st.u >= 1) seek(0); setPlaying(true); st.userPaused = false; }
    }));
    document.querySelectorAll('[data-sc]').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('[data-sc]').forEach((x) => x.classList.toggle('on', x === b));
      st.sc = b.dataset.sc; lastN = 8;
      if (b.dataset.sc === 'n1' && st.t > 15 && st.playing) seek(12); else render();
    }));
    // scrub by dragging on the timeline
    let drag = false;
    const tAt = (e) => { const r = tl.cv.getBoundingClientRect(), pw = r.width - (r.width < 560 ? 40 : 52); return tOf(Math.max(0, Math.min(1, (e.clientX - r.left) / pw))); };
    tl.cv.addEventListener('pointerdown', (e) => { drag = true; tl.cv.setPointerCapture(e.pointerId); setPlaying(false); st.userPaused = true; seek(tAt(e)); });
    tl.cv.addEventListener('pointermove', (e) => { if (drag) seek(tAt(e)); });
    tl.cv.addEventListener('pointerup', () => { drag = false; });
    tl.cv.style.cursor = 'ew-resize';
    onWin('resize', () => raf(() => { fitCab(); render(); }));

    if (q.has('osc')) { const b = document.querySelector(`[data-sc="${q.get('osc')}"]`); if (b) b.click(); }
    const t0 = q.has('ot') ? +q.get('ot') : RM ? 20 : 0;
    seek(t0);
    setPlaying(false);
    if (!RM && !q.has('ot')) {
      const io = new TrackedIO((es) => es.forEach((e) => {
        st.visible = e.isIntersecting;
        if (e.isIntersecting && !st.userPaused) setPlaying(true);
        if (!e.isIntersecting && st.playing) setPlaying(false);
      }), { threshold: 0.35 });
      io.observe($('outage'));
    }
    raf(loop);
  }
  return { init, render, fitCab };
})();

// ===== arch.js =====
/* Architecture map on paper: five layers + V1–V8 verification chain, no frames */
const Arch = (function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const n = (s) => `<span class="num">${s}</span>`;
  const STATUS = { impl: '已實作', sim: '模擬資料', concept: '概念設計' };

  const LAYERS = [
    { id: 'L1', key: 'PHYSICS', status: 'impl', title: '物理模型', tech: 'PyBaMM DFN ＋ LIC 一階 RC', glyph: 'curve', out: '電壓・電流軌跡',
      sum: '用電化學模型算出電池在每一毫秒的電壓與電流；數位孿生的一切都從這一層開始。',
      facts: [`LFP 電芯：PyBaMM ${n('26.4.1')} 的 DFN 模型，搭配 Prada2013 參數組`, `LIC 電容：封閉形式一階 RC，C = ${n('332 F')}、ESR = ${n('2.5 mΩ')}、額定 ${n('51.3 V')}、UVLO ${n('38 V')}（參數錨定 Eaton XLR 規格書，該型號實為 EDLC；量產改用 Musashi ULTIMO CPQ3300SD）`, `上一段的電池動畫就是這一層的輸出：transient_hybrid.json，${n('10 s')}／${n('800')} 點`],
      verify: ['V1', 'V2', 'V7'] },
    { id: 'L2', key: 'CONTROL', status: 'impl', tagNote: 'Python 模擬器', title: '分頻控制', tech: '互補濾波 τ = 0.5 s @ 1 kHz', glyph: 'split', out: '分頻後的功率指令',
      sum: '把負載功率拆成高頻與低頻：高頻瞬態交給 LIC，LFP 只看到平滑過的平均值。',
      facts: [`一階互補濾波，τ = ${n('0.5 s')}（截止約 ${n('0.32 Hz')}），控制迴圈 ${n('1 kHz')}`, `模擬資料中，負載在 ${n('56')} 與 ${n('104 kW')} 間跳動；LIC 峰值吐出 ${n('47.5 kW')}，LFP 平穩收斂在 ${n('80 kW')} 附近`, `V8 監督層讓 τ 隨電池健康度調整，老化後仍壓得住峰值倍率`, `誠實說明：控制律目前以 Python 模擬器為準，STM32 韌體仍是骨架`],
      verify: ['V3', 'V4', 'V8'] },
    { id: 'L3', key: 'AI', status: 'impl', title: 'AI 壽命預測', tech: 'TCN ＋ 90% 信心區間', glyph: 'band', out: '剩餘壽命＋區間',
      sum: '從電芯的工況特徵預測剩餘循環壽命（RUL），並給出 90% 預測區間，而不是只給一個數字。',
      facts: [`TCN：${n('4')} 層膨脹卷積、${n('31,281')} 個參數、輸入 ${n('99 × 7')} 特徵`, `訓練資料 ${n('188')} 顆電芯：Severson 2019 的 ${n('138')} 顆＋${n('50')} 顆合成 BBU 工況`, `MC-Dropout ＋ split conformal，輸出 ${n('90%')} 預測區間`, `測試集 MAPE ${n('18.15%')}、R² ${n('0.892')}（FP32）`],
      verify: ['V5'] },
    { id: 'L4', key: 'EDGE', status: 'concept', title: '邊緣推論', tech: 'STM32N6 NPU', glyph: 'chip', out: '本地 RUL（規劃中）',
      sum: '目標是在每台 BBU 上本地跑壽命模型、不依賴網路。這一層目前是概念設計，尚未實作。',
      facts: [`目標晶片：STM32N6 Neural-ART NPU（尚未上板）`, `目前唯一的實測延遲來自筆電 CPU：TCN ONNX p99 ${n('0.098 ms')}`, `NPU 上的延遲尚未實測，因此這裡不列任何 NPU 數字`],
      verify: [], none: '這一層還沒有驗證關卡，所以標為概念設計。' },
    { id: 'L5', key: 'CLOUD', status: 'sim', title: '機隊儀表板', tech: '1000 台 · 模擬資料', glyph: 'map', out: '汰換佇列・警示',
      sum: '把每台 BBU 的健康度、剩餘壽命與警示集中在一張地圖上。目前所有設備資料都是模擬產生。',
      facts: [`${n('1000')} 台模擬設備：Texas ${n('492')}、Virginia ${n('275')}、其他 ${n('233')}`, `狀態分布：健康 ${n('903')}、熱警示 ${n('20')}、早期老化 ${n('77')}`, `儀表板設全頁模擬資料聲明，機隊資料面板帶「SIMULATED DATA」浮水印`, `Next.js 靜態輸出，部署於 Vercel`],
      verify: [], none: '顯示層，沒有獨立驗證關卡；資料來源一律標示為模擬。' },
  ];

  const VCHECK = {
    V1: { layer: 'L1', name: '物理擬合', line: `放電曲線 RMS 誤差 ${n('2.15%')}（門檻 ${n('5%')}）`, sum: 'PyBaMM 模擬的放電曲線，對照 Severson 2019 的實測資料。',
      facts: [`RMS 誤差 ${n('2.15%')}，門檻 ${n('5%')}`, `樣本限制：僅 ${n('3')} 顆電芯、b1 批次第 ${n('10')} 圈，我們照實標註`] },
    V2: { layer: 'L1', name: '電容 RC 模型', line: `壓降低估 ≤ ${n('2.93%')}（門檻 ${n('10%')}）`, sum: '一階 RC 電容模型，對照元件規格書的壓降曲線。',
      facts: [`壓降低估 ≤ ${n('2.93%')}，門檻 ${n('10%')}`, `worst-case 壓降 ${n('2.32 V')}，距 UVLO 還有 ${n('10.98 V')} 餘裕`] },
    V3: { layer: 'L2', name: '斷電 60 秒', line: `整櫃放電深度 ${n('2.66%')}，電芯最高 ${n('25.1°C')}`, sum: '8 台 BBU 並聯，模擬市電中斷後撐住整櫃 60 秒。',
      facts: [`放電深度 ${n('2.66%')}：輸出 ${n('1912.5 kJ')}／容量 ${n('72000 kJ')}，能量餘量 ${n('37.6×')}`, `峰值 ${n('6C')} 只持續不到 ${n('2 s')}，之後 ${n('1.5C')} 連續`, `電芯最高溫 ${n('25.1°C')}（模擬）`] },
    V4: { layer: 'L2', name: 'N−1 故障', line: `拔掉 1 台，其餘單台 ${n('1.71C')}`, sum: '在 t = 15 s 拔掉其中 1 台，看剩下 7 台能不能撐住。',
      facts: [`剩 ${n('7')} 台單台連續 ${n('1.71C')}（${n('+14.3%')}）`, `電壓擺幅 ${n('277 mV')}、溫度 ${n('25.1°C')}`] },
    V5: { layer: 'L3', name: '跨工況', kind: 'disclose', line: `MAPE ${n('9.04%')} → ${n('80.20%')}（bagged-GBT 基線，非 TCN；揭露）`, sum: 'V5 測的是 bagged-GBT 基線模型，不是本層的 TCN：從實驗室工況換到 BBU 工況時誤差大幅上升，這是目前最大的已知限制，我們公開揭露。',
      facts: [`受測模型：bagged-GBT（K = ${n('24')}、${n('9')} 特徵），非 TCN`, `Severson 工況自測 MAPE ${n('9.04%')}`, `換到 BBU 工況 MAPE ${n('80.20%')}，退化 ${n('8.87×')}`, `代表模型還不能直接套用到 BBU 現場資料`] },
    V6: { layer: null, name: '一鍵全驗', line: `全驗報告 ${n('6/6')} 通過（略過 V1），耗時 ${n('55.2 s')}`, sum: 'make verify 一條指令重跑 V1–V5、V8 與 XCHECK，任何人都能重跑；V7 為獨立腳本，不在總成內。',
      facts: [`全驗報告 ${n('6/6')} 通過、耗時 ${n('55.2 s')}：V2–V5、V8、XCHECK（略過 V1：需另下載 ${n('8.3 GB')}）`, `交叉驗證 ${n('43/43')} 全數通過`, `指令：make verify（V1 需另下載約 ${n('8.3 GB')} Severson 資料集）`] },
    V7: { layer: 'L1', name: '電芯不均衡', line: `最弱電芯瞬態負擔 ${n('−13.3%')}（篩檢）`, sum: '15 串電芯參數不一致時，檢查最弱的那顆是否被拖垮。',
      facts: [`最弱電芯瞬態負擔 ${n('−13.3%')}`, `屬篩檢項，不是通過門檻`] },
    V8: { layer: 'L2', name: '自適應分頻', line: `老化峰值 ${n('6.06C')} → ${n('5.47C')}`, sum: '電池老化到 80% 健康度後，讓 τ 跟著調整，避免峰值倍率上升。',
      facts: [`固定 τ：老化 pack 峰值 ${n('6.06C')}`, `閉環調到 τ = ${n('0.75 s')}：峰值降回 ${n('5.47C')}`] },
  };

  const GLYPH = {
    curve: '<svg class="glyph" viewBox="0 0 160 52" preserveAspectRatio="none"><path d="M2 46 H158 M2 46 V2" fill="none" stroke="currentColor" stroke-width="1" opacity=".25" vector-effect="non-scaling-stroke"/><path d="M4 10 C30 13 60 15 96 18 S136 26 146 34 L156 48" fill="none" stroke="var(--lfp-p)" stroke-width="2" vector-effect="non-scaling-stroke"/><path d="M4 12 C30 15 60 17 96 20 S136 29 146 37 L155 48" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/></svg>',
    split: '<svg class="glyph" viewBox="0 0 160 52" preserveAspectRatio="none"><path d="M2 32 H16 V8 H32 V32 H48 V8 H64 V32 H80 V8 H96 V32 H112 V8 H128 V32 H144 V8 H158" fill="none" stroke="currentColor" stroke-width="1" opacity=".4" vector-effect="non-scaling-stroke"/><path d="M2 32 C26 27 44 22 70 21 S120 20 158 20" fill="none" stroke="var(--lfp-p)" stroke-width="2.2" vector-effect="non-scaling-stroke"/><path d="M16 44 V34 Q24 38 32 39 V50 M48 44 V34 Q56 38 64 39 V50 M80 44 V34 Q88 38 96 39 V50 M112 44 V34 Q120 38 128 39 V50" fill="none" stroke="var(--lic-p)" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>',
    band: '<svg class="glyph" viewBox="0 0 160 52" preserveAspectRatio="none"><path d="M2 4 C40 9 80 17 158 32 L158 50 C80 36 40 20 2 12 Z" fill="currentColor" opacity=".1"/><path d="M2 8 C40 13 80 22 158 41" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/><g fill="currentColor"><circle cx="22" cy="11" r="2.2"/><circle cx="52" cy="15" r="2.2"/><circle cx="84" cy="22" r="2.2"/><circle cx="114" cy="30" r="2.2"/><circle cx="140" cy="35" r="2.2"/></g></svg>',
    chip: '<svg class="glyph" viewBox="0 0 160 52" preserveAspectRatio="xMinYMid meet"><rect x="16" y="8" width="36" height="36" rx="3" fill="none" stroke="currentColor" stroke-dasharray="3 3"/><rect x="25" y="17" width="18" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-dasharray="2 2"/><path d="M22 2v6M30 2v6M38 2v6M46 2v6M22 44v6M30 44v6M38 44v6M46 44v6M10 14h6M10 22h6M10 30h6M10 38h6M52 14h6M52 22h6M52 30h6M52 38h6" stroke="currentColor" opacity=".6"/></svg>',
    map: null,
  };
  function mapGlyph() {
    let s = '';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 18; c++) {
      const x = 6 + c * 8.6 + (r % 2) * 4.3, y = 6 + r * 10;
      const h = (r * 31 + c * 17) % 23;
      const fill = h === 3 ? 'var(--lfp-p)' : h === 11 ? '#d0342c' : 'currentColor';
      s += `<circle cx="${x.toFixed(1)}" cy="${y}" r="1.9" fill="${fill}" opacity="${h === 3 || h === 11 ? 1 : 0.3}"/>`;
    }
    return `<svg class="glyph" viewBox="0 0 160 52" preserveAspectRatio="xMinYMid meet">${s}</svg>`;
  }

  let selected = null;
  const mqMobile = window.matchMedia('(max-width: 1000px)');
  const vBtn = (v) => `<button type="button" style="order:${v.slice(1)}" class="vnode${VCHECK[v].kind === 'disclose' ? ' disclose' : ''}" data-v="${v}" aria-controls="detail" title="${v} ${VCHECK[v].name}">${v}</button>`;

  function render() {
    $('layers').innerHTML = LAYERS.map((L) => `
      <li class="layer" data-id="${L.id}" data-status="${L.status}">
        <button class="layer-btn" type="button" aria-expanded="false" aria-controls="detail">
          <span class="layer-top"><b>${L.id}</b><span class="tag t-${L.status}">${STATUS[L.status]}</span></span>
          <span class="port" aria-hidden="true"></span>
          ${fixVar(L.glyph === 'map' ? mapGlyph() : GLYPH[L.glyph])}
          <span class="layer-title">${L.title}</span>
          <span class="layer-tech">${L.tech}</span>
          <span class="layer-out"><b>OUT →</b><span>${L.out}</span></span>
          <span class="layer-more">看細節</span>
        </button>
      </li>`).join('');
    $('rail-cols').innerHTML = LAYERS.map((L) => `<div class="rail-col" data-layer="${L.id}">${L.verify.length ? L.verify.map(vBtn).join('') : `<span class="rail-none">— ${L.status === 'concept' ? '尚無驗證關卡' : '顯示層 · 無關卡'}</span>`}</div>`).join('');
    $('rail-end').insertAdjacentHTML('afterbegin', vBtn('V6'));

    document.querySelectorAll('.layer').forEach((li) => {
      const id = li.dataset.id, b = li.querySelector('.layer-btn');
      li.addEventListener('mouseenter', () => hover(id, true));
      li.addEventListener('mouseleave', () => hover(id, false));
      b.addEventListener('focus', () => hover(id, true));
      b.addEventListener('blur', () => hover(id, false));
      b.addEventListener('click', () => select(id));
    });
    document.querySelectorAll('.vnode').forEach((b) => {
      const v = b.dataset.v;
      b.addEventListener('mouseenter', () => hoverV(v, true));
      b.addEventListener('mouseleave', () => hoverV(v, false));
      b.addEventListener('click', () => select(v));
    });
  }

  // ---------------- wires ----------------
  const W = { links: {}, parts: [], geom: null, vertical: false };
  const mk = (tag, a, p) => { const e = document.createElementNS(NS, tag); let st = ''; for (const k in a) { const v = String(a[k]); if (v.includes('var(')) st += `${k}:${v};`; else e.setAttribute(k, v); } if (st) e.setAttribute('style', st); if (p) p.appendChild(e); return e; };
  const fixVar = (h) => h.replace(/(fill|stroke)="(var\(--[\w-]+\))"/g, 'style="$1:$2"');
  function layout() {
    const svg = $('wires'), host = $('arch-diagram');
    const hb = host.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${hb.width} ${hb.height}`);
    svg.innerHTML = ''; W.links = {}; W.parts = [];
    const rel = (r) => ({ x: r.left - hb.left, y: r.top - hb.top, w: r.width, h: r.height });
    const cols = [...document.querySelectorAll('.layer')].map((el) => rel(el.getBoundingClientRect()));
    if (!cols.length) return;
    W.vertical = mqMobile.matches;
    const statusOf = (k) => LAYERS[k].status;
    if (!W.vertical) {
      const port = rel(document.querySelector('.layer .port').getBoundingClientRect());
      const y = port.y + port.h / 2;
      const x0 = cols[0].x, x1 = cols[4].x + cols[4].w, split = cols[3].x;
      W.geom = { x0, x1, y, split };
      mk('path', { d: `M${x0} ${y} H${split}`, stroke: 'var(--acc)', 'stroke-width': 1.6, fill: 'none', class: 'flow-solid' }, svg);
      mk('path', { d: `M${split} ${y} H${x1}`, stroke: 'var(--acc)', 'stroke-width': 1.4, 'stroke-dasharray': '5 6', fill: 'none', opacity: 0.6, class: 'flow-dash' }, svg);
      cols.forEach((c, k) => {
        const px = c.x + parseFloat(getComputedStyle(document.querySelectorAll('.layer-btn')[k]).paddingLeft);
        const concept = statusOf(k) === 'concept';
        mk('circle', { cx: px + 5, cy: y, r: 5.5, fill: concept ? 'var(--bg)' : 'var(--acc)', stroke: 'var(--acc)', 'stroke-width': 1.4, 'stroke-dasharray': concept ? '2 2' : '0' }, svg);
        mk('text', { x: px + 16, y: y - 8, 'font-family': FONT.mono, 'font-size': 10, 'letter-spacing': 1, fill: 'var(--fg2)' }, svg).textContent = k === 0 ? 'SOURCE' : 'IN';
        if (k < 4) {
          const ax = c.x + c.w - 4;
          mk('path', { d: `M${ax - 6} ${y - 5} L${ax} ${y} L${ax - 6} ${y + 5}`, fill: 'none', stroke: 'var(--acc)', 'stroke-width': 1.4, opacity: k >= 2 ? 0.6 : 1 }, svg);
        }
      });
      // verification links
      const bottom = rel(document.querySelector('.layers').getBoundingClientRect());
      const lb = bottom.y + bottom.h;
      document.querySelectorAll('.rail-col .vnode').forEach((b) => {
        const r = rel(b.getBoundingClientRect()), x = r.x + r.w / 2;
        const p = mk('path', { d: `M${x} ${r.y} V${lb}`, stroke: 'var(--line)', 'stroke-width': 1, fill: 'none' }, svg);
        const dot = mk('circle', { cx: x, cy: lb, r: 2.5, fill: 'var(--line)' }, svg);
        W.links[b.dataset.v] = { p, dot };
      });
    } else {
      const x = 10;
      const ys = cols.map((c) => c.y + 28);
      W.geom = { x, y0: ys[0], y1: ys[4], split: ys[3] };
      mk('path', { d: `M${x} ${ys[0]} V${ys[3]}`, stroke: 'var(--acc)', 'stroke-width': 1.6, fill: 'none' }, svg);
      mk('path', { d: `M${x} ${ys[3]} V${ys[4]}`, stroke: 'var(--acc)', 'stroke-width': 1.4, 'stroke-dasharray': '5 6', fill: 'none', opacity: 0.6 }, svg);
      ys.forEach((yy, k) => { const concept = statusOf(k) === 'concept'; mk('circle', { cx: x, cy: yy, r: 5, fill: concept ? 'var(--bg)' : 'var(--acc)', stroke: 'var(--acc)', 'stroke-width': 1.4, 'stroke-dasharray': concept ? '2 2' : '0' }, svg); });
    }
    W.partG = mk('g', {}, svg);
    const nP = W.vertical ? 10 : 30;
    for (let i = 0; i < nP; i++) {
      const g = mk('g', {}, W.partG);
      mk('circle', { r: 7, fill: '#ff4f1a', opacity: 0.16 }, g);
      const c = mk('circle', { r: 2.6, fill: '#ff4f1a' }, g);
      W.parts.push({ g, c, s: i / nP });
    }
    placeParticles(); syncLinks();
  }
  function placeParticles() {
    const G = W.geom; if (!G) return;
    for (const p of W.parts) {
      let x, y, concept;
      if (!W.vertical) { x = G.x0 + p.s * (G.x1 - G.x0); y = G.y; concept = x > G.split; }
      else { x = G.x; y = G.y0 + p.s * (G.y1 - G.y0); concept = y > G.split; }
      p.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      p.g.setAttribute('opacity', concept ? 0.45 : 1);
      p.c.setAttribute('fill', concept ? 'var(--bg)' : '#ff4f1a');
      p.c.setAttribute('stroke', concept ? '#ff4f1a' : 'none');
    }
  }
  let lastT = 0, running = false;
  function tick(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    const G = W.geom; const span = G ? (W.vertical ? G.y1 - G.y0 : G.x1 - G.x0) : 1000;
    for (const p of W.parts) { p.s += (90 * dt) / Math.max(200, span); if (p.s > 1) p.s -= 1; }
    placeParticles();
    if (running) raf(tick);
  }
  function startFlow() { if (RM || running) return; running = true; lastT = performance.now(); raf(tick); }
  function stopFlow() { running = false; }

  // ---------------- state ----------------
  const lit = new Set();
  function syncLinks() {
    for (const v in W.links) {
      const L = W.links[v], on = lit.has(v);
      const col = !on ? 'var(--line)' : VCHECK[v].kind === 'disclose' ? 'var(--lfp-p)' : 'var(--lic-p)';
      L.p.style.stroke = col; L.p.setAttribute('stroke-width', L.hi ? 2 : 1); L.dot.style.fill = col;
    }
  }
  function light(v) { lit.add(v); document.querySelector(`.vnode[data-v="${v}"]`)?.classList.add('lit'); syncLinks(); }
  function hover(id, on) {
    document.querySelector(`.layer[data-id="${id}"]`).classList.toggle('is-hover', on);
    LAYERS.find((x) => x.id === id).verify.forEach((v) => { document.querySelector(`.vnode[data-v="${v}"]`)?.classList.toggle('is-hover', on); if (W.links[v]) W.links[v].hi = on; });
    syncLinks();
  }
  function hoverV(v, on) {
    const L = VCHECK[v].layer;
    if (L) document.querySelector(`.layer[data-id="${L}"]`).classList.toggle('is-hover', on);
    if (W.links[v]) W.links[v].hi = on; syncLinks();
  }
  function select(id, opts) {
    const quiet = opts && opts.quiet;
    selected = id;
    const isV = id.startsWith('V'), layerId = isV ? VCHECK[id].layer : id;
    document.querySelectorAll('.layer').forEach((li) => {
      const on = li.dataset.id === layerId;
      li.classList.toggle('is-active', on);
      li.querySelector('.layer-btn').setAttribute('aria-expanded', String(on && !isV));
    });
    document.querySelectorAll('.vnode').forEach((b) => b.classList.toggle('is-active', b.dataset.v === id));
    const det = $('detail');
    det.classList.remove('d-anim'); void det.offsetWidth;
    det.innerHTML = isV ? vDetail(id) : lDetail(id);
    if (!quiet) det.classList.add('d-anim');
    if (mqMobile.matches) {
      if (!isV) document.querySelector(`.layer[data-id="${id}"]`).appendChild(det); else $('arch-diagram').after(det);
      if (!quiet) det.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'nearest' });
    } else if (det.parentElement !== document.querySelector('.map')) document.querySelector('.map').appendChild(det);
    if (!quiet) raf(layout);
  }
  function lDetail(id) {
    const L = LAYERS.find((x) => x.id === id);
    const ver = L.verify.length
      ? `<ul>${L.verify.map((v) => `<li class="${VCHECK[v].kind === 'disclose' ? 'disclose' : ''}"><b>${v}</b><span>${VCHECK[v].name}：${VCHECK[v].line}</span></li>`).join('')}</ul>`
      : `<p class="none">${L.none}</p>`;
    return `<div class="d-head"><div class="d-k">${L.id} · ${L.key} <span class="tag t-${L.status}">${STATUS[L.status]}${L.tagNote ? '（' + L.tagNote + '）' : ''}</span></div><h3 class="d-title">${L.title}</h3><p class="d-sum">${L.sum}</p></div>
      <ul class="d-facts">${L.facts.map((f) => `<li>${f}</li>`).join('')}</ul>
      <div class="d-verify"><h4>對應驗證關卡</h4>${ver}</div>`;
  }
  function vDetail(v) {
    const c = VCHECK[v], L = c.layer ? LAYERS.find((x) => x.id === c.layer) : null;
    return `<div class="d-head"><div class="d-k">${v} · 驗證關卡 <span class="tag ${c.kind === 'disclose' ? 't-sim' : 't-impl'}">${c.kind === 'disclose' ? '公開揭露' : L ? '對應 ' + L.id + ' ' + L.title : '跨所有層'}</span></div><h3 class="d-title">${c.name}</h3><p class="d-sum">${c.sum}</p></div>
      <ul class="d-facts">${c.facts.map((f) => `<li>${f}</li>`).join('')}</ul>
      <div class="d-verify"><h4>如何重跑</h4><p class="none">一行指令 <span class="num">make verify</span> 會重跑 V1–V5、V8 與 ${n('43')} 項交叉驗證（V1 需另下載約 ${n('8.3 GB')} 資料集）；V7 為獨立腳本。拿到 repo 的人都能自己驗。</p></div>`;
  }

  function countX(dur) {
    const el = $('xcheck-n'), box = el.parentElement;
    if (RM || !dur) { el.textContent = '43'; box.classList.add('done'); return; }
    const t0 = performance.now();
    (function f(now) { const k = Math.min(1, (now - t0) / dur); el.textContent = String(Math.round(43 * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf(f); else box.classList.add('done'); })(t0);
  }
  const ORDER = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8'];
  function reveal(instant) {
    if (instant) { ORDER.forEach(light); countX(0); startFlow(); return; }
    ORDER.forEach((v, i) => later(() => light(v), 200 + i * 160));
    later(() => countX(1100), 200); startFlow();
  }

  function init() {
    render();
    select('L2', { quiet: true });
    layout();
    onWin('resize', () => { clearTimeout(init.t); init.t = later(() => { if (selected) select(selected, { quiet: true }); layout(); }, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  }
  return { init, reveal, layout, startFlow, stopFlow, get lit() { return lit.size; } };
})();

// ===== main.js =====
/* Orchestration: data load, theme scrub (paper <-> dark), pinned storyboard, reveals */
(function () {
  'use strict';
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const q = new URLSearchParams(location.search);
  const root = HOME;

  // ---------- theme scrub ----------
  const PAPER = { bg: [244, 242, 236], fg: [17, 17, 17], fg2: [95, 94, 88], line: [214, 210, 198] };
  const DARK = { bg: [7, 9, 11], fg: [227, 235, 232], fg2: [125, 141, 137], line: [30, 42, 48] };
  const mix = (a, b, p) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * p)).join(',')})`;
  let themeP = -1, isDark = null;
  const ss = (x) => x * x * (3 - 2 * x);
  // Background follows scroll with a steep double-smoothstep so the grey midpoint lasts only a few pixels;
  // text/line tokens never pass through grey: they flip at the midpoint (CSS @property transition smooths the flip).
  function setTheme(p) {
    p = Math.max(0, Math.min(1, p));
    if (Math.abs(p - themeP) < 0.001) return;
    themeP = p;
    const e = ss(ss(p));
    root.style.setProperty('--bg', mix(PAPER.bg, DARK.bg, e));
    root.style.setProperty('--grid-o', e.toFixed(3));
    const d = p > 0.5;
    if (d !== isDark) {
      isDark = d;
      const M = d ? DARK : PAPER;
      for (const k of ['fg', 'fg2', 'line']) root.style.setProperty('--' + k, `rgb(${M[k].join(',')})`);
      SHARED.ink = `rgb(${M.fg.join(',')})`;
      root.classList.toggle('is-dark', d);
      document.dispatchEvent(new Event('themechange'));
    }
  }

  function countUp(el, dur) {
    const to = parseFloat(el.dataset.to), dec = +el.dataset.dec || 0;
    if (RM || !dur) { el.textContent = to.toFixed(dec); return; }
    const t0 = performance.now();
    (function f(now) { const k = Math.min(1, (now - t0) / dur); el.textContent = (to * (1 - Math.pow(1 - k, 4))).toFixed(dec); if (k < 1) raf(f); })(t0);
  }

  function setStep(k) {
    const FOC = ['load', 'lic', 'lfp', 'all'];
    document.querySelectorAll('.step').forEach((s) => s.classList.toggle('is-on', +s.dataset.step === k));
    document.querySelectorAll('#stepdots span').forEach((s, i) => s.classList.toggle('on', i === k));
    Stage.setFocus(FOC[k]);
  }

  async function boot() {
    try { await Sim.load(); }
    catch (e) {
      if (dead) return;
      HOME_PRE_OFF();
      console.warn('[sim] data load failed', e);
      document.querySelector('.stage-foot').textContent = '資料載入失敗，請重新整理頁面。';
      return;
    }
    if (dead) return;
    Stage.init();
    Arch.init();
    const extra = [Sections.init(), Outage.init()].map((pr) => pr.catch((e) => { if (!dead) console.warn('[sections] load failed', e); }));
    navSpy();

    const hasG = !!(gsap && ScrollTrigger) && !RM;
    const counters = document.querySelectorAll('.countup');
    if (!hasG) {
      HOME_PRE_OFF();
      counters.forEach((c) => countUp(c, 0));
      setStep(3);
      Arch.reveal(true);
      await Promise.all(extra); if (dead) return;
      if (q.get('section')) document.getElementById(q.get('section'))?.scrollIntoView();
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    root.classList.add('theme-scrub');
    setTheme(0);

    // ---- hero intro
    gsap.set('.hero .line-in', { yPercent: 108 });
    gsap.set(['.hero .eyebrow', '.hero .lead', '.stat', '.wave', '.cue'], { opacity: 0, y: 18 });
    gsap.set('.hero-sketch', { opacity: 0, y: 30 });
    HOME_PRE_OFF();
    counters.forEach((c) => (c.textContent = (0).toFixed(+c.dataset.dec || 0)));
    gsap.timeline({ defaults: { ease: 'power4.out' } })
      .to('.hero .eyebrow', { opacity: 1, y: 0, duration: 0.7 }, 0.1)
      .to('.hero .line-in', { yPercent: 0, duration: 1.15, stagger: 0.12 }, 0.15)
      .to('.hero .lead', { opacity: 1, y: 0, duration: 0.8 }, 0.55)
      .to('.stat', { opacity: 1, y: 0, duration: 0.8, stagger: 0.08 }, 0.65)
      .add(() => counters.forEach((c) => countUp(c, 1600)), 0.7)
      .to('.wave', { opacity: 1, y: 0, duration: 1 }, 0.85)
      .to('.cue', { opacity: 1, y: 0, duration: 0.8 }, 1.1)
      .to('.hero-sketch', { opacity: 1, y: 0, duration: 1.4, ease: 'expo.out' }, 0.4);

    await Promise.all(extra); if (dead) return;

    // ---- pinned storyboard (desktop) or static stage (narrow)
    const mm = gsap.matchMedia(); disposers.push(() => mm.revert());
    let pinST = null;
    mm.add('(min-width: 1001px)', () => {
      root.classList.add('pinmode');
      const cam = Stage.cam;
      const at = (f, k) => Stage.camTo(f, k);
      Object.assign(cam, at('load', 1.38)); Stage.applyCam();
      setStep(0);
      const upd = { onUpdate: Stage.applyCam, ease: 'power2.inOut' };
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: '#stage', pin: '#stage-pin', start: 'top top', end: '+=280%', scrub: 0.7, anticipatePin: 1,
          onUpdate: (self) => setStep(Math.min(3, Math.floor(self.progress * 4 * 0.9999))),
        },
      });
      tl.to(cam, { ...at('load', 1.5), duration: 1, ...upd })
        .to(cam, { ...at('lic', 1.55), duration: 0.45, ...upd })
        .to(cam, { ...at('lic', 1.65), duration: 0.55, ease: 'none', onUpdate: Stage.applyCam })
        .to(cam, { ...at('lfp', 1.5), duration: 0.45, ...upd })
        .to(cam, { ...at('lfp', 1.6), duration: 0.55, ease: 'none', onUpdate: Stage.applyCam })
        .to(cam, { ...at('all', 1), duration: 0.55, ...upd })
        .to(cam, { ...at('all', 1), duration: 0.45 });
      pinST = tl.scrollTrigger;
      return () => { root.classList.remove('pinmode'); Object.assign(cam, at('all', 1)); Stage.applyCam(); setStep(3); pinST = null; };
    });
    mm.add('(max-width: 1000px)', () => { setStep(3); });

    // ---- theme: paper -> dark -> paper, identical offsets for every .dark section
    const pairs = [...document.querySelectorAll('section.dark')].map((sec) => [
      ScrollTrigger.create({ trigger: sec, start: 'top 70%', end: 'top 45%', onUpdate: () => upd() }),
      ScrollTrigger.create({ trigger: sec, start: 'bottom 55%', end: 'bottom 30%', onUpdate: () => upd() }),
    ]);
    function upd() { setTheme(Math.max(0, ...pairs.map(([a, b]) => a.progress * (1 - b.progress)))); }
    ScrollTrigger.addEventListener('refresh', upd); disposers.push(() => ScrollTrigger.removeEventListener('refresh', upd));

    // outage entrance
    gsap.from('.out-head > div:first-child, .out-sub, .outage .seg-dark, .out-ro .oro, .bbu-list li', { opacity: 0, y: 24, duration: 0.9, stagger: 0.04, ease: 'power3.out', scrollTrigger: { trigger: '#outage', start: 'top 60%', once: true } });
    gsap.from('#cab', { opacity: 0, y: 40, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '#outage', start: 'top 55%', once: true } });
    // .out-bottom is display:contents on wide screens, so animate (and trigger on) its children
    gsap.from('.out-tl, .outage .transport, .out-stats > div', { opacity: 0, y: 24, duration: 1, stagger: 0.05, ease: 'power3.out', scrollTrigger: { trigger: '.out-tl', start: 'top 96%', once: true } });

    // paper section heads + blocks
    ['#pain', '#split', '#ai', '#verify', '#demo'].forEach((id) => {
      const el = document.querySelector(id);
      const tl2 = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } })
        .from(el.querySelectorAll('.eyebrow'), { opacity: 0, y: 18, duration: 0.6 })
        .from(el.querySelectorAll('.h2 .line-in'), { yPercent: 105, duration: 1, stagger: 0.1 }, '<0.05')
        .from(el.querySelectorAll('.sec-side'), { opacity: 0, y: 18, duration: 0.7 }, '<0.3');
      ScrollTrigger.create({ trigger: el, start: 'top 72%', once: true, onEnter: () => tl2.play() });
      const blocks = el.querySelectorAll('.pains li, .cmp-top, .cmp-legend, .cmp-plot, .cmp-stats .cs, .split-ctrl > *, .split-fig, .ai-fig, .ai-side > *, .vrun, .limits, .links li');
      blocks.forEach((b) => gsap.from(b, { opacity: 0, y: 28, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: b, start: 'top 90%', once: true } }));
    });

    // stage copy entrance
    gsap.from('.stage-copy, .readouts, .stage-bottom', { opacity: 0, y: 30, duration: 1, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: '#stage', start: 'top 55%', once: true } });
    gsap.from('#scene', { opacity: 0, scale: 0.94, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '#stage', start: 'top 55%', once: true } });

    // ---- architecture reveal
    gsap.set('.arch .line-in', { yPercent: 105 });
    gsap.set(['.arch .eyebrow', '.arch .sec-side'], { opacity: 0, y: 18 });
    gsap.set(['.map-top', '.layer', '.rail', '#detail'], { opacity: 0, y: 24 });
    const atl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' }, onComplete: () => Arch.layout() })
      .to('.arch .eyebrow', { opacity: 1, y: 0, duration: 0.6 })
      .to('.arch .line-in', { yPercent: 0, duration: 1, stagger: 0.1 }, '<0.05')
      .to('.arch .sec-side', { opacity: 1, y: 0, duration: 0.7 }, '<0.3')
      .to('.map-top', { opacity: 1, y: 0, duration: 0.6 }, '<0.1')
      .to('.layer', { opacity: 1, y: 0, duration: 0.7, stagger: 0.08 }, '<0.15')
      .to('.rail', { opacity: 1, y: 0, duration: 0.6 }, '<0.3')
      .to('#detail', { opacity: 1, y: 0, duration: 0.6 }, '<0.15')
      .add(() => Arch.reveal(false), '<');
    ScrollTrigger.create({ trigger: '#arch', start: 'top 70%', once: true, onEnter: () => atl.play() });

    // ---- debug / screenshot helpers
    const sec = q.get('section'), step = q.get('step');
    if (sec || step != null) {
      raf(() => {
        ScrollTrigger.refresh();
        let y = 0;
        if (step != null && pinST) y = pinST.start + (pinST.end - pinST.start) * ((+step + 0.6) / 4);
        else if (step != null || sec === 'stage') y = document.getElementById('stage').getBoundingClientRect().top + scrollY;
        else if (sec === 'arch') { y = document.getElementById('arch').getBoundingClientRect().top + scrollY; atl.progress(1); }
        else if (sec) { const el = document.getElementById(sec); if (el) y = el.getBoundingClientRect().top + scrollY + (+q.get('off') || 0); }
        document.documentElement.style.scrollBehavior = 'auto';
        window.scrollTo(0, y);
        ScrollTrigger.update();
      });
    }
  }
  // nav: highlight the section in view
  function navSpy() {
    const links = [...document.querySelectorAll('#navlinks a')];
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new TrackedIO((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.toggle('on', a === map.get(e.target.id)));
      const a = map.get(e.target.id);
      if (a && a.parentElement.parentElement.scrollWidth > a.parentElement.parentElement.clientWidth) {
        const ul = a.parentElement.parentElement; ul.scrollTo({ left: a.parentElement.offsetLeft - 8, behavior: 'smooth' });
      }
    }), { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }
  boot();
})();


  // re-run canvas layout once the self-hosted fonts are in (canvas text does not reflow on its own)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!dead) window.dispatchEvent(new Event('resize')); });

  return function dispose() {
    dead = true;
    HOME_PRE_OFF();
    for (const f of disposers.splice(0)) { try { f(); } catch (e) { /* ignore */ } }
    timers.forEach((id) => clearTimeout(id)); timers.clear();
    try { ScrollTrigger.getAll().forEach((t) => t.kill(true)); } catch (e) { /* ignore */ }
    try { gsap.globalTimeline.getChildren(true, true, true).forEach((t) => t.kill()); } catch (e) { /* ignore */ }
    document.documentElement.style.scrollBehavior = '';
  };
}
