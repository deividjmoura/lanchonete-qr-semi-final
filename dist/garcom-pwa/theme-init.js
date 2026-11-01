(function () {
  var CHAVE = "qradmin-tema";
  var TEMAS = {
    claro: {
      "--surface": "#eef1f8",
      "--surface-raised": "#f8faff",
      "--surface-sunken": "#e0e5f1",
      "--surface-sidebar": "#0b101b",
      "--text": "#121829",
      "--text-muted": "#48536d",
      "--brand": "#5b3fc4",
      "--brand-contrast": "#f8faff",
      "--brand-ink": "#4a32a6",
      "--accent": "#0a5a63",
      "--line": "#c7cfe0",
      "--line-strong": "#a5b0c8",
    },
    escuro: {
      "--surface": "#0b101b",
      "--surface-raised": "#141b29",
      "--surface-sunken": "#080d16",
      "--surface-sidebar": "#080d16",
      "--text": "#eef1fb",
      "--text-muted": "#a9b4cc",
      "--brand": "#8b6fff",
      "--brand-contrast": "#0b101b",
      "--brand-ink": "#b7a5ff",
      "--accent": "#4fd1e0",
      "--line": "#2a3348",
      "--line-strong": "#3b4660",
    },
  };
  var tema = "claro";
  try {
    var salvo = localStorage.getItem(CHAVE);
    if (salvo === "escuro" || salvo === "claro") tema = salvo;
    else if (salvo === "dark") tema = "escuro";
    else if (salvo === "light") tema = "claro";
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      tema = "escuro";
    }
  } catch (_) {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      tema = "escuro";
    }
  }
  var root = document.documentElement;
  root.setAttribute("data-theme", tema);
  root.classList.toggle("dark", tema === "escuro");
  var vars = TEMAS[tema];
  for (var nome in vars) root.style.setProperty(nome, vars[nome]);
  var meta = document.querySelector && document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", vars["--surface"]);
})();
