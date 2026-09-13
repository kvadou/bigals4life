# League-night soundboard

Implement manual celebrations for shared Live Studio on web/iOS. Four bundled original synthesized cues: pickle (yodel-like melody), turkey, violin, heating. No automatic score triggers. A short attributed visual celebration runs for a fresh event; respect reduced motion. Do not replay historical events on initial connection. Sound off by default. Opt in as either personal listening or the single lane speaker. Speaker lease avoids multiple devices volunteering as the alley speaker; it does not prevent explicitly chosen personal headphone listeners.

API /api/live/v2/sessions/{id}/soundboard, same current session authorization as Gallery. GET -> {enabled:boolean,speakerConnectionId:string|null,clips:[{id,title}],events:[{id,soundId,author,createdAt}]}; latest20 chronological events. GET ?clip={UUID} -> {audioBase64:string}, WAV only. POST actions:
{action:'play',soundId:'pickle'|'turkey'|'violin'|'heating'|UUID,connectionId:UUID} -> {accepted:true}
{action:'save',title:string,audioBase64:string} -> {clip:{id,title}}
{action:'remove',clipId:UUID} host or uploader -> {removed:true}
{action:'enabled',enabled:boolean} host only -> {updated:true}
{action:'speaker',connectionId:UUID,claim:boolean} -> {claimed:boolean}
Every play/speaker action checks connection belongs to caller and session. One active speaker lease per session,30seconds renewed15seconds. Atomic claim database RPC. Play cooldown5seconds globally via locked session row at insert, user12/min separately. Host disable rejects plays and clients stop sound; recording/upload remains explicit. Return speakerConnectionId null when expired. State refresh3seconds onlyconnected/foreground/visible. No automatic sound on connect/unmute/refresh. Drop eventsolder10seconds, keep onlynewest ifmultiple, never queue sound bursts.

Custom recording: explicit microphone start, automatic stop by8seconds, mono16kHz16-bitPCM WAV, max256KB and8seconds, max10clips/session. Validate WAV header/chunks/format/samplelength server-side; titlemax40. Record on-device, preview before explicit Share with session. Upload stores private base64WAV in session-scoped table, RLS and service-only access, cascade cleanup. No remote URL import or speech transcription. Non-uploaderremove denied unlesshost. Microphone capture ends on stop/hide/background/leave and audio session returns to video-safe configuration. Shared camera still does not publish microphone.

Web component Soundboard with explicit controls and waveform-free preview; native matching native controls. Use actual same bundled WAV assets on both. Default receives visual celebrations silently. Lane speakerclaim lease and personal audio choice clearly labelled; host mute separately from local sound. Audio errors visible, no success on failedsend. Verify permissions, leases, cap, malformedWAV, cooldown and no replay. Build/QA both; no production changes while existingauth/schema reviewhold remains.
