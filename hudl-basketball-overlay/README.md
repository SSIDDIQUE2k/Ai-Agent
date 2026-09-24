# Brooklyn College basketball scoreboard — Hudl Production Truck overlay

Redesign of the `173559.pto` basketball scoreboard overlay for a modern broadcast look while keeping every
Production Truck data binding, form option and bridge call of the original package.

| File | Purpose |
| --- | --- |
| `Brooklyn_Basketball_Scoreboard_Improved.pto` | **Import this into Production Truck.** ZIP package with `overlay.html`, `form.html`, `position.json`, `CSS/`, `JS/`, `assets/` at the archive root (same folder set as the original plus `assets/flosports.png`). |
| `download/173559.pto` | The same package under the original file name. |
| `original_173559.pto` | Untouched copy of the original upload. |
| `src/` | Extracted source of the improved package (what the `.pto` is built from). |
| `test/` | Browser test harness (Playwright + Chromium) with mock Production Truck data, plus the thumbnail renderer. |
| `thumbnail/` | Images for the Hudl vCloud "Upload Overlay" form. |
| `screenshots/` | Renders of the test scenarios (2x crops and 1920x1080 composites). |

## Layout

1110 x 94 px lower third, centered at the bottom of a 1920 x 1080 frame (`position.json`: x center, y bottom, 25 px up).

```
[bookend 92] [network 116] [ AWAY 300 ] [ CLOCK 210 ] [ HOME 300 ] [bookend 92]
 |school|  |FloSports| logo BKLYN >   48 | 12:43 | 24 | 52   < FDU logo |school|
 |logo  |  |         | FOULS 4 BONUS ---- |  2ND  |    | ---- BONUS+ FOULS 7 |logo  |
```

Cells that are switched off (bookends, network) collapse and the rest re-centers, so the bar is 810 px at its
narrowest and 1110 px with everything on.

* **Brooklyn College theme (default)**: glossy dark bar with gold edge lines, maroon bookends with gold stripes,
  maroon popup bar with gold caps, gold period / shot clock / possession / timeout pills / bonus tags.
  Team colors tint a translucent glass panel behind each logo + abbreviation and the 4 px edge stripes.
  A neutral dark theme is available from the form.
* Scores 38 px, tabular digits, fixed 96 px cells: 0, 48, 99 and 105 render without any layout shift.
* Game clock 32 px stacked over the period label; shot clock framed in its own cell; HALF / FINAL replace the clock well.
* Fouls, BONUS / BONUS+ tag, possession triangle pointing at the score, up to six timeout pills with dim slots for
  the timeouts already used (slot count follows the highest value seen from the control panel).
* 3-pointer: a team-colored panel rises over the scoring team's block and a large italic "3" sweeps across it
  (about 2 s total). Timeouts keep the TIMEOUT + team name message.
* School bookends show the home team logo by default (away logo, a custom file, or off are selectable).
* Network cell: built-in FloSports mark on FloSports red by default; custom logo/color and the control panel's
  square / wide network logos remain available.
* Bundled Montserrat SemiBold only; no external fonts, scripts, images or APIs.

## Form options (`form.html`)

| Option | Key | Default |
| --- | --- | --- |
| Theme | `theme-select` | `bc` (Brooklyn College); `neutral` |
| School Logo Bookends | `bookend-select`, `bookend-logo` | `home`; `away`, `custom` (+ file), `off` |
| Team Name Option | `team-name-select` | `abbr`; `full` |
| Popup | `popup-show`, `popup-text` | off |
| Network Select | `left-show`, `left-color-logo-select`, `left-custom-color`, `left-custom-logo` | shown, `flosports`; `custom`, `squareNetwork`, `wideNetwork` |
| PIP Clock | `pip-clock-show` | off |
| Base Color | `highlight-color-select`, `custom-highlight-color` | `custom`, `#EBB700` |

## What changed in the code

* `overlay.html` — same ids and classes; added bookend cells, team accent stripes and glass panels, timeout slots,
  a shot clock frame, foul label/number spans.
* `CSS/overlay.css` — rewritten for the new geometry; theme rules under `.theme-bc`; state classes (`name-full`,
  `has-shot`, `clock-off`, `pip-on`, `net-flosports`) replace the old inline width animations.
* `JS/overlay.js` — data handlers (`updateGlobalData`, `updateLocalData`) and bridge calls kept; layout drivers
  (`centerOverlay`, `clockShowHide`, `updateTeamType`, reveal / hide sequences) rewritten against one `LAYOUT`
  constants block; bookends, theme, FloSports cell, timeout slots, glass tint and the 3-point sweep added.
  Fixes: `updatePeriod()` no longer throws before the first period arrives, `3 OT` / `4 OT` no longer hide the clock,
  stale `right-*` form keys no longer throw, scores render only after they are received, the highlight bar follows
  team / network colors as they arrive, the network color is no longer hidden by the bar gradient, and clock / shot
  clock formatting handles `00:09.5`, `0:24`, `24.0` and `0:04.7`.
* `position.json` — 926 x 82 px -> 1110 x 94 px (justification and offset unchanged).
* `form.html` / `JS/form.js` — Theme and School Logo Bookends sections, FloSports option, gold default base color;
  `CSS/form_style.css` cosmetic polish only.
* jQuery 1.8.3, jQuery UI 1.11.1, spectrum, `bridgelessincludes.js`, `globalDataShim.js`, `overlayUtils.js` untouched.

## Testing

```
cd hudl-basketball-overlay
python3 -m http.server 8765 --bind 127.0.0.1 &
NODE_PATH=$(npm root -g) node test/run.js        # needs the playwright npm package and Chromium
NODE_PATH=$(npm root -g) node test/thumbnail.js  # re-renders thumbnail/*.png
```

The harness loads `test/frame.html` (a 1920x1080 mock frame with the overlay at its `position.json` location),
pushes mock data for every scenario, screenshots each one and checks for console errors, text overflow, elements
outside the canvas, overlapping meta elements, layout shift across 0 / 48 / 99 / 105 scores, bookend / theme /
network states, the 3-point and TIMEOUT animations, and the form defaults.

Not testable outside Production Truck: `bridge.scaleImage` logo scaling (browser fallback used), the PIP clock
video region (rectangle is reported through `bridge.pipUpdateOutput` with the same coordinate convention as the
original), and the real control-panel value formats for `game-time` / `shot-time` (several formats are handled).
