import WebSocketManager from './js/socket.js';
import CanvasKeys from './js/canvas.js';
import {createChartConfig, createChartConfig2, toChartData, FAST_SMOOTH_TYPE_MULTIPLE_WIDTH, FAST_SMOOTH_TYPE_NO_SMOOTHING, fastSmooth, max} from "./js/graph.js";
import {hitJudgementsAdd, hitJudgementsClear, tapJudgement, cache, VALID_MODS, updateCache, updateCacheKeys, setText, setHTML, setStyle} from "./js/setups_functions.js";
import {getMapScores, getUserDataSet, getUserTop, postUserID, getModsScores, postCustomID, postDefaultID} from "./js/api_functions.js";

const socket = new WebSocketManager(window.location.host, {
  onOpen: () => {
    CrashReportDebug.classList.add('crashpop');
  },
  onClose: (errorCode) => {
    errorCode = errorCode !== "" ? errorCode : 'TOSU_PROCESS_NOT_FOUND';
    CrashReportDebug.classList.remove('crashpop');
    CrashReason.innerHTML =
      `<div>The tosu socket is currently closed (or has been crashed maybe due to overload)</div>
      <div>Relaunch the tosu! If this error still exist please contact to tosu developers!</div>
      <div>Except the overlay does this crash contact Shino Mimi.</div>
      <p></p>
      (Error Code: ${errorCode})`;
  }
});

const keyElems = ['k1', 'k2', 'm1', 'm2'].reduce((acc, key) => {
  acc[key] = {
    press: document.getElementById(`${key}Press`),
    count: document.getElementById(`${key}Count`),
    container: document.querySelector(`.keys.${key}`),
  };
  return acc;
}, {});

const keys = ['k1', 'k2', 'm1', 'm2'].reduce((acc, key) => {
  acc[key] = new CanvasKeys({ canvasID: key });
  return acc;
}, {});

const score = new CountUp('score', 0, 0, 0, .5, { useEasing: true, useGrouping: true, separator: " ", decimal: "." })
const acc = new CountUp('acc', 0, 0, 2, 1, { useEasing: true, useGrouping: true, separator: " ", decimal: ".", suffix: "%" })
const h100 = new CountUp('h100', 0, 0, 0, .5, { useEasing: true, useGrouping: true, separator: " ", decimal: ".", suffix: "x" })
const h50 = new CountUp('h50', 0, 0, 0, .5, { useEasing: true, useGrouping: true, separator: " ", decimal: ".", suffix: "x" })
const h0 = new CountUp('h0', 0, 0, 0, .5, { useEasing: true, useGrouping: true, separator: " ", decimal: ".", suffix: "x" })
const hSB = new CountUp('hSB', 0, 0, 0, .5, { useEasing: true, useGrouping: true, separator: " ", decimal: ".", suffix: "x" })

const chartConfigs = {
  darker: createChartConfig2('rgba(100, 100, 100, 0.2)'),
  lighter: createChartConfig('rgba(0, 0, 0, 1)'),
  darker2: createChartConfig2('rgba(100, 100, 100, 0.2)'),
  lighter2: createChartConfig('rgba(0, 0, 0, 1)'),
};
let charts = {};

function calculate_od(temp) {
    error_h300 = (79.5 - (6 * temp));
    error_h100 = (139.5 - (8 * temp));
    error_h50 = (199.5 - (10 * temp));
}

function getMaxPxValue(x) {
    if (x < 10) return 75;
    if (x >= 10 && x < 100) return 90;
    if (x >= 100 && x < 1000) return 100;
    if (x >= 1000 && x < 10000) return 125;
}

function getTranslateValue(x) {
    if (x < 10) return 16;
    if (x >= 10 && x < 100) return 40;
    if (x >= 100 && x < 1000) return 60;
    if (x >= 1000 && x < 10000) return 95;
}

const spaceit = (text) => text.toLocaleString().replace(/,/g, ' ');

const getLbcpLineTransform = (direction, height = 40) => {
  const y = direction === 'down'
    ? 15 - (height - 40)
    : 15;

  return `translateY(${y}px)`;
};

const setProgressTransforms = (px) => {
  setStyle(progress, 'width', `${px}px`);
  ['progress100', 'progress50', 'progress0', 'progressSB', 'progresskatu'].forEach(id => {
    const node = typeof id === 'string' ? globalThis[id] : id;
    setStyle(node, 'transform', `translateX(${px}px)`);
  });
};

const formatNumber = n => {
    if (n < 1e3) return n;
    if (n >= 1e3 && n < 1e6) return +(n / 1e3).toFixed(1) + "K";
    if (n >= 1e6 && n < 1e9) return +(n / 1e6).toFixed(1) + "M";
    if (n >= 1e9 && n < 1e12) return +(n / 1e9).toFixed(1) + "B";
    if (n >= 1e12) return +(n / 1e12).toFixed(1) + "T";
  };

function renderGraph(graphData, chartType) {
  const chart = charts[chartType];
  if (!chart) return;

  const isSpeed = chartType === 'darker' || chartType === 'darker2';
  const data = new Float32Array(graphData.xaxis.length);
  const channel = isSpeed ? 'speed' : 'aim';

  for (const series of graphData.series) {
    if (series.name !== channel) continue;
    for (let i = 0; i < data.length && i < series.data.length; i++) {
      data[i] = series.data[i];
    }
  }

  const percent = max(data) / 100;
  let drainSamples = 0;
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.max(0, data[i]);
    if (data[i] > percent) drainSamples++;
  }

  const windowWidth = 0.00609 * drainSamples + 0.88911;
  const smoothness = Math.max(FAST_SMOOTH_TYPE_NO_SMOOTHING, Math.min(graphSmoothing, FAST_SMOOTH_TYPE_MULTIPLE_WIDTH));
  const smoothedData = toChartData(fastSmooth(data, windowWidth, smoothness));

  const config = chartConfigs[chartType];
  config.data.datasets[0].data = smoothedData;
  config.data.labels = smoothedData;
  chart.update();
}

const applyInterfaceVisibility = (isVisible) => {
  const opacity = isVisible ? '1' : '0';
  setStyle(gptop, 'opacity', opacity);
};

let progressbar, rankingPanelSet, tickPos, tempAvg, tempSmooth, currentErrorValue, tempHitErrorArrayLength, error_h300, error_h100, error_h50, odwarping;
let leaderboardFetch, leaderboardLocalSet, tempSlotLength, tempMapScores = [], playerPosition = 1, LocalNameData, LocalResultNameData;
let linetimeout = null;
let lbcpLineDir = null;
let lbcpLineHeight = 40;
let graphSmoothing = 0; 
let OD = 0;

window.onload = () => {
  ['darker', 'lighter', 'darker2', 'lighter2'].forEach(type => {
    charts[type] = new Chart(document.querySelector(`.${type}`).getContext('2d'), chartConfigs[type]);
  });
};

socket.sendCommand('getSettings', encodeURI(window.COUNTER_PATH));
socket.commands((data) => {
    try {
      const { command, message } = data;
      if (command === 'getSettings') {
        console.log(command, message);
      }

      updateCacheKeys(
        [
          'ColorSet',
          'CustomIDColor',
          'gamerlocal',
          'CustomIDSet',
          'HueID',
          'HueID2',
          'SaturationID',
          'SaturationID2',
          'LocalName',
          'GBrank',
          'ppGB',
          'CTrank',
          'CTcode',
          'mapid0', 'mapid1', 'mapid2', 'mapid3', 'mapid4', 'mapid5',
          'ppResult0', 'ppResult1', 'ppResult2', 'ppResult3', 'ppResult4', 'ppResult5',
          'modsid0', 'modsid1', 'modsid2', 'modsid3', 'modsid4', 'modsid5',
          'rankResult0', 'rankResult1', 'rankResult2', 'rankResult3', 'rankResult4', 'rankResult5',
          'date0', 'date1', 'date2', 'date3', 'date4', 'date5'
        ],
        message
      );

      updateCache('StreamerModeEnabled', message.StreamerModeEnabled, (enabled) => {setStyle(resultRecorder, 'opacity', enabled ? '0' : '1'); setStyle(recorderContainer, 'display', enabled ? 'none' : 'block')});
      updateCache('HideGameStatus', message.HideGameStatus, (enabled) => {setStyle(GameStatusOverlay, 'opacity', enabled ? '0' : '1')});
      updateCache('LBEnabled', message.LBEnabled, (enabled) => {setStyle(leaderboardP, 'display', enabled ? 'block' : 'none')});
      updateCache('HidePanel', message.HidePanel);
      updateCache('HideBottom', message.HideBottom, (hidden) => {setStyle(gpbottom, 'display', hidden ? 'none' : 'flex')});
      updateCache('LBOptions', message.LBOptions, LBReset);
      updateCache('OverridePlayerID', message.OverridePlayerID);
      updateCache('HideKeys', message.HideKeys, (hidden) => {
        setStyle(KeyOverlayCont, 'display', hidden ? 'none' : 'block');
        setStyle(mapBG, 'opacity', hidden ? '0' : '1');
      });
      
      updateCache('HideGraphStats', message.HideGraphStats, (hidden) => {
        const visibility = hidden ? '0' : '1';
        setStyle(smallStats, 'opacity', visibility);
        setStyle(judgeInfo, 'opacity', visibility);
      });

      updateCache('Recorder', message.Recorder, (recorder) => {
        const recorderValue = recorder ?? 'You!';
        setText(document.getElementById("recorderName"), recorderValue);
        setText(document.getElementById("resultRecorder"), `Recorder: ${recorderValue}`);
      });
    } catch (error) {
      console.log(error);
    }
  });

