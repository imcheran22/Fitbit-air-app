var N = 16;
var E = "................";
var BASE = [E, E, E, E, E, E,
  "....bbbbbbbs....", "....bbbbbbbs....", "....bbbbbbbs....", "....bbbbbbbs....", "....bbbbbbbs....", "....bbbbbbbs....", "....bbbbbbbs....",
  ".....b....s.....", ".....b....s.....", "...zzzzzzzzzz..."];
var EYES0 = [[6, 8], [9, 8]];
var SKINS = {
  bear: { label: "bear", body: "#8B6B4E", eyes: [[5, 8], [10, 8]], rows: { 5: "....bb....bs....", 9: "......hddh......", 10: "......hhhh......" } },
  tortoise: { label: "tortoise", body: "#6BAA75", headTop: 4, rows: { 4: ".....hhhhhh.....", 5: "....hdhhhdhs....", 6: "....dddddddd...." } },
  capy: { label: "capy", body: "#A68A6D", eyes: [[7, 8], [10, 8]], rows: { 5: ".....b....s.....", 9: "....bbbbbbbbbbd.", 10: "....bbbbbbbbbbs.", 11: "....bbbbbbbssss." } },
  owl: { label: "owl", body: "#8E86B5", eyes: [[5, 8], [9, 8]], rows: { 5: "....b......s....", 7: "....hhhbhhhs....", 8: "....hhhbhhhs....", 9: "....hhhbhhhs...." } },
  mole: { label: "mole", body: "#57534E", rows: { 10: ".......hh.......", 11: ".....hh..hh....." } },
  frog: { label: "frog", body: "#4ADE80", headTop: 4, eyes: [[5, 5], [10, 5]], rows: { 4: "....bbb..bbs....", 5: "....bbb..bbs...." } },
  hedgehog: { label: "hedgehog", body: "#B59A7A", headTop: 5, rows: { 5: "....d.d.d.d.d...", 7: ".....hhhhhh.....", 8: "....hh.hh.hs....", 9: ".....hhddhh....." } },
  otter: { label: "otter", body: "#8D6E63", rows: { 9: "......hddh......", 10: "......hhhh......", 12: "...........sss.." } },
  beetle: { label: "beetle", body: "#2DD4BF", rows: { 4: "....d......d....", 5: ".....d....d.....", 9: ".......d........", 10: ".......d........", 11: ".......d........" } },
  sloth: { label: "sloth", body: "#B8A48C", rows: { 7: ".....hhhhhh.....", 8: ".....d.hh.d.....", 9: ".....dhhhhd.....", 10: "......hhhh......" } },
  raccoon: { label: "raccoon", body: "#8A8F99", eyeRole: "w", rows: { 5: "....bb....ss....", 7: "....hhhhhhhs....", 8: "....dddddddd....", 9: ".......hh......." } },
  redpanda: { label: "red panda", body: "#9A4A32", rows: { 5: "....hb....sh....", 7: ".....hh..hh....." } },
  koala: { label: "koala", body: "#9CA3AF", rows: { 5: "..bbb......sss..", 6: "..bhb......shs..", 7: "..bbb......sss..", 9: ".......dd.......", 10: ".......dd......." } },
  badger: { label: "badger", body: "#6B7280", eyes: [[5, 8], [10, 8]], rows: { 6: ".......hh.......", 7: ".......hh.......", 8: ".......hh.......", 9: ".......hh......." } },
  fox: { label: "fox", body: "#A1887F", rows: { 4: "....b......s....", 5: "....bb....ss....", 10: ".....hhhhhh.....", 11: "............s...", 12: "............sh.." } },
  seal: { label: "seal", body: "#64748B", rows: { 9: ".......dd.......", 10: ".....d....d.....", 11: "...b........s...", 12: "...b........s..." } },
  mouse: { label: "mouse", body: "#C4B5A5", rows: { 4: "...bbb....sss...", 5: "...bhb....shs...", 12: "............d...", 13: ".............d..", 14: ".............d.." } },
  bat: { label: "bat", body: "#5B5470", rows: { 5: "....b......s....", 9: "...d........d...", 10: "..dd........dd.." } },
  sheep: { label: "sheep", body: "#D6D3D1", headTop: 4, rows: { 4: ".....hh..hh.....", 5: "....hhhhhhhh....", 6: "...hhhhhhhhhh..." } },
  dog: { label: "dog", body: "#C8A27A", rows: { 6: "...d........d...", 7: "...d........d...", 8: "...d........d...", 9: ".......dd......." } },
  snail: { label: "snail", body: "#B5A88F", headTop: 2, rows: { 2: ".......hhh......", 3: "......hdddh.....", 4: "......hdhdh.....", 5: "......hhdhh....." } },
  cloud: { label: "cloud", body: "#CBD5E1", headTop: 3, rows: { 3: "......hh........", 4: "....hhbbh.hh....", 5: "...hbbbbbhbbh..." } }
};
var SKIN_ORDER = ["bear", "capy", "owl", "koala", "sheep", "tortoise", "mole", "frog", "hedgehog", "otter", "beetle", "sloth", "raccoon", "redpanda", "badger", "fox", "seal", "mouse", "bat", "dog", "snail", "cloud"];

