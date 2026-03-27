-- Migration: Change initials column to support "FirstName L" format
-- Run this in Supabase SQL Editor

-- Drop the old length constraint on initials
alter table signups drop constraint if exists signups_initials_check;

-- Add new constraint: must be at least 3 chars (e.g. "Jo S")
alter table signups add constraint signups_initials_check
  check (char_length(initials) >= 3);
