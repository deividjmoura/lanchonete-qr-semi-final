import { useCallback, useEffect, useRef, useState } from "react";
import type { Pagina } from "../lib/api";

type ComId = { id: number };
type Dados<T> = {
  itens: T[];
  proximoCursor: string | null;
  primeira: Pagina<T> | null;
  paginas: number;
};

function mensagem(e: unknown) {
  return e instanceof Error ? e.message : "Falha ao carregar a lista.";
}

function validarPagina<T>(pagina: Pagina<T>): Pagina<T> {
  if (!pagina || !Array.isArray(pagina.itens) ||
      (pagina.proximoCursor !== null && typeof pagina.proximoCursor !== "string")) {
    throw new Error("Resposta de paginação inválida.");
  }
  return pagina;
}

/**
 * Carrega uma página por vez e descarta respostas antigas quando a consulta
 * muda ou o componente desmonta. O polling só substitui a primeira página
 * quando ela é a única carregada; com páginas adicionais, avisa sobre mudanças
 * para não deslocar linhas nem perder a posição de quem está consultando.
 */
export function usePaginacaoCursor<T extends ComId>(
  buscar: (cursor: string | null) => Promise<Pagina<T>>,
  intervaloMs = 0,
) {
  const dados = useRef<Dados<T>>({ itens: [], proximoCursor: null, primeira: null, paginas: 0 });
  const montado = useRef(false);
  const sequencia = useRef(0);
  const ocupado = useRef(false);
  const [itens, setItens] = useState<T[]>([]);
  const [proximoCursor, setProximoCursor] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [alterado, setAlterado] = useState(false);
  const [expandida, setExpandida] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const aplicarPrimeira = useCallback((pagina: Pagina<T>) => {
    dados.current = {
      itens: pagina.itens,
      proximoCursor: pagina.proximoCursor,
      primeira: pagina,
      paginas: 1,
    };
    setItens(pagina.itens);
    setProximoCursor(pagina.proximoCursor);
    setAlterado(false);
    setExpandida(false);
  }, []);

  const atualizar = useCallback(async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    const pedido = ++sequencia.current;
    setCarregando(true);
    setErro(null);
    try {
      const pagina = validarPagina(await buscar(null));
      if (!montado.current || pedido !== sequencia.current) return;
      aplicarPrimeira(pagina);
    } catch (e) {
      if (montado.current && pedido === sequencia.current) setErro(mensagem(e));
    } finally {
      if (pedido === sequencia.current) {
        ocupado.current = false;
        if (montado.current) setCarregando(false);
      }
    }
  }, [buscar, aplicarPrimeira]);

  const carregarMais = useCallback(async () => {
    const cursor = dados.current.proximoCursor;
    if (ocupado.current || !cursor) return;
    ocupado.current = true;
    const pedido = ++sequencia.current;
    setCarregandoMais(true);
    setErro(null);
    try {
      const pagina = validarPagina(await buscar(cursor));
      if (pagina.proximoCursor === cursor) throw new Error("Cursor de página não avançou.");
      if (!montado.current || pedido !== sequencia.current) return;
      const conhecidos = new Set(dados.current.itens.map((item) => item.id));
      const novos = pagina.itens.filter((item) => !conhecidos.has(item.id));
      const todos = [...dados.current.itens, ...novos];
      dados.current = { ...dados.current, itens: todos, proximoCursor: pagina.proximoCursor, paginas: dados.current.paginas + 1 };
      setItens(todos);
      setProximoCursor(pagina.proximoCursor);
      setExpandida(true);
    } catch (e) {
      if (montado.current && pedido === sequencia.current) setErro(mensagem(e));
    } finally {
      if (pedido === sequencia.current) {
        ocupado.current = false;
        if (montado.current) setCarregandoMais(false);
      }
    }
  }, [buscar]);

  const verificar = useCallback(async () => {
    if (ocupado.current || dados.current.paginas === 0) return;
    ocupado.current = true;
    const pedido = ++sequencia.current;
    setVerificando(true);
    try {
      const pagina = validarPagina(await buscar(null));
      if (!montado.current || pedido !== sequencia.current) return;
      if (dados.current.paginas === 1) aplicarPrimeira(pagina);
      else setAlterado(JSON.stringify(pagina) !== JSON.stringify(dados.current.primeira));
      setErro(null);
    } catch (e) {
      if (montado.current && pedido === sequencia.current) setErro(mensagem(e));
    } finally {
      if (pedido === sequencia.current) {
        ocupado.current = false;
        if (montado.current) setVerificando(false);
      }
    }
  }, [buscar, aplicarPrimeira]);

  const recolher = useCallback(() => {
    if (!ocupado.current && dados.current.primeira) {
      aplicarPrimeira(dados.current.primeira);
      setErro(null);
    }
  }, [aplicarPrimeira]);

  useEffect(() => {
    montado.current = true;
    ocupado.current = false;
    dados.current = { itens: [], proximoCursor: null, primeira: null, paginas: 0 };
    setItens([]);
    setProximoCursor(null);
    setAlterado(false);
    setExpandida(false);
    setCarregandoMais(false);
    setVerificando(false);
    void atualizar();
    const timer = intervaloMs > 0 ? window.setInterval(() => void verificar(), intervaloMs) : null;
    return () => {
      montado.current = false;
      sequencia.current++;
      ocupado.current = false;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [atualizar, verificar, intervaloMs]);

  return { itens, temMais: Boolean(proximoCursor), expandida, carregando, carregandoMais, verificando, alterado, erro, atualizar, carregarMais, recolher };
}
