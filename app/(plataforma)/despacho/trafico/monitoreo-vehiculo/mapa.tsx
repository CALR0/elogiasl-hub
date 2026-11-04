"use client";

import { useEffect, useRef } from "react";
import { useEstadoSesion } from "@/components/sesion/memoria-sesion";
import type { Vehiculo, ViajeResumen } from "@/lib/controlt/tipos";
import { fechaHora } from "@/lib/utils";

/*
 * Mapa Leaflet con los vehículos localizados. Leaflet se carga por CDN la
 * primera vez (CSS + JS) para no agregar una dependencia npm. El marcador es
 * un SVG inline de camión con la paleta salvia y el popup incluye los datos
 * del viaje asociado si Control T lo trajo.
 */

interface LatLngLike {
  lat: number;
  lng: number;
}
interface LeafletMap {
  setView(center: [number, number], zoom: number): LeafletMap;
  removeLayer(layer: unknown): void;
  fitBounds(bounds: unknown, opts?: Record<string, unknown>): void;
  remove(): void;
  invalidateSize(): void;
}
interface LeafletMarker {
  addTo(map: LeafletMap): LeafletMarker;
  bindPopup(html: string, opts?: Record<string, unknown>): LeafletMarker;
  getLatLng(): LatLngLike;
  openPopup(): LeafletMarker;
}
interface LeafletNS {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap;
  tileLayer: (
    url: string,
    opts: Record<string, unknown>,
  ) => { addTo(map: LeafletMap): unknown };
  marker: (
    latlng: [number, number],
    opts?: Record<string, unknown>,
  ) => LeafletMarker;
  divIcon: (opts: Record<string, unknown>) => unknown;
  latLngBounds: (points: [number, number][]) => unknown;
}

declare global {
  interface Window {
    L?: LeafletNS;
    __leafletCargando?: Promise<LeafletNS>;
  }
}

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

async function cargarLeaflet(): Promise<LeafletNS> {
  if (window.L) return window.L;
  if (!window.__leafletCargando) {
    window.__leafletCargando = new Promise<LeafletNS>((resolve, reject) => {
      if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = LEAFLET_CSS;
        document.head.appendChild(link);
      }
      const script = document.createElement("script");
      script.src = LEAFLET_JS;
      script.crossOrigin = "anonymous";
      script.onload = () => {
        if (window.L) resolve(window.L);
        else reject(new Error("Leaflet no se cargó."));
      };
      script.onerror = () => reject(new Error("No se pudo cargar Leaflet."));
      document.head.appendChild(script);
    });
  }
  return window.__leafletCargando;
}

const escape = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Fila key/valor del popup. Devuelve cadena vacía si no hay valor. */
const fila = (etq: string, valor: string | null | undefined): string =>
  valor
    ? `<div style="display:flex;justify-content:space-between;gap:16px;padding:2px 0"><span style="color:#64736a">${escape(etq)}</span><span style="font-weight:500;text-align:right;max-width:240px">${escape(String(valor))}</span></div>`
    : "";

function popupHtml(v: Vehiculo, viaje: ViajeResumen | undefined) {
  const fechaGps = v.fechaGps ? fechaHora(v.fechaGps) : null;
  const seccion = (titulo: string, filas: string) =>
    filas.trim()
      ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e5e2"><div style="font-weight:600;color:#2f5d50;margin-bottom:4px;text-transform:uppercase;font-size:10px;letter-spacing:.04em">${titulo}</div>${filas}</div>`
      : "";
  const ubicacion =
    fila("Dirección", v.direccion) +
    fila("Último GPS", fechaGps) +
    fila("Prestador", v.prestadorGps) +
    (v.temperatura !== null ? fila("Temperatura", `${v.temperatura} °C`) : "");
  const datosViaje = viaje
    ? fila("Manifiesto", viaje.manifiesto ?? "Sin asignar") +
      fila("Estado", viaje.estado) +
      fila(
        "Avance",
        viaje.avance !== null ? `${viaje.avance}%` : null,
      ) +
      fila("Ruta", viaje.ruta) +
      fila("Origen", viaje.origen ?? viaje.ciudadOrigen) +
      fila("Destino", viaje.destino ?? viaje.ciudadDestino) +
      fila("Conductor", viaje.conductor) +
      fila("Teléfono", viaje.telefonoConductor) +
      fila("Transportador", viaje.transportador) +
      fila("Cliente", viaje.cliente) +
      fila("Último evento", viaje.ultimoEvento) +
      fila("Comentario", viaje.comentario) +
      fila("Observaciones", viaje.observaciones)
    : "";
  return `
    <div style="font-family:system-ui,sans-serif;font-size:12px;min-width:260px;max-width:320px">
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#2f5d50">${escape(v.placa)}</div>
      ${seccion("Ubicación", ubicacion)}
      ${seccion("Viaje", datosViaje)}
      ${!viaje ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e5e2;color:#64736a;font-style:italic">Sin manifiesto asignado.</div>` : ""}
    </div>
  `;
}

// Pin "gota" de 38×38: Leaflet lo posiciona con iconAnchor; aquí NO se añade
// ningún transform de posición al HTML (si se añade, el pin queda desfasado).
const ICONO_CAMION = `
  <span style="display:inline-flex;width:38px;height:38px;align-items:center;justify-content:center;background:#2f5d50;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.3)">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(45deg)">
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
      <path d="M15 18H9"/>
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
      <circle cx="17" cy="18" r="2"/>
      <circle cx="7" cy="18" r="2"/>
    </svg>
  </span>
