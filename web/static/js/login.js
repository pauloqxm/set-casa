(() => {
  const form = document.getElementById("loginForm");
  const usuario = document.getElementById("loginUsuario");
  const senha = document.getElementById("loginSenha");
  const error = document.getElementById("loginError");
  const submit = document.getElementById("loginSubmit");
  const toggle = document.getElementById("toggleSenha");

  async function ensureLoggedOut() {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.usuario) {
        location.replace("/portfolio.html");
      }
    } catch (_) {}
  }

  toggle.addEventListener("click", () => {
    const show = senha.type === "password";
    senha.type = show ? "text" : "password";
    toggle.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
    toggle.title = show ? "Ocultar senha" : "Mostrar senha";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    submit.disabled = true;
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuario: usuario.value.trim(),
          senha: senha.value,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        error.textContent = data.erro || "Não foi possível entrar.";
        error.hidden = false;
        return;
      }
      location.replace("/portfolio.html");
    } catch (_) {
      error.textContent = "Falha de conexão com o servidor.";
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });

  ensureLoggedOut();
})();
