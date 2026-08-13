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

  function markActiveLinks() {
    const path = (location.pathname || "/").replace(/\/+$/, "") || "/";
    nav.querySelectorAll("a.btn-ghost").forEach((link) => {
      let href = link.getAttribute("href") || "";
      try {
        href = new URL(href, location.origin).pathname;
      } catch (_) {}
      href = href.replace(/\/+$/, "") || "/";
      const same =
        href === path ||
        (href.endsWith(".html") && path === href.replace(/\.html$/, "")) ||
        (path.endsWith(".html") && href === path.replace(/\.html$/, ""));
      if (same) {
        link.setAttribute("aria-current", "page");
        link.classList.add("is-active");
      } else {
        link.removeAttribute("aria-current");
        link.classList.remove("is-active");
      }
    });
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

  markActiveLinks();
})();
