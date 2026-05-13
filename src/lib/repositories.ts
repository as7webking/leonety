import 'server-only'
import { createServerSupabaseClient } from './supabase-server'

export interface Income {
  id: string
  amount: number
  description: string
  category: string
  date: string
  currency: string
  company_id: string
}

export interface Expense {
  id: string
  amount: number
  description: string
  category: string
  date: string
  currency: string
  company_id: string
}

export interface TimeEntry {
  id: string
  description: string
  hours: number
  date: string
  company_id: string
}

export interface Company {
  id: string
  owner_id: string
  name: string
  type: 'personal' | 'business'
  currency: string | null
  created_at: string
  updated_at: string
}

export class IncomeRepository {
  static async getAll(companyId: string) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('incomes')
      .select('*')
      .eq('company_id', companyId)
      .order('date', { ascending: false })
    if (error) throw error
    return data
  }

  static async create(companyId: string, income: Omit<Income, 'id' | 'company_id'>) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('incomes')
      .insert({ ...income, company_id: companyId })
      .select()
      .single()
    if (error) throw error
    return data
  }

  static async update(id: string, income: Partial<Income>) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('incomes')
      .update(income)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  static async delete(id: string) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase
      .from('incomes')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}

export class ExpenseRepository {
  static async getAll(companyId: string) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('company_id', companyId)
      .order('date', { ascending: false })
    if (error) throw error
    return data
  }

  static async create(companyId: string, expense: Omit<Expense, 'id' | 'company_id'>) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...expense, company_id: companyId })
      .select()
      .single()
    if (error) throw error
    return data
  }

  static async update(id: string, expense: Partial<Expense>) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('expenses')
      .update(expense)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  static async delete(id: string) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}

export class TimeEntryRepository {
  static async getAll(companyId: string) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('time_entries')
      .select('*')
      .eq('company_id', companyId)
      .order('date', { ascending: false })
    if (error) throw error
    return data
  }

  static async create(companyId: string, entry: Omit<TimeEntry, 'id' | 'company_id'>) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('time_entries')
      .insert({ ...entry, company_id: companyId })
      .select()
      .single()
    if (error) throw error
    return data
  }

  static async update(id: string, entry: Partial<TimeEntry>) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('time_entries')
      .update(entry)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  static async delete(id: string) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase
      .from('time_entries')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}

export class CompanyRepository {
  static async getAll(ownerId: string) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data
  }
}