var COS = {
  "hat.beanie": { slot: "head", front: { at: [4, 2], rows: ["...wW...", ".LLrrrR.", "LrrrrrrR", "ddddddDD"] }, pal: { w: "#F8FAFC", W: "#CBD5E1", r: "#EF4444", L: "#F87171", R: "#B91C1C", d: "#B91C1C", D: "#7F1D1D" } },
  "hat.cap": { slot: "head", front: { at: [4, 4], rows: [".LbbbbR....", "bbbbbbbbkkk"] }, pal: { b: "#2563EB", L: "#60A5FA", R: "#1E40AF", k: "#1E3A8A" } },
  "hat.crown": { slot: "head", front: { at: [4, 3], rows: ["y..yy..Y", "LyyyyyyY", "yryyyyrY"] }, pal: { y: "#FACC15", L: "#FDE68A", Y: "#CA8A04", r: "#EF4444" } },
  "head.band": { slot: "head", front: { at: [4, 6], rows: ["LssssssSS.", ".........S"] }, pal: { L: "#FB7185", s: "#F43F5E", S: "#BE123C" } },
  "face.shades": { slot: "face", front: { at: [4, 8], rows: ["kgkkkgkk", ".kk..kk."] }, pal: { k: "#0B0B10", g: "#64748B" } },
  "face.round": { slot: "face", front: { at: [5, 7], rows: ["FFFFFf", "f.ff.f", "ffffff"] }, pal: { F: "#FCD34D", f: "#D97706" } },
  "neck.scarf": { slot: "neck", front: { at: [3, 10], rows: ["LssssssssS", ".ddddddLs.", ".......Ls.", ".......dd."] }, pal: { L: "#F87171", s: "#DC2626", S: "#991B1B", d: "#991B1B" } },
  "neck.bandana": { slot: "neck", front: { at: [5, 10], rows: ["Lbbbbb", ".bwbB.", "..bB.."] }, pal: { L: "#60A5FA", b: "#2563EB", B: "#1E40AF", w: "#F8FAFC" } },
  "held.bottle": { slot: "held", front: { at: [0, 8], rows: ["cC..", "Lw..", "LwBB", "lb..", "lb.."] }, pal: { c: "#F43F5E", C: "#BE123C", L: "#F0F9FF", w: "#BAE6FD", l: "#7DD3FC", b: "#0EA5E9", B: "@b" } },
  "held.dumbbell": { slot: "held", front: { at: [12, 8], rows: [".LpP", ".LpP", "SSg.", ".Sg.", ".LpP", ".LpP"] }, pal: { p: "#64748B", L: "#94A3B8", P: "#334155", g: "#CBD5E1", S: "@s" } },
  "held.coffee": { slot: "held", front: { at: [12, 7], rows: ["..s.", ".s..", "..s.", "Sccc", ".lll", ".ccC"] }, pal: { s: "#CBD5E1", c: "#F8FAFC", C: "#CBD5E1", l: "#92400E", S: "@s" } },
  "back.pack": { slot: "back", back: { at: [3, 5], rows: ["...pppp...", "ppppppppPP", "ppppppppPP", "ppppppppPP", "ppppppppPP", "ppppppppPP", "ppppppppPP"] }, front: { at: [5, 9], rows: ["L....S", "L....S", "L....S"] }, pal: { p: "#22C55E", P: "#15803D", L: "#86EFAC", S: "#14532D" } },
  "back.cape": { slot: "back", back: { at: [2, 7], rows: ["ccccccccccCC", "ccccccccccCC", "ccccccccccCC", "ccccccccccCC", "ccccccccccCC", "ccccccccccCC", "ddddddddddDD"] }, pal: { c: "#7C3AED", C: "#5B21B6", d: "#5B21B6", D: "#4C1D95" } }
};
var SLOTS = ["head", "face", "neck", "held", "back"];

