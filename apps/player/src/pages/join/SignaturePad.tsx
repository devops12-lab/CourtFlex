import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@courtflex/ui";

/**
 * Draw a signature with a finger, pen or mouse. Sends a PNG data URL after each
 * stroke, or null once cleared. People who can't draw use the typed option instead.
 */
export function SignaturePad({
  value,
  onChange,
  invalid,
  describedBy,
}: {
  value: string | null;
  onChange: (png: string | null) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [inked, setInked] = useState(!!value);

  // Size the drawing surface to the element, sharp on high-density screens.
  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#eef3f8";
    // Restore a signature drawn before the step was left and opened again.
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, width, height);
      img.src = value;
    }
    // Only on mount: the value is the canvas's own output after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "#eef3f8";
    ctx.fill();
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setInked(true);
    onChange(canvas.current!.toDataURL("image/png"));
  };

  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setInked(false);
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "relative overflow-hidden rounded-md border bg-court-deep",
          invalid ? "border-signal-red" : "border-line-faint",
        )}
      >
        <canvas
          ref={canvas}
          role="img"
          aria-label={inked ? "Your signature" : "Signature pad. Draw your signature with a finger or mouse."}
          aria-describedby={describedBy}
          className="block h-44 w-full cursor-crosshair touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {/* The signing line, like on paper. */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-6 bottom-10 left-6 border-b border-dashed border-line-dim/60"
        />
        {!inked && (
          <span aria-hidden className="pointer-events-none absolute bottom-3 left-6 text-xs text-line-dim">
            Sign above the line
          </span>
        )}
      </div>
      <div>
        <button
          type="button"
          onClick={clear}
          disabled={!inked}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ball disabled:text-line-dim"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Clear signature
        </button>
      </div>
    </div>
  );
}
