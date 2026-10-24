import type { QobuzProvider, QobuzStream, QobuzTrack, Quality } from '../types.js';

interface Source { name: string; provider: QobuzProvider }

export class RacingProvider implements QobuzProvider {
  // 🌟 The Jail: Tracks when a source is allowed to try again
  private cooldowns = new Map<string, number>();
  private readonly COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly sources: Source[]) {}

  async search(query: string, quality: Quality, atmos: string): Promise<QobuzTrack[]> {
    return new Promise((resolve) => {
      let settled = false;
      let pending = this.sources.length;

      for (const source of this.sources) {
        // 🛡️ Check if the source is in the penalty box
        const cooldownUntil = this.cooldowns.get(source.name) ?? 0;
        if (Date.now() < cooldownUntil) {
          console.warn(`[Racing] Skipping ${source.name} (cooldown active)`);
          pending -= 1;
          if (pending === 0 && !settled) resolve([]);
          continue;
        }

        const timeoutPromise = new Promise<never>((_, rejectTimeout) => 
          setTimeout(() => rejectTimeout(new Error('Timeout')), 3000)
        );

        Promise.race([
          source.provider.search(query, quality, atmos),
          timeoutPromise
        ]).then(tracks => {
          if (settled) return;
          if (tracks.length > 0) {
            settled = true;
            // Success means we clear the penalty
            this.cooldowns.delete(source.name);
            resolve(tracks.map(track => ({ ...track, upstreamId: `${source.name}:${track.upstreamId}` })));
            return;
          }
          pending -= 1;
          if (pending === 0) resolve([]);
        }).catch((error) => {
          console.warn(`[Racing] ${source.name} failed. Sending to 5-min cooldown.`, error.message);
          this.cooldowns.set(source.name, Date.now() + this.COOLDOWN_MS);
          pending -= 1;
          if (pending === 0 && !settled) resolve([]);
        });
      }
    });
  }

  async getStream(trackId: string, quality: Quality, atmos: string): Promise<QobuzStream | null> {
    const separator = trackId.indexOf(':');
    if (separator <= 0) return null;
    const sourceName = trackId.slice(0, separator);
    const upstreamId = trackId.slice(separator + 1);
    const source = this.sources.find(candidate => candidate.name === sourceName);
    return source ? source.provider.getStream(upstreamId, quality, atmos) : null;
  }
}

export function createRacingProvider(
  qobuzdl: QobuzProvider,
  lastbabe: QobuzProvider,
  monochrome?: QobuzProvider,
  deezer?: QobuzProvider,
  eljohnzc?: QobuzProvider,
  instable?: QobuzProvider,
): QobuzProvider {
  const sources: Source[] = [
    { name: 'lastbabe', provider: lastbabe },
    { name: 'qobuzdl', provider: qobuzdl },
  ];
  if (deezer) sources.unshift({ name: 'deezer', provider: deezer });
  if (monochrome) sources.unshift({ name: 'monochrome', provider: monochrome });
  if (eljohnzc) sources.unshift({ name: 'eljohnzc', provider: eljohnzc });
  if (instable) sources.unshift({ name: 'instable', provider: instable });
  return new RacingProvider(sources);
}
