/*
  Renders the thumbnail images used for the Hudl vCloud "Upload Overlay" form.
  Usage: (server running on 8765) NODE_PATH=$(npm root -g) node test/thumbnail.js
*/
const path = require("path");
const { chromium } = require("playwright");

const OUT = path.join(__dirname, "..", "thumbnail");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const W = 1110, H = 94;

const state = {
  "team1-abbr": "FDU", "team2-abbr": "BC", "team1-name": "Fairleigh Dickinson", "team2-name": "Brooklyn College",
  "saved_team1-logo": "/test/assets/wide.svg", "saved_team2-logo": "/test/assets/square.svg",
  "team1-color": "#1c4587", "team2-color": "#882345", "team1-score": 52, "team2-score": 48,
  "team1-timeouts": 4, "team2-timeouts": 4, "team1-fouls": 4, "team2-fouls": 7, "possession-arrow": "team1",
  BNSvalue1: "show", DBNSvalue1: "hide", BNSvalue2: "show", DBNSvalue2: "show",
  period: "2", "game-time": "12:43", showhideClock: true, showhideShotClock: true, "shot-time": "0:24"
};
const later = { "team1-timeouts": 3, "team2-timeouts": 2 };
const local = { "theme-select": "bc", "bookend-select": "home", "team-name-select": "abbr", "popup-show": false, "left-show": true, "left-color-logo-select": "flosports", "pip-clock-show": false, "highlight-color-select": "custom", "custom-highlight-color": "#EBB700" };
const toG = (o) => { const d = {}; for (const k in o) d[k] = (k === "showhideClock" || k === "showhideShotClock") ? { checked: o[k] } : { value: o[k] }; return d; };

(async () => {
  const b = await chromium.launch();

  // 1) transparent 2x crop of the scoreboard alone
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await p.goto(BASE + "/src/overlay.html"); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(2200);
  await p.evaluate((l) => updateLocalData(l), local); await p.evaluate((d) => updateGlobalData(d), toG(state));
  await p.waitForTimeout(1500); await p.evaluate((d) => updateGlobalData(d), toG(later)); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(OUT, "scoreboard_thumbnail_transparent.png"), omitBackground: true });

  // 2) 16:9 thumbnail on a dark backdrop, scoreboard enlarged for legibility
  const f = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const scale = 1.1, left = Math.round((1280 - W * scale) / 2);
  await f.setContent(`<html><body style="margin:0;width:1280px;height:720px;background:radial-gradient(ellipse at 50% 40%,#3a2028,#101215 70%);overflow:hidden">
    <div style="position:absolute;left:0;right:0;top:170px;text-align:center;font:600 34px Arial,sans-serif;color:#fff;letter-spacing:1px">BROOKLYN COLLEGE BASKETBALL SCOREBOARD</div>
    <div style="position:absolute;left:0;right:0;top:218px;text-align:center;font:400 20px Arial,sans-serif;color:#ebb700;letter-spacing:2px">HUDL PRODUCTION TRUCK OVERLAY</div>
    <iframe id="ov" src="${BASE}/src/overlay.html" style="position:absolute;left:${left}px;top:313px;width:${W}px;height:${H}px;border:0;background:transparent;transform:scale(${scale});transform-origin:top left" allowtransparency="true"></iframe>
  </body></html>`);
  const ov = f.frame({ url: /overlay\.html/ }); await ov.evaluate(() => document.fonts.ready); await f.waitForTimeout(2200);
  await ov.evaluate((l) => updateLocalData(l), local); await ov.evaluate((d) => updateGlobalData(d), toG(state));
  await f.waitForTimeout(1500); await ov.evaluate((d) => updateGlobalData(d), toG(later)); await f.waitForTimeout(1500);
  await f.screenshot({ path: path.join(OUT, "scoreboard_thumbnail_1280x720.png") });
  await b.close(); console.log("thumbnails written to " + OUT);
})();
