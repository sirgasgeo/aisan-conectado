import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import os from 'os'

const SUPABASE_URL = 'https://nrdtgdegrdouuxvtxcdr.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yZHRnZGVncmRvdXV4dnR4Y2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwODQ2NjksImV4cCI6MjEwNzY2MDY2OX0.zo725ZQ1VOpmId_7xzazniajbed1TZ9-LaNgGEKu3yo'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function getAllOneDrivePaths() {
  const home = os.homedir()
  const paths = []

  const msParent = path.join(home, 'OneDrive - Ministério da Saúde')
  if (fs.existsSync(msParent)) {
    const msDir = path.join(msParent, 'AISAN_Dados')
    if (!fs.existsSync(msDir)) {
      try { fs.mkdirSync(msDir, { recursive: true }) } catch (_) {}
    }
    paths.push(msDir)
  }

  const personalParent = path.join(home, 'OneDrive')
  if (fs.existsSync(personalParent)) {
    const pDir = path.join(personalParent, 'AISAN_Dados')
    if (!fs.existsSync(pDir)) {
      try { fs.mkdirSync(pDir, { recursive: true }) } catch (_) {}
    }
    if (!paths.includes(pDir)) paths.push(pDir)
  }

  if (paths.length === 0) {
    const fallbackDir = path.join(home, 'OneDrive', 'AISAN_Dados')
    try { fs.mkdirSync(fallbackDir, { recursive: true }) } catch (_) {}
    paths.push(fallbackDir)
  }

  return paths
}

export async function syncFromSupabase() {
  const { data: reports, error } = await supabase
    .from('relatorios')
    .select('*')
    .order('id', { ascending: false })

  if (error) {
    console.error('Erro ao buscar dados do Supabase:', error.message)
    return
  }

  const dirs = getAllOneDrivePaths()
  let photosSaved = 0

  for (const dir of dirs) {
    const fotosDir = path.join(dir, 'Fotos_Relatorios')
    if (!fs.existsSync(fotosDir)) {
      fs.mkdirSync(fotosDir, { recursive: true })
    }

    // 1. Extrair e salvar cada foto em disco
    for (const r of reports) {
      const safeName = (r.aisan_nome || 'AISAN').replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_')
      const safeAldeia = (r.aldeia || 'Aldeia').replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_')
      const dataStr = r.data || 'data'

      const fotos = Array.isArray(r.fotos) ? r.fotos : []
      fotos.forEach((fotoBase64, idx) => {
        if (fotoBase64 && typeof fotoBase64 === 'string' && fotoBase64.includes('base64,')) {
          const base64Data = fotoBase64.split(';base64,').pop()
          const ext = fotoBase64.includes('image/png') ? 'png' : 'jpg'
          const filename = `${safeName}_${safeAldeia}_${dataStr}_foto${idx + 1}_${r.id}.${ext}`
          
          const fullPathRoot = path.join(dir, filename)
          const fullPathFotos = path.join(fotosDir, filename)

          if (!fs.existsSync(fullPathRoot)) {
            fs.writeFileSync(fullPathRoot, base64Data, { encoding: 'base64' })
            photosSaved++
          }
          if (!fs.existsSync(fullPathFotos)) {
            fs.writeFileSync(fullPathFotos, base64Data, { encoding: 'base64' })
          }
        }
      })
    }

    // 2. Atualizar relatorios_sesani.json com todos os relatórios completos
    const normalizedReports = reports.map(r => ({
      id: Number(r.id),
      aisanNome: r.aisan_nome,
      poloBase: r.polo_base,
      aldeia: r.aldeia,
      data: r.data,
      tipo: r.tipo,
      descricao: r.descricao,
      fotos: r.fotos || [],
      status: r.status || 'recebido',
      timestamp: r.timestamp,
      confirmadoPor: r.confirmado_por,
      confirmadoEm: r.confirmado_em
    }))

    const relatoriosFile = path.join(dir, 'relatorios_sesani.json')
    fs.writeFileSync(relatoriosFile, JSON.stringify(normalizedReports, null, 2), 'utf-8')

    // 3. Atualizar arquivos individuais por AISAN
    const reportsByAisan = {}
    normalizedReports.forEach(r => {
      const name = r.aisanNome || 'AISAN'
      if (!reportsByAisan[name]) reportsByAisan[name] = []
      reportsByAisan[name].push(r)
    })

    for (const [name, list] of Object.entries(reportsByAisan)) {
      const safeName = name.replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_')
      const aisanFile = path.join(dir, `atividades_${safeName}.json`)
      fs.writeFileSync(aisanFile, JSON.stringify(list, null, 2), 'utf-8')
    }
  }

  if (photosSaved > 0) {
    console.log(`[${new Date().toLocaleTimeString()}] Sincronizado: ${photosSaved} novas fotos salvas no OneDrive!`)
  }
}

async function main() {
  console.log('--- Sincronizador Supabase -> OneDrive Ativo ---')
  await syncFromSupabase()
  if (process.argv.includes('--watch')) {
    console.log('[Monitor Contínuo] Verificando novas fotos no Supabase a cada 30 segundos...')
    setInterval(async () => {
      try {
        await syncFromSupabase()
      } catch (err) {
        console.warn('Erro na sincronização periódica:', err.message)
      }
    }, 30000)
  }
}

main()