`;

const CAPA_OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const CAPA_SAT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function pintarVehiculos(
  L: LeafletNS,
  mapa: LeafletMap,
  previos: LeafletMarker[],
  vehiculos: Vehiculo[],
  viajes: ViajeResumen[],
): LeafletMarker[] {
  for (const m of previos) mapa.removeLayer(m);
  if (!vehiculos.length) return [];
  // iconAnchor Y=34 (no 38): la "punta" visual de la gota está ~4 px arriba
  // del borde inferior del cuadrado 38×38 por la rotación de 45°.
  const icono = L.divIcon({
    className: "",
    html: ICONO_CAMION,
    iconSize: [38, 38],
    iconAnchor: [19, 34],
    popupAnchor: [0, -34],
  });
  const nuevos: LeafletMarker[] = [];
  const puntos: [number, number][] = [];
  for (const v of vehiculos) {
    const viaje = viajes.find((j) => j.placa === v.placa);
    const m = L.marker([v.latitud, v.longitud], { icon: icono })
      .bindPopup(popupHtml(v, viaje), { maxWidth: 340 })
      .addTo(mapa);
    nuevos.push(m);
    puntos.push([v.latitud, v.longitud]);
  }
  if (puntos.length === 1) {
    mapa.setView(puntos[0], 14);
    nuevos[0].openPopup();
  } else {
    // Varios vehículos: encuadra todos y deja los popups cerrados (el usuario abre el que quiera)
    mapa.fitBounds(L.latLngBounds(puntos), { padding: [60, 60] });
  }
  return nuevos;
}

export function MapaVehiculos({
  vehiculos,
  viajes,
}: {
  vehiculos: Vehiculo[];
  viajes: ViajeResumen[];
}) {
  const refEl = useRef<HTMLDivElement | null>(null);
  const refMapa = useRef<LeafletMap | null>(null);
  const refMarcadores = useRef<LeafletMarker[]>([]);
  const [satelital, setSatelital] = useEstadoSesion(
    "controlt.satelital",
    false,
  );

  // Monta el mapa una sola vez
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const L = await cargarLeaflet();
      if (cancelado || !refEl.current || refMapa.current) return;
      const mapa = L.map(refEl.current, {
        center: [4.570868, -74.297333],
        zoom: 6,
        zoomControl: true,
        attributionControl: false,
      });
      L.tileLayer(satelital ? CAPA_SAT : CAPA_OSM, { maxZoom: 19 }).addTo(mapa);
      refMapa.current = mapa;
      refMarcadores.current = pintarVehiculos(L, mapa, [], vehiculos, viajes);
    })();
    return () => {
      cancelado = true;
      refMapa.current?.remove();
      refMapa.current = null;
      refMarcadores.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rehace la capa base al cambiar el modo satelital
  useEffect(() => {
    const L = window.L;
    const mapa = refMapa.current;
    const nodo = refEl.current;
    if (!L || !mapa || !nodo) return;
    mapa.remove();
    const nuevo = L.map(nodo, {
      center: [4.570868, -74.297333],
      zoom: 6,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer(satelital ? CAPA_SAT : CAPA_OSM, { maxZoom: 19 }).addTo(nuevo);
    refMapa.current = nuevo;
    refMarcadores.current = pintarVehiculos(L, nuevo, [], vehiculos, viajes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satelital]);

  // Repinta al cambiar vehículos o viajes
  useEffect(() => {
    const L = window.L;
    const mapa = refMapa.current;
    if (!L || !mapa) return;
    refMarcadores.current = pintarVehiculos(
      L,
      mapa,
      refMarcadores.current,
      vehiculos,
      viajes,
    );
  }, [vehiculos, viajes]);

  // Si el viewport cambia de tamaño (p. ej. el usuario abre/cierra la DevTools),
  // Leaflet necesita recalcular o los tiles quedan en blanco.
  useEffect(() => {
    const el = refEl.current;
    const mapa = refMapa.current;
    if (!el || !mapa || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => mapa.invalidateSize());
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // `isolate` crea un contexto de apilamiento propio: así los controles de
  // Leaflet (que internamente usan z-index 1000) no se cuelan por encima del
  // encabezado de la plataforma (z-20) al hacer scroll.
  return (
    <div className="relative isolate z-0 min-w-0">
      <div
        ref={refEl}
        className="bg-muted h-[420px] w-full rounded-xl border md:h-[520px] lg:h-[640px]"
        role="application"
        aria-label="Mapa de vehículos"
      />
      <button
        type="button"
        onClick={() => setSatelital((s) => !s)}
        className="bg-card hover:bg-secondary absolute top-3 right-3 z-10 rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm"
        title={satelital ? "Ver mapa" : "Ver satélite"}
      >
        {satelital ? "Mapa" : "Satélite"}
      </button>
    </div>
  );
}
