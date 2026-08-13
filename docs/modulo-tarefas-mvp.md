# Módulo Tarefas — mapa de integração e escopo MVP

Documento de referência para integrar o fluxo descrito em `fluxo.pdf` ao SET Projetos (`casa_trabalhador`), **sem substituir** o painel por projeto existente.

---

## 1. Princípio de integração

| Decisão | Escolha recomendada |
|---------|---------------------|
| Entidade central | Reutilizar **`itens`** como tarefa/card (mesmo dado, duas lentes) |
| Módulo Tarefas | Nova rota `/tarefas.html` = **lago de cards** transversal |
| Painel do projeto | Continua criando/editando ações; reflete automaticamente em Tarefas |
| Tarefas institucionais | Fase 2 — `projeto_id` especial ou nullable + campo `origem` |
| Duplicar dados projeto ↔ tarefas | **Não** — uma única fonte de verdade |

---

## 2. Mapa campo a campo (PDF → modelo → API → UI)

Legenda: ✅ existe hoje · 🟡 parcial · 🔴 não existe · 📋 MVP Fase 1

### 2.1 Atores e permissões

| Fluxo PDF | Papel desejado | Hoje (`usuarios` / `usuario_projetos`) | Ação |
|-----------|----------------|----------------------------------------|------|
| Presidente do Comitê Executivo | Visão global, filtro por período, rankings | Admin global ou perfil dedicado | 📋 MVP: **admin global** enxerga tudo; depois papel `comite_executivo` |
| Participantes de projetos | CRUD em cards do seu projeto | `editor` / `admin` por projeto | ✅ |
| Secretários | Demandas institucionais + operação | Não modelado | 🔴 Fase 2 — papel `secretaria` |
| Consulta | Só leitura | `consulta` | ✅ |

### 2.2 Funcionalidades da tela “Tarefas”

| Requisito PDF | Campo / lógica | Tabela / API atual | Tela atual | MVP Fase 1 |
|---------------|----------------|-------------------|------------|------------|
| Filtrar por prazo no período | `prazo` entre `de` e `ate` | `itens.prazo` | Filtros por status no painel | 📋 `GET /api/tarefas?prazo_de=&prazo_ate=` |
| Card de tarefa | `entrega`, status, prazo, responsável | `itens.*` | Cards do painel | 📋 `/tarefas.html` — cards unificados |
| Fechar / mover para concluído | `status = Concluído` | PATCH item | Modal editar ação | 📋 PATCH inline ou modal na tela Tarefas |
| Comentários | Thread por card | `historico` (só mudança de campo) | Linha do tempo | 🔴 Fase 2 — `tarefa_comentarios` |
| Impedimentos | Flag/tipo + texto | — | — | 🔴 Fase 2 |
| Avanços | Texto de progresso | `proxima` + histórico `providencia` | Campo providência | 🟡 MVP: editar `proxima`; Fase 2: comentário tipado |
| Criar ação no projeto | POST item | `POST /api/projetos/{id}/itens` | Nova ação | ✅ |
| Espelhar no módulo Tarefas | Mesma entidade | Mesmo `item_id` | — | 📋 automático (mesma API) |
| Tarefa ligada a projeto | `projeto_id` | `itens.projeto_id` | Painel por projeto | ✅ |
| Tarefa Comitê / Contratos / Secretário | Origem institucional | — | — | 🔴 Fase 2 — `origem` + projeto virtual |
| Dashboard % projetos | KPIs agregados | `compute_kpis` + portfolio | `/portfolio.html` | 🟡 estender |
| Dashboard % atividades gerais | KPIs cross-projeto | — | — | 📋 `GET /api/tarefas/dashboard` |
| Ranking projetos críticos | Ordenar por atrasadas + críticas | KPIs por projeto | — | 📋 top N na dashboard Tarefas |
| Ranking pessoas (volume/atraso) | Agrupar por responsável | `responsavel` texto livre | — | 🟡 MVP heurístico; Fase 2 `responsavel_usuario_id` |
| Google Calendar | Sync prazo → evento | — | — | 🔴 Fase 3 |
| E-mail / lembrete | Job + SMTP | — | — | 🔴 Fase 3 |
| Interrogar responsável | Lista filtrada por período | `atencao` parcial | Atenção do gerente (por projeto) | 📋 lista na tela Tarefas + export CSV |

