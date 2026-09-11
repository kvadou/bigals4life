import { uuidSchema } from "./scorebook";

export function resolveScorebookLink(explicit: string | null, remembered: string | null) {
  if (explicit !== null) {
    if (!uuidSchema.safeParse(explicit).success) throw Error("This team link is invalid.");
    return explicit;
  }
  return uuidSchema.safeParse(remembered).success ? remembered : null;
}