const slots = document.getElementById('slots');
const CAPACITY = 28;
const VISIBLE = 12;
const history = new Array(CAPACITY).fill('');
let writePos = 0;

for (let i = 0; i < CAPACITY; i++) {
  const div = document.createElement('div');
  div.className = 'slot hidden';
  slots.appendChild(div);
}

function pushJudgement(type = '300') {
  const allowed = ['300', '100', '50', 'miss', '300g', '100k'];
  if (!allowed.includes(String(type))) return;
  history[writePos] = String(type);
  writePos = (writePos + 1) % CAPACITY;
  renderSlots();
}

function clearSlots() {
  history.fill('');
  writePos = 0;
  for (let i = 0; i < CAPACITY; i++) {
    const el = slots.children[i];
    if (!el) continue;
    el.dataset.judgement = '';
    el.className = 'slot hidden';
    el.style.opacity = 0;
    el.classList.remove('hot');
  }
}

function renderSlots() {
  for (let i = 0; i < CAPACITY; i++) {
    const el = slots.children[i];
    const val = history[i];
    if (!val) {
      el.dataset.judgement = '';
      el.className = 'slot hidden';
      continue;
    }
    const distance = (writePos - 1 - i + CAPACITY) % CAPACITY;
    el.dataset.judgement = val;
    if (distance < VISIBLE) {
      el.className = 'slot show';
      el.style.opacity = 1 - (distance / VISIBLE);
      if (distance === 0) {
        el.classList.add('hot');
        setTimeout(() => el.classList.remove('hot'), 140);
      }
    } else {
      el.className = 'slot hidden';
      el.style.opacity = 0;
    }
  }
}
  
  socket.api_v2(({ state, settings, performance, resultsScreen, play, beatmap, folders, files, directPath, client, leaderboard, server, profile, game }) => {
    try {      

        updateCache('client', client, (val) => {
          setStyle(mapBG, 'display', val === "lazer" ? `none` : `block`);
          setHTML(k1Name, val === "lazer" ? `B1` : `K1`);
          setHTML(k2Name, val === "lazer" ? `B2` : `K2`);
          setHTML(m1Name, val === "lazer" ? `B3` : `M1`);
          setHTML(m2Name, val === "lazer" ? `B4` : `M2`);
        });

        updateCache('paused', game.paused, (paused) => {setStyle(PlayPaused, 'opacity', (paused && state.number == 2 && !play.failed) && !cache["HideGameStatus"] ? `1` : `0`)});
        updateCache('focused', game.focused, (focused) => {setStyle(PlayFocused, 'opacity', !focused && (state.number == 2 || state.number == 7 || game.paused && state.number == 2 || state.number == 0 || state.number == 22) && !cache["HideGameStatus"] ? `0` : `1`)});
        updateCache('play.failed', play.failed, (failed) => {
          if (failed && state.number === 2 && !cache["HideGameStatus"]) setStyle(PlayFailed, 'opacity', 1);
          else setStyle(PlayFailed, 'opacity', 0);
        });

        updateCache('profile.id', profile.id);
        updateCache('profile.name', profile.name);
        updateCache('profile.pp', profile.pp);
        updateCache('profile.globalRank', profile.globalRank);
        updateCache('profile.countryCode.name', profile.countryCode.name);
        updateCache('server', server, (srv) => {setText(devserver, srv === `ppy.sh` ? `Current Server: Official` : `Current Server: ${srv}`)});
        updateCache('showInterface', settings.interfaceVisible);
        updateCache('data.menu.state', state.number, () => {
            const StateCheck = state.number === 0 || state.number === 22 ? 'remove' : 'add';
            DevInformation.classList[StateCheck]('crashpop');
        });

        updateCache('profile.mode', profile.mode.name);
        updateCache('mode', play.mode.name, (mode) => {setStyle(global, 'backgroundImage', `url(./static/Mode/${mode}.png)`)});
        updateCache('hp.normal', play.healthBar.normal, (hp) => {setStyle(hpBar, 'clipPath', play.healthBar.normal > 0 ? `polygon(${(1 - play.healthBar.normal / 100) * 50}% 0%, ${(play.healthBar.normal / 100) * 50 + 50}% 0%, ${(play.healthBar.normal / 100) * 50 + 50}% 100%, ${(1 - play.healthBar.normal / 100) * 50}% 100%)` : `polygon(0 0, 93.7% 0, 93.7% 100%, 0 100%)`)});
        updateCache('play.name', play.playerName, (name) => {
            LocalNameData = cache['LocalName'] !== "" && cache['LocalName'] !== undefined ? cache['LocalName'] : cache['profile.name'];
            const displayName = name !== "" ? name : LocalNameData;
            setText(username, displayName);
            setText(lbcpName, displayName);
            setupUser(cache["OverridePlayerID"] !== "" && cache["OverridePlayerID"] !== undefined ? cache["OverridePlayerID"] : displayName);
        });

        updateCache('play.rank.current', play.rank.current, (rank) => {
            setText(lbcpRanking, rank.replace("H", ""));
            lbcpRanking.setAttribute('class', `${rank} lb_Rank`);
        });

        updateCache('play.accuracy', play.accuracy, (accVal) => {
            setText(lbcpAcc, accVal.toFixed(2) + `%`);
            setText(acc, accVal);
            acc.update(accVal)
        });

        updateCache('play.score', play.score, (scoreVal) => {
            tempAvg = 0;
            setText(lbcpScore, formatNumber(scoreVal));
            setText(score, scoreVal);
            score.update(scoreVal);
        });

        const refreshCombo = () => {
            setText(combo_count, play.combo.current);
            setText(lbcpCombo, `${spaceit(play.combo.max)}x`);
            setText(combo_max, ` / ${play.combo.max}x`);

            const isBreak = play.combo.current < play.combo.max;
            const translateCurrent = getTranslateValue(play.combo.current);
            const maxPx = getMaxPxValue(play.combo.max);

            setStyle(combo_text2, 'transform', `translateX(-${translateCurrent + (isBreak ? 18 : 0)}px)`);
            setStyle(combo_text, 'transform', isBreak ? `translateX(-${maxPx - 20}px)` : `translateX(0)`);
            setStyle(combo_max, 'opacity', isBreak ? 1 : 0);
            setStyle(combo_x, 'display', isBreak ? 'none' : 'inline');

            let widthBase = 84;
            if (play.combo.current >= 10 && play.combo.current < 100) widthBase = 104;
            else if (play.combo.current >= 100 && play.combo.current < 1000) widthBase = 124;
            else if (play.combo.current >= 1000 && play.combo.current < 10000) widthBase = 159;
            else if (play.combo.current >= 10000) widthBase = 179;

            setStyle(combo_box, 'width', `${widthBase + (isBreak ? maxPx : 0)}px`);
        };
        updateCache('play.combo.current', play.combo.current, refreshCombo);
        updateCache('play.combo.max', play.combo.max, refreshCombo);

        const refreshPP = () => {
            const currentPP = Math.round(play.pp.current);
            const fcPP = Math.round(play.pp.fc);

            setText(lbcpPP, `${spaceit(currentPP)}pp`);
            setText(pp_txt, currentPP);
            setText(ppfc_txt, ` / ${fcPP}pp`);

            const pp_tx = `${currentPP} / ${fcPP}pp`;
            const len = pp_tx.length;
            const widthMap = {7:155, 8:165, 9:195, 10:215, 11:235, 12:265, 13:295};
            const baseWidth = widthMap[len] ?? pp_box.clientWidth;
            setStyle(pp_box, 'width', `${baseWidth}px`);

            let txtWidth = "25px";
            if (currentPP >= 10 && currentPP < 100) txtWidth = "48px";
            else if (currentPP >= 100 && currentPP < 1000) txtWidth = "72px";
            else if (currentPP >= 1000 && currentPP < 10000) txtWidth = "105px";
            else if (currentPP >= 10000) txtWidth = "125px";
            setStyle(pp_txt, 'width', txtWidth);
        };
        updateCache('play.pp.current', play.pp.current, refreshPP);
        updateCache('play.pp.fc', play.pp.fc, refreshPP);

        updateCache('unstableRate', play.unstableRate, (ur) => {setText(URIndex, Math.round(ur))});

        updateCache('beatmap_rankedStatus', beatmap.status.number, (status) => {
            switch (status) {
                case 4:
                    setStyle(rankStatus, 'backgroundImage', `url('./static/state/ranked.png')`);
                    break;
                case 7:
                    setStyle(rankStatus, 'backgroundImage', `url('./static/state/loved.png')`);
                    break;
                case 5:
                case 6:
                    setStyle(rankStatus, 'backgroundImage', `url('./static/state/qualified.png')`);
                    break;
                default:
                    setStyle(rankStatus, 'backgroundImage', `url('./static/state/unranked.png')`);
                    break;
            };
        });

        if (performance?.graph && (charts.darker || charts.lighter)) {
            const dataString = JSON.stringify(performance.graph);
            updateCache('difficultyGraph', dataString, () => {
                renderGraph(performance.graph, 'lighter');
                renderGraph(performance.graph, 'darker');
                renderGraph(performance.graph, 'lighter2');
                renderGraph(performance.graph, 'darker2');
            });
        };

        updateCache('play.mods.name', play.mods.name, (mods) => {
            setHTML(document.getElementById("lbcpMods"), " ");
            let modsCount = mods.length;

            for (let i = 0; i < modsCount; i++) {
                let modName = mods.substring(i, i + 2);
                if (modName !== " ") {
                    let modslb = document.createElement("div");
                    modslb.id = modName;
                    modslb.setAttribute("class", `modslb ${modName}`);
                    if (VALID_MODS.has(modName)) {
                      setStyle(modslb, 'backgroundImage', `url('./static/Mods/${modName}.png')`);
                    }
                    document.getElementById("lbcpMods").appendChild(modslb);
                    i++;
                }
            }
        });

        updateCache('beatmap.stats.ar.converted', beatmap.stats.ar.converted, (val) => {setText(ARText, val.toFixed(2))});
        updateCache('beatmap.stats.cs.converted', beatmap.stats.cs.converted, (val) => {setText(CSText, val.toFixed(2))});
        updateCache('beatmap.stats.od.converted', beatmap.stats.od.converted, (val) => {
          setText(ODText, val.toFixed(2)); 
          OD = beatmap.stats.od.converted;
          if (cache['play.mods.name'].includes("DT") || cache['play.mods.name'].includes("NC")) OD = 500 / 333 * beatmap.stats.od.converted + (-2210) / 333;
          if (cache['play.mods.name'].includes("HT")) OD = 500 / 667 * beatmap.stats.od.converted + (-2210) / 667;

          calculate_od(OD, cache['mode']);

          setStyle(URbar, 'width', `${(error_h50 * 3.5) + 40}px`);
          setStyle(l50, 'width', `${error_h50 * 3.5}px`);
          setStyle(l100, 'width', `${error_h100 * 3.5}px`);
          setStyle(l300, 'width', `${error_h300 * 3.5}px`);
        });

        updateCache('beatmap.stats.hp.converted', beatmap.stats.hp.converted, (val) => {setText(HPText, val.toFixed(2))});

        if (updateCache('stars.live', beatmap.stats.stars.live) | updateCache('stars.total', beatmap.stats.stars.total)) {
            setText(starsCurrent, beatmap.stats.stars.live);
            setHTML(starRating, `${beatmap.stats.stars.total} <i class="fas fa-star" style='color: #faffa0ff;'></i>`);
        };

        updateCache('beatmap.stats.bpm.common', beatmap.stats.bpm.common, (val) => setText(StatsBPM, Math.round(val) + 'BPM'));
        updateCache('beatmap.stats.maxCombo', beatmap.stats.maxCombo);
        updateCache('beatmap.artist', beatmap.artist, (artist) => setText(Artist, `by ${artist}`));
        updateCache('beatmap.title', beatmap.title, (title) => setText(Song, title));
        updateCache('beatmap.mapper', beatmap.mapper, (mapper) => setText(Mapper, `Mapped by ${mapper}`));
        updateCache('beatmap.time.live', beatmap.time.live);
        updateCache('beatmap.version', beatmap.version);
        updateCache('beatmap.time.firstObject', beatmap.time.firstObject);
        updateCache('beatmap.time.lastObject', beatmap.time.lastObject);
        updateCache('beatmap.time.mp3Length', beatmap.time.mp3Length);
        updateCache('beatmap.id', beatmap.id);

        const updateHit = (key, value, elements) => {
            cache[key] = value;
            elements.counter.update(value);
            setText(elements.text, `${value}x`);
            tapJudgement(elements.tapKey);
            hitJudgementsAdd(elements.tapKey, progressbar);
            if (value > 0) {
                setStyle(elements.graph, 'height', '14px');
                elements.extra?.(true, value);
            } else {
                setStyle(elements.graph, 'height', '0px');
                hitJudgementsClear(elements.tapKey);
                elements.extra?.(false, value);
            };
        };

        updateCache('h100', play.hits['100'], (val) =>
            updateHit('h100', val, {
                counter: h100,
                text: h100Text,
                graph: graph100,
                tapKey: '100',
            }));

        updateCache('h50', play.hits['50'], (val) =>
            updateHit('h50', val, {
                counter: h50,
                text: h50Text,
                graph: graph50,
                tapKey: '50',
            }));
    
        const refreshH0 = (val) =>
            updateHit('h0', val, {
                counter: h0,
                text: h0Text,
                graph: graph0,
                tapKey: '0',
                extra: (has, value) => {
                    setHTML(lbcpMiss, value);
                    setStyle(lbcpMiss, 'display', has ? 'block' : 'none');
                }});
        updateCache('h0', play.hits['0'], refreshH0);
  
        const refreshSB = (val) =>
            updateHit('hSB', val, {
                counter: hSB,
                text: hSBText,
                graph: graphSB,
                tapKey: 'SB',
                extra: (has, value) => {
                    setHTML(rSB, value);
                    setStyle(rSB, 'display', has ? 'block' : 'none');
                    setStyle(JudgeSB, 'display', has ? 'block' : 'none');
                }});
        updateCache('hSB', play.hits.sliderBreaks, refreshSB);

        updateCache('resultsScreen.hits[100]', resultsScreen.hits[100], (v) => setText(r100, v));
        updateCache('resultsScreen.hits[50]', resultsScreen.hits[50], (v) => setText(r50, v));
        updateCache('resultsScreen.hits[0]', resultsScreen.hits[0], (v) => setText(r0, v));

        updateCache('resultsScreen.name', resultsScreen.name, (name) => {
            LocalResultNameData = cache['LocalName'] !== "" && cache['LocalName'] !== undefined ? cache['LocalName'] : cache['profile.name'];
            const display = name !== "" ? name : LocalResultNameData;
            setText(PlayerName, display);
        });

        updateCache('resultsScreen.scoreId', resultsScreen.scoreId);
        updateCache('resultsScreen.createdAt', resultsScreen.createdAt, (val) => {setHTML(createdAt, `Played: ` + jQuery.timeago(val))});

        updateCache('resultsScreen.mode.name', resultsScreen.mode.name, (mode) => {
            const hide = mode === 'mania' || mode === 'taiko';
            setStyle(CS, 'display', hide ? 'none' : 'flex');
            setStyle(AR, 'display', hide ? 'none' : 'flex');
        });

        updateCache('resultsScreen.mods.name', resultsScreen.mods.name, (modsName) => {
            const modContainer = document.getElementById("modContainer");
            setHTML(modContainer, " ");

            const modsUpper2 = modsName.toUpperCase();
            const modsCount2 = modsUpper2.length;
            for (let i = 0; i < modsCount2; i++) {
                const modName = modsUpper2.substring(i, i + 2);
                if (modName !== " ") {
                    let mods = document.createElement("div");
                    mods.id = modName;
                    mods.setAttribute("class", `mods ${modName}`);
                    if (VALID_MODS.has(modName)) {
                      setStyle(mods, 'backgroundImage', `url('./static/Mods/${modName}.png')`);
                    }
                    modContainer.appendChild(mods);
                    i++
                };
            };
        });
        updateCache('resultsScreen.mods.number', resultsScreen.mods.number);
        updateCache('resultsScreen.accuracy', resultsScreen.accuracy, (val) => setText(PlayerAcc, `${val.toFixed(2)}%`));
        updateCache('resultsScreen.maxCombo', resultsScreen.maxCombo, (val) => {setText(PlayerMaxCombo, `${val} / ${cache['beatmap.stats.maxCombo']}x`);});
        updateCache('resultsScreen.score', resultsScreen.score, (val) => setText(PlayerScore, spaceit(val)));
        updateCache('resultsScreen.rank', resultsScreen.rank, (rank) => {
            setText(rankingResult, rank.replace("H", ""));
            rankingResult.setAttribute('class', `${rank}`);
        });

        updateCache('resultsScreen.pp.fc', resultsScreen.pp.fc, (val) => {
            setText(PPResultIfFC, `| FC: ${Math.round(val)}pp`);
            setStyle(PPResultIfFC, 'display', resultsScreen.hits[0] == 0 && play.hits.sliderBreaks == 0 ? 'none' : 'block');
        });

        updateCache('resultsScreen.pp.current', resultsScreen.pp.current, (val) => {setText(PPResult, `${Math.round(val)}pp`)});
        updateCache('folders.beatmap', folders.beatmap);
        updateCache('files.beatmap', files.beatmap);
        updateCache('files.background', files.background);
        updateCache('beatmap.stats.bpm.realtime', beatmap.stats.bpm.realtime, (val) => {
            setStyle(bpmflash, 'opacity', 0);
            setText(BPMlive, val)
            setTimeout(function() {
                setStyle(bpmflash, 'opacity', 1);
            }, 200);
        });

        updateCache('menu.bm.path.full', directPath.beatmapBackground, (path) => {
            const background_path = path.replace(folders.songs, '');
        
            const background = document.getElementById('rankingPanelBG');
            const background2 = document.getElementById('RBG');
  
            setTimeout(() => {
              background.src = `http://127.0.0.1:24050/files/beatmap/${background_path}`;
              background2.src = `http://127.0.0.1:24050/files/beatmap/${background_path}`;
            }, 200);
        
            const image = new Image();
            image.src = `http://127.0.0.1:24050/files/beatmap/${background_path}`;
          });

        const cachedim = settings.background.dim / 100;
        const encodePath = (str) => str.replace(/#/g, "%23").replace(/%/g, "%25").replace(/\\/g, "/").replace(/'/g, "%27").replace(/ /g, "%20");
        const folderEncoded = cache['folders.beatmap'] ? encodePath(cache['folders.beatmap']) : '';
        const imgEncoded = cache['files.background'] ? encodePath(cache['files.background']) : '';

        if (folderEncoded && imgEncoded) {
            setStyle(mapBG, 'backgroundImage', `linear-gradient(rgba(0, 0, 0, ${cachedim}), rgba(0, 0, 0, ${cachedim})), url("http://127.0.0.1:24050/files/beatmap/${folderEncoded}/${imgEncoded}")`);
        }

        if (cache['data.menu.state'] !== 2) {
          if (cache['data.menu.state'] !== 7) deRankingPanel()
          setStyle(gptop, 'opacity', 0);
          setStyle(URCont, 'opacity', 0);
          setStyle(avgHitError, 'transform', "translateX(0)");
          setStyle(gpbottom, 'opacity', 0);
        } else {
            deRankingPanel()
            setStyle(gptop, 'opacity', 1);
            setStyle(gpbottom, 'opacity', 1);
            setStyle(URCont, 'opacity', 1);
        };

        if (cache['data.menu.state'] === 7) {
            if (cache[`key-k1-r`]) document.querySelector(`.keys.k1`).classList.remove('hidden');
            if (cache[`key-k2-r`]) document.querySelector(`.keys.k2`).classList.remove('hidden');
            if (cache[`key-m1-r`]) document.querySelector(`.keys.m1`).classList.remove('hidden');
            if (cache[`key-m2-r`]) document.querySelector(`.keys.m2`).classList.remove('hidden');
        };
      
        if (cache['data.menu.state'] !== 2 && cache['data.menu.state'] !== 7) {
          LBReset();
          setStyle(leaderboardP, 'opacity', 0);
          setHTML(lbcpPosition, "");
          setStyle(currentplayerCont, 'transform', `none`);
          lbcpLineHeight = 40;
          lbcpLineDir = null;
          setStyle(lbcpLine, 'height', `40px`);
          setStyle(lbcpLine, 'transform', getLbcpLineTransform('up'));

          delete cache[`key-k1-active`];
          delete cache[`key-k2-active`];
          delete cache[`key-m1-active`];
          delete cache[`key-m2-active`];
    
          document.querySelector(`.keys.k1`).classList.add('hidden');
          document.querySelector(`.keys.k2`).classList.add('hidden');
          document.querySelector(`.keys.m1`).classList.add('hidden');
          document.querySelector(`.keys.m2`).classList.add('hidden');
        };
        
        if (cache['data.menu.state'] === 2) {
            applyInterfaceVisibility(!cache['showInterface']);

            if (cache['LBEnabled']) {
              if (cache['LBOptions'] === "Selected Mods" || cache['LBOptions'] === "Global") { setupMapScores(cache['beatmap.id']) }
              else if (cache['LBOptions'] === "Local" && leaderboard && leaderboard.length !== 0) { setupLocalScores() };
            } else { LBReset() };

            if (cache['LBEnabled']) {
                setHTML(lbcpPosition, `${playerPosition}`);
                setStyle(leaderboardP, 'opacity', 1);
            } else {
                setHTML(lbcpPosition, `0`);
                setStyle(leaderboardP, 'opacity', 0);
            };

            if (currentplayerCont)
                lbcpPosition.setAttribute('class', `positions N${playerPosition}`);
            
                if (playerPosition >= 8) {
                  setStyle(lbopCont, 'transform', `translateY(${-(playerPosition * 65)}px)`);
                  setStyle(currentplayerCont, 'transform', `none`);
                } else {
                  setStyle(lbopCont, 'transform', `translateY(-520px)`);
                  setStyle(currentplayerCont, 'transform', `translateY(${(playerPosition - 8) * 65}px)`);
                };

            if (tempSlotLength > 0)
                for (let i = 8; i <= tempSlotLength; i++) {
                    if (i >= playerPosition && playerPosition !== 0) {
                        setStyle(document.getElementById(`playerslot${i}`), 'transform', `translateY(65px)`);
                        setStyle(document.getElementById(`playerslot${i}`), 'opacity', `0`);
                    }
                    else if (i <= playerPosition && playerPosition !== 0) {
                        setStyle(document.getElementById(`playerslot${i}`), 'transform', `translateY(0)`);
                        setStyle(document.getElementById(`playerslot${i}`), 'opacity', `1`);
                    };
                };
                for (let i = 1; i <= tempSlotLength; i++) {
                    if (i >= playerPosition && playerPosition !== 0) {
                        setStyle(document.getElementById(`playerslot${i}`), 'transform', `translateY(65px)`);
                        setText(document.getElementById(`lb_Positions_slot${i}`), `${i + 1}`);
                        document.getElementById(`lb_Positions_slot${i}`).setAttribute('class', `positions N${i + 1}`);
                    } else if (i < playerPosition && playerPosition !== 0) {
                        setStyle(document.getElementById(`playerslot${i}`), 'transform', `translateY(0)`);
                        setText(document.getElementById(`lb_Positions_slot${i}`), `${i}`);
                        document.getElementById(`lb_Positions_slot${i}`).setAttribute('class', `positions N${i}`);
                    };
                };
        };

        setStyle(strainGraph, 'transform', cache['h100'] > 0 || cache['h50'] > 0 || cache['h0'] > 0 || cache['katu'] > 0 && cache['mode'] === `mania` ? `translateY(-10px)` : `translateY(0px)`);

        if (cache['beatmap.time.mp3Length'] && cache['beatmap.time.mp3Length'] > 0) {
            progressbar = (cache['beatmap.time.live'] / cache['beatmap.time.mp3Length']) * 380;
            setProgressTransforms(progressbar);
        }

        if (cache['beatmap.time.live'] >= cache['beatmap.time.firstObject'] + 5000 && cache['beatmap.time.live'] <= cache['beatmap.time.firstObject'] + 11900 && cache['data.menu.state'] === 2 && !cache['StreamerModeEnabled']) {
            setStyle(recorderContainer, 'transform', 'scale(100%)');
            setStyle(recorderContainer, 'opacity', '1');
        } else {
            setStyle(recorderContainer, 'transform', 'scale(80%)');
            setStyle(recorderContainer, 'opacity', '0');
        };

        if (cache['beatmap.time.live'] > beatmap.time.live) {
          delete cache['key-k1-press'];
          delete cache['key-k1-count'];
          delete cache['key-k1-active'];
          delete cache['key-k1-r'];
          keys['k1'].bpmArray.length = 0;
      
          delete cache['key-k2-press'];
          delete cache['key-k2-count'];
          delete cache['key-k2-active'];
          delete cache['key-k2-r'];
          keys['k2'].bpmArray.length = 0;
      
          delete cache['key-m1-press'];
          delete cache['key-m1-count'];
          delete cache['key-m1-active'];
          delete cache['key-m1-r'];
          keys['m1'].bpmArray.length = 0;
      
          delete cache['key-m2-press'];
          delete cache['key-m2-count'];
          delete cache['key-m2-active'];
          delete cache['key-m2-r'];
          keys['m2'].bpmArray.length = 0;
        }
        
        if (tempMapScores.length > 0) {
            if (cache['play.score'] >= tempMapScores[playerPosition - 2]) {
              playerPosition--
              if (playerPosition < 8) {
              lbcpLineHeight += 64;
              lbcpLineDir = 'up';
              setStyle(lbcpLine, 'transition', `350ms ease`);
              setStyle(lbcpLine, 'height', `${lbcpLineHeight}px`);
              setStyle(lbcpLine, 'transform', getLbcpLineTransform(lbcpLineDir, lbcpLineHeight));
              if (linetimeout) clearTimeout(linetimeout)
                linetimeout = setTimeout(() => {
                  setStyle(lbcpLine, 'transition', `200ms ease`);
                  lbcpLineHeight = 40;
                  setStyle(lbcpLine, 'height', `40px`);
                  setStyle(lbcpLine, 'transform', getLbcpLineTransform(lbcpLineDir));
                }, 400);
              }
            }
            else if (cache['play.score'] < tempMapScores[playerPosition - 1]) {
              playerPosition++
              if (playerPosition < 8) {
              lbcpLineHeight += 64;
              lbcpLineDir = 'down';
              setStyle(lbcpLine, 'transition', `350ms ease`);
              setStyle(lbcpLine, 'height', `${lbcpLineHeight}px`);
              setStyle(lbcpLine, 'transform', getLbcpLineTransform(lbcpLineDir, lbcpLineHeight));
              if (linetimeout) clearTimeout(linetimeout)
                linetimeout = setTimeout(() => {
                  setStyle(lbcpLine, 'transition', `200ms ease`);
                  lbcpLineHeight = 40;
                  setStyle(lbcpLine, 'height', `40px`);
                  setStyle(lbcpLine, 'transform', getLbcpLineTransform(lbcpLineDir));
                }, 400);
              }
            }
        }

        const shouldShow = ((cache['data.menu.state'] === 2 && cache['beatmap.time.live'] >= cache['beatmap.time.lastObject'] + 1000) || cache['data.menu.state'] === 7) && !cache['HidePanel'];
        const shouldHide = !((cache['data.menu.state'] === 2 && cache['beatmap.time.live'] >= cache['beatmap.time.lastObject'] - 500) || cache['data.menu.state'] === 7) || cache['HidePanel'];

        if (shouldShow && !rankingPanelSet) setupRankingPanel();
        if (shouldHide && rankingPanelSet) deRankingPanel();

        function setupRankingPanel() {
            rankingPanelSet = true;

            setStyle(RankingPanel, 'opacity', 1);

            setStyle(ResultMiddle, 'transform', `translateY(0)`);
            setStyle(MiddleBar, 'height', `460px`);

            setStyle(rankingResult, 'opacity', 1);
            setStyle(rankingResult, 'transform', 'scale(100%)');

            setStyle(TContainer, 'transform', `translateX(0)`);
            setStyle(PContainer, 'transform', `translateX(0)`);

            setStyle(modContainer, 'transform', `translateY(0)`);

            setStyle(MapStats, 'opacity', 1);
            setStyle(StatsBPM, 'opacity', 1);
            setStyle(StatsBar, 'opacity', 1);

            setStyle(MapStats, 'transform', `translateX(0)`);
            setStyle(StatsBPM, 'transform', `translateX(0)`);
            setStyle(StatsBar, 'transform', `translateX(0)`);

            setStyle(CSGlow, 'width', ((cache['beatmap.stats.cs.converted'] * 10)) + '%');
            setStyle(ARGlow, 'width', ((cache['beatmap.stats.ar.converted'] * 10) - 10) + '%');
            setStyle(ODGlow, 'width', ((cache['beatmap.stats.od.converted'] * 10) - 10) + '%');
            setStyle(HPGlow, 'width', ((cache['beatmap.stats.hp.converted'] * 10)) + '%');

            setStyle(Top1, 'opacity', 1);
            setStyle(Top2, 'opacity', 1);
            setStyle(Top3, 'opacity', 1);
            setStyle(Top4, 'opacity', 1);
            setStyle(Top5, 'opacity', 1);
            setStyle(Top6, 'opacity', 1);

            setStyle(Top1, 'transform', `translateY(0)`);
            setStyle(Top2, 'transform', `translateY(0)`);
            setStyle(Top3, 'transform', `translateY(0)`);
            setStyle(Top4, 'transform', `translateY(0)`);
            setStyle(Top5, 'transform', `translateY(0)`);
            setStyle(Top6, 'transform', `translateY(0)`);
        };
        function deRankingPanel() {
            rankingPanelSet = false;

            setStyle(RankingPanel, 'opacity', 0);

            setStyle(ResultMiddle, 'transform', `translateY(400px)`);
            setStyle(MiddleBar, 'height', `0px`);

            setStyle(rankingResult, 'opacity', 0);
            setStyle(rankingResult, 'transform', 'scale(150%)');

            setStyle(TContainer, 'transform', `translateX(1000px)`);
            setStyle(PContainer, 'transform', `translateX(-1000px)`);

            setStyle(modContainer, 'transform', `translateY(200px)`);

            setStyle(MapStats, 'opacity', 0);
            setStyle(StatsBPM, 'opacity', 0);
            setStyle(StatsBar, 'opacity', 0);

            setStyle(MapStats, 'transform', `translateX(-100px)`);
            setStyle(StatsBPM, 'transform', `translateX(-100px)`);
            setStyle(StatsBar, 'transform', `translateX(100px)`);

            setStyle(CSGlow, 'width', `0%`);
            setStyle(ARGlow, 'width', `0%`);
            setStyle(ODGlow, 'width', `0%`);
            setStyle(HPGlow, 'width', `0%`);

            setStyle(Top1, 'opacity', 0);
            setStyle(Top2, 'opacity', 0);
            setStyle(Top3, 'opacity', 0);
            setStyle(Top4, 'opacity', 0);
            setStyle(Top5, 'opacity', 0);
            setStyle(Top6, 'opacity', 0);

            setStyle(Top1, 'transform', `translateY(-100px)`);
            setStyle(Top2, 'transform', `translateY(-100px)`);
            setStyle(Top3, 'transform', `translateY(-100px)`);
            setStyle(Top4, 'transform', `translateY(-100px)`);
            setStyle(Top5, 'transform', `translateY(-100px)`);
            setStyle(Top6, 'transform', `translateY(-100px)`);
        };

        async function setupLocalScores() {
            if (leaderboardLocalSet) return;
            leaderboardLocalSet = true;

            const seenNames = new Set();
            const filteredLeaderboard = leaderboard.filter(entry => {
                if ((entry.name === cache['play.name'] || entry.name === cache['resultsScreen.name']) && entry.score === cache['resultsScreen.score']) return false;
                if (seenNames.has(`${entry.name}-${entry.score}`)) return false;
                seenNames.add(`${entry.name}-${entry.score}`);
                return true;
            });

            const normalized = await Promise.all(filteredLeaderboard.map(async (entry) => {
                const modsName = Array.isArray(entry.mods.array)
                    ? entry.mods.array.map(m => m.acronym).join('')
                    : (entry.mods.name || '');
                const ppData = await socket.calculate_pp({
                    n300: entry.hits["300"],
                    n100: entry.hits["100"],
                    n50: entry.hits["50"],
                    nMisses: entry.hits["0"],
                    mods: entry.mods.number,
                    acc: accuracyCalc(entry.hits["300"], entry.hits["100"], entry.hits["50"], entry.hits["0"]),
                    combo: entry.combo.max,
                });

                const avatar = entry.id == 0
                  ? cache['gamerlocal'] ? `./static/gamer.png` : `https://a.${cache['server']}/${cache['profile.id']}`
                  : `https://a.${cache['server']}/${entry.id}`;

                return {
                    id: entry.id,
                    name: entry.name,
                    score: entry.score,
                    comboMax: entry.combo.max,
                    misses: entry.hits["0"],
                    pp: ppData.pp || 0,
                    acc: accuracyCalc(entry.hits["300"], entry.hits["100"], entry.hits["50"], entry.hits["0"]),
                    rank: grader(entry.hits["300"], entry.hits["100"], entry.hits["50"], entry.hits["0"], modsName),
                    modsName: modsName,
                    modsNumber: entry.mods.number,
                    avatar,
                    highlight: entry.name === cache['resultsScreen.name'] || entry.name === cache['play.name'],
                };
            }));

            renderLeaderboard(normalized, { fillTempScores: true });
        };
    } catch (error) {
        console.log(error);
    }
  }, [
      'game',
      'server',
      'leaderboard',
      'client',
      'resultsScreen',
      'play',
      'beatmap',
      {field: 'state', keys: ['number']},
      {field: 'settings', keys: ['interfaceVisible', {field: 'background', keys: ['dim']}]},
      {field: 'performance', keys: ['graph']},
      {field: 'folders', keys: ['beatmap']},
      {field: 'files', keys: ['background']},
      {field: 'directPath', keys: ['beatmapBackground']},
      {field: 'profile', keys: ['id', 'name', 'pp', 'globalRank', 'countryCode', 'mode']}
  ]);

socket.api_v2_precise((data) => {
    try {
      if (cache['data.menu.state'] !== 2) return;

      const allKeyElems = Array.from(document.querySelectorAll('.keys'));
      const wideElems = Array.from(document.querySelectorAll('.wide'));
      const keyData = data.keys || {};
      const keyList = Object.keys(keyData);
      const counts = [];

      const updateKeyState = (key, value) => {
        if (cache[`key-${key}-press`] !== value.isPressed) {
          cache[`key-${key}-press`] = value.isPressed;
          keys[key].blockStatus(value.isPressed);
          const status = value.isPressed ? 'add' : 'remove';
          keyElems[key].press?.classList[status]('active');
          if (value.isPressed === true) keys[key].registerKeypress();
        }

        if (cache[`key-${key}-count`] !== value.count) {
          setText(keyElems[key].count, value.count);
          cache[`key-${key}-count`] = value.count;
        }

        if (cache[`key-${key}-active`] == null && value.count > 0) {
          keyElems[key].container?.classList.remove('hidden');
          cache[`key-${key}-active`] = true;
        }
      };

      for (let i = 0; i < keyList.length; i++) {
        const key = keyList[i];
        const value = keyData[key];
        counts.push(value.count);
        updateKeyState(key, value);
      }

      const applyKeyLayout = (maxCount) => {
        if (maxCount < 10) {
          allKeyElems.forEach(e => setStyle(e, 'transform', `translateX(5px)`));
          wideElems.forEach(e => setStyle(e, 'width', `11px`));
        } else if (maxCount < 100) {
          allKeyElems.forEach(e => setStyle(e, 'transform', `translateX(-5px)`));
          wideElems.forEach(e => setStyle(e, 'width', `22px`));
        } else if (maxCount < 1000) {
          allKeyElems.forEach(e => setStyle(e, 'transform', `translateX(-15px)`));
          wideElems.forEach(e => setStyle(e, 'width', `32px`));
        } else {
          allKeyElems.forEach(e => setStyle(e, 'transform', `translateX(-25px)`));
          wideElems.forEach(e => setStyle(e, 'width', `48px`));
        }
      };

      applyKeyLayout(Math.max(...counts, 0));

      keys.k1.update(keyData.k1);
      keys.k2.update(keyData.k2);
      keys.m1.update(keyData.m1);
      keys.m2.update(keyData.m2);

      const hitErrors = data.hitErrors;
      if (hitErrors !== null) {
        tempSmooth = fastSmooth(hitErrors, 0);
        if (tempHitErrorArrayLength !== tempSmooth.length) {
          tempHitErrorArrayLength = tempSmooth.length;
          for (let a = 0; a < tempHitErrorArrayLength; a++) {
            tempAvg = tempAvg * 0.9 + tempSmooth[a] * 0.1;
          }

          tickPos = hitErrors[tempHitErrorArrayLength - 1] / 2 * 3.5;
          currentErrorValue = hitErrors[tempHitErrorArrayLength - 1];
          setStyle(avgHitError, 'transform', `translateX(${(tempAvg / 2) * 3.5}px)`);

          const tick = document.createElement("div");
          tick.id = `tick${tempHitErrorArrayLength}`;
          tick.setAttribute("class", "tick");
            setStyle(tick, 'transform', `translateX(${tickPos}px)`);
          document.getElementById("URTCont").appendChild(tick);

          if (currentErrorValue >= -error_h300 && currentErrorValue <= error_h300) {
            setStyle(tick, 'backgroundColor', 'hsl(200, 73%, 51%)');
          } else if (currentErrorValue >= -error_h100 && currentErrorValue <= error_h100) {
            setStyle(tick, 'backgroundColor', 'hsl(130, 73%, 51%)');
          } else if (currentErrorValue >= -error_h50 && currentErrorValue <= error_h50) {
            setStyle(tick, 'backgroundColor', 'hsl(46, 73%, 51%)');
          } else {
            setStyle(tick, 'backgroundColor', 'rgba(0, 0, 0, 0)');
          }

          const show = () => {
            setStyle(tick, 'opacity', 1);
            setStyle(tick, 'transition', `opacity ease 300ms`);
          };
          const fade = () => {
            setStyle(tick, 'opacity', 0);
            setStyle(tick, 'transition', `opacity ease 4s`);
          };
          const remove = () => {
            document.getElementById("URTCont").removeChild(tick);
          };

          setTimeout(show, 1);
          setTimeout(fade, 1001);
          setTimeout(remove, 4001);
        }
      }
    } catch (err) {
      console.log(err);
    }
}, ['hitErrors', 'keys']);

async function setupUser(name) {
  let userData = await getUserDataSet(name, cache['mode']);
  let playerBest;
  let avatarColor, Colors;

  if (userData.error === null || (LocalNameData === cache['LocalName'] && LocalResultNameData === cache['LocalName'])) {
    userData = {
      "id": `19637339`,
      "statistics": {
        "global_rank": `${cache['GBrank'] > 0 ? cache['GBrank'] : spaceit(cache['profile.globalRank'])}`,
        "pp": `${cache['ppGB'] > 0 ? cache['ppGB'] : cache['profile.pp']}`,
        "country_rank": `${cache['CTrank']}`,
      },
      "country_code": `${cache['CTcode'] !== `__` ? cache['CTcode'] : cache['profile.countryCode.name']}`,
    };
    playerBest = handleLocalPlayerBest();
  } else {
    playerBest = await getUserTop(userData.id, cache['mode']);
  };

  setUserAvatar(userData);
  setCountryFlag(userData);
  setRanks(userData);

  if (cache['ColorSet'] === 'API') {
    if (cache['CustomIDSet'] !== "" && cache['CustomIDColor']) {
      avatarColor = await postCustomID(cache['CustomIDSet'].replace("/", "+"));
    } else {
      avatarColor = userData.id !== `19637339`
        ? await postUserID(userData.id)
        : await postDefaultID(`${cache['server']}+${cache['profile.id']}`);
    }

    Colors = {
      ColorData1: `${avatarColor.HSLVibrant[0] * 360}, ${avatarColor.HSLVibrant[1] * 100}%, 50%`,
      ColorData2: `${avatarColor.HSLLightVibrant[0] * 360}, ${avatarColor.HSLLightVibrant[1] * 100}%, 75%`,
      ColorResultLight: `${avatarColor.HSLVibrant[0] * 360}, ${avatarColor.HSLLightVibrant[1] * 100}%, 82%`,
      ColorResultDark: `${avatarColor.HSLVibrant[0] * 360}, ${avatarColor.HSLLightVibrant[1] * 100}%, 6%`
    };
  } else {
    Colors = {
      ColorData1: `${cache['HueID']}, ${cache['SaturationID']}%, 50%`,
      ColorData2: `${cache['HueID2']}, ${cache['SaturationID2']}%, 50%`,
      ColorResultLight: `${cache['HueID']}, ${cache['SaturationID']}%, 82%`,
      ColorResultDark: `${cache['HueID']}, ${cache['SaturationID']}%, 6%`
    };
  }

  for (let i = 0; i < 6; i++) {
    setupTopPlay(i, playerBest, Colors);
  };

  if (Colors) {
    applyThemeColors(Colors);
  };
};

const applyThemeColors = (Colors) => {
  setStyle(DevInformation, 'backgroundColor', `hsl(${Colors.ColorResultDark})`);
  setStyle(DevInformation, 'color', `hsl(${Colors.ColorResultLight})`);
  setStyle(DevInformation, 'borderColor', `hsl(${Colors.ColorResultLight})`);
  setStyle(DevInformation, 'outlineColor', `hsl(${Colors.ColorResultDark})`);

  document.querySelectorAll('.hpColor1').forEach(e => setStyle(e, 'fill', `hsl(${Colors.ColorData1})`));
  document.querySelectorAll('.hpColor2').forEach(e => setStyle(e, 'fill', `hsl(${Colors.ColorData2})`));

  setStyle(smallStats, 'backgroundColor', `hsl(${Colors.ColorData1})`);

  setStyle(combo_box, 'backgroundColor', `hsl(${Colors.ColorData1})`);
  setStyle(combo_box, 'filter', `drop-shadow(0 0 10px hsla(${Colors.ColorData1}))`);

  setStyle(pp_box, 'backgroundColor', `hsl(${Colors.ColorData2})`);
  setStyle(pp_box, 'filter', `drop-shadow(0 0 10px hsla(${Colors.ColorData2}))`);

  document.querySelector('.keys.k1').style.setProperty('--press', `hsl(${Colors.ColorData1})`);
  document.querySelector('.keys.k2').style.setProperty('--press', `hsl(${Colors.ColorData1})`);
  document.querySelector('.keys.m1').style.setProperty('--press', `hsl(${Colors.ColorData2})`);
  document.querySelector('.keys.m2').style.setProperty('--press', `hsl(${Colors.ColorData2})`);

  keys.k1.color = `hsla(${Colors.ColorData1}, 0.8)`;
  keys.k2.color = `hsla(${Colors.ColorData1}, 0.8)`;
  keys.m1.color = `hsla(${Colors.ColorData2}, 0.8)`;
  keys.m2.color = `hsla(${Colors.ColorData2}, 0.8)`;

  setStyle(lbcpLine, 'backgroundColor', `hsl(${Colors.ColorData1})`);
  setStyle(lbcpLine, 'boxShadow', `0 0 10px 5px hsla(${Colors.ColorData1}, 0.3)`);

  setStyle(bgpanel, 'backgroundColor', `hsla(${Colors.ColorResultDark}, 0.9)`);
  setStyle(SonataTextResult, 'color', `hsl(${Colors.ColorResultLight})`);
  setStyle(bgborder, 'border', `3px solid hsl(${Colors.ColorResultLight})`);
  setStyle(StatsBPM, 'border', `3px solid hsl(${Colors.ColorResultLight})`);
  setStyle(MiddleBar, 'backgroundColor', `hsl(${Colors.ColorResultLight})`);

  setStyle(CSLine, 'border', `3px solid hsl(${Colors.ColorResultLight})`);
  setStyle(ARLine, 'border', `3px solid hsl(${Colors.ColorResultLight})`);
  setStyle(ODLine, 'border', `3px solid hsl(${Colors.ColorResultLight})`);
  setStyle(HPLine, 'border', `3px solid hsl(${Colors.ColorResultLight})`);

  setStyle(PHCS, 'color', `hsl(${Colors.ColorResultLight})`);
  setStyle(PHAR, 'color', `hsl(${Colors.ColorResultLight})`);
  setStyle(PHOD, 'color', `hsl(${Colors.ColorResultLight})`);
  setStyle(PHHP, 'color', `hsl(${Colors.ColorResultLight})`);

  setStyle(CSGlow, 'backgroundColor', `hsl(${Colors.ColorResultLight})`);
  setStyle(ARGlow, 'backgroundColor', `hsl(${Colors.ColorResultLight})`);
  setStyle(ODGlow, 'backgroundColor', `hsl(${Colors.ColorResultLight})`);
  setStyle(HPGlow, 'backgroundColor', `hsl(${Colors.ColorResultLight})`);

  setStyle(recorderContainer, 'backgroundColor', `hsl(${Colors.ColorResultDark})`);
  setStyle(recorderContainer, 'color', `hsl(${Colors.ColorResultLight})`);
  setStyle(recorderContainer, 'borderColor', `hsl(${Colors.ColorResultLight})`);
  setStyle(recorderContainer, 'outlineColor', `hsl(${Colors.ColorResultDark})`);

  setStyle(adbanner, 'borderColor', `hsl(${Colors.ColorResultLight})`);

  chartConfigs.lighter.data.datasets[0].backgroundColor = `hsl(${Colors.ColorData1})`;
  chartConfigs.lighter2.data.datasets[0].backgroundColor = `hsl(${Colors.ColorData1})`;
  charts.lighter?.update();
  charts.lighter2?.update();
};

function handleLocalPlayerBest() {
  const keys = ['0', '1', '2', '3', '4', '5'];
  return keys.reduce((acc, key) => {
    acc[key] = {
      "beatmap": {
        "beatmapset_id": cache[`mapid${key}`]
      },
      "pp": cache[`ppResult${key}`],
      "mods_id": cache[`modsid${key}`],
      "rank": cache[`rankResult${key}`],
      "ended_at": cache[`date${key}`],
    };
    return acc;
  }, {});
};

async function setupTopPlay(index, playerBest, Colors) {
  const i = index;
  const topPlay = playerBest[i];

  const dataNeed = {
    pp: topPlay.pp,
    created_at: topPlay.ended_at,
    rank: topPlay.rank,
    mods: topPlay.mods,
    beatmap_id: topPlay.beatmap.beatmapset_id,
  };

  if (dataNeed.beatmap_id) {
    setStyle(document.getElementById(`Top${i + 1}`), 'backgroundImage', `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('https://assets.ppy.sh/beatmaps/${dataNeed.beatmap_id}/covers/cover@2x.jpg')`);
    setText(document.getElementById(`TopDate${i + 1}`), jQuery.timeago(dataNeed.created_at));
    setText(document.getElementById(`TopRanking${i + 1}`), topPlay.rank.replace('H', ''));
    document.getElementById(`TopRanking${i + 1}`).setAttribute('class', `topRanking ${dataNeed.rank}`);
    setText(document.getElementById(`topPP${i + 1}`), `${Math.round(dataNeed.pp)}pp`);
    setHTML(document.getElementById(`TopMods${i + 1}`), "");

    let modsArray = Array.isArray(dataNeed.mods) ? dataNeed.mods.map(m => m.acronym) : [];
    let ModsNum = modsArray.length > 0 ? modsArray.join('') : 'NM';

    setHTML(document.getElementById(`TopMods${i + 1}`), " ");

    let ModsRCount = ModsNum.length / 2;

    for (let k = 0; k < ModsRCount; k++) {
        let modName = ModsNum.substring(k * 2, k * 2 + 2);
        let modsR = document.createElement("div");
        modsR.id = modName + i;
        modsR.setAttribute("class", `modslb ${modName}`);
        if (VALID_MODS.has(modName)) {
          setStyle(modsR, 'backgroundImage', `url('./static/Mods/${modName}.png')`);
        }
        document.getElementById(`TopMods${i + 1}`).appendChild(modsR);
    };

  } else {
    setStyle(document.getElementById(`Top${i + 1}`), 'backgroundImage', "");
    setText(document.getElementById(`TopDate${i + 1}`), "");
    setText(document.getElementById(`TopRanking${i + 1}`), "");
    setText(document.getElementById(`topPP${i + 1}`), "");
    setHTML(document.getElementById(`TopMods${i + 1}`), "");
  };

  if (topPlay.legacy_score_id === cache['resultsScreen.scoreId'] && cache.ColorSet === "API") {
      setStyle(document.getElementById(`Top${i + 1}`), 'outlineColor', `hsl(${Colors.ColorResultLight})`);
  } else {
      setStyle(document.getElementById(`Top${i + 1}`), 'outlineColor', `rgba(0, 0, 0, 0)`);
  };
};

function setUserAvatar(userData) {
  let avatarUrl;
  avatarUrl = !cache['gamerlocal'] ? userData.id === `19637339` ? `https://a.${cache['server']}/${cache['profile.id']}` : `https://a.ppy.sh/${userData.id}` : userData.id === `19637339` ? `./static/gamer.png` : `https://a.ppy.sh/${userData.id}`

  setStyle(ava, 'backgroundImage', `url('${avatarUrl}')`);
  setStyle(PlayerAvatar, 'backgroundImage', `url('${avatarUrl}')`);
  setStyle(lbcpAvatar, 'backgroundImage', `linear-gradient(310deg, rgba(0,0,0,0.8) 15%, rgba(0,0,0,0) 100%), url('${avatarUrl}')`);
};

function setCountryFlag(userData) {
    const countryCode = `${userData.country_code
      .split("")
      .map((char) => 127397 + char.charCodeAt())[0]
      .toString(16)}-${userData.country_code
        .split("")
        .map((char) => 127397 + char.charCodeAt())[1]
        .toString(16)}`;

    const flagUrl = `https://osu.ppy.sh/assets/images/flags/${countryCode}.svg`;
    setStyle(country, 'backgroundImage', `url('${flagUrl}')`);
    setStyle(PlayerFlag, 'backgroundImage', `url('${flagUrl}')`);
};

function setRanks(userData) {
    setText(PlayerTotalPP, Math.round(userData.statistics.pp) + "pp");
    setText(playerPP, Math.round(userData.statistics.pp) + "pp");

    if (userData.statistics.global_rank === null && userData.statistics.country_rank === null || userData.statistics.global_rank === null && userData.statistics.country_rank === undefined) {
      setText(ranks, '#0');
      setText(PlayerGR, `#0`);
      setText(countryRank, `#0`);
      setText(PlayerCR, `#0 ${userData.country_code}`);
    } else {
      setText(ranks, `#${spaceit(userData.statistics.global_rank)}`);
      setText(PlayerGR, `#${spaceit(userData.statistics.global_rank)}`);
      setText(countryRank, `#${spaceit(userData.statistics.country_rank)}`);
      setText(PlayerCR, `#${spaceit(userData.statistics.country_rank)} ${userData.country_code}`);
    };
};

function renderLeaderboard(entries, { fillTempScores = false } = {}) {
    tempSlotLength = entries.length;
    playerPosition = entries.length;

    if (playerPosition === 0) playerPosition = 1;

    for (let i = tempSlotLength; i > 0; i--) {
        const entry = entries[i - 1];
        if (fillTempScores) tempMapScores[i - 1] = entry.score;

        let playerContainer = document.createElement("div");
        playerContainer.id = `playerslot${i}`;
        playerContainer.setAttribute("class", "lbBox updatelb");
        setStyle(playerContainer, 'top', `${(i - 1) * 65}px`);

        const playerNumber = `
                    <div id="lb_Number_slot${i}" class="lb_Number">
                        <div id="lb_Positions_slot${i}" class="positions N${i}">${i}</div>
                    </div>
        `;

        const playerAvatar = `
                    <div id="lb_Avatar_slot${i}" class="lb_Avatar" style="background-image: linear-gradient(310deg, rgba(0,0,0,0.8) 15%, rgba(0,0,0,0) 100%), url('${entry.avatar}')">
                        <div id="lb_Ranking_slot${i}" class="${entry.rank} lb_Rank">${entry.rank.replace("H", "")}</div>
                    </div>
        `;

        const playerStats = `
                    <div id="lb_Stats_slot${i}" class="lb_Stats">
                        <div id="lb_StatsLeft_slot${i}" class="lb_StatsLeft">
                            <div id="lb_Name_slot${i}" class="lb_Name">${entry.name}</div>
                            <div id="lb_Score_slot${i}">${formatNumber(entry.score)}</div>
                        </div>
                        <div id="lb_StatsMiddle_slot${i}" class="lb_StatsMiddle">
                            <div id="lb_Combo_slot${i}" class="lb_Combo">${spaceit(entry.comboMax)}x</div>
                            <div id="lb_Miss_slot${i}" class="lb_Miss">${entry.misses}</div>
                        </div>
                        <div id="lb_StatsRight_slot${i}" class="lb_StatsRight">
                            <div id="lb_PP_slot${i}" class="lb_PP">${spaceit(Math.round(entry.pp))}pp</div>
                            <div id="lb_Acc_slot${i}">${entry.acc}%</div>
                        </div>
                    </div>
        `;

        const playerMods = `<div id="lb_Mods_slot${i}" class="lb_Mods"></div>`;

        playerContainer.innerHTML = `
            ${playerNumber}
            ${playerAvatar}
            ${playerStats}
            ${playerMods}
        `;

        document.getElementById("lbopCont").appendChild(playerContainer);

        const modsString = entry.modsName || '';
        for (let k = 0; k < modsString.length; k += 2) {
            const modName = modsString.substring(k, k + 2);
            if (!modName.trim()) continue;
            let mods = document.createElement("div");
            mods.id = modName + i;
            mods.setAttribute("class", `modslb ${modName} updatelb`);
            if (VALID_MODS.has(modName)) {setStyle(mods, 'backgroundImage', `url('./static/Mods/${modName}.png')`)};
            document.getElementById(`lb_Mods_slot${i}`).appendChild(mods);
        };

        if (cache['beatmap_rankedStatus'] === 7) {
            setText(document.getElementById(`lb_PP_slot${i}`), '❤︎');
            document.getElementById(`lb_PP_slot${i}`).setAttribute("class", "lb_PP loved");
        };

        if (cache['beatmap_rankedStatus'] === 6) {
            setText(document.getElementById(`lb_PP_slot${i}`), '✔');
            document.getElementById(`lb_PP_slot${i}`).setAttribute("class", "lb_PP qualified");
        };

        if (entry.highlight) {document.getElementById(`lb_Name_slot${i}`).setAttribute("class", "lb_Name bluelight")};
        if (entry.misses === 0) {setStyle(document.getElementById(`lb_Miss_slot${i}`), 'display', `none`)};
    };
}

async function setupMapScores(beatmapID) {
    if (leaderboardFetch === false) {
        leaderboardFetch = true;
        let data = cache['LBOptions'] === "Selected Mods" ? await getModsScores(beatmapID, (cache['resultsScreen.mods.name'] || cache['play.mods.name']), (cache['mode'] || cache['profile.mode'])) : await getMapScores(beatmapID, (cache['mode'] || cache['profile.mode']));

        const filteredData = data.filter(entry =>
          !((entry.user.name === cache['play.name'] || entry.user.name === cache['resultsScreen.name']) &&
            entry.score.total === cache['resultsScreen.score'])
        );

        const normalized = filteredData.map(entry => ({
            id: entry.user.id,
            name: entry.user.name,
            score: entry.score.total,
            comboMax: entry.combo.max,
            misses: entry.hits[0],
            pp: entry.pp || 0,
            acc: entry.accuracy.toFixed(2),
            rank: entry.rank,
            modsName: entry.mods.name,
            modsNumber: entry.mods.number,
            avatar: `https://a.ppy.sh/${entry.user.id}`,
            highlight: entry.user.name === cache['resultsScreen.name'] || entry.user.name === cache['play.name'],
        }));

        renderLeaderboard(normalized, { fillTempScores: true });
    };
};

function LBReset() {
    leaderboardFetch = false;
    leaderboardLocalSet = false;
    tempSlotLength = 0;
    playerPosition = 1;
    setHTML(lbopCont, "");
    tempMapScores = [];
};

const accuracyCalc = (h300, h100, h50, h0) =>
  ((h300 + h100 / 3 + h50 / 6) / (h300 + h100 + h50 + h0) * 100).toFixed(2);

const grader = (h300, h100, h50, h0, isHD) => {
    const acc = accuracyCalc(h300, h100, h50, h0);
    const maxCombo = h300 + h100 + h50 + h0;
    const hd = isHD.includes("HD");
    if (acc == 100 || maxCombo === 0) return hd ? 'XH' : 'X';
    if (acc > 90 && h50 / maxCombo < 0.01 && h0 === 0) return hd ? 'SH' : 'S';
    if ((acc > 80 && acc <= 90 && h0 === 0) || h300 / maxCombo > 0.9) return 'A';
    if ((acc > 70 && acc <= 80 && h0 === 0) || h300 / maxCombo > 0.8) return 'B';
    if (h300 / maxCombo > 0.6 && h300 / maxCombo <= 0.8) return 'C';
    return 'D';
};