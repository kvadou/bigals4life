import { database } from "./scorebook-server";

/** A new night belongs to the team, not just whoever tapped first. One team, one app: everyone ever added to or invited to any scorebook can edit it. */
export async function shareWithTeam(scorebookId: string, creator: string) {
  const [members, invites]: { user_id?: string; email?: string }[][] = await Promise.all([
    database(`scorebook_members?scorebook_id=neq.${scorebookId}&user_id=neq.${creator}&select=user_id`),
    database(`scorebook_invites?scorebook_id=neq.${scorebookId}&select=email`),
  ]);
  const users = [...new Set(members.map(m => m.user_id!))];
  const emails = [...new Set(invites.map(i => i.email!.toLowerCase()))];
  if (users.length) await database("scorebook_members?on_conflict=scorebook_id,user_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(users.map(u => ({ scorebook_id: scorebookId, user_id: u, role: "editor", added_by: creator }))) });
  if (emails.length) await database("scorebook_invites?on_conflict=scorebook_id,email", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(emails.map(e => ({ scorebook_id: scorebookId, email: e, role: "editor", invited_by: creator }))) });
}
