import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  CaretDown,
  ChartLine,
  Check,
  Clock,
  CreditCard,
  DeviceMobile,
  EnvelopeSimple,
  ForkKnife,
  Info,
  List,
  Monitor,
  Package,
  Plus,
  QrCode,
  Receipt,
  SquaresFour,
  Stack,
  Table,
  Users,
  Wallet,
  WhatsappLogo,
  X,
} from "@phosphor-icons/react";

const icons = {
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  "arrow-down": ArrowDown,
  "arrow-up": ArrowUp,
  "chevron-down": CaretDown,
  menu: List,
  close: X,
  grid: SquaresFour,
  table: Table,
  qr: QrCode,
  receipt: Receipt,
  users: Users,
  wallet: Wallet,
  chart: ChartLine,
  clock: Clock,
  check: Check,
  utensils: ForkKnife,
  phone: DeviceMobile,
  monitor: Monitor,
  card: CreditCard,
  box: Package,
  layers: Stack,
  info: Info,
  plus: Plus,
  whatsapp: WhatsappLogo,
  mail: EnvelopeSimple,
} as const;

export type IconName = keyof typeof icons;

export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Glyph = icons[name as IconName] ?? SquaresFour;
  return <Glyph aria-hidden="true" className={className} size={size} weight="regular" />;
}
