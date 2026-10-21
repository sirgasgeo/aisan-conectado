CREATE TABLE IF NOT EXISTS relatorios (
  id BIGINT PRIMARY KEY,
  aisan_nome TEXT,
  polo_base TEXT,
  aldeia TEXT,
  data TEXT,
  tipo TEXT,
  descricao TEXT,
  fotos JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'recebido',
  timestamp TEXT,
  confirmado_por TEXT,
  confirmado_em TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE relatorios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura publica" ON relatorios FOR SELECT USING (true);
CREATE POLICY "Permitir insercao publica" ON relatorios FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualizacao publica" ON relatorios FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusao publica" ON relatorios FOR DELETE USING (true);
