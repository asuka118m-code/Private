-- あじめも：友だち（6回目の設定）
-- 友だちになると、アプリの中で相手のレシピを見て、コメント・リクエスト・コピーができる（編集はできない）

-- ① 友だち招待リンクのコード
create table if not exists public.friend_codes (
  code text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.friend_codes enable row level security;
drop policy if exists "own friend codes" on public.friend_codes;
create policy "own friend codes" on public.friend_codes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ② 友だち（2人を小さい順に1行で持つ）
create table if not exists public.friendships (
  user_a uuid not null references auth.users on delete cascade,
  user_b uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
alter table public.friendships enable row level security;
drop policy if exists "my friendships" on public.friendships;
drop policy if exists "remove my friendships" on public.friendships;
create policy "my friendships" on public.friendships for select using (auth.uid() in (user_a, user_b));
create policy "remove my friendships" on public.friendships for delete using (auth.uid() in (user_a, user_b));

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select a is not null and b is not null and exists (
    select 1 from public.friendships f where f.user_a = least(a, b) and f.user_b = greatest(a, b))
$$;

-- 招待リンクを開いた人に「○○さんと友だちになりますか？」を出す
create or replace function public.get_friend_code_owner(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', coalesce(p.name, ''), 'self', c.user_id = auth.uid(),
    'already', public.are_friends(c.user_id, auth.uid()))
  from public.friend_codes c left join public.profiles p on p.user_id = c.user_id
  where c.code = p_code and not c.revoked and auth.uid() is not null
$$;

create or replace function public.accept_friend(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.friend_codes;
  me uuid := auth.uid();
begin
  if me is null then raise exception 'ログインしてください'; end if;
  select * into c from public.friend_codes where code = p_code and not revoked;
  if not found then raise exception 'この招待リンクは使えません'; end if;
  if c.user_id = me then raise exception '自分の招待リンクです'; end if;
  insert into public.friendships (user_a, user_b) values (least(me, c.user_id), greatest(me, c.user_id))
    on conflict do nothing;
  return jsonb_build_object('id', c.user_id, 'name', (select name from public.profiles where user_id = c.user_id));
end $$;

create or replace function public.list_friends() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', coalesce(p.name, '（名前なし）'),
    'since', (extract(epoch from x.created_at) * 1000)::bigint) order by p.name), '[]'::jsonb)
  from (
    select case when f.user_a = auth.uid() then f.user_b else f.user_a end as id, f.created_at
    from public.friendships f where auth.uid() in (f.user_a, f.user_b)
  ) x left join public.profiles p on p.user_id = x.id
$$;

-- ③ 友だちのレシピ一覧・1品（自分のレシピの同期とは別の入口から読む）
create or replace function public.get_friend_recipes(p_friend uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.are_friends(auth.uid(), p_friend) then null else jsonb_build_object(
    'ownerId', p_friend,
    'ownerName', (select name from public.profiles where user_id = p_friend),
    'recipes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.data ->> 'title', 'servings', r.data ->> 'servings',
        'cover', coalesce(r.data ->> 'coverImageId', r.data -> 'photoIds' ->> 0, r.data -> 'sourceImageIds' ->> 0),
        'categoryIds', coalesce(r.data -> 'categoryIds', '[]'::jsonb),
        'cookedCount', jsonb_array_length(coalesce(r.data -> 'cookedDates', '[]'::jsonb)),
        'updatedAt', r.updated_at) order by r.updated_at desc)
      from public.recipes r where r.user_id = p_friend and not r.deleted and r.id not like 'cat:%'), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.data ->> 'id', 'name', r.data ->> 'name', 'order', r.data -> 'order') order by (r.data ->> 'order')::numeric)
      from public.recipes r where r.user_id = p_friend and not r.deleted and r.id like 'cat:%'), '[]'::jsonb),
    'requests', '[]'::jsonb) end
$$;

create or replace function public.get_friend_recipe(p_friend uuid, p_recipe_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'recipe', r.data, 'ownerId', r.user_id,
    'ownerName', (select name from public.profiles where user_id = r.user_id),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'author', c.author, 'text', c.text, 'rating', c.rating,
        'createdAt', (extract(epoch from c.created_at) * 1000)::bigint) order by c.created_at desc)
      from public.shared_comments c where c.user_id = r.user_id and c.recipe_id = r.id), '[]'::jsonb))
  from public.recipes r
  where r.user_id = p_friend and r.id = p_recipe_id and not r.deleted and r.id not like 'cat:%'
    and public.are_friends(auth.uid(), p_friend)
$$;

-- ④ 友だちへのコメント・リクエスト（共有リンクなしで送れるようにする）
alter table public.shared_comments alter column token drop not null;
alter table public.requests alter column token drop not null;

