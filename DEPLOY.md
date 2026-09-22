# Deploy — Railway + Supabase

## 1. Supabase

Projeto deste painel: `https://ftuycoafwraxaachidlh.supabase.co`

1. Em **Project Settings → Database**, copie a **Connection string (URI)**.
   - Use a conexão direta ou Session pooler.
   - Se a URI começar com `postgres://`, o app converte automaticamente para `postgresql://`.
2. Em **Storage**, crie o bucket privado `fotos-acoes`.
3. Em **Project Settings → API**, copie:
   - `Project URL` → `SUPABASE_URL` = `https://ftuycoafwraxaachidlh.supabase.co`
   - `service_role` (secret) → `SUPABASE_SERVICE_ROLE_KEY`

Política sugerida do bucket (privado; o backend usa service role):

- não é necessário liberar acesso público anônimo;
- o painel serve fotos autenticadas via `GET /api/fotos/...`.

### Segurança — alertas do Supabase (RLS)

O SET Projetos **não usa** o cliente JavaScript do Supabase no navegador. O Railway
conecta ao Postgres com `DATABASE_URL` e ao Storage com `SUPABASE_SERVICE_ROLE_KEY`
(somente no servidor).

Mesmo assim, o Supabase expõe por padrão as tabelas do schema `public` na API REST
(`/rest/v1/...`). Se **Row Level Security (RLS)** estiver desligado, qualquer pessoa
com a URL do projeto e a chave `anon` pode ler/alterar dados — incluindo
`usuarios.senha_hash`, `sessoes.token` e `responsavel_email`.

**Correção recomendada (não quebra o app):**

1. Supabase → **SQL Editor** → executar [`supabase/enable_rls.sql`](supabase/enable_rls.sql).
2. Isso ativa RLS em todas as tabelas **sem** políticas públicas → API anon bloqueada.
3. A conexão Postgres do Railway (`postgres` / service role) continua com acesso total.
4. Confirme que o bucket `fotos-acoes` está **Private** (Storage → bucket → Settings).
5. **Nunca** coloque `SUPABASE_SERVICE_ROLE_KEY` nem `anon` key no frontend.

Após rodar o script, os alertas de RLS devem sumir em até 24 h.

### Agendamento de salas

1. Faça o deploy (as tabelas `salas`, `coordenacoes` e `agendamentos` nascem no `init_db`).
2. Supabase → **SQL Editor** → execute [`supabase/agendamento_salas.sql`](supabase/agendamento_salas.sql)
   (extensão `btree_gist`, constraint `sem_conflito` e RLS das três tabelas).
3. Para desfazer só este módulo: [`supabase/rollback_agendamento_salas.sql`](supabase/rollback_agendamento_salas.sql)
   e checkout da branch `backup-antes-agendamento-salas`.

## 2. Railway

1. Crie um serviço a partir do repositório Git.
2. Em **Settings → Build**, selecione **Dockerfile** (arquivo na raiz).
3. Variáveis do serviço (veja também [.env.example](.env.example)):

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | sim | URI Postgres do Supabase |
| `SUPABASE_URL` | sim | URL do projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Chave service role |
| `SUPABASE_STORAGE_BUCKET` | não | default `fotos-acoes` |
| `COOKIE_SECURE` | não | default `1` em produção |
| `ADMIN_USER` / `ADMIN_PASS` | recomendado | seed do primeiro admin |
| `GMAIL_USER` | sim* | remetente (`tarefas@trabalho.ce.gov.br`) |
| `GMAIL_APP_PASSWORD` | sim* | senha de app Google (sem espaços) |
| `APP_BASE_URL` | sim* | URL pública do Railway (links no e-mail) |
| `RESPONSAVEIS_SHEET_URL` | não | CSV publicado da lista de responsáveis |
| `PORT` | automático | Railway injeta |

\* Obrigatórias para envio de e-mail ao cadastrar tarefa.

4. Faça o deploy. Healthcheck: `GET /api/health`.

## 3. Migrar dados locais

No computador (com o `.env` apontando para o Supabase):

```bash
pip install -r requirements.txt
python migrate_sqlite_to_supabase.py
```

Isso copia `meta`, `itens`, `historico`, `usuarios` e sobe fotos de `data/uploads/` para o Storage.

## 4. Validação

- Abrir a URL do Railway → `/login.html`
- Login admin / editor / consulta
- Criar/editar ação com foto
- Conferir KPIs e linha do tempo

## 5. Desenvolvimento local

Sem `DATABASE_URL`, o app continua em **SQLite** (`data/painel.db`) e fotos em `data/uploads/`:

```bat
iniciar.bat
```

Com as variáveis do Supabase definidas no ambiente, o mesmo código usa Postgres + Storage.

## 6. E-mail ao cadastrar tarefa

1. Na conta `tarefas@trabalho.ce.gov.br`, ative **verificação em 2 etapas** e gere uma **senha de app** (Google Account → Segurança → Senhas de app).
2. Configure no Railway:
   - `GMAIL_USER=tarefas@trabalho.ce.gov.br`
   - `GMAIL_APP_PASSWORD=` (16 caracteres, sem espaços)
   - `APP_BASE_URL=` URL pública do serviço (ex.: `https://seu-app.up.railway.app`)
3. Ao criar tarefa em `/tarefas.html`, o responsável recebe e-mail com **convite de agenda** (.ics) quando houver prazo + horário.
4. No Gmail, o responsável deve aceitar o convite (**Sim** / **Adicionar ao calendário**) para o evento entrar no Google Agenda.
5. **Google Tasks automático** na conta do responsável exige configuração extra no Admin Workspace (Service Account + delegação). O convite de agenda é a integração suportada hoje.
6. Falhas de envio ficam registradas na tabela `notificacoes_tarefa`.
