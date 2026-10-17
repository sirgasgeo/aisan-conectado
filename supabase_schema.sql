-- ====================================================================
-- SCHEMA DO BANCO DE DADOS: AISAN CONECTADO (DSEI KAIAPÓ MT)
-- Cole e execute este script no "SQL Editor" do seu painel Supabase
-- ====================================================================

-- 1. Cria a tabela principal de relatórios
create table if not exists relatorios (
  id bigint primary key,
  aisan_nome text not null,
  polo_base text not null,
  aldeia text not null,
  data date not null,
  tipo text not null,
  descricao text not null,
  fotos text[] default array[]::text[],
  status text default 'recebido',
  timestamp timestamptz default now(),
  confirmado_por text,
  confirmado_em timestamptz
);

-- 2. Habilita Row Level Security (RLS)
alter table relatorios enable row level security;

-- 3. Cria políticas de acesso público (leitura, escrita e atualização)
drop policy if exists "Permitir leitura pública" on relatorios;
create policy "Permitir leitura pública" on relatorios for select using (true);

drop policy if exists "Permitir inserção pública" on relatorios;
create policy "Permitir inserção pública" on relatorios for insert with check (true);

drop policy if exists "Permitir atualização pública" on relatorios;
create policy "Permitir atualização pública" on relatorios for update using (true);

drop policy if exists "Permitir exclusão pública" on relatorios;
create policy "Permitir exclusão pública" on relatorios for delete using (true);
