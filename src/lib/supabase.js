import { createClient } from '@supabase/supabase-js'

export function getSupabaseCredentials() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || ''
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  
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
