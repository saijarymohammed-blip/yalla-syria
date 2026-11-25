/* =========================================================
   طبقة البيانات (Data Layer)
   - الوضع المحلي (local): يخزّن في localStorage — يعمل بدون إعداد.
   - الوضع السحابي (cloud): Supabase (قاعدة بيانات + تسجيل دخول + صلاحيات)
     يُفعَّل تلقائياً عند تعبئة js/config.js.
   الذاكرة (Store.data) تُحمَّل كاملة عند الدخول، والكتابة تُرسَل للخادم فوراً.
   ========================================================= */
const DB_KEY = 'yalla_syria_v1';
const DEFAULT_SETTINGS = { org: 'يلا سوريا', adminName: 'مدير الفريق', workLat: 33.5138, workLng: 36.2765, radius: 300 };

const Store = {
  data: null,
  mode: 'local',      // 'local' | 'cloud'
  sb: null,           // عميل Supabase
  user: null,         // المستخدم المسجَّل (cloud)
  profile: null,      // {id,name,role}
  role: 'admin',      // 'admin' | 'volunteer'
  myVolId: null,      // سجل المتطوع المرتبط بحساب المستخدم

  /* ---------- التهيئة والدخول ---------- */
  async init() {
    const c = window.YALLA_CONFIG || {};
    if (c.SUPABASE_URL && c.SUPABASE_ANON_KEY) {
      if (!window.supabase) throw new Error('تعذّر تحميل مكتبة الخادم. تحقق من اتصال الإنترنت.');
      this.mode = 'cloud';
      this.sb = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
      const { data } = await this.sb.auth.getSession();
      this.user = data.session ? data.session.user : null;
      if (this.user) await this.loadProfile();
    } else {
      this.mode = 'local'; this.role = 'admin';
      if (!this.needsLogin()) this._localLogged();
    }
  },
  async loadProfile() {
    const { data } = await this.sb.from('profiles').select('*').eq('id', this.user.id).maybeSingle();
    this.profile = data; this.role = data && data.role === 'admin' ? 'admin' : 'volunteer';
  },
  async signIn(email, password) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data } = await this.sb.auth.getSession(); this.user = data.session.user; await this.loadProfile();
  },
  async signUp(email, password, name) {
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { data: { name } } });
    if (error) throw error;
    if (data.session) { this.user = data.session.user; await this.loadProfile(); return true; }
    return false; // يحتاج تأكيد البريد
  },
  async signOut() { if (this.mode === 'cloud') await this.sb.auth.signOut(); else localStorage.removeItem(this.SESSION_KEY); this.user = null; this.profile = null; },

  /* ---------- التحميل ---------- */
  async fetchAll(table, build) {
    let out = [], from = 0;
    for (;;) {
      let q = this.sb.from(table).select('*'); if (build) q = build(q);
      const { data, error } = await q.range(from, from + 999);
      if (error) throw error;
      out = out.concat(data); if (data.length < 1000) break; from += 1000;
    }
    return out;
  },
  async loadAll() {
    if (this.mode === 'local') { this.load(); return; }
    const since = Date.now() - 120 * 86400e3;
    const [vols, moves, leaves, circ, set] = await Promise.all([
      this.fetchAll('volunteers', q => q.order('name')),
      this.fetchAll('movements', q => q.gte('ts', since).order('ts')),
      this.fetchAll('leaves', q => q.order('date')),
      this.fetchAll('circulars', q => q.order('ts', { ascending: false })),
      this.sb.from('settings').select('data').eq('id', 1).maybeSingle()
    ]);
    const d = (set.data && set.data.data) || {};
    this.data = {
      settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
      depts: d.depts || ['الإغاثة', 'التعليم', 'الإعلام', 'اللوجستيات'],
      volunteers: vols, movements: moves, leaves, circulars: circ
    };
    const me = vols.find(v => v.user_id === (this.user && this.user.id));
    this.myVolId = me ? me.id : null;
  },

  /* ---------- التخزين المحلي ---------- */
  load() {
    try { this.data = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { this.data = null; }
    if (!this.data) this.seed();
    return this.data;
  },
  save() { localStorage.setItem(DB_KEY, JSON.stringify(this.data)); },
  persist() { if (this.mode === 'local') this.save(); },
  /* تنفيذ كتابة على الخادم مع إظهار الخطأ */
  _w(promise) {
    if (this.mode !== 'cloud') return;
    Promise.resolve(promise).then(r => {
      if (r && r.error) { console.error(r.error); if (window.toast) toast('تعذّر الحفظ على الخادم: ' + r.error.message); }
    });
  },
  uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  /* ---------- بيانات فارغة (بداية نظيفة) ---------- */
  seed() {
    this.data = {
      settings: { ...DEFAULT_SETTINGS },
      depts: ['الإغاثة', 'التعليم', 'الإعلام', 'اللوجستيات'],
      volunteers: [], movements: [], leaves: [], circulars: []
    };
    this.save();
  },
  reset() { localStorage.removeItem(DB_KEY); this.seed(); },

  /* ---------- حساب المدير المحلي (عند عدم ربط Supabase) ---------- */
  AUTH_KEY: 'yalla_local_auth', SESSION_KEY: 'yalla_local_session',
  async _hash(pw, salt) {
    const txt = salt + '|' + pw;
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381; for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) | 0; return 'x' + h;
  },
  localAccount() { try { return JSON.parse(localStorage.getItem(this.AUTH_KEY)); } catch (e) { return null; } },
  needsLogin() {
    if (this.mode === 'cloud') return !this.user;
    return localStorage.getItem(this.SESSION_KEY) !== '1' || !this.localAccount();
  },
  async localCreate(name, pw) {
    const salt = this.uid();
    localStorage.setItem(this.AUTH_KEY, JSON.stringify({ name, salt, hash: await this._hash(pw, salt) }));
    this._localLogged();
  },
  async localSignIn(pw) {
    const a = this.localAccount();
    if (!a || await this._hash(pw, a.salt) !== a.hash) throw new Error('Invalid login');
    this._localLogged();
  },
  _localLogged() {
    localStorage.setItem(this.SESSION_KEY, '1');
    const a = this.localAccount(); this.profile = { name: a.name, role: 'admin' }; this.role = 'admin';
  },

  /* ---------- أدوات التاريخ ---------- */
  dayKey(ts) {
    const d = new Date(ts), p = x => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  todayKey() { return this.dayKey(Date.now()); },
  dayRange(key) { const s = new Date(key + 'T00:00:00').getTime(); return [s, s + 86400e3]; },

  /* ---------- المتطوعون ---------- */
  activeVols() { return this.data.volunteers.filter(v => v.active); },
  vol(id) { return this.data.volunteers.find(v => v.id === id); },
  saveVol(v) {
    if (v.id) {
      Object.assign(this.vol(v.id), v);
      this._w(this.sb && this.sb.from('volunteers').update({ name: v.name, dept: v.dept || null, phone: v.phone || null, active: v.active }).eq('id', v.id));
    } else {
      const row = { ...v, id: this.uid(), active: v.active !== false };
      this.data.volunteers.push(row);
      this._w(this.sb && this.sb.from('volunteers').insert({ id: row.id, name: row.name, dept: row.dept || null, phone: row.phone || null, active: row.active }));
    }
    this.persist();
  },
  deleteVol(id) {
    this.data.volunteers = this.data.volunteers.filter(v => v.id !== id);
    this.data.movements = this.data.movements.filter(m => m.vid !== id);
    this.data.leaves = this.data.leaves.filter(l => l.vid !== id);
    this._w(this.sb && this.sb.from('volunteers').delete().eq('id', id));
    this.persist();
  },

  /* ---------- الإجازات ---------- */
  onLeave(vid, key) { return this.data.leaves.some(l => l.vid === vid && l.date === key); },
  toggleLeave(vid, key) {
    if (this.onLeave(vid, key)) {
      this.data.leaves = this.data.leaves.filter(l => !(l.vid === vid && l.date === key));
      this._w(this.sb && this.sb.from('leaves').delete().eq('vid', vid).eq('date', key));
    } else {
      const row = { id: this.uid(), vid, date: key };
      this.data.leaves.push(row);
      this._w(this.sb && this.sb.from('leaves').insert(row));
    }
    this.persist();
  },

  /* ---------- الحركات ---------- */
  moves(from, to, vid) {
    return this.data.movements.filter(m => m.ts >= from && m.ts < to && (!vid || m.vid === vid)).sort((a, b) => a.ts - b.ts);
  },
  addMove(m) {
    const row = { ...m, id: this.uid() };
    this.data.movements.push(row);
    this._w(this.sb && this.sb.from('movements').insert({ id: row.id, vid: row.vid, type: row.type, ts: row.ts, lat: row.lat ?? null, lng: row.lng ?? null }));
    this.persist();
  },
  updateMove(id, patch) {
    Object.assign(this.data.movements.find(m => m.id === id), patch);
    this._w(this.sb && this.sb.from('movements').update(patch).eq('id', id));
    this.persist();
  },
  deleteMove(id) {
    this.data.movements = this.data.movements.filter(m => m.id !== id);
    this._w(this.sb && this.sb.from('movements').delete().eq('id', id));
    this.persist();
  },

  /* جلسات الحضور: كل (دخول → خروج). الجلسة المفتوحة تُحسب حتى الآن (بحد أقصى 16 ساعة) */
  sessions(vid, from, to) {
    const list = this.moves(from, to, vid), out = [];
    let start = null;
    for (const m of list) {
      if (m.type === 'in' && start === null) start = m.ts;
      else if (m.type === 'out' && start !== null) { out.push({ start, end: m.ts, open: false }); start = null; }
    }
    if (start !== null) {
      const end = Math.min(Date.now(), to, start + 16 * 3600e3);
      out.push({ start, end: Math.max(end, start), open: true });
    }
    return out;
  },
  hours(vid, from, to) { return this.sessions(vid, from, to).reduce((s, x) => s + (x.end - x.start), 0); },

  /* حالة المتطوع اليوم: present | left | absent | leave */
  statusToday(vid) {
    const key = this.todayKey(), [f, t] = this.dayRange(key);
    if (this.onLeave(vid, key)) return 'leave';
    const list = this.moves(f, t, vid);
    if (!list.length) return 'absent';
    return list[list.length - 1].type === 'in' ? 'present' : 'left';
  },

  /* ---------- الموقع ---------- */
  distance(lat1, lng1, lat2, lng2) {
    const R = 6371000, r = x => x * Math.PI / 180;
    const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  },
  insideSite(m) {
    if (m.lat == null) return null;
    const s = this.data.settings;
    return this.distance(m.lat, m.lng, s.workLat, s.workLng) <= s.radius;
  },
  recentLocations() {
    const since = Date.now() - 5 * 3600e3, res = [];
    for (const v of this.activeVols()) {
      const list = this.data.movements.filter(m => m.vid === v.id && m.lat != null && m.ts >= since).sort((a, b) => b.ts - a.ts);
      if (list.length) res.push({ vol: v, move: list[0], inside: this.insideSite(list[0]) });
    }
    return res;
  },

  /* ---------- إحصائيات اللوحة ---------- */
  stats() {
    const vols = this.activeVols(), key = this.todayKey(), [f, t] = this.dayRange(key);
    const st = vols.map(v => ({ v, s: this.statusToday(v.id) }));
    const present = st.filter(x => x.s === 'present').map(x => x.v);
    const absent = st.filter(x => x.s === 'absent').map(x => x.v);
    const leave = st.filter(x => x.s === 'leave').map(x => x.v);
    const attended = st.filter(x => x.s === 'present' || x.s === 'left').length;
    const expected = vols.length - leave.length;
    const totalMs = vols.reduce((s, v) => s + this.hours(v.id, f, t), 0);
    return {
      total: vols.length, present, absent, leave, attended,
      rate: expected > 0 ? Math.round(attended / expected * 100) : 0,
      totalMs, avgMs: attended ? totalMs / attended : 0
    };
  },

  /* ---------- التعاميم ---------- */
  addCircular(c) {
    const row = { ...c, id: this.uid(), ts: Date.now() };
    this.data.circulars.unshift(row);
    this._w(this.sb && this.sb.from('circulars').insert(row));
    this.persist();
  },
  deleteCircular(id) {
    this.data.circulars = this.data.circulars.filter(c => c.id !== id);
    this._w(this.sb && this.sb.from('circulars').delete().eq('id', id));
    this.persist();
  },

  /* ---------- الإعدادات (الإعدادات + الأقسام في صف واحد) ---------- */
  saveSettings() {
    this._w(this.sb && this.sb.from('settings').upsert({ id: 1, data: { settings: this.data.settings, depts: this.data.depts } }));
    this.persist();
  }
};
