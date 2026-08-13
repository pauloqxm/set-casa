(() => {
  const pathMatch = location.pathname.match(/^\/projeto\/([^/]+)\/?$/);
  const PROJETO_ID = pathMatch
    ? decodeURIComponent(pathMatch[1])
    : "casa-trabalhador";
  const IS_LEGACY_HOME = !pathMatch;

  function apiPainel() {
    return IS_LEGACY_HOME
      ? "/api/painel"
      : `/api/projetos/${encodeURIComponent(PROJETO_ID)}/painel`;
  }

  function apiItens() {
    return IS_LEGACY_HOME
      ? "/api/itens"
      : `/api/projetos/${encodeURIComponent(PROJETO_ID)}/itens`;
  }

  function apiItem(id) {
    return `${apiItens()}/${encodeURIComponent(id)}`;
  }

  function apiHistorico(itemId) {
    return `${apiItem(itemId)}/historico`;
  }

  function apiHistoricoEvento(itemId, histId) {
    return `${apiHistorico(itemId)}/${encodeURIComponent(histId)}`;
  }

  const FRENTES_PADRAO = [
    "Infraestrutura",
    "Restauro e Patrimônio Histórico",
    "Equipamentos e Mobiliário",
    "Comunicação Institucional",
    "Evento de Inauguração",
    "Parcerias Institucionais",
    "Implantação dos Serviços",
    "Gestão Patrimonial",
    "Gestão Contratual e Financeira",
    "Tecnologia e Infraestrutura Operacional",
  ];

  const STATUS_OPTIONS = [
    "Não iniciado",
    "Em andamento",
    "Aguardando terceiros",
    "Concluído",
    "Sobrestado",
    "Não se aplica",
  ];

  const STATUS_PROGRESS_FALLBACK = {
    Concluído: 100,
    "Em andamento": 55,
    "Aguardando terceiros": 30,
    Sobrestado: 10,
    "Não iniciado": 0,
    "Não se aplica": null,
  };

  const PRIO_ORDER = { Crítica: 0, Alta: 1, Média: 2, Baixa: 3, "": 4 };
  const STATUS_ORDER = {
    "Aguardando terceiros": 0,
    "Em andamento": 1,
    "Não iniciado": 2,
    Sobrestado: 3,
    "": 4,
    "Não se aplica": 5,
    Concluído: 6,
  };

  const ATENCAO_TABS = [
    { id: "todas", label: "Todas" },
    { id: "criticas", label: "Críticas" },
    { id: "atrasadas", label: "Atrasadas" },
    { id: "terceiros", label: "Aguardando terceiros" },
  ];

  const state = {
    itens: [],
    kpis: {},
    frentes: [],
    atencao: [],
    atencaoTab: "todas",
    atualizadoEm: "",
    bloco: "todas",
    status: "",
    prioridade: "",
    responsavel: "",
    search: "",
    view: "cards",
    sortKey: "prazo",
    sortDir: 1,
    cardsPage: 1,
    showConcluidos: false,
    expanded: {},
    historicoCache: {},
    user: null,
    projetoMeta: {},
    usuariosOpcoes: [],
  };

  const CARDS_PER_PAGE = 8;

  function canEdit() {
    return Boolean(state.user && state.user.pode_editar);
  }

  function editActionButton(itemId) {
    if (!canEdit()) return "";
    return `<button type="button" class="btn-run btn-small" data-edit="${escapeAttr(itemId)}">Editar ação</button>`;
  }

  const el = {
    kpis: document.getElementById("kpis"),
    atencao: document.getElementById("atencaoList"),
    atencaoTabs: document.getElementById("atencaoTabs"),
    blocks: document.getElementById("blocksRow"),
    frenteTag: document.getElementById("frenteTag"),
    tabs: document.getElementById("tabs"),
    cards: document.getElementById("cards"),
    cardsPager: document.getElementById("cardsPager"),
    tablePanel: document.getElementById("tablePanel"),
    tableBody: document.getElementById("tableBody"),
    resultCount: document.getElementById("resultCount"),
    atualizadoEm: document.getElementById("atualizadoEm"),
    diasInaug: document.getElementById("diasInaug"),
    ringProgress: document.getElementById("ringProgress"),
    ringPct: document.getElementById("ringPct"),
    filterStatus: document.getElementById("filterStatus"),
    filterPrioridade: document.getElementById("filterPrioridade"),
    filterResponsavel: document.getElementById("filterResponsavel"),
    filterSearch: document.getElementById("filterSearch"),
    dialog: document.getElementById("editDialog"),
    form: document.getElementById("editForm"),
    editId: document.getElementById("editId"),
    editMode: document.getElementById("editMode"),
    editEyebrow: document.getElementById("editEyebrow"),
    editTitle: document.getElementById("editTitle"),
    editEntrega: document.getElementById("editEntrega"),
    editFrente: document.getElementById("editFrente"),
    editResponsavel: document.getElementById("editResponsavel"),
    editParceiros: document.getElementById("editParceiros"),
    editNup: document.getElementById("editNup"),
    editStatus: document.getElementById("editStatus"),
    editPrioridade: document.getElementById("editPrioridade"),
    editDataMudanca: document.getElementById("editDataMudanca"),
    editPrazo: document.getElementById("editPrazo"),
    editPct: document.getElementById("editPct"),
    editProxima: document.getElementById("editProxima"),
    editObs: document.getElementById("editObs"),
    editFoto: document.getElementById("editFoto"),
    btnTirarFoto: document.getElementById("btnTirarFoto"),
    fotoHint: document.getElementById("fotoHint"),
    editRemoverFoto: document.getElementById("editRemoverFoto"),
    fotoPreview: document.getElementById("fotoPreview"),
    fotoPreviewWrap: document.getElementById("fotoPreviewWrap"),
    editCancel: document.getElementById("editCancel"),
    editDelete: document.getElementById("editDelete"),
    editExcluir: document.getElementById("editExcluir"),
    editSubmit: document.getElementById("editSubmit"),
    btnNovaAcao: document.getElementById("btnNovaAcao"),
    btnToggleConcluidos: document.getElementById("btnToggleConcluidos"),
    userChip: document.getElementById("userChip"),
    linkAdmin: document.getElementById("linkAdmin"),
    btnSair: document.getElementById("btnSair"),
    btnVoltar: document.getElementById("btnVoltar"),
    btnTopo: document.getElementById("btnTopo"),
    projTitle: document.getElementById("projTitle"),
    prazoLabel: document.getElementById("prazoLabel"),
    prazoData: document.getElementById("prazoData"),
    projMetaLine: document.getElementById("projMetaLine"),
    btnEditarProjeto: document.getElementById("btnEditarProjeto"),
    projDialog: document.getElementById("projDialog"),
    projForm: document.getElementById("projForm"),
    projNome: document.getElementById("projNome"),
    projDescricao: document.getElementById("projDescricao"),
    projGerente: document.getElementById("projGerente"),
    projInicio: document.getElementById("projInicio"),
    projPrazo: document.getElementById("projPrazo"),
    projError: document.getElementById("projError"),
    projCancel: document.getElementById("projCancel"),
    ganttRoot: document.getElementById("ganttRoot"),
    ganttNote: document.getElementById("ganttNote"),
  };

  function fmtDate(iso) {
    if (!iso) return "—";
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return iso;
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString("pt-BR");
    } catch {
      return iso;
    }
  }

  function fmtBrValue(campo, value) {
    if (value == null || value === "") return "—";
    if (campo === "prazo" || campo === "data_mudanca" || campo === "inicio") {
      return fmtDate(value);
    }
    return String(value);
  }

  function fmtBrText(text) {
    if (!text) return "—";
    return String(text).replace(
      /\b(\d{4})-(\d{2})-(\d{2})\b/g,
      (_, y, m, d) => `${d}/${m}/${y}`
    );
  }

  function statusChipClass(status) {
    const s = (status || "").toLowerCase();
    if (s === "concluído" || s === "concluido") return "chip";
    if (s === "aguardando terceiros") return "chip chip-orange";
    if (s === "em andamento") return "chip chip-blue";
    return "chip chip-neutral";
  }

  function itemProgress(item) {
    const raw = item.pct === "" || item.pct == null ? null : Number(item.pct);
    if (raw != null && !Number.isNaN(raw)) {
      return Math.max(0, Math.min(100, raw));
    }
    const fallback = STATUS_PROGRESS_FALLBACK[item.status];
    return fallback == null ? 0 : fallback;
  }

  function isClosedStatus(status) {
    const s = (status || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return s === "concluido" || s === "nao se aplica";
  }

  function isConcluido(status) {
    const s = (status || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return s === "concluido";
  }

  function syncConcluidosButton() {
    if (!el.btnToggleConcluidos) return;
    el.btnToggleConcluidos.textContent = state.showConcluidos
      ? "Ocultar concluídos"
      : "Exibir concluídos";
    el.btnToggleConcluidos.setAttribute(
      "aria-pressed",
      state.showConcluidos ? "true" : "false"
    );
    el.btnToggleConcluidos.classList.toggle("is-active", state.showConcluidos);
  }

  function daysLabel(item) {
    if (isClosedStatus(item.status)) return { text: "", cls: "" };
    const d = item.dias_prazo;
    if (d == null) return { text: "sem prazo", cls: "" };
    if (d < 0) return { text: `${Math.abs(d)} dia(s) atrasado`, cls: "late" };
    if (d <= 15) return { text: `${d} dia(s) restantes`, cls: "soon" };
    return { text: `${d} dia(s) restantes`, cls: "" };
  }

  function daysLabelMarkup(item) {
    const days = daysLabel(item);
    if (!days.text) return "";
    return `<span class="days-label ${days.cls}">${escapeHtml(days.text)}</span>`;
  }

  function sortItems(list) {
    return [...list].sort((a, b) => {
      const key = state.sortKey;
      let cmp = 0;
      if (key === "prazo") {
        const da = a.dias_prazo;
        const db = b.dias_prazo;
        if (da == null && db == null) cmp = 0;
        else if (da == null) cmp = 1;
        else if (db == null) cmp = -1;
        else cmp = da - db;
      } else if (key === "prioridade") {
        cmp =
          (PRIO_ORDER[a.prioridade || ""] ?? 9) -
          (PRIO_ORDER[b.prioridade || ""] ?? 9);
      } else if (key === "id") {
        cmp = String(a.id).localeCompare(String(b.id), "pt-BR");
      } else {
        cmp = String(a[key] || "")
          .toLowerCase()
          .localeCompare(String(b[key] || "").toLowerCase(), "pt-BR");
      }
      if (cmp !== 0) return cmp * state.sortDir;

      const aCrit = (a.prioridade || "") === "Crítica" ? 0 : 1;
      const bCrit = (b.prioridade || "") === "Crítica" ? 0 : 1;
      if (aCrit !== bCrit) return aCrit - bCrit;
      const aAtr = a.atrasado ? 0 : 1;
      const bAtr = b.atrasado ? 0 : 1;
      if (aAtr !== bAtr) return aAtr - bAtr;
      return String(a.id).localeCompare(String(b.id), "pt-BR");
    });
  }

  function filteredItems() {
    const q = state.search.trim().toLowerCase();
    return sortItems(
      state.itens.filter((item) => {
        if (state.bloco !== "todas" && itemFrenteKey(item) !== state.bloco)
          return false;
        if (state.status && item.status !== state.status) return false;
        if (
          !state.showConcluidos &&
          !state.status &&
          isConcluido(item.status)
        ) {
          return false;
        }
        if (state.prioridade && item.prioridade !== state.prioridade) return false;
        if (state.responsavel && item.responsavel !== state.responsavel) return false;
        if (!q) return true;
        const blob = [
          item.id,
          item.entrega,
          item.frente,
          item.nup,
          item.responsavel,
          item.parceiros,
          item.proxima,
          item.obs,
        ]
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      })
    );
  }

  function fillSelect(select, values, allLabel) {
    const current = select.value;
    select.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = allLabel;
    select.appendChild(optAll);
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
    if ([...select.options].some((o) => o.value === current)) {
      select.value = current;
    }
  }

  function renderFilters() {
    const statuses = [
      ...new Set(state.itens.map((i) => i.status).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const prios = [
      ...new Set(state.itens.map((i) => i.prioridade).filter(Boolean)),
    ].sort((a, b) => (PRIO_ORDER[a] ?? 9) - (PRIO_ORDER[b] ?? 9));
    const resps = [
      ...new Set(state.itens.map((i) => i.responsavel).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
    fillSelect(el.filterStatus, statuses, "Todos");
    fillSelect(el.filterPrioridade, prios, "Todas");
    fillSelect(el.filterResponsavel, resps, "Todos");
  }

  function renderRing() {
    if (!el.ringProgress || !el.ringPct) return;
    const pct = Number(state.kpis.progresso_pct || 0);
    const r = 34;
    const circ = 2 * Math.PI * r;
    el.ringProgress.setAttribute("stroke-dasharray", String(circ));
    el.ringProgress.setAttribute(
      "stroke-dashoffset",
      String(circ - (circ * Math.max(0, Math.min(100, pct))) / 100)
    );
    el.ringPct.textContent = `${pct}%`;

    const dias =
      state.kpis.dias_para_conclusao !== undefined && !IS_LEGACY_HOME
        ? state.kpis.dias_para_conclusao
        : state.kpis.dias_para_inauguracao;
    if (!el.diasInaug) return;
    if (dias == null) {
      el.diasInaug.textContent = "—";
    } else if (dias >= 0) {
      el.diasInaug.textContent = `${dias} dia(s) restantes`;
    } else {
      el.diasInaug.textContent = `${Math.abs(dias)} dia(s) após a data`;
    }
  }

  function renderKpis() {
    const k = state.kpis || {};
    const icons = {
      check:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.2 13.3 6-6-1.4-1.4-4.6 4.6-2.2-2.2-1.4 1.4 3.6 3.6z"/></svg>',
      gear:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.8 7.8 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a7.5 7.5 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0-.1 1l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"/></svg>',
      people:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zM8 12a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 8 12zm8 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4zM8 14c-.3 0-.7 0-1 .1C4.6 14.5 2 15.7 2 18v2h4v-2c0-1.5.8-2.7 2.1-3.6-.7-.2-1.4-.4-2.1-.4z"/></svg>',
      clock:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 11H7v-2h4V7h2z"/></svg>',
      alert:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3 1 21h22L12 3zm0 6h2v5h-2V9zm0 7h2v2h-2v-2z"/></svg>',
    };

    function cardHtml(c) {
      return `
      <article class="kpi-card kpi-${c.tone}">
        <div class="kpi-top">
          <span class="kpi-icon">${c.icon}</span>
          <span class="kpi-label">${c.head}</span>
        </div>
        <p class="kpi-value">${c.value}</p>
        <p class="kpi-text">${c.text}</p>
        <div class="kpi-foot">
          <span>${c.status}</span>
          <i class="kpi-dot" aria-hidden="true"></i>
        </div>
      </article>`;
    }

    const statusCards = [
      {
        tone: "green",
        icon: icons.check,
        head: "Concluídas",
        value: k.concluidos ?? 0,
        text: "Itens finalizados",
        status: `Progresso ${k.progresso_pct ?? 0}%`,
      },
      {
        tone: "blue",
        icon: icons.gear,
        head: "Andamento",
        value: k.em_andamento ?? 0,
        text: "Em execução agora",
        status: "Status",
      },
      {
        tone: "teal",
        icon: icons.people,
        head: "C/ Terceiros",
        value: k.aguardando_terceiros ?? 0,
        text: "Aguardando ação externa",
        status: "Dependência",
      },
      {
        tone: "orange",
        icon: icons.clock,
        head: "Não iniciadas",
        value: k.nao_iniciados ?? 0,
        text: "Ainda sem início formal",
        status: "Fila",
      },
    ];

    const alertCards = [
      {
        tone: "red",
        icon: icons.alert,
        head: "Prioridade crítica",
        value: k.criticas_abertas ?? 0,
        text: "Críticas ainda em aberto",
        status: "Prioridade",
      },
      {
        tone: "red",
        icon: icons.alert,
        head: "Prazo vencido",
        value: k.atrasadas ?? 0,
        text: "Ações com prazo ultrapassado",
        status: "Prazo",
      },
    ];

    el.kpis.innerHTML = `
      <div class="kpi-groups">
        <div class="kpi-group">
          <p class="kpi-group-label">Status do fluxo</p>
          <div class="kpis-row kpis-status">${statusCards.map(cardHtml).join("")}</div>
        </div>
        <div class="kpi-group">
          <p class="kpi-group-label">Pontos de atenção</p>
          <div class="kpis-row kpis-alert">${alertCards.map(cardHtml).join("")}</div>
        </div>
      </div>`;
  }

  const FRENTE_ETIQUETA = {
    Infraestrutura: "Reforma",
    "Restauro e Patrimônio Histórico": "Restauro",
    "Equipamentos e Mobiliário": "Aquisição",
    "Comunicação Institucional": "Comunicação",
    "Evento de Inauguração": "Inauguração",
    "Parcerias Institucionais": "Parcerias",
    "Implantação dos Serviços": "Mudança",
    "Gestão Patrimonial": "Patrimônio",
    "Gestão Contratual e Financeira": "Financeiro",
    "Tecnologia e Infraestrutura Operacional": "TI",
    "Sem frente": "Outras",
  };

  const FRENTE_BLOCO_UI = {
    Infraestrutura: "reforma",
    "Restauro e Patrimônio Histórico": "restauro",
    "Equipamentos e Mobiliário": "aquisicao",
    "Comunicação Institucional": "comunicacao",
    "Evento de Inauguração": "inauguracao",
    "Parcerias Institucionais": "parcerias",
    "Implantação dos Serviços": "mudanca",
    "Gestão Patrimonial": "patrimonio",
    "Gestão Contratual e Financeira": "financeiro",
    "Tecnologia e Infraestrutura Operacional": "ti",
  };

  function itemFrenteKey(item) {
    return (item.frente || "").trim() || "Sem frente";
  }

  function frenteDisplayName(frente) {
    if ((frente || "").trim() === "Sem frente") return "Itens não classificados";
    return frente || "Sem frente";
  }

  /** Rótulo curto (uma palavra) para abas/etiquetas, a partir da frente. */
  function frenteTabLabel(frente) {
    const key = (frente || "").trim() || "Sem frente";
    if (FRENTE_ETIQUETA[key]) return FRENTE_ETIQUETA[key];
    const first = key.split(/[\s/\-–—]+/).filter(Boolean)[0];
    if (!first || first.toLowerCase() === "sem") return "Outras";
    return first.charAt(0).toUpperCase() + first.slice(1);
  }

  function frenteEtiqueta(frente, fallback) {
    if (FRENTE_ETIQUETA[frente]) return FRENTE_ETIQUETA[frente];
    if (fallback && fallback !== "Outras") {
      const word = String(fallback).split(/[\s/\-–—]+/).filter(Boolean)[0];
      if (word) return word;
    }
    return frenteTabLabel(frente);
  }

  function buildTabsFromFrentes() {
    const frentes = state.frentes || [];
    const used = new Map();
    const tabs = [{ id: "todas", label: "Todas" }];
    frentes.forEach((f) => {
      const id = f.frente || "Sem frente";
      let label = frenteTabLabel(id);
      if (used.has(label)) {
        const n = used.get(label) + 1;
        used.set(label, n);
        label = `${label}${n}`;
      } else {
        used.set(label, 1);
      }
      tabs.push({ id, label });
    });
    return tabs;
  }

  const BLOCO_VISUAL = {
    reforma: {
      tone: "green",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 3h10a2 2 0 0 1 2 2v14l-7-3-7 3V5a2 2 0 0 1 2-2zm2 4h6v2H9V7zm0 4h6v2H9v-2z"/></svg>',
    },
    restauro: {
      tone: "green",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10l-6 6z"/></svg>',
    },
    aquisicao: {
      tone: "blue",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm8.3 12.9 3.4 3.4-1.4 1.4-3.4-3.4A8 8 0 1 1 10 2a8 8 0 0 1 8.3 14.9z"/></svg>',
    },
    comunicacao: {
      tone: "blue",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h16v12H7l-3 3V4zm3 4v2h10V8H7zm0 4v2h7v-2H7z"/></svg>',
    },
    inauguracao: {
      tone: "blue",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm13 8H4v10h16V10zM8 12h3v3H8v-3zm5 0h3v3h-3v-3z"/></svg>',
    },
    parcerias: {
      tone: "green",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3c2.5 2.2 4 4.7 4 7.2A4 4 0 0 1 8 10.2C8 7.7 9.5 5.2 12 3zm-7 9a3.5 3.5 0 0 1 3.5 3.5V18H2v-2.5A3.5 3.5 0 0 1 5 12zm14 0a3.5 3.5 0 0 1 3.5 3.5V18h-6.5v-2.5A3.5 3.5 0 0 1 19 12zM12 13a3 3 0 0 1 3 3V18H9v-2a3 3 0 0 1 3-3z"/></svg>',
    },
    mudanca: {
      tone: "blue",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z"/></svg>',
    },
    patrimonio: {
      tone: "green",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3 3 9v12h6v-7h6v7h6V9l-9-6z"/></svg>',
    },
    financeiro: {
      tone: "green",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5h18v3H3V5zm0 5h18v9H3v-9zm3 2v2h4v-2H6zm7 0v2h5v-2h-5z"/></svg>',
    },
    ti: {
      tone: "blue",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 5h16v11H4V5zm2 2v7h12V7H6zm3 12h6v2H9v-2z"/></svg>',
    },
    outras: {
      tone: "green",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2z"/></svg>',
    },
  };

  function blocoVisual(blocoId) {
    return (
      BLOCO_VISUAL[blocoId] || {
        tone: "green",
        icon: BLOCO_VISUAL.outras.icon,
      }
    );
  }

  function renderBlocks() {
    const frentes = state.frentes || [];
    el.frenteTag.textContent = `${frentes.length} frentes`;
    if (!frentes.length) {
      el.blocks.innerHTML = '<div class="empty">Sem frentes para exibir.</div>';
      return;
    }
    el.blocks.innerHTML = frentes
      .map((f) => {
        const frenteKey = f.frente || "Sem frente";
        const blocoId = FRENTE_BLOCO_UI[frenteKey] || f.bloco || "outras";
        const active = state.bloco === frenteKey ? " is-active" : "";
        const visual = blocoVisual(blocoId);
        const doneCls = Number(f.concluidos) > 0 ? " has-progress" : "";
        const nome = frenteDisplayName(frenteKey);
        const etiqueta = frenteEtiqueta(frenteKey, f.bloco_label);
        const extra =
          frenteKey === "Sem frente"
            ? '<div class="block-hint">Fora da grade de frentes principais</div>'
            : "";
        return `
        <button type="button" class="block block-${visual.tone}${active}" data-frente="${escapeAttr(frenteKey)}">
          <div class="block-top">
            <div class="block-heading">
              <span class="block-icon">${visual.icon}</span>
              <div class="block-titles">
                <div class="block-name">${escapeHtml(nome)}</div>
                <div class="block-alt">${escapeHtml(etiqueta)}</div>
              </div>
            </div>
            <div class="block-count">${f.total} itens</div>
          </div>
          <div class="block-bar">
            <div class="block-bar-track">
              <span
                class="block-seg is-done"
                style="width:${f.pct_concluidos}%; background:var(--green);"
                data-tip="Concluído: ${f.concluidos} (${f.pct_concluidos}%)"
                title="Concluído: ${f.concluidos} (${f.pct_concluidos}%)"
              ></span>
              <span
                class="block-seg is-progress"
                style="width:${f.pct_andamento}%; background:var(--blue);"
                data-tip="Em andamento: ${f.em_andamento} (${f.pct_andamento}%)"
                title="Em andamento: ${f.em_andamento} (${f.pct_andamento}%)"
              ></span>
              <span
                class="block-seg is-waiting"
                style="width:${f.pct_aguardando}%; background:var(--orange);"
                data-tip="Aguardando terceiros: ${f.aguardando_terceiros} (${f.pct_aguardando}%)"
                title="Aguardando terceiros: ${f.aguardando_terceiros} (${f.pct_aguardando}%)"
              ></span>
              <span
                class="block-seg is-rest"
                style="width:${f.pct_outros}%; background:#d8d8d8;"
                data-tip="Demais: ${f.outros} (${f.pct_outros}%)"
                title="Demais: ${f.outros} (${f.pct_outros}%)"
              ></span>
            </div>
          </div>
          <div class="block-foot">
            <span>Concluído</span>
            <b class="block-ratio${doneCls}"><span>${f.concluidos}</span>/${f.total}</b>
          </div>
          ${extra}
        </button>`;
      })
      .join("");
  }

  function isCritica(item) {
    return (item.prioridade || "") === "Crítica";
  }

  function isTerceiros(item) {
    return (item.status || "") === "Aguardando terceiros";
  }

  function atencaoCounts() {
    const list = state.atencao || [];
    return {
      todas: list.length,
      criticas: list.filter(isCritica).length,
      atrasadas: list.filter((i) => i.atrasado).length,
      terceiros: list.filter(isTerceiros).length,
    };
  }

  function filteredAtencao() {
    const list = state.atencao || [];
    if (state.atencaoTab === "criticas") return list.filter(isCritica);
    if (state.atencaoTab === "atrasadas") return list.filter((i) => i.atrasado);
    if (state.atencaoTab === "terceiros") return list.filter(isTerceiros);
    return list;
  }

  function renderAtencaoTabs() {
    const counts = atencaoCounts();
    el.atencaoTabs.innerHTML = ATENCAO_TABS.map((tab) => {
      const count = counts[tab.id] ?? 0;
      const active = state.atencaoTab === tab.id ? " is-active" : "";
      return `
        <button type="button" class="attention-tab${active}" data-atencao-tab="${tab.id}" role="tab" aria-selected="${state.atencaoTab === tab.id}">
          ${tab.label}<span class="count">${count}</span>
        </button>`;
    }).join("");
  }

  function renderAtencao() {
    renderAtencaoTabs();
    const items = filteredAtencao();
    if (!state.atencao.length) {
      el.atencao.innerHTML =
        '<div class="empty">Nenhum item crítico, atrasado ou aguardando terceiros no momento.</div>';
      return;
    }
    if (!items.length) {
      el.atencao.innerHTML =
        '<div class="empty">Nenhum item neste estágio.</div>';
      return;
    }
    el.atencao.innerHTML = items
      .map((item) => {
        const pills = [];
        if (isCritica(item))
          pills.push('<span class="pill pill-priority">Crítica</span>');
        else if ((item.prioridade || "") === "Alta")
          pills.push('<span class="pill pill-priority-alta">Alta</span>');
        if (item.atrasado)
          pills.push('<span class="pill pill-status-atrasado">Atrasado</span>');
        if (isTerceiros(item))
          pills.push(
            '<span class="pill pill-status-terceiros">Aguardando terceiros</span>'
          );
        const days = daysLabel(item);
        const critClass = isCritica(item) ? " is-critica" : "";
        const open = !!state.expanded[item.id];
        const daysHtml = days.text
          ? `<span class="days-badge ${days.cls}">${escapeHtml(days.text)}</span>`
          : "";
        return `
        <article class="attention-item${critClass}${open ? " is-open" : ""}" data-item-id="${escapeAttr(item.id)}">
          <div class="att-pills">${pills.join("") || '<span class="pill pill-neutral">Atenção</span>'}</div>
          <div class="attention-main">
            <strong>${escapeHtml(item.entrega || "Sem título")}</strong>
            <p>${escapeHtml(item.proxima || "Sem próxima providência registrada")}</p>
            ${fotoMarkup(item, "attention-foto")}
            <div class="meta">
              #${escapeHtml(item.id)} · ${escapeHtml(item.responsavel || "Sem responsável")} · ${escapeHtml(frenteEtiqueta(item.frente, item.bloco_label) || item.frente || "")}
              ${daysHtml ? ` · ${daysHtml}` : ""}
            </div>
          </div>
          <button type="button" class="btn-expand${open ? " is-open" : ""}" data-expand="${escapeAttr(item.id)}" aria-expanded="${open}">
            ${open ? "Ocultar" : "Linha do tempo"}
          </button>
          ${editActionButton(item.id)}
          ${open ? timelineMarkup(item.id) : ""}
        </article>`;
      })
      .join("");

    items.forEach((item) => {
      if (state.expanded[item.id] && !state.historicoCache[item.id]) {
        loadHistorico(item.id);
      }
    });
  }

  function timelineMarkup(itemId) {
    const hist = state.historicoCache[itemId];
    if (!hist) {
      return `<div class="timeline-wrap"><div class="timeline-empty">Carregando linha do tempo…</div></div>`;
    }
    if (!hist.length) {
      return `<div class="timeline-wrap"><div class="timeline-empty">Ainda não há alterações registradas. Ao salvar uma providência, ela aparece aqui.</div></div>`;
    }
    const FIELD_LABELS = {
      status: "Status",
      pct: "%",
      proxima: "Providência",
      obs: "Observações",
      prioridade: "Prioridade",
      prazo: "Prazo",
      data_mudanca: "Data da mudança",
    };
    const itemsHtml = hist
      .map((ev) => {
        const details = Object.entries(ev.detalhes || {})
          .map(([campo, delta]) => {
            const label = FIELD_LABELS[campo] || campo;
            return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(fmtBrValue(campo, delta.de))} → ${escapeHtml(fmtBrValue(campo, delta.para))}</li>`;
          })
          .join("");
        const tipoCls = ev.tipo === "providencia" ? " is-providencia" : "";
        const delBtn = canEdit()
          ? `<button type="button" class="btn-del-hist" data-del-hist="${escapeAttr(itemId)}" data-hist-id="${escapeAttr(ev.id)}">Excluir</button>`
          : "";
        return `
          <li class="timeline-item${tipoCls}">
            <div class="timeline-head">
              <div class="timeline-when">${escapeHtml(fmtDateTime(ev.criado_em))}</div>
              ${delBtn}
            </div>
            <p class="timeline-resumo">${escapeHtml(fmtBrText(ev.resumo || "Atualização"))}</p>
            ${details ? `<ul class="timeline-details">${details}</ul>` : ""}
          </li>`;
      })
      .join("");
    return `<div class="timeline-wrap"><ol class="timeline">${itemsHtml}</ol></div>`;
  }

  async function loadHistorico(itemId) {
    try {
      const res = await fetch(apiHistorico(itemId), { cache: "no-store" });
      if (!res.ok) throw new Error("falha");
      const data = await res.json();
      state.historicoCache[itemId] = data.historico || [];
    } catch {
      state.historicoCache[itemId] = [];
    }
    if (state.expanded[itemId]) {
      renderAtencao();
      if (state.view === "cards") renderCards();
    }
  }

  async function toggleExpand(itemId) {
    if (state.expanded[itemId]) {
      delete state.expanded[itemId];
      renderAtencao();
      if (state.view === "cards") renderCards();
      return;
    }
    state.expanded[itemId] = true;
    renderAtencao();
    if (state.view === "cards") renderCards();
    if (!state.historicoCache[itemId]) {
      await loadHistorico(itemId);
    }
  }

  function renderTabs() {
    const tabs = buildTabsFromFrentes();
    const activeId = state.bloco || "todas";
    const stillExists =
      activeId === "todas" || tabs.some((t) => t.id === activeId);
    if (!stillExists) state.bloco = "todas";
    const current = state.bloco || "todas";
    el.tabs.innerHTML = tabs
      .map(
        (b) => `
      <button type="button" class="tab${current === b.id ? " is-active" : ""}" data-frente="${escapeAttr(b.id)}" role="tab" aria-selected="${current === b.id}" title="${escapeAttr(b.id === "todas" ? "Todas as frentes" : b.id)}">
        ${escapeHtml(b.label)}
      </button>`
      )
      .join("");
  }

  function sortByTempoAsc(list) {
    return [...list].sort((a, b) => {
      const da = a.dias_prazo;
      const db = b.dias_prazo;
      let cmp = 0;
      if (da == null && db == null) cmp = 0;
      else if (da == null) cmp = 1;
      else if (db == null) cmp = -1;
      else cmp = da - db;
      if (cmp !== 0) return cmp;
      return String(a.id).localeCompare(String(b.id), "pt-BR");
    });
  }

  function setCardsPage(page, totalPages) {
    state.cardsPage = Math.min(Math.max(1, page), Math.max(1, totalPages));
    renderCards();
  }

  function renderCardsPager(total, page, totalPages) {
    if (!el.cardsPager) return;
    if (totalPages <= 1) {
      el.cardsPager.hidden = true;
      el.cardsPager.innerHTML = "";
      return;
    }
    el.cardsPager.hidden = false;
    const buttons = [];
    buttons.push(
      `<button type="button" class="pager-btn" data-page="prev" ${page <= 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>`
    );
    for (let p = 1; p <= totalPages; p += 1) {
      const active = p === page ? " is-active" : "";
      buttons.push(
        `<button type="button" class="pager-btn${active}" data-page="${p}" aria-label="Página ${p}" aria-current="${p === page ? "page" : "false"}">${p}</button>`
      );
    }
    buttons.push(
      `<button type="button" class="pager-btn" data-page="next" ${page >= totalPages ? "disabled" : ""} aria-label="Próxima página">›</button>`
    );
    const from = (page - 1) * CARDS_PER_PAGE + 1;
    const to = Math.min(page * CARDS_PER_PAGE, total);
    el.cardsPager.innerHTML = `
      <p class="pager-meta">Exibindo ${from}–${to} de ${total} · ordenado do menor ao maior tempo</p>
      <div class="pager-buttons">${buttons.join("")}</div>
    `;
  }

  function renderCards() {
    const items = sortByTempoAsc(filteredItems());
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / CARDS_PER_PAGE));
    if (state.cardsPage > totalPages) state.cardsPage = totalPages;
    if (state.cardsPage < 1) state.cardsPage = 1;
    const page = state.cardsPage;
    const pageItems = items.slice(
      (page - 1) * CARDS_PER_PAGE,
      page * CARDS_PER_PAGE
    );

    el.resultCount.textContent = `${total} item(ns) exibido(s)`;
    if (!total) {
      el.cards.innerHTML =
        '<div class="empty">Nenhuma entrega encontrada com os filtros atuais.</div>';
      renderCardsPager(0, 1, 1);
      return;
    }
    el.cards.innerHTML = pageItems
      .map((item) => {
        const width = itemProgress(item);
        const pctLabel =
          item.pct === "" || item.pct == null ? `~${width}%` : `${width}%`;
        const chips = [
          `<span class="${statusChipClass(item.status)}">${escapeHtml(item.status || "Sem status")}</span>`,
        ];
        if (item.atrasado)
          chips.push('<span class="chip chip-orange">Atrasado</span>');
        const days = daysLabel(item);
        return `
        <article class="card item-card">
          <div class="card-head">${escapeHtml(item.entrega || "Sem título")}</div>
          <div class="card-body">
            <p class="card-value">${chips.join("")}<span>${pctLabel}</span></p>
            <div class="progress" aria-hidden="true"><span style="width:${width}%"></span></div>
            <p class="card-text">
              <strong>${escapeHtml(item.bloco_label || "Outras")}</strong> · ${escapeHtml(item.frente || "—")}<br/>
              Resp.: ${escapeHtml(item.responsavel || "—")}
              ${item.parceiros ? ` · Parceiros: ${escapeHtml(item.parceiros)}` : ""}
              ${item.nup ? `<br/>NUP: ${escapeHtml(item.nup)}` : ""}
              <br/>Mudança ${fmtDate(item.data_mudanca || item.inicio)} · Prazo ${fmtDate(item.prazo)}
              ${days.text ? `<br/>${daysLabelMarkup(item)}` : ""}
            </p>
            <p class="card-text"><strong>Próxima:</strong> ${escapeHtml(item.proxima || "—")}</p>
            ${item.obs ? `<p class="card-text"><strong>Obs.:</strong> ${escapeHtml(item.obs)}</p>` : ""}
            ${fotoMarkup(item, "card-foto")}
            <div class="card-status">ID ${escapeHtml(item.id)} · Prioridade: ${escapeHtml(item.prioridade || "—")}</div>
            <div class="item-actions">
              <button type="button" class="btn-expand${state.expanded[item.id] ? " is-open" : ""}" data-expand="${escapeAttr(item.id)}">
                ${state.expanded[item.id] ? "Ocultar" : "Linha do tempo"}
              </button>
              ${editActionButton(item.id)}
            </div>
            ${state.expanded[item.id] ? timelineMarkup(item.id) : ""}
          </div>
        </article>`;
      })
      .join("");

    renderCardsPager(total, page, totalPages);

    pageItems.forEach((item) => {
      if (state.expanded[item.id] && !state.historicoCache[item.id]) {
        loadHistorico(item.id);
      }
    });
  }

  function renderTable() {
    const items = filteredItems();
    el.resultCount.textContent = `${items.length} item(ns) exibido(s)`;
    document.querySelectorAll("#mainTable thead th[data-key]").forEach((th) => {
      th.classList.toggle("sorted", th.dataset.key === state.sortKey);
    });
    if (!items.length) {
      el.tableBody.innerHTML =
        '<tr><td colspan="11" class="empty">Nenhuma entrega encontrada com os filtros atuais.</td></tr>';
      return;
    }
    el.tableBody.innerHTML = items
      .map((item) => {
        const late = item.atrasado ? "late" : "";
        const rowCls = item.atrasado ? "overdue" : "";
        const prio = item.prioridade || "—";
        const prioCls = item.prioridade ? `prio-${item.prioridade}` : "";
        return `
        <tr class="${rowCls}">
          <td class="id">#${escapeHtml(item.id)}</td>
          <td>${escapeHtml(item.bloco_label || item.frente || "—")}</td>
          <td class="entrega">${escapeHtml(item.entrega || "—")}</td>
          <td>${escapeHtml(item.responsavel || "—")}</td>
          <td>${escapeHtml(item.parceiros || "—")}</td>
          <td><span class="prio-dot ${prioCls}">${escapeHtml(prio)}</span></td>
          <td>${fmtDate(item.data_mudanca || item.inicio)}</td>
          <td class="prazo ${late}">${fmtDate(item.prazo)}${item.atrasado ? " ⚠" : ""}</td>
          <td><span class="${statusChipClass(item.status)}">${escapeHtml(item.status || "—")}</span></td>
          <td class="next">${escapeHtml(item.proxima || "—")}</td>
          <td>${item.foto_url ? fotoMarkup(item, "table-foto") : "—"}</td>
          <td>${editActionButton(item.id)}</td>
        </tr>`;
      })
      .join("");
  }

  function renderViews() {
    const items = filteredItems();
    el.resultCount.textContent = `${items.length} item(ns) exibido(s)`;
    syncConcluidosButton();
    document.querySelectorAll(".view-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === state.view);
    });
    const cardsSection = el.cards.closest(".cards-section") || el.cards;
    if (state.view === "table") {
      cardsSection.classList.add("is-hidden");
      el.tablePanel.classList.remove("is-hidden");
      if (el.cardsPager) el.cardsPager.hidden = true;
      renderTable();
    } else {
      el.tablePanel.classList.add("is-hidden");
      cardsSection.classList.remove("is-hidden");
      renderCards();
    }
  }

  function parseItemDate(value) {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const br = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return null;
  }

  function renderGantt() {
    if (!el.ganttRoot) return;
    const frentes = (state.frentes || []).filter(
      (f) => (f.frente || "") !== "Sem frente"
    );
    if (!frentes.length) {
      el.ganttRoot.innerHTML =
        '<div class="empty">Sem frentes com dados para o cronograma.</div>';
      if (el.ganttNote) el.ganttNote.hidden = true;
      return;
    }

    const ranges = frentes.map((f) => {
      const itens = state.itens.filter(
        (i) => (i.frente || "Sem frente") === f.frente
      );
      let start = null;
      let end = null;
      itens.forEach((item) => {
        const candidates = [
          parseItemDate(item.inicio),
          parseItemDate(item.data_mudanca),
          parseItemDate(item.prazo),
        ].filter(Boolean);
        candidates.forEach((d) => {
          if (!start || d < start) start = d;
          if (!end || d > end) end = d;
        });
        const prazo = parseItemDate(item.prazo);
        if (prazo && (!end || prazo > end)) end = prazo;
      });
      return { frente: f, start, end, bloco: FRENTE_BLOCO_UI[f.frente] || f.bloco };
    });

    const withDates = ranges.filter((r) => r.start && r.end);
    const projetoInicio = parseItemDate(state.projetoMeta.inicio_projeto || "");
    const milestone = parseItemDate(
      IS_LEGACY_HOME
        ? state.kpis.inauguracao ||
            state.projetoMeta.prazo_conclusao ||
            "2026-11-26"
        : state.projetoMeta.prazo_conclusao || state.kpis.prazo_conclusao || ""
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let rangeStart;
    if (projetoInicio) {
      rangeStart = new Date(projetoInicio);
    } else if (withDates.length) {
      rangeStart = new Date(Math.min(...withDates.map((r) => r.start.getTime())));
    } else {
      rangeStart = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    let rangeEnd = withDates.length
      ? new Date(Math.max(...withDates.map((r) => r.end.getTime())))
      : new Date(today.getFullYear(), today.getMonth() + 3, 1);
    if (withDates.length && projetoInicio) {
      const minAction = Math.min(...withDates.map((r) => r.start.getTime()));
      if (minAction < rangeStart.getTime()) rangeStart = new Date(minAction);
    }
    if (milestone) {
      if (milestone < rangeStart) rangeStart = new Date(milestone);
      if (milestone > rangeEnd) rangeEnd = new Date(milestone);
    }
    if (!projetoInicio) {
      rangeStart = new Date(rangeStart.getTime() - 7 * 86400000);
    }
    rangeEnd = new Date(rangeEnd.getTime() + 14 * 86400000);
    const totalMs = Math.max(rangeEnd - rangeStart, 86400000);

    const months = [];
    const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (cursor <= rangeEnd) {
      months.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    function pct(date) {
      return Math.max(0, Math.min(100, ((date - rangeStart) / totalMs) * 100));
    }

    const monthHeaders = months
      .map(
        (m) =>
          `<div class="gantt-month">${m.toLocaleDateString("pt-BR", {
            month: "short",
            year: "2-digit",
          })}</div>`
      )
      .join("");

    const todayPct = pct(today);
    const milestonePct = milestone ? pct(milestone) : null;

    const rows = ranges
      .map((r) => {
        const visual = blocoVisual(r.bloco);
        const nome = frenteDisplayName(r.frente.frente);
        let bar = '<div class="gantt-bar gantt-bar-empty" title="Sem datas suficientes"></div>';
        if (r.start && r.end) {
          const left = pct(r.start);
          const right = pct(r.end);
          const width = Math.max(2, right - left);
          bar = `<div class="gantt-bar tone-${visual.tone}" style="left:${left}%;width:${width}%;" title="${escapeAttr(
            nome
          )}: ${fmtDate(
            `${r.start.getFullYear()}-${String(r.start.getMonth() + 1).padStart(2, "0")}-${String(r.start.getDate()).padStart(2, "0")}`
          )} → ${fmtDate(
            `${r.end.getFullYear()}-${String(r.end.getMonth() + 1).padStart(2, "0")}-${String(r.end.getDate()).padStart(2, "0")}`
          )}"></div>`;
        }
        return `
          <div class="gantt-row">
            <div class="gantt-label">${escapeHtml(nome)}</div>
            <div class="gantt-track">${bar}</div>
          </div>`;
      })
      .join("");

    if (el.ganttNote) el.ganttNote.hidden = false;

    el.ganttRoot.innerHTML = `
      <div class="gantt" style="--gantt-cols:${months.length}">
        <div class="gantt-months">
          <div></div>${monthHeaders}
        </div>
        <div class="gantt-body">
          ${
            milestonePct != null
              ? `<div class="gantt-marker gantt-marker-milestone" style="left:calc(var(--gantt-label) + (100% - var(--gantt-label)) * ${milestonePct / 100})" title="Marco do projeto"><span>marco</span></div>`
              : ""
          }
          <div class="gantt-marker gantt-marker-today" style="left:calc(var(--gantt-label) + (100% - var(--gantt-label)) * ${todayPct / 100})" title="Hoje"><span>hoje</span></div>
          ${rows}
        </div>
      </div>`;
  }

  function renderAll() {
    el.atualizadoEm.textContent = fmtDateTime(state.atualizadoEm);
    renderRing();
    renderKpis();
    renderBlocks();
    renderAtencao();
    renderGantt();
    renderTabs();
    renderViews();
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replaceAll("'", "&#39;");
  }

  function fillFrenteSelect(selected) {
    if (!el.editFrente) return;
    if (el.editFrente.tagName === "INPUT") {
      el.editFrente.value = selected || "";
      const list = document.getElementById("frentesSugestoes");
      if (list) {
        const fromData = state.itens.map((i) => i.frente).filter(Boolean);
        const frentes = [...new Set(fromData)].sort((a, b) =>
          a.localeCompare(b, "pt-BR")
        );
        list.innerHTML = frentes
          .map((f) => `<option value="${escapeAttr(f)}"></option>`)
          .join("");
      }
      return;
    }
    const fromData = state.itens.map((i) => i.frente).filter(Boolean);
    const base = IS_LEGACY_HOME ? FRENTES_PADRAO : [];
    const frentes = [...new Set([...base, ...fromData])].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
    if (selected && !frentes.includes(selected)) frentes.unshift(selected);
    if (!frentes.length) frentes.push("Geral");
    el.editFrente.innerHTML = frentes
      .map(
        (f) =>
          `<option value="${escapeAttr(f)}"${f === selected ? " selected" : ""}>${escapeHtml(f)}</option>`
      )
      .join("");
  }

  function fillStatusSelect(selected) {
    const value = selected || "Não iniciado";
    el.editStatus.innerHTML = STATUS_OPTIONS.map(
      (s) =>
        `<option value="${s}"${value === s ? " selected" : ""}>${s}</option>`
    ).join("");
    if (value && ![...el.editStatus.options].some((o) => o.value === value)) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      opt.selected = true;
      el.editStatus.appendChild(opt);
    }
  }

  function fotoMarkup(item, className) {
    if (!item.foto_url) return "";
    return `<a href="${escapeAttr(item.foto_url)}" target="_blank" rel="noopener">
      <img class="${className}" src="${escapeAttr(item.foto_url)}" alt="Foto da movimentação" loading="lazy" />
    </a>`;
  }

  function isMobileCamera() {
    return window.matchMedia(
      "(max-width: 768px), (pointer: coarse), (hover: none)"
    ).matches;
  }

  function syncFotoCaptureMode() {
    if (!el.editFoto) return;
    const mobile = isMobileCamera();
    if (mobile) {
      el.editFoto.setAttribute("capture", "environment");
      el.editFoto.setAttribute("accept", "image/*");
      if (el.btnTirarFoto) el.btnTirarFoto.textContent = "Tirar foto";
      if (el.fotoHint) {
        el.fotoHint.textContent =
          "Opcional · abre a câmera do aparelho · até 5 MB";
      }
    } else {
      el.editFoto.removeAttribute("capture");
      el.editFoto.setAttribute(
        "accept",
        "image/jpeg,image/png,image/webp,image/gif"
      );
      if (el.btnTirarFoto) el.btnTirarFoto.textContent = "Escolher foto";
      if (el.fotoHint) {
        el.fotoHint.textContent =
          "Opcional · JPG, PNG, WEBP ou GIF · até 5 MB";
      }
    }
  }

  function resetFotoField(existingUrl) {
    el.editFoto.value = "";
    el.editRemoverFoto.checked = false;
    el.editRemoverFoto.disabled = !existingUrl;
    syncFotoCaptureMode();
    if (existingUrl) {
      el.fotoPreview.src = existingUrl;
      el.fotoPreviewWrap.hidden = false;
    } else {
      el.fotoPreview.removeAttribute("src");
      el.fotoPreviewWrap.hidden = true;
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Falha ao ler a foto"));
      reader.readAsDataURL(file);
    });
  }

  async function formPayload() {
    const payload = {
      entrega: el.editEntrega.value.trim(),
      frente: el.editFrente.value,
      responsavel: el.editResponsavel.value.trim(),
      parceiros: el.editParceiros.value.trim(),
      nup: el.editNup.value.trim(),
      status: el.editStatus.value,
      prioridade: el.editPrioridade.value,
      data_mudanca: el.editDataMudanca.value || "",
      inicio: el.editDataMudanca.value || "",
      prazo: el.editPrazo.value || "",
      pct: el.editPct.value === "" ? "" : String(el.editPct.value),
      proxima: el.editProxima.value.trim(),
      obs: el.editObs.value.trim(),
    };

    const file = el.editFoto.files && el.editFoto.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("A foto deve ter no máximo 5 MB.");
      }
      payload.foto_base64 = await readFileAsDataUrl(file);
      payload.foto_nome = file.name || "foto.jpg";
    } else if (el.editRemoverFoto.checked) {
      payload.remover_foto = true;
    }
    return payload;
  }

  function openEdit(id) {
    const item = state.itens.find((i) => String(i.id) === String(id));
    if (!item) return;
    el.editMode.value = "edit";
    el.editId.value = item.id;
    el.editEyebrow.textContent = "Editar ação";
    el.editTitle.textContent = item.entrega || `Item ${item.id}`;
    el.editSubmit.textContent = "Salvar";
    el.editDelete.style.display = "";
    if (el.editExcluir) el.editExcluir.style.display = "";
    fillFrenteSelect(item.frente || "");
    fillStatusSelect(item.status || "");
    el.editEntrega.value = item.entrega || "";
    el.editResponsavel.value = item.responsavel || "";
    el.editParceiros.value = item.parceiros || "";
    el.editNup.value = item.nup || "";
    el.editPrioridade.value = item.prioridade || "";
    el.editDataMudanca.value = toDateInput(item.data_mudanca || item.inicio || "");
    el.editPrazo.value = toDateInput(item.prazo || "");
    el.editPct.value = item.pct ?? "";
    el.editProxima.value = item.proxima || "";
    el.editObs.value = item.obs || "";
    resetFotoField(item.foto_url || "");
    el.dialog.showModal();
  }

  function openCreate() {
    el.editMode.value = "create";
    el.editId.value = "";
    el.editEyebrow.textContent = "Nova ação";
    el.editTitle.textContent = "Incluir nova entrega no monitoramento";
    el.editSubmit.textContent = "Incluir ação";
    el.editDelete.style.display = "none";
    if (el.editExcluir) el.editExcluir.style.display = "none";
    fillFrenteSelect(IS_LEGACY_HOME ? FRENTES_PADRAO[0] : "");
    fillStatusSelect("Não iniciado");
    el.editEntrega.value = "";
    el.editResponsavel.value = "";
    el.editParceiros.value = "";
    el.editNup.value = "";
    el.editPrioridade.value = "";
    el.editDataMudanca.value = "";
    el.editPrazo.value = "";
    el.editPct.value = "";
    el.editProxima.value = "";
    el.editObs.value = "";
    resetFotoField("");
    el.dialog.showModal();
    el.editEntrega.focus();
  }

  function toDateInput(value) {
    if (!value) return "";
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const br = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    return "";
  }

  async function loadPainel() {
    const res = await fetch(apiPainel(), { cache: "no-store" });
    if (res.status === 401) {
      location.replace("/login.html");
      return;
    }
    if (res.status === 403) {
      location.replace("/portfolio.html");
      return;
    }
    if (!res.ok) throw new Error("Falha ao carregar painel");
    const data = await res.json();
    applyPayload(data);
  }

  async function loadSession() {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const user = data.usuario;
    if (!user) {
      location.replace("/login.html");
      return;
    }
    state.user = user;
    if (el.userChip) {
      el.userChip.hidden = false;
      const papel = user.papel_label || user.papel || "";
      el.userChip.textContent = papel
        ? `${user.nome || user.usuario} · ${papel}`
        : user.nome || user.usuario;
    }
    if (el.linkAdmin) {
      el.linkAdmin.hidden = user.papel !== "admin";
    }
    if (el.btnNovaAcao) {
      el.btnNovaAcao.hidden = !canEdit();
    }
  }

  function applyPayload(data) {
    state.itens = data.itens || [];
    state.kpis = data.kpis || {};
    state.frentes = data.frentes || [];
    state.atencao = data.atencao || [];
    state.atualizadoEm = data.atualizado_em || "";
    state.projetoMeta = {
      id: data.projeto_id || PROJETO_ID,
      nome: data.projeto || "",
      descricao: data.descricao || "",
      gerente_usuario_id: data.gerente_usuario_id,
      gerente_nome: data.gerente_nome || "",
      inicio_projeto: data.inicio_projeto || "",
      prazo_conclusao: data.prazo_conclusao || "",
      meu_papel: data.meu_papel || "",
    };
    if (el.projTitle && state.projetoMeta.nome) {
      el.projTitle.textContent = state.projetoMeta.nome;
    }
    if (!IS_LEGACY_HOME && state.projetoMeta.nome) {
      document.title = `${state.projetoMeta.nome} · SET Projetos`;
    }
    if (el.prazoLabel) {
      el.prazoLabel.textContent = IS_LEGACY_HOME ? "Inauguração" : "Prazo";
    }
    if (el.prazoData) {
      const raw = IS_LEGACY_HOME
        ? state.kpis.inauguracao || "2026-11-26"
        : state.projetoMeta.prazo_conclusao || state.kpis.prazo_conclusao || "";
      el.prazoData.textContent = fmtDate(raw);
    }
    if (el.projMetaLine) {
      const g = state.projetoMeta.gerente_nome || "não definido";
      el.projMetaLine.textContent = `Gerente: ${g} · Prazo: ${fmtDate(
        state.projetoMeta.prazo_conclusao
      )}`;
    }
    const podeEditarProj =
      (state.user && state.user.papel === "admin") ||
      state.projetoMeta.meu_papel === "admin";
    if (el.btnEditarProjeto) {
      el.btnEditarProjeto.hidden = !podeEditarProj || IS_LEGACY_HOME;
      if (!el.btnEditarProjeto.hidden) {
        el.btnEditarProjeto.textContent = state.projetoMeta.gerente_nome
          ? "Editar título / gerente"
          : "Atribuir gerente / editar título";
      }
    }
    renderFilters();
    renderAll();
  }

  async function deleteAcao() {
    if (!canEdit()) {
      alert("Seu perfil é Consulta: apenas visualização.");
      return;
    }
    const id = el.editId.value;
    if (!id) return;
    const titulo = el.editEntrega.value.trim() || `Item ${id}`;
    if (
      !confirm(
        `Excluir permanentemente esta ação?\n\n${titulo}\n\nEsta operação não pode ser desfeita.`
      )
    ) {
      return;
    }
    const res = await fetch(apiItem(id), {
      method: "DELETE",
    });
    if (!res.ok) {
      let msg = "Não foi possível excluir a ação.";
      try {
        const err = await res.json();
        if (err.erro) msg = err.erro;
      } catch (_) {}
      alert(msg);
      return;
    }
    el.dialog.close();
    delete state.historicoCache[id];
    delete state.expanded[id];
    await loadPainel();
  }

  async function clearProxima() {
    const id = el.editId.value;
    if (!id) return;
    if (!el.editProxima.value.trim()) {
      alert("Não há providência para limpar.");
      return;
    }
    if (!confirm("Limpar apenas a providência desta ação?\n\nA ação continua no painel.")) {
      return;
    }
    el.editProxima.value = "";
    let payload;
    try {
      payload = await formPayload();
    } catch (err) {
      alert(err.message || "Não foi possível preparar os dados.");
      return;
    }
    const res = await fetch(apiItem(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      alert("Não foi possível limpar a providência.");
      return;
    }
    el.dialog.close();
    delete state.historicoCache[id];
    await loadPainel();
  }

  async function deleteHistoricoEvent(itemId, histId) {
    if (!confirm("Excluir este evento da linha do tempo?")) {
      return;
    }
    const res = await fetch(apiHistoricoEvento(itemId, histId), {
      method: "DELETE",
    });
    if (!res.ok) {
      alert("Não foi possível excluir o evento.");
      return;
    }
    const data = await res.json();
    state.historicoCache[itemId] = data.historico || [];
    renderAtencao();
    if (state.view === "cards") renderCards();
  }

  async function saveItem(event) {
    event.preventDefault();
    const mode = el.editMode.value;
    let payload;
    try {
      payload = await formPayload();
    } catch (err) {
      alert(err.message || "Não foi possível preparar os dados.");
      return;
    }
    if (!payload.entrega) {
      alert("Informe a entrega/ação.");
      return;
    }

    if (mode === "create") {
      const res = await fetch(apiItens(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = "Não foi possível incluir a ação.";
        try {
          const err = await res.json();
          if (err.erro) msg = err.erro;
        } catch (_) {}
        alert(msg);
        return;
      }
      el.dialog.close();
      await loadPainel();
      return;
    }

    const id = el.editId.value;
    const res = await fetch(apiItem(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let msg = "Não foi possível salvar as alterações.";
      try {
        const err = await res.json();
        if (err.erro) msg = err.erro;
      } catch (_) {}
      alert(msg);
      return;
    }
    el.dialog.close();
    delete state.historicoCache[id];
    await loadPainel();
  }

  function setBloco(frente) {
    state.bloco = frente || "todas";
    state.cardsPage = 1;
    renderTabs();
    renderBlocks();
    renderViews();
  }

  el.tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-frente]");
    if (!btn) return;
    setBloco(btn.dataset.frente);
  });

  el.blocks.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-frente]");
    if (!btn) return;
    const frente = btn.dataset.frente;
    setBloco(state.bloco === frente ? "todas" : frente);
  });

  const viewToggle = document.querySelector(".view-toggle");
  if (viewToggle) {
    viewToggle.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-view]");
      if (!btn) return;
      state.view = btn.dataset.view;
      state.cardsPage = 1;
      renderViews();
    });
  }

  document.querySelectorAll("#mainTable thead th[data-key]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (state.sortKey === key) state.sortDir *= -1;
      else {
        state.sortKey = key;
        state.sortDir = 1;
      }
      renderViews();
    });
  });

  el.atencaoTabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-atencao-tab]");
    if (!btn) return;
    state.atencaoTab = btn.dataset.atencaoTab;
    renderAtencao();
  });

  el.cards.addEventListener("click", (e) => {
    const delHist = e.target.closest("[data-del-hist]");
    if (delHist) {
      deleteHistoricoEvent(delHist.dataset.delHist, delHist.dataset.histId);
      return;
    }
    const expandBtn = e.target.closest("[data-expand]");
    if (expandBtn) {
      toggleExpand(expandBtn.dataset.expand);
      return;
    }
    const btn = e.target.closest("[data-edit]");
    if (!btn) return;
    openEdit(btn.dataset.edit);
  });

  if (el.cardsPager) {
    el.cardsPager.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-page]");
      if (!btn || btn.disabled) return;
      const items = sortByTempoAsc(filteredItems());
      const totalPages = Math.max(1, Math.ceil(items.length / CARDS_PER_PAGE));
      const raw = btn.dataset.page;
      let page = state.cardsPage;
      if (raw === "prev") page -= 1;
      else if (raw === "next") page += 1;
      else page = Number(raw) || 1;
      setCardsPage(page, totalPages);
    });
  }

  el.tableBody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit]");
    if (!btn) return;
    openEdit(btn.dataset.edit);
  });

  el.atencao.addEventListener("click", (e) => {
    const delHist = e.target.closest("[data-del-hist]");
    if (delHist) {
      deleteHistoricoEvent(delHist.dataset.delHist, delHist.dataset.histId);
      return;
    }
    const expandBtn = e.target.closest("[data-expand]");
    if (expandBtn) {
      toggleExpand(expandBtn.dataset.expand);
      return;
    }
    const btn = e.target.closest("[data-edit]");
    if (!btn) return;
    openEdit(btn.dataset.edit);
  });

  el.filterStatus.addEventListener("change", () => {
    state.status = el.filterStatus.value;
    state.cardsPage = 1;
    renderViews();
  });
  el.filterPrioridade.addEventListener("change", () => {
    state.prioridade = el.filterPrioridade.value;
    state.cardsPage = 1;
    renderViews();
  });
  el.filterResponsavel.addEventListener("change", () => {
    state.responsavel = el.filterResponsavel.value;
    state.cardsPage = 1;
    renderViews();
  });
  el.filterSearch.addEventListener("input", () => {
    state.search = el.filterSearch.value;
    state.cardsPage = 1;
    renderViews();
  });

  el.form.addEventListener("submit", saveItem);
  el.editCancel.addEventListener("click", () => el.dialog.close());
  el.editDelete.addEventListener("click", clearProxima);
  if (el.editExcluir) {
    el.editExcluir.addEventListener("click", deleteAcao);
  }
  el.btnNovaAcao.addEventListener("click", openCreate);
  if (el.btnToggleConcluidos) {
    el.btnToggleConcluidos.addEventListener("click", () => {
      state.showConcluidos = !state.showConcluidos;
      state.cardsPage = 1;
      renderKpis();
      renderViews();
    });
  }
  if (el.editFoto) {
    syncFotoCaptureMode();
    window.addEventListener("resize", syncFotoCaptureMode);
    el.editFoto.addEventListener("change", () => {
      const file = el.editFoto.files && el.editFoto.files[0];
      if (!file) return;
      el.editRemoverFoto.checked = false;
      const url = URL.createObjectURL(file);
      el.fotoPreview.src = url;
      el.fotoPreviewWrap.hidden = false;
      el.editRemoverFoto.disabled = false;
    });
  }
  if (el.btnTirarFoto && el.editFoto) {
    el.btnTirarFoto.addEventListener("click", () => {
      syncFotoCaptureMode();
      el.editFoto.click();
    });
  }
  if (el.editRemoverFoto) {
    el.editRemoverFoto.addEventListener("change", () => {
      if (el.editRemoverFoto.checked) {
        el.editFoto.value = "";
      }
    });
  }
  if (el.btnSair) {
    el.btnSair.addEventListener("click", async () => {
      await fetch("/api/logout", { method: "POST" });
      location.replace("/login.html");
    });
  }
  if (el.btnVoltar) {
    el.btnVoltar.addEventListener("click", () => {
      if (window.history.length > 1 && document.referrer) {
        try {
          const ref = new URL(document.referrer);
          if (ref.origin === location.origin) {
            history.back();
            return;
          }
        } catch {
          /* ignore */
        }
      }
      location.href = "/portfolio.html";
    });
  }
  if (el.btnTopo) {
    el.btnTopo.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  async function ensureUsuariosOpcoes() {
    if (state.usuariosOpcoes && state.usuariosOpcoes.length) return;
    const res = await fetch("/api/usuarios/opcoes", { cache: "no-store" });
    if (!res.ok) throw new Error("Sem permissão para listar usuários");
    const data = await res.json();
    state.usuariosOpcoes = data.usuarios || [];
  }

  if (el.btnEditarProjeto && el.projDialog) {
    el.btnEditarProjeto.addEventListener("click", async () => {
      try {
        await ensureUsuariosOpcoes();
      } catch (err) {
        alert(err.message || "Erro ao carregar usuários");
        return;
      }
      const p = state.projetoMeta || {};
      el.projNome.value = p.nome || "";
      el.projDescricao.value = p.descricao || "";
      if (el.projInicio) el.projInicio.value = (p.inicio_projeto || "").slice(0, 10);
      el.projPrazo.value = (p.prazo_conclusao || "").slice(0, 10);
      const opts = ['<option value="">— Sem gerente definido —</option>'];
      state.usuariosOpcoes.forEach((u) => {
        opts.push(
          `<option value="${u.id}"${
            String(u.id) === String(p.gerente_usuario_id || "") ? " selected" : ""
          }>${escapeHtml(u.nome || u.usuario)}</option>`
        );
      });
      el.projGerente.innerHTML = opts.join("");
      if (el.projError) el.projError.hidden = true;
      el.projDialog.showModal();
    });
  }

  if (el.projCancel) {
    el.projCancel.addEventListener("click", () => el.projDialog.close());
  }

  if (el.projForm) {
    el.projForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (el.projError) el.projError.hidden = true;
      try {
        const res = await fetch(
          `/api/projetos/${encodeURIComponent(PROJETO_ID)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nome: el.projNome.value.trim(),
              descricao: el.projDescricao.value.trim(),
              inicio_projeto: el.projInicio ? el.projInicio.value || "" : "",
              prazo_conclusao: el.projPrazo.value || "",
              gerente_usuario_id: el.projGerente.value
                ? Number(el.projGerente.value)
                : null,
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.erro || "Erro ao salvar projeto");
        el.projDialog.close();
        await loadPainel();
      } catch (err) {
        if (el.projError) {
          el.projError.textContent = err.message || "Erro ao salvar";
          el.projError.hidden = false;
        } else {
          alert(err.message || "Erro ao salvar");
        }
      }
    });
  }

  loadSession()
    .then(() => loadPainel())
    .catch((err) => {
      console.error(err);
      if (el.cards) {
        el.cards.innerHTML =
          '<div class="empty">Erro ao carregar o painel. Verifique se o servidor está em execução.</div>';
      }
    });
})();
