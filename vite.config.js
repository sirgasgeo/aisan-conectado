import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'

function getAllOneDrivePaths() {
  const home = os.homedir()
  const paths = []

  // 1. OneDrive Oficial do Ministério da Saúde
  const msParent = path.join(home, 'OneDrive - Ministério da Saúde')
  if (fs.existsSync(msParent)) {
    const msDir = path.join(msParent, 'AISAN_Dados')
    if (!fs.existsSync(msDir)) {
      try { fs.mkdirSync(msDir, { recursive: true }) } catch (_) {}
    }
    paths.push(msDir)
  }

  // 2. OneDrive Pessoal / Padrão
  const personalParent = path.join(home, 'OneDrive')
  if (fs.existsSync(personalParent)) {
    const pDir = path.join(personalParent, 'AISAN_Dados')
    if (!fs.existsSync(pDir)) {
      try { fs.mkdirSync(pDir, { recursive: true }) } catch (_) {}
    }
    if (!paths.includes(pDir)) paths.push(pDir)
  }

  // 3. Fallback se nenhum existir
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

function aisanBackendPlugin() {
  return {
    name: 'aisan-backend-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost:5173'}`)

        // CORS headers for mobile network access
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        // Endpoint: Status do Sistema
        if (url.pathname === '/api/status') {
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

        // Endpoint: Abrir pasta no Windows Explorer
        if (url.pathname === '/api/open-folder') {
          const dir = getPrimaryOneDrivePath()
          exec(`explorer.exe "${dir}"`, (err) => {
            res.setHeader('Content-Type', 'application/json')
            if (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ success: false, error: err.message }))
            } else {
              res.end(JSON.stringify({ success: true, folder: dir }))
            }
          })
          return
        }

        // Endpoint: Listar todos os relatórios (Área SESANI)
        if (url.pathname === '/api/reports' && req.method === 'GET') {
          const reports = readAllReports()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(reports))
          return
        }

        // Endpoint: Enviar novo relatório (AISAN)
        if (url.pathname === '/api/reports' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
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
                status: newReport.status || 'recebido', // 'recebido' | 'em_analise' | 'concluido'
                timestamp: new Date().toISOString(),
                confirmadoPor: null,
                confirmadoEm: null
              }

              // Salva na lista central do SESANI em todos os OneDrives
              reports.unshift(reportItem)
              writeAllReports(reports)

              // Salva também no arquivo individual do AISAN em todos os OneDrives
              const safeName = reportItem.aisanNome.replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_')
              const dirs = getAllOneDrivePaths()
              dirs.forEach(dir => {
                try {
                  const individualFile = path.join(dir, `atividades_${safeName}.json`)
                  let individualData = []
                  if (fs.existsSync(individualFile)) {
                    try { individualData = JSON.parse(fs.readFileSync(individualFile, 'utf-8')) } catch (_) {}
                  }
                  if (!Array.isArray(individualData)) individualData = []
                  individualData.unshift(reportItem)
                  fs.writeFileSync(individualFile, JSON.stringify(individualData, null, 2), 'utf-8')
                } catch (e) {
                  console.warn(`Erro ao salvar arquivo individual em ${dir}:`, e)
                }
              })

              // Salva fotos como arquivos individuais de imagem no OneDrive em todos os OneDrives
              if (reportItem.fotos && reportItem.fotos.length > 0) {
                dirs.forEach(dir => {
                  try {
                    const photosDir = path.join(dir, 'Fotos_Relatorios')
                    if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true })
                    reportItem.fotos.forEach((fotoBase64, idx) => {
                      try {
                        const matches = fotoBase64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/)
                        if (matches) {
                          const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
                          const buffer = Buffer.from(matches[2], 'base64')
                          const safeAldeia = (reportItem.aldeia || 'Aldeia').replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_')
                          const photoFileName = `${safeName}_${safeAldeia}_${reportItem.data}_foto${idx + 1}_${reportItem.id}.${ext}`
                          
                          // 1. Salva na subpasta Fotos_Relatorios
                          fs.writeFileSync(path.join(photosDir, photoFileName), buffer)

                          // 2. Salva TAMBÉM solta direto na pasta raiz AISAN_Dados para ver na hora!
                          fs.writeFileSync(path.join(dir, photoFileName), buffer)
                        }
                      } catch (photoErr) {
                        console.warn('Erro ao salvar foto individual:', photoErr)
                      }
                    })
                  } catch (photosDirErr) {
                    console.warn(`Erro no diretório de fotos em ${dir}:`, photosDirErr)
                  }
                })
              }

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({
                success: true,
                message: 'Relatório salvo com sucesso no servidor e no OneDrive!',
                report: reportItem
              }))
            } catch (err) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: err.message }))
            }
          })
          return
        }

        // Endpoint: Atualizar status do relatório (Área SESANI)
        if (url.pathname === '/api/reports/status' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const { id, status, confirmadoPor } = JSON.parse(body)
              const reports = readAllReports()
              const report = reports.find(r => r.id === id)
              if (report) {
                report.status = status
                if (status === 'concluido') {
                  report.confirmadoPor = confirmadoPor || 'Coordenação SESANI'
                  report.confirmadoEm = new Date().toISOString()
                }
                writeAllReports(reports)
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: true, report }))
              } else {
                res.statusCode = 404
                res.end(JSON.stringify({ error: 'Relatório não encontrado' }))
              }
            } catch (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: err.message }))
            }
          })
          return
        }

        // Endpoint: Apagar relatório (Área SESANI)
        if (url.pathname === '/api/reports/delete' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const { id } = JSON.parse(body)
              let reports = readAllReports()
              const toDelete = reports.find(r => r.id === id)
              reports = reports.filter(r => r.id !== id)
              writeAllReports(reports)

              // Também remove do arquivo individual do AISAN em todos os OneDrives
              if (toDelete && toDelete.aisanNome) {
                const dirs = getAllOneDrivePaths()
                const safeName = toDelete.aisanNome.replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_')
                dirs.forEach(dir => {
                  try {
                    const individualFile = path.join(dir, `atividades_${safeName}.json`)
                    if (fs.existsSync(individualFile)) {
                      let individualData = JSON.parse(fs.readFileSync(individualFile, 'utf-8'))
                      if (Array.isArray(individualData)) {
                        individualData = individualData.filter(r => r.id !== id)
                        fs.writeFileSync(individualFile, JSON.stringify(individualData, null, 2), 'utf-8')
                      }
                    }
                  } catch (_) {}
                })
              }

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, message: 'Relatório apagado com sucesso' }))
            } catch (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: err.message }))
            }
          })
          return
        }

        // Endpoint: Salvar PDF gerado no OneDrive
        if (url.pathname === '/api/onedrive/pdf' && req.method === 'POST') {
          const user = url.searchParams.get('user') || 'geral'
          const safeUser = user.replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_')
          const aldeia = (url.searchParams.get('aldeia') || '').replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]/g, '_')
          const reportId = url.searchParams.get('reportId') || Date.now()
          const today = new Date().toISOString().split('T')[0]
          const fileName = aldeia 
            ? `Relatorio_Oficial_${safeUser}_${aldeia}_${today}_${reportId}.pdf`
            : `Relatorio_Oficial_${safeUser}_${today}_${reportId}.pdf`

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

        next()
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true, // Escuta em 0.0.0.0 para aceitar conexões do celular na rede
    port: 5173,
    allowedHosts: true // Permite acesso por tunnels públicos (Cloudflare, etc.) sem erro 403
  },
  plugins: [react(), aisanBackendPlugin()],
})
