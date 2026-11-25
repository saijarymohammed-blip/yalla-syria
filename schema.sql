-- =====================================================
-- يلا سوريا — مخطط قاعدة البيانات (Supabase / PostgreSQL)
-- الصقه كاملاً في: Supabase → SQL Editor → New query → Run
-- أول حساب يُسجَّل يصبح "مدير" تلقائياً، وكل حساب بعده "متطوع".
-- =====================================================

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  role text not null default 'volunteer' check (role in ('admin','volunteer'))
);

create table if not exists volunteers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  name text not null,
  dept text,
  phone text,
  active boolean not null default true
);

create table if not exists movements (
  id uuid primary key default gen_random_uuid(),
  vid uuid not null references volunteers on delete cascade,
  type text not null check (type in ('in','out')),
  ts bigint not null,
  lat double precision,
  lng double precision
);
create index if not exists movements_ts_idx on movements (ts);
create index if not exists movements_vid_idx on movements (vid);

create table if not exists leaves (
  id uuid primary key default gen_random_uuid(),
  vid uuid not null references volunteers on delete cascade,
  date text not null,
  unique (vid, date)
);

create table if not exists circulars (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  ts bigint not null
);

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'
);
insert into settings (id, data) values (1, '{}') on conflict do nothing;

-- ---------- دوال مساعدة ----------
create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text; nm text;
begin
  nm := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  if (select count(*) from profiles) = 0 then r := 'admin'; else r := 'volunteer'; end if;
  insert into profiles (id, name, role) values (new.id, nm, r);
  if r = 'volunteer' then insert into volunteers (user_id, name) values (new.id, nm); end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ---------- صلاحيات الصفوف (RLS) ----------
alter table profiles   enable row level security;
alter table volunteers enable row level security;
alter table movements  enable row level security;
alter table leaves     enable row level security;
alter table circulars  enable row level security;
alter table settings   enable row level security;

-- profiles
create policy "profiles_select" on profiles for select using (id = auth.uid() or is_admin());
create policy "profiles_admin_update" on profiles for update using (is_admin());

-- volunteers: المدير كل شيء، المتطوع يرى سجله فقط
create policy "vol_select" on volunteers for select using (is_admin() or user_id = auth.uid());
create policy "vol_admin_insert" on volunteers for insert with check (is_admin());
create policy "vol_admin_update" on volunteers for update using (is_admin());
create policy "vol_admin_delete" on volunteers for delete using (is_admin());

-- movements: المتطوع يسجّل ويرى حركاته فقط، والمدير كل شيء
create policy "mov_select" on movements for select using (
  is_admin() or vid in (select id from volunteers where user_id = auth.uid()));
create policy "mov_insert" on movements for insert with check (
  is_admin() or vid in (select id from volunteers where user_id = auth.uid()));
create policy "mov_admin_update" on movements for update using (is_admin());
create policy "mov_admin_delete" on movements for delete using (is_admin());

-- leaves
create policy "leaves_select" on leaves for select using (
  is_admin() or vid in (select id from volunteers where user_id = auth.uid()));
create policy "leaves_admin_write" on leaves for all using (is_admin()) with check (is_admin());

-- circulars: الجميع يقرأ، المدير يكتب
create policy "circ_select" on circulars for select using (auth.uid() is not null);
create policy "circ_admin_write" on circulars for all using (is_admin()) with check (is_admin());

-- settings: الجميع يقرأ، المدير يكتب
create policy "set_select" on settings for select using (auth.uid() is not null);
create policy "set_admin_write" on settings for all using (is_admin()) with check (is_admin());

-- ---------- لترقية متطوع إلى مدير لاحقاً ----------
-- update profiles set role = 'admin' where id = (select id from auth.users where email = 'example@mail.com');