### 2.3 Mapeamento de campos `itens` ↔ card de tarefa

| UI card (PDF) | Campo DB | Editável | Notas |
|---------------|----------|----------|-------|
| Título | `entrega` | Sim | Obrigatório |
| Projeto | `projeto_id` | Sim (criação) | Join `projetos.nome` na listagem |
| Frente | `frente` | Sim | Agrupamento visual opcional |
| Status | `status` | Sim | Workflow atual (6 estados) |
| Prioridade | `prioridade` | Sim | Crítica / Alta / Média / Baixa |
| Prazo | `prazo` | Sim | Filtro principal do PDF |
| Responsável | `responsavel` | Sim | Texto; ranking impreciso até Fase 2 |
| Próximo passo / avanço | `proxima` | Sim | Providência operacional |
| Observações | `obs` | Sim | |
| % progresso | `pct` | Sim | |
| Anexo | `foto` | Sim | Upload base64 |
| Atrasada | calculado | — | `dias_prazo < 0` (já em `annotate_items`) |
| Origem institucional | **novo** `origem` | Fase 2 | `projeto` \| `comite_executivo` \| `comite_contratos` \| `secretaria` |
| Assignee sistema | **novo** `responsavel_usuario_id` | Fase 2 | FK `usuarios.id` opcional |

### 2.4 APIs propostas (MVP Fase 1)

| Método | Rota | Descrição | Reutiliza |
|--------|------|-----------|-----------|
| GET | `/api/tarefas` | Lista cards acessíveis ao usuário | `portfolio_for_usuario` + flatten `itens` |
| GET | `/api/tarefas/dashboard` | KPIs globais + rankings | `compute_kpis`, agregações SQL |
| PATCH | `/api/projetos/{id}/itens/{item_id}` | Atualizar status/providência | ✅ existente |
| POST | `/api/projetos/{id}/itens` | Nova tarefa no projeto | ✅ existente |
| GET | `/api/tarefas/export` | CSV período + responsáveis | Opcional MVP+ |

**Query params sugeridos para `GET /api/tarefas`:**

```
prazo_de=2026-08-01
prazo_ate=2026-08-31
projeto_id=casa-trabalhador   (opcional)
status=Em andamento           (opcional)
prioridade=Crítica            (opcional)
responsavel=Paulo             (opcional, contains)
origem=projeto                (Fase 2)
ordenar=prazo|atraso|prioridade
```

**Resposta sugerida:**

```json
{
  "ok": true,
  "filtro": { "prazo_de": "...", "prazo_ate": "..." },
  "kpis": {
    "total": 120,
    "concluidos": 45,
    "atrasadas": 12,
    "criticas_abertas": 5,
    "progresso_pct": 62.3
  },
  "rankings": {
    "projetos_criticos": [
      { "id": "...", "nome": "...", "atrasadas": 8, "criticas": 2, "progresso_pct": 40 }
    ],
    "responsaveis": [
      { "nome": "KG", "total_abertas": 15, "atrasadas": 4 }
    ]
  },
  "tarefas": [
    {
      "id": "001",
      "projeto_id": "casa-trabalhador",
      "projeto_nome": "Casa do Trabalhador",
      "entrega": "...",
      "status": "Em andamento",
      "prioridade": "Alta",
      "prazo": "2026-10-30",
      "responsavel": "KG",
      "proxima": "...",
      "atrasado": false,
      "dias_prazo": 78,
      "frente": "Infraestrutura",
      "meu_papel": "editor"
    }
  ]
}
```