var POSES = {
  rest: {},
  wave: { arms: [[12, 9, "s"], [13, 8, "s"]] },
  cheer: { arms: [[3, 9, "b"], [2, 8, "b"], [12, 9, "s"], [13, 8, "s"]], hop: 1 },
  bottle: { held: "held.bottle" },
  coffee: { held: "held.coffee" },
  stretch: { arms: [[3, 6, "b"], [3, 5, "b"], [3, 4, "b"], [12, 6, "s"], [12, 5, "s"], [12, 4, "s"]], tall: true, eyes: "shut" }
};
var MOODS = {
  idle: {},
  blink: { eyes: "shut" },
  curious: { eyes: "up", tilt: 1 },
  sleepy: { eyes: "shut", squash: true },
  proud: { eyes: "up", tall: true },
  startled: { eyes: "wide", hop: 2 },
  glance: { eyes: "glance" },
  determined: { eyes: "shut", brows: true, tilt: -1 },
  breathe: { breathe: true }
};

function rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function hx2(n) { var s = Math.max(0, Math.min(255, Math.round(n))).toString(16); return s.length < 2 ? "0" + s : s; }
function mix(a, b, k) { var x = rgb(a), y = rgb(b); return "#" + hx2(x[0] * (1 - k) + y[0] * k) + hx2(x[1] * (1 - k) + y[1] * k) + hx2(x[2] * (1 - k) + y[2] * k); }
function darken(a, k) { var x = rgb(a); return "#" + hx2(x[0] * k) + hx2(x[1] * k) + hx2(x[2] * k); }
function lum(h) { var c = rgb(h).map(function (v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function ramp(body) { return { b: body, h: mix(body, "#FFFFFF", 0.25), s: darken(body, 0.78), d: darken(body, 0.6), e: lum(body) > 0.2 ? "#14161B" : "#F5F5F4", w: "#F8FAFC", z: "rgba(0,0,0,0.35)" }; }
function groundFor(body) { return lum(body) < 0.12 ? "#EDEBE6" : "#1B1E25"; }
function blank() { var g = []; for (var i = 0; i < N; i++) { var r = []; for (var j = 0; j < N; j++) r.push(null); g.push(r); } return g; }

// v = { skin, body, cosmetics, pose, mood }
function build(v) {
  var skin = SKINS[v.skin] || SKINS.bear;
  var body = v.body || skin.body;
  var p = ramp(body);
  var pose = POSES[v.pose] || POSES.rest;
  var mood = MOODS[v.mood] || MOODS.idle;
  var g = blank();
  function put(x, y, c) { if (x >= 0 && y >= 0 && x < N && y < N && c) g[y][x] = c; }
  for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) { var L = BASE[y][x]; if (L !== ".") put(x, y, L); }
  Object.keys(skin.rows).forEach(function (k) { var r = skin.rows[k]; for (var x2 = 0; x2 < N; x2++) if (r[x2] !== ".") put(x2, Number(k), r[x2]); });
  var eyes = (skin.eyes || EYES0).map(function (e) { return [e[0], e[1]]; });
  var eyeMode = pose.eyes || mood.eyes;
  var er = skin.eyeRole || "e";
  var cells = [];
  eyes.forEach(function (e, i) {
    if (eyeMode === "shut") { cells.push([e[0], e[1]]); cells.push([i === 0 ? e[0] - 1 : e[0] + 1, e[1]]); }
    else if (eyeMode === "up") cells.push([e[0], e[1] - 1]);
    else if (eyeMode === "wide") { cells.push([e[0], e[1]]); cells.push([e[0], e[1] - 1]); }
    else if (eyeMode === "glance") cells.push([e[0] + 1, e[1]]);
    else cells.push([e[0], e[1]]);
  });
  cells.forEach(function (c) { put(c[0], c[1], er); });
  if (mood.brows) eyes.forEach(function (e, i) { put(i === 0 ? e[0] + 1 : e[0] - 1, e[1] - 1, "d"); });
  // posture
  var hop = pose.hop || mood.hop || 0;
  if (pose.tall || mood.tall) { var t = blank(); for (var y3 = 0; y3 < N; y3++) for (var x3 = 0; x3 < N; x3++) { var c3 = g[y3][x3]; if (!c3) continue; if (y3 <= 12 && c3 !== "z") { put2(t, x3, y3 - 1, c3); if (y3 === 12) put2(t, x3, 12, c3); } else put2(t, x3, y3, c3); } g = t; }
  if (mood.squash) { var q = blank(); for (var y4 = 0; y4 < N; y4++) for (var x4 = 0; x4 < N; x4++) { var c4 = g[y4][x4]; if (!c4 || y4 === 7) continue; put2(q, x4, y4 < 7 ? y4 + 1 : y4, c4); } for (var x5 = 2; x5 < 14; x5++) q[15][x5] = "z"; g = q; }
  if (mood.breathe) { var bq = blank(); for (var y6 = 0; y6 < N; y6++) for (var x6 = 0; x6 < N; x6++) { var c6 = g[y6][x6]; if (!c6) continue; if (c6 === "z") continue; if (y6 <= 12) put2(bq, x6, y6 - 1, c6); else put2(bq, x6, y6, c6); if (y6 === 13) put2(bq, x6, 12, c6); } for (var x7 = 4; x7 < 12; x7++) bq[15][x7] = "z"; g = bq; }
  if (mood.tilt) { var tl = blank(); for (var y8 = 0; y8 < N; y8++) for (var x8 = 0; x8 < N; x8++) { var c8 = g[y8][x8]; if (c8) put2(tl, x8 + (y8 < 9 ? mood.tilt : 0), y8, c8); } g = tl; }
  if (hop) { var hp = blank(); for (var y9 = 0; y9 < N; y9++) for (var x9 = 0; x9 < N; x9++) { var c9 = g[y9][x9]; if (!c9) continue; if (c9 === "z") continue; put2(hp, x9, y9 - hop, c9); } var sw = hop > 1 ? 6 : 8; for (var xa = 0; xa < sw; xa++) hp[15][8 - sw / 2 + xa] = "z"; g = hp; }
  // arms (pose-only): drawn into empty cells only
  (pose.arms || []).forEach(function (a) { var yy = a[1] - hop; if (yy >= 0 && !g[yy][a[0]]) g[yy][a[0]] = a[2]; });
  // resolve roles to colours
  var out = blank();
  for (var yb = 0; yb < N; yb++) for (var xb = 0; xb < N; xb++) { var cb = g[yb][xb]; if (cb) out[yb][xb] = cb.charAt(0) === "#" || cb.indexOf("rgba") === 0 ? cb : p[cb]; }
  // cosmetics
  var ids = (v.cosmetics || []).slice();
  if (pose.held) ids.push(pose.held);
  var list = ids.map(function (id) { return COS[id]; }).filter(Boolean);
  var shift = (skin.headTop != null ? skin.headTop : 6) - 6;
  function draw(it, part, layerBehind) {
    var q2 = it[part]; if (!q2) return;
    var dy = it.slot === "head" ? shift : 0;
    if (it.slot === "head") { if (q2.at[1] + dy < 0) return; }
    q2.rows.forEach(function (r, j) {
      for (var k = 0; k < r.length; k++) {
        var L2 = r[k]; if (L2 === ".") continue;
        var col = it.pal[L2]; if (col && col.charAt(0) === "@") col = p[col.slice(1)];
        var X = q2.at[0] + k, Y = q2.at[1] + j + dy;
        if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
        if (layerBehind) { if (!out[Y][X] || out[Y][X] === p.z) out[Y][X] = col; } else out[Y][X] = col;
      }
    });
  }
  list.forEach(function (it) { draw(it, "back", true); });
  SLOTS.forEach(function (slot) { list.forEach(function (it) { if (it.slot === slot) draw(it, "front", false); }); });
  return out;
}
function put2(g, x, y, c) { if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = c; }

function layers(cells, s) {
  var by = {}, order = [];
  for (var y = 0; y < N; y++) {
    var x = 0;
    while (x < N) {
      var c = cells[y][x];
      if (!c) { x++; continue; }
      var n = 1;
      while (x + n < N && cells[y][x + n] === c) n++;
      if (!by[c]) { by[c] = ""; order.push(c); }
      by[c] += "M" + x * s + " " + y * s + "h" + n * s + "v" + s + "h-" + n * s + "z";
      x += n;
    }
  }
  return order.map(function (f) { return { fill: f, d: by[f] }; });
}
function sprite(v, s) { return { px: N * s, layers: layers(build(v), s) }; }

if (typeof module !== "undefined") module.exports = { build: build, SKINS: SKINS, SKIN_ORDER: SKIN_ORDER, ramp: ramp };
