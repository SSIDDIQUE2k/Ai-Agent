/*
  Browser test harness for the basketball scoreboard overlay.

  Usage:
    cd hudl-basketball-overlay && python3 -m http.server 8765 &
    NODE_PATH=$(npm root -g) node test/run.js

  Loads test/frame.html (a 1920x1080 mock production frame with the overlay in
  an iframe at the position.json location), pushes mock Production Truck data
  through updateGlobalData / updateLocalData, screenshots every scenario and
  checks for console errors, text overflow, elements outside the 926x94 canvas,
  overlapping meta elements and layout shift of the score / clock cells.
*/

const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.OUT_DIR || path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });

// overlay iframe rectangle inside frame.html
const OV = { x: 497, y: 961, w: 926, h: 94 };
const CLIP = { x: OV.x - 20, y: OV.y - 40, width: OV.w + 40, height: OV.h + 60 };

const errors = [];
const report = [];
let failures = 0;

const BASE_GLOBAL = {
  "team1-abbr": "BKLYN",
  "team2-abbr": "FDU",
  "team1-name": "Brooklyn College",
  "team2-name": "Fairleigh Dickinson",
  "saved_team1-logo": "/test/assets/square.svg",
  "saved_team2-logo": "/src/_debugassets/NJCAA%20Sheild%20Logo.png",
  "team1-color": "#7a1f2b",
  "team2-color": "#1c4587",
  "team1-score": 0,
  "team2-score": 0,
  "team1-timeouts": 4,
  "team2-timeouts": 4,
  "team1-fouls": 0,
  "team2-fouls": 0,
  "possession-arrow": "off",
  BNSvalue1: "hide",
  DBNSvalue1: "hide",
  BNSvalue2: "hide",
  DBNSvalue2: "hide",
  period: "1",
  "game-time": "20:00",
  showhideClock: true,
  showhideShotClock: true,
  "shot-time": "0:30",
  "global-network-color": "#0b3d2e",
  "saved_global-network-logo-wide": "/test/assets/network.svg",
  "saved_global-network-logo-square": "/test/assets/square.svg"
};

const BASE_LOCAL = {
  "team-name-select": "abbr",
  "popup-show": false,
  "popup-text": "",
  "left-show": false,
  "left-color-logo-select": "custom",
  "left-custom-color": "#0b3d2e",
  "left-custom-logo": "/test/assets/network.svg",
  "pip-clock-show": false,
  "highlight-color-select": "custom",
  "custom-highlight-color": "#f4c542"
};

function toGlobal(obj) {
  const d = {};
  for (const k of Object.keys(obj)) {
    d[k] = k === "showhideClock" || k === "showhideShotClock" ? { checked: obj[k] } : { value: obj[k] };
  }
  return d;
}

async function G(ov, obj) {
  await ov.evaluate((d) => updateGlobalData(d), toGlobal(obj));
}
async function L(ov, obj) {
  await ov.evaluate((d) => updateLocalData(d), obj);
}

