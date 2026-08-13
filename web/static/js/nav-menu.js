(() => {
  const nav = document.getElementById("userNav");
  const toggle = document.getElementById("userNavToggle");
  if (!nav || !toggle) return;

  const label = toggle.querySelector(".user-nav-toggle-label");

  function setOpen(open) {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (label) label.textContent = open ? "Fechar" : "Menu";
  }

  toggle.addEventListener("click", () => {
    setOpen(!nav.classList.contains("is-open"));
  });

  nav.addEventListener("click", (event) => {
    const target = event.target.closest("a, button");
    if (!target || target === toggle) return;
    if (window.matchMedia("(max-width: 900px)").matches) {
      setOpen(false);
    }
  });

  window.addEventListener("resize", () => {
    if (!window.matchMedia("(max-width: 900px)").matches) {
      setOpen(false);
    }
  });
})();
