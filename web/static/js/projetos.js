(() => {
  const el = {
    form: document.getElementById("projetoForm"),
    projNome: document.getElementById("projNome"),
    projDescricao: document.getElementById("projDescricao"),
    projPrazo: document.getElementById("projPrazo"),
    projGerente: document.getElementById("projGerente"),
    projFormError: document.getElementById("projFormError"),
    projetosBody: document.getElementById("projetosBody"),
    projCount: document.getElementById("projCount"),
    btnSair: document.getElementById("btnSair"),

    dialog: document.getElementById("editProjetoDialog"),
    editForm: document.getElementById("editProjetoForm"),
    editId: document.getElementById("editProjetoId"),
    editTitle: document.getElementById("editProjetoTitle"),
    editNome: document.getElementById("editProjetoNome"),
    editDescricao: document.getElementById("editProjetoDescricao"),
    editPrazo: document.getElementById("editProjetoPrazo"),
    editGerente: document.getElementById("editProjetoGerente"),
    editAtivo: document.getElementById("editProjetoAtivo"),
    editError: document.getElementById("editProjetoError"),
    editCancel: document.getElementById("editProjetoCancel"),
    editDelete: document.getElementById("editProjetoDelete"),

    accessList: document.getElementById("accessList"),
    accessUserSelect: document.getElementById("accessUserSelect"),
    accessPapelSelect: document.getElementById("accessPapelSelect"),
    btnConcederAcesso: document.getElementById("btnConcederAcesso"),
    auditList: document.getElementById("auditList"),
  };

  let projetos = [];
  let usuarios = [];
  let acessosAtuais = [];
  let editandoId = null;

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

  function papelLabel(papel) {
    if (papel === "admin") return "Administrador";
    if (papel === "editor") return "Editor";
    return "Consulta";
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
      location.replace("/portfolio.html");
      throw new Error("Sem permissão");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.erro || "Falha na requisição");
    }
    return data;
  }

  async function loadMe() {
    const data = await api("/api/me");
    if (!data.usuario) {
      location.replace("/login.html");
      return;
    }
    if (data.usuario.papel !== "admin") {
      location.replace("/portfolio.html");
    }
  }

  function fillGerenteSelect(select, selecionado) {
    const options = ['<option value="">— Sem gerente definido —</option>'];
    usuarios.forEach((u) => {
      options.push(
        `<option value="${u.id}" ${String(u.id) === String(selecionado) ? "selected" : ""}>${escapeHtml(
          u.nome || u.usuario
        )}</option>`
      );
    });
    select.innerHTML = options.join("");
  }

  async function loadUsuarios() {
    const data = await api("/api/usuarios");
    usuarios = data.usuarios || [];
    fillGerenteSelect(el.projGerente, "");
  }

  async function loadProjetos() {
    const data = await api("/api/projetos");
    projetos = data.projetos || [];
    renderProjetos();
  }

  function renderProjetos() {
    el.projCount.textContent = `${projetos.length} projeto(s)`;
    el.projetosBody.innerHTML = projetos
      .map((p) => {
        const status = p.ativo ? "ativo" : "inativo";
        return `
          <tr>
            <td class="col-nome"><strong>${escapeHtml(p.nome)}</strong><br><span class="muted">${escapeHtml(p.id)}</span></td>
            <td>${escapeHtml(p.gerente_nome || p.gerente_usuario || "—")}</td>
            <td>${fmtDate(p.prazo_conclusao)}</td>
            <td><span class="badge-status ${status}">${p.ativo ? "Ativo" : "Inativo"}</span></td>
            <td>
              <button type="button" class="btn-run btn-small" data-edit-projeto="${p.id}">
                Editar
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderAcessos() {
    if (!acessosAtuais.length) {
      el.accessList.innerHTML = '<p class="muted">Nenhum usuário com acesso direto (além de administradores globais).</p>';
    } else {
      el.accessList.innerHTML = acessosAtuais
        .map(
          (a) => `
        <div class="access-row" data-usuario-id="${a.usuario_id}">
          <span class="access-name">${escapeHtml(a.nome || a.usuario)}</span>
          <select data-role-select>
            <option value="consulta" ${a.papel === "consulta" ? "selected" : ""}>Consulta</option>
            <option value="editor" ${a.papel === "editor" ? "selected" : ""}>Editor</option>
            <option value="admin" ${a.papel === "admin" ? "selected" : ""}>Administrador</option>
          </select>
          <button type="button" class="btn-ghost btn-small" data-remove-acesso>Remover</button>
        </div>
      `
        )
        .join("");
    }

    const idsComAcesso = new Set(acessosAtuais.map((a) => String(a.usuario_id)));
    const disponiveis = usuarios.filter((u) => !idsComAcesso.has(String(u.id)));
    el.accessUserSelect.innerHTML = disponiveis
      .map((u) => `<option value="${u.id}">${escapeHtml(u.nome || u.usuario)}</option>`)
      .join("");
  }

  function renderAuditoria(entradas) {
    if (!entradas.length) {
      el.auditList.innerHTML = '<p class="muted">Sem eventos registrados ainda.</p>';
      return;
    }
    el.auditList.innerHTML = entradas
      .map((a) => {
        const quem = a.usuario_nome || "Sistema";
        return `
        <div class="audit-item">
          <div><strong>${escapeHtml(quem)}</strong> — ${escapeHtml(a.acao)} ${escapeHtml(a.entidade)}${a.entidade_id ? ` #${escapeHtml(a.entidade_id)}` : ""}</div>
          <div class="audit-meta">${fmtDateTime(a.criado_em)}</div>
        </div>
      `;
      })
      .join("");
  }

  async function openEdit(id) {
    const projeto = projetos.find((p) => p.id === id);
    if (!projeto) return;
    editandoId = id;
    el.editId.value = projeto.id;
    el.editTitle.textContent = projeto.nome;
    el.editNome.value = projeto.nome || "";
    el.editDescricao.value = projeto.descricao || "";
    el.editPrazo.value = (projeto.prazo_conclusao || "").slice(0, 10);
    el.editAtivo.value = projeto.ativo ? "1" : "0";
    fillGerenteSelect(el.editGerente, projeto.gerente_usuario_id || "");
    el.editError.hidden = true;
    el.editDelete.style.display = id === "casa-trabalhador" ? "none" : "";

    el.accessList.innerHTML = '<p class="muted">Carregando…</p>';
    el.auditList.innerHTML = '<p class="muted">Carregando…</p>';
    el.dialog.showModal();

    try {
      const [acessoData, auditData] = await Promise.all([
        api(`/api/projetos/${encodeURIComponent(id)}/usuarios`),
        api(`/api/projetos/${encodeURIComponent(id)}/auditoria`),
      ]);
      acessosAtuais = acessoData.usuarios || [];
      renderAcessos();
      renderAuditoria(auditData.auditoria || []);
    } catch (err) {
      el.accessList.innerHTML = `<p class="muted">Erro ao carregar acessos: ${escapeHtml(err.message)}</p>`;
    }
  }

  el.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    el.projFormError.hidden = true;
    try {
      await api("/api/projetos", {
        method: "POST",
        body: JSON.stringify({
          nome: el.projNome.value.trim(),
          descricao: el.projDescricao.value.trim(),
          prazo_conclusao: el.projPrazo.value || "",
          gerente_usuario_id: el.projGerente.value ? Number(el.projGerente.value) : null,
        }),
      });
      el.form.reset();
      await loadProjetos();
    } catch (err) {
      el.projFormError.textContent = err.message || "Erro ao criar projeto";
      el.projFormError.hidden = false;
    }
  });

  el.projetosBody.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-edit-projeto]");
    if (!btn) return;
    openEdit(btn.dataset.editProjeto);
  });

  el.editCancel.addEventListener("click", () => el.dialog.close());

  el.editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    el.editError.hidden = true;
    const id = el.editId.value;
    const payload = {
      nome: el.editNome.value.trim(),
      descricao: el.editDescricao.value.trim(),
      prazo_conclusao: el.editPrazo.value || "",
      ativo: el.editAtivo.value === "1",
      gerente_usuario_id: el.editGerente.value ? Number(el.editGerente.value) : null,
    };
    try {
      await api(`/api/projetos/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      el.dialog.close();
      await loadProjetos();
    } catch (err) {
      el.editError.textContent = err.message || "Erro ao salvar";
      el.editError.hidden = false;
    }
  });

  el.editDelete.addEventListener("click", async () => {
    const id = el.editId.value;
    if (!id) return;
    if (!confirm("Arquivar este projeto? Os itens e o histórico serão preservados.")) return;
    el.editError.hidden = true;
    try {
      await api(`/api/projetos/${encodeURIComponent(id)}`, { method: "DELETE" });
      el.dialog.close();
      await loadProjetos();
    } catch (err) {
      el.editError.textContent = err.message || "Erro ao arquivar";
      el.editError.hidden = false;
    }
  });

  el.btnConcederAcesso.addEventListener("click", async () => {
    const usuarioId = el.accessUserSelect.value;
    if (!usuarioId || !editandoId) return;
    try {
      const data = await api(`/api/projetos/${encodeURIComponent(editandoId)}/usuarios`, {
        method: "POST",
        body: JSON.stringify({
          usuario_id: Number(usuarioId),
          papel: el.accessPapelSelect.value,
        }),
      });
      acessosAtuais = data.usuarios || [];
      renderAcessos();
    } catch (err) {
      alert(err.message || "Erro ao conceder acesso");
    }
  });

  el.accessList.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-role-select]");
    if (!select || !editandoId) return;
    const row = select.closest("[data-usuario-id]");
    const usuarioId = row.dataset.usuarioId;
    try {
      await api(`/api/projetos/${encodeURIComponent(editandoId)}/usuarios`, {
        method: "POST",
        body: JSON.stringify({ usuario_id: Number(usuarioId), papel: select.value }),
      });
      const acesso = acessosAtuais.find((a) => String(a.usuario_id) === String(usuarioId));
      if (acesso) acesso.papel = select.value;
    } catch (err) {
      alert(err.message || "Erro ao atualizar papel");
    }
  });

  el.accessList.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-remove-acesso]");
    if (!btn || !editandoId) return;
    const row = btn.closest("[data-usuario-id]");
    const usuarioId = row.dataset.usuarioId;
    if (!confirm("Remover o acesso deste usuário ao projeto?")) return;
    try {
      await api(
        `/api/projetos/${encodeURIComponent(editandoId)}/usuarios/${encodeURIComponent(usuarioId)}`,
        { method: "DELETE" }
      );
      acessosAtuais = acessosAtuais.filter((a) => String(a.usuario_id) !== String(usuarioId));
      renderAcessos();
    } catch (err) {
      alert(err.message || "Erro ao remover acesso");
    }
  });

  el.btnSair.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    location.replace("/login.html");
  });

  loadMe()
    .then(() => Promise.all([loadUsuarios(), loadProjetos()]))
    .catch((err) => {
      console.error(err);
      el.projetosBody.innerHTML = '<tr><td colspan="5">Erro ao carregar projetos.</td></tr>';
    });
})();
