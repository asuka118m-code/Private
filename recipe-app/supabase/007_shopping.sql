-- あじめも：買い物リスト（7回目の設定）
-- 自分の端末どうしで同期し、リンクで家族とも共有できる（家族はログイン不要）

-- ① 買い物リストに入れた料理（材料は入れた時の分量で保存）。recipe_id が空なら手で追加したもの
create table if not exists public.shopping_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  recipe_id text,
  title text not null default '' check (char_length(title) <= 100),
  factor numeric not null default 1,
  ingredients jsonb not null default '[]'::jsonb,
  added_by text not null default '' check (char_length(added_by) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists shopping_entries_user on public.shopping_entries (user_id, created_at);
alter table public.shopping_entries enable row level security;
drop policy if exists "own shopping entries" on public.shopping_entries;
create policy "own shopping entries" on public.shopping_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ② 材料ごとのチェック（買った）と「家にある」
create table if not exists public.shopping_checks (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item_key text not null check (char_length(item_key) between 1 and 100),
  checked boolean not null default false,
  pantry boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key)
);
alter table public.shopping_checks enable row level security;
drop policy if exists "own shopping checks" on public.shopping_checks;
create policy "own shopping checks" on public.shopping_checks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ③ 家族と共有するリンク
create table if not exists public.shopping_shares (
  token text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.shopping_shares enable row level security;
drop policy if exists "own shopping shares" on public.shopping_shares;
create policy "own shopping shares" on public.shopping_shares
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.shopping_owner(p_token text) returns uuid
language sql stable security definer set search_path = '' as $$
  select user_id from public.shopping_shares where token = p_token and not revoked
$$;

-- ④ リンクから買い物リストを読む（ログイン不要）
create or replace function public.get_shopping(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when o.uid is null then null else jsonb_build_object(
    'ownerName', (select name from public.profiles where user_id = o.uid),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'recipeId', e.recipe_id, 'title', e.title,
        'factor', e.factor, 'ingredients', e.ingredients, 'addedBy', e.added_by,
        'createdAt', (extract(epoch from e.created_at) * 1000)::bigint) order by e.created_at)
      from public.shopping_entries e where e.user_id = o.uid), '[]'::jsonb),
    'checks', coalesce((select jsonb_agg(jsonb_build_object('key', c.item_key, 'checked', c.checked, 'pantry', c.pantry))
      from public.shopping_checks c where c.user_id = o.uid), '[]'::jsonb)) end
  from (select public.shopping_owner(p_token) as uid) o
$$;

-- ⑤ リンクからチェック・「家にある」を付け外し
create or replace function public.set_shopping_flag(p_token text, p_key text, p_field text, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.shopping_owner(p_token);
begin
  if uid is null then raise exception 'このリンクは使えません'; end if;
  if p_field not in ('checked', 'pantry') or char_length(coalesce(p_key, '')) not between 1 and 100 then raise exception '正しくありません'; end if;
  insert into public.shopping_checks (user_id, item_key, checked, pantry)
  values (uid, p_key, p_field = 'checked' and p_value, p_field = 'pantry' and p_value)
  on conflict (user_id, item_key) do update set
    checked = case when p_field = 'checked' then p_value else public.shopping_checks.checked end,
    pantry = case when p_field = 'pantry' then p_value else public.shopping_checks.pantry end,
    updated_at = now();
end $$;

-- ⑥ リンクから材料を手で足す（「牛乳」など）
create or replace function public.add_shopping_item(p_token text, p_name text, p_amount text, p_by text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.shopping_owner(p_token);
begin
  if uid is null then raise exception 'このリンクは使えません'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 60 then raise exception '品名を入れてください'; end if;
  if (select count(*) from public.shopping_entries x where x.user_id = uid and x.created_at > now() - interval '1 hour') >= 100 then
    raise exception '追加が多すぎます。しばらくしてからお試しください';
  end if;
  insert into public.shopping_entries (user_id, recipe_id, title, ingredients, added_by)
  values (uid, null, '', jsonb_build_array(jsonb_build_object('name', left(trim(p_name), 60), 'amount', left(trim(coalesce(p_amount, '')), 30))),
          left(trim(coalesce(p_by, '')), 40));
end $$;

revoke all on function public.shopping_owner(text) from public;
grant execute on function public.get_shopping(text) to anon, authenticated;
grant execute on function public.set_shopping_flag(text, text, text, boolean) to anon, authenticated;
grant execute on function public.add_shopping_item(text, text, text, text) to anon, authenticated;
