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