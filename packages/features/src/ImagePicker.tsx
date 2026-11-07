import { useId, useState } from "react";
import { ImageUp, X } from "lucide-react";
import { cn } from "@courtflex/ui";

const MAX_BYTES = 1_000_000;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Pick a logo or cover image. Until the backend's file storage exists the image
 * is sent inline as a data URL; the API checks type and size again.
 */
export function ImagePicker({
  label,
  hint,
  value,
  onChange,
  shape = "square",
  disabled,
  error,
  maxBytes = MAX_BYTES,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  shape?: "square" | "wide";
  disabled?: boolean;
  error?: string;
  /** Largest file accepted. 1 MB by default; receipts allow 5 MB. */
  maxBytes?: number;
}) {
  const id = useId();
  const [problem, setProblem] = useState<string | null>(null);
  const message = problem ?? error;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium" id={`${id}-label`}>
        {label}
      </span>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "grid shrink-0 place-items-center overflow-hidden rounded-md border border-dashed border-line-faint bg-court-deep",
            shape === "square" ? "size-20" : "h-20 w-48",
          )}
        >
          {value ? (
            <img src={value} alt="" className="size-full object-cover" />
          ) : (
            <ImageUp className="size-6 text-line-dim" aria-hidden />
          )}
        </div>
        <div className="flex flex-col items-start gap-2">
          <label
            className={cn(
              "inline-flex h-9 cursor-pointer items-center rounded-sm border border-line/70 px-3 text-sm font-semibold hover:bg-court-raised has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ball",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            {value ? "Replace image" : "Upload image"}
            <input
              type="file"
              accept={TYPES.join(",")}
              className="sr-only"
              aria-labelledby={`${id}-label`}
              disabled={disabled}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (!TYPES.includes(file.type)) return setProblem("Use a PNG, JPG or WebP image.");
                if (file.size > maxBytes)
                  return setProblem(
                    `That image is over ${Math.round(maxBytes / 1_000_000)} MB. Use a smaller one.`,
                  );
                setProblem(null);
                const reader = new FileReader();
                reader.onload = () => onChange(String(reader.result));
                reader.readAsDataURL(file);
              }}
            />
          </label>
          {value && !disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1 text-sm text-line-dim hover:text-line"
            >
              <X className="size-3.5" aria-hidden />
              Remove
            </button>
          )}
        </div>
      </div>
      {message ? (
        <p className="text-sm text-signal-red">{message}</p>
      ) : (
        hint && <p className="text-sm text-line-dim">{hint}</p>
      )}
    </div>
  );
}
