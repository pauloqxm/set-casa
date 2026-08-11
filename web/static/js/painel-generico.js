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
    btnSair: document.getElementById("btnSair"),
    kpis: document.getElementById("kpis"),
    blocksRow: document.getElementById("blocksRow"),
    resultCount: document.getElementById("resultCount"),
    btnNovaAcao: document.getElementById("btnNovaAcao"),
    tableBody: document.getElementById("tableBody"),
    btnTopo: document.getElementById("btnTopo"),

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

  const state = { itens: [], kpis: {}, frentes: [] };

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
    el.userChip.hidden = false;
    const papel = user.papel_label || user.papel || "";
    el.userChip.textContent = papel ? `${user.nome || user.usuario} · ${papel}` : user.nome || user.usuario;
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
    el.projTitle.textContent = data.projeto || "Painel do projeto";
    document.title = `${data.projeto || "Projeto"} · SET / IDT`;
    el.atualizadoEm.textContent = fmtDateTime(data.atualizado_em);
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
