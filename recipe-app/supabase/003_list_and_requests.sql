-- あじめも：レシピ一覧の共有と「食べたい」リクエスト（3回目の設定）
-- Supabaseの「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押してください（1回だけ）。

-- ① 共有リンクで「全レシピ」を見せられるようにする（recipe_id が空なら一覧の共有）
alter table public.shares alter column recipe_id drop not null;

-- ② 「食べたい」リクエスト
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  token text not null references public.shares (token) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,  -- 作る人（レシピの持ち主）
  recipe_id text,                                                -- レシピを選んだ場合
  author text not null check (char_length(author) between 1 and 40),
  text text not null default '' check (char_length(text) <= 500),
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists requests_user on public.requests (user_id, done, created_at);
alter table public.requests enable row level security;
drop policy if exists "owner reads requests" on public.requests;
drop policy if exists "owner updates requests" on public.requests;
drop policy if exists "owner deletes requests" on public.requests;
create policy "owner reads requests" on public.requests for select using (auth.uid() = user_id);
create policy "owner updates requests" on public.requests for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner deletes requests" on public.requests for delete using (auth.uid() = user_id);

-- リンクで見てよいレシピか（1品の共有ならそのレシピ、一覧の共有なら全レシピ）
create or replace function public.share_allows(s public.shares, p_recipe_id text) returns boolean
language sql stable set search_path = '' as $$
  select not s.revoked and p_recipe_id is not null and p_recipe_id not like 'cat:%'
    and (s.recipe_id is null or s.recipe_id = p_recipe_id)
$$;

-- ③ 一覧の共有リンクを開いた時の中身（レシピの一覧・カテゴリ・リクエスト）
create or replace function public.get_shared_list(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'ownerId', s.user_id,
    'ownerName', s.owner_name,
    'recipes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'title', r.data ->> 'title',
        'servings', r.data ->> 'servings',
        'cover', coalesce(r.data ->> 'coverImageId', r.data -> 'photoIds' ->> 0, r.data -> 'sourceImageIds' ->> 0),
        'categoryIds', coalesce(r.data -> 'categoryIds', '[]'::jsonb),
        'cookedCount', jsonb_array_length(coalesce(r.data -> 'cookedDates', '[]'::jsonb)),
        'updatedAt', r.updated_at) order by r.updated_at desc)
      from public.recipes r
      where r.user_id = s.user_id and not r.deleted and r.id not like 'cat:%'), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.data ->> 'id', 'name', r.data ->> 'name', 'order', r.data -> 'order') order by (r.data ->> 'order')::numeric)
      from public.recipes r
      where r.user_id = s.user_id and not r.deleted and r.id like 'cat:%'), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'author', q.author, 'text', q.text, 'recipeId', q.recipe_id,
        'createdAt', (extract(epoch from q.created_at) * 1000)::bigint) order by q.created_at desc)
      from public.requests q
      where q.user_id = s.user_id and not q.done), '[]'::jsonb))
  from public.shares s
  where s.token = p_token and not s.revoked and s.recipe_id is null
$$;

-- ④ 一覧の中の1品を開く（1品の共有リンクでも使える）
create or replace function public.get_shared_recipe(p_token text, p_recipe_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'recipe', r.data,
    'ownerId', s.user_id,
    'ownerName', s.owner_name,
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'author', c.author, 'text', c.text, 'rating', c.rating,
        'createdAt', (extract(epoch from c.created_at) * 1000)::bigint) order by c.created_at desc)
      from public.shared_comments c
      where c.user_id = s.user_id and c.recipe_id = r.id), '[]'::jsonb))
  from public.shares s
  join public.recipes r on r.user_id = s.user_id and r.id = coalesce(s.recipe_id, p_recipe_id)
  where s.token = p_token and public.share_allows(s, r.id) and not r.deleted
$$;

-- ⑤ 一覧の中の1品にコメントする
create or replace function public.add_shared_comment(p_token text, p_author text, p_text text, p_rating int, p_recipe_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.shares;
  c public.shared_comments;
  rid text;
begin
  select * into s from public.shares where token = p_token and not revoked;
  if not found then raise exception 'この共有リンクは使えません'; end if;
  rid := coalesce(s.recipe_id, p_recipe_id);
  if not public.share_allows(s, rid) or not exists (select 1 from public.recipes r where r.user_id = s.user_id and r.id = rid and not r.deleted) then
    raise exception 'このレシピにはコメントできません';
  end if;
  if (select count(*) from public.shared_comments x where x.token = p_token and x.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'コメントが多すぎます。しばらくしてからお試しください';
  end if;
  insert into public.shared_comments (token, user_id, recipe_id, author, text, rating)
  values (p_token, s.user_id, rid, left(trim(p_author), 40), left(trim(p_text), 2000),
          case when p_rating between 1 and 5 then p_rating end)
  returning * into c;
  return jsonb_build_object('id', c.id, 'author', c.author, 'text', c.text, 'rating', c.rating,
    'createdAt', (extract(epoch from c.created_at) * 1000)::bigint);
end $$;

-- ⑥ 「食べたい」リクエストを送る
create or replace function public.add_request(p_token text, p_author text, p_text text, p_recipe_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.shares;
  q public.requests;
  rid text := nullif(p_recipe_id, '');
begin
  select * into s from public.shares where token = p_token and not revoked;
  if not found then raise exception 'この共有リンクは使えません'; end if;
  if rid is not null and not public.share_allows(s, rid) then raise exception 'このレシピはリクエストできません'; end if;
  if rid is null and coalesce(trim(p_text), '') = '' then raise exception '食べたいものを書いてください'; end if;
  if (select count(*) from public.requests x where x.token = p_token and x.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'リクエストが多すぎます。しばらくしてからお試しください';
  end if;
  insert into public.requests (token, user_id, recipe_id, author, text)
  values (p_token, s.user_id, rid, left(trim(p_author), 40), left(coalesce(trim(p_text), ''), 500))
  returning * into q;
  return jsonb_build_object('id', q.id, 'author', q.author, 'text', q.text, 'recipeId', q.recipe_id,
    'createdAt', (extract(epoch from q.created_at) * 1000)::bigint);
end $$;

-- ⑦ 写真：一覧を共有している場合は、その人の（削除されていない）レシピの写真を見られる
create or replace function public.is_shared_image(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shares s
    join public.recipes r on r.user_id = s.user_id and (s.recipe_id is null or r.id = s.recipe_id)
    where not s.revoked and not r.deleted and r.id not like 'cat:%'
      and s.user_id::text = split_part(p_name, '/', 1)
      and ((r.data -> 'sourceImageIds') ? split_part(p_name, '/', 2)
        or (r.data -> 'photoIds') ? split_part(p_name, '/', 2)))
$$;

revoke all on function public.share_allows(public.shares, text) from public;
revoke all on function public.get_shared_list(text) from public;
revoke all on function public.get_shared_recipe(text, text) from public;
revoke all on function public.add_shared_comment(text, text, text, int, text) from public;
revoke all on function public.add_request(text, text, text, text) from public;
grant execute on function public.get_shared_list(text) to anon, authenticated;
grant execute on function public.get_shared_recipe(text, text) to anon, authenticated;
grant execute on function public.add_shared_comment(text, text, text, int, text) to anon, authenticated;
grant execute on function public.add_request(text, text, text, text) to anon, authenticated;
grant execute on function public.is_shared_image(text) to anon, authenticated;
