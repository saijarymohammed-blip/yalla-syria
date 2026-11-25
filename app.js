/* =========================================================
   يلا سوريا — واجهة التطبيق (Vanilla JS، بدون أي مكتبات عدا Leaflet للخرائط)
   ========================================================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('ar-EG');
const n = x => nf.format(x);
const fmtTime = ts => new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
const fmtDate = ts => new Date(ts).toLocaleDateString('ar-SY', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateLong = d => d.toLocaleDateString('ar-SY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtHours = ms => { const m = Math.round(ms / 60000), h = Math.floor(m / 60); return h ? `${n(h)}س ${n(m % 60)}د` : `${n(m % 60)}د`; };
const pad = x => String(x).padStart(2, '0');
const toLocalInput = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const state = {
  mvDate: Store.dayKey(Date.now()),
  dyDate: Store.dayKey(Date.now()),
  hFrom: Store.dayKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()),
  hTo: Store.dayKey(Date.now()),
  reportsOpen: true
};

const titles = {
  '': 'لوحة الإدارة', present: 'المتواجدون حالياً', movements: 'حركات المتطوعين', daily: 'التقرير اليومي',
  hours: 'حاسبة ساعات التطوع', circulars: 'التعاميم', map: 'خريطة المتطوعين', volunteers: 'المتطوعون',
  settings: 'الإعدادات', checkin: 'تسجيل حضور / انصراف'
};

/* ---------- واجهات صغيرة مساعدة ---------- */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}
function modal(title, html, onSubmit) {
  $('#modalRoot').innerHTML = `<div class="modal-bg" onclick="if(event.target===this)App.closeModal()">
    <form class="modal" id="mForm"><h3>${esc(title)}</h3>${html}
    <div class="actions" style="margin-top:16px"><button class="btn" type="submit">حفظ</button>
    <button class="btn ghost" type="button" onclick="App.closeModal()">إلغاء</button></div></form></div>`;
  $('#mForm').onsubmit = e => { e.preventDefault(); onSubmit(new FormData(e.target)); };
}
const volOptions = sel => Store.data.volunteers.map(v => `<option value="${v.id}" ${v.id === sel ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
const statusBadge = s => ({
  present: '<span class="badge b-green">حاضر</span>', left: '<span class="badge b-blue">انصرف</span>',
  absent: '<span class="badge b-red">غائب</span>', leave: '<span class="badge b-amber">إجازة</span>'
}[s]);
const emptyMsg = t => `<div class="empty">${t}</div>`;

/* ---------- الصفحات ---------- */
function statCard(cls, icon, num, label, total, href) {
  return `<a class="card stat c-${cls}" href="${href}"><span class="ico">${icon}</span>
    <div class="num">${n(num)}</div><div class="lbl">${label}</div><div class="of">من ${n(total)}</div>
    ${href !== '#/' ? '<span class="chev">‹</span>' : ''}</a>`;
}

function dashboard() {
  const s = Store.stats(), org = Store.data.settings.org;
  const [f, t] = Store.dayRange(Store.todayKey());
  const last = Store.moves(f, t).slice(-5).reverse();
  const depts = Store.data.depts.concat(['بدون قسم']).map(d => {
    const vs = Store.activeVols().filter(v => (v.dept || 'بدون قسم') === d);
    if (!vs.length) return '';
    const att = vs.filter(v => ['present', 'left'].includes(Store.statusToday(v.id))).length;
    return `<div class="row" style="display:block"><div style="display:flex;justify-content:space-between"><b>${esc(d)}</b><span class="muted">${n(att)} / ${n(vs.length)}</span></div>
      <div class="bar"><i style="width:${att / vs.length * 100}%"></i></div></div>`;
  }).join('');
  const loc = Store.recentLocations();
  return `
  <h2 class="title">${esc(org)}</h2><div class="sub">${fmtDateLong(new Date())}</div>
  <div class="grid2">
    ${statCard('green', '✔', s.present.length, 'الحاضرون الآن', s.total, '#/present')}
    ${statCard('red', '🚫', s.absent.length, 'الغائبون', s.total, '#/daily')}
    ${statCard('blue', '🏖', s.leave.length, 'في إجازة اليوم', s.total, '#/volunteers')}
    <div class="card ring-card"><div class="ring ${s.rate >= 50 ? 'ok' : ''}" style="--p:${s.rate}"><span>${n(s.rate)}%</span></div><div>نسبة الحضور</div></div>
  </div>
  <h3 class="sec">ساعات التطوع اليوم</h3>
  <div class="grid2">
    <div class="card stat c-teal"><span class="ico">⏱</span><div class="num">${fmtHours(s.totalMs)}</div><div class="lbl">إجمالي الساعات</div></div>
    <div class="card stat c-blue"><span class="ico">👤</span><div class="num">${fmtHours(s.avgMs)}</div><div class="lbl">متوسط ساعات المتطوع</div></div>
  </div>
  <div class="card" style="margin-top:12px">
    <div class="row"><b>الحاضرون الآن</b><span class="badge">${n(s.present.length)}</span></div>
    ${s.present.map(v => `<div class="row"><span>${esc(v.name)}</span><span class="muted">${esc(v.dept || '')}</span></div>`).join('')}
  </div>
  <h3 class="sec">خريطة مواقع المتطوعين</h3>
  <div class="card"><div class="map" id="map"></div>
    <div class="legend"><a href="#/map"><b>فتح الخريطة كاملة</b></a>
      <div><div><span class="dot" style="background:#2e7d32"></span>داخل الموقع (${n(loc.filter(l => l.inside).length)})</div>
      <div><span class="dot" style="background:#d33a3a"></span>خارج الموقع (${n(loc.filter(l => !l.inside).length)})</div></div></div>
    <div class="muted" style="margin-top:6px">آخر المواقع المعروفة · آخر 5 ساعات</div></div>
  <h3 class="sec">آخر الحركات</h3>
  <div class="card">${last.length ? last.map(m => `<div class="row"><span>${esc(Store.vol(m.vid)?.name)}</span>
    <span>${m.type === 'in' ? '<span class="badge b-green">دخول</span>' : '<span class="badge b-blue">خروج</span>'} <span class="muted">${fmtTime(m.ts)}</span></span></div>`).join('') : emptyMsg('لا توجد حركات اليوم بعد')}</div>
  <h3 class="sec">الحضور حسب القسم</h3><div class="card">${depts || emptyMsg('لا يوجد متطوعون')}</div>
  <h3 class="sec">إجراءات سريعة</h3>
  <div class="quick">
    <a class="card" href="#/checkin"><span class="qi">📍</span>تسجيل حضور</a>
    <a class="card" href="#/daily"><span class="qi">📅</span>التقرير اليومي</a>
    <a class="card" href="#/movements"><span class="qi">📋</span>حركات المتطوعين</a>
    <a class="card" href="#/circulars"><span class="qi">📢</span>إرسال تعميم</a>
    <a class="card" href="#/volunteers"><span class="qi">👥</span>إدارة المتطوعين</a>
    <a class="card" href="#/settings"><span class="qi">⚙️</span>الإعدادات</a>
  </div>`;
}

function present() {
  const list = Store.stats().present;
  return `<div class="card">${list.length ? list.map(v => {
    const [f, t] = Store.dayRange(Store.todayKey());
    const ses = Store.sessions(v.id, f, t).filter(x => x.open)[0];
    return `<div class="row"><div><b>${esc(v.name)}</b><div class="muted">${esc(v.dept || '')} · منذ ${ses ? fmtTime(ses.start) : ''}</div></div>
      <span class="badge b-green">${ses ? fmtHours(ses.end - ses.start) : ''}</span></div>`;
  }).join('') : emptyMsg('لا يوجد متطوعون حاضرون الآن')}</div>`;
}

function movements() {
  const [f, t] = Store.dayRange(state.mvDate), list = Store.moves(f, t).reverse();
  return `<div class="toolbar"><input type="date" value="${state.mvDate}" style="width:auto" onchange="App.set('mvDate',this.value)">
    <button class="btn" onclick="App.moveForm()">+ تسجيل حركة</button></div>
  <div class="card">${list.length ? list.map(m => {
    const ins = Store.insideSite(m);
    return `<div class="row"><div><b>${esc(Store.vol(m.vid)?.name || '—')}</b>
      <div class="muted">${fmtTime(m.ts)} · ${ins === null ? 'بدون موقع' : ins ? 'داخل الموقع' : 'خارج الموقع'}</div></div>
      <div class="actions">${m.type === 'in' ? '<span class="badge b-green">دخول</span>' : '<span class="badge b-blue">خروج</span>'}
      <button class="btn ghost sm" onclick="App.moveForm('${m.id}')">تعديل</button></div></div>`;
  }).join('') : emptyMsg('لا توجد حركات في هذا اليوم')}</div>`;
}

function daily() {
  const key = state.dyDate, [f, t] = Store.dayRange(key);
  const rows = Store.activeVols().map(v => {
    const mv = Store.moves(f, t, v.id), ins = mv.find(m => m.type === 'in'), outs = mv.filter(m => m.type === 'out');
    const leave = Store.onLeave(v.id, key);
    const st = leave ? 'leave' : !mv.length ? 'absent' : (mv[mv.length - 1].type === 'in' && key === Store.todayKey() ? 'present' : 'left');
    return `<tr><td>${esc(v.name)}</td><td>${statusBadge(st)}</td><td>${ins ? fmtTime(ins.ts) : '—'}</td>
      <td>${outs.length ? fmtTime(outs[outs.length - 1].ts) : '—'}</td><td>${fmtHours(Store.hours(v.id, f, t))}</td></tr>`;
  }).join('');
  return `<div class="toolbar"><input type="date" value="${key}" style="width:auto" onchange="App.set('dyDate',this.value)">
    <button class="btn ghost" onclick="window.print()">🖨 طباعة</button></div>
  <div class="card tscroll"><table><thead><tr><th>المتطوع</th><th>الحالة</th><th>الدخول</th><th>الخروج</th><th>الساعات</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="5">${emptyMsg('لا يوجد متطوعون')}</td></tr>`}</tbody></table></div>`;
}

