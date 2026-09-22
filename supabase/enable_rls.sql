-- Bloqueia acesso público via PostgREST (chave anon) às tabelas do SET Projetos.
-- O app Railway continua funcionando: conexão direta Postgres (DATABASE_URL) ignora RLS.
--
-- Executar no Supabase: SQL Editor → New query → Run
-- Projeto: ftuycoafwraxaachidlh

ALTER TABLE IF EXISTS public.meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.usuario_projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notificacoes_tarefa ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.salas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coordenacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agendamentos ENABLE ROW LEVEL SECURITY;

-- Sem políticas para anon/authenticated = API REST bloqueada.
-- Não crie policies "USING (true)" aqui — isso reabriria o acesso público.
