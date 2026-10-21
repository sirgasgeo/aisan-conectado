import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import os from 'os'

const url = 'https://nrdtgdegrdouuxvtxcdr.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yZHRnZGVncmRvdXV4dnR4Y2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwODQ2NjksImV4cCI6MjEwNzY2MDY2OX0.zo725ZQ1VOpmId_7xzazniajbed1TZ9-LaNgGEKu3yo'

const supabase = createClient(url, key)

async function migrate() {
  const filePath = path.join(os.homedir(), 'OneDrive - Ministério da Saúde', 'AISAN_Dados', 'relatorios_sesani.json')
  if (!fs.existsSync(filePath)) {
    console.error('Arquivo nao encontrado:', filePath)
    return
  }

  const reports = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  console.log(`Encontrados ${reports.length} relatórios para migrar...`)

  let success = 0
  for (const r of reports) {
    const payload = {
      id: Number(r.id),
      aisan_nome: r.aisanNome || 'AISAN',
      polo_base: r.poloBase || '',
      aldeia: r.aldeia || '',
      data: r.data || '',
      tipo: r.tipo || '',
      descricao: r.descricao || '',
      fotos: r.fotos || [],
      status: r.status || 'recebido',
      timestamp: r.timestamp || Date.now(),
      confirmado_por: r.confirmadoPor || null,
      confirmado_em: r.confirmadoEm || null
    }

    const { error } = await supabase.from('relatorios').upsert([payload], { onConflict: 'id' })
    if (error) {
      console.error(`Erro ao migrar id ${r.id}:`, error.message)
    } else {
      success++
      console.log(`✓ Relatório migrado com sucesso: [${r.id}] ${payload.aldeia} - ${payload.tipo}`)
    }
  }

  console.log(`\nFinalizado: ${success}/${reports.length} migrados para o Supabase!`)
}

migrate()
