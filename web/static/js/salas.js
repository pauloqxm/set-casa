(() => {
  const el = {
    userChip: document.getElementById("userChip"),
    linkAdmin: document.getElementById("linkAdmin"),
    linkProjetos: document.getElementById("linkProjetos"),
    btnSair: document.getElementById("btnSair"),
    btnVoltar: document.getElementById("btnVoltar"),
    btnNovo: document.getElementById("btnNovoAgendamento"),
    toast: document.getElementById("salasToast"),
    kpis: document.getElementById("kpis"),
    semanaLabel: document.getElementById("semanaLabel"),
    btnSemanaAnt: document.getElementById("btnSemanaAnt"),
    btnSemanaProx: document.getElementById("btnSemanaProx"),
    btnHoje: document.getElementById("btnHoje"),
    btnCalendario: document.getElementById("btnCalendario"),
    irParaData: document.getElementById("irParaData"),
    diasTabs: document.getElementById("diasTabs"),
    grade: document.getElementById("grade"),
    gradeEmpty: document.getElementById("gradeEmpty"),
    adminSalas: document.getElementById("adminSalas"),
    adminCoords: document.getElementById("adminCoords"),
    formSala: document.getElementById("formSala"),
    salaNome: document.getElementById("salaNome"),
    salaAndar: document.getElementById("salaAndar"),
    salaCapacidade: document.getElementById("salaCapacidade"),
    salaRecursos: document.getElementById("salaRecursos"),
    listaSalas: document.getElementById("listaSalas"),
    formCoord: document.getElementById("formCoord"),
    coordSigla: document.getElementById("coordSigla"),
    coordNome: document.getElementById("coordNome"),
    listaCoords: document.getElementById("listaCoords"),
    modal: document.getElementById("modalAgenda"),
    formAgenda: document.getElementById("formAgenda"),
    modalTitle: document.getElementById("modalAgendaTitle"),
    modalErro: document.getElementById("modalErro"),
    agendaId: document.getElementById("agendaId"),
    agendaSala: document.getElementById("agendaSala"),
    agendaData: document.getElementById("agendaData"),
    agendaInicio: document.getElementById("agendaInicio"),
    agendaFim: document.getElementById("agendaFim"),
    agendaCoord: document.getElementById("agendaCoord"),
    agendaResp: document.getElementById("agendaResp"),
    agendaObs: document.getElementById("agendaObs"),
    btnCancelarAgenda: document.getElementById("btnCancelarAgenda"),
    btnFecharModal: document.getElementById("btnFecharModal"),
    btnSalvarAgenda: document.getElementById("btnSalvarAgenda"),
  };

  const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const state = {
    user: null,
    weekStart: startOfWeek(new Date()),
    selectedDate: isoDate(new Date()),
    slots: [],
    salas: [],
    coordenacoes: [],
    agendamentos: [],
    podeAdmin: false,
  };

  let toastTimer = null;

  function showToast(message) {
    if (!el.toast || !message) return;
    el.toast.textContent = message;
    el.toast.hidden = false;
    requestAnimationFrame(() => el.toast.classList.add("is-visible"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.remove("is-visible");
      el.toast.hidden = true;
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

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function isoDate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function parseIso(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return new Date();
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function startOfWeek(d) {
    const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    return copy;
  }

  function addDays(d, n) {
    const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    copy.setDate(copy.getDate() + n);
    return copy;
  }

  function fmtBr(value) {
    const d = parseIso(value);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
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

  function fillSelect(select, options, { emptyLabel = "— Selecione —", selected = "" } = {}) {
    select.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>`;
    options.forEach((opt) => {
      const value = typeof opt === "string" ? opt : opt.value;
      const label = typeof opt === "string" ? opt : opt.label;
      select.insertAdjacentHTML(
        "beforeend",
        `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`
      );
    });
    if (selected) select.value = selected;
  }

  function renderKpis(kpis) {
    if (!el.kpis || !kpis) return;
    const ocup = Number(kpis.ocupacao_pct || 0);
    const sala = kpis.sala_mais_usada;
    const pico = kpis.horario_pico;
    const cards = [
      {
        tone: "blue",
        head: "Agendamentos",
        value: kpis.total ?? 0,
        text: "Confirmados na semana",
        status: "Carteira",
      },
      {
        tone: "teal",
        head: "Ocupação",
        value: `${ocup}%`,
        text: "Slots · dias úteis",
        status: "Grade 8h–17h",
        bar: ocup,
      },
      {
        tone: "green",
        head: "Sala mais usada",
        value: sala ? sala.nome : "—",
        text: sala ? `${sala.total} reserva(s)` : "Sem reservas",
        status: "Uso",
      },
      {
        tone: "orange",
        head: "Horário de pico",
        value: pico ? pico.hora : "—",
        text: pico ? `${pico.total} reserva(s)` : "Sem pico",
        status: "Demanda",
      },
    ];
    el.kpis.innerHTML = `
      <div class="kpi-groups">
        <div class="kpi-group">
          <p class="kpi-group-label">Semana selecionada</p>
          <div class="kpis-row salas-kpis-row">${cards
            .map(
              (c) => `
            <article class="kpi-card kpi-${c.tone}">
              <div class="kpi-top">
                <span class="kpi-label">${escapeHtml(c.head)}</span>
              </div>
              <p class="kpi-value">${escapeHtml(c.value)}</p>
              <p class="kpi-text">${escapeHtml(c.text)}</p>
              ${
                c.bar != null
                  ? `<div class="tarefas-kpi-bar" aria-hidden="true"><span style="width:${Math.min(
                      100,
                      Math.max(0, c.bar)
                    )}%"></span></div>`
                  : ""
              }
              <div class="kpi-foot"><span>${escapeHtml(c.status)}</span></div>
            </article>`
            )
            .join("")}</div>
        </div>
      </div>`;
  }

  function bookingFor(salaId, data, inicio, fim) {
    return state.agendamentos.find(
      (a) =>
        a.status === "confirmado" &&
        a.sala_id === salaId &&
        a.data === data &&
        overlaps(a.hora_inicio, a.hora_fim, inicio, fim)
    );
  }

  function renderDays() {
    el.diasTabs.innerHTML = "";
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(state.weekStart, i);
      const iso = isoDate(d);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "salas-day-btn";
      if (iso === state.selectedDate) btn.classList.add("is-active");
      if (d.getDay() === 0 || d.getDay() === 6) btn.classList.add("is-weekend");
      btn.textContent = `${WEEKDAYS[i]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
      btn.addEventListener("click", () => {
        state.selectedDate = iso;
        renderDays();
        renderGrid();
      });
      el.diasTabs.appendChild(btn);
    }
    const fim = addDays(state.weekStart, 6);
    el.semanaLabel.textContent = `${fmtBr(isoDate(state.weekStart))} a ${fmtBr(
      isoDate(fim)
    )}`;
    if (el.irParaData) el.irParaData.value = state.selectedDate;
  }

  function renderGrid() {
    const salas = state.salas.filter((s) => s.ativo);
    const thead = el.grade.querySelector("thead");
    const tbody = el.grade.querySelector("tbody");
    if (!salas.length) {
      el.gradeEmpty.hidden = false;
      thead.innerHTML = "";
      tbody.innerHTML = "";
      return;
    }
    el.gradeEmpty.hidden = true;
    thead.innerHTML = `<tr><th class="hora">Horário</th>${salas
      .map((s) => `<th>${escapeHtml(s.nome)}</th>`)
      .join("")}</tr>`;
    tbody.innerHTML = state.slots
      .map((slot) => {
        const cells = salas
          .map((sala) => {
            const booking = bookingFor(
              sala.id,
              state.selectedDate,
              slot.inicio,
              slot.fim
            );
            if (!booking) {
              return `<td><button type="button" class="salas-slot" data-sala="${escapeAttr(
                sala.id
              )}" data-inicio="${escapeAttr(slot.inicio)}" data-fim="${escapeAttr(
                slot.fim
              )}">Livre</button></td>`;
            }
            const mine = booking.pode_editar ? " is-mine" : "";
            const label = booking.coordenacao_sigla || booking.responsavel || "Ocupado";
            return `<td><button type="button" class="salas-slot is-busy${mine}" data-id="${escapeAttr(
              booking.id
            )}">${escapeHtml(label)}<span class="salas-slot-meta">${escapeHtml(
              booking.responsavel || ""
            )}</span></button></td>`;
          })
          .join("");
        return `<tr><td class="hora">${escapeHtml(slot.inicio)}</td>${cells}</tr>`;
      })
      .join("");
  }

  function renderAdmin() {
    const show = state.podeAdmin;
    el.adminSalas.hidden = !show;
    el.adminCoords.hidden = !show;
    if (!show) return;
    el.listaSalas.innerHTML = state.salas
      .map(
        (s) => `
      <div class="salas-admin-item${s.ativo ? "" : " is-inactive"}">
        <div>
          <strong>${escapeHtml(s.nome)}</strong>
          <span>${escapeHtml(s.andar || "—")} · ${
            s.capacidade != null ? `${s.capacidade} lugares` : "capacidade —"
          } · ${(s.recursos || []).join(", ") || "sem recursos"}</span>
        </div>
        <button type="button" class="btn-ghost btn-small" data-del-sala="${escapeAttr(
          s.id
        )}">${s.ativo ? "Desativar" : "Excluir"}</button>
      </div>`
      )
      .join("");
    el.listaCoords.innerHTML = state.coordenacoes
      .map(
        (c) => `
      <div class="salas-admin-item">
        <div>
          <strong>${escapeHtml(c.sigla)}</strong>
          <span>${escapeHtml(c.nome_completo || "—")}</span>
        </div>
        <button type="button" class="btn-ghost btn-small" data-del-coord="${escapeAttr(
          c.id
        )}">Excluir</button>
      </div>`
      )
      .join("");
  }

  function openModal(mode, preset) {
    el.modalErro.hidden = true;
    el.modalErro.textContent = "";
    el.formAgenda.reset();
    fillSelect(
      el.agendaSala,
      state.salas.filter((s) => s.ativo).map((s) => ({ value: s.id, label: s.nome })),
      { emptyLabel: "— Selecione —", selected: preset.sala_id || "" }
    );
    fillSelect(
      el.agendaCoord,
      state.coordenacoes.map((c) => ({
        value: c.id,
        label: c.nome_completo ? `${c.sigla} · ${c.nome_completo}` : c.sigla,
      })),
      { emptyLabel: "— Selecione —", selected: preset.coordenacao_id || "" }
    );
    el.agendaId.value = preset.id || "";
    el.agendaData.value = preset.data || state.selectedDate;
    el.agendaInicio.value = preset.hora_inicio || "09:00";
    el.agendaFim.value = preset.hora_fim || "10:00";
    el.agendaResp.value = preset.responsavel || state.user?.nome || "";
    el.agendaObs.value = preset.observacao || "";
    const editing = mode === "edit";
    el.modalTitle.textContent = editing ? "Editar agendamento" : "Novo agendamento";
    const canEdit = !editing || preset.pode_editar;
    el.btnSalvarAgenda.hidden = !canEdit;
    el.btnCancelarAgenda.hidden = !(editing && preset.pode_editar);
    ["agendaSala", "agendaData", "agendaInicio", "agendaFim", "agendaCoord", "agendaResp", "agendaObs"].forEach(
      (id) => {
        el[id].disabled = !canEdit;
      }
    );
    el.modal.showModal();
  }

  function closeModal() {
    if (el.modal.open) el.modal.close();
  }

  async function loadAgenda() {
    const de = isoDate(state.weekStart);
    const ate = isoDate(addDays(state.weekStart, 6));
    const data = await api(`/api/agendamentos?de=${de}&ate=${ate}`);
    state.salas = data.salas || [];
    state.coordenacoes = data.coordenacoes || [];
    state.agendamentos = data.agendamentos || [];
    state.slots = data.slots || [];
    state.podeAdmin = !!data.pode_admin;
    if (!state.slots.length) {
      state.slots = [
        { inicio: "08:00", fim: "09:00" },
        { inicio: "09:00", fim: "10:00" },
        { inicio: "10:00", fim: "11:00" },
        { inicio: "11:00", fim: "12:00" },
        { inicio: "13:00", fim: "14:00" },
        { inicio: "14:00", fim: "15:00" },
        { inicio: "15:00", fim: "16:00" },
        { inicio: "16:00", fim: "17:00" },
      ];
    }
    renderKpis(data.kpis);
    renderDays();
    renderGrid();
    renderAdmin();
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

  el.grade.addEventListener("click", (event) => {
    const btn = event.target.closest("button.salas-slot");
    if (!btn) return;
    if (btn.dataset.id) {
      const item = state.agendamentos.find((a) => a.id === btn.dataset.id);
      if (item) openModal("edit", item);
      return;
    }
    openModal("new", {
      sala_id: btn.dataset.sala,
      data: state.selectedDate,
      hora_inicio: btn.dataset.inicio,
      hora_fim: btn.dataset.fim,
    });
  });

  el.btnNovo.addEventListener("click", () => {
    openModal("new", { data: state.selectedDate });
  });

  el.btnFecharModal.addEventListener("click", closeModal);

  el.formAgenda.addEventListener("submit", async (event) => {
    event.preventDefault();
    el.modalErro.hidden = true;
    const payload = {
      sala_id: el.agendaSala.value,
      data: el.agendaData.value,
      hora_inicio: el.agendaInicio.value,
      hora_fim: el.agendaFim.value,
      coordenacao_id: el.agendaCoord.value,
      responsavel: el.agendaResp.value.trim(),
      observacao: el.agendaObs.value.trim(),
    };
    try {
      const id = el.agendaId.value;
      if (id) {
        await api(`/api/agendamentos/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        showToast("Agendamento atualizado.");
      } else {
        await api("/api/agendamentos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("Agendamento confirmado.");
      }
      closeModal();
      await loadAgenda();
    } catch (err) {
      el.modalErro.hidden = false;
      el.modalErro.textContent = err.message || "Erro ao salvar";
    }
  });

  el.btnCancelarAgenda.addEventListener("click", async () => {
    const id = el.agendaId.value;
    if (!id) return;
    if (!window.confirm("Cancelar este agendamento? O horário ficará livre.")) return;
    try {
      await api(`/api/agendamentos/${encodeURIComponent(id)}`, { method: "DELETE" });
      showToast("Agendamento cancelado.");
      closeModal();
      await loadAgenda();
    } catch (err) {
      el.modalErro.hidden = false;
      el.modalErro.textContent = err.message || "Erro ao cancelar";
    }
  });

  el.btnSemanaAnt.addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, -7);
    state.selectedDate = isoDate(state.weekStart);
    loadAgenda().catch((err) => console.error(err));
  });

  el.btnSemanaProx.addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, 7);
    state.selectedDate = isoDate(state.weekStart);
    loadAgenda().catch((err) => console.error(err));
  });

  el.btnHoje.addEventListener("click", () => {
    const hoje = new Date();
    state.weekStart = startOfWeek(hoje);
    state.selectedDate = isoDate(hoje);
    loadAgenda().catch((err) => console.error(err));
  });

  function irParaDia(iso) {
    if (!iso) return;
    const dia = parseIso(iso);
    state.weekStart = startOfWeek(dia);
    state.selectedDate = isoDate(dia);
    loadAgenda().catch((err) => console.error(err));
  }

  function abrirCalendario() {
    if (!el.irParaData) return;
    el.irParaData.value = state.selectedDate;
    el.irParaData.focus();
    if (typeof el.irParaData.showPicker === "function") {
      try {
        el.irParaData.showPicker();
        return;
      } catch {
        /* o campo visível continua clicável */
      }
    }
  }

  if (el.btnCalendario) {
    el.btnCalendario.addEventListener("click", abrirCalendario);
  }
  if (el.irParaData) {
    el.irParaData.addEventListener("change", () => irParaDia(el.irParaData.value));
  }

  el.formSala.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/salas", {
        method: "POST",
        body: JSON.stringify({
          nome: el.salaNome.value.trim(),
          andar: el.salaAndar.value.trim(),
          capacidade: el.salaCapacidade.value,
          recursos: el.salaRecursos.value,
        }),
      });
      el.formSala.reset();
      showToast("Sala cadastrada.");
      await loadAgenda();
    } catch (err) {
      window.alert(err.message || "Erro ao salvar sala");
    }
  });

  el.formCoord.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/coordenacoes", {
        method: "POST",
        body: JSON.stringify({
          sigla: el.coordSigla.value.trim(),
          nome_completo: el.coordNome.value.trim(),
        }),
      });
      el.formCoord.reset();
      showToast("Coordenação cadastrada.");
      await loadAgenda();
    } catch (err) {
      window.alert(err.message || "Erro ao salvar coordenação");
    }
  });

  el.listaSalas.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-del-sala]");
    if (!btn) return;
    if (!window.confirm("Desativar ou excluir esta sala?")) return;
    try {
      await api(`/api/salas/${encodeURIComponent(btn.dataset.delSala)}`, {
        method: "DELETE",
      });
      await loadAgenda();
    } catch (err) {
      window.alert(err.message || "Erro ao remover sala");
    }
  });

  el.listaCoords.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-del-coord]");
    if (!btn) return;
    if (!window.confirm("Excluir esta coordenação?")) return;
    try {
      await api(`/api/coordenacoes/${encodeURIComponent(btn.dataset.delCoord)}`, {
        method: "DELETE",
      });
      await loadAgenda();
    } catch (err) {
      window.alert(err.message || "Erro ao remover coordenação");
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

  loadMe()
    .then(loadAgenda)
    .catch((err) => {
      console.error(err);
      el.gradeEmpty.hidden = false;
      el.gradeEmpty.textContent = err.message || "Erro ao carregar a agenda.";
    });
})();
