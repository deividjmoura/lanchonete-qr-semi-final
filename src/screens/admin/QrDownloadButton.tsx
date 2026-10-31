import { DownloadSimple } from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { QR_SVG_COLORS } from "../../lib/tema";
import { mesaClienteUrl, nomeArquivoQr } from "../../lib/mesaUrl";
import { cn } from "../../utils/cn";

/**
 * Botão de download do QR em SVG.
 *
 * O QR só é renderizado quando o download é pedido: com 70 mesas na tela,
 * manter 70 SVGs de 320px montados custaria memória sem nenhum ganho.
 * O SVG oculto fica fora da área visível e é removido logo após o download.
 */
export function QrDownloadButton({
  numero,
  token,
  className,
  children,
  title,
}: {
  numero: number;
  token: string;
  className?: string;
  children?: ReactNode;
  title?: string;
}) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [pendente, setPendente] = useState(false);

  useEffect(() => {
    if (!pendente) return;
    const svg = ref.current;
    if (!svg) return;
    const copia = svg.cloneNode(true) as SVGSVGElement;
    copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const arquivo = new Blob([new XMLSerializer().serializeToString(copia)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const endereco = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    link.href = endereco;
    link.download = nomeArquivoQr(numero);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(endereco);
    setPendente(false);
  }, [pendente, numero]);

  return (
    <>
      <button
        type="button"
        title={title || "Baixar QR em SVG"}
        aria-label={`Baixar QR da mesa ${numero}`}
        onClick={() => setPendente(true)}
        className={cn(
          "size-10 shrink-0 inline-flex items-center justify-center rounded-sm border border-line bg-surface-sunken text-text-muted hover:text-text hover:border-line-strong",
          className,
        )}
      >
        {children || <DownloadSimple size={16} />}
      </button>
      {pendente && (
        <div aria-hidden="true" className="absolute -left-[9999px] top-0 pointer-events-none">
          <QRCodeSVG
            ref={ref}
            value={mesaClienteUrl(token)}
            size={320}
            includeMargin
            level="H"
            fgColor={QR_SVG_COLORS.fg}
            bgColor={QR_SVG_COLORS.bg}
          />
        </div>
      )}
    </>
  );
}
