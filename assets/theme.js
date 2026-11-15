(() => {
  let theme = "light";
  try {
    if (localStorage.getItem("kragon-theme") === "dark") theme = "dark";
  } catch {}
  document.documentElement.dataset.theme = theme;
  function updateControls() {
    const dark = document.documentElement.dataset.theme === "dark";
    document.querySelectorAll(".theme-toggle").forEach((button) => {
      const label = `Switch to ${dark ? "light" : "dark"} mode`;
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.setAttribute("aria-pressed", String(dark));
    });
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#111820" : "#f7f8fa");
  }
  document.addEventListener("DOMContentLoaded", () => {
    updateControls();
    document.querySelectorAll(".theme-toggle").forEach((button) => {
      button.addEventListener("click", () => {
        const next =
          document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("kragon-theme", next);
        } catch {}
        updateControls();
      });
    });
  });
})();
