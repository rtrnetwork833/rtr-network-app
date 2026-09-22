create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  avatar_url text,
  date_of_birth date not null,
  balance numeric(20, 8) not null default 0 check (balance >= 0),
  recovery_code text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists balance numeric(20, 8) not null default 0;
alter table public.profiles add column if not exists recovery_code text;

alter table public.profiles enable row level security;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can read profile avatars" on storage.objects;
create policy "Anyone can read profile avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.wallet_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(20, 8) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.wallet_balances enable row level security;

create policy "Users can read their own wallet balance"
  on public.wallet_balances for select
  using (auth.uid() = user_id);

create policy "Users can read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own avatar"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.prevent_date_of_birth_change()
returns trigger
language plpgsql
security invoker
as $$
begin
  if new.date_of_birth is distinct from old.date_of_birth then
    raise exception 'date_of_birth is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_date_of_birth_immutable on public.profiles;
create trigger profiles_date_of_birth_immutable
  before update on public.profiles
  for each row execute function public.prevent_date_of_birth_change();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, date_of_birth)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    (new.raw_user_meta_data ->> 'date_of_birth')::date
  );
  insert into public.wallet_balances (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.booster_activations (
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, tier)
);

alter table public.booster_activations enable row level security;

create policy "Users can read their own booster activations"
  on public.booster_activations for select
  using (auth.uid() = user_id);

create policy "Users can create their own booster activations"
  on public.booster_activations for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own booster activations"
  on public.booster_activations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);