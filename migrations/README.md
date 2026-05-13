# Database Migrations

This folder contains SQL migrations for setting up your Leonety database.

## How to Apply Migrations

### Option 1: Using Supabase SQL Editor (Recommended)

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of the migration file (e.g., `fix_auth_and_rls.sql`)
4. Paste into the SQL editor
5. Click **Run** (or press ⌘+Enter on Mac)
6. Verify no errors appeared

### Option 2: Using Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link your project
supabase link --project-ref <YOUR_PROJECT_REF>

# Apply migration
supabase db push
```

## Migrations

### fix_auth_and_rls.sql
This migration sets up:
- ✅ Row Level Security (RLS) on all tables
- ✅ Auth trigger for automatic user profile creation
- ✅ All RLS policies for secure data access

**When to run:** Before first user signup
**Time to complete:** < 1 minute
**Rollback:** Manual - save original policies first

## Database Structure

After migrations, your database will have:

1. **auth.users** (Supabase managed)
   - id, email, encrypted_password, confirmation_token, etc.

2. **public.profiles**
   - User-specific data (full_name, currency)
   - Automatically created when user signs up

3. **public.incomes, expenses, time_entries**
   - User's financial data
   - All protected by RLS policies

## Verifying Migrations

To check if migrations applied successfully:

```sql
-- Check if trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- Check if function exists
SELECT * FROM pg_proc WHERE proname = 'handle_new_user';

-- Check RLS status
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE rowsecurity = true;

-- Check existing policies
SELECT * FROM pg_policies;
```

## Troubleshooting

### Migration fails with "trigger already exists"
- This is expected on subsequent runs
- The migration includes `DROP IF EXISTS` to handle this
- Safe to re-run

### RLS policies not applied
- Check Supabase logs for SQL errors
- Verify you have sufficient permissions
- Try re-applying the migration

### Users can't sign up
- Check the trigger is enabled: `SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created'`
- Check function exists: `SELECT * FROM pg_proc WHERE proname = 'handle_new_user'`
- Review Supabase auth logs for errors

### "Policy does not exist" error
- This is fine - the migration drops old policies before creating new ones
- Verify new policies exist with the SELECT query above

## Next Steps

1. Run the migration
2. Go to your app and test signup
3. Check your email for confirmation link
4. Click link and log in
5. Visit `/profile` to see your profile created automatically

## Testing Your Setup

After running the migration, verify everything works:

1. **Run the test script:**
   - Open `migrations/test_setup.sql`
   - Copy and paste into Supabase SQL Editor
   - Run it
   - Check the results

2. **Expected results:**
   - Tables: profiles, incomes, expenses, time_entries should exist
   - Trigger: on_auth_user_created should exist
   - Function: handle_new_user should exist
   - RLS: All tables should have rowsecurity = true
   - Policies: Multiple policies should exist for each table

3. **If something is missing:**
   - Re-run the main migration (`fix_auth_and_rls.sql`)
   - Check Supabase logs for errors
   - Verify you have sufficient permissions

## Common Issues & Solutions

### Migration fails with "table already exists"
- This is normal - the script uses `CREATE TABLE IF NOT EXISTS`
- Safe to re-run

### "Permission denied" error
- Make sure you're logged into Supabase with admin access
- Check your project permissions

### "must be owner of table users" error
- **This is normal!** You cannot modify the `auth.users` table
- Supabase manages this table automatically
- RLS is already enabled on `auth.users` by default
- Just skip this error and continue with the rest of the migration

### Trigger not created
- Verify the function was created first
- Check for syntax errors in the function

### RLS policies not applied
- Make sure RLS is enabled on the table first
- Check policy syntax for errors
