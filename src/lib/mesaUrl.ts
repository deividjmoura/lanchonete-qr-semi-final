/** URL pública da mesa (QR fixo). Única fonte para copiar/baixar o código. */
export function mesaClienteUrl(token: string) {
  if (typeof window === "undefined") return `#/mesa/${token}`;
  const base = `${window.location.origin}${window.location.pathname || "/"}`.replace(/\/$/, "");
  return `${base}#/mesa/${token}`;
}

/** Nome estável do arquivo SVG baixado pelo admin. */
export function nomeArquivoQr(numero: number) {
  return `mesa-${String(numero).padStart(2, "0")}-qr.svg`;
}
