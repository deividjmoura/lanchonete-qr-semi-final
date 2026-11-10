(function () {
  var CHAVE = "qradmin-tema";
  var tema = null;
  try {
    var salvo = localStorage.getItem(CHAVE);
    if (salvo === "escuro" || salvo === "dark") tema = "escuro";
    else if (salvo === "claro" || salvo === "light") tema = "claro";
  } catch (_) {}
  if (!tema) tema = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
  var root = document.documentElement;
  root.setAttribute("data-theme", tema);
  root.classList.toggle("dark", tema === "escuro");
  root.style.colorScheme = tema === "escuro" ? "dark" : "light";
  var meta = document.querySelector && document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tema === "escuro" ? "#142622" : "#f0f4f0");
})();
