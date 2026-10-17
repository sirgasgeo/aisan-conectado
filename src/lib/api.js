// src/lib/api.js
// Gerenciador de conexão dinâmico entre o frontend permanente (GitHub Pages)
// e o servidor local do computador de Paulo (OneDrive)

const GITHUB_SERVER_URL = 'https://raw.githubusercontent.com/sirgasgeo/aisan-conectado/main/server_url.json'
const STORAGE_KEY = 'aisan_backend_url'

// Fallback inicial se não conseguir buscar na primeira chamada
let cachedBaseUrl = localStorage.getItem(STORAGE_KEY) || 'https://modes-tag-favorites-compaq.trycloudflare.com'

/**
 * Retorna true se estiver rodando localmente no computador
 */
export function isLocalhost() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
}

/**
 * Busca a URL pública ativa do servidor do computador registrada no GitHub
 */
export async function getApiBaseUrl() {
  if (isLocalhost()) {
    return ''
  }

  try {
    // Adiciona timestamp para não pegar cache antigo do GitHub
    const res = await fetch(`${GITHUB_SERVER_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      if (data && data.url) {
        const cleanUrl = data.url.replace(/\/$/, '')
        cachedBaseUrl = cleanUrl
        localStorage.setItem(STORAGE_KEY, cleanUrl)
        return cleanUrl
      }
    }
  } catch (err) {
    console.warn('Usando URL em cache do servidor:', err)
  }

  return cachedBaseUrl
}

/**
 * Faz requisições para a API direcionando automaticamente para o servidor do PC
 */
export async function apiFetch(endpoint, options = {}) {
  const base = isLocalhost() ? '' : (cachedBaseUrl || await getApiBaseUrl())
  const fullUrl = `${base}${endpoint}`

  try {
    const response = await fetch(fullUrl, options)
    return response
  } catch (err) {
    // Se falhar e não estiver em localhost, tenta atualizar o link uma vez e refazer
    if (!isLocalhost()) {
      try {
        const refreshedBase = await getApiBaseUrl()
        if (refreshedBase && refreshedBase !== base) {
          return await fetch(`${refreshedBase}${endpoint}`, options)
        }
      } catch (_) {}
    }
    throw err
  }
}
