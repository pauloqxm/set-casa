-- Agendamento de salas: constraint de conflito + RLS.
-- Executar no Supabase: SQL Editor → New query → Run
-- Projeto: ftuycoafwraxaachidlh
--
-- As tabelas salas / coordenacoes / agendamentos são criadas pelo app
-- (init_db) na primeira conexão com DATABASE_URL. Rode este script
-- DEPOIS do primeiro deploy ou da primeira subida local com DATABASE_URL.
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

ALTER TABLE IF EXISTS public.salas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coordenacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agendamentos ENABLE ROW LEVEL SECURITY;
