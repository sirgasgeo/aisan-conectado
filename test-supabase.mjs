import { createClient } from '@supabase/supabase-js'

const url = 'https://nrdtgdegrdouuxvtxcdr.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yZHRnZGVncmRvdXV4dnR4Y2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwODQ2NjksImV4cCI6MjEwNzY2MDY2OX0.zo725ZQ1VOpmId_7xzazniajbed1TZ9-LaNgGEKu3yo'

const supabase = createClient(url, key)

async function test() {
  const { data, error } = await supabase.from('relatorios').select('*')
  console.log('DATA:', data)
  console.log('ERROR:', error)
}

test()
