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
| `PORT` | automático | Railway injeta |

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
