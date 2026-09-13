/** Bounded local PCM recording. No microphone stream is ever published to the room. */
export function pcmWav(input:Float32Array,rate:number):Uint8Array {
 const count=Math.min(128000,Math.floor(input.length*16000/rate)),bytes=new Uint8Array(44+count*2),view=new DataView(bytes.buffer);
 const text=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i);};
 text(0,"RIFF");view.setUint32(4,36+count*2,true);text(8,"WAVE");text(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,"data");view.setUint32(40,count*2,true);
 for(let i=0;i<count;i++){const start=Math.floor(i*rate/16000),end=Math.max(start+1,Math.floor((i+1)*rate/16000));let sum=0;for(let n=start;n<Math.min(end,input.length);n++)sum+=input[n];const sample=Math.max(-1,Math.min(1,sum/(end-start)));view.setInt16(44+i*2,Math.round(sample*(sample<0?32768:32767)),true);}return bytes;
}
export function base64Audio(bytes:Uint8Array){let text="";for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
export function decodeBase64(value:string){return Uint8Array.from(atob(value),char=>char.charCodeAt(0));}
export async function recordSound(signal:AbortSignal):Promise<{stop:()=>void;finished:Promise<Uint8Array|null>}> {
 const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
 if(signal.aborted){stream.getTracks().forEach(track=>track.stop());throw new DOMException("Cancelled","AbortError");}
 let context:AudioContext;try{context=new AudioContext();}catch(error){stream.getTracks().forEach(track=>track.stop());throw error;}let input:MediaStreamAudioSourceNode|undefined,processor:ScriptProcessorNode|undefined;
 let resolve!:(value:Uint8Array|null)=>void;const finished=new Promise<Uint8Array|null>(done=>resolve=done),chunks:Float32Array[]=[];let length=0,done=false,timer:ReturnType<typeof setTimeout>|undefined;
 const stop=(discard=false)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener("abort",abort);stream.getTracks().forEach(track=>track.stop());processor?.disconnect();input?.disconnect();void context.close();if(discard||!length){resolve(null);return;}const samples=new Float32Array(length);let offset=0;for(const chunk of chunks){samples.set(chunk,offset);offset+=chunk.length;}resolve(pcmWav(samples,context.sampleRate));};
 const abort=()=>stop(true);signal.addEventListener("abort",abort,{once:true});
 try{input=context.createMediaStreamSource(stream);processor=context.createScriptProcessor(2048,1,1);processor.onaudioprocess=event=>{if(done)return;const remaining=Math.floor(context.sampleRate*8)-length;if(remaining<=0){stop();return;}const copy=event.inputBuffer.getChannelData(0).slice(0,remaining);chunks.push(copy);length+=copy.length;if(length>=context.sampleRate*8)stop();};input.connect(processor);processor.connect(context.destination);await context.resume();if(!done)timer=setTimeout(()=>stop(),8000);return{stop:()=>stop(),finished};}catch(error){stop(true);throw error;}
}
export class SoundPlayer {
 private context:AudioContext|null=null;private source:AudioBufferSourceNode|null=null;private generation=0;
 async unlock(){this.context??=new AudioContext();await this.context.resume();}
 stop(){this.generation++;try{this.source?.stop();}catch{}this.source=null;}
 async play(bytes:Uint8Array){this.stop();const current=this.generation;await this.unlock();const buffer=await this.context!.decodeAudioData(bytes.slice().buffer as ArrayBuffer);if(current!==this.generation)return;const source=this.context!.createBufferSource();source.buffer=buffer;source.connect(this.context!.destination);this.source=source;source.start();}
 close(){this.stop();if(this.context)void this.context.close();this.context=null;}
}

/** Server lease is 30s. Anchor the conservative 25s client window before network latency. */
export function speakerDeadline(requestStarted:number,receivedAt:number):number {
 const deadline=requestStarted+25000;
 return Number.isFinite(deadline)&&receivedAt>=requestStarted&&receivedAt<deadline?deadline:0;
}
