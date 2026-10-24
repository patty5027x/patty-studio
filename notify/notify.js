/*
  PATTY.STUDIO 通知小幫手
  GitHub 每 15 分鐘跑一次：讀 Firestore 的資料，該提醒的事就推播到手機鎖定螢幕。
  計算邏輯直接用 index.html 裡的同一份程式（學費、撞期、交件…），所以 app 改了這裡會自動跟上。
  不用改這個檔案；金鑰放在 GitHub 的 Secrets（FIREBASE_SERVICE_ACCOUNT），不要上傳到這裡。
*/
const fs = require('fs'), path = require('path'), vm = require('vm');

/* ---- run the app's own script in a sandbox and pick out the functions we need ---- */
function loadLogic(htmlPath = path.join(__dirname, '..', 'index.html')) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  let src = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const TODAY_FN = 'function todayISO(){return iso(new Date())}';
  if (!src.includes(TODAY_FN)) throw new Error('index.html 的 todayISO 改過了，通知小幫手需要更新');
  src = src.replace(TODAY_FN, 'function todayISO(){return globalThis.__TODAY||iso(new Date())}');
  const el = () => ({ innerHTML: '', textContent: '', hidden: false, value: '', disabled: false, addEventListener() {}, querySelector() { return null }, querySelectorAll() { return [] },
    classList: { toggle() {}, add() {}, remove() {} }, dataset: {}, showModal() {}, close() {}, style: {}, select() {}, remove() {}, focus() {}, setSelectionRange() {}, appendChild() {} });
  const els = {};
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, Intl,
    document: { getElementById: id => els[id] || (els[id] = el()), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el(), body: el(), execCommand() { return true } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { onLine: true, userAgent: 'node' }, location: { href: 'https://local/', protocol: 'https:', pathname: '/', search: '' },
    history: { replaceState() {} }, scrollTo() {}, addEventListener() {}, matchMedia: () => ({ matches: false }),
    window: {}, requestAnimationFrame: f => f()
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src + `
;globalThis.__api={S,eventsOn,evMeta,tuitionAlerts,dueSoon,dueOf,daysBetween,upcomingClashes,clashTxt,vacLessons,pEnd,pRange,
  md,mdw,addDays,toMin,hm,money,dur,src,ST,isLeave,extraName,KIND};`, sandbox, { filename: 'index.html' });
  const api = sandbox.__api;
  api.setToday = d => { sandbox.__TODAY = d };
  api.load = data => { for (const k of Object.keys(api.S)) api.S[k] = data[k] || [] };
  return api;
}

/* local date and minutes-since-midnight in the user's time zone */
function localNow(tz, at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(at).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + (+p.minute) };
}

const DEFAULT_TYPES = { today: true, tuition: true, due: true, clash: true, plan: true, score: true, shootEve: true, lesson: false };
const strip = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/* what is due right now: morning / evening windows (up to 3 hours late is still fine), lessons starting within 30 minutes, test */
function whatsDue(ns, now) {
  const sent = ns.sent || {}, T = { ...DEFAULT_TYPES, ...(ns.types || {}) };
  const toM = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null };
  const inWin = t => { const s = toM(t); return s != null && now.min >= s && now.min < s + 180 };
  return {
    T,
    morning: inWin(ns.morning || '08:00') && !sent['m:' + now.date],
    evening: inWin(ns.evening || '21:00') && !sent['e:' + now.date],
    lesson: !!T.lesson && now.min >= 6 * 60 && now.min < 23 * 60,
    test: !!ns.testAt
  };
}

