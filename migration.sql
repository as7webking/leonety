-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.active_timers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  description text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  paused_at timestamp with time zone,
  accumulated_seconds integer NOT NULL DEFAULT 0,
  CONSTRAINT active_timers_pkey PRIMARY KEY (id),
  CONSTRAINT active_timers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT active_timers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.admin_accounts (
  user_id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admin_accounts_pkey PRIMARY KEY (user_id),
  CONSTRAINT admin_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.app_access (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  tier text NOT NULL DEFAULT 'free'::text CHECK (tier = ANY (ARRAY['free'::text, 'starter'::text, 'pro'::text, 'business'::text])),
  manual_override boolean NOT NULL DEFAULT false,
  override_note text,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT app_access_pkey PRIMARY KEY (id),
  CONSTRAINT app_access_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT app_access_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['personal'::text, 'business'::text])),
  currency text CHECK (currency IS NULL OR (currency = ANY (ARRAY['EUR'::text, 'GBP'::text, 'CHF'::text, 'DKK'::text, 'NOK'::text, 'SEK'::text, 'PLN'::text, 'CZK'::text, 'HUF'::text, 'RON'::text, 'BGN'::text, 'USD'::text, 'CAD'::text, 'AUD'::text, 'JPY'::text, 'TRY'::text, 'AMD'::text, 'GEL'::text, 'AZN'::text, 'UAH'::text, 'KZT'::text]))),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT companies_pkey PRIMARY KEY (id),
  CONSTRAINT companies_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id)
);
CREATE TABLE public.exchange_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  base_currency text NOT NULL CHECK (base_currency = ANY (ARRAY['EUR'::text, 'GBP'::text, 'CHF'::text, 'DKK'::text, 'NOK'::text, 'SEK'::text, 'PLN'::text, 'CZK'::text, 'HUF'::text, 'RON'::text, 'BGN'::text, 'USD'::text, 'CAD'::text, 'AUD'::text, 'JPY'::text, 'TRY'::text, 'AMD'::text, 'GEL'::text, 'AZN'::text, 'UAH'::text, 'KZT'::text])),
  quote_currency text NOT NULL CHECK (quote_currency = ANY (ARRAY['EUR'::text, 'GBP'::text, 'CHF'::text, 'DKK'::text, 'NOK'::text, 'SEK'::text, 'PLN'::text, 'CZK'::text, 'HUF'::text, 'RON'::text, 'BGN'::text, 'USD'::text, 'CAD'::text, 'AUD'::text, 'JPY'::text, 'TRY'::text, 'AMD'::text, 'GEL'::text, 'AZN'::text, 'UAH'::text, 'KZT'::text])),
  rate numeric NOT NULL CHECK (rate > 0::numeric),
  rate_date date NOT NULL DEFAULT CURRENT_DATE,
  source text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT exchange_rates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  amount numeric NOT NULL,
  description text,
  category text,
  date date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  currency text NOT NULL DEFAULT 'USD'::text,
  company_id uuid NOT NULL,
  CONSTRAINT expenses_pkey PRIMARY KEY (id),
  CONSTRAINT expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT expenses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.incomes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  amount numeric NOT NULL,
  description text,
  category text,
  date date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  currency text NOT NULL DEFAULT 'USD'::text,
  company_id uuid NOT NULL,
  CONSTRAINT incomes_pkey PRIMARY KEY (id),
  CONSTRAINT incomes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT incomes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text,
  full_name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  currency text NOT NULL DEFAULT 'USD'::text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.time_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  description text,
  hours numeric NOT NULL,
  date date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  company_id uuid NOT NULL,
  CONSTRAINT time_entries_pkey PRIMARY KEY (id),
  CONSTRAINT time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT time_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);