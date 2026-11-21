// カレンダーの計算部分（祝日・六曜・文章入力の読み取り）
// 日付は「1970-01-01からの日数」(epoch day) で扱う
(function (root) {
  'use strict';

  // ---------- 日付の基本 ----------
  function epochDay(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 864e5); }
  function fromEpoch(e) {
    const t = new Date(e * 864e5);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), w: t.getUTCDay() };
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function keyOf(e) { const o = fromEpoch(e); return o.y + '-' + pad(o.m) + '-' + pad(o.d); }
  function epochOfKey(k) { const [y, m, d] = k.split('-').map(Number); return epochDay(y, m, d); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function todayEpoch() { const n = new Date(); return epochDay(n.getFullYear(), n.getMonth() + 1, n.getDate()); }

  // ---------- 祝日 ----------
  const holidayCache = {};
  function nthWeekday(y, m, n, wd) {
    const w1 = fromEpoch(epochDay(y, m, 1)).w;
    return 1 + ((wd - w1 + 7) % 7) + 7 * (n - 1);
  }
  function holidaysOfYear(y) {
    if (holidayCache[y]) return holidayCache[y];
    const h = new Map();
    const add = (m, d, name) => h.set(epochDay(y, m, d), name);
    add(1, 1, '元日');
    add(1, nthWeekday(y, 1, 2, 1), '成人の日');
    add(2, 11, '建国記念の日');
    if (y >= 2020) add(2, 23, '天皇誕生日');
    const shun = Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
    add(3, shun, '春分の日');
    add(4, 29, '昭和の日');
    add(5, 3, '憲法記念日');
    add(5, 4, 'みどりの日');
    add(5, 5, 'こどもの日');
    add(7, nthWeekday(y, 7, 3, 1), '海の日');
    add(8, 11, '山の日');
    add(9, nthWeekday(y, 9, 3, 1), '敬老の日');
    const shuu = Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
    add(9, shuu, '秋分の日');
    add(10, nthWeekday(y, 10, 2, 1), 'スポーツの日');
    add(11, 3, '文化の日');
    add(11, 23, '勤労感謝の日');
    // 国民の休日（祝日にはさまれた平日）
    const base = [...h.keys()].sort((a, b) => a - b);
    for (const e of base) {
      if (h.has(e + 2) && !h.has(e + 1) && fromEpoch(e + 1).w !== 0) h.set(e + 1, '国民の休日');
    }
    // 振替休日（日曜の祝日の次の平日）
    for (const e of [...h.keys()].sort((a, b) => a - b)) {
      if (fromEpoch(e).w === 0) {
        let x = e + 1;
        while (h.has(x)) x++;
        h.set(x, '振替休日');
      }
    }
    holidayCache[y] = h;
    return h;
  }
  function holidayName(e) { return holidaysOfYear(fromEpoch(e).y).get(e) || ''; }

  // ---------- 六曜（旧暦から計算） ----------
  const RAD = Math.PI / 180;
  const DELTA_T = 70 / 86400; // TTとUTの差（約70秒）
  const JD_EPOCH = 2440587.5;
  function sunLongitude(jde) {
    const T = (jde - 2451545) / 36525;
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * RAD;
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
      + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
    const om = (125.04 - 1934.136 * T) * RAD;
    let lam = L0 + C - 0.00569 - 0.00478 * Math.sin(om);
    lam %= 360; if (lam < 0) lam += 360;
    return lam;
  }
  // 日本時間でその日の0時の太陽黄経
  function sunLonAtDay(e) { return sunLongitude(e + JD_EPOCH - 9 / 24 + DELTA_T); }

  function newMoonJDE(k) {
    const T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
    const E = 1 - 0.002516 * T - 0.0000074 * T2;
    const M = (2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3) * RAD;
    const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4) * RAD;
    const F = (160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4) * RAD;
    const Om = (124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3) * RAD;
    const s = Math.sin;
    jde += -0.4072 * s(Mp) + 0.17241 * E * s(M) + 0.01608 * s(2 * Mp) + 0.01039 * s(2 * F)
      + 0.00739 * E * s(Mp - M) - 0.00514 * E * s(Mp + M) + 0.00208 * E * E * s(2 * M)
      - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F) + 0.00056 * E * s(2 * Mp + M)
      - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F)
      - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(Om) - 0.00007 * s(Mp + 2 * M)
      + 0.00004 * s(2 * Mp - 2 * F) + 0.00004 * s(3 * M) + 0.00003 * s(Mp + M - 2 * F)
      + 0.00003 * s(2 * Mp + 2 * F) - 0.00003 * s(Mp + M + 2 * F) + 0.00003 * s(Mp - M + 2 * F)
      - 0.00002 * s(Mp - M - 2 * F) - 0.00002 * s(3 * Mp + M) + 0.00002 * s(4 * Mp);
    const A = [
      [299.77, 0.107408, 0.000325], [251.88, 0.016321, 0.000165], [251.83, 26.651886, 0.000164],
      [349.42, 36.412478, 0.000126], [84.66, 18.206239, 0.00011], [141.74, 53.303771, 0.000062],
      [207.14, 2.453732, 0.00006], [154.84, 7.30686, 0.000056], [34.52, 27.261239, 0.000047],
      [207.19, 0.121824, 0.000042], [291.34, 1.844379, 0.00004], [161.72, 24.198154, 0.000037],
      [239.56, 25.513099, 0.000035], [331.55, 3.592518, 0.000023]];
    for (let i = 0; i < A.length; i++) {
      let a = A[i][0] + A[i][1] * k;
      if (i === 0) a -= 0.009173 * T2;
      jde += A[i][2] * Math.sin(a * RAD);
    }
    return jde;
  }
  const nmCache = {};
  // 朔（新月）の日（日本時間の日付）
  function newMoonDay(k) {
    if (nmCache[k] === undefined) nmCache[k] = Math.floor(newMoonJDE(k) - DELTA_T - JD_EPOCH + 9 / 24);
    return nmCache[k];
  }
  function lunarMonthNumber(k, depth) {
    const a0 = sunLonAtDay(newMoonDay(k));
    let b = sunLonAtDay(newMoonDay(k + 1));
    if (b < a0) b += 360;
    const c = Math.floor(a0 / 30) * 30 + 30;
    if (c < b) return ((Math.round(c / 30) % 12) + 1) % 12 + 1; // 中気を含む月
    return depth > 2 ? 1 : lunarMonthNumber(k - 1, (depth || 0) + 1); // 閏月
  }
  function lunarDate(e) {
    let k = Math.floor((e + JD_EPOCH - 2451550.09766) / 29.530588861);
    while (newMoonDay(k) > e) k--;
    while (newMoonDay(k + 1) <= e) k++;
    return { month: lunarMonthNumber(k), day: e - newMoonDay(k) + 1 };
  }
  const ROKUYO = ['大安', '赤口', '先勝', '友引', '先負', '仏滅'];
  function rokuyo(e) { const l = lunarDate(e); return ROKUYO[(l.month + l.day) % 6]; }

  // ---------- 文章入力の読み取り ----------
  const WD = '日月火水木金土';
  function toHalf(s) {
    return s.replace(/[０-９：／～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/　/g, ' ').replace(/[〜]/g, '~');
  }
  // 戻り値: { date: epoch|null, start: 'HH:MM'|null, end: 'HH:MM'|null, title }
  function parseText(text, base) {
    if (base === undefined) base = todayEpoch();
    let s = toHalf(text);
    // 場所：「@渋谷駅」「場所:渋谷駅」
    let location = '';
    const lm = s.match(/(?:[@＠]|場所[:：]\s*)(\S+)/);
    if (lm) { location = lm[1]; s = s.replace(lm[0], ' '); }
    let date = null;
    const today = todayEpoch();
    const tw = fromEpoch(today);
    const cut = (re, fn) => {
      const m = s.match(re);
      if (m && date === null) { const r = fn(m); if (r !== null && r !== undefined) { date = r; s = s.replace(m[0], ' '); } }
    };
    const weekOf = (offsetWeeks, wd) => {
      // 週は月曜はじまり
      const mon = today - ((tw.w + 6) % 7);
      return mon + offsetWeeks * 7 + ((wd + 6) % 7);
    };
    cut(/(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})日?/, m => epochDay(+m[1], +m[2], +m[3]));
    cut(/(\d{1,2})月(\d{1,2})日/, m => {
      let e = epochDay(tw.y, +m[1], +m[2]); if (e < today - 31) e = epochDay(tw.y + 1, +m[1], +m[2]); return e;
    });
    cut(/(?<![\d:])(\d{1,2})\/(\d{1,2})(?![\d:])/, m => {
      if (+m[1] < 1 || +m[1] > 12) return null;
      let e = epochDay(tw.y, +m[1], +m[2]); if (e < today - 31) e = epochDay(tw.y + 1, +m[1], +m[2]); return e;
    });
    cut(/しあさって|明々後日/, () => today + 3);
    cut(/あさって|明後日/, () => today + 2);
    cut(/明日|あした|あす/, () => today + 1);
    cut(/今日|きょう|本日/, () => today);
    cut(/(\d+)日後/, m => today + +m[1]);
    cut(/再来週の?([日月火水木金土])(曜日?)?/, m => weekOf(2, WD.indexOf(m[1])));
    cut(/来週の?([日月火水木金土])(曜日?)?/, m => weekOf(1, WD.indexOf(m[1])));
    cut(/今週の?([日月火水木金土])(曜日?)?/, m => weekOf(0, WD.indexOf(m[1])));
    cut(/来月の?(\d{1,2})日/, m => { let y = tw.y, mo = tw.m + 1; if (mo > 12) { mo = 1; y++; } return epochDay(y, mo, +m[1]); });
    cut(/([日月火水木金土])曜日?/, m => today + ((WD.indexOf(m[1]) - tw.w + 7) % 7));
    cut(/(?<![\d月])(\d{1,2})日(?!後)/, m => {
      const d = +m[1]; if (d < 1 || d > 31) return null;
      let y = tw.y, mo = tw.m; if (d < tw.d) { mo++; if (mo > 12) { mo = 1; y++; } }
      return epochDay(y, mo, Math.min(d, daysInMonth(y, mo)));
    });

    // 時刻
    const T = '(午前|午後|朝|昼|夕方|夜)?\\s*(\\d{1,2})(?::(\\d{2})|時(?:(\\d{1,2})分|(半))?)';
    const toTime = (ap, h, mm, mm2, half, prevAp) => {
      h = +h; let min = mm ? +mm : mm2 ? +mm2 : half ? 30 : 0;
      ap = ap || prevAp;
      if ((ap === '午後' || ap === '夕方' || ap === '夜') && h < 12) h += 12;
      if (ap === '昼' && h < 6) h += 12;
      if (!ap && h >= 1 && h <= 6) h += 12; // 「3時」は普通午後3時の意味
      if (h > 24 || min > 59) return null;
      return pad(h) + ':' + pad(min);
    };
    let start = null, end = null;
    const rr = s.match(new RegExp(T + '\\s*(?:~|-|から|－|ー)\\s*' + T + '(?:まで)?'));
    if (rr) {
      start = toTime(rr[1], rr[2], rr[3], rr[4], rr[5]);
      end = toTime(rr[6], rr[7], rr[8], rr[9], rr[10], rr[1]);
      if (start && end && end < start && !rr[6] && +rr[7] < 12) end = pad(+rr[7] + 12) + end.slice(2);
      s = s.replace(rr[0], ' ');
    } else {
      const r1 = s.match(new RegExp(T + '(?:から)?'));
      if (r1) { start = toTime(r1[1], r1[2], r1[3], r1[4], r1[5]); if (start) s = s.replace(r1[0], ' '); }
    }
    let title = s.replace(/\s+/g, ' ').trim()
      .replace(/^(に|は|の|から|で|、|,)\s*/, '').replace(/\s*(に|から|で|、|,)$/, '').trim();
    return { date, start, end, title, location };
  }

  // タイトルからおすすめスタンプ
  const AUTO_STAMP = [
    [/歯医者|歯科/, '🦷'], [/病院|通院|診察|クリニック/, '🏥'], [/誕生日|バースデー/, '🎂'],
    [/飲み会|飲み|居酒屋/, '🍻'], [/仕事|出勤|会議|打ち合わせ|ミーティング/, '💼'], [/バイト/, '💪'],
    [/買い物|買い出し|スーパー/, '🛒'], [/美容院|散髪|カット/, '💇'], [/旅行|出張/, '✈️'],
    [/ゴミ|ごみ/, '🗑️'], [/支払|振込|振り込み|家賃|引き落とし/, '💴'], [/カラオケ|ライブ|歌/, '🎤'],
    [/映画/, '🎬'], [/ランチ|昼食|ご飯|ごはん|食事|ディナー/, '🍽️'], [/電話/, '📞'],
    [/勉強|試験|テスト/, '📚'], [/デート/, '💕'], [/薬/, '💊'], [/ジム|運動|ランニング/, '🏃'],
    [/締め?切り?|〆切/, '⏰'], [/宅配|荷物|配達/, '📦'], [/ゲーム/, '🎮'], [/アニメ|放送/, '📺']
  ];
  function autoStamp(title) {
    for (const [re, em] of AUTO_STAMP) if (re.test(title)) return em;
    return '';
  }

  const api = { epochDay, fromEpoch, keyOf, epochOfKey, daysInMonth, todayEpoch, pad,
    holidayName, holidaysOfYear, rokuyo, lunarDate, parseText, autoStamp, WD };
  if (typeof module !== 'undefined') module.exports = api; else root.CalCore = api;
})(this);
