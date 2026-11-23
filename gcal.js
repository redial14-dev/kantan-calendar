// Googleカレンダー連携（Google公式のログインとCalendar APIを使う）
(function (root) {
  'use strict';
  const C = root.CalCore;
  // 家族用の共有カレンダーを作る・家族を招待するために、カレンダー全体の許可をもらう（2026/11/23 から）
  const SCOPE = 'https://www.googleapis.com/auth/calendar';
  const BASE = 'https://www.googleapis.com/calendar/v3';
  const FAMILY_MARK = 'kantan-family';   // 家族用カレンダーの説明欄に入れる目印
  const TOKEN_KEY = 'kantan-gtoken';
  // このアプリの6色 ⇔ Googleカレンダーの色番号
  const COLORS = ['#4a7bd8', '#3aa76d', '#f08a24', '#e0505a', '#8e6bd8', '#7a8796'];
  const TO_GID = ['9', '10', '6', '11', '3', '8'];
  const FROM_GID = { 1: 4, 2: 1, 3: 4, 4: 3, 5: 2, 6: 2, 7: 0, 8: 5, 9: 0, 10: 1, 11: 3 };

  let clientId = '', tokenClient = null, token = null, tokenExp = 0, pending = null, onAuth = () => {};
  let familyId = '';   // 家族用カレンダーのID（なければ空）

  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY));
    // 前の許可（予定だけ）のときの鍵は使わない → もう一度つないでもらう
    if (t && t.exp > Date.now() && t.scope === SCOPE) { token = t.token; tokenExp = t.exp; }
  } catch (e) {}

  function configure(opts) { clientId = opts.clientId || ''; onAuth = opts.onAuthChange || onAuth; }
  function hasConfig() { return !!clientId; }
  function gisReady() { return !!(root.google && root.google.accounts && root.google.accounts.oauth2); }
  function signedIn() { return !!token && Date.now() < tokenExp; }

  function initClient() {
    if (tokenClient || !gisReady() || !clientId) return !!tokenClient;
    tokenClient = root.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPE,
      callback: resp => {
        const p = pending; pending = null;
        if (resp.error) { if (p) p.ng(new Error(resp.error)); return; }
        token = resp.access_token;
        tokenExp = Date.now() + (Number(resp.expires_in || 3600) - 120) * 1000;
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: tokenExp, scope: SCOPE }));
        onAuth(true);
        if (p) p.ok();
      },
      error_callback: err => { const p = pending; pending = null; if (p) p.ng(new Error(err.type || 'popup_closed')); }
    });
    return true;
  }
  // ボタンを押したときに呼ぶ（Googleのログイン画面が出る）
  function connect(firstTime) {
    return new Promise((ok, ng) => {
      if (!initClient()) { ng(new Error('not_ready')); return; }
      pending = { ok, ng };
      tokenClient.requestAccessToken({ prompt: firstTime ? 'consent' : '' });
    });
  }
  function disconnect() {
    if (token && gisReady()) root.google.accounts.oauth2.revoke(token, () => {});
    token = null; tokenExp = 0; localStorage.removeItem(TOKEN_KEY); onAuth(false);
  }

  async function call(method, path, body) {
    if (!signedIn()) { onAuth(false); throw Object.assign(new Error('auth'), { code: 'auth' }); }
    const r = await fetch(BASE + path, {
      method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (r.status === 401) { token = null; localStorage.removeItem(TOKEN_KEY); onAuth(false); throw Object.assign(new Error('auth'), { code: 'auth' }); }
    if (method === 'DELETE' && (r.status === 410 || r.status === 404)) return null; // もう消えている
    if (!r.ok) throw Object.assign(new Error('http ' + r.status + ' ' + await r.text()), { code: 'http', status: r.status });
    return r.status === 204 ? null : r.json();
  }

  // ---------- 形式の変換 ----------
  const pad = C.pad;
  const localKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
  function fromG(g, cal) {
    cal = cal || 'primary';
    const allDay = !!g.start.date;
    let date, endDate, start = '', end = '';
    if (allDay) {
      date = g.start.date;
      endDate = C.keyOf(Math.max(C.epochOfKey(g.end.date) - 1, C.epochOfKey(date)));
    } else {
      const s = new Date(g.start.dateTime), e = new Date(g.end.dateTime);
      date = localKey(s); start = hm(s); end = hm(e);
      endDate = localKey(new Date(Math.max(e - 1, +s)));
    }
    const priv = (g.extendedProperties && g.extendedProperties.private) || {};
    const ci = FROM_GID[g.colorId];
    const fam = !!familyId && cal === familyId;
    return {
      id: (fam ? 'f:' : '') + g.id, gid: g.id, cal, share: fam ? 'family' : 'me',
      by: fam && g.creator && !g.creator.self ? (g.creator.displayName || (g.creator.email || '').split('@')[0]) : '',
      title: g.summary || '（名前なし）', date, endDate, allDay, start, end,
      location: g.location || '', memo: g.description || '',
      color: COLORS[ci === undefined ? 0 : ci], gColorId: g.colorId || '',
      stamp: priv.kcStamp !== undefined ? priv.kcStamp : C.autoStamp(g.summary || ''),
      recurring: !!g.recurringEventId, google: true
    };
  }
  function addHour(t) { const [h, m] = t.split(':').map(Number); return pad(Math.min(h + 1, 23)) + ':' + pad(h + 1 > 23 ? 59 : m); }
  function timesOf(ev) {
    if (ev.allDay) {
      const s = C.epochOfKey(ev.date);
      const span = ev.endDate ? Math.max(1, C.epochOfKey(ev.endDate) - s + 1) : 1;
      return { start: { date: ev.date }, end: { date: C.keyOf(s + span) } };
    }
    const end = ev.end || addHour(ev.start);
    const endDay = end <= ev.start ? C.keyOf(C.epochOfKey(ev.date) + 1) : ev.date;
    return {
      start: { dateTime: `${ev.date}T${ev.start}:00+09:00`, timeZone: 'Asia/Tokyo' },
      end: { dateTime: `${endDay}T${end}:00+09:00`, timeZone: 'Asia/Tokyo' }
    };
  }
  function toG(ev) {
    return Object.assign({
      summary: ev.title, location: ev.location || '', description: ev.memo || '',
      colorId: TO_GID[Math.max(0, COLORS.indexOf(ev.color))],
      extendedProperties: { private: { kcStamp: ev.stamp || '' } }
    }, timesOf(ev));
  }

  // ---------- 読み書き ----------
  const evPath = (cal, id) => '/calendars/' + encodeURIComponent(cal) + '/events' + (id ? '/' + encodeURIComponent(id) : '');
  const calOf = ev => ev.share === 'family' && familyId ? familyId : 'primary';
  async function list(startEpoch, endEpoch, withFamily) {
    const out = [];
    await listOne('primary', startEpoch, endEpoch, out);
    if (familyId && withFamily !== false) {
      try { await listOne(familyId, startEpoch, endEpoch, out); }
      catch (e) { if (e.code === 'auth') throw e; console.error(e); }   // 家族の方だけ読めなくても自分の予定は出す
    }
    return out;
  }
  async function listOne(cal, startEpoch, endEpoch, out) {
    let pageToken = '';
    do {
      const q = new URLSearchParams({
        timeMin: C.keyOf(startEpoch) + 'T00:00:00+09:00', timeMax: C.keyOf(endEpoch + 1) + 'T00:00:00+09:00',
        singleEvents: 'true', orderBy: 'startTime', maxResults: '2500'
      });
      if (pageToken) q.set('pageToken', pageToken);
      const r = await call('GET', evPath(cal) + '?' + q);
      for (const g of r.items || []) if (g.status !== 'cancelled' && g.start) out.push(fromG(g, cal));
      pageToken = r.nextPageToken || '';
    } while (pageToken);
    return out;
  }
  async function insert(ev) { const cal = calOf(ev); return fromG(await call('POST', evPath(cal), toG(ev)), cal); }
  // 変わった項目だけ送る（複数日の予定などを壊さないため）
  async function update(ev, before) {
    let cal = before.cal || 'primary';
    const gid = before.gid || before.id;
    // 「自分だけ」⇔「家族全員」を変えたら、予定を別のカレンダーへ引っ越す
    const to = calOf(ev);
    if (to !== cal) {
      await call('POST', evPath(cal, gid) + '/move?destination=' + encodeURIComponent(to));
      cal = to;
    }
    const body = {};
    if (ev.title !== before.title) body.summary = ev.title;
    if ((ev.location || '') !== (before.location || '')) body.location = ev.location || '';
    if ((ev.memo || '') !== (before.memo || '')) body.description = ev.memo || '';
    if (ev.color !== before.color) body.colorId = TO_GID[Math.max(0, COLORS.indexOf(ev.color))];
    if ((ev.stamp || '') !== (before.stamp || '')) body.extendedProperties = { private: { kcStamp: ev.stamp || '' } };
    if (ev.date !== before.date || ev.allDay !== before.allDay || ev.start !== before.start || ev.end !== before.end) {
      if (ev.date !== before.date && before.endDate) { // 日付を動かしたら終わりの日も一緒に動かす
        ev.endDate = C.keyOf(C.epochOfKey(before.endDate) + C.epochOfKey(ev.date) - C.epochOfKey(before.date));
      }
      if (!ev.allDay && !before.allDay) delete ev.endDate;
      Object.assign(body, timesOf(ev));
    }
    if (!Object.keys(body).length) return fromG(await call('GET', evPath(cal, gid)), cal);
    return fromG(await call('PATCH', evPath(cal, gid), body), cal);
  }
  async function remove(ev) { await call('DELETE', evPath(ev.cal || 'primary', ev.gid || ev.id)); }

  // ---------- 家族用カレンダー ----------
  function setFamily(id) { familyId = id || ''; }
  function getFamily() { return familyId; }
  // 自分のカレンダー一覧から家族用を探す → { id, owner } か null
  async function findFamily() {
    let pageToken = '', found = null;
    do {
      const r = await call('GET', '/users/me/calendarList?showHidden=true' + (pageToken ? '&pageToken=' + pageToken : ''));
      for (const c of r.items || []) {
        if ((c.description || '').includes(FAMILY_MARK) && (!found || c.accessRole === 'owner')) found = { id: c.id, owner: c.accessRole === 'owner', name: c.summary };
      }
      pageToken = r.nextPageToken || '';
    } while (pageToken);
    return found;
  }
  async function createFamily(name) {
    const c = await call('POST', '/calendars', { summary: name, description: '家族で共有する予定（かんたんカレンダー）' + FAMILY_MARK, timeZone: 'Asia/Tokyo' });
    return { id: c.id, owner: true, name: c.summary };
  }
  // 招待リンクを開いた家族：自分のカレンダー一覧に家族用を足す
  async function joinFamily(id) {
    try { await call('POST', '/users/me/calendarList', { id }); }
    catch (e) { if (e.status !== 409) throw e; }   // 409 = もう入っている
    const c = await call('GET', '/users/me/calendarList/' + encodeURIComponent(id));
    return { id: c.id, owner: c.accessRole === 'owner', name: c.summary, canWrite: c.accessRole === 'owner' || c.accessRole === 'writer' };
  }
  async function leaveFamily(id) { await call('DELETE', '/users/me/calendarList/' + encodeURIComponent(id)); }
  // 家族の一覧（作った人だけ見られる）
  async function members(id) {
    const r = await call('GET', '/calendars/' + encodeURIComponent(id) + '/acl');
    return (r.items || []).filter(a => a.scope && a.scope.type === 'user')
      .map(a => ({ ruleId: a.id, email: a.scope.value, role: a.role }));
  }
  async function addMember(id, email) {
    return call('POST', '/calendars/' + encodeURIComponent(id) + '/acl?sendNotifications=true',
      { role: 'writer', scope: { type: 'user', value: email } });
  }
  async function removeMember(id, ruleId) {
    await call('DELETE', '/calendars/' + encodeURIComponent(id) + '/acl/' + encodeURIComponent(ruleId));
  }

  root.GCal = { configure, hasConfig, gisReady, signedIn, connect, disconnect, list, insert, update, remove, fromG, toG,
    setFamily, getFamily, findFamily, createFamily, joinFamily, leaveFamily, members, addMember, removeMember };
})(this);
