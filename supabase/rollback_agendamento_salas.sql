-- Reverte APENAS o módulo de agendamento de salas.
-- Não altera itens, usuarios, projetos nem as demais tabelas do SET Projetos.
--
-- Executar no Supabase: SQL Editor → New query → Run
-- Depois faça checkout da branch backup-antes-agendamento-salas (commit 23fde05).

ALTER TABLE IF EXISTS public.agendamentos DROP CONSTRAINT IF EXISTS sem_conflito;
DROP TABLE IF EXISTS public.agendamentos;
DROP TABLE IF EXISTS public.coordenacoes;
DROP TABLE IF EXISTS public.salas;