// runs inside the overlay frame
function inspect() {
  const vis = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  };
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
  };
  const out = { overflow: [], outside: [], overlaps: [], boxes: {}, text: {} };

  const textIds = ["team1Abbr", "team2Abbr", "team1Name", "team2Name", "team1Score", "team2Score", "gameTime", "period", "shotClock", "popup-text", "team1-foul-count", "team2-foul-count", "bonusText1", "bonusText2", "periodHidden", "animationMessage"];
  textIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el || !vis(el)) return;
    out.text[id] = el.textContent;
    if (el.scrollWidth > el.clientWidth + 1) {
      out.overflow.push(id + " " + el.scrollWidth + ">" + el.clientWidth + ' "' + el.textContent + '"');
    }
  });

  const boxIds = ["team1ScoreBackground", "team2ScoreBackground", "team1Score", "team2Score", "periodTimeContainer", "timeContainer", "gameTime", "periodContainer", "shotClockContainer", "team1Abbr", "team2Abbr", "team1Name", "team2Name", "possessionArrow1", "possessionArrow2", "team1-foul-count", "team2-foul-count", "bonusText1", "bonusText2", "timeout1Container", "timeout2Container", "network-background", "popup-container", "baseLine", "hiddenContainer", "team1ImageContainer", "team2ImageContainer", "team1", "team2", "center"];
  boxIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const b = box(el);
    b.visible = vis(el);
    out.boxes[id] = b;
  });

  const c = document.getElementById("overlay-container").getBoundingClientRect();
  document.querySelectorAll("#main-structure *, #popup-container *").forEach((el) => {
    if (!vis(el)) return;
    if (el.id === "network-background" || el.id === "network-logo" || el.id === "networkShadow") {
      // the hidden network cell parks off to the left by design; only check it when shown
      if (!window.lastShowLeft) return;
    }
    // the message text slides inside #animationLayer, which clips it (overflow: hidden)
    if (el.id === "animationMessage") return;
    const r = el.getBoundingClientRect();
    if (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5) {
      out.outside.push((el.id || el.className) + " " + JSON.stringify(box(el)));
    }
  });

  const pairs = [
    ["team1Abbr", "possessionArrow1"], ["team1Abbr", "team1ScoreBackground"], ["possessionArrow1", "team1ScoreBackground"],
    ["team1-foul-count", "bonusText1"], ["bonusText1", "team1ScoreBackground"], ["team1Score", "timeout1Container"],
    ["team2Abbr", "possessionArrow2"], ["team2Abbr", "team2ScoreBackground"], ["possessionArrow2", "team2ScoreBackground"],
    ["team2-foul-count", "bonusText2"], ["bonusText2", "team2ScoreBackground"], ["team2Score", "timeout2Container"],
    ["timeContainer", "shotClockContainer"], ["periodContainer", "shotClockContainer"], ["gameTime", "periodContainer"],
    ["team1", "periodTimeContainer"], ["team2", "periodTimeContainer"], ["team1ImageContainer", "team1Abbr"], ["team2ImageContainer", "team2Abbr"],
    ["team1Name", "team1ScoreBackground"], ["team2Name", "team2ScoreBackground"]
  ];
  pairs.forEach(([a, b]) => {
    const ea = document.getElementById(a), eb = document.getElementById(b);
    if (!vis(ea) || !vis(eb)) return;
    const ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
    const overlap = ra.left < rb.right - 0.5 && rb.left < ra.right - 0.5 && ra.top < rb.bottom - 0.5 && rb.top < ra.bottom - 0.5;
    if (overlap) out.overlaps.push(a + " x " + b);
  });

  return out;
}

async function snap(page, ov, name, opts = {}) {
  const wait = opts.wait === undefined ? 900 : opts.wait;
  await page.waitForTimeout(wait);
  const file = name.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
  await page.screenshot({ path: path.join(OUT, file + "_2x.png"), clip: CLIP, scale: "device" });
  if (opts.frame) {
    await page.screenshot({ path: path.join(OUT, file + "_frame.png"), scale: "css" });
  }
  const r = await ov.evaluate(inspect);
  const problems = [];
  if (r.overflow.length) problems.push("overflow: " + r.overflow.join("; "));
  if (r.outside.length) problems.push("outside canvas: " + r.outside.join("; "));
  if (r.overlaps.length) problems.push("overlap: " + r.overlaps.join("; "));
  if (opts.expect) {
    for (const [id, expected] of Object.entries(opts.expect)) {
      const actual = (r.text[id] === undefined ? "(hidden)" : r.text[id]).trim();
      if (actual !== expected) problems.push(`${id}: expected "${expected}", got "${actual}"`);
    }
  }
  if (opts.visible) {
    for (const [id, expected] of Object.entries(opts.visible)) {
      const b = r.boxes[id];
      const actual = b ? b.visible : false;
      if (actual !== expected) problems.push(`${id}: expected visible=${expected}, got ${actual}`);
    }
  }
  const newErrors = errors.splice(0);
  if (newErrors.length) problems.push("errors: " + newErrors.join(" | "));
  const status = problems.length ? "FAIL" : "ok";
  if (problems.length) failures++;
  report.push({ name, status, problems, boxes: r.boxes, text: r.text });
  console.log(`[${status}] ${name}${problems.length ? "\n      " + problems.join("\n      ") : ""}`);
  return r;
}

