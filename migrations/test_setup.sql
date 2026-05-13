-- Quick test to verify your database setup
-- Run this in Supabase SQL Editor after running the main migration

-- Check if tables exist
SELECT
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'incomes', 'expenses', 'time_entries');

-- Check if trigger exists
SELECT
  tgname AS trigger_name,
  tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';

-- Check if function exists
SELECT
  proname AS function_name,
  pg_get_function_identity_arguments(oid) AS arguments
FROM pg_proc
WHERE proname = 'handle_new_user';

-- Check RLS status
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'incomes', 'expenses', 'time_entries');

-- Check existing policies
SELECT
  schemaname,
  tablename,
  policyname
FROM pg_policies
WHERE schemaname = 'public';