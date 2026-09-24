/*
  Basketball scoreboard overlay — Hudl Production Truck

  Data flow (unchanged from the original package):
    Production Truck scoreboard  -> updateGlobalData(data)   (team1-score, game-time, period, ...)
    form.html (bridge local data) -> updateLocalData(data)   (popup-show, left-show, team-name-select, ...)
    Truck lifecycle events        -> onOverlayActive / onOverlayInactive / pvwAnimation

  Layout numbers are shared with CSS/overlay.css through the LAYOUT object below.
  Written for the embedded browser: jQuery 1.8.3 + jQuery UI 1.11.1, ES5 syntax only.
*/

var pvwEnable = true;
var firstLocalDataReceived = false;
var firstDataReceived = false;
var pendingAnimation = false;

// Geometry (px) — keep in sync with CSS/overlay.css
var LAYOUT = {
  containerW: 926, // #overlay-container width
  networkW: 116,   // optional network / custom logo cell
  teamW: 300,      // each team block
  clockW: 210,     // clock well between the teams
  centerW: 810,    // 2 * teamW + clockW
  timeTop: 2,      // game clock cell inside the main bar (also the PIP clock rectangle)
  timeH: 36,
  timeW: 210,      // game clock width without the shot clock
  timeWShot: 150   // game clock width with the shot clock shown
};

var SLIDE_MS = 200; // duration of every reveal / hide slide

$(document).ready(function () {
  var includeFilesJS = ["JS/globalDataShim.js", "JS/overlayUtils.js"];
  var includeFilesCSS = [];

  initializeDependencies(includeFilesJS, includeFilesCSS);

  if (typeof bridge != "undefined") {
    // wait for first local data to display
    prepAnimatedElements();
    bridge.documentReady();
  } else {
    // debugging in a browser
    firstLocalDataReceived = true;
    overlayOn();
  }
});

function didInitializeDependencies() {
  updatePipOutput();
}

$(document).on("onOverlayActive", function (e) {
  pvwEnable = false;
  overlayOn();
});

$(document).on("onOverlayInactive", function (e) {
  pvwEnable = true;
  overlayOff();
});

$(document).on("pvwAnimation", function () {
  if (pvwEnable == true) {
    overlayOn();
  }
});

// ---------------------------------------------------------------------------
// Bridge helpers (PIP clock)
// ---------------------------------------------------------------------------

// Rectangle of the game clock cell: left in #overlay-container space,
// top/height inside the main bar (same convention as the original package).
function pipRect() {
  var visibleWidth = LAYOUT.centerW + (lastShowLeft ? LAYOUT.networkW : 0);
  var mainLeft = (LAYOUT.containerW - visibleWidth) / 2 - (lastShowLeft ? 0 : LAYOUT.networkW);

  return {
    left: Math.round(mainLeft + LAYOUT.networkW + LAYOUT.teamW),
    top: LAYOUT.timeTop,
    width: lastShowShotClock ? LAYOUT.timeWShot : LAYOUT.timeW,
    height: LAYOUT.timeH
  };
}

function updatePipOutput() {
  if (
    typeof bridge !== "undefined" &&
    typeof bridge.pipUpdateOutput !== "undefined"
  ) {
    var rect = pipRect();
    // left, top, width, height
    bridge.pipUpdateOutput(rect.left, rect.top, rect.width, rect.height);
  }
}

function pipSetActive(active) {
  if (
    typeof bridge !== "undefined" &&
    typeof bridge.pipSetActive !== "undefined"
  ) {
    bridge.pipSetActive(active);
  }
}

// ---------------------------------------------------------------------------
// Overlay on / off
// ---------------------------------------------------------------------------

function clearOverlayDefaults() {
  $(".teamImage").css("background-image", "").hide();
  $(".teamName").html("");
  $(".bonusText").html("").removeClass("bonus double-bonus");
  $(".teamAbbr").html("");
  $(".foul-count").html("");
}

function overlayOn() {
  pipSetActive(false);

  prepAnimatedElements();
  setTimeout(animateMe, 250);
}

function prepAnimatedElements() {
  pendingAnimation = true;
  $("#popup-container, #network-background, #center, #team1, #team2, #animationLayer").hide();
  $(".teamImageContainer, .teamAbbr, .teamName, .teamScoreBackground, .timeout").hide();
  $("#shadowPopUp, #networkShadow, #baseLine, #periodTimeContainer").hide();
  $("#hiddenContainer").hide();
}

