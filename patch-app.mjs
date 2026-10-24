import fs from 'fs'

const filePath = 'C:/Users/CRIS SESANI/.gemini/antigravity/scratch/aisan-tracker-next/src/App.jsx'
let content = fs.readFileSync(filePath, 'utf8')

const target = `  // Sincronização automática de relatórios pendentes quando o computador ligar
  const syncPendingReports = useCallback(async () => {
    try {
      const saved = localStorage.getItem('aisan_meus_relatorios')
      if (!saved) return
      const list = JSON.parse(saved)
      if (!Array.isArray(list)) return

      let hasUpdates = false
      for (let i = 0; i < list.length; i++) {
        if (list[i].savedOnServer === false) {
          try {
            const res = await apiFetch('/api/reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(list[i])
            })
            if (res.ok) {
              list[i].savedOnServer = true
              hasUpdates = true
            }
          } catch (_) {}
        }
      }

      if (hasUpdates) {
        setMeusRelatorios([...list])
        localStorage.setItem('aisan_meus_relatorios', JSON.stringify(list))
      }
    } catch (e) {
      console.warn('Erro ao sincronizar relatórios pendentes:', e)
    }
  }, [])

  const verifyServerConnection = useCallback(async (showMessage = false) => {
    setIsCheckingServer(true)
    const online = await checkServerHealth()
    setIsServerOnline(online)
    setIsCheckingServer(false)
    if (online) {
      syncPendingReports()
    }
    if (showMessage) {
      if (online) {
        alert('🟢 Central SESANI Conectada!\\n\\nSeu computador está ligado e sincronizado. Todos os relatórios e fotos enviados cairão diretamente na pasta do OneDrive.')
      } else {
        alert('🟡 Central SESANI em espera.\\n\\nO computador central está desligado no momento. Os relatórios continuam sendo salvos com segurança no seu celular e serão sincronizados automaticamente assim que o computador ligar!')
      }
    }
    return online
  }, [syncPendingReports])`

const replacement = `  // Sincronização automática de relatórios pendentes com a Nuvem 24h
  const syncPendingReports = useCallback(async () => {
    try {
      const saved = localStorage.getItem('aisan_meus_relatorios')
      if (!saved) return
      const list = JSON.parse(saved)
      if (!Array.isArray(list)) return

      let hasUpdates = false
      const client = getSupabaseClient()

      for (let i = 0; i < list.length; i++) {
        if (list[i].savedOnServer === false) {
          if (client) {
            try {
              const { error } = await client.from('relatorios').upsert([{
                id: Number(list[i].id),
                aisan_nome: list[i].aisanNome || 'AISAN',
                polo_base: list[i].poloBase || '',
                aldeia: list[i].aldeia || '',
                data: list[i].data || '',
                tipo: list[i].tipo || '',
                descricao: list[i].descricao || '',
                fotos: list[i].fotos || [],
                status: list[i].status || 'recebido',
                timestamp: typeof list[i].timestamp === 'number' ? list[i].timestamp : (Date.parse(list[i].timestamp) || Date.now())
              }], { onConflict: 'id' })
              if (!error) {
                list[i].savedOnServer = true
                hasUpdates = true
                continue
              }
            } catch (_) {}
          }

          try {
            const res = await apiFetch('/api/reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(list[i])
            })
            if (res.ok) {
              list[i].savedOnServer = true
              hasUpdates = true
            }
          } catch (_) {}
        }
      }

      if (hasUpdates) {
        setMeusRelatorios([...list])
        localStorage.setItem('aisan_meus_relatorios', JSON.stringify(list))
      }
    } catch (e) {
      console.warn('Erro ao sincronizar relatórios pendentes:', e)
    }
  }, [])

  const verifyServerConnection = useCallback(async (showMessage = false) => {
    setIsCheckingServer(true)
    let online = false
    const client = getSupabaseClient()
    if (client) {
      try {
        const { error } = await client.from('relatorios').select('id').limit(1)
        if (!error) online = true
      } catch (_) {}
    }

    if (!online) {
      online = await checkServerHealth()
    }

    setIsServerOnline(online)
    setIsCheckingServer(false)

    if (online) {
      syncPendingReports()
    }

    if (showMessage) {
      if (online) {
        alert('🟢 Central Conectada!\\n\\nA Nuvem 24h está ativa e sincronizada. Todos os relatórios e fotos enviados cairão diretamente no sistema.')
      } else {
        alert('🟡 Central em espera.\\n\\nSem conexão com a internet no momento. Os relatórios continuam sendo salvos com segurança no seu celular e serão sincronizados automaticamente assim que houver sinal!')
      }
    }
    return online
  }, [syncPendingReports])`

if (content.includes(target)) {
  content = content.replace(target, replacement)
  fs.writeFileSync(filePath, content, 'utf8')
  console.log('REPLACED WITH SUCCESS!')
} else {
  // Try CRLF / LF normalized
  const normContent = content.replace(/\r\n/g, '\n')
  const normTarget = target.replace(/\r\n/g, '\n')
  if (normContent.includes(normTarget)) {
    const normRepl = replacement.replace(/\r\n/g, '\n')
    const updated = normContent.replace(normTarget, normRepl)
    fs.writeFileSync(filePath, updated, 'utf8')
    console.log('REPLACED WITH SUCCESS (normalized)!')
  } else {
    console.error('Target still not found!')
  }
}
