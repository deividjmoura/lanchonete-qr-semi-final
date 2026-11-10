/* Roda no <head>, antes do primeiro paint, no SPA (/) e no PWA do garçom
   (/garcom-pwa/). Decide o tema claro/escuro e, só no SPA, qual identidade
   veste o documento: "Passe" (padrão) ou a do cardápio do cliente, que ficou
   fora do rebranding e precisa continuar exatamente como era.
   Nenhum token é fixado inline: os valores vêm do design-tokens.css. */
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

  /* Mesma regra de src/lib/identidade.ts (rotaEhCardapio): primeira parte do
     hash igual a "mesa". O PWA do garçom nunca é o cardápio. */
  var local = typeof location !== "undefined" ? location : null;
  var caminho = local ? String(local.hash || "").replace(/^#/, "").split("?")[0] : "";
  var cardapio =
    !!local &&
    !/\/garcom-pwa\//.test(String(local.pathname || "")) &&
    caminho.split("/").filter(Boolean)[0] === "mesa";
  if (cardapio) root.setAttribute("data-identidade", "cardapio");

  /* Cor da barra do navegador = --surface da identidade e do tema em uso.
     O CSS ainda não carregou aqui, por isso os quatro valores são repetidos
     (tests/design-system.test.cjs confere cada um contra os tokens). */
  var COR = cardapio ? { claro: "#e4e8f1", escuro: "#0b101b" } : { claro: "#f4efe6", escuro: "#081726" };
  var consultar = document.querySelector ? function (seletor) { return document.querySelector(seletor); } : function () { return null; };
  var meta = consultar('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", COR[tema]);

  /* O cardápio mantém o ícone de aba que sempre teve. */
  if (cardapio) {
    var icone = consultar('link[rel="icon"]');
    var toque = consultar('link[rel="apple-touch-icon"]');
    if (icone) icone.setAttribute("href", "/logo/favicon.png");
    if (toque) toque.setAttribute("href", "/logo/favicon.png");
  }
})();
