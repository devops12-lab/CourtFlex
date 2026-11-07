import { useEffect, useRef, useState } from "react";
import { Map as MapLibre, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre draws in a web worker; bundlers move the file, so point MapLibre at it explicitly.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

setWorkerUrl(workerUrl);
import type { VenueResult } from "@courtflex/api";
import { pesos } from "@courtflex/features";

/** Free dark basemap, no key. Swap for Google Maps or Mapbox here if the project chooses one (blueprint §3). */
const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

/**
 * Venues as price pins on a dark map. The selected venue's pin turns ball-yellow.
 * Loaded lazily, so people who only use the list never download the map.
 */
export default function VenueMap({
  venues,
  selectedId,
  onSelect,
  me,
}: {
  venues: VenueResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  me: { lat: number; lng: number } | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const markers = useRef<Marker[]>([]);
  const fit = useRef<(() => void) | null>(null);
  // MapLibre needs WebGL. Without it, say so and leave the list to do the work.
  const [failed, setFailed] = useState(() => !webglAvailable());

  useEffect(() => {
    if (!box.current || failed) return;
    const m = new MapLibre({
      container: box.current,
      style: STYLE_URL,
      center: [121.6, 14.0],
      zoom: 8,
      attributionControl: { compact: true },
    });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.on("error", (e) => {
      // A missing tile now and then is fine; a broken style or WebGL means no map at all.
      if (!m.isStyleLoaded() && String(e.error?.message ?? "").length) setFailed(true);
    });
    m.on("load", () => {
      // Pull the basemap toward the court-blue palette.
      for (const layer of m.getStyle().layers ?? []) {
        if (layer.type === "background") m.setPaintProperty(layer.id, "background-color", "#001321");
        if (layer.id.includes("water") && layer.type === "fill")
          m.setPaintProperty(layer.id, "fill-color", "#07233a");
      }
    });
    map.current = m;
    // The box can change size after the map starts (lazy loading, switching views, rotating a phone).
    // Measure again and fit the venues to the new size.
    const ro = new ResizeObserver(() => {
      m.resize();
      fit.current?.();
    });
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      m.remove();
    };
  }, [failed]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    for (const v of venues) {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `${v.name}, from ${pesos(v.price_from)} an hour`);
      el.textContent = pesos(v.price_from);
      el.className =
        v.id === selectedId
          ? "min-h-9 rounded-full border-2 border-ball-ink bg-ball px-3 py-1.5 text-xs font-bold text-ball-ink shadow-lg"
          : "min-h-9 rounded-full border-2 border-line bg-court-deep px-3 py-1.5 text-xs font-bold text-line shadow-lg hover:bg-court-raised";
      el.addEventListener("click", () => onSelect(v.id));
      markers.current.push(new Marker({ element: el }).setLngLat([v.longitude, v.latitude]).addTo(m));
    }
    if (me) {
      const dot = document.createElement("span");
      dot.className = "block size-4 rounded-full border-2 border-court-deep bg-ball ring-4 ring-ball/30";
      dot.setAttribute("aria-label", "You are here");
      markers.current.push(new Marker({ element: dot }).setLngLat([me.lng, me.lat]).addTo(m));
    }
    const points = [
      ...venues.map((v) => [v.longitude, v.latitude] as [number, number]),
      ...(me ? [[me.lng, me.lat] as [number, number]] : []),
    ];
    fit.current = () => {
      if (points.length === 1) m.jumpTo({ center: points[0], zoom: 13 });
      if (points.length > 1) {
        const lngs = points.map((p) => p[0]);
        const lats = points.map((p) => p[1]);
        m.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 60, maxZoom: 13, duration: 0 },
        );
      }
    };
    fit.current();
  }, [venues, selectedId, me, onSelect]);

  if (failed) {
    return (
      <div className="grid h-full place-items-center rounded-md border border-line-faint p-6 text-center text-line-dim">
        The map couldn't load on this device or connection. The list shows the same courts.
      </div>
    );
  }
  return (
    <div
      ref={box}
      className="h-full w-full overflow-hidden rounded-md border border-line-faint"
      role="region"
      aria-label="Map of courts"
    />
  );
}

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
