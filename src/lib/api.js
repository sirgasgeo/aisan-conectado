// src/lib/api.js
// Gerenciador de conexão ultra-rápido entre o app do celular e a Central SESANI (OneDrive)

const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/sirgasgeo/aisan-conectado/main/server_url.json'
const STORAGE_KEY = 'aisan_backend_url'

let cachedBaseUrl = ''
try {
  cachedBaseUrl = localStorage.getItem(STORAGE_KEY) || ''
} catch (_) {}

let activeFetchPromise = null

export function isLocalhost() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
}

/**
 * Busca a URL do servidor diretamente do GitHub sem travar o app
 */
export async function getApiBaseUrl(forceRefresh = false) {
  if (isLocalhost()) return ''

  // Se já temos a URL e não é refresh forçado, retorna imediatamente
  if (cachedBaseUrl && !forceRefresh) {
    return cachedBaseUrl
  }

  // Evita múltiplas chamadas simultâneas de rede
  if (activeFetchPromise && !forceRefresh) {
    return activeFetchPromise
  }

  activeFetchPromise = (async () => {
    try {
      // 1. Tenta buscar no GitHub raw com timeout curto de 3.5s
      const res = await fetch(`${GITHUB_RAW_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(3500)
      })
      if (res.ok) {
        const data = await res.json()
        if (data && data.url) {
          const cleanUrl = data.url.replace(/\/$/, '')
          cachedBaseUrl = cleanUrl
          try { localStorage.setItem(STORAGE_KEY, cleanUrl) } catch (_) {}
          return cleanUrl
        }
      }
    } catch (e) {
      console.warn('Tentando fallback de URL do servidor...', e)
    } finally {
      activeFetchPromise = null
    }

    // Se falhou mas temos no localStorage, usa como último recurso
    try {
      const local = localStorage.getItem(STORAGE_KEY)
      if (local && local.startsWith('https://')) {
        cachedBaseUrl = local
        return local
      }
    } catch (_) {}

    return cachedBaseUrl
  })()

  return activeFetchPromise
}

/**
 * Testa se a Central está online e respondendo em alta velocidade
 */
export async function checkServerHealth(force = false) {
  let base = await getApiBaseUrl(force)
  if (!base) {
    base = await getApiBaseUrl(true)
  }
  if (!base) return false

  try {
    const res = await fetch(`${base}/api/status?t=${Date.now()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000)
    })
    if (res.ok) {
      const data = await res.json()
      return data && data.status === 'online'
    }
  } catch (err) {
    // Se falhou com a URL em cache, pode ser que o PC tenha reiniciado e gerado um novo túnel!
    // Força a atualização imediata da rota no GitHub e tenta de novo NA HORA:
    if (!force) {
      try {
        const freshBase = await getApiBaseUrl(true)
        if (freshBase && freshBase !== base) {
          const retryRes = await fetch(`${freshBase}/api/status?t=${Date.now()}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(3000)
          })
          if (retryRes.ok) {
            const retryData = await retryRes.json()
            return retryData && retryData.status === 'online'
          }
        }
      } catch (_) {}
    }
  }
  return false
}

/**
 * Envia dados para a Central com auto-recuperação de túnel
 */
export async function apiFetch(endpoint, options = {}) {
  let base = isLocalhost() ? '' : await getApiBaseUrl()
  let fullUrl = `${base}${endpoint}`

  try {
    let response = await fetch(fullUrl, options)
    // Se der erro de túnel ou servidor (502, 503, 530, 404), atualiza e retenta
    if (!response.ok && !isLocalhost() && (response.status >= 500 || response.status === 404)) {
      const refreshedBase = await getApiBaseUrl(true)
      if (refreshedBase && refreshedBase !== base) {
        fullUrl = `${refreshedBase}${endpoint}`
        response = await fetch(fullUrl, options)
      }
    }
    return response
  } catch (err) {
    // Erro de rede (ex: túnel antigo caiu), força buscar a nova rota e retenta
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