### 2.5 Telas propostas (MVP Fase 1)

#### `/tarefas.html` — Lago de cards

```
┌─ Topbar SET (existente) ─────────────────────────────────────┐
├─ Menu sticky (existente) ──────────────────────────────────┤
├─ Filtros: [Período prazo de/até] [Projeto] [Status] [Resp.]│
├─ Dashboard compacto (KPIs + 2 rankings) ───────────────────┤
├─ Grid de cards (mesmo visual painel, cross-projeto) ───────┤
│   · badge projeto + frente                                   │
│   · pills prioridade/atraso                                  │
│   · ações: Editar | Concluir | Linha do tempo               │
└──────────────────────────────────────────────────────────────┘
```

#### Navegação

| De | Para |
|----|------|
| Portfólio | Link “Tarefas” no menu sticky |
| Painel projeto | Card continua igual; badge “Ver no lago” opcional |
| Tarefas | Clique no projeto → `/projeto/{id}` filtrado |

---

## 3. Escopo MVP — Comitê Executivo (Fase 1)

**Objetivo:** entregar o “lago de cards” e visão executiva descritos no PDF, **reutilizando `itens`**, em **4–6 semanas** de esforço estimado (1 dev).

### 3.1 In scope (MVP)

1. **Tela `/tarefas.html`** autenticada, layout SET Projetos.
2. **API `GET /api/tarefas`** com filtro por período de prazo e filtros secundários.
3. **Dashboard executivo** na mesma página:
   - total / concluídas / atrasadas / críticas abertas / % progresso global;
   - **top 5 projetos críticos** (score: críticas×3 + atrasadas×2 + baixo progresso);
   - **top 5 responsáveis** por cards atrasados (agrupamento por texto `responsavel`).
4. **Cards** com leitura e edição rápida (status, providência, concluir).
5. **Permissões:** usuário vê apenas tarefas de projetos a que tem acesso; admin global vê tudo.
6. **Link no menu** sticky (Portfólio, Painel, Tarefas).
7. **Espelhamento:** ação criada no painel aparece em Tarefas sem sync extra.

### 3.2 Out of scope (MVP — Fases 2 e 3)

| Item | Fase |
|------|------|
| Tarefas sem projeto (Comitê, Contratos, Secretário) | 2 |
| Comentários / impedimentos estruturados | 2 |
| `responsavel_usuario_id` + “Minhas tarefas” | 2 |
| Papéis `comite_executivo`, `secretaria` | 2 |
| Kanban drag-and-drop | 2+ |
| Google Calendar | 3 |
| E-mail automático | 3 |
| Notificação push / WhatsApp | 3+ |

### 3.3 User stories (MVP)

| ID | Como… | Quero… | Para… | Critério de aceite |
|----|-------|--------|-------|-------------------|
| T1 | Presidente (admin) | filtrar tarefas por mês de prazo | preparar reunião do comitê | Filtro `prazo_de`/`prazo_ate` retorna só itens no intervalo; contagem bate com cards |
| T2 | Presidente | ver ranking de projetos críticos | priorizar cobrança | Top 5 ordenado; link abre painel do projeto |
| T3 | Presidente | ver quem tem mais atrasos | “interrogar responsáveis” | Top 5 por `responsavel` com contagem de atrasadas |
| T4 | Participante | ver minhas tarefas de todos os projetos | não entrar projeto a projeto | Lista unificada respeitando RBAC |
| T5 | Participante | marcar tarefa concluída | fechar card | PATCH status → Concluído; some de filtro “abertas” |
| T6 | Participante | registrar providência | documentar avanço | PATCH `proxima`; entrada no histórico |
| T7 | Sistema | refletir ação nova do painel | um lago único | Item criado no painel aparece em GET /api/tarefas em < 1 refresh |