function hoursCalc() {
  const f = new Date(state.hFrom + 'T00:00:00').getTime(), t = new Date(state.hTo + 'T00:00:00').getTime() + 86400e3;
  let total = 0;
  const rows = Store.activeVols().map(v => {
    const ms = Store.hours(v.id, f, t); total += ms;
    const days = new Set(Store.moves(f, t, v.id).filter(m => m.type === 'in').map(m => Store.dayKey(m.ts))).size;
    return { v, ms, days };
  });
  window._hoursRows = rows;
  return `<div class="toolbar"><div><label>من</label><input type="date" value="${state.hFrom}" onchange="App.set('hFrom',this.value)"></div>
    <div><label>إلى</label><input type="date" value="${state.hTo}" onchange="App.set('hTo',this.value)"></div></div>
  <div class="card tscroll"><table><thead><tr><th>المتطوع</th><th>القسم</th><th>أيام الحضور</th><th>الساعات</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${esc(r.v.name)}</td><td>${esc(r.v.dept || '')}</td><td>${n(r.days)}</td><td>${fmtHours(r.ms)}</td></tr>`).join('')}
  <tr><td colspan="3"><b>الإجمالي</b></td><td><b>${fmtHours(total)}</b></td></tr></tbody></table></div>
  <button class="btn" style="margin-top:12px" onclick="App.exportCsv()">⬇ تصدير CSV</button>`;
}

function circulars() {
  const admin = Store.role === 'admin';
  return `${admin ? `<div class="card"><form onsubmit="App.sendCircular(event)">
    <label>عنوان التعميم</label><input name="title" required>
    <label>نص التعميم</label><textarea name="body" required></textarea>
    <button class="btn big" style="font-size:16px;padding:12px">إرسال التعميم</button></form></div>` : ''}
  <h3 class="sec">التعاميم الصادرة</h3>
  ${Store.data.circulars.length ? Store.data.circulars.map(c => `<div class="card" style="margin-bottom:10px">
    <b>${esc(c.title)}</b><div class="muted">${fmtDate(c.ts)} · ${fmtTime(c.ts)}</div>
    <p style="white-space:pre-wrap">${esc(c.body)}</p>
    <div class="actions"><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(c.title + '\n\n' + c.body)}">مشاركة واتساب</a>
    ${admin ? `<button class="btn danger sm" onclick="App.delCircular('${c.id}')">حذف</button>` : ''}</div></div>`).join('') : emptyMsg('لا توجد تعاميم')}`;
}

function mapPage() { return `<div class="card"><div class="map big" id="map"></div></div>`; }

function volunteers() {
  const key = Store.todayKey();
  return `<div class="toolbar"><button class="btn" onclick="App.volForm()">+ إضافة متطوع</button></div>
  ${Store.data.volunteers.map(v => `<div class="card" style="margin-bottom:10px">
    <div class="row" style="border:0;padding-top:0"><div><b>${esc(v.name)}</b><div class="muted">${esc(v.dept || 'بدون قسم')} · ${esc(v.phone || '')}</div></div>
    ${v.active ? statusBadge(Store.statusToday(v.id)) : '<span class="badge">غير نشط</span>'}</div>
    <div class="actions"><button class="btn ghost sm" onclick="App.volForm('${v.id}')">تعديل</button>
    <button class="btn ghost sm" onclick="App.leave('${v.id}')">${Store.onLeave(v.id, key) ? 'إلغاء الإجازة' : 'إجازة اليوم'}</button>
    <button class="btn danger sm" onclick="App.delVol('${v.id}')">حذف</button></div></div>`).join('') || emptyMsg('لا يوجد متطوعون')}`;
}

function checkin() {
  const mine = Store.role === 'volunteer' ? Store.vol(Store.myVolId) : null;
  if (Store.role === 'volunteer' && !mine) return `<div class="card">${emptyMsg('حسابك غير مرتبط بسجل متطوع. تواصل مع المدير.')}</div>`;
  return `<div class="card">${mine
    ? `<h3 style="margin:0 0 6px">أهلاً ${esc(mine.name)}</h3><div>${statusBadge(Store.statusToday(mine.id))}</div><input type="hidden" id="ciVol" value="${mine.id}">`
    : `<label>اختر المتطوع</label><select id="ciVol">${volOptions(localStorage.getItem('yalla_me'))}</select>`}
    <button class="btn big" onclick="App.punch('in')">✔ تسجيل حضور</button>
    <button class="btn big" style="background:var(--bar)" onclick="App.punch('out')">⎋ تسجيل انصراف</button>
    <p class="muted">سيُسجَّل موقعك تلقائياً إن سمحت بذلك.</p></div>`;
}

function settings() {
  const s = Store.data.settings;
  return `<div class="card"><form onsubmit="App.saveSettings(event)">
    <label>اسم الفريق</label><input name="org" value="${esc(s.org)}">
    <label>اسم المدير</label><input name="adminName" value="${esc(s.adminName)}">
    <label>خط عرض موقع العمل</label><input name="workLat" type="number" step="any" value="${s.workLat}">
    <label>خط طول موقع العمل</label><input name="workLng" type="number" step="any" value="${s.workLng}">
    <button type="button" class="btn ghost sm" style="margin-top:8px" onclick="App.useMyLocation()">📍 استخدام موقعي الحالي</button>
    <label>نصف قطر الموقع (متر)</label><input name="radius" type="number" value="${s.radius}">
    <label>الأقسام (افصل بينها بفاصلة)</label><input name="depts" value="${esc(Store.data.depts.join('، '))}">
    <button class="btn big" style="font-size:16px;padding:12px">حفظ الإعدادات</button></form></div>
  <h3 class="sec">النسخ الاحتياطي</h3>
  <div class="actions"><button class="btn ghost" onclick="App.backup()">⬇ تنزيل نسخة احتياطية</button>
  ${Store.mode === 'local' ? '<button class="btn danger" onclick="App.resetDemo()">مسح كل البيانات</button>' : ''}</div>`;
}

/* ---------- الخريطة ---------- */
let mapObj = null;
function buildMap() {
  const el = $('#map'); if (!el) return;
  if (typeof L === 'undefined') { el.innerHTML = emptyMsg('تعذّر تحميل الخريطة (يلزم اتصال بالإنترنت)'); return; }
  const s = Store.data.settings;
  if (mapObj) { mapObj.remove(); mapObj = null; }
  mapObj = L.map(el).setView([s.workLat, s.workLng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapObj);
  L.circle([s.workLat, s.workLng], { radius: s.radius, color: '#0f8a73', fillOpacity: .08 }).addTo(mapObj);
  const locs = Store.recentLocations(), pts = [[s.workLat, s.workLng]];
  locs.forEach(l => {
    L.circleMarker([l.move.lat, l.move.lng], { radius: 9, color: '#fff', weight: 2, fillColor: l.inside ? '#2e7d32' : '#d33a3a', fillOpacity: 1 })
      .addTo(mapObj).bindPopup(`<b>${esc(l.vol.name)}</b><br>${fmtTime(l.move.ts)}`);
    pts.push([l.move.lat, l.move.lng]);
  });
  if (pts.length > 1) mapObj.fitBounds(pts, { padding: [30, 30] });
  setTimeout(() => mapObj && mapObj.invalidateSize(), 200);
}

/* ---------- القائمة الجانبية ---------- */
function drawer() {
  const s = Store.data.settings, cur = location.hash.replace('#/', '');
  const it = (h, ic, t) => `<a class="d-item ${cur === h ? 'on' : ''}" href="#/${h}"><span class="di">${ic}</span>${t}</a>`;
  const admin = Store.role === 'admin';
  const who = Store.profile ? Store.profile.name : s.adminName;
  const body = admin
    ? `${it('', '🏠', 'الرئيسية')}${it('volunteers', '👥', 'المتطوعون')}${it('checkin', '📍', 'تسجيل حضور / انصراف')}
      <div class="d-group" onclick="App.toggleReports()"><span>📊 التقارير</span><span>${state.reportsOpen ? '⌃' : '⌄'}</span></div>
      ${state.reportsOpen ? it('present', '✔', 'المتواجدون حالياً') + it('movements', '📋', 'حركات المتطوعين / تعديل') + it('daily', '📅', 'التقرير اليومي') + it('hours', '🧮', 'حاسبة ساعات التطوع') + it('map', '🗺', 'خريطة المتطوعين') : ''}
      ${it('circulars', '📢', 'التعاميم الصادرة')}${it('settings', '⚙️', 'الإعدادات')}`
    : `${it('checkin', '📍', 'تسجيل حضور / انصراف')}${it('circulars', '📢', 'التعاميم')}`;
  $('#drawer').innerHTML = `
    <div class="d-head"><div class="logo">يلا سوريا</div><h2>${esc(who)}</h2>
      <div class="chips"><span class="chip">الدور: ${admin ? 'مدير' : 'متطوع'}</span></div><div style="margin-top:8px;opacity:.85">${esc(s.org)}</div></div>
    <div class="d-body">${body}</div>
    <div class="d-foot"><span>v1.3.0</span><button class="logout" onclick="App.logout()">تسجيل الخروج ⎋</button></div>`;
}

/* ---------- التوجيه والعرض ---------- */
const routes = { '': dashboard, present, movements, daily, hours: hoursCalc, circulars, map: mapPage, volunteers, settings, checkin };

function render() {
  let r = (location.hash.replace('#/', '') || '').split('?')[0];
  if (Store.role === 'volunteer' && !['checkin', 'circulars'].includes(r)) r = 'checkin';
  const fn = routes[r] || dashboard;
  App.toggleDrawer(false);
  $('#view').innerHTML = installBanner() + fn();
  $('#pageTitle').textContent = titles[r] ?? titles[''];
  drawer();
  if (r === '' || r === 'map') buildMap();
  window.scrollTo(0, 0);
}

/* ---------- الإجراءات ---------- */
const App = {
  toggleDrawer(show) {
    const d = $('#drawer'), o = $('#overlay');
    const on = show === undefined ? !d.classList.contains('show') : show;
    d.classList.toggle('show', on); o.classList.toggle('show', on);
  },
  toggleReports() { state.reportsOpen = !state.reportsOpen; drawer(); $('#drawer').classList.add('show'); },
  async refresh(silent) {
    try { await Store.loadAll(); render(); if (silent !== true) toast('تم التحديث'); }
    catch (e) { toast('تعذّر التحديث: ' + e.message); }
  },
  async logout() { await Store.signOut(); location.hash = ''; showLogin(); },
  set(k, v) { state[k] = v; render(); },
  closeModal() { $('#modalRoot').innerHTML = ''; },

  /* المتطوعون */
  volForm(id) {
    const v = id ? Store.vol(id) : { name: '', dept: '', phone: '' };
    modal(id ? 'تعديل متطوع' : 'إضافة متطوع', `
      <label>الاسم</label><input name="name" required value="${esc(v.name)}">
      <label>القسم</label><select name="dept"><option value="">بدون قسم</option>${Store.data.depts.map(d => `<option ${d === v.dept ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
      <label>رقم الهاتف</label><input name="phone" type="tel" value="${esc(v.phone)}">
      <label>الحالة</label><select name="active"><option value="1" ${v.active !== false ? 'selected' : ''}>نشط</option><option value="0" ${v.active === false ? 'selected' : ''}>غير نشط</option></select>`,
      fd => { Store.saveVol({ id, name: fd.get('name').trim(), dept: fd.get('dept'), phone: fd.get('phone').trim(), active: fd.get('active') === '1' }); App.closeModal(); render(); toast('تم الحفظ'); });
  },
  delVol(id) { if (confirm('حذف المتطوع وكل حركاته؟')) { Store.deleteVol(id); render(); } },
  leave(id) { Store.toggleLeave(id, Store.todayKey()); render(); },

  /* الحركات */
  moveForm(id) {
    const m = id ? Store.data.movements.find(x => x.id === id) : { vid: '', type: 'in', ts: Date.now() };
    modal(id ? 'تعديل حركة' : 'تسجيل حركة', `
      <label>المتطوع</label><select name="vid">${volOptions(m.vid)}</select>
      <label>النوع</label><select name="type"><option value="in" ${m.type === 'in' ? 'selected' : ''}>دخول</option><option value="out" ${m.type === 'out' ? 'selected' : ''}>خروج</option></select>
      <label>الوقت</label><input type="datetime-local" name="ts" required value="${toLocalInput(m.ts)}">
      ${id ? '<button type="button" class="btn danger sm" style="margin-top:12px" onclick="App.delMove(\'' + id + '\')">حذف الحركة</button>' : ''}`,
      fd => {
        const patch = { vid: fd.get('vid'), type: fd.get('type'), ts: new Date(fd.get('ts')).getTime() };
        id ? Store.updateMove(id, patch) : Store.addMove(patch);
        App.closeModal(); render(); toast('تم الحفظ');
      });
  },
  delMove(id) { if (confirm('حذف هذه الحركة؟')) { Store.deleteMove(id); App.closeModal(); render(); } },

  /* تسجيل حضور/انصراف مع الموقع */
  punch(type) {
    const vid = $('#ciVol').value; if (!vid) return toast('أضف متطوعاً أولاً');
    localStorage.setItem('yalla_me', vid);
    const save = (lat, lng) => {
      const last = Store.moves(...Store.dayRange(Store.todayKey()), vid).pop();
      if (last && last.type === type) return toast(type === 'in' ? 'أنت مسجَّل حضوراً مسبقاً' : 'أنت مسجَّل انصرافاً مسبقاً');
      if (!last && type === 'out') return toast('لا يوجد حضور مسجَّل اليوم');
      Store.addMove({ vid, type, ts: Date.now(), lat, lng });
      toast(type === 'in' ? 'تم تسجيل الحضور ✔' : 'تم تسجيل الانصراف ✔');
      render();
    };
    if (!navigator.geolocation) return save(null, null);
    navigator.geolocation.getCurrentPosition(p => save(p.coords.latitude, p.coords.longitude), () => save(null, null), { timeout: 8000, enableHighAccuracy: true });
  },

  /* التعاميم */
  sendCircular(e) {
    e.preventDefault(); const fd = new FormData(e.target);
    Store.addCircular({ title: fd.get('title').trim(), body: fd.get('body').trim() });
    render(); toast('تم إصدار التعميم');
  },
  delCircular(id) { if (confirm('حذف التعميم؟')) { Store.deleteCircular(id); render(); } },

  /* الإعدادات */
  saveSettings(e) {
    e.preventDefault(); const fd = new FormData(e.target), s = Store.data.settings;
    s.org = fd.get('org').trim() || s.org; s.adminName = fd.get('adminName').trim();
    s.workLat = +fd.get('workLat'); s.workLng = +fd.get('workLng'); s.radius = +fd.get('radius') || 300;
    Store.data.depts = fd.get('depts').split(/[,،]/).map(x => x.trim()).filter(Boolean);
    Store.saveSettings(); render(); toast('تم حفظ الإعدادات');
  },
  useMyLocation() {
    if (!navigator.geolocation) return toast('المتصفح لا يدعم تحديد الموقع');
    navigator.geolocation.getCurrentPosition(p => {
      document.querySelector('[name=workLat]').value = p.coords.latitude.toFixed(6);
      document.querySelector('[name=workLng]').value = p.coords.longitude.toFixed(6);
      toast('تم التقاط موقعك — اضغط حفظ');
    }, () => toast('تعذّر تحديد الموقع'), { enableHighAccuracy: true, timeout: 10000 });
  },
  resetDemo() { if (confirm('سيتم حذف كل المتطوعين والحركات والتعاميم نهائياً. متابعة؟')) { Store.reset(); render(); toast('تم مسح البيانات'); } },
  backup() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(Store.data, null, 2)], { type: 'application/json' }));
    a.download = `yalla-syria-backup-${Store.todayKey()}.json`; a.click();
  },
  exportCsv() {
    const rows = [['المتطوع', 'القسم', 'أيام الحضور', 'الساعات']].concat(window._hoursRows.map(r => [r.v.name, r.v.dept || '', r.days, (r.ms / 3600e3).toFixed(2)]));
    const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `hours-${state.hFrom}_${state.hTo}.csv`; a.click();
  }
};