/* build the messages; returns {msgs, update} where update is merged into the settings doc */
function plan(api, ns, now, due) {
  const { S, eventsOn, evMeta, md, mdw, addDays, toMin, hm, money, dur, src } = api;
  api.setToday(now.date);
  const T = due.T, sent = { ...(ns.sent || {}) }, msgs = [], update = {};
  const add = (key, m) => { msgs.push({ ...m, tag: m.tag || key }); if (key) sent[key] = now.date };
  const live = l => !(l && (api.isLeave(l.status) || l.status === 'moved'));
  const dayItems = d => eventsOn(d).filter(e => (e.k === 'lesson' || e.k === 'extra') ? live(e.l) : e.k === 'shoot' || e.k === 'personal');
  const label = e => strip(evMeta(e).label);

  if (due.test) {
    msgs.push({ title: 'PATTY.STUDIO 測試通知', body: '收到這則就代表鎖定螢幕的提醒設定好了 ☺️', url: './?go=notify', tag: 'test' });
    update.testAt = null;
  }

  if (due.morning) {
    sent['m:' + now.date] = now.date;
    if (T.today) {
      const ev = dayItems(now.date).sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
      const nL = ev.filter(e => e.k === 'lesson' || e.k === 'extra').length, nS = ev.filter(e => e.k === 'shoot').length;
      if (ev.length) {
        const title = nL || nS ? `今天有 ${[nL ? nL + ' 堂課' : '', nS ? nS + ' 個拍攝' : ''].filter(Boolean).join('、')}` : '今天有私人行程';
        const body = ev.map(e => { const x = evMeta(e); const t = x.s != null ? hm(x.s) + ' ' : ''; return (e.k === 'personal' ? '私人：' : '') + t + label(e) }).join('・');
        add(null, { title, body, url: `./?go=sign&d=${now.date}`, tag: 'today-' + now.date });
      }
    }
    if (T.tuition) {
      const ta = api.tuitionAlerts();
      const st = x => x.left > 0 ? `剩 ${x.left} 堂` : x.used ? `已經上了 ${x.used} 堂未繳` : '這期上完了';
      if (ta.length === 1) { const x = ta[0]; add(null, { title: `學費：${x.s.name}${st(x)}`, body: `下一堂是新的一期（${money(x.s.fee * 4)}），點開可以複製提醒訊息`, url: './?go=sign', tag: 'tuition' }) }
      else if (ta.length) add(null, { title: `有 ${ta.length} 位學生要收學費`, body: ta.map(x => `${x.s.name}${st(x)}`).join('・') + '，點開可以複製提醒訊息', url: './?go=sign', tag: 'tuition' });
    }
    if (T.due) for (const i of api.dueSoon()) {
      const left = api.daysBetween(now.date, api.dueOf(i));
      add(null, { title: `交件：「${i.title || '拍攝'}」${left > 0 ? left + ' 天後到期' : left === 0 ? '今天到期' : '已過期 ' + (-left) + ' 天'}`, body: `${md(api.dueOf(i))} 交件，還沒按已交件`, url: `./?go=photo&m=${i.date.slice(0, 7)}`, tag: 'due-' + i.id });
    }
    const allDayPv = x => x.kind === 'personal' && x.s === 0 && x.end >= 1440; /* those are covered by the 私人行程 reminder */
    const cl = api.upcomingClashes(60).filter(c => !allDayPv(c.a) && !allDayPv(c.b)), keys = cl.map(c => `${c.d}|${c.a.key}|${c.b.key}`), seen = new Set(ns.clashSeen || []);
    const fresh = cl.filter((c, k) => !seen.has(keys[k]));
    if (T.clash && fresh.length) {
      const c = fresh[0];
      add(null, fresh.length === 1 ? { title: `${mdw(c.d)} 有撞期`, body: strip(api.clashTxt(c)), url: `./?go=cal&d=${c.d}`, tag: 'clash' }
        : { title: `有 ${fresh.length} 個新的撞期`, body: fresh.slice(0, 4).map(c => `${md(c.d)} ${strip(c.a.label)} ↔ ${strip(c.b.label)}`).join('・'), url: `./?go=cal&d=${c.d}`, tag: 'clash' });
    }
    update.clashSeen = keys;
    if (T.plan) for (const p of S.personal.filter(p => api.pEnd(p) >= now.date)) {
      const pend = api.vacLessons(p).filter(x => x.state === 'pending');
      if (pend.length) add(null, { title: `${p.title || '私人行程'}還有 ${pend.length} 堂課沒安排`, body: pend.slice(0, 3).map(x => `${x.s.name} ${mdw(x.date)}${x.s.time || ''}`).join('・') + (pend.length > 3 ? '…' : ''), url: `./?go=vac&id=${p.id}`, tag: 'plan-' + p.id });
    }
  }

  if (due.evening) {
    sent['e:' + now.date] = now.date;
    const tm = addDays(now.date, 1);
    if (T.score) {
      const sc = []; for (const s of S.students) for (const x of (s.scores || [])) if (!x.brought && x.date === tm) sc.push(`「${x.title || '樂譜'}」給${s.name}`);
      if (sc.length) add(null, { title: '明天要帶譜', body: sc.join('・'), url: `./?go=sign&d=${tm}`, tag: 'score-' + tm });
    }
    if (T.shootEve) for (const i of S.income.filter(i => i.type === 'photo' && i.date === tm).sort((a, b) => (a.time || '').localeCompare(b.time || ''))) {
      add(null, { title: `明天有拍攝：${i.title || '拍攝'}`, body: [i.time ? i.time + (i.endTime ? '–' + i.endTime : '') : '', i.place || '', i.client || ''].filter(Boolean).join('・') || mdw(tm), url: `./?go=sign&d=${tm}`, tag: 'shoot-' + i.id });
    }
  }

  if (due.lesson) {
    for (const e of dayItems(now.date)) {
      if (e.k !== 'lesson' && e.k !== 'extra') continue;
      const x = evMeta(e); if (x.s == null) continue;
      const key = `l:${now.date}:${e.l?.id || e.s?.id}`;
      if (sent[key] || now.min < x.s - 30 || now.min >= x.s) continue;
      const stu = e.k === 'extra' ? api.ST(e.l.studentId) : e.s;
      const mins = +(e.l?.minutes ?? stu?.minutes ?? src(stu).def);
      add(key, { title: `${hm(x.s)} ${label(e)}`, body: `${x.s - now.min} 分鐘後上課・${stu?.instrument ? stu.instrument + '・' : ''}${dur(mins)}`, url: `./?go=sign&d=${now.date}`, tag: key });
    }
  }

  /* keep the "already sent" list short */
  const cut = addDays(now.date, -3);
  update.sent = Object.fromEntries(Object.entries(sent).filter(([, d]) => d >= cut));
  return { msgs, update };
}

