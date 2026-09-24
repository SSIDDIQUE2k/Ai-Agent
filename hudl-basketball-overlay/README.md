# Brooklyn College basketball scoreboard — Hudl Production Truck overlay

Redesign of the `173559.pto` basketball scoreboard overlay for a modern broadcast look while keeping every
Production Truck data binding, form option and bridge call of the original package.

| File | Purpose |
| --- | --- |
| `Brooklyn_Basketball_Scoreboard_Improved.pto` | **Import this into Production Truck.** ZIP package with `overlay.html`, `form.html`, `position.json`, `CSS/`, `JS/`, `assets/` at the archive root (same folder set as the original). |
| `original_173559.pto` | Untouched copy of the original upload. |
| `src/` | Extracted source of the improved package (what the `.pto` is built from). |
| `test/` | Browser test harness (Playwright + Chromium) with mock Production Truck data. |
| `screenshots/` | Renders of the test scenarios (2x crops and 1920x1080 composites). |

## Layout

926 x 94 px lower third, centered at the bottom of a 1920 x 1080 frame (`position.json`: x center, y bottom, 25 px up).

```
[network 116] [ AWAY 300 ] [ CLOCK 210 ] [ HOME 300 ]
 |logo BKLYN        48 | 12:43 | 24 | 52        FDU logo|
 |FOULS 4 BONUS   ----- |  2ND  |    | ----- BONUS+ FOULS 7|
```

* Dark neutral broadcast base, team colors used as a 4 px edge stripe and a muted tint behind the logo.
* Scores 38 px, tabular digits, fixed 96 px cells: 0, 48, 99 and 105 all render without any layout shift.
* Game clock 32 px stacked over the period label; shot clock in its own amber cell; HALF / FINAL replace the clock well.
* Fouls, BONUS / BONUS+ tag, possession triangle and up to six timeout pills as a secondary row.
* Optional network logo cell on the left and popup message bar above, both sized with the existing centering logic.
* Bundled Montserrat SemiBold only; no external fonts, scripts, images or APIs.

## What changed in the code

* `overlay.html` — same ids and classes; added `#team1Accent` / `#team2Accent` stripes, foul label/number spans.
* `CSS/overlay.css` — rewritten for the new geometry; state classes (`name-full`, `has-shot`, `clock-off`, `pip-on`)
  replace the old inline width animations.
* `JS/overlay.js` — data handlers (`updateGlobalData`, `updateLocalData`) and bridge calls kept; layout drivers
  (`centerOverlay`, `clockShowHide`, `updateTeamType`, reveal / hide sequences) rewritten against one `LAYOUT`
  constants block; possession and bonus now toggle classes; the 3 POINTER / TIMEOUT message layer sits over the
  scoring team's block instead of covering the clock. Fixes: `updatePeriod()` no longer throws before the first
  period arrives, `3 OT` / `4 OT` no longer hide the clock, stale `right-*` form keys no longer throw, scores render
  only after they are received, the highlight bar follows team / network colors as they arrive, and clock / shot
  clock formatting handles `00:09.5`, `0:24`, `24.0` and `0:04.7`.
* `position.json` — height 82 px -> 94 px (width, justification and offset unchanged).
* `CSS/form_style.css` — cosmetic polish only; `form.html` and `JS/form.js` unchanged.
* jQuery 1.8.3, jQuery UI 1.11.1, spectrum, `bridgelessincludes.js`, `globalDataShim.js`, `overlayUtils.js` untouched.

## Testing

```
cd hudl-basketball-overlay
python3 -m http.server 8765 --bind 127.0.0.1 &
NODE_PATH=$(npm root -g) node test/run.js        # needs the playwright npm package and Chromium
```

The harness loads `test/frame.html` (a 1920x1080 mock frame with the overlay at its `position.json` location),
pushes mock data for every scenario, screenshots each one and checks for console errors, text overflow, elements
outside the 926x94 canvas, overlapping meta elements and layout shift across 0 / 48 / 99 / 105 scores.

Not testable outside Production Truck: `bridge.scaleImage` logo scaling (browser fallback used), the PIP clock
video region (rectangle is reported through `bridge.pipUpdateOutput` with the same coordinate convention as the
original), and the real control-panel value formats for `game-time` / `shot-time` (several formats are handled).
