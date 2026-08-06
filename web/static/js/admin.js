(() => {
  const el = {
    form: document.getElementById("userForm"),
    userLogin: document.getElementById("userLogin"),
    userNome: document.getElementById("userNome"),
    userSenha: document.getElementById("userSenha"),
    userPapel: document.getElementById("userPapel"),
    formError: document.getElementById("formError"),
    usersBody: document.getElementById("usersBody"),
    userCount: document.getElementById("userCount"),
    btnSair: document.getElementById("btnSair"),
    dialog: document.getElementById("editUserDialog"),
    editForm: document.getElementById("editUserForm"),
    editId: document.getElementById("editUserId"),
    editTitle: document.getElementById("editUserTitle"),
    editNome: document.getElementById("editUserNome"),
    editPapel: document.getElementById("editUserPapel"),
    editAtivo: document.getElementById("editUserAtivo"),
    editSenha: document.getElementById("editUserSenha"),
    editError: document.getElementById("editUserError"),
    editCancel: document.getElementById("editUserCancel"),
    editDelete: document.getElementById("editUserDelete"),
  };

  let usuarios = [];
  let me = null;

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

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
      location.replace("/");
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
    me = data.usuario;
    if (!me) {
      location.replace("/login.html");
      return;
    }
    if (me.papel !== "admin") {
      location.replace("/");
    }
  }

  async function loadUsers() {
    const data = await api("/api/usuarios");
    usuarios = data.usuarios || [];
    renderUsers();
  }

  function papelLabel(papel) {
    if (papel === "admin") return "Admin";
    if (papel === "consulta") return "Consulta";
    return "Editor";
  }

  function papelClass(papel) {
    if (papel === "admin") return "admin";
    if (papel === "consulta") return "consulta";
    return "editor";
  }

  function renderUsers() {
    el.userCount.textContent = `${usuarios.length} usuário(s)`;
    el.usersBody.innerHTML = usuarios
      .map((u) => {
        const papel = papelClass(u.papel);
        const ativo = u.ativo ? "ativo" : "inativo";
        return `
          <tr>
            <td><strong>${escapeHtml(u.usuario)}</strong></td>
            <td>${escapeHtml(u.nome || "—")}</td>
            <td><span class="badge-papel ${papel}">${papelLabel(u.papel)}</span></td>
            <td><span class="badge-status ${ativo}">${u.ativo ? "Ativo" : "Inativo"}</span></td>
            <td>${escapeHtml(fmtDateTime(u.criado_em))}</td>
            <td>
              <button type="button" class="btn-run btn-small" data-edit-user="${u.id}">
                Editar
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function openEdit(id) {
    const user = usuarios.find((u) => String(u.id) === String(id));
    if (!user) return;
    el.editId.value = user.id;
    el.editTitle.textContent = user.usuario;
    el.editNome.value = user.nome || "";
    el.editPapel.value = papelClass(user.papel);
    el.editAtivo.value = user.ativo ? "1" : "0";
    el.editSenha.value = "";
    el.editError.hidden = true;
    el.editDelete.style.display = me && me.id === user.id ? "none" : "";
    el.dialog.showModal();
  }

  el.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    el.formError.hidden = true;
    try {
      await api("/api/usuarios", {
        method: "POST",
        body: JSON.stringify({
          usuario: el.userLogin.value.trim(),
          nome: el.userNome.value.trim(),
          senha: el.userSenha.value,
          papel: el.userPapel.value,
        }),
      });
      el.form.reset();
      el.userPapel.value = "editor";
      await loadUsers();
    } catch (err) {
      el.formError.textContent = err.message || "Erro ao criar usuário";
      el.formError.hidden = false;
    }
  });

  el.usersBody.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-edit-user]");
    if (!btn) return;
    openEdit(btn.dataset.editUser);
  });

  el.editCancel.addEventListener("click", () => el.dialog.close());

  el.editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    el.editError.hidden = true;
    const id = el.editId.value;
    const payload = {
      nome: el.editNome.value.trim(),
      papel: el.editPapel.value,
      ativo: el.editAtivo.value === "1",
    };
    if (el.editSenha.value) {
      payload.senha = el.editSenha.value;
    }
    try {
      await api(`/api/usuarios/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      el.dialog.close();
      await loadUsers();
    } catch (err) {
      el.editError.textContent = err.message || "Erro ao salvar";
      el.editError.hidden = false;
    }
  });

  el.editDelete.addEventListener("click", async () => {
    const id = el.editId.value;
    if (!id) return;
    if (!confirm("Excluir este usuário permanentemente?")) return;
    el.editError.hidden = true;
    try {
      await api(`/api/usuarios/${encodeURIComponent(id)}`, { method: "DELETE" });
      el.dialog.close();
      await loadUsers();
    } catch (err) {
      el.editError.textContent = err.message || "Erro ao excluir";
      el.editError.hidden = false;
    }
  });

  el.btnSair.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    location.replace("/login.html");
  });

  loadMe()
    .then(loadUsers)
    .catch((err) => {
      console.error(err);
      el.usersBody.innerHTML =
        '<tr><td colspan="6">Erro ao carregar usuários.</td></tr>';
    });
})();