function animateMe() {
  function animateTeamElements(team) {
    applyTeamTypeClass();

    if (lastTeamNameSelect == "full") {
      $("#team" + team + "Name").show("slide", { direction: "left" }, SLIDE_MS);
    } else {
      $("#team" + team + "ImageContainer").show("slide", { direction: "left" }, SLIDE_MS);
      $("#team" + team + "Abbr").show("slide", { direction: "left" }, SLIDE_MS);
    }

    $("#team" + team + "ScoreBackground").show("slide", { direction: "left" }, SLIDE_MS);

    var timeouts = team == 1 ? lastTeam1Timeouts : lastTeam2Timeouts;
    if (timeouts > 6) {
      timeouts = 6;
    }
    for (var i = 1; i <= timeouts; i++) {
      $("#team" + team + "Timeout" + i)
        .delay(120 * i)
        .fadeIn(150);
    }
  }

  updateTeamAbbrs();
  updateTeamNames();
  updateTeamType();
  updatePopup();
  centerOverlay();
  updatePeriod();

  var leftComplete = false;
  var rightComplete = false;

  function completion() {
    pendingAnimation = false;
    setTimeout(clockShowHide, 300);
    setTimeout(popupShowHide, 700);
  }

  function leftCompletion() {
    leftComplete = true;
    if (leftComplete && rightComplete) {
      completion();
    }
  }

  function rightCompletion() {
    rightComplete = true;
    if (leftComplete && rightComplete) {
      completion();
    }
  }

  $("#center").show("slide", { direction: "left" }, 250, function () {
    $("#team1").show("slide", { direction: "left" }, SLIDE_MS, function () {
      animateTeamElements(1);

      $("#team2").show("slide", { direction: "left" }, SLIDE_MS, function () {
        animateTeamElements(2);

        leftCompletion();

        var animateFirst = lastHideClock ? "#hiddenContainer" : "#periodTimeContainer";

        $(animateFirst).show("slide", { direction: "left" }, SLIDE_MS, function () {
          if (lastShowLeft) {
            $("#network-background").show("slide", { direction: "right" }, SLIDE_MS, function () {
              $("#networkShadow").show();
              $("#baseLine").show("slide", { direction: "down" }, 150);
            });
          } else {
            $("#baseLine").show("slide", { direction: "down" }, 150);
          }
        });
      });
    });
    rightCompletion();
  });
}

function overlayOff() {
  var leftComplete = false;
  var rightComplete = false;

  function completion() {
    $("#overlay-container").hide();
    overlayCompleted();
  }

  function leftCompletion() {
    leftComplete = true;
    if (leftComplete && rightComplete) {
      completion();
    }
  }

  function rightCompletion() {
    rightComplete = true;
    if (leftComplete && rightComplete) {
      completion();
    }
  }

  pendingAnimation = true;
  pipSetActive(false);

  if (lastShowPopup) {
    $("#popup-container").hide("slide", { direction: "down" }, SLIDE_MS, leftCompletion);
  } else {
    leftCompletion();
  }

  $("#shotClockContainer")
    .delay(SLIDE_MS)
    .hide("slide", { direction: "right" }, SLIDE_MS, function () {
      $("#overlay-container")
        .delay(300)
        .hide("slide", { direction: "down" }, 250, rightCompletion);
    });
}

function overlayCompleted() {
  if (typeof bridge !== "undefined") {
    bridge.overlayCompleted();
  }

  setTimeout(function () {
    $("#popup-container, #network-background, #team1, #team2, #periodTimeContainer, #shotClockContainer").show();

    pendingAnimation = false;

    jQuery.fx.off = true;

    updateTeamType();
    clockShowHide(); // this calls leftShowHide -> centerOverlay
    popupShowHide();

    jQuery.fx.off = false;

    $("#overlay-container").fadeIn();
  }, 250);
}

// Centers the visible part of the scoreboard (with or without the network cell)
// and keeps the popup bar, the accent bar and the PIP rectangle aligned with it.
function centerOverlay() {
  var totalWidth = LAYOUT.containerW;
  var visibleWidth = LAYOUT.centerW + (lastShowLeft ? LAYOUT.networkW : 0);

  var contentLeft = (totalWidth - visibleWidth) / 2;                         // #overlay-container space
  var overlayWrapLeft = contentLeft - (lastShowLeft ? 0 : LAYOUT.networkW); // #main-structure left
  var baseLineLeft = lastShowLeft ? 0 : LAYOUT.networkW;                    // inside #main-structure

  updatePipOutput();

  var popupProps = { left: contentLeft + "px", width: visibleWidth + "px" };

  $("#main-structure").animate({ left: overlayWrapLeft + "px" }, SLIDE_MS);
  $("#popup-container").animate(popupProps, SLIDE_MS);
  $("#shadowPopUp").animate(popupProps, SLIDE_MS);
  $("#baseLine").animate({ left: baseLineLeft + "px", width: visibleWidth + "px" }, SLIDE_MS);
}

// ---------------------------------------------------------------------------
// Text fitting (uses JS/overlayUtils.js)
// ---------------------------------------------------------------------------

function updatePopup() {
  resizeAndPositionToFit("popup-text", lastPopupText, 15, 0, 0);
}

function updateTeamAbbrs() {
  resizeAndPositionToMatch("team1Abbr", lastTeam1Abbr, "team2Abbr", lastTeam2Abbr, 26, 3, 0);
}

function updateTeamNames() {
  resizeAndPositionToMatch("team1Name", lastTeam1Name, "team2Name", lastTeam2Name, 24, 3, 0);
}

