// src/lib/api.js
// Gerenciador de conexão dinâmico entre o frontend permanente (GitHub Pages)
// e o servidor local do computador de Paulo (OneDrive)

const GITHUB_SERVER_URL = 'https://raw.githubusercontent.com/sirgasgeo/aisan-conectado/main/server_url.json'
const STORAGE_KEY = 'aisan_backend_url'

let cachedBaseUrl = localStorage.getItem(STORAGE_KEY) || 'https://modes-tag-favorites-compaq.trycloudflare.com'
let lastFetchTime = 0

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
export async function getApiBaseUrl(force = false) {
  if (isLocalhost()) {
    return ''
  }

  const now = Date.now()
  // Atualiza se forçado, se não tiver cache ou a cada 45 segundos
  if (force || !cachedBaseUrl || (now - lastFetchTime > 45000)) {
    try {
      const res = await fetch(`${GITHUB_SERVER_URL}?t=${now}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        if (data && data.url) {
          const cleanUrl = data.url.replace(/\/$/, '')
          cachedBaseUrl = cleanUrl
          lastFetchTime = now
          localStorage.setItem(STORAGE_KEY, cleanUrl)
          return cleanUrl
        }
      }
    } catch (err) {
      console.warn('Erro ao consultar servidor dinâmico:', err)
    }
  }

  return cachedBaseUrl || 'https://modes-tag-favorites-compaq.trycloudflare.com'
}

/**
 * Testa se o servidor do computador está online e respondendo
 */
export async function checkServerHealth() {
  try {
    const base = await getApiBaseUrl()
    const url = `${base}/api/status`
    const res = await fetch(url, { 
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    })
    if (res.ok) {
      const data = await res.json()
      return data && data.status === 'online'
    }
  } catch (_) {}
  return false
}

/**
 * Faz requisições para a API direcionando automaticamente para o servidor do PC
 */
export async function apiFetch(endpoint, options = {}) {
  let base = isLocalhost() ? '' : await getApiBaseUrl()
  let fullUrl = `${base}${endpoint}`

  try {
    let response = await fetch(fullUrl, options)
    
    // Se o servidor respondeu com erro (404, 502, 503, 530), tenta atualizar a rota e reenviar
    if (!response.ok && !isLocalhost() && response.status >= 500) {
      const refreshedBase = await getApiBaseUrl(true)
      if (refreshedBase && refreshedBase !== base) {
        fullUrl = `${refreshedBase}${endpoint}`
        response = await fetch(fullUrl, options)
      }
    }
    return response
  } catch (err) {
    // Se deu erro de rede (CORS ou offline do tunnel antigo), atualiza rota e retenta
    if (!isLocalhost()) {
      try {
        const refreshedBase = await getApiBaseUrl(true)
        if (refreshedBase && refreshedBase !== base) {
          fullUrl = `${refreshedBase}${endpoint}`
          return await fetch(fullUrl, options)
        }
      } catch (_) {}
    }
    throw err
  }
}
