(() => {
  const el = {
    userChip: document.getElementById("userChip"),
    linkAdmin: document.getElementById("linkAdmin"),
    linkProjetos: document.getElementById("linkProjetos"),
    btnSair: document.getElementById("btnSair"),
    btnVoltar: document.getElementById("btnVoltar"),
    btnNovaTarefa: document.getElementById("btnNovaTarefa"),
    filterForm: document.getElementById("filterForm"),
    btnLimparFiltros: document.getElementById("btnLimparFiltros"),
    filtroPrazoDe: document.getElementById("filtroPrazoDe"),
    filtroPrazoAte: document.getElementById("filtroPrazoAte"),
    filtroProjetoWrap: document.getElementById("filtroProjetoWrap"),
    filtroProjeto: document.getElementById("filtroProjeto"),
    filtroStatus: document.getElementById("filtroStatus"),
    filtroPrioridade: document.getElementById("filtroPrioridade"),
    filtroResponsavel: document.getElementById("filtroResponsavel"),
    filtroOrigem: document.getElementById("filtroOrigem"),
    filtroOrdenar: document.getElementById("filtroOrdenar"),
    kpis: document.getElementById("kpis"),
    rankProjetos: document.getElementById("rankProjetos"),
    rankResponsaveis: document.getElementById("rankResponsaveis"),
    tarefasCards: document.getElementById("tarefasCards"),
    tarefasEmpty: document.getElementById("tarefasEmpty"),
    tarefasCount: document.getElementById("tarefasCount"),
    tarefasToast: document.getElementById("tarefasToast"),
    modal: document.getElementById("modalTarefa"),
    formTarefa: document.getElementById("formTarefa"),
    modalTitle: document.getElementById("modalTarefaTitle"),
    modalErro: document.getElementById("modalErro"),
    btnCancelarModal: document.getElementById("btnCancelarModal"),
    btnExcluirTarefa: document.getElementById("btnExcluirTarefa"),
    tarefaId: document.getElementById("tarefaId"),
    temProjeto: document.getElementById("temProjeto"),
    blocoProjeto: document.getElementById("blocoProjeto"),
    blocoOrigem: document.getElementById("blocoOrigem"),
    rowTemProjeto: document.getElementById("rowTemProjeto"),
    tarefaProjeto: document.getElementById("tarefaProjeto"),
    tarefaFrente: document.getElementById("tarefaFrente"),
    tarefaOrigem: document.getElementById("tarefaOrigem"),
    tarefaEntrega: document.getElementById("tarefaEntrega"),
    tarefaResponsavel: document.getElementById("tarefaResponsavel"),
    tarefaProxima: document.getElementById("tarefaProxima"),
    tarefaPrazo: document.getElementById("tarefaPrazo"),
    tarefaPrazoHora: document.getElementById("tarefaPrazoHora"),
    tarefaPrioridade: document.getElementById("tarefaPrioridade"),
    tarefaStatus: document.getElementById("tarefaStatus"),
    tarefaObs: document.getElementById("tarefaObs"),
  };

  const state = {
    user: null,
    tarefas: [],
    projetos: [],
    frentesByProjeto: {},
    origens: [],
    statusOptions: [],
    responsaveis: [],
    podeCriarInstitucional: false,
    editMode: false,
    editingItem: null,
  };

  const DONE = new Set(["concluído", "concluido"]);
  let toastTimer = null;

  function showToast(message) {
    if (!el.tarefasToast || !message) return;
    el.tarefasToast.textContent = message;
    el.tarefasToast.hidden = false;
    requestAnimationFrame(() => el.tarefasToast.classList.add("is-visible"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.tarefasToast.classList.remove("is-visible");
      el.tarefasToast.hidden = true;
    }, 3500);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  function fmtDate(value) {
    if (!value) return "—";
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return value;
  }

  function monthBounds(date = new Date()) {
    const y = date.getFullYear();
    const m = date.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const iso = (d) => d.toISOString().slice(0, 10);
    return { de: iso(first), ate: iso(last) };
  }

  function projetoHref(id) {
    return id === "casa-trabalhador" ? "/" : `/projeto/${encodeURIComponent(id)}`;
  }

  function statusChipClass(status) {
    const s = (status || "").toLowerCase();
    if (s.includes("conclu")) return "chip chip-green";
    if (s.includes("andamento")) return "chip chip-blue";
    if (s.includes("aguardando")) return "chip chip-orange";
    if (s.includes("sobrest")) return "chip chip-gray";
    return "chip";
  }

  function itemProgress(item) {
    const raw = item.pct;
    if (raw !== "" && raw != null) {
      const n = Number(String(raw).replace("%", "").replace(",", "."));
      if (!Number.isNaN(n)) return Math.min(100, Math.max(0, Math.round(n)));
    }
    if (DONE.has((item.status || "").toLowerCase())) return 100;
    return 0;
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      location.replace("/login.html");
      throw new Error("Não autenticado");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.erro || "Falha na requisição");
    }
    return data;
  }

  function filterQuery() {
    const params = new URLSearchParams();
    [
      "prazo_de",
      "prazo_ate",
      "projeto_id",
      "status",
      "prioridade",
      "responsavel",
      "origem",
      "ordenar",
    ].forEach((key) => {
      const node = el.filterForm.elements.namedItem(key);
      const value = node && "value" in node ? String(node.value || "").trim() : "";
      if (value) params.set(key, value);
    });
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  function syncFiltersToForm(filtro = {}) {
    Object.entries(filtro).forEach(([key, value]) => {
      const node = el.filterForm.elements.namedItem(key);
      if (node && "value" in node) node.value = value || "";
    });
    updateFilterVisibility();
  }

  function updateFilterVisibility() {
    const origemProjeto = el.filtroOrigem.value === "projeto";
    if (el.filtroProjetoWrap) el.filtroProjetoWrap.hidden = !origemProjeto;
    if (!origemProjeto && el.filtroProjeto) el.filtroProjeto.value = "";
  }

  function renderKpis(kpis) {
    if (!el.kpis || !kpis) return;
    const k = kpis;
    const pct = Number(k.progresso_pct || 0);
    const icons = {
      list:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 6h2v2H4V6zm0 5h2v2H4v-2zm0 5h2v2H4v-2zm4-10h12v2H8V6zm0 5h12v2H8v-2zm0 5h12v2H8v-2z"/></svg>',
      check:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.2 13.3 6-6-1.4-1.4-4.6 4.6-2.2-2.2-1.4 1.4 3.6 3.6z"/></svg>',
      chart:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 19h14v2H5v-2zm2-8h3v6H7v-6zm4-3h3v9h-3V8zm4 5h3v4h-3v-4z"/></svg>',
      clock:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10 10 10 0 0 0-10-10zm1 11H7v-2h4V7h2z"/></svg>',
      alert:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3 1 21h22L12 3zm0 6h2v5h-2V9zm0 7h2v2h-2v-2z"/></svg>',
    };

    function cardHtml(c) {
      const bar =
        c.bar != null
          ? `<div class="tarefas-kpi-bar" aria-hidden="true"><span style="width:${Math.min(100, Math.max(0, c.bar))}%"></span></div>`
          : "";
      return `
      <article class="kpi-card kpi-${c.tone}">
        <div class="kpi-top">
          <span class="kpi-icon">${c.icon}</span>
          <span class="kpi-label">${escapeHtml(c.head)}</span>
        </div>
        <p class="kpi-value">${escapeHtml(c.value)}</p>
        <p class="kpi-text">${escapeHtml(c.text)}</p>
        ${bar}
        <div class="kpi-foot">
          <span>${escapeHtml(c.status)}</span>
          <i class="kpi-dot" aria-hidden="true"></i>
        </div>
      </article>`;
    }

    const fluxo = [
      {
        tone: "blue",
        icon: icons.list,
        head: "Total",
        value: k.total ?? 0,
        text: "Tarefas no filtro atual",
        status: "Carteira",
      },
      {
        tone: "green",
        icon: icons.check,
        head: "Concluídas",
        value: k.concluidos ?? 0,
        text: "Finalizadas no período",
        status: "Entregues",
      },
      {
        tone: "teal",
        icon: icons.chart,
        head: "Progresso global",
        value: `${pct}%`,
        text: "Média de avanço das tarefas",
        status: "Evolução",
        bar: pct,
      },
    ];

    const atencao = [
      {
        tone: "orange",
        icon: icons.clock,
        head: "Atrasadas",
        value: k.atrasadas ?? 0,
        text: "Com prazo vencido",
        status: "Prazo",
      },
      {
        tone: "red",
        icon: icons.alert,
        head: "Críticas abertas",
        value: k.criticas_abertas ?? 0,
        text: "Prioridade crítica em aberto",
        status: "Prioridade",
      },
    ];

    el.kpis.innerHTML = `
      <div class="kpi-groups">
        <div class="kpi-group">
          <p class="kpi-group-label">Panorama do lago</p>
          <div class="kpis-row tarefas-kpis-fluxo">${fluxo.map(cardHtml).join("")}</div>
        </div>
        <div class="kpi-group">
          <p class="kpi-group-label">Pontos de atenção</p>
          <div class="kpis-row tarefas-kpis-atencao">${atencao.map(cardHtml).join("")}</div>
        </div>
      </div>`;
  }

  function initials(nome) {
    const parts = String(nome || "?")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length || parts[0] === "—") return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function rankBar(pct, tone) {
    const w = Math.min(100, Math.max(0, Number(pct) || 0));
    return `<div class="tarefas-rank-bar" aria-hidden="true"><span class="tarefas-rank-bar-fill ${tone}" style="width:${w}%"></span></div>`;
  }

  function renderRankings(rankings) {
    const projetos = (rankings && rankings.projetos_criticos) || [];
    const responsaveis = (rankings && rankings.responsaveis) || [];
    el.rankProjetos.innerHTML = projetos.length
      ? projetos
          .map(
            (p, idx) => `
        <li class="tarefas-rank-item">
          <span class="tarefas-rank-pos">${idx + 1}</span>
          <div class="tarefas-rank-body">
            <div class="tarefas-rank-title-row">
              <a class="tarefas-rank-title" href="${escapeAttr(projetoHref(p.id))}">
                ${escapeHtml(p.nome)}
              </a>
              <span class="tarefas-rank-pct">${p.progresso_pct}%</span>
            </div>
            ${rankBar(p.progresso_pct, "green")}
            <div class="tarefas-rank-stats">
              <span class="tarefas-rank-stat tarefas-rank-stat-warn">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3 1 21h22L12 3zm0 6h2v5h-2V9zm0 7h2v2h-2v-2z"/></svg>
                ${p.criticas} crítica(s)
              </span>
              <span class="tarefas-rank-stat tarefas-rank-stat-late">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10 10 10 0 0 0-10-10zm1 11H7v-2h4V7h2z"/></svg>
                ${p.atrasadas} atrasada(s)
              </span>
            </div>
          </div>
        </li>`
          )
          .join("")
      : '<li class="tarefas-rank-empty">Nenhum projeto no ranking.</li>';
    el.rankResponsaveis.innerHTML = responsaveis.length
      ? responsaveis
          .map(
            (r, idx) => {
              const pct =
                r.total_abertas > 0
                  ? Math.round((100 * r.atrasadas) / r.total_abertas)
                  : 0;
              return `
        <li class="tarefas-rank-item">
          <span class="tarefas-rank-avatar" aria-hidden="true">${escapeHtml(initials(r.nome))}</span>
          <div class="tarefas-rank-body">
            <div class="tarefas-rank-title-row">
              <strong class="tarefas-rank-title">${escapeHtml(r.nome)}</strong>
              <span class="tarefas-rank-pct">${r.atrasadas}/${r.total_abertas}</span>
            </div>
            ${rankBar(pct, "orange")}
            <p class="tarefas-rank-meta">${r.atrasadas} tarefa(s) com mais de 1 dia de atraso · ${r.total_abertas} aberta(s) no total</p>
          </div>
        </li>`;
            }
          )
          .join("")
      : '<li class="tarefas-rank-empty">Nenhum responsável com tarefas atrasadas há mais de 1 dia.</li>';
  }

  function fmtPrazoCard(item) {
    const data = fmtDate(item.prazo);
    const hora = (item.prazo_hora || "").trim();
    if (!item.prazo) return "—";
    return hora ? `${data} · ${hora}` : data;
  }

  function renderCards(tarefas) {
    el.tarefasCount.textContent = `${tarefas.length} tarefa(s)`;
    if (!tarefas.length) {
      el.tarefasCards.innerHTML = "";
      el.tarefasEmpty.hidden = false;
      return;
    }
    el.tarefasEmpty.hidden = true;
    el.tarefasCards.innerHTML = tarefas
      .map((item) => {
        const width = itemProgress(item);
        const pctLabel =
          item.pct === "" || item.pct == null ? `~${width}%` : `${width}%`;
        const chips = [
          `<span class="${statusChipClass(item.status)}">${escapeHtml(item.status || "Sem status")}</span>`,
        ];
        if (item.atrasado) chips.push('<span class="chip chip-orange">Atrasado</span>');
        const pid = item.projeto_id || "";
        const badges = [
          `<span class="tarefa-badge tarefa-badge-projeto"><a href="${escapeAttr(projetoHref(pid))}">${escapeHtml(item.projeto_nome || pid)}</a></span>`,
        ];
        if (item.origem && item.origem !== "projeto") {
          badges.push(
            `<span class="tarefa-badge tarefa-badge-origem">${escapeHtml(item.origem_label || item.origem)}</span>`
          );
        }
        if (item.frente) {
          badges.push(`<span class="tarefa-badge">${escapeHtml(item.frente)}</span>`);
        }
        const actions = [];
        if (item.pode_editar) {
          actions.push(
            `<button type="button" class="btn-ghost btn-small" data-edit="${escapeAttr(item.id)}">Editar</button>`
          );
          actions.push(
            `<button type="button" class="btn-danger btn-small" data-excluir="${escapeAttr(item.id)}">Excluir</button>`
          );
          if (!DONE.has((item.status || "").toLowerCase())) {
            actions.push(
              `<button type="button" class="btn-run btn-small" data-concluir="${escapeAttr(item.id)}">Concluir</button>`
            );
          }
        }
        return `
        <article class="card item-card tarefa-card" data-id="${escapeAttr(item.id)}">
          <div class="card-head">${escapeHtml(item.entrega || "Sem título")}</div>
          <div class="card-body">
            <div class="tarefa-badges">${badges.join("")}</div>
            <p class="card-value">${chips.join("")}<span>${pctLabel}</span></p>
            <div class="progress" aria-hidden="true"><span style="width:${width}%"></span></div>
            <p class="card-text">
              Resp.: ${escapeHtml(item.responsavel || "—")}
              <br/>Prazo ${escapeHtml(fmtPrazoCard(item))}
              ${item.dias_prazo != null ? `<br/>${item.dias_prazo >= 0 ? `${item.dias_prazo} dia(s) restante(s)` : `${Math.abs(item.dias_prazo)} dia(s) em atraso`}` : ""}
            </p>
            <p class="card-text"><strong>Próxima:</strong> ${escapeHtml(item.proxima || "—")}</p>
            ${item.obs ? `<p class="card-text"><strong>Obs.:</strong> ${escapeHtml(item.obs)}</p>` : ""}
            <div class="card-status">ID ${escapeHtml(item.id)} · Prioridade: ${escapeHtml(item.prioridade || "—")}</div>
            <div class="tarefa-actions">${actions.join("")}</div>
          </div>
        </article>`;
      })
      .join("");
  }

  function fillSelectOptions(select, options, { includeEmpty = true, emptyLabel = "Todos" } = {}) {
    const current = select.value;
    select.innerHTML = includeEmpty
      ? `<option value="">${escapeHtml(emptyLabel)}</option>`
      : "";
    options.forEach((opt) => {
      const value = typeof opt === "string" ? opt : opt.value;
      const label = typeof opt === "string" ? opt : opt.label;
      select.insertAdjacentHTML(
        "beforeend",
        `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`
      );
    });
    if ([...select.options].some((o) => o.value === current)) {
      select.value = current;
    }
  }

  function fillResponsavelSelect(selectedEmail = "", selectedNome = "") {
    fillSelectOptions(
      el.tarefaResponsavel,
      state.responsaveis.map((r) => ({ value: r.email, label: r.nome })),
      { includeEmpty: true, emptyLabel: "— Selecione —" }
    );
    if (
      selectedEmail &&
      [...el.tarefaResponsavel.options].some((o) => o.value === selectedEmail)
    ) {
      el.tarefaResponsavel.value = selectedEmail;
      return;
    }
    if (selectedNome) {
      const match = state.responsaveis.find((r) => r.nome === selectedNome);
      if (match) el.tarefaResponsavel.value = match.email;
    }
  }

  async function loadResponsaveis() {
    const data = await api("/api/tarefas/responsaveis");
    state.responsaveis = data.responsaveis || [];
  }

  function updateModalVisibility() {
    const comProjeto = el.temProjeto.checked;
    el.blocoProjeto.hidden = !comProjeto;
    el.blocoOrigem.hidden = comProjeto || !state.podeCriarInstitucional;
    el.rowTemProjeto.hidden = state.editMode || !state.podeCriarInstitucional;
    if (!state.podeCriarInstitucional) {
      el.temProjeto.checked = true;
      el.blocoOrigem.hidden = true;
    }
    if (el.btnExcluirTarefa) {
      el.btnExcluirTarefa.hidden = !(
        state.editMode && state.editingItem && state.editingItem.pode_editar
      );
    }
  }

  function cacheFrentes(projetos) {
    state.frentesByProjeto = {};
    (projetos || []).forEach((p) => {
      if (p.id) state.frentesByProjeto[p.id] = p.frentes || [];
    });
  }

  function renderFrenteSelect(frentes, selected = "") {
    fillSelectOptions(el.tarefaFrente, frentes, {
      includeEmpty: true,
      emptyLabel: frentes.length ? "— Selecione —" : "— Sem frentes cadastradas —",
    });
    if (selected) el.tarefaFrente.value = selected;
  }

  async function loadFrentes(projetoId, selected = "") {
    if (!projetoId) {
      renderFrenteSelect([]);
      return;
    }
    let frentes = state.frentesByProjeto[projetoId];
    if (frentes === undefined) {
      const data = await api(
        `/api/projetos/${encodeURIComponent(projetoId)}/frentes`
      );
      frentes = data.frentes || [];
      state.frentesByProjeto[projetoId] = frentes;
    }
    renderFrenteSelect(frentes, selected);
  }

  function openModal(mode, item) {
    state.editMode = mode === "edit";
    state.editingItem = state.editMode ? item : null;
    el.modalErro.hidden = true;
    el.modalErro.textContent = "";
    el.modalTitle.textContent = state.editMode ? "Editar tarefa" : "Nova tarefa";
    el.formTarefa.reset();
    el.temProjeto.checked = true;
    el.tarefaId.value = state.editMode ? item.id : "";
    fillSelectOptions(
      el.tarefaProjeto,
      state.projetos.map((p) => ({ value: p.id, label: p.nome })),
      { includeEmpty: true, emptyLabel: "— Selecione —" }
    );
    fillSelectOptions(
      el.tarefaOrigem,
      state.origens.map((o) => ({ value: o.id, label: o.label })),
      { includeEmpty: true, emptyLabel: "— Selecione —" }
    );
    fillSelectOptions(el.tarefaStatus, state.statusOptions, {
      includeEmpty: false,
    });
    el.tarefaStatus.value = "Não iniciado";
    el.tarefaPrazoHora.value = "09:00";
    renderFrenteSelect([]);
    fillResponsavelSelect();

    if (state.editMode && item) {
      const comProjeto = item.projeto_id !== "set-tarefas";
      el.temProjeto.checked = comProjeto;
      if (comProjeto) {
        el.tarefaProjeto.value = item.projeto_id || "";
        loadFrentes(item.projeto_id, item.frente || "").catch((err) => {
          console.error(err);
        });
      } else {
        el.tarefaOrigem.value = item.origem || "";
      }
      el.tarefaEntrega.value = item.entrega || "";
      fillResponsavelSelect(item.responsavel_email || "", item.responsavel || "");
      el.tarefaProxima.value = item.proxima || "";
      el.tarefaPrazo.value = item.prazo || "";
      el.tarefaPrazoHora.value = item.prazo_hora || "09:00";
      el.tarefaPrioridade.value = item.prioridade || "";
      el.tarefaStatus.value = item.status || "Não iniciado";
      el.tarefaObs.value = item.obs || "";
    }

    updateModalVisibility();
    el.modal.showModal();
  }

  function closeModal() {
    if (el.modal.open) el.modal.close();
  }

  async function loadTarefas() {
    const data = await api(`/api/tarefas${filterQuery()}`);
    state.tarefas = data.tarefas || [];
    state.projetos = data.projetos || [];
    cacheFrentes(state.projetos);
    state.origens = data.origens || [];
    state.statusOptions = data.status_options || [];
    state.podeCriarInstitucional = !!data.pode_criar_institucional;

    if (data.filtro) syncFiltersToForm(data.filtro);

    fillSelectOptions(
      el.filtroProjeto,
      state.projetos.map((p) => ({ value: p.id, label: p.nome }))
    );
    fillSelectOptions(el.filtroStatus, state.statusOptions);
    fillSelectOptions(el.filtroOrigem, [
      { value: "projeto", label: "Projeto" },
      ...state.origens.map((o) => ({ value: o.id, label: o.label })),
    ]);
    updateFilterVisibility();

    renderKpis(data.kpis);
    renderRankings(data.rankings);
    renderCards(state.tarefas);

    const podeCriar =
      state.projetos.some((p) => p.papel === "admin" || p.papel === "editor") ||
      state.podeCriarInstitucional;
    if (el.btnNovaTarefa) el.btnNovaTarefa.hidden = !podeCriar;
  }

  async function loadMe() {
    const data = await api("/api/me");
    state.user = data.usuario;
    if (!state.user) {
      location.replace("/login.html");
      return;
    }
    if (el.userChip) {
      el.userChip.hidden = false;
      const papel = state.user.papel_label || state.user.papel || "";
      el.userChip.textContent = papel
        ? `${state.user.nome || state.user.usuario} · ${papel}`
        : state.user.nome || state.user.usuario;
    }
    if (state.user.papel === "admin") {
      if (el.linkAdmin) el.linkAdmin.hidden = false;
      if (el.linkProjetos) el.linkProjetos.hidden = false;
    }
  }

  async function salvarTarefa(event) {
    event.preventDefault();
    el.modalErro.hidden = true;
    const payload = {
      entrega: el.tarefaEntrega.value.trim(),
      proxima: el.tarefaProxima.value.trim(),
      prazo: el.tarefaPrazo.value,
      prazo_hora: el.tarefaPrazoHora.value,
      prioridade: el.tarefaPrioridade.value,
      status: el.tarefaStatus.value,
      obs: el.tarefaObs.value.trim(),
    };

    try {
      const wasNew = !state.editMode;
      if (state.editMode) {
        const id = el.tarefaId.value;
        payload.frente = el.tarefaFrente.value;
        await api(`/api/tarefas/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        payload.tem_projeto = el.temProjeto.checked;
        const respOpt = el.tarefaResponsavel.selectedOptions[0];
        payload.responsavel_email = el.tarefaResponsavel.value.trim();
        payload.responsavel = respOpt ? respOpt.textContent.trim() : "";
        if (payload.tem_projeto) {
          payload.projeto_id = el.tarefaProjeto.value;
          payload.frente = el.tarefaFrente.value;
        } else {
          payload.origem = el.tarefaOrigem.value;
        }
        await api("/api/tarefas", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      closeModal();
      await loadTarefas();
      if (wasNew) showToast("Tarefa salva.");
    } catch (err) {
      el.modalErro.hidden = false;
      el.modalErro.textContent = err.message || "Erro ao salvar";
    }
  }

  async function excluirTarefa(id) {
    const item = state.tarefas.find((t) => t.id === id);
    const titulo = item?.entrega || id;
    if (!window.confirm(`Excluir a tarefa "${titulo}"? Esta ação não pode ser desfeita.`)) {
      return;
    }
    try {
      await api(`/api/tarefas/${encodeURIComponent(id)}`, { method: "DELETE" });
      closeModal();
      await loadTarefas();
    } catch (err) {
      window.alert(err.message || "Erro ao excluir tarefa");
    }
  }

  async function concluirTarefa(id) {
    if (!window.confirm("Marcar esta tarefa como concluída?")) return;
    try {
      await api(`/api/tarefas/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Concluído", pct: "100" }),
      });
      await loadTarefas();
    } catch (err) {
      window.alert(err.message || "Erro ao concluir");
    }
  }

  function initDefaultFilters() {
    const { de, ate } = monthBounds();
    el.filtroPrazoDe.value = de;
    el.filtroPrazoAte.value = ate;
  }

  el.filterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadTarefas().catch((err) => console.error(err));
  });

  el.btnLimparFiltros.addEventListener("click", () => {
    el.filterForm.reset();
    initDefaultFilters();
    updateFilterVisibility();
    loadTarefas().catch((err) => console.error(err));
  });

  el.filtroOrigem.addEventListener("change", updateFilterVisibility);

  el.temProjeto.addEventListener("change", updateModalVisibility);

  el.formTarefa.addEventListener("change", (event) => {
    if (event.target !== el.tarefaProjeto) return;
    loadFrentes(el.tarefaProjeto.value).catch((err) => {
      console.error(err);
      el.modalErro.hidden = false;
      el.modalErro.textContent = err.message || "Erro ao carregar frentes";
    });
  });

  el.formTarefa.addEventListener("submit", salvarTarefa);
  el.btnCancelarModal.addEventListener("click", closeModal);

  if (el.btnExcluirTarefa) {
    el.btnExcluirTarefa.addEventListener("click", () => {
      const id = el.tarefaId.value;
      if (id) excluirTarefa(id);
    });
  }

  el.btnNovaTarefa.addEventListener("click", () => openModal("new"));

  el.tarefasCards.addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-edit]");
    if (editBtn) {
      const item = state.tarefas.find((t) => t.id === editBtn.dataset.edit);
      if (item) openModal("edit", item);
      return;
    }
    const excluirBtn = event.target.closest("[data-excluir]");
    if (excluirBtn) {
      excluirTarefa(excluirBtn.dataset.excluir);
      return;
    }
    const concluirBtn = event.target.closest("[data-concluir]");
    if (concluirBtn) {
      concluirTarefa(concluirBtn.dataset.concluir);
    }
  });

  el.btnSair.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    location.replace("/login.html");
  });

  if (el.btnVoltar) {
    el.btnVoltar.addEventListener("click", () => {
      location.href = "/portfolio.html";
    });
  }

  initDefaultFilters();
  loadMe()
    .then(loadResponsaveis)
    .then(loadTarefas)
    .catch((err) => {
      console.error(err);
      el.tarefasCards.innerHTML = `<p class="portfolio-empty">Erro ao carregar tarefas.</p>`;
    });
})();