// samples the message layer text at a given time (ms) after the triggering update
let lastTrigger = 0;
async function expectMessageAt(page, ov, atMs, expected) {
  const now = Date.now();
  if (now - lastTrigger > 5000) lastTrigger = now; // first sample after a trigger
  const waitFor = Math.max(0, atMs - (Date.now() - lastTrigger));
  await page.waitForTimeout(waitFor);
  const r = await ov.evaluate(() => {
    const el = document.getElementById("animationMessage");
    const layer = document.getElementById("animationLayer");
    const vis = getComputedStyle(layer).display !== "none";
    return { text: el.textContent, font: getComputedStyle(el).fontSize, vis };
  });
  const ok = r.vis && r.text === expected && r.font !== "0px";
  if (!ok) { failures++; console.log(`[FAIL] message at ${atMs}ms: expected "${expected}", got "${r.text}" (layer visible=${r.vis}, font=${r.font})`); }
  else console.log(`[ok] message at ${atMs}ms: "${expected}" (${r.font})`);
  if (atMs >= 1000) lastTrigger = 0;
}

function sameBox(a, b) {
  return a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(BASE + "/test/frame.html", { waitUntil: "load" });
  const ov = page.frame({ url: /overlay\.html/ });
  if (!ov) throw new Error("overlay frame not found");
  await ov.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2200); // initial reveal (debug mode)

  // ---- initial state ----------------------------------------------------
  await L(ov, BASE_LOCAL);
  await G(ov, BASE_GLOBAL);
  await page.waitForTimeout(1200);

  // Test 1
  const t1 = await snap(page, ov, "test01_0-0_1st_2000_shot30", { frame: true, expect: { team1Score: "0", team2Score: "0", period: "1st", gameTime: "20:00", shotClock: "30" } });

  // Test 2
  await G(ov, { "team1-score": 48, "team2-score": 52, period: "2", "game-time": "03:41", "shot-time": "0:17" });
  const t2 = await snap(page, ov, "test02_48-52_2nd_341_shot17", { frame: true, expect: { team1Score: "48", team2Score: "52", period: "2nd", gameTime: "3:41", shotClock: "17" } });

  // Test 3
  await G(ov, { "team1-score": 99, "team2-score": 100, period: "4", "game-time": "00:09", "shot-time": "0:05" });
  const t3 = await snap(page, ov, "test03_99-100_4th_009_shot5", { frame: true, expect: { team1Score: "99", team2Score: "100", period: "4th", gameTime: ":09", shotClock: "5" } });

  // Test 4
  await G(ov, { "team1-score": 105, "team2-score": 104, period: "OT", "game-time": "00:32", "shot-time": "0:12" });
  const t4 = await snap(page, ov, "test04_105-104_OT_032_shot12", { frame: true, expect: { team1Score: "105", team2Score: "104", period: "OT", gameTime: ":32", shotClock: "12" } });

  // layout shift check across 0 / 48 / 99 / 105 scores
  for (const id of ["team1ScoreBackground", "team2ScoreBackground", "periodTimeContainer", "timeContainer", "gameTime", "team1Abbr", "team2Abbr", "team1ImageContainer", "team2ImageContainer"]) {
    if (!(sameBox(t1.boxes[id], t2.boxes[id]) && sameBox(t2.boxes[id], t3.boxes[id]) && sameBox(t3.boxes[id], t4.boxes[id]))) {
      failures++;
      console.log(`[FAIL] layout shift on #${id}: ${JSON.stringify([t1.boxes[id], t2.boxes[id], t3.boxes[id], t4.boxes[id]])}`);
    }
  }
  console.log("[ok] no layout shift across 0 / 48 / 99 / 105 scores");

  // Test 5 — 2 OT (and 3 OT keeps the clock)
  await G(ov, { period: "2 OT", "game-time": "02:15", "shot-time": "0:24" });
  await snap(page, ov, "test05_2OT", { expect: { period: "2 OT", gameTime: "2:15" }, visible: { hiddenContainer: false, timeContainer: true } });
  await G(ov, { period: "3 OT" });
  await snap(page, ov, "test05b_3OT_keeps_clock", { expect: { period: "3 OT" }, visible: { hiddenContainer: false, timeContainer: true } });

  // Test 6 — team fouls
  await G(ov, { period: "2", "team1-fouls": 4, "team2-fouls": 7, "team1-score": 48, "team2-score": 52 });
  await snap(page, ov, "test06_fouls_4_7", { expect: { "team1-foul-count": "FOULS4", "team2-foul-count": "FOULS7" } });
  await G(ov, { "team1-fouls": 12, "team2-fouls": 10 });
  await snap(page, ov, "test06b_fouls_12_10", { expect: { "team1-foul-count": "FOULS12", "team2-foul-count": "FOULS10" } });

  // Test 7 — BONUS and BONUS+
  await G(ov, { BNSvalue1: "show", DBNSvalue2: "show", BNSvalue2: "show" });
  await snap(page, ov, "test07_bonus_and_double_bonus", { expect: { bonusText1: "BONUS", bonusText2: "BONUS+" } });
  await G(ov, { DBNSvalue1: "show", DBNSvalue2: "hide" });
  await snap(page, ov, "test07b_double_bonus_and_bonus", { expect: { bonusText1: "BONUS+", bonusText2: "BONUS" } });

  // Test 8 / 9 — possession
  await G(ov, { "possession-arrow": "team1" });
  await snap(page, ov, "test08_possession_away", { visible: { possessionArrow1: true, possessionArrow2: false } });
  await G(ov, { "possession-arrow": "team2" });
  await snap(page, ov, "test09_possession_home", { visible: { possessionArrow1: false, possessionArrow2: true } });
  await G(ov, { "possession-arrow": "off" });
  await snap(page, ov, "test09b_possession_off", { visible: { possessionArrow1: false, possessionArrow2: false } });

  // Test 10 — timeouts 0..6 (jumps of more than one avoid the TIMEOUT animation)
  // (a change of exactly one plays the TIMEOUT message first, tested separately below)
  const timeoutStates = [[6, 6], [4, 2], [2, 0], [0, 3], [5, 6], [1, 4], [3, 1]];
  for (const [a, b] of timeoutStates) {
    await G(ov, { "team1-timeouts": a, "team2-timeouts": b });
    const r = await snap(page, ov, `test10_timeouts_${a}_${b}`, { wait: 1300 });
    const shown = await ov.evaluate(() => [1, 2].map((t) => Array.from(document.querySelectorAll(`#timeout${t}Container .timeout`)).filter((el) => getComputedStyle(el).display !== "none" && getComputedStyle(el).opacity !== "0").length));
    if (shown[0] !== a || shown[1] !== b) { failures++; console.log(`[FAIL] timeout pills: expected ${a}/${b}, got ${shown[0]}/${shown[1]}`); }
    else console.log(`[ok] timeout pills ${a}/${b}`);
  }

  // Test 10b — timeout taken (delta 1) triggers the TIMEOUT message then the pulse
  await G(ov, { "team1-timeouts": 4, "team2-timeouts": 4 });
  await page.waitForTimeout(1200);
  await G(ov, { "team1-timeouts": 3 });
  await expectMessageAt(page, ov, 350, "TIMEOUT");
  await snap(page, ov, "test10b_timeout_animation_mid", { wait: 0, frame: true });
  await expectMessageAt(page, ov, 1500, "BROOKLYN COLLEGE");
  await page.waitForTimeout(2500);
  await snap(page, ov, "test10c_timeout_animation_done", { wait: 200, visible: { animationLayer: false } });
  const pillsAfter = await ov.evaluate(() => Array.from(document.querySelectorAll("#timeout1Container .timeout")).filter((el) => getComputedStyle(el).display !== "none").length);
  if (pillsAfter !== 3) { failures++; console.log(`[FAIL] after TIMEOUT animation expected 3 pills, got ${pillsAfter}`); } else console.log("[ok] 3 pills after TIMEOUT animation");

  // 3-pointer message
  await G(ov, { "team2-score": 55 });
  await expectMessageAt(page, ov, 350, "3 POINTER");
  await snap(page, ov, "extra_3pointer_animation_mid", { wait: 0, frame: true });
  await expectMessageAt(page, ov, 1500, "FAIRLEIGH DICKINSON");
  await snap(page, ov, "extra_3pointer_animation_name", { wait: 0 });
  await page.waitForTimeout(2500);
  await snap(page, ov, "extra_3pointer_done", { wait: 200, expect: { team2Score: "55" }, visible: { animationLayer: false } });

  // Test 11 — long abbreviations and long names
  await G(ov, { "team1-abbr": "BKLYNC", "team2-abbr": "FDUKNT" });
  await snap(page, ov, "test11_long_abbr");
  await G(ov, { "team1-abbr": "WWWWW", "team2-abbr": "MMMMM" });
  await snap(page, ov, "test11b_widest_abbr");
  await L(ov, { "team-name-select": "full" });
  await G(ov, { "team1-name": "Brooklyn College Bulldogs", "team2-name": "Fairleigh Dickinson Knights" });
  await snap(page, ov, "test11c_full_names_long", { wait: 1400, frame: true, visible: { team1Name: true, team1ImageContainer: false } });
  await G(ov, { "team1-name": "Brooklyn", "team2-name": "FDU" });
  await snap(page, ov, "test11d_full_names_short", { wait: 1000 });
  await L(ov, { "team-name-select": "abbr" });
  await G(ov, { "team1-abbr": "BKLYN", "team2-abbr": "FDU", "team1-name": "Brooklyn College", "team2-name": "Fairleigh Dickinson" });
  await snap(page, ov, "test11e_back_to_abbr", { wait: 1400, visible: { team1Name: false, team1ImageContainer: true } });

  // Test 12 — logos with different aspect ratios
  await G(ov, { "saved_team1-logo": "/test/assets/wide.svg", "saved_team2-logo": "/test/assets/tall.svg" });
  await snap(page, ov, "test12_logos_wide_tall");
  await G(ov, { "saved_team1-logo": "/test/assets/square.svg", "saved_team2-logo": "/src/_debugassets/NJCAA%20Sheild%20Logo.png" });
  await snap(page, ov, "test12b_logos_square_shield");

  // Test 13 — popup
  await L(ov, { "popup-show": true, "popup-text": "Brooklyn College Athletics - CUNYAC Conference Game" });
  await snap(page, ov, "test13_popup_on_48chars", { wait: 1200, frame: true, visible: { "popup-container": true }, expect: { "popup-text": "BROOKLYN COLLEGE ATHLETICS - CUNYAC CONFERENCE GAME" } });
  const popupFont = await ov.evaluate(() => getComputedStyle(document.getElementById("popup-text")).fontSize);
  if (popupFont !== "15px") { failures++; console.log(`[FAIL] popup font-size ${popupFont}, expected 15px`); } else console.log("[ok] popup text keeps its 15px size");
  await L(ov, { "popup-show": false });
  await snap(page, ov, "test13b_popup_off", { wait: 1000, visible: { "popup-container": false } });

  // Test 14 — network logo
  await L(ov, { "left-show": true });
  await snap(page, ov, "test14_network_custom_on", { wait: 1200, frame: true, visible: { "network-background": true } });
  await L(ov, { "left-color-logo-select": "wideNetwork" });
  await snap(page, ov, "test14b_network_wide_global", { wait: 1000 });
  await L(ov, { "left-color-logo-select": "squareNetwork" });
  await snap(page, ov, "test14c_network_square_global", { wait: 1000 });
  await L(ov, { "left-show": true, "popup-show": true });
  await snap(page, ov, "test14d_network_and_popup", { wait: 1200, frame: true });
  await L(ov, { "left-show": false, "popup-show": false, "left-color-logo-select": "custom" });
  await snap(page, ov, "test14e_network_off", { wait: 1200, visible: { "network-background": false } });

  // HALF / FINAL and other clock states
  await G(ov, { period: "half" });
  await snap(page, ov, "extra_half", { expect: { periodHidden: "HALF" }, visible: { hiddenContainer: true } });
  await G(ov, { period: "final" });
  await snap(page, ov, "extra_final", { expect: { periodHidden: "FINAL" }, visible: { hiddenContainer: true } });
  await G(ov, { period: "3", "game-time": "1:08" });
  await snap(page, ov, "extra_back_to_3rd", { expect: { period: "3rd", gameTime: "1:08" }, visible: { hiddenContainer: false } });
  await G(ov, { "game-time": "00:09.5", "shot-time": "0:04.7" });
  await snap(page, ov, "extra_tenths", { expect: { gameTime: ":09.5", shotClock: "4.7" } });
  await G(ov, { "game-time": "12:43", "shot-time": "24.0" });
  await snap(page, ov, "extra_shot_format_24_0", { expect: { gameTime: "12:43", shotClock: "24" } });
  await G(ov, { showhideShotClock: false });
  await snap(page, ov, "extra_shot_clock_hidden", { visible: { shotClockContainer: false } });
  await G(ov, { showhideClock: false });
  await snap(page, ov, "extra_clock_off_period_only", { visible: { timeContainer: false, shotClockContainer: false } });
  await G(ov, { showhideShotClock: true });
  await snap(page, ov, "extra_clock_off_shot_on", { visible: { timeContainer: false, shotClockContainer: true } });
  await G(ov, { showhideClock: true, "shot-time": "0:24" });
  await snap(page, ov, "extra_clock_on_again", { visible: { timeContainer: true, shotClockContainer: true } });
  await L(ov, { "pip-clock-show": true });
  await snap(page, ov, "extra_pip_clock_on", { visible: { timeContainer: false } });
  await L(ov, { "pip-clock-show": false });
  await snap(page, ov, "extra_pip_clock_off", { visible: { timeContainer: true } });

  // highlight color options
  await L(ov, { "highlight-color-select": "away" });
  await snap(page, ov, "extra_highlight_away", { wait: 400 });
  await L(ov, { "highlight-color-select": "custom" });

  // overlay off / on cycle (Truck lifecycle events)
  await ov.evaluate(() => $(document).trigger("onOverlayInactive"));
  await snap(page, ov, "extra_overlay_off", { wait: 2500 });
  await ov.evaluate(() => $(document).trigger("onOverlayActive"));
  await snap(page, ov, "extra_overlay_on_again", { wait: 2600, frame: true, expect: { team1Score: "48", team2Score: "55", period: "3rd" } });

  // ---- form.html with a stub bridge ------------------------------------
  const formPage = await context.newPage();
  formPage.on("console", (m) => { if (m.type() === "error") errors.push("form console: " + m.text()); });
  formPage.on("pageerror", (e) => errors.push("form pageerror: " + e.message));
  await formPage.addInitScript(() => {
    window.bridge = {
      getPTVersion: (cb) => setTimeout(() => window[cb]('{"platform":"mac","version":"3.6.10"}'), 0),
      documentReady: () => {},
      readFile: (name, cb) => setTimeout(() => window[cb]('{"popup-show":true,"popup-text":"Test","left-show":true}'), 0),
      writeFile: () => {},
      sendLocalData: () => {},
      fileSelectorOverride: () => {}
    };
  });
  await formPage.setViewportSize({ width: 520, height: 620 });
  await formPage.goto(BASE + "/src/form.html", { waitUntil: "load" });
  await formPage.waitForTimeout(800);
  await formPage.screenshot({ path: path.join(OUT, "form.png") });
  const formErrors = errors.splice(0);
  if (formErrors.length) { failures++; console.log("[FAIL] form.html: " + formErrors.join(" | ")); } else console.log("[ok] form.html loads with a stub bridge");

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(`\n${failures ? failures + " FAILURE(S)" : "ALL CHECKS PASSED"} — screenshots in ${OUT}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
