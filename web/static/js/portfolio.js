(() => {
  const el = {
    userChip: document.getElementById("userChip"),
    linkAdmin: document.getElementById("linkAdmin"),
    linkProjetos: document.getElementById("linkProjetos"),
    btnSair: document.getElementById("btnSair"),
    grid: document.getElementById("portfolioGrid"),
    empty: document.getElementById("portfolioEmpty"),
    count: document.getElementById("portfolioCount"),
    btnVoltar: document.getElementById("btnVoltar"),
  };

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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.erro || "Falha na requisição");
    }
    return data;
  }

  async function loadMe() {
    const data = await api("/api/me");
    const user = data.usuario;
    if (!user) {
      location.replace("/login.html");
      return;
    }
    if (el.userChip) {
      el.userChip.hidden = false;
      const papel = user.papel_label || user.papel || "";
      el.userChip.textContent = papel
        ? `${user.nome || user.usuario} · ${papel}`
        : user.nome || user.usuario;
    }
    if (user.papel === "admin") {
      if (el.linkAdmin) el.linkAdmin.hidden = false;
      if (el.linkProjetos) el.linkProjetos.hidden = false;
    }
  }

  function projetoHref(id) {
    return id === "casa-trabalhador" ? "/" : `/projeto/${encodeURIComponent(id)}`;
  }

  function renderCard(p) {
    const kpis = p.kpis || {};
    const pct = Number(kpis.progresso_pct || 0);
    const dias =
      kpis.dias_para_conclusao !== undefined
        ? kpis.dias_para_conclusao
        : kpis.dias_para_inauguracao;
    const diasTxt =
      dias === null || dias === undefined
        ? ""
        : dias >= 0
        ? `${dias} dia(s) para o prazo`
        : `${Math.abs(dias)} dia(s) em atraso`;
    return `
      <a class="portfolio-card" href="${projetoHref(p.id)}">
        <div class="portfolio-card-head">
          <h3 class="portfolio-card-title">${escapeHtml(p.nome)}</h3>
          <span class="badge-papel ${p.papel}">${papelLabel(p.papel)}</span>
        </div>
        <p class="portfolio-card-desc">${escapeHtml(p.descricao || "")}</p>
        <div class="portfolio-card-meta">
          <span>Gerente: <strong>${escapeHtml(p.gerente_nome || "—")}</strong></span>
          <span>Prazo: <strong>${fmtDate(p.prazo_conclusao)}</strong></span>
        </div>
        <div class="portfolio-progress-bar">
          <div class="portfolio-progress-fill" style="width:${Math.min(100, Math.max(0, pct))}%"></div>
        </div>
        <div class="portfolio-card-foot">
          <span class="portfolio-pct">${pct}% concluído</span>
          <span class="portfolio-kpis-mini">
            <span><b>${kpis.total ?? 0}</b> itens</span>
            <span><b>${kpis.atrasadas ?? 0}</b> atrasadas</span>
          </span>
        </div>
        ${diasTxt ? `<p class="portfolio-card-desc">${diasTxt}</p>` : ""}
      </a>
    `;
  }

  async function loadPortfolio() {
    const data = await api("/api/portfolio");
    const projetos = data.projetos || [];
    el.count.textContent = `${projetos.length} projeto(s)`;
    if (!projetos.length) {
      el.empty.hidden = false;
      el.grid.innerHTML = "";
      el.grid.appendChild(el.empty);
      return;
    }
    el.empty.hidden = true;
    el.grid.innerHTML = projetos.map(renderCard).join("");
  }

  el.btnSair.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    location.replace("/login.html");
  });

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
      location.href = "/";
    });
  }

  loadMe()
    .then(loadPortfolio)
    .catch((err) => {
      console.error(err);
      el.grid.innerHTML = `<p class="portfolio-empty">Erro ao carregar portfólio.</p>`;
    });
})();
