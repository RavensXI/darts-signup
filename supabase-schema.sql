-- Darts Club Signup System - Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Create signups table
create table if not exists signups (
  id uuid primary key default gen_random_uuid(),
  initials text not null check (char_length(initials) >= 3),
  year_group text not null check (year_group in ('Y7', 'Y8', 'Y9', 'Y10')),
  club_night text not null check (club_night in ('Monday', 'Tuesday', 'Thursday', 'Friday')),
  status text not null default 'Confirmed' check (status in ('Confirmed', 'Reserve')),
  created_at timestamptz not null default now()
);

-- Unique constraint: same initials can't sign up twice for the same night
alter table signups
  add constraint unique_initials_per_night unique (initials, club_night);

-- 2. Create settings table
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  admin_pin text not null default '1234',
  signups_open boolean not null default true,
  announcement text
);

-- Seed default settings row
insert into settings (id, admin_pin, signups_open, announcement)
values (1, '1234', true, null)
on conflict (id) do nothing;

-- 3. Enable Row Level Security
alter table signups enable row level security;
alter table settings enable row level security;

-- 4. RLS Policies for signups (permissive for v1 - no personal data stored)
create policy "Anyone can view signups"
  on signups for select
  using (true);

create policy "Anyone can insert signups"
  on signups for insert
  with check (true);

create policy "Anyone can update signups"
  on signups for update
  using (true);

create policy "Anyone can delete signups"
  on signups for delete
  using (true);

-- 5. RLS Policies for settings
create policy "Anyone can view settings"
  on settings for select
  using (true);

create policy "Anyone can update settings"
  on settings for update
  using (true);

-- 6. Enable realtime for signups table
alter publication supabase_realtime add table signups;
alter publication supabase_realtime add table settings;

-- 7. Index for faster queries
create index if not exists idx_signups_club_night on signups (club_night);
create index if not exists idx_signups_club_night_status on signups (club_night, status, created_at);
