(function () {
  var CHAVE = "qradmin-tema";
  var TEMAS = {
    claro: {
      "--surface": "#f0e6d2",
      "--surface-raised": "#f7f0e2",
      "--surface-sunken": "#e5d8be",
      "--surface-sidebar": "#17120e",
      "--text": "#17120e",
      "--text-muted": "#594b3e",
      "--brand": "#bf3b11",
      "--brand-contrast": "#f7f0e2",
      "--brand-ink": "#b5360d",
      "--accent": "#c99a2e",
      "--line": "#cfc0a3",
      "--line-strong": "#b09d7b",
    },
    escuro: {
      "--surface": "#141813",
      "--surface-raised": "#1c211b",
      "--surface-sunken": "#0f120e",
      "--surface-sidebar": "#100c09",
      "--text": "#ede5d5",
      "--text-muted": "#b0a795",
      "--brand": "#e8501f",
      "--brand-contrast": "#17120e",
      "--brand-ink": "#ff7d52",
      "--accent": "#c99a2e",
      "--line": "#2e362c",
      "--line-strong": "#434e40",
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
