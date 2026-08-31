-- Run this once in Supabase Dashboard > SQL Editor.
create table if not exists public.planner_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.planner_state enable row level security;
revoke all on public.planner_state from anon;
grant select, insert, update, delete on public.planner_state to authenticated;

drop policy if exists "Users can read their planner" on public.planner_state;
create policy "Users can read their planner"
on public.planner_state for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their planner" on public.planner_state;
create policy "Users can create their planner"
on public.planner_state for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their planner" on public.planner_state;
create policy "Users can update their planner"
on public.planner_state for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their planner" on public.planner_state;
create policy "Users can delete their planner"
on public.planner_state for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Allow logged-in devices to receive each other's updates immediately.
do $$
begin
  alter publication supabase_realtime add table public.planner_state;
exception
  when duplicate_object then null;
end $$;
