/** Owns camera and connection lifetime, including permissions resolving after Leave. */
export type Camera = { stop(): void };
export type Connection<C extends Camera> = {
  connect(signal: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
  createCamera(): Promise<C>;
  publish(camera: C): Promise<void>;
};
export function liveConnection<C extends Camera>(connection: Connection<C>) {
  const abort = new AbortController();
  let camera: C | undefined;
  const disconnect = () => { void connection.disconnect().catch(() => {}); };
  return {
    get cancelled() { return abort.signal.aborted; },
    async start(publish: boolean) {
      try {
        await connection.connect(abort.signal);
        if (abort.signal.aborted) { disconnect(); return; }
        if (publish) {
          camera = await connection.createCamera();
          if (abort.signal.aborted) { camera.stop(); disconnect(); return; }
          await connection.publish(camera);
          if (abort.signal.aborted) { camera.stop(); disconnect(); }
        }
      } catch (error) {
        camera?.stop(); disconnect();
        if (!abort.signal.aborted) throw error;
      }
    },
    dispose() { abort.abort(); camera?.stop(); disconnect(); },
  };
}
