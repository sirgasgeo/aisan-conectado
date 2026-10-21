import http from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'

const PORT = 5173

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

function getPrimaryOneDrivePath() {
  return getAllOneDrivePaths()[0]
}

function readAllReports() {
  const dirs = getAllOneDrivePaths()
  for (const dir of dirs) {
    const file = path.join(dir, 'relatorios_sesani.json')
    if (fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
        if (Array.isArray(data) && data.length > 0) return data
      } catch (e) {}
    }
  }
  return []
}

function writeAllReports(reports) {
  const dirs = getAllOneDrivePaths()
  dirs.forEach(dir => {
    try {
      const file = path.join(dir, 'relatorios_sesani.json')
      fs.writeFileSync(file, JSON.stringify(reports, null, 2), 'utf-8')
    } catch (e) {
      console.warn(`Erro ao salvar relatorios_sesani em ${dir}:`, e)
    }
  })
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, bypass-tunnel-reminder, x-filename')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  // 1. Status
  if (url.pathname === '/api/status' || url.pathname === '/status') {
    const dirs = getAllOneDrivePaths()
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      status: 'online',
      folders: dirs,
      folderPath: dirs[0],
      timestamp: new Date().toISOString()
    }))
    return
  }

  // 2. Open Folder (abre a pasta no Windows Explorer)
  if (url.pathname === '/api/open-folder') {
    const dir = getPrimaryOneDrivePath()
    // Comando confiável no Windows sem estourar erro de exit code
    exec(`powershell.exe -Command "Start-Process explorer.exe -ArgumentList '${dir}'"`, (err) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ success: true, folder: dir }))
    })
    return
  }

  // 3. GET Reports (Retorna a lista completa de relatórios com fotos e histórico)
  if (url.pathname === '/api/reports' && req.method === 'GET') {
    const reports = readAllReports()
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(reports))
    return
  }

  // 4. POST Report
  if (url.pathname === '/api/reports' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const newReport = JSON.parse(body)
        const reports = readAllReports()

        const reportItem = {
          id: newReport.id || Date.now(),
          aisanNome: newReport.aisanNome || 'Não informado',
          poloBase: newReport.poloBase || 'DSEI Kaiapó',
          aldeia: newReport.aldeia || 'Não informada',
          data: newReport.data || new Date().toISOString().split('T')[0],
          tipo: newReport.tipo || 'Água',
          descricao: newReport.descricao || '',
          fotos: Array.isArray(newReport.fotos) ? newReport.fotos : [],
          status: newReport.status || 'recebido',
          timestamp: new Date().toISOString(),
          confirmadoPor: null,
          confirmadoEm: null
        }

        // Salva fotos em disco no OneDrive
        if (Array.isArray(newReport.fotos) && newReport.fotos.length > 0) {
          const dirs = getAllOneDrivePaths()
          dirs.forEach(dir => {
            try {
              const safeName = (reportItem.aisanNome).replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_')
              const safeAldeia = (reportItem.aldeia).replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_')
              const fotosDir = path.join(dir, 'Fotos_Relatorios')
              if (!fs.existsSync(fotosDir)) fs.mkdirSync(fotosDir, { recursive: true })

              newReport.fotos.forEach((fotoBase64, idx) => {
                if (fotoBase64 && typeof fotoBase64 === 'string' && fotoBase64.includes('base64,')) {
                  const base64Data = fotoBase64.split(';base64,').pop()
                  const ext = fotoBase64.includes('image/png') ? 'png' : 'jpg'
                  const filename = `${safeName}_${safeAldeia}_${reportItem.data}_foto${idx + 1}_${reportItem.id}.${ext}`
                  fs.writeFileSync(path.join(dir, filename), base64Data, { encoding: 'base64' })
                  fs.writeFileSync(path.join(fotosDir, filename), base64Data, { encoding: 'base64' })
                }
              })
            } catch (photoErr) {
              console.warn('Erro ao salvar foto:', photoErr)
            }
          })
        }

        // Atualiza relatorios_sesani.json
        const existingIdx = reports.findIndex(r => r.id === reportItem.id)
        if (existingIdx >= 0) {
          reports[existingIdx] = { ...reports[existingIdx], ...reportItem }
        } else {
          reports.unshift(reportItem)
        }
        writeAllReports(reports)

        // Salva também no arquivo individual do AISAN
        if (reportItem.aisanNome) {
          const dirs = getAllOneDrivePaths()
          const safeName = reportItem.aisanNome.replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_')
          dirs.forEach(dir => {
            try {
              const individualFile = path.join(dir, `atividades_${safeName}.json`)
              let individualData = []
              if (fs.existsSync(individualFile)) {
                try { individualData = JSON.parse(fs.readFileSync(individualFile, 'utf-8')) } catch (_) {}
              }
              if (!Array.isArray(individualData)) individualData = []
              const idx = individualData.findIndex(r => r.id === reportItem.id)
              if (idx >= 0) {
                individualData[idx] = { ...individualData[idx], ...reportItem }
              } else {
                individualData.unshift(reportItem)
              }
              fs.writeFileSync(individualFile, JSON.stringify(individualData, null, 2), 'utf-8')
            } catch (_) {}
          })
        }

        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: true, message: 'Relatório salvo com sucesso!', id: reportItem.id }))
      } catch (err) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // 5. Update Status
  if (url.pathname === '/api/reports/status' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const { id, status, confirmadoPor } = JSON.parse(body)
        const reports = readAllReports()
        const report = reports.find(r => r.id === id)
        if (report) {
          report.status = status
          report.confirmadoPor = confirmadoPor || 'Equipe SESANI'
          report.confirmadoEm = new Date().toISOString()
          writeAllReports(reports)

          // Atualiza também no arquivo individual
          if (report.aisanNome) {
            const dirs = getAllOneDrivePaths()
            const safeName = report.aisanNome.replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_')
            dirs.forEach(dir => {
              try {
                const individualFile = path.join(dir, `atividades_${safeName}.json`)
                if (fs.existsSync(individualFile)) {
                  let indData = JSON.parse(fs.readFileSync(individualFile, 'utf-8'))
                  if (Array.isArray(indData)) {
                    const item = indData.find(r => r.id === id)
                    if (item) {
                      item.status = status
                      item.confirmadoPor = report.confirmadoPor
                      item.confirmadoEm = report.confirmadoEm
                      fs.writeFileSync(individualFile, JSON.stringify(indData, null, 2), 'utf-8')
                    }
                  }
                }
              } catch (_) {}
            })
          }
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: true, report }))
      } catch (err) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // 6. Delete Report
  if (url.pathname === '/api/reports/delete' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body)
        let reports = readAllReports()
        const toDelete = reports.find(r => r.id === id)
        reports = reports.filter(r => r.id !== id)
        writeAllReports(reports)

        if (toDelete && toDelete.aisanNome) {
          const dirs = getAllOneDrivePaths()
          const safeName = toDelete.aisanNome.replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_')
          dirs.forEach(dir => {
            try {
              const individualFile = path.join(dir, `atividades_${safeName}.json`)
              if (fs.existsSync(individualFile)) {
                let ind = JSON.parse(fs.readFileSync(individualFile, 'utf-8'))
                if (Array.isArray(ind)) {
                  ind = ind.filter(r => r.id !== id)
                  fs.writeFileSync(individualFile, JSON.stringify(ind, null, 2), 'utf-8')
                }
              }
            } catch (_) {}
          })
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: true, message: 'Relatório apagado' }))
      } catch (err) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // 7. Save PDF
  if (url.pathname === '/api/onedrive/pdf' && req.method === 'POST') {
    const fileName = req.headers['x-filename'] || `Relatorio_${Date.now()}.pdf`
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks)
        const dirs = getAllOneDrivePaths()
        const savedPaths = []
        dirs.forEach(dir => {
          try {
            const filePath = path.join(dir, fileName)
            fs.writeFileSync(filePath, buffer)
            savedPaths.push(filePath)
          } catch (e) {
            console.warn(`Erro ao salvar PDF em ${dir}:`, e)
          }
        })
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: true, savedPaths, fileName }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  res.statusCode = 404
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error: 'Endpoint não encontrado' }))
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`)
  console.log(`  CENTRAL SESANI — Servidor HTTP Ativo`)
  console.log(`  Porta: ${PORT}`)
  console.log(`  OneDrive: ${getPrimaryOneDrivePath()}`)
  console.log(`======================================================\n`)
})