async function loadCols(userRef, cols, lessonDate) {
  const out = {};
  await Promise.all(cols.map(async c => {
    let q = userRef.collection(c);
    if (c === 'lessons' && lessonDate) q = q.where('date', '==', lessonDate);
    const snap = await q.get();
    out[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }));
  return out;
}

async function main() {
  const admin = require('firebase-admin');
  const raw = process.env.SERVICE_ACCOUNT;
  if (!raw) throw new Error('找不到 FIREBASE_SERVICE_ACCOUNT（GitHub Secrets）');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  const db = admin.firestore(), api = loadLogic(), dry = !!process.env.DRY_RUN;
  const users = await db.collection('users').listDocuments();
  for (const u of users) {
    try {
      const nsRef = u.collection('settings').doc('notify');
      const nsSnap = await nsRef.get();
      const ns = nsSnap.exists ? nsSnap.data() : null;
      if (!ns || !(ns.tokens || []).length) continue;
      const now = localNow(ns.tz), due = whatsDue(ns, now);
      if (!due.morning && !due.evening && !due.lesson && !due.test) continue;
      const full = due.morning || due.evening;
      const data = full ? await loadCols(u, ['students', 'lessons', 'payments', 'income', 'personal'])
        : due.lesson ? await loadCols(u, ['students', 'lessons', 'personal'], now.date) : {};
      api.load(data);
      const { msgs, update } = plan(api, ns, now, due);
      console.log(`${now.date} ${String(Math.floor(now.min / 60)).padStart(2, '0')}:${String(now.min % 60).padStart(2, '0')} ${ns.tz}: ${msgs.length} 則`);
      const bad = new Set();
      for (const m of msgs) for (const token of ns.tokens) {
        if (dry) { console.log('  [試跑]', m.title, '｜', m.body); continue }
        try {
          await admin.messaging().send({ token, data: { title: m.title, body: m.body, url: m.url || './', tag: m.tag || '' }, webpush: { headers: { Urgency: 'high', TTL: '43200' } } });
        } catch (e) {
          const code = e.errorInfo?.code || e.code || '';
          if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) bad.add(token);
          else console.error('  傳送失敗', code, e.message);
        }
      }
      if (bad.size) update.tokens = admin.firestore.FieldValue.arrayRemove(...bad);
      if (update.testAt === null) update.testAt = admin.firestore.FieldValue.delete();
      if (!dry) await nsRef.set(update, { merge: true });
    } catch (e) { console.error('使用者', u.id, '出錯：', e.message) }
  }
}

module.exports = { loadLogic, localNow, whatsDue, plan };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1) });
