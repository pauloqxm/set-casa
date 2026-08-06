(() => {
  const BLOCOS = [
    { id: "todas", label: "Todas" },
    { id: "reforma", label: "Reforma" },
    { id: "restauro", label: "Restauro" },
    { id: "aquisicao", label: "Aquisição" },
    { id: "comunicacao", label: "Comunicação" },
    { id: "inauguracao", label: "Inauguração" },
    { id: "parcerias", label: "Parcerias" },
    { id: "mudanca", label: "Mudança" },
    { id: "outras", label: "Outras" },
  ];

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
    expanded: {},
    historicoCache: {},
    user: null,
  };

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
    userChip: document.getElementById("userChip"),
    linkAdmin: document.getElementById("linkAdmin"),
    btnSair: document.getElementById("btnSair"),
    btnTopo: document.getElementById("btnTopo"),
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
        if (state.bloco !== "todas" && item.bloco !== state.bloco) return false;
        if (state.status && item.status !== state.status) return false;
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
    const pct = Number(state.kpis.progresso_pct || 0);
    const r = 34;
    const circ = 2 * Math.PI * r;
    el.ringProgress.setAttribute("stroke-dasharray", String(circ));
    el.ringProgress.setAttribute(
      "stroke-dashoffset",
      String(circ - (circ * Math.max(0, Math.min(100, pct))) / 100)
    );
    el.ringPct.textContent = `${pct}%`;

    const dias = state.kpis.dias_para_inauguracao;
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
    const cards = [
      {
        head: "Total",
        value: k.total ?? "—",
        text: "Ações e entregas monitoradas",
        status: `ESCOPO ATIVO`,
      },
      {
        head: "Concluídas",
        value: k.concluidos ?? 0,
        text: "Itens finalizados",
        status: `PROGRESSO ${k.progresso_pct ?? 0}%`,
        hero: true,
      },
      {
        head: "Andamento",
        value: k.em_andamento ?? 0,
        text: "Em execução agora",
        status: "STATUS",
      },
      {
        head: "Terceiros",
        value: k.aguardando_terceiros ?? 0,
        text: "Aguardando ação externa",
        status: "DEPENDÊNCIA",
      },
      {
        head: "Não iniciadas",
        value: k.nao_iniciados ?? 0,
        text: "Ainda sem início formal",
        status: "FILA",
      },
      {
        head: "Críticas / Atraso",
        value: `${k.criticas_abertas ?? 0} / ${k.atrasadas ?? 0}`,
        text: "Críticas abertas e prazos vencidos",
        status: "ATENÇÃO",
      },
    ];
    el.kpis.innerHTML = cards
      .map(
        (c) => `
      <article class="card">
        <div class="card-head">${c.head}</div>
        <div class="card-body">
          <p class="card-value${c.hero ? " hero" : ""}">${c.value}</p>
          <p class="card-text">${c.text}</p>
          <div class="card-status">${c.status}</div>
        </div>
      </article>`
      )
      .join("");
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
        const active = state.bloco === f.bloco ? " is-active" : "";
        return `
        <button type="button" class="block${active}" data-bloco="${escapeAttr(f.bloco)}">
          <div class="block-top">
            <div>
              <div class="block-name">${escapeHtml(f.frente)}</div>
              <div class="block-alt">${escapeHtml(f.bloco_label || "")}</div>
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
            <b>${f.concluidos}/${f.total}</b>
          </div>
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
        const chips = [];
        if (isCritica(item))
          chips.push('<span class="chip chip-orange">Crítica</span>');
        else if ((item.prioridade || "") === "Alta")
          chips.push('<span class="chip chip-blue">Alta</span>');
        if (item.atrasado)
          chips.push('<span class="chip chip-orange">Atrasado</span>');
        if (isTerceiros(item))
          chips.push('<span class="chip chip-orange">Terceiros</span>');
        const days = daysLabel(item);
        const critClass = isCritica(item) ? " is-critica" : "";
        const open = !!state.expanded[item.id];
        return `
        <article class="attention-item${critClass}${open ? " is-open" : ""}" data-item-id="${escapeAttr(item.id)}">
          <div>${chips.join(" ")}</div>
          <div class="attention-main">
            <strong>${escapeHtml(item.entrega || "Sem título")}</strong>
            <p>${escapeHtml(item.proxima || "Sem próxima providência registrada")}</p>
            ${fotoMarkup(item, "attention-foto")}
            <div class="meta">
              #${escapeHtml(item.id)} · ${escapeHtml(item.responsavel || "Sem responsável")} · ${escapeHtml(item.bloco_label || item.frente || "")}
            </div>
          </div>
          ${days.text ? `<div class="days-label ${days.cls}">${escapeHtml(days.text)}</div>` : "<div></div>"}
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
      const res = await fetch(
        `/api/itens/${encodeURIComponent(itemId)}/historico`,
        { cache: "no-store" }
      );
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
    el.tabs.innerHTML = BLOCOS.map(
      (b) => `
      <button type="button" class="tab${state.bloco === b.id ? " is-active" : ""}" data-bloco="${b.id}" role="tab" aria-selected="${state.bloco === b.id}">
        ${b.label}
      </button>`
    ).join("");
  }

  function renderCards() {
    const items = filteredItems();
    el.resultCount.textContent = `${items.length} item(ns) exibido(s)`;
    if (!items.length) {
      el.cards.innerHTML =
        '<div class="empty">Nenhuma entrega encontrada com os filtros atuais.</div>';
      return;
    }
    el.cards.innerHTML = items
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

    items.forEach((item) => {
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
    document.querySelectorAll(".view-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === state.view);
    });
    if (state.view === "table") {
      el.cards.classList.add("is-hidden");
      el.tablePanel.classList.remove("is-hidden");
      renderTable();
    } else {
      el.tablePanel.classList.add("is-hidden");
      el.cards.classList.remove("is-hidden");
      renderCards();
    }
  }

  function renderAll() {
    el.atualizadoEm.textContent = fmtDateTime(state.atualizadoEm);
    renderRing();
    renderKpis();
    renderBlocks();
    renderAtencao();
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
    const fromData = state.itens.map((i) => i.frente).filter(Boolean);
    const frentes = [...new Set([...FRENTES_PADRAO, ...fromData])].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
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
    fillFrenteSelect(FRENTES_PADRAO[0]);
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
    const res = await fetch("/api/painel", { cache: "no-store" });
    if (res.status === 401) {
      location.replace("/login.html");
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
    const res = await fetch(`/api/itens/${encodeURIComponent(id)}`, {
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
    const res = await fetch(`/api/itens/${encodeURIComponent(id)}`, {
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
    const res = await fetch(
      `/api/itens/${encodeURIComponent(itemId)}/historico/${encodeURIComponent(histId)}`,
      { method: "DELETE" }
    );
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
      const res = await fetch("/api/itens", {
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
    const res = await fetch(`/api/itens/${encodeURIComponent(id)}`, {
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

  function setBloco(bloco) {
    state.bloco = bloco || "todas";
    renderTabs();
    renderBlocks();
    renderViews();
  }

  el.tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-bloco]");
    if (!btn) return;
    setBloco(btn.dataset.bloco);
  });

  el.blocks.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-bloco]");
    if (!btn) return;
    const bloco = btn.dataset.bloco;
    setBloco(state.bloco === bloco ? "todas" : bloco);
  });

  document.querySelector(".view-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn) return;
    state.view = btn.dataset.view;
    renderViews();
  });

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
    renderViews();
  });
  el.filterPrioridade.addEventListener("change", () => {
    state.prioridade = el.filterPrioridade.value;
    renderViews();
  });
  el.filterResponsavel.addEventListener("change", () => {
    state.responsavel = el.filterResponsavel.value;
    renderViews();
  });
  el.filterSearch.addEventListener("input", () => {
    state.search = el.filterSearch.value;
    renderViews();
  });

  el.form.addEventListener("submit", saveItem);
  el.editCancel.addEventListener("click", () => el.dialog.close());
  el.editDelete.addEventListener("click", clearProxima);
  if (el.editExcluir) {
    el.editExcluir.addEventListener("click", deleteAcao);
  }
  el.btnNovaAcao.addEventListener("click", openCreate);
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
  if (el.btnTopo) {
    el.btnTopo.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  loadSession()
    .then(() => loadPainel())
    .catch((err) => {
      console.error(err);
      el.cards.innerHTML =
        '<div class="empty">Erro ao carregar o painel. Verifique se o servidor está em execução.</div>';
    });
})();
