/* Tema antes do primeiro paint — sem flash em nenhum dos dois sentidos.
         Valores canônicos: "claro" | "escuro" (aceita legados "light"/"dark").
         Fallback inline cobre CSS antigo em cache; classes p/ CSS legado. */
(function () {
  var t;
  try {
    t = localStorage.getItem("qradmin-tema");
  } catch (e) {}
  if (t === "dark") t = "escuro";
  if (t === "light") t = "claro";
  if (t !== "claro" && t !== "escuro")
    t =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "escuro"
        : "claro";
  var root = document.documentElement;
  root.setAttribute("data-theme", t);
  root.classList.toggle("dark", t === "escuro");
  if (t === "escuro") {
    root.style.setProperty("--qr-page", "#141d19");
    root.style.setProperty("--qr-text", "#eef4ef");
    root.style.setProperty("--qr-white", "#1c2623");
  } else {
    root.style.setProperty("--qr-page", "#f5f7f4");
    root.style.setProperty("--qr-text", "#21382b");
    root.style.setProperty("--qr-white", "#ffffff");
  }
})();
