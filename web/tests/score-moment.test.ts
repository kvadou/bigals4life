import { expect, test } from "bun:test";
import { scoreMoment } from "../lib/league/score-moment";
import type { Night } from "../lib/scorebook";
const night = (rolls: number[] = []): Night => ({game:1, rolls:[rolls,[],[],[]],history:[]});
test("scorebook strike/spare/game event is distinct from video attribution", () => {
 expect(scoreMoment(night(),night([10]),123)?.label).toBe("Doug · Strike · frame 1");
 expect(scoreMoment(night([0]),night([0,10]),123)?.label).toBe("Doug · Spare · frame 1");
 expect(scoreMoment(night([7]),night([7,3]),123)?.label).toBe("Doug · Spare · frame 1");
 const nine = Array(18).fill(0);
 expect(scoreMoment(night([...nine,8]),night([...nine,8,1]),123)?.label).toBe("Doug · Game 1 complete · 9");
 expect(scoreMoment(night([10]),night([10,4]),123)).toBeNull();
});
test("corrections, batch loads, new games, finalized rows and other pre-bowl bowlers never auto-select footage", () => {
 expect(scoreMoment(night([7]),night([10]),123)).toBeNull();
 expect(scoreMoment(night(),night([10,10]),123)).toBeNull();
 expect(scoreMoment(night(),{...night([10]),game:2},123)).toBeNull();
 expect(scoreMoment(night(),{...night([10]),rolls:[[10],[10],[],[]]},123)).toBeNull();
 expect(scoreMoment(night(),{...night(),finals:[200,null,null,null]},123)).toBeNull();
 expect(scoreMoment({...night(),finals:[0,null,null,null]},{...night([10]),finals:[0,null,null,null]},123)).toBeNull();
 expect(scoreMoment({...night(),prebowl:{week:2,bowlers:[3]}},{...night([10]),prebowl:{week:2,bowlers:[3]}},123)).toBeNull();
 expect(scoreMoment(night([7]),night([7,4]),123)).toBeNull();
 expect(scoreMoment(night(),night([10]),NaN)).toBeNull();
});
