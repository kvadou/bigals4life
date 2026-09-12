import type { Tag } from "./schema";

/**
 * Curated rules of thumb, plain language first. `agree` is how many of the named sources say the same thing:
 * the honest confidence signal, never a percentage. Summarized and attributed, not reproduced.
 */
export type Idea = { key: string; when: Tag[]; plain: string; technical: string; source: string; url: string; agree: number };

export const IDEAS: Idea[] = [
  { key: "early-hook", when: ["high", "pulled it", "washout"],
    plain: "The ball is grabbing sooner than you want. Try a touch more speed first, or move a board or two deeper into the oil, before you change balls.",
    technical: "Too much rev for the ball speed, or the oil has broken down where you are playing. Add speed, move in, then consider surface.",
    source: "Brad & Kyle", url: "https://www.youtube.com/@BradandKyle", agree: 3 },
  { key: "late-hook", when: ["light", "missed target"],
    plain: "The ball is sliding through and coming in light. Ease off the speed a little, or move toward a fresher part of the lane, before you go to a stronger ball.",
    technical: "Ball speed too high for the rev rate, or heavier oil than expected. Reduce speed, move out, then consider a duller surface.",
    source: "Mark Baker, The Game Changer", url: "https://markbakerbowling.com", agree: 3 },
  { key: "spare-system", when: ["split", "missed target"],
    plain: "Shoot single-pin spares straight, same feet and same target every time. Corner pins are where the series goes.",
    technical: "Plastic spare ball, fixed feet and target for each corner pin. Remove hook from spare shooting.",
    source: "USBC Bowling Academy", url: "https://www.bowlingacademy.com", agree: 3 },
  { key: "tempo", when: ["fast feet", "pulled it"],
    plain: "When the night speeds up, your feet do too. Start the approach a half-beat slower and let the ball swing on its own.",
    technical: "Tempo control: slow the first step, keep the armswing free, finish at the line.",
    source: "Mark Baker, The Game Changer", url: "https://markbakerbowling.com", agree: 2 },
  { key: "hold-the-line", when: ["bad break", "flush"],
    plain: "That was a good shot with a bad result. Change nothing yet. Give it two more shots before you move.",
    technical: "Carry issue, not a line issue. Hold the line for two frames before adjusting anything.",
    source: "Brad & Kyle", url: "https://www.youtube.com/@BradandKyle", agree: 2 },
  { key: "one-move", when: ["high", "light"],
    plain: "Move feet and target together, the same direction, so your angle stays the same. Two boards with the feet, one with the eyes, is a good first move.",
    technical: "Parallel move preserves launch angle; a 2-and-1 move is the standard first adjustment.",
    source: "USBC Bowling Academy", url: "https://www.bowlingacademy.com", agree: 3 },
];

/** Ideas that fit the tags a bowler chose tonight. Empty when nothing fits; the coach then offers none. */
export function candidateIdeas(tags: Set<Tag>): Idea[] {
  return IDEAS.filter(i => i.when.some(t => tags.has(t)));
}
