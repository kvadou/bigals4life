export type Activity = "league" | "prebowl" | "practice" | "social";
export type Audience = "team" | "invited" | "only-me";
export type StudioSession = { id: string; activity: Activity; audience: Audience; scorebookId: string | null; teamScopeId: string | null; title: string; expiresAt: string; canPublish: boolean };
export type Health = { connections: number; cameraCount: number; receivingCount: number; observedAt: string; evidence: "client-reported" };
export type Observation = { frames: number; bytes: number };
export const activityNames: Record<Activity,string> = { league: "League night", prebowl: "Pre-bowl", practice: "Practice", social: "Team hangout" };
export const audienceNames: Record<Audience,string> = { team: "My team", invited: "Invited people", "only-me": "Only me" };
export const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export class StudioAPIError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = "StudioAPIError"; }
}
export const terminalSessionError = (error: unknown) => error instanceof StudioAPIError && [401,403,404,410].includes(error.status);
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort,12000);
  if (options.signal?.aborted) abort(); else options.signal?.addEventListener("abort",abort,{once:true});
  try {
    const response = await fetch(`/api/live/v2/sessions${path}`, { cache: "no-store", ...options, signal: controller.signal, headers: { "Content-Type": "application/json", ...options.headers } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new StudioAPIError(typeof body.error === "string" ? body.error : "The studio could not connect. Please try again.", response.status);
    return body as T;
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort",abort); }
}
