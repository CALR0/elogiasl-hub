import {
  ArrowLeftRight,
  ClipboardCheck,
  CloudUpload,
  Database,
  FileCheck,
  FileDown,
  FilePlus,
  FileText,
  History,
  KeyRound,
  Landmark,
  ListChecks,
  Receipt,
  ScrollText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  CarFront,
  type LucideIcon,
} from "lucide-react";
import type { IconoModulo as Nombre } from "@/lib/modulos";

/**
 * Los nodos de lib/modulos.ts guardan el ícono por nombre (no el componente)
 * para poder pasarlos de un Server Component a un Client Component.
 */
const ICONOS: Record<Nombre, LucideIcon> = {
  despacho: Truck,
  manifiesto: FileText,
  cumplido: FileCheck,
  expedir: Send,
  subir: CloudUpload,
  financiero: Landmark,
  factura: Receipt,
  transferencia: ArrowLeftRight,
  anticipo: CloudUpload,
  maestros: Database,
  vehiculo: CarFront,
  ficha: FileDown,
  estudios: ShieldCheck,
  solicitar: FilePlus,
  solicitudes: ListChecks,
  verificar: ClipboardCheck,
  historial: History,
  auditoria: ScrollText,
  logs: Search,
  configuracion: Settings,
  roles: KeyRound,
  usuarios: Users,
};

export function IconoModulo({
  nombre,
  className,
}: {
  nombre: Nombre;
  className?: string;
}) {
  const Icono = ICONOS[nombre];
  return <Icono className={className} aria-hidden />;
}
