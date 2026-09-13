import { describe, expect, test } from 'bun:test';
import { contextCrumbs, safeOrigin, withOrigin } from '../lib/navigation';
const id='b2222222-2222-4222-8222-222222222222';
const week=`/season/${id}`, game=`${week}/game/1`, review=`/review/${id}`;
describe('local navigation context',()=>{
  test('rejects external, encoded, control and unrecognized destinations',()=>{
    for(const value of ['https://evil.test/','//evil.test/','//bigals4life.com/','/\\evil.test','/%2f%2fevil.test','/login','/api/me','/night\n','javascript:alert(1)','/'.repeat(2050)])expect(safeOrigin(value)).toBeNull();
  });
  test('drops arbitrary query and invalid nested return values',()=>{expect(safeOrigin('/night?night=123&token=private&from=https%3A%2F%2Fevil.test')).toBe('/night?night=123');});
  test('Tonight review returns directly to Tonight',()=>{
    expect(contextCrumbs([{label:'Season',href:'/season'},{label:'Week 2',href:week},{label:'Review'}],withOrigin(review,'/'))).toEqual([{label:'Tonight',href:'/'},{label:'Review'}]);
  });
  test('preserves parent chain and game tabs without accumulating siblings',()=>{
    const parent=withOrigin(week,'/season');const target=withOrigin(game,parent);const second=withOrigin(`${week}/game/2`,target);
    const crumbs=contextCrumbs([{label:'Season',href:'/season'},{label:'Week 2',href:week},{label:'Game 2'}],second);
    expect(crumbs.map(c=>c.label)).toEqual(['Season','Week 2','Game 2']);expect(crumbs[1].href).toBe(parent);
  });
  test('returning to ancestor retains its origin instead of a cycle',()=>{const parent=withOrigin(week,'/');expect(withOrigin(week,withOrigin(review,parent))).toBe(parent);});
  test('preserves target mode and only safe source keys',()=>{expect(withOrigin('/night?night=123&mode=scan','/?unknown=value')).toBe('/night?night=123&mode=scan&from=%2F');});
  test('invalid deep links use fallback and cycles terminate',()=>{const items=[{label:'Season',href:'/season'},{label:'Week'}];expect(contextCrumbs(items,week+'?from=https://evil.test')).toEqual(items);expect(contextCrumbs(items,week+'?from='+encodeURIComponent(week))).toEqual(items);});
});

test('same route, different scorebooks and filters retain distinct origins',()=>{
  for(const [source,target] of [['/night?night=A','/night?night=B'],['/live?night=A','/live?night=B'],['/records?season=2025','/records?season=2026']]) {
    const url=withOrigin(target,source);expect(new URL(url,'https://bigals4life.com').searchParams.get('from')).toBe(source);
    expect(contextCrumbs([{label:'Current'}],url)[0].href).toBe(source);
    expect(withOrigin(source,url)).toBe(source);
  }
});