/* ---------- تثبيت التطبيق على الجوال (PWA) ---------- */
let deferredInstall = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const canRender = () => typeof booted !== 'undefined' && booted && Store.data && !document.body.classList.contains('auth');
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (canRender()) render(); else if (document.body.classList.contains('auth')) showLogin(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; if (canRender()) render(); toast('تم تثبيت التطبيق ✔'); });
function installBanner() {
  if (isStandalone() || localStorage.getItem('yalla_install_hide')) return '';
  if (deferredInstall) return `<div class="card install"><span class="qi">📲</span><div style="flex:1"><b>ثبّت التطبيق على جوالك</b><div class="muted">يفتح من الشاشة الرئيسية كأي تطبيق</div></div>
    <button class="btn sm" onclick="App.install()">تثبيت</button><button class="x" onclick="App.hideInstall()">×</button></div>`;
  if (isIOS()) return `<div class="card install"><span class="qi">📲</span><div style="flex:1"><b>لتثبيت التطبيق على الآيفون</b><div class="muted">افتح الصفحة في Safari ← اضغط زر المشاركة ⎙ ← "إضافة إلى الشاشة الرئيسية"</div></div>
    <button class="x" onclick="App.hideInstall()">×</button></div>`;
  return '';
}
Object.assign(App, {
  async install() {
    if (!deferredInstall) return;
    deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; render();
  },
  hideInstall() { localStorage.setItem('yalla_install_hide', '1'); render(); }
});
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ---------- تسجيل الدخول ---------- */
let loginTab = 'in';
function showLogin(msg) {
  document.body.classList.add('auth');
  $('#pageTitle').textContent = 'يلا سوريا';
  const local = Store.mode === 'local', acc = local ? Store.localAccount() : null;
  const up = local ? !acc : loginTab === 'up';
  const head = `<div class="logo">يلا سوريا</div><h2>${up ? (local ? 'إنشاء حساب المدير' : 'إنشاء حساب') : 'تسجيل الدخول'}</h2>`;
  const err = `<div class="err" id="loginErr">${esc(msg || '')}</div>`;
  const btn = `<button class="btn big" style="font-size:16px;padding:12px">${up ? 'إنشاء الحساب' : 'دخول'}</button>`;
  let form;
  if (local) {
    form = `${acc ? `<p class="muted" style="text-align:center">مرحباً ${esc(acc.name)}</p>` : '<p class="muted" style="text-align:center">أول استخدام: اختر اسماً وكلمة مرور للمدير.</p>'}
      <form onsubmit="App.doLogin(event)">
      ${acc ? '' : '<label>الاسم</label><input name="name" required autocomplete="name">'}
      <label>كلمة المرور</label><input name="password" type="password" required minlength="4" autocomplete="${acc ? 'current-password' : 'new-password'}" dir="ltr">
      ${err}${btn}</form>`;
  } else {
    form = `<div class="tabs"><button class="${up ? '' : 'on'}" onclick="App.loginTab('in')">دخول</button><button class="${up ? 'on' : ''}" onclick="App.loginTab('up')">حساب جديد</button></div>
      <form onsubmit="App.doLogin(event)">
      ${up ? '<label>الاسم الكامل</label><input name="name" required autocomplete="name">' : ''}
      <label>البريد الإلكتروني</label><input name="email" type="email" required autocomplete="email" dir="ltr">
      <label>كلمة المرور</label><input name="password" type="password" required minlength="6" autocomplete="${up ? 'new-password' : 'current-password'}" dir="ltr">
      ${err}${btn}</form>
      ${up ? '<p class="muted">أول حساب يُنشأ في النظام يصبح مديراً تلقائياً.</p>' : ''}`;
  }
  $('#view').innerHTML = installBanner() + `<div class="card login">${head}${form}</div>`;
}
Object.assign(App, {
  loginTab(t) { loginTab = t; showLogin(); },
  async doLogin(e) {
    e.preventDefault(); const fd = new FormData(e.target), err = $('#loginErr');
    err.textContent = 'جارٍ المعالجة…';
    try {
      if (Store.mode === 'local') {
        if (Store.localAccount()) await Store.localSignIn(fd.get('password'));
        else await Store.localCreate(fd.get('name').trim(), fd.get('password'));
        await start(); return;
      }
      if (loginTab === 'up') {
        const ok = await Store.signUp(fd.get('email').trim(), fd.get('password'), fd.get('name').trim());
        if (!ok) { err.textContent = 'تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيده ثم سجّل الدخول.'; return; }
      } else await Store.signIn(fd.get('email').trim(), fd.get('password'));
      await start();
    } catch (ex) {
      const m = String(ex.message || ex);
      err.textContent = /Invalid login/i.test(m) ? (Store.mode === 'local' ? 'كلمة المرور غير صحيحة' : 'البريد أو كلمة المرور غير صحيحة') : /already/i.test(m) ? 'هذا البريد مسجَّل مسبقاً' : /confirm/i.test(m) ? 'يرجى تأكيد بريدك الإلكتروني أولاً' : m;
    }
  }
});

/* ---------- تشغيل ---------- */
let booted = false;
async function start() {
  document.body.classList.remove('auth');
  await Store.loadAll();
  if (!booted) {
    window.addEventListener('hashchange', render);
    // تحديث تلقائي كل دقيقة في الوضع السحابي (للمدير)
    setInterval(() => { if (Store.mode === 'cloud' && Store.user && Store.role === 'admin' && !document.hidden && !$('#modalRoot').innerHTML) App.refresh(true); }, 60000);
    booted = true;
  }
  render();
}
(async () => {
  try {
    await Store.init();
    if (Store.needsLogin()) return showLogin();
    await start();
  } catch (e) {
    document.body.classList.add('auth');
    $('#view').innerHTML = `<div class="card login"><h2>تعذّر التشغيل</h2><p class="err">${esc(e.message || e)}</p>
      <p class="muted">تأكد من صحة إعدادات js/config.js وتشغيل ملف schema.sql في Supabase.</p></div>`;
  }
})();
