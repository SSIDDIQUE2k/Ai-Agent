#!/usr/bin/env bash
# Builds the Production Truck package from src/ mirroring the original 173559.pto archive:
# same entry order (form.html first), deflate compression, directory entries and
# per-entry extra fields kept. Files at the archive root, no parent folder.
#
# Usage: test/build_pto.sh            (run from the hudl-basketball-overlay folder)
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="$PWD/Brooklyn_Basketball_Scoreboard_Improved.pto"
COPY="$PWD/download/173559.pto"

# Entry order of the original package, with the new bundled asset appended inside assets/
ENTRIES=(
  form.html
  .DS_Store
  CSS/
  CSS/overlay.css
  CSS/form_style.css
  CSS/spectrum.css
  JS/
  JS/overlayUtils.js
  JS/globalDataShim.js
  JS/overlay.js
  JS/jquery-1.8.3.min.js
  JS/colorpicker.js
  JS/bridgelessincludes.js
  JS/pipFormUtilities.js
  JS/spectrum.js
  JS/form.js
  JS/jquery-ui.js
  _debugassets/
  "_debugassets/NJCAA Sheild Logo.png"
  position.json
  _rawassets/
  _rawassets/Football-Score_Banner.psd
  _Final/
  _Final/Scoreboard.pto
  _Final/ScoreBoard.png
  OFL.txt
  overlay.html
  assets/
  assets/gradient-background.png
  assets/eye_icon.svg
  assets/teamcontainerupdate.png
  assets/possGray.png
  assets/possWhite.png
  assets/flosports.png
  assets/fonts/
  assets/fonts/Montserrat-SemiBold.ttf
)

rm -f "$OUT" "$COPY"
cd src

# every entry must exist, and every file in src/ must be listed
for e in "${ENTRIES[@]}"; do
  [ -e "$e" ] || { echo "missing: $e" >&2; exit 1; }
done
missing=$(find . -type f | sed 's#^\./##' | sort | comm -23 - <(printf '%s\n' "${ENTRIES[@]}" | grep -v '/$' | sort))
if [ -n "$missing" ]; then echo "files in src/ not in the entry list:" >&2; echo "$missing" >&2; exit 1; fi

# -D is NOT used (directory entries kept), -X is NOT used (extra fields kept), deflate is the default
zip -q "$OUT" "${ENTRIES[@]}"

cd ..
cp "$OUT" "$COPY"

echo "== first entries =="; unzip -Z1 "$OUT" | sed -n '1,5p'
echo "== integrity =="; unzip -t -q "$OUT"
echo "== root files =="; unzip -Z1 "$OUT" | grep -E '^(overlay\.html|form\.html|position\.json)$'
echo "== entry count =="; unzip -Z1 "$OUT" | wc -l
ls -la "$OUT" "$COPY"
