-- あじめも：アカウントの名前・アカウントでのコメント/リクエスト・リクエスト先（5回目の設定）

-- ① プロフィール（コメントやリクエストに使う名前）
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ② だれのアカウントから書かれたか（アカウントなしの人は空）
alter table public.shared_comments add column if not exists author_user_id uuid references auth.users on delete set null;
alter table public.requests add column if not exists author_user_id uuid references auth.users on delete set null;

-- ログイン中なら、その人のプロフィールの名前（なければ入力された名前）を使う
create or replace function public.author_name(p_author text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select left(trim(p.name), 40) from public.profiles p where p.user_id = auth.uid()), left(trim(coalesce(p_author, '')), 40))
$$;

-- ③ コメント（1品の共有リンク用）
create or replace function public.add_shared_comment(p_token text, p_author text, p_text text, p_rating int)
returns jsonb language sql security definer set search_path = '' as $$
  select public.add_shared_comment(p_token, p_author, p_text, p_rating, null)
$$;

-- ④ コメント（一覧の共有リンク用）
create or replace function public.add_shared_comment(p_token text, p_author text, p_text text, p_rating int, p_recipe_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.shares;
  c public.shared_comments;
  rid text;
  who text := public.author_name(p_author);
begin
  select * into s from public.shares where token = p_token and not revoked;
  if not found then raise exception 'この共有リンクは使えません'; end if;
  rid := coalesce(s.recipe_id, p_recipe_id);
  if not public.share_allows(s, rid) or not exists (select 1 from public.recipes r where r.user_id = s.user_id and r.id = rid and not r.deleted) then
    raise exception 'このレシピにはコメントできません';
  end if;
  if coalesce(who, '') = '' then raise exception '名前を入れてください'; end if;
  if (select count(*) from public.shared_comments x where x.token = p_token and x.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'コメントが多すぎます。しばらくしてからお試しください';
  end if;
  insert into public.shared_comments (token, user_id, recipe_id, author, text, rating, author_user_id)
  values (p_token, s.user_id, rid, who, left(trim(p_text), 2000),
          case when p_rating between 1 and 5 then p_rating end, auth.uid())
  returning * into c;
  return jsonb_build_object('id', c.id, 'author', c.author, 'text', c.text, 'rating', c.rating,
    'createdAt', (extract(epoch from c.created_at) * 1000)::bigint);
end $$;

-- ⑤ リクエスト（中身は 003 と同じ。名前とアカウントを記録）
create or replace function public.add_request(p_token text, p_author text, p_text text, p_recipe_id text, p_url text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.shares;
  q public.requests;
  rid text := nullif(p_recipe_id, '');
  link text := nullif(trim(coalesce(p_url, '')), '');
  who text := public.author_name(p_author);
begin
  select * into s from public.shares where token = p_token and not revoked;
  if not found then raise exception 'この共有リンクは使えません'; end if;
  if rid is not null and not public.share_allows(s, rid) then raise exception 'このレシピはリクエストできません'; end if;
  if link is not null and (link !~ '^https?://' or char_length(link) > 1000) then raise exception 'URLが正しくありません'; end if;
  if rid is null and link is null and coalesce(trim(p_text), '') = '' then raise exception '食べたいものを書くか、URLを貼ってください'; end if;
  if coalesce(who, '') = '' then raise exception '名前を入れてください'; end if;
  if (select count(*) from public.requests x where x.token = p_token and x.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'リクエストが多すぎます。しばらくしてからお試しください';
  end if;
  insert into public.requests (token, user_id, recipe_id, author, text, url, author_user_id)
  values (p_token, s.user_id, rid, who, left(coalesce(trim(p_text), ''), 500), link, auth.uid())
  returning * into q;
  return jsonb_build_object('id', q.id, 'author', q.author, 'text', q.text, 'recipeId', q.recipe_id, 'url', q.url,
    'createdAt', (extract(epoch from q.created_at) * 1000)::bigint);
end $$;

-- ⑥ リクエスト先（相手からもらった「一覧の共有リンク」を登録しておく）
create table if not exists public.request_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  token text not null references public.shares (token) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
alter table public.request_targets enable row level security;
drop policy if exists "own targets" on public.request_targets;
create policy "own targets" on public.request_targets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ⑦ あとで登録ボックスの画面で「○○さんにリクエスト」を出すための一覧（リンクの中身は出さない）
create or replace function public.get_inbox_targets(p_inbox_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label) order by t.created_at)
    from public.request_targets t
    join public.shares target on target.token = t.token and not target.revoked and target.recipe_id is null
    where t.user_id = s.user_id), '[]'::jsonb)
  from public.shares s
  where s.token = p_inbox_token and not s.revoked and s.recipe_id = '__inbox__'
$$;

-- ⑧ あとで登録ボックスの画面から、登録したリクエスト先へリクエストを送る（ログイン不要）
create or replace function public.add_request_via_inbox(p_inbox_token text, p_target_id uuid, p_url text, p_text text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  box public.shares;
  t public.request_targets;
  who text;
  link text := nullif(trim(coalesce(p_url, '')), '');
  q public.requests;
  target public.shares;
begin
  select * into box from public.shares where token = p_inbox_token and not revoked and recipe_id = '__inbox__';
  if not found then raise exception 'このリンクは使えません'; end if;
  select * into t from public.request_targets where id = p_target_id and user_id = box.user_id;
  if not found then raise exception 'リクエスト先が見つかりません'; end if;
  select * into target from public.shares where token = t.token and not revoked and recipe_id is null;
  if not found then raise exception 'リクエスト先の共有が止められています'; end if;
  select left(trim(name), 40) into who from public.profiles where user_id = box.user_id;
  if coalesce(who, '') = '' then raise exception 'あじめもの設定で名前を登録してください'; end if;
  if link is not null and (link !~ '^https?://' or char_length(link) > 1000) then raise exception 'URLが正しくありません'; end if;
  if link is null and coalesce(trim(p_text), '') = '' then raise exception '送るものがありません'; end if;
  if (select count(*) from public.requests x where x.token = t.token and x.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'リクエストが多すぎます。しばらくしてからお試しください';
  end if;
  insert into public.requests (token, user_id, recipe_id, author, text, url, author_user_id)
  values (t.token, target.user_id, null, who, left(coalesce(trim(p_text), ''), 500), link, box.user_id)
  returning * into q;
  return jsonb_build_object('id', q.id, 'author', q.author, 'label', t.label);
end $$;

revoke all on function public.author_name(text) from public;
revoke all on function public.get_inbox_targets(text) from public;
revoke all on function public.add_request_via_inbox(text, uuid, text, text) from public;
grant execute on function public.add_shared_comment(text, text, text, int) to anon, authenticated;
grant execute on function public.add_shared_comment(text, text, text, int, text) to anon, authenticated;
grant execute on function public.add_request(text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_inbox_targets(text) to anon, authenticated;
grant execute on function public.add_request_via_inbox(text, uuid, text, text) to anon, authenticated;
