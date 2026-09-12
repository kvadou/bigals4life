/** Disposable UI regression, never connects to production. Run: bun scripts/responsive-verify.ts
 * Run without concurrent next build/dev in this checkout. RESPONSIVE_EXTRAS_ONLY=1 reruns only large-screen/interaction checks.
 * Requires Playwright through PLAYWRIGHT_MODULE or the Codex bundled runtime.
 * This tests real Next routes and the real auth proxy against a local fake Supabase service.
 * It does not test authentication security. All user data and tokens below are synthetic.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { summarizeWeek, BOWLERS } from '../lib/season';
import { bowlerGames } from '../lib/review/facts';
import { emptyProfile, emptyReview } from '../lib/review/schema';

const root = resolve(import.meta.dir, '..');
const out = process.env.RESPONSIVE_OUTPUT ?? '/tmp/ba4l-responsive';
await mkdir(out, { recursive: true });
const fixturePort = 4319, appPort = 4320;
const origin = `http://127.0.0.1:${appPort}`;
const userId = 'a1111111-1111-4111-8111-111111111111';
const nightId = 'b2222222-2222-4222-8222-222222222222';
const email = 'responsive.fixture@example.test';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: '2026-09-01T00:00:00Z', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-09-01T00:00:00Z' };
const names = ['DOUG KVAMME', 'MUSTAFA EXAMPLE', 'KYLE EXAMPLE', 'PETE EXAMPLE'];
const tables: Record<string, any[]> = {
  league_seasons: [{ id: 's1', name: "Thursday Men's Early 2026-27", house: 'Fixture Bowling Center', weeks_total: 2 }],
  league_weeks: [{ id: 'w1', season_id: 's1', week: 2, bowled_on: '2026-09-12', ingested_at: '2026-09-12T12:00:00Z', recap: 'A strong week for Big Al’s 4 Life.' }],
  league_teams: [{ id: 't1', season_id: 's1', number: 1, name: 'BIG ALS 4 LIFE' }, { id: 't2', season_id: 's1', number: 2, name: 'THE VERY LONG OPPONENT TEAM NAME' }],
  league_bowlers: names.map((name, i) => ({ id: `b${i}`, season_id: 's1', bls_id: i + 1, name, team_id: 't1' })),
  league_bowler_weeks: names.map((_, i) => ({ bowler_id: `b${i}`, week_id: 'w1', team_id: 't1', average: 190-i*10, handicap: 25+i*8, to_raise: 585, to_drop: 550, scratch_games: [190,180,200], scratch_total: 570, games: 3, pins: 570, match_points_ytd: 15-i })),
  league_team_weeks: [1,2].map(i => ({ week_id: 'w1', team_id: `t${i}`, opponent_team_id: `t${3-i}`, place: i, percent_won: 60, points_won: 24, points_lost: 12, ytd_won: 24, ytd_lost: 12, scratch_pins: 2100, week_points_won: 24, hdcp_games: [800,820,810], hdcp_total: 2430, discrepancies: [] })),
};
const fixture = Bun.serve({ port: fixturePort, hostname: '127.0.0.1', fetch(req) {
  const url = new URL(req.url);
  if (req.method !== 'GET' && req.method !== 'OPTIONS') return Response.json({ error: 'Fixture is read-only' }, { status: 405 });
  if (url.pathname === '/auth/v1/user') return Response.json(user);
  let rows = tables[url.pathname.split('/').pop()!] ?? [];
  for (const [key, val] of url.searchParams) if (val.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === val.slice(3)); else if(val==='is.null') rows=rows.filter(row=>row[key]==null);
  return Response.json(rows);
}});
const log = Bun.file(`${out}/next.log`);
const next = Bun.spawn(['bun', 'node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(appPort)], { cwd: root, stdout: log, stderr: log, env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixturePort}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only-public-key', SUPABASE_URL: `http://127.0.0.1:${fixturePort}`, SUPABASE_SERVICE_ROLE_KEY: 'fixture-only-service-key', BAFL_ADMIN_EMAILS: email } });
const night = { game: 3, rolls: [[],[],[],[]], finals: [210,180,175,200], history: [1,2].map(game => ({ game, rolls: [[],[],[],[]], finals: [190,180,170,160] })) };
const week = summarizeWeek(nightId, night, '2026-09-12T12:00:00Z', 2);
const data = { night: { week: 2, bowledOn: '2026-09-12', prebowl: { week: 2, bowlers: [0] }, opponent: null, games: bowlerGames(night,0) }, bowler: 0, names: BOWLERS, review: emptyReview(), profile: { ...emptyProfile(), arsenal: ['Storm Bionic', 'A Very Long Bowling Ball Name'] } };
tables.scorebooks = [{id:nightId, owner_id:userId, state:{...night,prebowl:{week:2,bowlers:[0]}},updated_at:'2026-09-12T12:00:00Z',revision:1}];
tables.scorebook_members = [{scorebook_id:nightId,user_id:userId,role:'owner',scorebooks:{updated_at:'2026-09-12T12:00:00Z'}}];
tables.profiles = [{user_id:userId,display_name:'Doug',bowler_name:'Doug'}];
tables.bowler_profiles = [{user_id:userId,state:data.profile}];
const jwt = [Buffer.from(JSON.stringify({ alg:'HS256',typ:'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub:userId, exp:Math.floor(Date.now()/1000)+3600, role:'authenticated' })).toString('base64url'), 'fixture-signature'].join('.');
const session = { access_token:jwt, refresh_token:'fixture-refresh', token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, user };
let browser: any;
try {
  for (let i=0;i<100;i++) { try { if ((await fetch(`${origin}/login`)).ok) break; } catch {} await Bun.sleep(500); }
  const modulePath = process.env.PLAYWRIGHT_MODULE ?? `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`;
  const { chromium } = await import(modulePath);
  browser = await chromium.launch({ channel:'chrome', headless:true });
  const context = await browser.newContext();
  await context.addCookies([{ name:'sb-127-auth-token', value:`base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain:'127.0.0.1', path:'/' }]);
  await context.storageState({path:`${out}/storage.json`});
  const page = await context.newPage();
  const errors: string[] = [];
  let emptyNight = false;
  page.on('pageerror', (e: Error) => errors.push(e.message));
  await context.route('**/*', async (route: any) => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin && !['data:','blob:'].includes(url.protocol)) {
      if (req.method()==='GET' && ['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname)) return route.continue();
      return route.abort();
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (req.method() !== 'GET') return route.fulfill({ status:405, json:{error:'Browser fixture is read-only'} });
    const payload = url.pathname === '/api/me' ? {user,admin:true,profile:{displayName:'Doug',bowlerName:'Doug'},scorebooks:[{id:nightId,role:'owner',updatedAt:'2026-09-12'}],legacy:[]} : url.pathname === '/api/season' ? {season:'2026-27',weeks:[week]} : url.pathname.startsWith('/api/review/') ? (emptyNight?{...data,night:{...data.night,games:[]}}:data) : url.pathname.startsWith('/api/nights/') ? {state:night,revision:1,role:'owner'} : url.pathname === '/api/league/standings' ? {teams:[{name:'Big Al’s 4 Life',place:1,pointsWon:24,pointsLost:12,ours:true}],roster:[]} : {teams:[],season:null};
    return route.fulfill({status:200,json:payload});
  });
  const sizes = process.env.RESPONSIVE_EXTRAS_ONLY === '1' ? [[1920,1080]] : [[320,740],[390,844],[430,932],[768,1024],[1024,768],[1440,1000],[1920,1080],[844,390]];
  const routes = ['/', '/season', `/season/${nightId}`, `/season/${nightId}/game/1`, `/night?night=${nightId}`, '/league', '/records', `/records/1`, `/review/${nightId}`];
  const results: any[]=[];
  for (const [width,height] of sizes) {
    await page.setViewportSize({width,height});
    for (const path of routes) {
      errors.length=0;
      const response = await page.goto(origin+path); if (response?.status() === 404) await page.reload();
      await page.waitForTimeout(500); await page.evaluate(()=>document.fonts.ready);
      if (path.startsWith('/review/')) {
        await page.getByRole('heading', { name:/How.*go, Doug/ }).waitFor();
        await page.getByRole('button', {name:/THE LANES/}).click();
      } else await page.locator('main').waitFor({timeout:5000}).catch(()=>{});
      const metrics = await page.evaluate(() => ({ width:document.documentElement.clientWidth, scroll:document.documentElement.scrollWidth, url:location.pathname, content:document.querySelector('main')?.textContent?.length, overflow:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1)&&!el.closest('.league-scroll,.frame-scroll');}).slice(0,8).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width})) }));
      const okay = metrics.scroll <= metrics.width+1 && !errors.length && metrics.url !== '/login' && (metrics.content??0)>150;
      results.push({path,width,height,okay,...metrics,errors:[...errors]});
      console.log(JSON.stringify(results.at(-1)));
      if (path.startsWith('/review/') || (!okay)) await page.screenshot({path:`${out}/${width}-${path.split('?')[0].replaceAll('/','_')||'home'}.png`,fullPage:true});
    }
  }
  for (const width of [320,390,768,1024,1440]) {
    await page.setViewportSize({width,height:900});
    await page.goto(origin+`/review/${nightId}`);
    await page.getByRole('heading', {name:/How.*go, Doug/}).waitFor();
    const toggle=page.getByRole('button',{name:'Menu',exact:true});
    if (await toggle.isVisible()) {
      await toggle.focus(); await page.keyboard.press('Enter');
      const open=await page.getByRole('button',{name:'Close',exact:true}).getAttribute('aria-expanded');
      await page.keyboard.press('Escape');
      const focused=await toggle.evaluate((el:Element)=>document.activeElement===el);
      results.push({path:'menu-keyboard',width,okay:open==='true'&&focused});
      await toggle.click();
    }
    await page.getByRole('button',{name:'Password',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    let dims=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,dialog:document.querySelector('dialog')!.getBoundingClientRect().width}));
    results.push({path:'password-dialog',width,okay:dims.scroll<=dims.width+1&&dims.dialog<=dims.width,...dims});
    await page.screenshot({path:`${out}/${width}-password-dialog.png`,fullPage:true});
    await page.keyboard.press('Escape');
    const closed=!(await page.getByRole('dialog').isVisible());
    results.push({path:'password-escape',width,okay:closed});
    // Text-only zoom doubles every computed font size, including the incumbent px-based typography.
    await page.evaluate(()=>{const items=[...document.querySelectorAll('main *')].map(el=>[el,parseFloat(getComputedStyle(el).fontSize)] as const);for(const [el,size] of items)(el as HTMLElement).style.fontSize=`${size*2}px`;});
    await page.getByRole('button',{name:/THE LANES/}).click();
    dims=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,dialog:0}));
    results.push({path:'review-text-200',width,okay:dims.scroll<=dims.width+1,...dims});
    await page.screenshot({path:`${out}/${width}-text-200.png`,fullPage:true});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.goto(origin+`/review/${nightId}`);await page.getByRole('button',{name:'Password',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  results.push({path:'password-resize1440-to390',width:390,okay:await page.getByRole('dialog').isVisible()});
  await page.screenshot({path:`${out}/390-password-resized.png`,fullPage:true});
  await page.keyboard.press('Escape');
  const usable=await page.locator('.nav-toggle').isVisible();
  results.push({path:'password-resize-escape',width:390,okay:usable&&!(await page.getByRole('dialog').isVisible())});
  emptyNight=true;
  for(const width of [320,390,430,768]) {
    await page.setViewportSize({width,height:844});await page.goto(origin+`/review/${nightId}?fixture=empty-${width}`);
    await page.getByText('no finished games yet',{exact:true}).waitFor({timeout:10000}).catch(async(error:Error)=>{await page.screenshot({path:`${out}/empty-error.png`,fullPage:true});console.log(await page.locator('body').innerText());throw error;});
    await page.getByRole('button',{name:/THE LANES/}).click();
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    const dims=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    results.push({path:'review-empty-account-open',width,okay:dims.scroll<=dims.width+1,...dims});
    await page.screenshot({path:`${out}/${width}-empty-account.png`,fullPage:true});
  }
  // Login remains genuinely signed out. No application auth code changes or bypass flags.
  const loggedOut = await browser.newContext(); const login = await loggedOut.newPage();
  for (const width of [320,390,768,1440]) { await login.setViewportSize({width,height:900}); await login.goto(origin+'/login'); await login.locator('main').waitFor(); const dims=await login.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})); results.push({path:'/login',width,okay:dims.scroll<=dims.width+1,...dims}); }
  await loggedOut.close();
  await writeFile(`${out}/results.json`, JSON.stringify(results,null,2));
  console.log(`RESULT ${results.filter(x=>x.okay).length}/${results.length} passed. ${out}/results.json`);
  process.exitCode = results.every(x=>x.okay)?0:1;
} catch(error) {console.error(error); process.exitCode=1;} finally {
  await browser?.close();
  if (process.env.RESPONSIVE_KEEP === '1') {
    console.log(`Fixture remains available at ${origin}/review/${nightId}; synthetic storage: ${out}/storage.json`);
    await new Promise<void>(done => {process.once('SIGINT',done);process.once('SIGTERM',done);});
  }
  next.kill(); fixture.stop();
}
