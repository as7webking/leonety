# Supabase Setup Guide - Email Verification & User Profiles

## Issue: 500 Error on Signup

The 500 error when signing up is likely because:
1. Email verification is not enabled in Supabase settings
2. The user trigger/function is not properly configured
3. Missing database permissions

## Steps to Fix:

### 1. Supabase Auth Settings
Go to **Supabase Dashboard** → **Authentication** → **Providers** → **Email**

Make sure these are configured:
- ✅ **Enable Email provider** - enabled
- ✅ **Confirm email** - enabled (user must confirm email before signing in)
- ✅ Standard Email signup - enabled

### 2. Email Templates
Go to **Authentication** → **Email Templates**

- Confirm signup - Make sure the link includes `{{ .ConfirmationURL }}`
- Default template should say "Click here to confirm your email"

### 3. Redirect URL
Go to **Authentication** → **URL Configuration**

Add your redirect URI:
- For development: `http://localhost:3000`
- For production: `https://yourdomain.com`

### 4. Run Complete Database Migration

**IMPORTANT:** Don't run the partial SQL code from the old guide. Use the complete migration file instead.

**Note:** You may see "must be owner of table users" error - this is normal! The `auth.users` table is managed by Supabase and you cannot modify it. Just skip that line and continue with the rest of the migration.

Go to **Supabase SQL Editor** → **New Query** and run this complete script:

```sql
-- Complete database setup - copy everything below this line
-- This creates all tables, triggers, and security policies

-- Enable RLS on auth.users (if not already enabled)
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create incomes table if it doesn't exist
CREATE TABLE IF NOT EXISTS incomes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  category TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create expenses table if it doesn't exist
CREATE TABLE IF NOT EXISTS expenses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  category TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create time_entries table if it doesn't exist
CREATE TABLE IF NOT EXISTS time_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT,
  hours DECIMAL(4,2) NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- Drop existing trigger and function (safe to run multiple times)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create the function that runs when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, currency)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'currency', 'USD')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on auth.users table
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Drop existing RLS policies (safe to run multiple times)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Create RLS Policies for profiles table
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- And so on for other tables...
-- (Complete script is in migrations/fix_auth_and_rls.sql)
```

**OR BETTER:** Use the complete migration file:

1. Open `migrations/fix_auth_and_rls.sql` in your project
2. Copy the entire contents
3. Paste into Supabase SQL Editor
4. Click **Run**

This creates all tables, triggers, and policies in one go.

### 5. Enable Row Level Security (RLS)

Go to **Database** → **Tables** → **profiles**

Click **Enable RLS** and add these policies:

```sql
-- View own profile
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- Update own profile  
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);

-- Insert own profile
CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
WITH CHECK (auth.uid() = id);
```

## Signup Flow with Email Verification

1. User fills in: Email, Password (6+ chars), Full Name, Currency
2. User clicks "Create Account"
3. Supabase sends confirmation email
4. User clicks link in email
5. User is redirected to `/dashboard`
6. User can now log in
7. Profile is automatically created via trigger

## Password Requirements
- Minimum 6 characters (configurable in Supabase)
- No spaces required
- No special characters required

## Email Verification Success
- Confirmation sent to user's email
- Link is valid for 24 hours (default)
- After clicking, `email_confirmed_at` is set

## Test the Flow
1. Sign up with test email
2. Check email for confirmation link
3. Click the link - should redirect to dashboard
4. Log in with credentials
5. Visit `/profile` to see your profile
6. Update your profile information

## Troubleshooting

### Still getting 500 error?
- Check Supabase logs: **Auth** → **Logs**
- Check email provider status
- Verify auth.users table has the new user entry

### Email not received?
- Check spam folder
- Verify email provider is enabled
- Check sendgrid/mailgun logs if using custom SMTP

### Profile not created?
- Check browser console for errors
- Verify trigger exists: `SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created'`
- Check function: `SELECT * FROM pg_proc WHERE proname = 'handle_new_user'`

## Features Implemented

✅ **Email Verification** - Users must confirm email before logging in
✅ **Password Toggle** - Eye icon to show/hide password
✅ **Full Name** - Required during signup
✅ **Currency Selection** - Choose default currency during signup
✅ **Profile Page** - View and edit user info at `/profile`
✅ **User Database** - Automatic profile creation via trigger
✅ **Logout** - From navbar or profile page

## Database Schema

### profiles table
- `id` (UUID) - References auth.users
- `email` (TEXT) - User's email
- `full_name` (TEXT) - User's name
- `currency` (TEXT) - Default currency (USD, EUR, etc)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

All data is protected by RLS - users can only see/edit their own profile.
