-- =============================================================================
-- FOLIO · 0001_init
--
-- Phase 1 schema: profiles, projects, documents + RLS + account deletion RPC.
-- Paste the whole file into the Supabase SQL Editor and press Run.
-- The script is idempotent: running it again is safe (it uses IF NOT EXISTS /
-- CREATE OR REPLACE / DROP ... IF EXISTS everywhere).
--
-- Access model (Phase 1): every row belongs to exactly one auth user and only
-- that user can read or write it. There is no public read yet; link/public
-- sharing comes in a later migration.
-- =============================================================================

-- gen_random_uuid() lives in pgcrypto on older Postgres; built in on PG13+.
create extension if not exists pgcrypto with schema extensions;


-- -----------------------------------------------------------------------------
-- Shared trigger functions
-- -----------------------------------------------------------------------------

-- Keeps updated_at fresh and protects immutable columns on every UPDATE.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

-- documents only: bumps the optimistic-concurrency version on every UPDATE.
-- Clients send `.eq('version', expected)`; 0 rows updated == conflict.
create or replace function public.bump_document_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- profiles: one row per auth user (nickname + avatar shown in the app)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text not null default '기록자',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- 1–30 visible characters, no leading/trailing whitespace.
  constraint profiles_nickname_length
    check (char_length(nickname) between 1 and 30 and nickname = btrim(nickname))
);

comment on table public.profiles is 'Public-facing user profile. Created automatically on sign-up.';

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Creates the profile row when a user signs up (Google metadata: full_name/name, avatar_url/picture).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_name text;
begin
  raw_name := btrim(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    '기록자'
  ));

  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    btrim(left(raw_name, 30)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: users who signed in before this migration ran get a profile too.
insert into public.profiles (id, nickname, avatar_url)
select
  u.id,
  btrim(left(btrim(coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    '기록자'
  )), 30)),
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
from auth.users u
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- projects: a campaign that groups documents (UI comes in a later phase)
-- -----------------------------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  description  text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint projects_name_length check (char_length(btrim(name)) between 1 and 100)
);

create index if not exists projects_owner_updated_idx
  on public.projects (owner_id, updated_at desc);

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();


-- -----------------------------------------------------------------------------
-- documents: handouts, session logs, character sheets (content is JSON)
-- -----------------------------------------------------------------------------
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete set null,
  type        text not null check (type in ('handout', 'log', 'character')),
  title       text not null default '',
  content     jsonb not null default '{}'::jsonb,
  visibility  text not null default 'private' check (visibility in ('private', 'link', 'public')),
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint documents_title_length check (char_length(title) <= 200),
  constraint documents_content_is_object check (jsonb_typeof(content) = 'object')
);

-- Library / dashboard: "my documents, newest first".
create index if not exists documents_owner_updated_idx
  on public.documents (owner_id, updated_at desc);
create index if not exists documents_project_idx
  on public.documents (project_id) where project_id is not null;

drop trigger if exists documents_touch_updated_at on public.documents;
create trigger documents_touch_updated_at
  before update on public.documents
  for each row execute function public.touch_updated_at();

drop trigger if exists documents_bump_version on public.documents;
create trigger documents_bump_version
  before update on public.documents
  for each row execute function public.bump_document_version();


-- -----------------------------------------------------------------------------
-- Row Level Security: owner-only everywhere
-- `(select auth.uid())` is evaluated once per statement (faster than per row).
-- -----------------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.projects  enable row level security;
alter table public.documents enable row level security;

-- profiles: read/update own row. Insert happens via the trigger; delete via cascade.
drop policy if exists "profiles: owner select" on public.profiles;
create policy "profiles: owner select" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "profiles: owner insert" on public.profiles;
create policy "profiles: owner insert" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "profiles: owner update" on public.profiles;
create policy "profiles: owner update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- projects
drop policy if exists "projects: owner select" on public.projects;
create policy "projects: owner select" on public.projects
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "projects: owner insert" on public.projects;
create policy "projects: owner insert" on public.projects
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "projects: owner update" on public.projects;
create policy "projects: owner update" on public.projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "projects: owner delete" on public.projects;
create policy "projects: owner delete" on public.projects
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- documents: a document may only be attached to one of the caller's own projects.
drop policy if exists "documents: owner select" on public.documents;
create policy "documents: owner select" on public.documents
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "documents: owner insert" on public.documents;
create policy "documents: owner insert" on public.documents
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = project_id and p.owner_id = (select auth.uid())
      )
    )
  );

drop policy if exists "documents: owner update" on public.documents;
create policy "documents: owner update" on public.documents
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = project_id and p.owner_id = (select auth.uid())
      )
    )
  );

drop policy if exists "documents: owner delete" on public.documents;
create policy "documents: owner delete" on public.documents
  for delete to authenticated
  using (owner_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- Grants: logged-out visitors (anon) get nothing; signed-in users get CRUD,
-- still filtered by the policies above.
-- -----------------------------------------------------------------------------
revoke all on table public.profiles, public.projects, public.documents from anon;
grant select, insert, update, delete on table public.profiles, public.projects, public.documents to authenticated;

-- Trigger helpers are not meant to be called directly.
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.bump_document_version() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- RPC: delete_my_account()
-- Deletes the caller's auth.users row; profiles/projects/documents cascade.
-- -----------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from auth.users where id = uid;
end;
$$;

comment on function public.delete_my_account() is 'Permanently deletes the signed-in user and all of their data.';

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
