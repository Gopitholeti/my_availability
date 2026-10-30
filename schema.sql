create table public.availability (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  status text not null check (status in ('free', 'busy')),
  note text not null default '' check (char_length(note) <= 500),
  primary key (user_id, date)
);

alter table public.availability enable row level security;

revoke all on public.availability from anon;
grant select, insert, update, delete on public.availability to authenticated;

create policy "Users manage only their own availability"
on public.availability
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);