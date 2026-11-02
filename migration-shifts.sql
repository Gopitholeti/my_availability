-- Existing installations only. Run once before deploying the updated app.
-- Existing statuses and notes are preserved; no shift or site is guessed.
begin;

alter table public.availability
  add column shift text check (shift in ('AM', 'PM')),
  add column site text check (site in ('NRDC', 'WSDC', 'HBDC')),
  add constraint availability_shift_site_check check (
    (shift is null and site is null)
    or (shift is not null and site is not null and status = 'busy')
  );

commit;