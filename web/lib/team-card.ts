import { BOWLERS } from "@/lib/season";

export type TeamCardInput = {
  userId: string;
  team: string | null;
  scorebookId: string | null;
  /** Every profile that has claimed a bowler name. */
  profiles: { userId: string; bowlerName: string | null }[];
  members: { userId: string; role: string }[];
  invites: string[];
  roster: { name: string; average: number | null; handicap: number | null; games: number | null }[];
  fullNames: Record<string, string>;
};

export type TeamCard = {
  team: string | null;
  scorebookId: string | null;
  yourRole: string | null;
  bowlers: { name: string; fullName: string; average: number | null; handicap: number | null; games: number | null; you: boolean; signedIn: boolean; role: string | null }[];
  invites: string[];
};

/** The four bowlers with who has signed in and what they can do on the team scorebook. Pure so it is testable. */
export function teamCard(input: TeamCardInput): TeamCard {
  const yourRole = input.members.find(m => m.userId === input.userId)?.role ?? null;
  return {
    team: input.team, scorebookId: input.scorebookId, yourRole,
    bowlers: BOWLERS.map(name => {
      const account = input.profiles.find(p => p.bowlerName?.toLowerCase() === name.toLowerCase());
      const row = input.roster.find(r => r.name.split(" ")[0].toLowerCase() === name.toLowerCase());
      return {
        name, fullName: input.fullNames[name] ?? name,
        average: row?.average ?? null, handicap: row?.handicap ?? null, games: row?.games ?? null,
        you: account?.userId === input.userId,
        signedIn: !!account,
        role: account ? input.members.find(m => m.userId === account.userId)?.role ?? null : null,
      };
    }),
    invites: input.invites.map(e => e.toLowerCase()).sort(),
  };
}
