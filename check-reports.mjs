import { createClient } from '@supabase/supabase-js'

const url = 'https://nrdtgdegrdouuxvtxcdr.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yZHRnZGVncmRvdXV4dnR4Y2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwODQ2NjksImV4cCI6MjEwNzY2MDY2OX0.zo725ZQ1VOpmId_7xzazniajbed1TZ9-LaNgGEKu3yo'

const supabase = createClient(url, key)

async function check() {
  const { data, error } = await supabase.from('relatorios').select('id, aisan_nome, aldeia, tipo, data, fotos')
  if (error) {
    console.error('ERROR:', error)
    return
  }
  console.log('TOTAL REPORTS IN SUPABASE:', data.length)
  for (const r of data) {
    const photoCount = Array.isArray(r.fotos) ? r.fotos.length : (r.fotos ? 'not-array: ' + typeof r.fotos : 0)
    const samplePhotoLen = Array.isArray(r.fotos) && r.fotos[0] ? r.fotos[0].length : 0
    console.log(`- ID: ${r.id} | ${r.aisan_nome} | ${r.aldeia} | Fotos: ${photoCount} (1st len: ${samplePhotoLen})`)
  }
}

check()
