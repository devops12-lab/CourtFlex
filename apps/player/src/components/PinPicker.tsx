import { useEffect, useRef, useState } from "react";
import { Map as MapLibre, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
/** The whole Philippines, until there's a pin. */
const PH: [number, number] = [122.5, 12.3];

export interface Pin {
  lat: number;
  lng: number;
}

/**
 * Put a pin on the venue: tap the map, or drag the pin. Loaded lazily, like the
 * court map, so the sign-up form doesn't wait for it.
 */
export default function PinPicker({
  value,
  onChange,
  label,
}: {
  value: Pin | null;
  onChange: (pin: Pin) => void;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const marker = useRef<Marker | null>(null);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);
  const [failed, setFailed] = useState(() => !webglAvailable());

  // The latest pin, for a map that's (re)made after the pin was set.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const place = (m: MapLibre, pin: Pin | null) => {
    if (!pin) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      const el = document.createElement("span");
      el.className = "block size-6 rounded-full border-4 border-court-deep bg-ball ring-4 ring-ball/40";
      el.setAttribute("aria-label", "Venue pin");
      const mk = new Marker({ element: el, draggable: true }).setLngLat([pin.lng, pin.lat]).addTo(m);
      mk.on("dragend", () => {
        const p = mk.getLngLat();
        changed.current({ lat: p.lat, lng: p.lng });
      });
      marker.current = mk;
    } else {
      marker.current.setLngLat([pin.lng, pin.lat]);
    }
    if (m.getZoom() < 13) m.jumpTo({ center: [pin.lng, pin.lat], zoom: 16 });
  };

  useEffect(() => {
    if (!box.current || failed) return;
    const start = latest.current;
    const m = new MapLibre({
      container: box.current,
      style: STYLE_URL,
      center: start ? [start.lng, start.lat] : PH,
      zoom: start ? 16 : 4.6,
      attributionControl: { compact: true },
    });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.on("error", (e) => {
      if (!m.isStyleLoaded() && String(e.error?.message ?? "").length) setFailed(true);
    });
    m.on("click", (e) => changed.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    map.current = m;
    place(m, start);
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      // The pin belongs to this map: a new map gets its own.
      marker.current?.remove();
      marker.current = null;
      map.current = null;
      m.remove();
    };
    // The map is made once; the pin follows `value` below.
  }, [failed]);

  useEffect(() => {
    if (map.current) place(map.current, value);
  }, [value]);

  if (failed) {
    return (
      <div className="grid h-full place-items-center rounded-2xl border border-line-faint p-6 text-center text-sm text-line-dim">
        The map couldn't load on this device or connection. Use "Use my location" while you're at the venue.
      </div>
    );
  }
  return (
    <div
      ref={box}
      role="region"
      aria-label={label}
      className="h-full w-full cursor-crosshair overflow-hidden rounded-2xl border border-line-faint"
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
