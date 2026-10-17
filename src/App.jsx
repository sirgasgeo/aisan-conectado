import { useState, useEffect, useCallback } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getSupabaseClient, getSupabaseCredentials } from './lib/supabase'
import { apiFetch, getApiBaseUrl } from './lib/api'
import './App.css'

const POLOS_KAIAPO = [
  'Polo Base Peixoto de Azevedo',
  'Sede do DSEI',
  'Polo Base Juara',
  'Outro Polo / Base'
]

const TIPOS_ATIVIDADE = [
  { id: 'Água', label: 'Água', icon: '💧', desc: 'Cloração, poço, captação, rede' },
  { id: 'Resíduos Sólidos', label: 'Resíduos Sólidos', icon: '🗑️', desc: 'Lixo, limpeza, valas sanitárias' },
  { id: 'Manutenção', label: 'Manutenção', icon: '🔧', desc: 'Bomba, canos, caixa d\'água' },
  { id: 'Outra Atividade', label: 'Outra Atividade', icon: '📌', desc: 'Palestra, visita, reunião' }
]

function App() {
  // Navegação: 'home' | 'enviar' | 'meus-relatorios' | 'orientacoes' | 'sesani'
  const [currentView, setCurrentView] = useState('home')

  // Dados do formulário AISAN
  const [formData, setFormData] = useState({
    aisanNome: localStorage.getItem('aisan_nome_salvo') || '',
    poloBase: localStorage.getItem('aisan_polo_salvo') || POLOS_KAIAPO[0],
    aldeia: localStorage.getItem('aisan_aldeia_salvo') || '',
    data: new Date().toISOString().split('T')[0],
    tipo: 'Água',
    descricao: ''
  })
  const [fotos, setFotos] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(null)

  // Meus Relatórios (no aparelho)
  const [meusRelatorios, setMeusRelatorios] = useState([])

  // Área SESANI
  const [isSesaniAuth, setIsSesaniAuth] = useState(false)
  const [sesaniPin, setSesaniPin] = useState('')
  const [sesaniError, setSesaniError] = useState('')
  const [allReports, setAllReports] = useState([])
  const [loadingReports, setLoadingReports] = useState(false)
  const [filterPolo, setFilterPolo] = useState('Todos')
  const [filterStatus, setFilterStatus] = useState('Todos')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedReport, setSelectedReport] = useState(null)

  // Configuração Supabase (Nuvem 24h)
  const [showSupaModal, setShowSupaModal] = useState(false)
  const [supaConfig, setSupaConfig] = useState(getSupabaseCredentials())
  const [supaUrlInput, setSupaUrlInput] = useState(getSupabaseCredentials().url)
  const [supaKeyInput, setSupaKeyInput] = useState(getSupabaseCredentials().key)

  // Carregar relatórios locais do AISAN e inicializar conexão com servidor central
  useEffect(() => {
    // Inicializa a descoberta dinâmica do servidor do Paulo no OneDrive
    getApiBaseUrl()

    try {
      const saved = localStorage.getItem('aisan_meus_relatorios')
      if (saved) {
        setMeusRelatorios(JSON.parse(saved))
      }
    } catch (e) {
      console.warn('Erro ao carregar relatórios locais:', e)
    }
  }, [])

  // Carregar relatórios do SESANI
  const loadSesaniReports = useCallback(async () => {
    setLoadingReports(true)

    // 1. Tenta carregar do Supabase (Nuvem 24h)
    const client = getSupabaseClient()
    if (client) {
      try {
        const { data, error } = await client
          .from('relatorios')
          .select('*')
          .order('id', { ascending: false })
        if (!error && Array.isArray(data)) {
          const mapped = data.map(r => ({
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
          setAllReports(mapped)
          setLoadingReports(false)
          return
        }
      } catch (e) {
        console.warn('Erro ao consultar Supabase:', e)
      }
    }

    // 2. Fallback para backend local / OneDrive
    try {
      const res = await apiFetch('/api/reports')
      if (res.ok) {
        const data = await res.json()
        setAllReports(Array.isArray(data) ? data : [])
      } else {
        const local = localStorage.getItem('aisan_meus_relatorios')
        setAllReports(local ? JSON.parse(local) : [])
      }
    } catch (err) {
      const local = localStorage.getItem('aisan_meus_relatorios')
      setAllReports(local ? JSON.parse(local) : [])
    } finally {
      setLoadingReports(false)
    }
  }, [])

  useEffect(() => {
    if (isSesaniAuth && currentView === 'sesani') {
      loadSesaniReports()
    }
  }, [isSesaniAuth, currentView, loadSesaniReports])

  // Função para comprimir fotos tiradas no celular (evita travar o envio e economiza memória)
  const compressImageFile = (file, maxWidth = 1280, quality = 0.75) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)
          const compressedBase64 = canvas.toDataURL('image/jpeg', quality)
          resolve(compressedBase64)
        }
        img.onerror = () => resolve(e.target.result)
        img.src = e.target.result
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    })
  }

  // Foto upload com compressão automática
  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return

    setIsSubmitting(true)
    try {
      const compressedList = await Promise.all(
        files.map(file => compressImageFile(file))
      )
      const validImages = compressedList.filter(Boolean)
      setFotos(prev => [...prev, ...validImages])
    } catch (err) {
      console.warn('Erro ao processar fotos:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Envio do relatório pelo AISAN
  const handleEnviarRelatorio = async (e) => {
    e.preventDefault()

    if (!formData.aisanNome.trim()) {
      alert('Por favor, informe o seu Nome (AISAN).')
      return
    }
    if (!formData.aldeia.trim()) {
      alert('Por favor, informe o Nome da Aldeia.')
      return
    }
    if (!formData.descricao.trim()) {
      alert('Por favor, faça uma descrição curta do trabalho.')
      return
    }

    setIsSubmitting(true)

    const newReport = {
      id: Date.now(),
      aisanNome: formData.aisanNome.trim(),
      poloBase: formData.poloBase,
      aldeia: formData.aldeia.trim(),
      data: formData.data,
      tipo: formData.tipo,
      descricao: formData.descricao.trim(),
      fotos: fotos,
      status: 'recebido',
      timestamp: new Date().toISOString()
    }

    // Salva preferências no aparelho
    try {
      localStorage.setItem('aisan_nome_salvo', formData.aisanNome.trim())
      localStorage.setItem('aisan_polo_salvo', formData.poloBase)
      localStorage.setItem('aisan_aldeia_salvo', formData.aldeia.trim())
    } catch (_) {}

    // Salva nos relatórios locais do AISAN com proteção contra estouro de memória (QuotaExceededError)
    const updatedLocal = [newReport, ...meusRelatorios]
    setMeusRelatorios(updatedLocal)
    try {
      localStorage.setItem('aisan_meus_relatorios', JSON.stringify(updatedLocal))
    } catch (storageErr) {
      console.warn('Armazenamento local cheio. Salvando versão compacta no histórico:', storageErr)
      try {
        const lightweight = updatedLocal.map(r => ({ ...r, fotos: [] }))
        localStorage.setItem('aisan_meus_relatorios', JSON.stringify(lightweight))
      } catch (_) {}
    }

    let savedOnServer = false

    // 1. Envia para a Nuvem 24h (Supabase) se configurado
    const client = getSupabaseClient()
    if (client) {
      try {
        const { error } = await client.from('relatorios').insert([{
          id: newReport.id,
          aisan_nome: newReport.aisanNome,
          polo_base: newReport.poloBase,
          aldeia: newReport.aldeia,
          data: newReport.data,
          tipo: newReport.tipo,
          descricao: newReport.descricao,
          fotos: newReport.fotos,
          status: 'recebido',
          timestamp: newReport.timestamp
        }])
        if (!error) {
          savedOnServer = true
        }
      } catch (supaErr) {
        console.warn('Erro ao salvar no Supabase:', supaErr)
      }
    }

    // 2. Envia para o servidor local / OneDrive se conectado
    try {
      const res = await apiFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReport)
      })
      if (res.ok) {
        savedOnServer = true
      }
    } catch (err) {
      console.warn('Servidor local offline:', err)
    }

    setIsSubmitting(false)
    setSubmitSuccess({
      ...newReport,
      savedOnServer
    })

    // Limpa formulário mantendo dados de identificação
    setFormData(prev => ({
      ...prev,
      descricao: ''
    }))
    setFotos([])
  }

  // Login SESANI
  const handleSesaniLogin = (e) => {
    e.preventDefault()
    // Senha padrão configurável: 1234
    if (sesaniPin === '1234' || sesaniPin === 'sesani2026') {
      setIsSesaniAuth(true)
      setSesaniError('')
      loadSesaniReports()
    } else {
      setSesaniError('Senha incorreta. Tente novamente.')
    }
  }

  // Gerar PDF Oficial com Fotos Reais e Salvar no OneDrive
  const handleGerarPDFOficial = async (report, options = { download: true, openTab: true }) => {
    try {
      const doc = new jsPDF()

      // =========================================================================
      // PÁGINA 1: DADOS PRINCIPAIS E TABELA
      // =========================================================================
      doc.setFillColor(5, 150, 105) // Verde SESAI
      doc.rect(0, 0, 210, 28, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('DSEI KAIAPÓ DO MATO GROSSO — SESANI', 14, 12)

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('RELATÓRIO DE ATIVIDADES DO AGENTE INDÍGENA DE SANEAMENTO (AISAN)', 14, 20)

      // Caixa de Identificação
      doc.setTextColor(40, 40, 40)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(`AISAN: ${report.aisanNome}`, 14, 38)
      doc.text(`Polo Base: ${report.poloBase}`, 14, 46)
      doc.text(`Aldeia: ${report.aldeia}`, 120, 38)
      doc.text(`Data da Atividade: ${new Date(report.data + 'T12:00:00').toLocaleDateString('pt-BR')}`, 120, 46)

      // Selo de Status
      const isConcluido = report.status === 'concluido'
      const statusLabel = isConcluido 
        ? `HOMOLOGADO E CONCLUÍDO PELO SESANI (${report.confirmadoPor || 'Coordenação'})` 
        : report.status === 'em_analise' 
          ? 'EM ANÁLISE PELO SESANI' 
          : 'RECEBIDO PELO SESANI'
      
      doc.setFillColor(isConcluido ? 220 : 254, isConcluido ? 252 : 243, isConcluido ? 231 : 199)
      doc.rect(14, 52, 182, 9, 'F')
      doc.setTextColor(isConcluido ? 22 : 180, isConcluido ? 101 : 83, isConcluido ? 52 : 9)
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      doc.text(`STATUS: ${statusLabel}`, 18, 58)

      // Tabela de Dados
      autoTable(doc, {
        startY: 65,
        head: [['Campo', 'Informações']],
        body: [
          ['Tipo de Atividade', report.tipo],
          ['Descrição do Trabalho', report.descricao],
          ['Fotos Anexadas', `${report.fotos?.length || 0} foto(s) registradas`],
          ['Data do Registro', new Date(report.timestamp).toLocaleString('pt-BR')],
          ['Homologação SESANI', isConcluido ? `Confirmado por ${report.confirmadoPor || 'SESANI'} em ${new Date(report.confirmadoEm || Date.now()).toLocaleDateString('pt-BR')}` : 'Pendente de Confirmação']
        ],
        theme: 'striped',
        headStyles: { fillColor: [5, 150, 105], textColor: 255 },
        styles: { fontSize: 9 }
      })

      // Assinaturas na Página 1
      doc.setTextColor(80, 80, 80)
      doc.setFontSize(9)
      doc.text('________________________________________', 14, 250)
      doc.text(`${report.aisanNome} - AISAN`, 14, 256)

      doc.text('________________________________________', 120, 250)
      doc.text('Coordenação SESANI / DSEI Kaiapó MT', 120, 256)

      // Rodapé da Página 1
      doc.setFontSize(8)
      doc.setTextColor(130, 130, 130)
      doc.text('Página 1 — AISAN Conectado • DSEI Kaiapó MT', 14, 290)

      // =========================================================================
      // PÁGINA 2+: REGISTRO FOTOGRÁFICO REAL COM AS FOTOS DO AGENTE
      // =========================================================================
      if (report.fotos && report.fotos.length > 0) {
        let currentPhotoIndex = 0
        const photosPerPage = 4

        while (currentPhotoIndex < report.fotos.length) {
          doc.addPage()

          // Cabeçalho da página de fotos
          doc.setFillColor(5, 150, 105)
          doc.rect(0, 0, 210, 18, 'F')
          doc.setTextColor(255, 255, 255)
          doc.setFontSize(11)
          doc.setFont('helvetica', 'bold')
          doc.text(`REGISTRO FOTOGRÁFICO — ALDEIA: ${report.aldeia.toUpperCase()} • AISAN: ${report.aisanNome.toUpperCase()}`, 14, 12)

          // Subtítulo
          doc.setTextColor(60, 60, 60)
          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')
          doc.text(`Data: ${new Date(report.data + 'T12:00:00').toLocaleDateString('pt-BR')}  |  Ação: ${report.tipo}`, 14, 25)

          // 2 colunas x 2 linhas (até 4 fotos por página)
          const pagePhotos = report.fotos.slice(currentPhotoIndex, currentPhotoIndex + photosPerPage)

          pagePhotos.forEach((fotoBase64, pageIdx) => {
            const globalIndex = currentPhotoIndex + pageIdx
            const col = pageIdx % 2
            const row = Math.floor(pageIdx / 2)

            const posX = col === 0 ? 14 : 110
            const posY = row === 0 ? 30 : 155
            const imgWidth = 86
            const imgHeight = 98

            try {
              // Moldura de fundo
              doc.setFillColor(248, 250, 252)
              doc.rect(posX, posY, imgWidth, imgHeight, 'F')
              doc.setDrawColor(203, 213, 225)
              doc.rect(posX, posY, imgWidth, imgHeight, 'S')

              // Insere a foto real enviada pelo agente
              doc.addImage(fotoBase64, 'JPEG', posX + 1, posY + 1, imgWidth - 2, imgHeight - 12, undefined, 'FAST')

              // Legenda abaixo da foto
              doc.setTextColor(30, 41, 59)
              doc.setFontSize(8)
              doc.setFont('helvetica', 'bold')
              doc.text(`Foto ${globalIndex + 1}: ${report.aldeia} (${report.data})`, posX + 3, posY + imgHeight - 4)
            } catch (imgErr) {
              console.warn('Erro ao inserir foto no PDF:', imgErr)
            }
          })

          // Rodapé
          const pageNum = doc.internal.getCurrentPageInfo().pageNumber
          doc.setFontSize(8)
          doc.setTextColor(130, 130, 130)
          doc.text(`Página ${pageNum} — Registro Fotográfico Oficial • SESANI DSEI Kaiapó MT`, 14, 290)

          currentPhotoIndex += photosPerPage
        }
      }

      const pdfBlob = doc.output('blob')
      const pdfBlobUrl = URL.createObjectURL(pdfBlob)

      // 1. Salva automaticamente na pasta do OneDrive (OneDrive\AISAN_Dados)
      try {
        await apiFetch(`/api/onedrive/pdf?user=${encodeURIComponent(report.aisanNome)}&aldeia=${encodeURIComponent(report.aldeia)}&reportId=${report.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/pdf' },
          body: pdfBlob
        })
      } catch (err) {
        console.warn('Cópia do PDF no OneDrive não pôde ser salva:', err)
      }

      // 2. Abre em nova aba e faz o download
      if (options.openTab) {
        window.open(pdfBlobUrl, '_blank')
      }
      if (options.download) {
        const a = document.createElement('a')
        a.href = pdfBlobUrl
        a.download = `Relatorio_Oficial_${report.aisanNome}_${report.aldeia}_${report.data}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }

      return true
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
      alert('Houve um problema ao gerar o arquivo PDF.')
      return false
    }
  }

  // Atualizar status pelo SESANI e salvar PDF no OneDrive
  const handleUpdateStatus = async (reportId, newStatus) => {
    // 1. Atualiza no Supabase se configurado
    const client = getSupabaseClient()
    if (client) {
      try {
        await client.from('relatorios').update({
          status: newStatus,
          confirmado_por: newStatus === 'concluido' ? 'Coordenação SESANI Kaiapó' : null,
          confirmado_em: newStatus === 'concluido' ? new Date().toISOString() : null
        }).eq('id', reportId)
      } catch (err) {
        console.warn('Erro ao atualizar no Supabase:', err)
      }
    }

    try {
      await apiFetch('/api/reports/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reportId,
          status: newStatus,
          confirmadoPor: 'Coordenação SESANI Kaiapó'
        })
      })
    } catch (_) {}

    const targetReport = allReports.find(r => r.id === reportId)
    const updatedReport = {
      ...targetReport,
      status: newStatus,
      confirmadoPor: newStatus === 'concluido' ? 'Coordenação SESANI Kaiapó' : targetReport?.confirmadoPor,
      confirmadoEm: newStatus === 'concluido' ? new Date().toISOString() : targetReport?.confirmadoEm
    }

    setAllReports(prev => prev.map(r => r.id === reportId ? updatedReport : r))
    if (selectedReport && selectedReport.id === reportId) {
      setSelectedReport(updatedReport)
    }

    // Se confirmou o recebimento / concluiu:
    if (newStatus === 'concluido' && updatedReport) {
      // Gera o PDF Oficial com as fotos reais e salva direto na pasta do OneDrive!
      await handleGerarPDFOficial(updatedReport, { download: true, openTab: false })
      alert(`✅ Recebimento confirmado com sucesso!\n\nO Relatório Oficial com todas as fotos foi gerado e salvo direto na pasta do OneDrive:\nOneDrive\\AISAN_Dados\\Relatorio_Oficial_${updatedReport.aisanNome}_${updatedReport.aldeia}_${updatedReport.data}.pdf`)
    }
  }

  // Apagar relatório pelo SESANI
  const handleDeleteReport = async (reportId) => {
    if (!window.confirm('Tem certeza que deseja apagar este relatório permanentemente?')) {
      return
    }

    // 1. Apaga no Supabase se configurado
    const client = getSupabaseClient()
    if (client) {
      try {
        await client.from('relatorios').delete().eq('id', reportId)
      } catch (err) {
        console.warn('Erro ao excluir no Supabase:', err)
      }
    }

    try {
      await apiFetch('/api/reports/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportId })
      })
    } catch (_) {}

    setAllReports(prev => prev.filter(r => r.id !== reportId))
    setMeusRelatorios(prev => prev.filter(r => r.id !== reportId))

    // Limpa do cache local
    try {
      const local = localStorage.getItem('aisan_meus_relatorios')
      if (local) {
        const parsed = JSON.parse(local).filter(r => r.id !== reportId)
        localStorage.setItem('aisan_meus_relatorios', JSON.stringify(parsed))
      }
    } catch (_) {}

    if (selectedReport && selectedReport.id === reportId) {
      setSelectedReport(null)
    }

    alert('🗑️ Relatório apagado com sucesso!')
  }

  // Filtragem dos relatórios na área SESANI
  const filteredReports = allReports.filter(r => {
    const matchesPolo = filterPolo === 'Todos' || r.poloBase === filterPolo
    const matchesStatus = filterStatus === 'Todos' || r.status === filterStatus
    const matchesSearch = !searchQuery.trim() || 
      r.aisanNome.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.aldeia.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.descricao.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesPolo && matchesStatus && matchesSearch
  })

  // -------------------------------------------------------------------------
  // RENDERIZAÇÃO DAS TELAS
  // -------------------------------------------------------------------------

  return (
    <div className="mobile-app-wrapper">
      {/* CABEÇALHO PRINCIPAL */}
      <header className="mobile-header">
        <div className="header-logo-row">
          <div className="header-icon-circle">💧</div>
          <div>
            <h1 className="header-app-title">AISAN CONECTADO</h1>
            <p className="header-app-sub">DSEI Kaiapó MT • SESANI</p>
          </div>
        </div>
      </header>

      {/* ----------------------------------------------------------------- */}
      {/* TELA 1: INÍCIO (SOMENTE AS 3 OPÇÕES SOLICITADAS) */}
      {/* ----------------------------------------------------------------- */}
      {currentView === 'home' && (
        <main className="mobile-main-container">
          <div className="home-hero-card">
            <h2>Bem-vindo, Agente AISAN!</h2>
            <p>Escolha o que você deseja fazer hoje:</p>
          </div>

          <div className="home-action-buttons">
            {/* OPÇÃO 1: ENVIAR RELATÓRIO */}
            <button 
              className="action-btn-huge btn-primary-send"
              onClick={() => {
                setSubmitSuccess(null)
                setCurrentView('enviar')
              }}
            >
              <span className="btn-icon-huge">📝</span>
              <div className="btn-text-group">
                <span className="btn-title-huge">ENVIAR RELATÓRIO</span>
                <span className="btn-desc-huge">Cadastrar serviço de hoje com fotos</span>
              </div>
              <span className="btn-arrow-huge">➔</span>
            </button>

            {/* OPÇÃO 2: MEUS RELATÓRIOS */}
            <button 
              className="action-btn-huge btn-secondary-reports"
              onClick={() => setCurrentView('meus-relatorios')}
            >
              <span className="btn-icon-huge">📋</span>
              <div className="btn-text-group">
                <span className="btn-title-huge">MEUS RELATÓRIOS</span>
                <span className="btn-desc-huge">Ver relatórios que você já enviou</span>
              </div>
              <span className="btn-arrow-huge">➔</span>
            </button>

            {/* OPÇÃO 3: ORIENTAÇÕES DE SANEAMENTO */}
            <button 
              className="action-btn-huge btn-accent-guide"
              onClick={() => setCurrentView('orientacoes')}
            >
              <span className="btn-icon-huge">💡</span>
              <div className="btn-text-group">
                <span className="btn-title-huge">ORIENTAÇÕES DE SANEAMENTO</span>
                <span className="btn-desc-huge">Dicas práticas sobre água, lixo e bombas</span>
              </div>
              <span className="btn-arrow-huge">➔</span>
            </button>
          </div>

          {/* RODAPÉ DISCRETO: ACESSO SESANI */}
          <footer className="home-footer-coord">
            <button 
              className="btn-sesani-access"
              onClick={() => setCurrentView('sesani')}
            >
              🔐 Área do SESANI (Coordenação)
            </button>
          </footer>
        </main>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TELA 2: FORMULÁRIO DE ENVIO DO AISAN */}
      {/* ----------------------------------------------------------------- */}
      {currentView === 'enviar' && (
        <main className="mobile-main-container">
          <button className="btn-back-nav" onClick={() => setCurrentView('home')}>
            ⬅️ Voltar para o Início
          </button>

          {/* SE O RELATÓRIO FOI ENVIADO COM SUCESSO: */}
          {submitSuccess ? (
            <div className="success-screen-card">
              <div className="success-icon-big">✅</div>
              <h2 className="success-title">Relatório enviado com sucesso!</h2>
              <p className="success-sub">
                {submitSuccess.savedOnServer 
                  ? 'As informações e fotos foram salvas com segurança no sistema do SESANI.' 
                  : 'Salvo com segurança no seu celular! Assim que conectar à internet, o SESANI receberá.'}
              </p>

              <div className="success-details-box">
                <p><strong>AISAN:</strong> {submitSuccess.aisanNome}</p>
                <p><strong>Polo Base:</strong> {submitSuccess.poloBase}</p>
                <p><strong>Aldeia:</strong> {submitSuccess.aldeia}</p>
                <p><strong>Atividade:</strong> {submitSuccess.tipo}</p>
                <p><strong>Data:</strong> {new Date(submitSuccess.data + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                <p><strong>Fotos:</strong> {submitSuccess.fotos?.length || 0} anexada(s)</p>
              </div>

              <div className="success-actions">
                <button 
                  className="btn-huge btn-primary-send"
                  onClick={() => setSubmitSuccess(null)}
                >
                  📝 Enviar Outro Relatório
                </button>
                <button 
                  className="btn-huge btn-secondary-reports"
                  onClick={() => setCurrentView('meus-relatorios')}
                >
                  📋 Ver Meus Relatórios
                </button>
              </div>
            </div>
          ) : (
            /* FORMULÁRIO DE CADASTRO */
            <form onSubmit={handleEnviarRelatorio} className="aisan-form-card">
              <h2 className="form-screen-title">Enviar Relatório de Atividade</h2>
              <p className="form-screen-sub">Preencha os campos abaixo com as informações do seu dia de trabalho:</p>

              {/* 1. NOME DO AISAN */}
              <div className="form-field-group">
                <label className="field-label-large">1. Seu Nome (AISAN) *</label>
                <input 
                  type="text"
                  className="field-input-large"
                  placeholder="Ex: Paulo Kaiapó"
                  value={formData.aisanNome}
                  onChange={(e) => setFormData({ ...formData, aisanNome: e.target.value })}
                  required
                />
              </div>

              {/* 2. POLO BASE */}
              <div className="form-field-group">
                <label className="field-label-large">2. Polo Base *</label>
                <select 
                  className="field-select-large"
                  value={formData.poloBase}
                  onChange={(e) => setFormData({ ...formData, poloBase: e.target.value })}
                  required
                >
                  {POLOS_KAIAPO.map(polo => (
                    <option key={polo} value={polo}>{polo}</option>
                  ))}
                </select>
              </div>

              {/* 3. ALDEIA */}
              <div className="form-field-group">
                <label className="field-label-large">3. Nome da Aldeia *</label>
                <input 
                  type="text"
                  className="field-input-large"
                  placeholder="Ex: Aldeia Krapiê"
                  value={formData.aldeia}
                  onChange={(e) => setFormData({ ...formData, aldeia: e.target.value })}
                  required
                />
              </div>

              {/* 4. DATA */}
              <div className="form-field-group">
                <label className="field-label-large">4. Data da Atividade *</label>
                <input 
                  type="date"
                  className="field-input-large"
                  value={formData.data}
                  onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                  required
                />
              </div>

              {/* 5. TIPO DE ATIVIDADE */}
              <div className="form-field-group">
                <label className="field-label-large">5. Tipo de Atividade *</label>
                <div className="tipo-buttons-grid">
                  {TIPOS_ATIVIDADE.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className={`tipo-select-btn ${formData.tipo === t.id ? 'active' : ''}`}
                      onClick={() => setFormData({ ...formData, tipo: t.id })}
                    >
                      <span className="tipo-icon">{t.icon}</span>
                      <span className="tipo-title">{t.label}</span>
                      <small className="tipo-desc">{t.desc}</small>
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. DESCRIÇÃO CURTA */}
              <div className="form-field-group">
                <label className="field-label-large">6. Descrição Curta do que foi feito *</label>
                <textarea 
                  className="field-textarea-large"
                  rows="4"
                  placeholder="Ex: Fizemos a cloração da água da caixa d'água principal e verificamos a bomba do poço artesiano."
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  required
                />
              </div>

              {/* 7. FOTOS */}
              <div className="form-field-group">
                <label className="field-label-large">7. Fotos do Trabalho ou Relatório ({fotos.length})</label>
                <p className="field-help-text">Você pode tirar foto com a câmera do celular ou escolher da galeria:</p>

                <div className="photo-picker-container">
                  <label htmlFor="camera-input" className="photo-btn-camera">
                    📷 Tirar Foto / Anexar Fotos
                  </label>
                  <input 
                    id="camera-input"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden-file-input"
                  />
                </div>

                {fotos.length > 0 && (
                  <div className="photo-preview-carousel">
                    {fotos.map((foto, index) => (
                      <div key={index} className="photo-preview-card">
                        <img src={foto} alt={`Foto ${index + 1}`} />
                        <button 
                          type="button"
                          className="btn-remove-photo"
                          onClick={() => setFotos(fotos.filter((_, i) => i !== index))}
                        >
                          ✕ Remover
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* BOTÃO GRANDE DE ENVIO */}
              <button 
                type="submit"
                className="btn-submit-report"
                disabled={isSubmitting}
              >
                {isSubmitting ? '⏳ Salvando...' : 'ENVIAR RELATÓRIO'}
              </button>
            </form>
          )}
        </main>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TELA 3: MEUS RELATÓRIOS (AISAN) */}
      {/* ----------------------------------------------------------------- */}
      {currentView === 'meus-relatorios' && (
        <main className="mobile-main-container">
          <button className="btn-back-nav" onClick={() => setCurrentView('home')}>
            ⬅️ Voltar para o Início
          </button>

          <div className="screen-header-box">
            <h2>Meus Relatórios Enviados</h2>
            <p>Lista dos relatórios salvos no seu aparelho:</p>
          </div>

          {meusRelatorios.length === 0 ? (
            <div className="empty-box-card">
              <span className="empty-icon">📭</span>
              <h3>Nenhum relatório encontrado</h3>
              <p>Você ainda não enviou nenhum relatório por este celular.</p>
              <button 
                className="btn-huge btn-primary-send"
                style={{ marginTop: '1rem' }}
                onClick={() => setCurrentView('enviar')}
              >
                📝 Enviar Meu Primeiro Relatório
              </button>
            </div>
          ) : (
            <div className="reports-list-cards">
              {meusRelatorios.map((rep) => (
                <div key={rep.id} className="report-item-card">
                  <div className="report-card-top">
                    <span className="report-badge-date">
                      📅 {new Date(rep.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                    <span className="report-badge-tipo">{rep.tipo}</span>
                  </div>

                  <h3 className="report-card-aldeia">📍 Aldeia: {rep.aldeia}</h3>
                  <p className="report-card-desc">{rep.descricao}</p>

                  {rep.fotos?.length > 0 && (
                    <div className="report-card-photos">
                      <small>📷 {rep.fotos.length} foto(s) anexada(s)</small>
                      <div className="thumbnails-mini-row">
                        {rep.fotos.map((f, i) => (
                          <img key={i} src={f} alt="Miniatura" onClick={() => window.open(f)} />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="report-status-pill">
                    Status: <strong className={`status-text-${rep.status}`}>
                      {rep.status === 'concluido' ? '🟢 Concluído e Confirmado pelo SESANI' : 
                       rep.status === 'em_analise' ? '🔵 Em Análise pelo SESANI' : 
                       '🟡 Recebido'}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TELA 4: ORIENTAÇÕES DE SANEAMENTO */}
      {/* ----------------------------------------------------------------- */}
      {currentView === 'orientacoes' && (
        <main className="mobile-main-container">
          <button className="btn-back-nav" onClick={() => setCurrentView('home')}>
            ⬅️ Voltar para o Início
          </button>

          <div className="screen-header-box">
            <h2>Orientações de Saneamento</h2>
            <p>Guia prático para os Agentes AISAN do DSEI Kaiapó:</p>
          </div>

          <div className="guides-cards-list">
            {/* GUIA 1 */}
            <div className="guide-card">
              <div className="guide-header-icon">💧</div>
              <h3>1. Tratamento e Cloração da Água</h3>
              <p>
                A água limpa evita diarreia, vômito e doenças nas crianças e anciãos da aldeia.
              </p>
              <ul>
                <li><strong>Cloração Diária:</strong> Coloque a dosagem correta de hipoclorito de sódio na caixa d'água todos os dias.</li>
                <li><strong>Limpeza da Caixa d'Água:</strong> Lave a caixa d'água da aldeia a cada 6 meses com escova e água sanitária.</li>
                <li><strong>Proteção da Nascente e Poço:</strong> Não deixe animais entrarem na cerca do poço artesiano.</li>
              </ul>
            </div>

            {/* GUIA 2 */}
            <div className="guide-card">
              <div className="guide-header-icon">🗑️</div>
              <h3>2. Cuidados com o Lixo na Aldeia</h3>
              <p>
                O lixo jogado no chão atrai ratos, baratas, cachorros e moscas que transmitem doenças.
              </p>
              <ul>
                <li><strong>Valas Sanitárias:</strong> Abra valas para enterrar restos de comida longe das casas e dos córregos.</li>
                <li><strong>Garrafas e Latas:</strong> Mantenha latas e garrafas viradas para baixo para não juntar água de mosquito.</li>
                <li><strong>Orientação aos Moradores:</strong> Faça reuniões e mutirões de limpeza nos pátios das casas.</li>
              </ul>
            </div>

            {/* GUIA 3 */}
            <div className="guide-card">
              <div className="guide-header-icon">🦟</div>
              <h3>3. Prevenção de Mosquitos e Doenças</h3>
              <p>
                Evite focos de mosquitos da Dengue, Chikungunya e Malária nas aldeias:
              </p>
              <ul>
                <li>Tampe bem todas as caixas d'água, tambores e baldes.</li>
                <li>Lave os bebedouros de animais com água e sabão toda semana.</li>
                <li>Se alguém tiver febre e manchas no corpo, avise imediatamente a equipe de enfermagem do Polo Base.</li>
              </ul>
            </div>

            {/* GUIA 4 */}
            <div className="guide-card">
              <div className="guide-header-icon">🔧</div>
              <h3>4. Cuidados com a Bomba e Encanamento</h3>
              <p>
                A manutenção preventiva evita que a aldeia fique sem água potável:
              </p>
              <ul>
                <li>Verifique se há vazamentos ou canos quebrados na aldeia.</li>
                <li>Nunca deixe a bomba ligada sem água no poço para não queimar o motor.</li>
                <li>Em caso de barulho estranho ou defeito, avise o SESANI pelo formulário deste aplicativo.</li>
              </ul>
            </div>
          </div>
        </main>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TELA 5: ÁREA DO SESANI (COORDENAÇÃO ADMINISTRATIVA) */}
      {/* ----------------------------------------------------------------- */}
      {currentView === 'sesani' && (
        <main className="mobile-main-container">
          <button className="btn-back-nav" onClick={() => setCurrentView('home')}>
            ⬅️ Voltar para o Início
          </button>

          {!isSesaniAuth ? (
            /* TELA DE LOGIN DO SESANI */
            <div className="sesani-login-card">
              <div className="sesani-lock-icon">🔐</div>
              <h2>Acesso Restrito — SESANI</h2>
              <p>Área exclusiva da Coordenação de Saneamento do DSEI Kaiapó MT</p>

              <form onSubmit={handleSesaniLogin}>
                <label className="field-label-large">Digite a Senha de Acesso:</label>
                <input 
                  type="password"
                  className="field-input-large"
                  placeholder="Digite o PIN (padrão: 1234)"
                  value={sesaniPin}
                  onChange={(e) => setSesaniPin(e.target.value)}
                  autoFocus
                />
                {sesaniError && <p className="sesani-error-text">{sesaniError}</p>}
                <button type="submit" className="btn-huge btn-primary-send" style={{ marginTop: '1rem' }}>
                  Acessar Painel SESANI
                </button>
              </form>
            </div>
          ) : (
            /* PAINEL DE CONTROLE DO SESANI */
            <div className="sesani-admin-panel">
              <div className="sesani-panel-header">
                <div>
                  <h2>Central SESANI — Relatórios Recebidos</h2>
                  <p>Gerenciamento e homologação dos relatórios dos AISANs do DSEI Kaiapó MT</p>
                </div>
                <div className="sesani-header-actions">
                  <button 
                    className="btn-sesani-action btn-folder-action"
                    onClick={async () => {
                      try {
                        const res = await apiFetch('/api/open-folder')
                        const data = await res.json()
                        if (data.success) {
                          alert(`📂 Pasta aberta no computador:\n${data.folder}\n\nTodos os relatórios, fotos e PDFs estão sincronizados no OneDrive!`)
                        }
                      } catch (_) {
                        alert('Pasta no computador: OneDrive\\AISAN_Dados')
                      }
                    }}
                    title="Abrir pasta no OneDrive do computador"
                  >
                    ☁️ Abrir Pasta Nuvem
                  </button>
                  <button 
                    className="btn-sesani-action btn-cloud-config-action"
                    onClick={() => setShowSupaModal(true)}
                    title="Configurar banco de dados na nuvem Supabase 24h"
                  >
                    {supaConfig.isConfigured ? '🟢 Nuvem 24h: Conectada' : '⚙️ Conectar Nuvem 24h'}
                  </button>
                  <button 
                    className="btn-sesani-action"
                    onClick={loadSesaniReports}
                    disabled={loadingReports}
                  >
                    {loadingReports ? '⏳ Carregando...' : '🔄 Atualizar'}
                  </button>
                  <button 
                    className="btn-sesani-action btn-logout-action"
                    onClick={() => { setIsSesaniAuth(false); setSesaniPin(''); }}
                  >
                    Sair
                  </button>
                </div>
              </div>

              {/* STATUS DE SINCRONIZAÇÃO EM NUVEM */}
              <div className="sesani-cloud-status-badge">
                <span>🟢 <strong>Sincronização Ativa:</strong> Salvando automaticamente na pasta do OneDrive (Ministério da Saúde e Pessoal).</span>
              </div>

              {/* MODAL CONFIGURAÇÃO SUPABASE */}
              {showSupaModal && (
                <div className="modal-overlay" onClick={() => setShowSupaModal(false)}>
                  <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                    <div className="modal-header">
                      <div>
                        <h2>⚡ Conexão Nuvem 24h (Supabase)</h2>
                        <p>Permite que os AISANs enviem relatórios mesmo com o PC desligado</p>
                      </div>
                      <button className="btn-close" onClick={() => setShowSupaModal(false)}>✕</button>
                    </div>
                    <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <p style={{ fontSize: '0.92rem', color: '#475569' }}>
                        Cole aqui a <strong>URL</strong> e a chave <strong>anon key</strong> do seu projeto Supabase:
                      </p>
                      <div>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>Project URL:</label>
                        <input 
                          type="text" 
                          placeholder="https://xyzcompany.supabase.co" 
                          value={supaUrlInput}
                          onChange={e => setSupaUrlInput(e.target.value.trim())}
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>Anon Public Key:</label>
                        <textarea 
                          placeholder="eyJhbGciOi..."
                          rows={3}
                          value={supaKeyInput}
                          onChange={e => setSupaKeyInput(e.target.value.trim())}
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button 
                          className="btn-huge btn-primary-send"
                          style={{ flex: 1, padding: '0.8rem' }}
                          onClick={() => {
                            localStorage.setItem('aisan_supabase_url', supaUrlInput)
                            localStorage.setItem('aisan_supabase_anon_key', supaKeyInput)
                            const updated = getSupabaseCredentials()
                            setSupaConfig(updated)
                            setShowSupaModal(false)
                            loadSesaniReports()
                            alert('✅ Conexão com Supabase salva com sucesso!')
                          }}
                        >
                          💾 Salvar Conexão
                        </button>
                        <button 
                          className="btn-huge btn-secondary-reports"
                          style={{ padding: '0.8rem 1.2rem' }}
                          onClick={() => setShowSupaModal(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* FILTROS E BUSCA */}
              <div className="sesani-filters-bar">
                <div className="filter-group">
                  <label>Polo Base:</label>
                  <select value={filterPolo} onChange={(e) => setFilterPolo(e.target.value)}>
                    <option value="Todos">Todos os Polos</option>
                    {POLOS_KAIAPO.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="filter-group">
                  <label>Status:</label>
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                    <option value="Todos">Todos os Status</option>
                    <option value="recebido">🟡 Recebido</option>
                    <option value="em_analise">🔵 Em Análise</option>
                    <option value="concluido">🟢 Concluído</option>
                  </select>
                </div>

                <div className="filter-group" style={{ flex: 1 }}>
                  <label>Buscar por AISAN / Aldeia:</label>
                  <input 
                    type="text" 
                    placeholder="Digite para filtrar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="sesani-reports-count">
                Mostrando <strong>{filteredReports.length}</strong> de {allReports.length} relatórios
              </div>

              {/* LISTA DE RELATÓRIOS DO SESANI */}
              {filteredReports.length === 0 ? (
                <div className="empty-box-card">
                  <p>Nenhum relatório encontrado com os filtros selecionados.</p>
                </div>
              ) : (
                <div className="sesani-table-cards">
                  {filteredReports.map(report => (
                    <div key={report.id} className="sesani-report-card">
                      <div className="sesani-card-header">
                        <div>
                          <h3 className="sesani-card-aisan">👤 {report.aisanNome}</h3>
                          <span className="sesani-card-meta">
                            📍 {report.aldeia} • {report.poloBase} • 📅 {new Date(report.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <div className="sesani-status-badge">
                          <span className={`status-pill pill-${report.status}`}>
                            {report.status === 'concluido' ? '🟢 Concluído' : 
                             report.status === 'em_analise' ? '🔵 Em Análise' : 
                             '🟡 Recebido'}
                          </span>
                        </div>
                      </div>

                      <div className="sesani-card-body">
                        <p><strong>Atividade ({report.tipo}):</strong> {report.descricao}</p>
                        {report.fotos?.length > 0 && (
                          <div className="sesani-photo-thumbs">
                            {report.fotos.map((f, i) => (
                              <img key={i} src={f} alt="Trabalho" onClick={() => setSelectedReport(report)} />
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="sesani-card-footer">
                        {/* AÇÃO DE CONFIRMAR RECEBIMENTO */}
                        {report.status !== 'concluido' ? (
                          <button 
                            className="btn-status-confirm"
                            onClick={() => handleUpdateStatus(report.id, 'concluido')}
                          >
                            ✅ Confirmar Recebimento / Concluir
                          </button>
                        ) : (
                          <span className="confirmed-note">
                            Homologado por {report.confirmadoPor || 'SESANI'}
                          </span>
                        )}

                        <button 
                          className="btn-view-details"
                          onClick={() => setSelectedReport(report)}
                        >
                          👁️ Detalhes
                        </button>

                        <button 
                          className="btn-pdf-export"
                          onClick={() => handleGerarPDFOficial(report)}
                        >
                          📄 PDF Oficial
                        </button>

                        <button 
                          className="btn-delete-report"
                          onClick={() => handleDeleteReport(report.id)}
                          title="Apagar este relatório"
                        >
                          🗑️ Apagar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MODAL DE DETALHES DO RELATÓRIO NO SESANI */}
          {selectedReport && (
            <div className="modal-overlay" onClick={() => setSelectedReport(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <h2>Relatório do AISAN {selectedReport.aisanNome}</h2>
                    <p>{selectedReport.poloBase} • Aldeia {selectedReport.aldeia}</p>
                  </div>
                  <button className="btn-close" onClick={() => setSelectedReport(null)}>✕</button>
                </div>

                <div className="modal-body">
                  <p><strong>Data da Atividade:</strong> {new Date(selectedReport.data + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                  <p><strong>Tipo de Ação:</strong> {selectedReport.tipo}</p>
                  <p><strong>Descrição Completa:</strong></p>
                  <div className="modal-desc-box">{selectedReport.descricao}</div>

                  <h3>Fotos Anexadas ({selectedReport.fotos?.length || 0}):</h3>
                  {selectedReport.fotos?.length > 0 ? (
                    <div className="modal-gallery-full">
                      {selectedReport.fotos.map((f, idx) => (
                        <div key={idx} className="modal-photo-wrapper">
                          <img src={f} alt={`Foto ${idx + 1}`} onClick={() => window.open(f)} />
                          <small>Clique para ampliar</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>Nenhuma foto anexada neste relatório.</p>
                  )}

                  <div className="modal-status-changer">
                    <strong>Alterar Status:</strong>
                    <div className="status-buttons-row">
                      <button 
                        className={`btn-status-tag ${selectedReport.status === 'recebido' ? 'active' : ''}`}
                        onClick={() => handleUpdateStatus(selectedReport.id, 'recebido')}
                      >
                        🟡 Recebido
                      </button>
                      <button 
                        className={`btn-status-tag ${selectedReport.status === 'em_analise' ? 'active' : ''}`}
                        onClick={() => handleUpdateStatus(selectedReport.id, 'em_analise')}
                      >
                        🔵 Em Análise
                      </button>
                      <button 
                        className={`btn-status-tag ${selectedReport.status === 'concluido' ? 'active' : ''}`}
                        onClick={() => handleUpdateStatus(selectedReport.id, 'concluido')}
                      >
                        🟢 Concluído
                      </button>
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button 
                    className="btn-delete-report"
                    style={{ fontSize: '0.95rem', padding: '0.8rem 1.25rem' }}
                    onClick={() => handleDeleteReport(selectedReport.id)}
                  >
                    🗑️ Apagar Relatório
                  </button>
                  <button 
                    className="btn-huge btn-primary-send"
                    style={{ fontSize: '1rem', padding: '0.8rem 1.5rem' }}
                    onClick={() => handleGerarPDFOficial(selectedReport)}
                  >
                    📄 Baixar PDF Oficial
                  </button>
                  <button 
                    className="btn-huge btn-secondary-reports"
                    style={{ fontSize: '1rem', padding: '0.8rem 1.5rem' }}
                    onClick={() => setSelectedReport(null)}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  )
}

export default App
