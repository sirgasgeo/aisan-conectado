import { createClient } from '@supabase/supabase-js'

const DEFAULT_SUPABASE_URL = 'https://nrdtgdegrdouuxvtxcdr.supabase.co'
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yZHRnZGVncmRvdXV4dnR4Y2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwODQ2NjksImV4cCI6MjEwNzY2MDY2OX0.zo725ZQ1VOpmId_7xzazniajbed1TZ9-LaNgGEKu3yo'

export function getSupabaseCredentials() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY
  
  let localUrl = ''
  let localKey = ''
  try {
    localUrl = localStorage.getItem('aisan_supabase_url') || ''
    localKey = localStorage.getItem('aisan_supabase_anon_key') || ''
  } catch (_) {}

  const url = localUrl || envUrl
  const key = localKey || envKey

  return { url, key, isConfigured: Boolean(url && key && url.startsWith('https://')) }
}

export function getSupabaseClient() {
  const { url, key, isConfigured } = getSupabaseCredentials()
  if (isConfigured) {
    try {
      return createClient(url, key)
    } catch (err) {
      console.warn('Erro ao inicializar cliente Supabase:', err)
      return null
    }
  }
  return null
}
