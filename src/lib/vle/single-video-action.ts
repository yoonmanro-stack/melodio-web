/** A click authorizes one frozen audio → video chain. A changed scope cancels continuation. */
export type SingleVideoScope = { ownerId: string; category: string; revision: number; inputKey: string };
export type SingleVideoPhase = 'audio' | 'prompt' | 'video';
type Request = { id: number; scope: SingleVideoScope };

export class SingleVideoActionGate {
  private active: Request | null = null;
  private sequence = 0;
  get busy() { return this.active !== null; }
  begin(scope: SingleVideoScope): Request | null {
    if (this.active) return null;
    this.active = { id: ++this.sequence, scope: { ...scope } };
    return this.active;
  }
  current(request: Request, scope: SingleVideoScope | null): boolean {
    return this.active === request && !!scope && scope.ownerId === request.scope.ownerId
      && scope.category === request.scope.category && scope.revision === request.scope.revision
      && scope.inputKey === request.scope.inputKey;
  }
  cancel() { this.active = null; }
  finish(request: Request) { if (this.active === request) this.active = null; }
}

export async function runSingleVideoAction<Track, Prepared>(options: {
  gate: SingleVideoActionGate;
  scope: SingleVideoScope;
  readScope: () => SingleVideoScope | null;
  onPhase: (phase: SingleVideoPhase | null) => void;
  resolveAudio: (isCurrent: () => boolean) => Promise<Track>;
  prepareVideo: (track: Track, isCurrent: () => boolean) => Promise<Prepared>;
  startVideo: (track: Track, prepared: Prepared, isCurrent: () => boolean) => Promise<void>;
  onError: (message: string) => void;
}): Promise<void> {
  const request = options.gate.begin(options.scope);
  if (!request) return;
  const isCurrent = () => options.gate.current(request, options.readScope());
  try {
    if (!isCurrent()) return;
    options.onPhase('audio');
    const track = await options.resolveAudio(isCurrent);
    if (!isCurrent()) return;
    options.onPhase('prompt');
    const prepared = await options.prepareVideo(track, isCurrent);
    if (!isCurrent()) return;
    options.onPhase('video');
    await options.startVideo(track, prepared, isCurrent);
  } catch (reason) {
    if (isCurrent()) options.onError(reason instanceof Error ? reason.message : '작업 상태를 확인해 주세요.');
  } finally {
    // A cancelled old chain cannot unlock a newer owner's request.
    if (isCurrent()) options.onPhase(null);
    options.gate.finish(request);
  }
}

/** React child/client restore must commit before a paid start can be dispatched. */
export async function waitForSingleVideoReady<T>(
  read: () => T | null, isCurrent: () => boolean,
  wait: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 50)),
): Promise<T | null> {
  for (let attempt = 0; attempt < 200 && isCurrent(); attempt++) {
    const ready = read();
    if (ready) return ready;
    await wait();
  }
  if (!isCurrent()) return null;
  throw new Error('저장된 작업 상태를 확인하고 있습니다. 잠시 후 같은 버튼을 눌러 주세요.');
}
