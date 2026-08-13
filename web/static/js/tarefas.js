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
    podeCriarInstitucional: false,
    editMode: false,
    editingItem: null,
  };

  const DONE = new Set(["concluído", "concluido"]);

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
  }

  function renderKpis(kpis) {
    if (!el.kpis || !kpis) return;
    const cards = [
      { label: "Total", value: kpis.total ?? 0 },
      { label: "Concluídas", value: kpis.concluidos ?? 0 },
      { label: "Atrasadas", value: kpis.atrasadas ?? 0 },
      { label: "Críticas abertas", value: kpis.criticas_abertas ?? 0 },
      { label: "Progresso global", value: `${kpis.progresso_pct ?? 0}%` },
    ];
    el.kpis.innerHTML = cards
      .map(
        (c) => `
      <article class="kpi">
        <span class="kpi-label">${escapeHtml(c.label)}</span>
        <strong class="kpi-value">${escapeHtml(c.value)}</strong>
      </article>`
      )
      .join("");
  }

  function renderRankings(rankings) {
    const projetos = (rankings && rankings.projetos_criticos) || [];
    const responsaveis = (rankings && rankings.responsaveis) || [];
    el.rankProjetos.innerHTML = projetos.length
      ? projetos
          .map(
            (p) => `
        <li>
          <a href="${escapeAttr(projetoHref(p.id))}">
            ${escapeHtml(p.nome)}
          </a>
          · ${p.atrasadas} atrasada(s) · ${p.criticas} crítica(s) · ${p.progresso_pct}%
        </li>`
          )
          .join("")
      : "<li>Nenhum projeto no ranking.</li>";
    el.rankResponsaveis.innerHTML = responsaveis.length
      ? responsaveis
          .map(
            (r) =>
              `<li>${escapeHtml(r.nome)} · ${r.atrasadas} atrasada(s) de ${r.total_abertas} aberta(s)</li>`
          )
          .join("")
      : "<li>Nenhum responsável com atrasos.</li>";
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
              <br/>Prazo ${fmtDate(item.prazo)}
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
    renderFrenteSelect([]);

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
      el.tarefaResponsavel.value = item.responsavel || "";
      el.tarefaProxima.value = item.proxima || "";
      el.tarefaPrazo.value = item.prazo || "";
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
      responsavel: el.tarefaResponsavel.value.trim(),
      proxima: el.tarefaProxima.value.trim(),
      prazo: el.tarefaPrazo.value,
      prioridade: el.tarefaPrioridade.value,
      status: el.tarefaStatus.value,
      obs: el.tarefaObs.value.trim(),
    };

    try {
      if (state.editMode) {
        const id = el.tarefaId.value;
        payload.frente = el.tarefaFrente.value;
        await api(`/api/tarefas/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        payload.tem_projeto = el.temProjeto.checked;
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
    loadTarefas().catch((err) => console.error(err));
  });

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
    .then(loadTarefas)
    .catch((err) => {
      console.error(err);
      el.tarefasCards.innerHTML = `<p class="portfolio-empty">Erro ao carregar tarefas.</p>`;
    });
})();