// ---------------------------------------------------------------------------
// Popup, network cell, clock well
// ---------------------------------------------------------------------------

function popupShowHide() {
  if (pendingAnimation) {
    // the pending animation will reveal this
    return;
  }
  if (lastShowPopup) {
    $("#popup-container").show("slide", { direction: "down" }, SLIDE_MS, function () {
      $("#shadowPopUp").show();
    });
  } else {
    $("#popup-container").hide("slide", { direction: "down" }, SLIDE_MS, function () {
      $("#shadowPopUp").hide();
    });
  }
}

function leftShowHide() {
  if (lastShowLeft) {
    $("#network-background").show("slide", { direction: "right" }, SLIDE_MS, function () {
      $("#networkShadow").show();
    });
  } else {
    $("#networkShadow").hide();
    $("#network-background").hide("slide", { direction: "right" }, SLIDE_MS);
  }

  centerOverlay();
}

// Legacy right-side logo hooks referenced by saved form data from older versions.
// This layout has no right-side cell; keep them as no-ops so stale keys never throw.
function rightShowHide() {}
function updateRightColorLogo() {}

var lastLeftColor = null;
var lastLeftLogo = null;
function updateLeftColorLogo() {
  if (lastLeftColorLogoType == "custom") {
    lastLeftColor = lastLeftCustomColor;
    lastLeftLogo = lastLeftCustomLogo;
  } else {
    lastLeftColor = lastGlobalNetworkColor;

    if (lastLeftColorLogoType == "squareNetwork") {
      lastLeftLogo = lastGlobalNetworkLogoSquare;
    } else if (lastLeftColorLogoType == "wideNetwork") {
      lastLeftLogo = lastGlobalNetworkLogoWide;
    } else {
      //shouldn't happen
      lastLeftColor = "#282828";
      lastLeftLogo = null;
    }
  }

  if (lastLeftColor == null || lastLeftColor == "") {
    $("#network-background").css("background-color", "");
  } else {
    $("#network-background").css("background-color", lastLeftColor);
  }

  if (lastLeftLogo == null || lastLeftLogo == "") {
    $("#network-logo").css("background-image", "").hide();
  } else {
    scaleAndApplyImage(lastLeftLogo, 100, 44, "contain", "network-logo", true);
  }
}

// Applies the clock-well state: game clock, period, shot clock, PIP and HALF/FINAL cover.
function clockShowHide() {
  pendingAnimation = false;

  var $well = $("#periodTimeContainer");
  $well.show();

  if (lastHideClock) {
    $("#hiddenContainer").show();
  } else {
    $("#hiddenContainer").hide();
  }

  var clockVisible = lastShowCpClock && !lastShowPipClock;

  $well.toggleClass("has-shot", !!lastShowShotClock);
  $well.toggleClass("pip-on", !!lastShowPipClock);
  $well.toggleClass("clock-off", !lastShowCpClock && !lastShowPipClock);

  if (lastShowShotClock) {
    $("#shotClockContainer").show("slide", { direction: "right" }, SLIDE_MS);
  } else {
    $("#shotClockContainer").hide("slide", { direction: "right" }, SLIDE_MS);
  }

  if (clockVisible) {
    $("#timeContainer").show("slide", { direction: "left" }, SLIDE_MS);
  } else {
    $("#timeContainer").hide("slide", { direction: "left" }, SLIDE_MS);
  }

  pipSetActive(!!lastShowPipClock);

  leftShowHide();
}

// ---------------------------------------------------------------------------
// Team blocks
// ---------------------------------------------------------------------------

function applyTeamTypeClass() {
  $("#overlay-container").toggleClass("name-full", lastTeamNameSelect == "full");
}

//this updates if team Name or team Abbr is being used
function updateTeamType() {
  if (pendingAnimation) {
    // the pending animation will reveal these
    return;
  }

  if (lastTeamNameSelect == "full") {
    $(".teamImageContainer").hide("slide", { direction: "down" }, SLIDE_MS);
    $(".teamAbbr")
      .hide("slide", { direction: "down" }, SLIDE_MS)
      .promise()
      .done(function () {
        applyTeamTypeClass();
        $(".teamName").show("slide", { direction: "down" }, SLIDE_MS);
      });
    updateTeamNames();
  } else {
    $(".teamName")
      .hide("slide", { direction: "down" }, SLIDE_MS)
      .promise()
      .done(function () {
        applyTeamTypeClass();
        $(".teamImageContainer").show("slide", { direction: "down" }, SLIDE_MS);
        $(".teamAbbr").show("slide", { direction: "down" }, SLIDE_MS);
      });
    updateTeamAbbrs();
  }
}

