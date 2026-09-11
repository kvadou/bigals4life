export type TeamStanding = {
  place: number; number: number; name: string;
  percentWon: number; pointsWon: number; pointsLost: number; unearnedPoints: number | null;
  ytdPercentWon: number; ytdWon: number; ytdLost: number;
  gamesWon: number; scratchPins: number; pinsPlusHdcp: number;
};
export type TeamWeekResult = {
  lanes: string; number: number; name: string; opponentNumber: number;
  hdcpGames: [number, number, number]; hdcpTotal: number; pointsWon: number;
};
export type RosterBowler = {
  blsId: number; hand: "L" | "R"; name: string; teamNumber: number;
  average: number; handicap: number; pins: number; games: number; toRaise: number; toDrop: number;
  scratchGames: [number, number, number] | null; scratchTotal: number | null; hdcpTotal: number | null;
  absent?: boolean;
  warning?: string;
};
export type StandingsWeek = {
  season: string; date: string; week: number; weeksTotal: number; house: string;
  teams: TeamStanding[];
  results: TeamWeekResult[];
  rosters: { number: number; name: string; lane: number; bowlers: RosterBowler[] }[];
  matchPoints: { name: string; points: number }[];
  warnings: string[];
};
