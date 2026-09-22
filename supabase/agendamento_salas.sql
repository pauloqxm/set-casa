-- Agendamento de salas: constraint de conflito + RLS.
-- Executar no Supabase: SQL Editor → New query → Run
-- Projeto: ftuycoafwraxaachidlh
--
-- As tabelas locais / salas / coordenacoes / agendamentos são criadas pelo app
-- (init_db) na primeira conexão com DATABASE_URL. Rode este script
-- DEPOIS do primeiro deploy ou da primeira subida local com DATABASE_URL.
-- Reexecutar é seguro: cria locais, adiciona salas.local_id e ativa o RLS.
--
-- Reversível: ver supabase/rollback_agendamento_salas.sql

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sem_conflito'
  ) THEN
    ALTER TABLE public.agendamentos ADD CONSTRAINT sem_conflito
      EXCLUDE USING gist (
        sala_id WITH =,
        tsrange((data + hora_inicio), (data + hora_fim)) WITH &&
      ) WHERE (status = 'confirmado');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.locais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    endereco TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locais_ativo ON public.locais(ativo);

ALTER TABLE public.salas ADD COLUMN IF NOT EXISTS local_id UUID REFERENCES public.locais(id);
CREATE INDEX IF NOT EXISTS idx_salas_local ON public.salas(local_id);

INSERT INTO public.locais (nome, endereco, ativo)
SELECT v.nome, NULL, TRUE
FROM (VALUES
  ('Sede'),
  ('Unidade Centro'),
  ('Unidade Quixeramobim')
) AS v(nome)
WHERE NOT EXISTS (
  SELECT 1 FROM public.locais l WHERE lower(l.nome) = lower(v.nome)
);

ALTER TABLE IF EXISTS public.locais ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.salas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coordenacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agendamentos ENABLE ROW LEVEL SECURITY;