// Shows pills 1..n, pulses out the pill that was just used, hides the rest.
function updateTimeouts(team) {
  if (pendingAnimation) {
    // the pending animation will reveal these
    return;
  }

  var lastTeamTimeouts;
  switch (team) {
    case 1: {
      lastTeamTimeouts = lastTeam1Timeouts;
      break;
    }
    case 2: {
      lastTeamTimeouts = lastTeam2Timeouts;
      break;
    }
    default: {
      return;
    }
  }

  var remaining = parseInt(lastTeamTimeouts, 10);
  if (isNaN(remaining)) {
    //shouldnt happen
    console.log("timeout for team did not have a valid value");
    return;
  }
  remaining = Math.max(0, Math.min(6, remaining));

  for (var i = 1; i <= 6; i++) {
    var $pill = $("#team" + team + "Timeout" + i);
    if (i <= remaining) {
      $pill.stop(true, true).show().css({ opacity: "1" });
    } else if (i == remaining + 1) {
      $pill.hide("pulsate", { times: 3 }, 900);
    } else {
      $pill.hide();
    }
  }
}

function updatePossessionArrow() {
  var $away = $("#possessionArrow1");
  var $home = $("#possessionArrow2");

  if (lastPossArrow == "team1") {
    // away team has possession
    $away.stop(true, true).fadeIn(SLIDE_MS);
    $home.stop(true, true).fadeOut(SLIDE_MS);
  } else if (lastPossArrow == "team2") {
    // home team has possession
    $home.stop(true, true).fadeIn(SLIDE_MS);
    $away.stop(true, true).fadeOut(SLIDE_MS);
  } else {
    // "off" or anything else
    $(".possessionArrow").stop(true, true).fadeOut(SLIDE_MS);
  }
}

function applyBonus(elementId, doubleBonus, bonus) {
  var $el = $("#" + elementId);
  if (doubleBonus == "show") {
    // double bonus has priority
    $el.html("BONUS+").removeClass("bonus").addClass("bonus double-bonus");
  } else if (bonus == "show") {
    $el.html("BONUS").removeClass("double-bonus").addClass("bonus");
  } else {
    $el.html("").removeClass("bonus double-bonus");
  }
}

function updateTeamBonus() {
  applyBonus("bonusText1", lastTeam1DBNS, lastTeam1BNS);
  applyBonus("bonusText2", lastTeam2DBNS, lastTeam2BNS);
}

function updateFouls(team, fouls) {
  var $el = $("#team" + team + "-foul-count");
  if (fouls > 0) {
    $el.html('<span class="foul-label">FOULS</span><span class="foul-num">' + fouls + "</span>").show();
  } else {
    $el.html("").hide();
  }
}

function applyTeamColor(team, color) {
  var $accent = $("#team" + team + "Accent");
  var $logoCell = $("#team" + team + "ImageContainer");
  if (color == null || color == "") {
    $accent.css("background-color", "");
    $logoCell.css("background-color", "");
  } else {
    $accent.css("background-color", color);
    $logoCell.css("background-color", color);
  }
}

// Team-colored message layer (3 POINTER / TIMEOUT) over the given team's block.
function animation(messages, color, callback, params, team) {
  var i = 1;
  var $layer = $("#animationLayer");
  var $message = $("#animationMessage");
  var left = team == 2 ? LAYOUT.teamW + LAYOUT.clockW : 0;

  function animateNextMessage() {
    if (i >= messages.length) {
      $layer.delay(800).hide("slide", { direction: "down" }, SLIDE_MS, function () {
        if (callback != null) {
          callback.apply(null, params);
        }
      });
      return;
    }

    $message.delay(800).hide("slide", { direction: "down" }, SLIDE_MS, function () {
      resizeAndPositionToFit("animationMessage", messages[i], 26, 0, 0);
      $message.html(messages[i]);
      $message.show("slide", { direction: "up" }, SLIDE_MS, function () {
        i++;
        animateNextMessage();
      });
    });
  }

  resizeAndPositionToFit("animationMessage", messages[0], 26, 0, 0);
  $layer.css({ left: left + "px", "background-color": color || "#3a404a" });
  $message.html(messages[0]).show();
  $layer.show("slide", { direction: "down" }, SLIDE_MS, animateNextMessage);
}

function getScoreName(scoreDelta) {
  switch (scoreDelta) {
    case 3: {
      return "3 POINTER";
    }
    default: {
      return null;
    }
  }
}

function renderScore(team) {
  var score = team == 1 ? lastTeam1Score : lastTeam2Score;
  if (score == null || score < 0) {
    // nothing received yet
    return;
  }
  $("#team" + team + "Score")
    .toggleClass("three-digit", parseInt(score, 10) >= 100)
    .html(score);
}

//Used if score get over 100
function updateScoreSize() {
  renderScore(1);
  renderScore(2);
}

function pulseScore(team) {
  var $score = $("#team" + team + "Score");
  $score.addClass("pulse");
  setTimeout(function () {
    $score.removeClass("pulse");
  }, 180);
}

// "20:00" -> "20:00", "05:32" -> "5:32", "00:32" -> ":32", "00:09.5" -> ":09.5"
function formatGameTime(value) {
  var text = String(value);
  return text.replace(/^0+(?=\d)/, "").replace(/^0:/, ":");
}

