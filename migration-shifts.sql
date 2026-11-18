-- Existing installations only. Run once before deploying the updated app.
-- Existing statuses and notes are preserved; no shift or site is guessed.
begin;

alter table public.availability
  add column shift text check (shift in ('AM', 'PM')),
  add column site text check (site in ('NRDC', 'WSDC', 'HBDC','Other')),
  add column start_time time without time zone,
  add column end_time time without time zone,
  add column start_holiday boolean not null default false,
  add column end_holiday boolean not null default false,
  add constraint availability_shift_site_check check (
    (shift is null and site is null)
    or (shift is not null and site is not null and status = 'busy')
  add constraint availability_pay_times_check check (
    (start_time is null and end_time is null and not start_holiday and not end_holiday)
    or (start_time is not null and end_time is not null and start_time <> end_time
        and start_time < time '24:00' and end_time < time '24:00'
        and extract(second from start_time) = 0 and extract(second from end_time) = 0
        and shift is not null and (not end_holiday or (end_time < start_time and end_time > time '00:00')))
  );

commit;
