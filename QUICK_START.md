# 🚀 Quick Start Checklist - Email Verification & Profile System

## What's New ✨
- ✅ Password visibility toggle (eye icon)
- ✅ Full name field on signup
- ✅ Email verification flow
- ✅ Profile/settings page at `/profile`
- ✅ Auto-create user profiles
- ✅ All features without breaking existing code

---

## Step-by-Step Setup

### Step 1: Configure Supabase (5 min)
- [ ] Open **Supabase Dashboard**
- [ ] Go to **Auth → Providers → Email**
- [ ] Enable "Confirm email" toggle
- [ ] Verify email templates are set up

**Why?** Without this, email verification won't work

### Step 2: Create User Profiles on Signup (2 min)
- [ ] Open `migrations/fix_auth_and_rls.sql` in your project
- [ ] Copy the **entire contents** of the file
- [ ] Go to **Supabase SQL Editor** → **New Query**
- [ ] Paste the entire migration script
- [ ] Click **Run** (⌘+Enter)
- [ ] Wait for success message

**What this does:**
- ✅ Creates all database tables (profiles, incomes, expenses, time_entries)
- ✅ Sets up automatic user profile creation
- ✅ Enables Row Level Security for data protection
- ✅ Creates all necessary policies

**❌ Don't run partial SQL** - the old guide had incomplete code that caused errors. Use the complete migration file.

**Note:** If you see "must be owner of table users" - this is normal! Skip that line and continue.

### Step 2.5: Verify Setup (1 min)
- [ ] Open `migrations/test_setup.sql`
- [ ] Copy and run in Supabase SQL Editor
- [ ] Check that all tables, triggers, and policies exist
- [ ] If anything missing, re-run the main migration

### Step 3: Test Signup Flow (3 min)
- [ ] Go to `http://localhost:3000` (or your dev server)
- [ ] Click login page (should auto-redirect if not logged in)
- [ ] Click "Don't have an account? Create one"
- [ ] Fill form:
  - Email: `test@example.com`
  - Full Name: `Test User`
  - Password: `password123`
  - Currency: Select any
- [ ] Click "Create Account"
- [ ] Should see message: "Check your email for confirmation"

**Expected:** Email received at your test email

### Step 4: Verify Email (2 min)
- [ ] Check your test email inbox
- [ ] Find email from "noreply@..." with subject "Confirm your signup"
- [ ] Click the confirmation link
- [ ] Should redirect to dashboard

**If no email:**
- Check spam folder
- Verify email address is correct
- Check Supabase auth logs

### Step 5: Login (1 min)
- [ ] You should be on `/dashboard` but not logged in yet
- [ ] Click login (navbar top-right or go to `/login`)
- [ ] Enter email and password from step 3
- [ ] Click "Sign In"
- [ ] Should be logged in and on dashboard

### Step 6: View Profile (2 min)
- [ ] Click **Profile** in navbar
- [ ] You should see:
  - Full Name: "Test User"
  - Email: "test@example.com"
  - Currency: "EUR" (or your choice)
  - Account created date
- [ ] Try changing full name to "Test User Updated"
- [ ] Click "Save Changes"
- [ ] Should see green success message

### Step 7: Test Password Toggle (30 sec)
- [ ] Go back to login page
- [ ] Enter any text in password field
- [ ] Click the **eye icon** - password should be visible
- [ ] Click again - password should be hidden (dots)
- [ ] Verify both desktop and mobile

### Step 8: Test Logout (1 min)
- [ ] From profile page, click **Sign Out** button
- [ ] Should redirect to login page
- [ ] Should NOT be logged in
- [ ] Pages like `/dashboard` should redirect to login

---

## ✅ Final Checklist

### Authentication
- [ ] Can create account with email, name, password, currency
- [ ] Can see password toggle (eye icon)
- [ ] Email verification sent
- [ ] Can click email link to confirm
- [ ] Can log in after email verification
- [ ] Cannot log in without email verification

### Profile Page (`/profile`)
- [ ] Can view full name
- [ ] Can view email (disabled, read-only)
- [ ] Can view default currency
- [ ] Can view account created date
- [ ] Can edit full name
- [ ] Can change currency
- [ ] Can save changes (shows success message)
- [ ] Can log out from profile
- [ ] Cannot access if not logged in (redirects to login)

### Navigation
- [ ] Profile link shows when logged in
- [ ] Profile link hidden when not logged in
- [ ] Works on mobile (hamburger menu)
- [ ] Works on desktop
- [ ] Logout button works

### Existing Features
- [ ] Income page still works
- [ ] Expenses page still works
- [ ] Time tracking still works
- [ ] Footer shows on all pages
- [ ] Different header on home vs dashboard

---

## Troubleshooting

### Issue: "500 Internal Server Error" on signup
**Solution:**
1. Check Supabase auth is enabled
2. Verify email provider is configured
3. Check auth logs in Supabase dashboard
4. Make sure migration was applied

### Issue: Email not received
**Solution:**
1. Check spam/junk folder
2. Verify email address is correct
3. In Supabase, check "Auth → Logs"
4. Make sure email templates exist

### Issue: Cannot access profile page
**Solution:**
1. Make sure you're logged in (check nav - should show Profile link)
2. Check browser console for errors
3. Verify database migration was applied

### Issue: Profile shows old data
**Solution:**
1. Hard refresh browser (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
2. Check browser dev tools Network tab
3. Verify Supabase connection

### Issue: Migration fails with "trigger already exists"
**Solution:**
1. This is normal - the SQL script drops old triggers first
2. It's safe to run again
3. Just click Run again

---

## Files Modified/Created

### New Files
- `src/app/profile/page.tsx` - Profile settings page
- `src/app/(auth)/login/page.tsx` - Enhanced login/signup
- `migrations/fix_auth_and_rls.sql` - Database setup
- `SUPABASE_SETUP.md` - Detailed setup guide
- `AUTH_IMPLEMENTATION.md` - Technical documentation

### Modified Files
- `src/components/nav.tsx` - Added Profile link
- `src/components/footer.tsx` - Already added
- `src/app/layout.tsx` - Already updated

---

## What's Happening Behind the Scenes

### Signup Flow
1. User fills form (email, password, full name, currency)
2. Submit to Supabase auth
3. Supabase creates auth.users entry
4. **Trigger fires** → Creates profile record
5. Confirmation email sent
6. User clicks link → Email verified
7. User logs in

### Profile Retrieval
1. User visits `/profile`
2. Frontend fetches from `profiles` table
3. **RLS policy** ensures user can only see their profile
4. Display shows user's data

### Update Profile
1. User changes name/currency
2. Submit update
3. **RLS policy** checks user ID
4. Update only user's profile
5. Show success message

---

## Next Steps (After Everything Works)

1. **Deploy to production** when ready
2. **Add password reset** email flow
3. **Add profile picture** upload
4. **Add 2FA** (two-factor authentication)
5. **Add account deletion** option

---

## Need Help?

- **Technical docs:** Read `AUTH_IMPLEMENTATION.md`
- **Setup issues:** Read `SUPABASE_SETUP.md`
- **Database help:** See `migrations/README.md`
- **Quick questions:** Check this checklist

---

**You're all set! The code is built and ready. Just follow Steps 1-8 above to get everything working.** ✨
