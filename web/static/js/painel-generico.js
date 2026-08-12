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
    frenteTag: document.getElementById("frenteTag"),
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

  const KPI_ICONS = {
    total:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 3h10a2 2 0 0 1 2 2v14l-7-3-7 3V5a2 2 0 0 1 2-2zm2 4v2h6V7H9zm0 4v2h6v-2H9z"/></svg>',
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
    outras: {
      tone: "green",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2z"/></svg>',
    },
  };

  function blocoVisual(blocoId) {
    return BLOCO_VISUAL[blocoId] || BLOCO_VISUAL.outras;
  }

  function renderKpis() {
    const k = state.kpis || {};
    const dias = k.dias_para_conclusao !== undefined ? k.dias_para_conclusao : k.dias_para_inauguracao;
    let prazoTxt = "Sem prazo definido";
    if (dias == null) {
      prazoTxt = fmtDate(k.prazo_conclusao || k.inauguracao);
    } else if (dias >= 0) {
      prazoTxt = `${dias} dia(s) restantes`;
    } else {
      prazoTxt = `${Math.abs(dias)} dia(s) após o prazo`;
    }
    const cards = [
      {
        tone: "green",
        icon: KPI_ICONS.total,
        head: "Total",
        value: k.total ?? "—",
        text: "Ações e entregas monitoradas",
        status: "Escopo ativo",
      },
      {
        tone: "green",
        icon: KPI_ICONS.check,
        head: "Concluídas",
        value: k.concluidos ?? 0,
        text: "Itens finalizados",
        status: `Progresso ${k.progresso_pct ?? 0}%`,
      },
      {
        tone: "blue",
        icon: KPI_ICONS.gear,
        head: "Andamento",
        value: k.em_andamento ?? 0,
        text: "Em execução agora",
        status: "Status",
      },
      {
        tone: "teal",
        icon: KPI_ICONS.people,
        head: "Terceiros",
        value: k.aguardando_terceiros ?? 0,
        text: "Aguardando ação externa",
        status: "Dependência",
      },
      {
        tone: "orange",
        icon: KPI_ICONS.clock,
        head: "Não iniciadas",
        value: k.nao_iniciados ?? 0,
        text: "Ainda sem início formal",
        status: "Fila",
      },
      {
        tone: "red",
        icon: KPI_ICONS.alert,
        head: "Críticas / Atraso",
        value: `${k.criticas_abertas ?? 0} / ${k.atrasadas ?? 0}`,
        text: prazoTxt,
        status: "Atenção",
      },
    ];
    el.kpis.dataset.count = String(cards.length);
    el.kpis.innerHTML = cards
      .map(
        (c) => `
        <article class="kpi-card kpi-${c.tone}">
          <div class="kpi-top">
            <span class="kpi-icon">${c.icon}</span>
            <span class="kpi-label">${escapeHtml(c.head)}</span>
          </div>
          <p class="kpi-value">${escapeHtml(String(c.value))}</p>
          <p class="kpi-text">${escapeHtml(c.text)}</p>
          <div class="kpi-foot">
            <span>${escapeHtml(c.status)}</span>
            <i class="kpi-dot" aria-hidden="true"></i>
          </div>
        </article>`
      )
      .join("");
  }

  function renderBlocks() {
    const frentes = state.frentes || [];
    if (el.frenteTag) {
      el.frenteTag.textContent = `${frentes.length} frente${frentes.length === 1 ? "" : "s"}`;
    }
    if (!frentes.length) {
      el.blocksRow.innerHTML = '<div class="empty">Sem frentes para exibir.</div>';
      return;
    }
    el.blocksRow.innerHTML = frentes
      .map((f) => {
        const visual = blocoVisual(f.bloco);
        const doneCls = Number(f.concluidos) > 0 ? " has-progress" : "";
        return `
        <div class="block block-${visual.tone}">
          <div class="block-top">
            <div class="block-heading">
              <span class="block-icon">${visual.icon}</span>
              <div class="block-titles">
                <div class="block-name">${escapeHtml(f.frente)}</div>
                <div class="block-alt">${escapeHtml(f.bloco_label || "")}</div>
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
        </div>`;
      })
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
