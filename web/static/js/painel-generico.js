(() => {
  const STATUS_OPTIONS = [
    "Não iniciado",
    "Em andamento",
    "Aguardando terceiros",
    "Concluído",
    "Sobrestado",
    "Não se aplica",
  ];

  const match = location.pathname.match(/^\/projeto\/([^/]+)\/?$/);
  const projetoId = match ? decodeURIComponent(match[1]) : "";

  const el = {
    projTitle: document.getElementById("projTitle"),
    atualizadoEm: document.getElementById("atualizadoEm"),
    userChip: document.getElementById("userChip"),
    btnVoltar: document.getElementById("btnVoltar"),
    btnSair: document.getElementById("btnSair"),
    projMetaLine: document.getElementById("projMetaLine"),
    btnEditarProjeto: document.getElementById("btnEditarProjeto"),
    kpis: document.getElementById("kpis"),
    blocksRow: document.getElementById("blocksRow"),
    resultCount: document.getElementById("resultCount"),
    btnNovaAcao: document.getElementById("btnNovaAcao"),
    tableBody: document.getElementById("tableBody"),
    btnTopo: document.getElementById("btnTopo"),

    projDialog: document.getElementById("projDialog"),
    projForm: document.getElementById("projForm"),
    projNome: document.getElementById("projNome"),
    projDescricao: document.getElementById("projDescricao"),
    projGerente: document.getElementById("projGerente"),
    projPrazo: document.getElementById("projPrazo"),
    projError: document.getElementById("projError"),
    projCancel: document.getElementById("projCancel"),

    dialog: document.getElementById("editDialog"),
    editForm: document.getElementById("editForm"),
    editEyebrow: document.getElementById("editEyebrow"),
    editTitle: document.getElementById("editTitle"),
    editId: document.getElementById("editId"),
    editEntrega: document.getElementById("editEntrega"),
    editFrente: document.getElementById("editFrente"),
    editResponsavel: document.getElementById("editResponsavel"),
    editParceiros: document.getElementById("editParceiros"),
    editStatus: document.getElementById("editStatus"),
    editPrioridade: document.getElementById("editPrioridade"),
    editDataMudanca: document.getElementById("editDataMudanca"),
    editPrazo: document.getElementById("editPrazo"),
    editPct: document.getElementById("editPct"),
    editProxima: document.getElementById("editProxima"),
    editObs: document.getElementById("editObs"),
    editCancel: document.getElementById("editCancel"),
    editExcluir: document.getElementById("editExcluir"),
  };

  const state = {
    itens: [],
    kpis: {},
    frentes: [],
    projeto: {},
    usuario: null,
    podeEditarProjeto: false,
    usuarios: [],
  };

  function goBack(fallback = "/portfolio.html") {
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
    location.href = fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDate(value) {
    if (!value) return "—";
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return value;
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
    if (res.status === 403) {
      throw new Error("Você não tem permissão para esta ação neste projeto");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.erro || "Falha na requisição");
    }
    return data;
  }

  function fillStatusSelect() {
    el.editStatus.innerHTML = STATUS_OPTIONS.map(
      (s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`
    ).join("");
  }

  async function loadMe() {
    const data = await api("/api/me");
    if (!data.usuario) {
      location.replace("/login.html");
      return;
    }
    const user = data.usuario;
    state.usuario = user;
    el.userChip.hidden = false;
    const papel = user.papel_label || user.papel || "";
    el.userChip.textContent = papel
      ? `${user.nome || user.usuario} · ${papel}`
      : user.nome || user.usuario;
    state.podeEditarProjeto = user.papel === "admin";
    // Botão só aparece após o painel informar o papel no projeto (meu_papel)
    if (el.btnEditarProjeto && state.podeEditarProjeto) {
      el.btnEditarProjeto.hidden = false;
    }
  }

  function renderMeta() {
    if (!el.projMetaLine) return;
    const p = state.projeto || {};
    const gerente = p.gerente_nome || "não definido";
    el.projMetaLine.textContent = `Gerente: ${gerente} · Prazo: ${fmtDate(p.prazo_conclusao)}`;
    if (el.btnEditarProjeto && state.podeEditarProjeto) {
      el.btnEditarProjeto.textContent = p.gerente_nome
        ? "Editar título / gerente"
        : "Atribuir gerente / editar título";
    }
  }

  function fillGerenteSelect(selecionado) {
    const options = ['<option value="">— Sem gerente definido —</option>'];
    state.usuarios.forEach((u) => {
      if (u.ativo === false) return;
      options.push(
        `<option value="${u.id}" ${String(u.id) === String(selecionado || "") ? "selected" : ""}>${escapeHtml(
          u.nome || u.usuario
        )}</option>`
      );
    });
    el.projGerente.innerHTML = options.join("");
  }

  async function ensureUsuarios() {
    if (state.usuarios.length) return;
    const data = await api("/api/usuarios/opcoes");
    state.usuarios = data.usuarios || [];
  }

  async function openProjetoDialog() {
    if (!state.podeEditarProjeto) return;
    try {
      await ensureUsuarios();
    } catch (err) {
      alert(err.message || "Sem permissão para listar usuários");
      return;
    }
    const p = state.projeto || {};
    el.projNome.value = p.nome || el.projTitle.textContent || "";
    el.projDescricao.value = p.descricao || "";
    el.projPrazo.value = (p.prazo_conclusao || "").slice(0, 10);
    fillGerenteSelect(p.gerente_usuario_id || "");
    el.projError.hidden = true;
    el.projDialog.showModal();
  }

  function renderKpis() {
    const k = state.kpis || {};
    const dias = k.dias_para_conclusao !== undefined ? k.dias_para_conclusao : k.dias_para_inauguracao;
    const cards = [
      { tone: "blue", head: "Total de ações", value: k.total ?? 0 },
      { tone: "green", head: "Concluídas", value: k.concluidos ?? 0 },
      { tone: "green", head: "Progresso", value: `${k.progresso_pct ?? 0}%` },
      { tone: "orange", head: "Críticas em aberto", value: k.criticas_abertas ?? 0 },
      { tone: "orange", head: "Atrasadas", value: k.atrasadas ?? 0 },
      {
        tone: "blue",
        head: "Prazo do projeto",
        value: dias === null || dias === undefined ? "—" : `${dias} dia(s)`,
        text: fmtDate(k.prazo_conclusao || k.inauguracao),
      },
    ];
    el.kpis.innerHTML = cards
      .map(
        (c) => `
        <article class="kpi-card kpi-${c.tone}">
          <div class="kpi-top"><span class="kpi-label">${escapeHtml(c.head)}</span></div>
          <p class="kpi-value">${escapeHtml(String(c.value))}</p>
          ${c.text ? `<p class="kpi-text">${escapeHtml(c.text)}</p>` : ""}
        </article>`
      )
      .join("");
  }

  function renderBlocks() {
    const frentes = state.frentes || [];
    if (!frentes.length) {
      el.blocksRow.innerHTML = '<p class="muted">Nenhuma frente cadastrada ainda.</p>';
      return;
    }
    el.blocksRow.innerHTML = frentes
      .map(
        (f) => `
        <div class="block">
          <div class="block-top">
            <div class="block-titles">
              <div class="block-name">${escapeHtml(f.frente)}</div>
            </div>
            <div class="block-count">${f.total} itens</div>
          </div>
          <div class="block-foot">
            <span>Concluído</span>
            <b><span>${f.concluidos}</span>/${f.total}</b>
          </div>
        </div>`
      )
      .join("");
  }

  function renderTable() {
    const itens = state.itens || [];
    el.resultCount.textContent = `${itens.length} ação(ões)`;
    el.tableBody.innerHTML = itens
      .map(
        (item) => `
        <tr>
          <td>${escapeHtml(item.id)}</td>
          <td>${escapeHtml(item.frente || "—")}</td>
          <td>${escapeHtml(item.entrega || "—")}</td>
          <td>${escapeHtml(item.responsavel || "—")}</td>
          <td>${escapeHtml(item.prioridade || "—")}</td>
          <td>${fmtDate(item.prazo)}</td>
          <td>${escapeHtml(item.status || "—")}</td>
          <td>${escapeHtml(item.proxima || "—")}</td>
          <td>
            <button type="button" class="btn-run btn-small" data-edit-item="${escapeHtml(item.id)}">
              Editar
            </button>
          </td>
        </tr>`
      )
      .join("");
  }

  function applyPayload(data) {
    state.itens = data.itens || [];
    state.kpis = data.kpis || {};
    state.frentes = data.frentes || [];
    state.projeto = {
      id: data.projeto_id || projetoId,
      nome: data.projeto || "",
      descricao: data.descricao || "",
      gerente_usuario_id: data.gerente_usuario_id,
      gerente_nome: data.gerente_nome || "",
      prazo_conclusao: data.prazo_conclusao || "",
    };
    if (data.meu_papel === "admin" || (state.usuario && state.usuario.papel === "admin")) {
      state.podeEditarProjeto = true;
      if (el.btnEditarProjeto) el.btnEditarProjeto.hidden = false;
    }
    el.projTitle.textContent = data.projeto || "Painel do projeto";
    document.title = `${data.projeto || "Projeto"} · SET / IDT`;
    el.atualizadoEm.textContent = fmtDateTime(data.atualizado_em);
    renderMeta();
    renderKpis();
    renderBlocks();
    renderTable();
  }

  async function loadPainel() {
    const data = await api(`/api/projetos/${encodeURIComponent(projetoId)}/painel`);
    applyPayload(data);
  }

  function openDialog(item) {
    const isNew = !item;
    el.editEyebrow.textContent = isNew ? "Nova ação" : "Editar ação";
    el.editTitle.textContent = isNew ? "Nova ação" : `Ação ${item.id}`;
    el.editId.value = isNew ? "" : item.id;
    el.editEntrega.value = item?.entrega || "";
    el.editFrente.value = item?.frente || "";
    el.editResponsavel.value = item?.responsavel || "";
    el.editParceiros.value = item?.parceiros || "";
    el.editStatus.value = item?.status || STATUS_OPTIONS[0];
    el.editPrioridade.value = item?.prioridade || "";
    el.editDataMudanca.value = (item?.data_mudanca || "").slice(0, 10);
    el.editPrazo.value = (item?.prazo || "").slice(0, 10);
    el.editPct.value = item?.pct || "";
    el.editProxima.value = item?.proxima || "";
    el.editObs.value = item?.obs || "";
    el.editExcluir.style.display = isNew ? "none" : "";
    el.dialog.showModal();
  }

  el.btnNovaAcao.addEventListener("click", () => openDialog(null));

  if (el.btnEditarProjeto) {
    el.btnEditarProjeto.addEventListener("click", () => {
      openProjetoDialog().catch((err) => alert(err.message || "Erro"));
    });
  }

  if (el.projCancel) {
    el.projCancel.addEventListener("click", () => el.projDialog.close());
  }

  if (el.projForm) {
    el.projForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      el.projError.hidden = true;
      try {
        const data = await api(`/api/projetos/${encodeURIComponent(projetoId)}`, {
          method: "PATCH",
          body: JSON.stringify({
            nome: el.projNome.value.trim(),
            descricao: el.projDescricao.value.trim(),
            prazo_conclusao: el.projPrazo.value || "",
            gerente_usuario_id: el.projGerente.value
              ? Number(el.projGerente.value)
              : null,
          }),
        });
        el.projDialog.close();
        const p = data.projeto || {};
        state.projeto = {
          id: p.id || projetoId,
          nome: p.nome || "",
          descricao: p.descricao || "",
          gerente_usuario_id: p.gerente_usuario_id,
          gerente_nome: p.gerente_nome || p.gerente_usuario || "",
          prazo_conclusao: p.prazo_conclusao || "",
        };
        el.projTitle.textContent = state.projeto.nome || "Painel do projeto";
        document.title = `${state.projeto.nome || "Projeto"} · SET / IDT`;
        renderMeta();
        // Recarrega KPIs (prazo pode ter mudado)
        await loadPainel();
      } catch (err) {
        el.projError.textContent = err.message || "Erro ao salvar projeto";
        el.projError.hidden = false;
      }
    });
  }

  if (el.btnVoltar) {
    el.btnVoltar.addEventListener("click", () => goBack("/portfolio.html"));
  }

  el.tableBody.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-edit-item]");
    if (!btn) return;
    const item = state.itens.find((i) => String(i.id) === String(btn.dataset.editItem));
    if (item) openDialog(item);
  });

  el.editCancel.addEventListener("click", () => el.dialog.close());

  el.editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = el.editId.value;
    const payload = {
      entrega: el.editEntrega.value.trim(),
      frente: el.editFrente.value.trim(),
      responsavel: el.editResponsavel.value.trim(),
      parceiros: el.editParceiros.value.trim(),
      status: el.editStatus.value,
      prioridade: el.editPrioridade.value,
      data_mudanca: el.editDataMudanca.value,
      prazo: el.editPrazo.value,
      pct: el.editPct.value,
      proxima: el.editProxima.value.trim(),
      obs: el.editObs.value.trim(),
    };
    try {
      if (id) {
        await api(`/api/projetos/${encodeURIComponent(projetoId)}/itens/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api(`/api/projetos/${encodeURIComponent(projetoId)}/itens`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      el.dialog.close();
      await loadPainel();
    } catch (err) {
      alert(err.message || "Erro ao salvar ação");
    }
  });

  el.editExcluir.addEventListener("click", async () => {
    const id = el.editId.value;
    if (!id) return;
    if (!confirm("Excluir esta ação permanentemente?")) return;
    try {
      await api(`/api/projetos/${encodeURIComponent(projetoId)}/itens/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      el.dialog.close();
      await loadPainel();
    } catch (err) {
      alert(err.message || "Erro ao excluir ação");
    }
  });

  el.btnSair.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    location.replace("/login.html");
  });

  if (el.btnTopo) {
    el.btnTopo.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  fillStatusSelect();

  if (!projetoId) {
    el.tableBody.innerHTML = '<tr><td colspan="9">Projeto inválido.</td></tr>';
  } else {
    loadMe()
      .then(loadPainel)
      .catch((err) => {
        console.error(err);
        el.tableBody.innerHTML = `<tr><td colspan="9">Erro ao carregar painel: ${escapeHtml(err.message)}</td></tr>`;
      });
  }
})();
