import type { ZodType } from "zod";
import type { ApiEnvelope, ApiValidationBody } from "./types";

let baseUrl = "/api/v1";

export function configureApi(options: { baseUrl: string }) {
  baseUrl = options.baseUrl.replace(/\/$/, "");
}

// ── Simulated offline (for development and tests) ─────────
// Lets us see offline states without unplugging. Real offline still comes
// from the browser; see useOnline in @courtflex/ui.

let simulatedOffline = false;
const networkListeners = new Set<() => void>();

export function setSimulatedOffline(offline: boolean) {
  simulatedOffline = offline;
  networkListeners.forEach((l) => l());
}

export function isSimulatedOffline() {
  return simulatedOffline;
}

export function subscribeSimulatedNetwork(listener: () => void) {
  networkListeners.add(listener);
  return () => {
    networkListeners.delete(listener);
  };
}

// ── Errors ────────────────────────────────────────────────

/** network: no response. http: the server said no. contract: the response wasn't what we expect. */
export type ApiErrorKind = "network" | "http" | "contract";

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly errors: Record<string, string[]>;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(status: number, body: ApiValidationBody, kind: ApiErrorKind = "http") {
    super(body.message);
    this.status = status;
    this.kind = kind;
    this.errors = body.errors ?? {};
    this.code = body.code;
    this.details = body.details;
  }

  /** First error for a field, for showing under an input. */
  field(name: string): string | undefined {
    return this.errors[name]?.[0];
  }

  get isUnauthenticated() {
    return this.status === 401;
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

const offlineError = () =>
  new ApiError(0, { message: "Can't reach CourtFlex. Check your connection and try again." }, "network");

/**
 * Calls the Laravel API. Auth uses Sanctum's cookie session: no tokens are
 * stored in JavaScript. The XSRF cookie is echoed back as a header.
 * Pass a schema to check the response shape before the UI uses it.
 */
export async function api<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | undefined>;
    schema?: ZodType<T>;
  } = {},
): Promise<T> {
  if (simulatedOffline) throw offlineError();

  const url = new URL(baseUrl + path, window.location.origin);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const xsrf = readCookie("XSRF-TOKEN");
  if (xsrf) headers["X-XSRF-TOKEN"] = xsrf;

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET",
      headers,
      credentials: "include",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw offlineError();
  }

  if (response.status === 204) return undefined as T;

  const json = (await response.json().catch(() => ({}))) as ApiEnvelope<T> | ApiValidationBody;

  if (!response.ok) {
    const body = json as ApiValidationBody;
    throw new ApiError(response.status, {
      message: body.message || `Request failed (${response.status}).`,
      errors: body.errors,
      code: body.code,
      details: body.details,
    });
  }

  const data = (json as ApiEnvelope<T>).data;
  if (!init.schema) return data;

  const parsed = init.schema.safeParse(data);
  if (!parsed.success) {
    console.error(`Unexpected response from ${init.method ?? "GET"} ${path}`, parsed.error.issues);
    throw new ApiError(
      response.status,
      {
        message:
          "CourtFlex got a response it didn't expect. Reload the page, and contact support if it keeps happening.",
      },
      "contract",
    );
  }
  return parsed.data;
}