// "0:24" -> "24", "0:05" -> "5", "24.0" -> "24", "0:04.7" -> "4.7", "30" -> "30"
function formatShotClock(value) {
  var text = String(value);
  var colon = text.lastIndexOf(":");
  if (colon >= 0) {
    text = text.substring(colon + 1);
  }
  text = text.replace(/\.0+$/, "");
  text = text.replace(/^0+(?=\d)/, "");
  return text;
}

//This runs to update the period numbers from 1 to 1st
function updatePeriod() {
  if (lastPeriod == null) {
    return;
  }

  var period = String(lastPeriod);
  var suffix = 'th';
  var preSuffix = period.slice(-2);

  if (preSuffix == 'OT' ||
      preSuffix == 'th' ||
      preSuffix == 'st' ||
      preSuffix == 'rd' ||
      preSuffix == 'nd' ||
      period == "HALF" ||
      period == "FINAL"
  ) {
      $('#period').html(period);
  } else {

      switch (period.substr(period.length - 1)) {
          case '1':
              suffix = 'st';
              if (period.substr(period.length - 2)[0] == '1' && period.length != 1) {
                  suffix = 'th';
                  break;
              }

              break;
          case '2':
              suffix = 'nd';
              if (period.substr(period.length - 2)[0] == '1') {
                  suffix = 'th';
                  break;
              }

              break;

          case '3':
              suffix = 'rd';
              if (period.substr(period.length - 2)[0] == '1') {
                  suffix = 'th';
                  break;
              }

              break;
          default:
              suffix = 'th'
              break;
      }


      if (period >= 5) {
          //Daktronics sends values 5 - 10 as OT
          $('#period').html('OT');
      } else {
          $('#period').html(period + suffix);
      }
  }

}

function updateColor() {
  var highlightColor;
  if (
    lastHighlightColorSelect == "custom" &&
    lastCustomHighlightColor != "" &&
    lastCustomHighlightColor != null
  ) {
    highlightColor = lastCustomHighlightColor;
  } else if (
    lastHighlightColorSelect == "home" &&
    lastTeam2Color != "" &&
    lastTeam2Color != null
  ) {
    highlightColor = lastTeam2Color;
  } else if (
    lastHighlightColorSelect == "away" &&
    lastTeam1Color != "" &&
    lastTeam1Color != null
  ) {
    highlightColor = lastTeam1Color;
  } else if (
    lastHighlightColorSelect == "global" &&
    lastGlobalNetworkColor != "" &&
    lastGlobalNetworkColor != null
  ) {
    highlightColor = lastGlobalNetworkColor;
  } else {
    highlightColor = "#282828";
  }

  $("#baseLine").css({ "background-image": "none", "background-color": highlightColor });
}

// ---------------------------------------------------------------------------
// Local data (configuration form)
// ---------------------------------------------------------------------------

