import {expect,test} from "bun:test";
import {validSoundWav} from "../lib/live-soundboard";
function wav(samples=16000){const b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);return b;}
test('strict WAV parsing rejects malformed, non-PCM, long and ambiguous recordings',()=>{
 for(const samples of [1,16000,128000])expect(validSoundWav(wav(samples).toString('base64'))).toBe(true);
 expect(validSoundWav(wav(128001).toString('base64'))).toBe(false);
 expect(validSoundWav(wav(0).toString('base64'))).toBe(false);
 for(const [offset,value] of [[20,3],[22,2],[24,48000],[28,64000],[32,4],[34,8],[40,123]]){const b=wav();b.writeUInt16LE(value,offset);expect(validSoundWav(b.toString('base64'))).toBe(false);}
 const b=wav();expect(validSoundWav(b.subarray(0,-1).toString('base64'))).toBe(false);expect(validSoundWav(b.toString('base64')+'\n')).toBe(false);expect(validSoundWav('AAAA===')).toBe(false);
 // A legal padded unknown chunk is accepted; an unpadded one is not.
 const junk=Buffer.from([74,85,78,75,1,0,0,0,42,0]);const extra=Buffer.concat([b.subarray(0,36),junk,b.subarray(36)]);extra.writeUInt32LE(extra.length-8,4);expect(validSoundWav(extra.toString('base64'))).toBe(true);
 const duplicate=Buffer.concat([b,b.subarray(36)]);duplicate.writeUInt32LE(duplicate.length-8,4);expect(validSoundWav(duplicate.toString('base64'))).toBe(false);
 const formatDuplicate=Buffer.concat([b.subarray(0,36),b.subarray(12,36),b.subarray(36)]);formatDuplicate.writeUInt32LE(formatDuplicate.length-8,4);expect(validSoundWav(formatDuplicate.toString('base64'))).toBe(false);
});
test('soundboard endpoint keeps current access and server attribution',async()=>{
 const script=String.raw`
 import {mock} from 'bun:test';
 let who={user:{id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test',displayName:'Doug'},viaCookie:false},role='editor',limited=false,rpcCalls=[];
 const owner=who,id='22222222-2222-4222-8222-222222222222',connection='33333333-3333-4333-8333-333333333333',clip='44444444-4444-4444-8444-444444444444';
 let session={id,owner_id:who.user.id,activity:'social',audience:'team',team_scope_id:id,expires_at:new Date(Date.now()+60000).toISOString(),ended_at:null,soundboard_enabled:true,speaker_connection_id:connection,speaker_expires_at:new Date(Date.now()-1000).toISOString()};
 mock.module('./lib/auth-server',()=>({identify:async()=>who,isTeammate:async()=>true,access:async()=>role}));
 mock.module('./lib/rate-limit',()=>({allow:()=>!limited}));
 mock.module('./lib/scorebook-server',()=>({sameOrigin:r=>r.headers.get('origin')===new URL(r.url).origin,database:async(path,init={})=>{
  if(path.startsWith('live_sessions?'))return [session];
  if(path.startsWith('live_sound_clips?'))return path.includes('audio_base64')?[{audio_base64:'fixture'}]:[{id:clip,title:'Test',user_id:owner.user.id}];
  if(path.startsWith('live_sound_events?'))return [{id:clip,sound_id:'turkey',author:'Doug',created_at:new Date().toISOString()}];
  if(path==='rpc/live_soundboard_action'){const body=JSON.parse(init.body);rpcCalls.push(body);return {accepted:true};}throw Error('unexpected path');
 }}));
 const {liveV2}=await import('./lib/live-v2');let checks=0;const eq=(a,b,m)=>{checks++;if(a!==b)throw Error(m+': '+JSON.stringify(a)+' != '+JSON.stringify(b))};
 const req=(body=null,query='')=>liveV2(new Request('https://ba4l.example/api/live/v2/sessions/'+id+'/soundboard'+query,{method:body?'POST':'GET',headers:{origin:'https://ba4l.example'},...(body?{body:JSON.stringify(body)}:{})}),'soundboard',id);
 who=null;eq((await req()).status,401,'anonymous');who=owner;role='none';eq((await req()).status,404,'revoked scope');role='editor';
 session.ended_at=new Date().toISOString();eq((await req({action:'play',soundId:'turkey',connectionId:connection})).status,404,'ended');session.ended_at=null;
 const state=await (await req()).json();eq(state.speakerConnectionId,null,'expired lease absent');eq(state.clips[0].canRemove,true,'owner remove');eq(state.clips[0].user_id,undefined,'no user ID');
 who={user:{id:connection,email:'other@example.test'},viaCookie:false};eq((await (await req()).json()).clips[0].canRemove,false,'guest cannot remove');who=owner;
 eq((await req(null,'?clip=not-a-uuid')).status,404,'invalid clip');eq((await req(null,'?clip='+clip)).status,200,'private clip lookup');
 eq((await req({action:'play',soundId:'turkey',connectionId:connection,author:'Fake'})).status,400,'author spoof');
 eq((await req({action:'play',soundId:'unknown',connectionId:connection})).status,400,'sound enumeration');
 eq((await req({action:'save',title:'Bad',audioBase64:'AAAA'})).status,400,'invalid WAV');eq(rpcCalls.length,0,'malformed never stored');
 eq((await req({action:'play',soundId:'turkey',connectionId:connection})).status,200,'valid play forwarded');eq(rpcCalls[0].p_user,owner.user.id,'verified identity');eq(rpcCalls[0].p_session,id,'session bound');eq(rpcCalls[0].p_author,'Doug','server author');
 limited=true;eq((await req()).status,429,'rate limit');
 console.log('Sound API checks passed: '+checks);
 `;
 const child=Bun.spawn(["bun","-e",script],{cwd:new URL("..",import.meta.url).pathname,stdout:"pipe",stderr:"pipe"});
 const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);expect(code,err).toBe(0);expect(out).toContain('Sound API checks passed');
});