create or replace function public.add_friend_comment(p_friend uuid, p_recipe_id text, p_text text, p_rating int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  who text;
  c public.shared_comments;
begin
  if not public.are_friends(me, p_friend) then raise exception '友だちではありません'; end if;
  if not exists (select 1 from public.recipes r where r.user_id = p_friend and r.id = p_recipe_id and not r.deleted) then
    raise exception 'このレシピにはコメントできません';
  end if;
  select left(trim(name), 40) into who from public.profiles where user_id = me;
  if coalesce(who, '') = '' then raise exception '設定で名前を登録してください'; end if;
  if coalesce(trim(p_text), '') = '' then raise exception 'コメントを書いてください'; end if;
  if (select count(*) from public.shared_comments x where x.author_user_id = me and x.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'コメントが多すぎます。しばらくしてからお試しください';
  end if;
  insert into public.shared_comments (token, user_id, recipe_id, author, text, rating, author_user_id)
  values (null, p_friend, p_recipe_id, who, left(trim(p_text), 2000), case when p_rating between 1 and 5 then p_rating end, me)
  returning * into c;
  return jsonb_build_object('id', c.id, 'author', c.author, 'text', c.text, 'rating', c.rating,
    'createdAt', (extract(epoch from c.created_at) * 1000)::bigint);
end $$;

-- 共通：友だちへリクエストを入れる（名前は送る人のプロフィール）
create or replace function public.insert_friend_request(p_from uuid, p_friend uuid, p_text text, p_url text, p_recipe_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  who text;
  link text := nullif(trim(coalesce(p_url, '')), '');
  rid text := nullif(p_recipe_id, '');
  q public.requests;
begin
  if not public.are_friends(p_from, p_friend) then raise exception '友だちではありません'; end if;
  select left(trim(name), 40) into who from public.profiles where user_id = p_from;
  if coalesce(who, '') = '' then raise exception 'あじめもの設定で名前を登録してください'; end if;
  if link is not null and (link !~ '^https?://' or char_length(link) > 1000) then raise exception 'URLが正しくありません'; end if;
  if rid is not null and not exists (select 1 from public.recipes r where r.user_id = p_friend and r.id = rid and not r.deleted and r.id not like 'cat:%') then
    raise exception 'このレシピはリクエストできません';
  end if;
  if rid is null and link is null and coalesce(trim(p_text), '') = '' then raise exception '食べたいものを書くか、URLを貼ってください'; end if;
  if (select count(*) from public.requests x where x.author_user_id = p_from and x.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'リクエストが多すぎます。しばらくしてからお試しください';
  end if;
  insert into public.requests (token, user_id, recipe_id, author, text, url, author_user_id)
  values (null, p_friend, rid, who, left(coalesce(trim(p_text), ''), 500), link, p_from)
  returning * into q;
  return jsonb_build_object('id', q.id, 'author', q.author, 'text', q.text, 'recipeId', q.recipe_id, 'url', q.url,
    'createdAt', (extract(epoch from q.created_at) * 1000)::bigint);
end $$;

create or replace function public.add_friend_request(p_friend uuid, p_text text, p_url text, p_recipe_id text)
returns jsonb language sql security definer set search_path = '' as $$
  select public.insert_friend_request(auth.uid(), p_friend, p_text, p_url, p_recipe_id)
$$;

-- ⑤ あとで登録ボックスの「○○さんにリクエスト」に友だちも並べる（友だちは id が 'f:' で始まる）
create or replace function public.get_inbox_targets(p_inbox_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_agg(x.item order by x.ord, x.label) from (
      select jsonb_build_object('id', 'f:' || fr.id, 'label', coalesce(p.name, '友だち')) as item, 0 as ord, coalesce(p.name, '') as label
      from (select case when f.user_a = s.user_id then f.user_b else f.user_a end as id
            from public.friendships f where s.user_id in (f.user_a, f.user_b)) fr
      left join public.profiles p on p.user_id = fr.id
      union all
      select jsonb_build_object('id', t.id::text, 'label', t.label), 1, t.label
      from public.request_targets t
      join public.shares target on target.token = t.token and not target.revoked and target.recipe_id is null
      where t.user_id = s.user_id
    ) x), '[]'::jsonb)
  from public.shares s
  where s.token = p_inbox_token and not s.revoked and s.recipe_id = '__inbox__'
$$;

create or replace function public.send_inbox_request(p_inbox_token text, p_target text, p_url text, p_text text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  box public.shares;
  r jsonb;
begin
  select * into box from public.shares where token = p_inbox_token and not revoked and recipe_id = '__inbox__';
  if not found then raise exception 'このリンクは使えません'; end if;
  if p_target like 'f:%' then
    r := public.insert_friend_request(box.user_id, substr(p_target, 3)::uuid, p_text, p_url, null);
    return r || jsonb_build_object('label', (select name from public.profiles where user_id = substr(p_target, 3)::uuid));
  end if;
  return public.add_request_via_inbox(p_inbox_token, p_target::uuid, p_url, p_text);
end $$;

-- ⑥ 友だちのレシピの写真を見られるようにする
create or replace function public.is_friend_image(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.are_friends(auth.uid(), split_part(p_name, '/', 1)::uuid)
$$;
drop policy if exists "friend recipe images" on storage.objects;
create policy "friend recipe images" on storage.objects for select to authenticated
  using (bucket_id = 'recipe-images' and public.is_friend_image(name));

-- ⑦ 友だちのプロフィール名だけは見られる（コメント表示などに使う）
drop policy if exists "friends can read profile" on public.profiles;
create policy "friends can read profile" on public.profiles for select using (public.are_friends(auth.uid(), user_id));

revoke all on function public.are_friends(uuid, uuid) from public;
revoke all on function public.insert_friend_request(uuid, uuid, text, text, text) from public;
grant execute on function public.are_friends(uuid, uuid) to anon, authenticated;
grant execute on function public.get_friend_code_owner(text) to authenticated;
grant execute on function public.accept_friend(text) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.get_friend_recipes(uuid) to authenticated;
grant execute on function public.get_friend_recipe(uuid, text) to authenticated;
grant execute on function public.add_friend_comment(uuid, text, text, int) to authenticated;
grant execute on function public.add_friend_request(uuid, text, text, text) to authenticated;
grant execute on function public.get_inbox_targets(text) to anon, authenticated;
grant execute on function public.send_inbox_request(text, text, text, text) to anon, authenticated;
grant execute on function public.is_friend_image(text) to authenticated;