var lastTeamNameSelect = "full";
var lastLeftColorLogoType = "custom";
var lastLeftCustomColor = null;
var lastLeftCustomLogo = null;
var lastRightColorLogoType = "custom";
var lastRightCustomColor = null;
var lastRightCustomLogo = null;
var lastPopupText = null;
var lastHighlightColorSelect = "custom";
var lastCustomHighlightColor = "#282828";
var lastGlobalNetworkColor = "#282828";
var lastShowPopup = false;
var lastShowLeft = false;
var lastShowRightColorLogo = false;
var lastShowPipClock = false;
function updateLocalData(data) {
  if (!firstDataReceived) {
    clearOverlayDefaults();
    firstDataReceived = true;
  }

  if (data["popup-text"] !== undefined) {
    var popupText = String(data["popup-text"] == null ? "" : data["popup-text"]).toUpperCase();
    if (popupText != lastPopupText) {
      lastPopupText = popupText;
      $("#popup-text").html(lastPopupText);
      updatePopup();
    }
  }

  if (data["popup-show"] !== undefined) {
    var showPopup = data["popup-show"];
    if (showPopup != lastShowPopup) {
      lastShowPopup = showPopup;
      popupShowHide();
    }
  }

  if (data["left-show"] !== undefined) {
    var showLeft = data["left-show"];
    if (showLeft != lastShowLeft) {
      lastShowLeft = showLeft;
      leftShowHide();
    }
  }

  var leftColorLogoUpdate = false;
  if (data["left-color-logo-select"] !== undefined) {
    var leftColorLogoType = data["left-color-logo-select"];
    if (leftColorLogoType != lastLeftColorLogoType) {
      lastLeftColorLogoType = leftColorLogoType;
      leftColorLogoUpdate = true;
    }
  }

  if (data["left-custom-color"] !== undefined) {
    var leftCustomColor = data["left-custom-color"];
    if (leftCustomColor != lastLeftCustomColor) {
      lastLeftCustomColor = leftCustomColor;
      leftColorLogoUpdate = true;
    }
  }

  if (data["left-custom-logo"] !== undefined) {
    var leftCustomLogo = data["left-custom-logo"];
    if (leftCustomLogo != lastLeftCustomLogo) {
      lastLeftCustomLogo = leftCustomLogo;
      leftColorLogoUpdate = true;
    }
  }

  if (leftColorLogoUpdate) {
    updateLeftColorLogo();
  }

  if (data["right-show"] !== undefined) {
    var showRightColorLogo = data["right-show"];
    if (showRightColorLogo != lastShowRightColorLogo) {
      lastShowRightColorLogo = showRightColorLogo;
      rightShowHide();
    }
  }

  var rightColorLogoUpdate = false;
  if (data["right-color-logo-select"] !== undefined) {
    var rightColorLogoType = data["right-color-logo-select"];
    if (rightColorLogoType != lastRightColorLogoType) {
      lastRightColorLogoType = rightColorLogoType;
      rightColorLogoUpdate = true;
    }
  }

  if (data["right-custom-color"] !== undefined) {
    var rightCustomColor = data["right-custom-color"];
    if (rightCustomColor != lastRightCustomColor) {
      lastRightCustomColor = rightCustomColor;
      rightColorLogoUpdate = true;
    }
  }

  if (data["right-custom-logo"] !== undefined) {
    var rightCustomLogo = data["right-custom-logo"];
    if (rightCustomLogo != lastRightCustomLogo) {
      lastRightCustomLogo = rightCustomLogo;
      rightColorLogoUpdate = true;
    }
  }

  if (rightColorLogoUpdate) {
    updateRightColorLogo();
  }

  var highlightUpdate = false;
  if (data["highlight-color-select"] !== undefined) {
    var highlightColorSelect = data["highlight-color-select"];
    if (highlightColorSelect != lastHighlightColorSelect) {
      lastHighlightColorSelect = highlightColorSelect;
      highlightUpdate = true;
    }
  }

  if (data["custom-highlight-color"] !== undefined) {
    var customHighlightColor = data["custom-highlight-color"];
    if (customHighlightColor != lastCustomHighlightColor) {
      lastCustomHighlightColor = customHighlightColor;
      highlightUpdate = true;
    }
  }

  if (highlightUpdate) {
    updateColor();
  }

  if (data["team-name-select"] !== undefined) {
    var teamNameSelect = data["team-name-select"];
    if (teamNameSelect != lastTeamNameSelect) {
      lastTeamNameSelect = teamNameSelect;
      updateTeamType();
    }
  }

  if (data["pip-clock-show"] !== undefined) {
    var showPipClock = data["pip-clock-show"];
    if (showPipClock != lastShowPipClock) {
      lastShowPipClock = showPipClock;
      clockShowHide();
    }
  }

  if (!firstLocalDataReceived) {
    firstLocalDataReceived = true;
    setTimeout(animateMe, 250);
  }
}

// ---------------------------------------------------------------------------
// Global data (Production Truck scoreboard / control panel)
// ---------------------------------------------------------------------------