### 3.4 Modelo de dados (MVP)

**Sem migration obrigatória** — apenas leitura/agregação de `itens` existentes.

Opcional (baixo risco, prepara Fase 2):

```sql
-- Fase 2, não MVP
ALTER TABLE itens ADD COLUMN origem TEXT NOT NULL DEFAULT 'projeto';
ALTER TABLE itens ADD COLUMN responsavel_usuario_id INTEGER REFERENCES usuarios(id);
```

Projetos virtuais institucionais (Fase 2):

| `projeto_id` | Nome |
|--------------|------|
| `comite-executivo` | Comitê Executivo |
| `comite-contratos` | Comitê de Contratos |
| `secretaria` | Demandas da Secretaria |

### 3.5 Estimativa de esforço (MVP)

| Entrega | Dias dev |
|---------|----------|
| API `/api/tarefas` + dashboard | 2–3 |
| `tarefas.html` + `tarefas.js` + CSS | 3–4 |
| Integração menu + permissões | 0.5 |
| Testes manuais + ajustes mobile | 1–2 |
| **Total** | **~7–10 dias** |

---

## 4. Fase 2 — Enriquecimento (pós-MVP)

| Entrega | Detalhe |
|---------|---------|
| Tabela `tarefa_comentarios` | `item_id`, `tipo` (comentario \| impedimento \| avanço), `texto`, `usuario_id`, `criado_em` |
| Tarefas institucionais | Projetos virtuais + UI “Nova tarefa institucional” |
| Assignee | Select de usuário + migração gradual de `responsavel` texto |
| Papéis | `comite_executivo` vê tudo; `secretaria` cria em projetos institucionais |
| Filtro “Minhas tarefas” | `responsavel_usuario_id = me` ou match fuzzy no texto |

---

## 5. Fase 3 — Notificações

| Entrega | Detalhe |
|---------|---------|
| E-mail diário | Job (cron Railway) + SMTP; resumo de atrasadas por responsável |
| Google Calendar | OAuth2; evento por item com prazo; opt-in por usuário |
| Export | CSV/PDF da lista filtrada para reunião do comitê |

---

## 6. Riscos e mitigação

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| `responsavel` texto inconsistente | Ranking de pessoas impreciso no MVP | Normalizar na Fase 2; MVP com aviso “agrupado por nome informado” |
| Performance com muitos itens | Lentidão no lago | Índice `(projeto_id, prazo)`; paginação; cache KPIs |
| Confusão item vs tarefa | UX | Mesma palavra na UI: “Tarefa” no lago, “Ação” no painel — tooltip explicando ser o mesmo registro |
| Escopo Google cedo | Atraso | Manter Fase 3; MVP usa export CSV para reunião |

---

## 7. Checklist de go/no-go antes de codar

- [ ] Confirmar que **item = tarefa** (uma entidade) é aceito pelo negócio
- [ ] Definir se MVP usa só **admin global** como “Presidente do Comitê”
- [ ] Validar fórmula do **ranking de projetos críticos**
- [ ] Decidir período padrão do filtro (mês corrente vs próximos 30 dias)
- [ ] Confirmar se consulta (`consulta`) acessa `/tarefas` ou só admin/editor

---

## 8. Referências no código atual

| Conceito | Arquivo |
|----------|---------|
| Modelo `itens` | `db.py` — `ITEM_FIELDS`, `list_itens`, `upsert_item` |
| KPIs | `server.py` — `compute_kpis` |
| Fila atenção | `server.py` — `attention_items` |
| Portfólio multi-projeto | `db.py` — `portfolio_for_usuario` |
| UI ações | `web/static/js/app.js` |
| RBAC | `db.py` — `usuario_projetos`, `papel_no_projeto` |

---

*Documento gerado para alinhamento do módulo Tarefas com `fluxo.pdf`. Próximo passo sugerido: validar checklist §7 e iniciar implementação da Fase 1.*
