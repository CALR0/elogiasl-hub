import { Route } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <span className="bg-secondary text-accent-foreground flex size-14 items-center justify-center rounded-2xl">
        <Route className="size-6" aria-hidden />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">
        Esta ruta no existe
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        La página que buscas no está en el mapa de la plataforma.
      </p>
      <ButtonLink href="/inicio" className="mt-3">
        Volver al inicio
      </ButtonLink>
    </main>
  );
}