//cache last string so we don't calculate font size for every scoreboard update
var lastGlobalNetworkColor = null;
var lastGlobalNetworkLogoSquare = null;
var lastGlobalNetworkLogoWide = null;
var lastTeam1Name = null;
var lastTeam2Name = null;
var lastTeam1Abbr = null;
var lastTeam2Abbr = null;
var lastTeam1Color = null;
var lastTeam2Color = null;
var lastTeam1Logo = null;
var lastTeam2Logo = null;
var lastTeam1Score = -7; //less than -6 to avoid animation on initialization
var lastTeam2Score = -7; //less than -6 to avoid animation on initialization
var lastTeam1Timeouts = 99; //greater than max to avoid animation on initialization
var lastTeam2Timeouts = 99; //greater than max to avoid animation on initialization
var lastPossArrow = null;
var lastTeam1BNS = "hide";
var lastTeam1DBNS = "hide";
var lastTeam2BNS = "hide";
var lastTeam2DBNS = "hide";
var lastPeriod = null;
var lastGameTime = null;
var lastHideClock = false;
var lastShowCpClock = false;
var lastShowShotClock = false;
var showShotClock = false;
var lastShotClock = null;
var lastShowNetwork = null;
var lastTeam1Fouls = null;
var lastTeam2Fouls = null;
var testData;
function updateGlobalData(data) {
  if (!firstDataReceived) {
    clearOverlayDefaults();
    firstDataReceived = true;
  }

  testData = data;

  // network control panel
  var colorLogoUpdate = false;
  if (data["global-network-color"] !== undefined) {
    var globalNetworkColor = data["global-network-color"]["value"];
    if (globalNetworkColor != lastGlobalNetworkColor) {
      lastGlobalNetworkColor = globalNetworkColor;
      colorLogoUpdate = true;
    }
  }

  if (data["saved_global-network-logo-square"] !== undefined) {
    var globalNetworkLogoSquare = setImageUrl(
      data["saved_global-network-logo-square"]["value"]
    );
    if (globalNetworkLogoSquare != lastGlobalNetworkLogoSquare) {
      lastGlobalNetworkLogoSquare = globalNetworkLogoSquare;
      colorLogoUpdate = true;
    }
  }

  if (data["saved_global-network-logo-wide"] !== undefined) {
    var globalNetworkLogoWide = setImageUrl(
      data["saved_global-network-logo-wide"]["value"]
    );
    if (globalNetworkLogoWide != lastGlobalNetworkLogoWide) {
      lastGlobalNetworkLogoWide = globalNetworkLogoWide;
      colorLogoUpdate = true;
    }
  }

  if (colorLogoUpdate) {
    updateLeftColorLogo();
    if (lastHighlightColorSelect == "global") {
      updateColor();
    }
  }

  var clockUpdate = false;
  if (data["period"] !== undefined) {
    var period = String(data["period"]["value"]);
    if (period == "half" || period == "final") {
      period = period.toUpperCase();
    }

    if (period != lastPeriod) {
      lastPeriod = period;
      $("#periodHidden").html(lastPeriod);

      // periods longer than 3 characters (HALF, FINAL, "End of 4th") replace the clock;
      // every overtime label (OT, 2 OT, 3 OT ...) keeps it
      if (period.slice(-2) != "OT") {
        var hideClock = period.length > 3;
        if (hideClock != lastHideClock) {
          lastHideClock = hideClock;
        }
      }

      clockUpdate = true;
    }
  }

  if (data["showhideClock"] !== undefined) {
    var showCpClock = data["showhideClock"]["checked"];
    if (showCpClock != lastShowCpClock) {
      lastShowCpClock = showCpClock;
      clockUpdate = true;
    }
  }

  if (clockUpdate) {
    clockShowHide();
    updatePeriod();
  }

  if (data["game-time"] !== undefined) {
    var gameTime = data["game-time"]["value"];
    if (gameTime != lastGameTime) {
      lastGameTime = gameTime;

      $("#gameTime").html(formatGameTime(lastGameTime));
    }
  }

  if (data["saved_team1-logo"] !== undefined) {
    var team1Logo = setImageUrl(data["saved_team1-logo"]["value"]);
    if (team1Logo != lastTeam1Logo) {
      lastTeam1Logo = team1Logo;

      if (lastTeam1Logo == null || lastTeam1Logo == "") {
        $("#team1Image").css("background-image", "").hide();
      } else {
        scaleAndApplyImage(lastTeam1Logo, 48, 48, "contain", "team1Image", true);
      }
    }
  }

  if (data["saved_team2-logo"] !== undefined) {
    var team2Logo = setImageUrl(data["saved_team2-logo"]["value"]);
    if (team2Logo != lastTeam2Logo) {
      lastTeam2Logo = team2Logo;

      if (lastTeam2Logo == null || lastTeam2Logo == "") {
        $("#team2Image").css("background-image", "").hide();
      } else {
        scaleAndApplyImage(lastTeam2Logo, 48, 48, "contain", "team2Image", true);
      }
    }
  }

  var teamAbbrUpdated = false;
  if (data["team1-abbr"] !== undefined) {
    var team1Abbr = String(data["team1-abbr"]["value"]).toUpperCase();
    if (team1Abbr != lastTeam1Abbr) {
      lastTeam1Abbr = team1Abbr;
      $("#team1Abbr").html(lastTeam1Abbr);
      teamAbbrUpdated = true;
    }
  }

  if (data["team2-abbr"] !== undefined) {
    var team2Abbr = String(data["team2-abbr"]["value"]).toUpperCase();
    if (team2Abbr != lastTeam2Abbr) {
      lastTeam2Abbr = team2Abbr;
      $("#team2Abbr").html(lastTeam2Abbr);
      teamAbbrUpdated = true;
    }
  }

  if (teamAbbrUpdated) {
    updateTeamAbbrs();
  }

  var teamNameUpdated = false;
  if (data["team1-name"] !== undefined) {
    var team1Name = String(data["team1-name"]["value"]).toUpperCase();
    if (team1Name != lastTeam1Name) {
      lastTeam1Name = team1Name;
      $("#team1Name").html(lastTeam1Name);
      teamNameUpdated = true;
    }
  }

  if (data["team2-name"] !== undefined) {
    var team2Name = String(data["team2-name"]["value"]).toUpperCase();
    if (team2Name != lastTeam2Name) {
      lastTeam2Name = team2Name;
      $("#team2Name").html(lastTeam2Name);
      teamNameUpdated = true;
    }
  }

  if (teamNameUpdated) {
    updateTeamNames();
  }

  if (data["team1-color"] !== undefined) {
    var awayColor = data["team1-color"]["value"];
    if (awayColor != lastTeam1Color) {
      lastTeam1Color = awayColor;
      applyTeamColor(1, lastTeam1Color);
      if (lastHighlightColorSelect == "away") {
        updateColor();
      }
    }
  }

  if (data["team2-color"] !== undefined) {
    var homeColor = data["team2-color"]["value"];
    if (homeColor != lastTeam2Color) {
      lastTeam2Color = homeColor;
      applyTeamColor(2, lastTeam2Color);
      if (lastHighlightColorSelect == "home") {
        updateColor();
      }
    }
  }

  if (data["team1-score"] !== undefined) {
    var team1Score = data["team1-score"]["value"];
    if (team1Score != lastTeam1Score) {
      var delta1 = team1Score - lastTeam1Score;
      var hadScore1 = lastTeam1Score >= 0;

      lastTeam1Score = team1Score;
      renderScore(1);

      if (hadScore1) {
        pulseScore(1);
      }

      var scoreName1 = getScoreName(delta1);
      if (scoreName1 != null) {
        animation([scoreName1, lastTeam1Name || lastTeam1Abbr || ""], lastTeam1Color, null, null, 1);
      }
    }
  }

  if (data["team2-score"] !== undefined) {
    var team2Score = data["team2-score"]["value"];
    if (team2Score != lastTeam2Score) {
      var delta2 = team2Score - lastTeam2Score;
      var hadScore2 = lastTeam2Score >= 0;

      lastTeam2Score = team2Score;
      renderScore(2);

      if (hadScore2) {
        pulseScore(2);
      }

      var scoreName2 = getScoreName(delta2);
      if (scoreName2 != null) {
        animation([scoreName2, lastTeam2Name || lastTeam2Abbr || ""], lastTeam2Color, null, null, 2);
      }
    }
  }

  if (data["team1-timeouts"] !== undefined) {
    var team1Timeouts = data["team1-timeouts"]["value"];
    if (team1Timeouts != lastTeam1Timeouts) {
      var timeoutDelta1 = lastTeam1Timeouts - team1Timeouts;

      lastTeam1Timeouts = team1Timeouts;

      if (timeoutDelta1 == 1) {
        animation(["TIMEOUT", lastTeam1Name || lastTeam1Abbr || ""], lastTeam1Color, updateTimeouts, [1, true], 1);
      } else {
        updateTimeouts(1, false);
      }
    }
  }

  if (data["team2-timeouts"] !== undefined) {
    var team2Timeouts = data["team2-timeouts"]["value"];
    if (team2Timeouts != lastTeam2Timeouts) {
      var timeoutDelta2 = lastTeam2Timeouts - team2Timeouts;

      lastTeam2Timeouts = team2Timeouts;

      if (timeoutDelta2 == 1) {
        animation(["TIMEOUT", lastTeam2Name || lastTeam2Abbr || ""], lastTeam2Color, updateTimeouts, [2, true], 2);
      } else {
        updateTimeouts(2, false);
      }
    }
  }

  if (data["team1-fouls"] !== undefined) {
    var team1Fouls = data["team1-fouls"]["value"];
    if (team1Fouls != lastTeam1Fouls) {
      lastTeam1Fouls = team1Fouls;
      updateFouls(1, lastTeam1Fouls);
    }
  }

  if (data["team2-fouls"] !== undefined) {
    var team2Fouls = data["team2-fouls"]["value"];
    if (team2Fouls != lastTeam2Fouls) {
      lastTeam2Fouls = team2Fouls;
      updateFouls(2, lastTeam2Fouls);
    }
  }

  if (data["possession-arrow"] !== undefined) {
    var possArrow = data["possession-arrow"]["value"];
    if (lastPossArrow != possArrow) {
      lastPossArrow = possArrow;
      updatePossessionArrow();
    }
  }

  var bonusUpdate = false;
  if (data["BNSvalue1"] !== undefined) {
    var team1Bonus = data["BNSvalue1"]["value"];
    if (lastTeam1BNS != team1Bonus) {
      lastTeam1BNS = team1Bonus;
      bonusUpdate = true;
    }
  }

  if (data["DBNSvalue1"] !== undefined) {
    var team1DoubleBonus = data["DBNSvalue1"]["value"];
    if (lastTeam1DBNS != team1DoubleBonus) {
      lastTeam1DBNS = team1DoubleBonus;
      bonusUpdate = true;
    }
  }

  if (data["BNSvalue2"] !== undefined) {
    var team2Bonus = data["BNSvalue2"]["value"];
    if (lastTeam2BNS != team2Bonus) {
      lastTeam2BNS = team2Bonus;
      bonusUpdate = true;
    }
  }

  if (data["DBNSvalue2"] !== undefined) {
    var team2DoubleBonus = data["DBNSvalue2"]["value"];
    if (lastTeam2DBNS != team2DoubleBonus) {
      lastTeam2DBNS = team2DoubleBonus;
      bonusUpdate = true;
    }
  }

  if (bonusUpdate) {
    updateTeamBonus();
  }

  var rightUpdate = false;
  if (data["showhideShotClock"] !== undefined) {
    showShotClock = data["showhideShotClock"]["checked"];
    if (showShotClock != lastShowShotClock) {
      lastShowShotClock = showShotClock;
      rightUpdate = true;
    }
  }

  if (rightUpdate) {
    clockShowHide();
  }

  if (data["shot-time"] !== undefined) {
    var shotClock = data["shot-time"]["value"];
    if (shotClock != lastShotClock) {
      lastShotClock = shotClock;
      $("#shotClock").html(formatShotClock(lastShotClock));
    }
  }
}
