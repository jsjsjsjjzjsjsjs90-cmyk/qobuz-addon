import type { QobuzProvider, QobuzStream, QobuzTrack, Quality } from '../types.js';

interface Source { name: string; provider: QobuzProvider }

export class RacingProvider implements QobuzProvider {
  // 🌟 The Jail: Tracks when a source is allowed to try again
  private cooldowns = new Map<string, number>();
  private readonly COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes penalty

  constructor(private readonly sources: Source[]) {}

  private isJailed(sourceName: string): boolean {
    const cooldownUntil = this.cooldowns.get(sourceName) ?? 0;
    return Date.now() < cooldownUntil;
  }

  private sendToJail(sourceName: string, reason: string) {
    console.warn(`[Racing] Sending ${sourceName} to 5-min jail. Reason: ${reason}`);
    this.cooldowns.set(sourceName, Date.now() + this.COOLDOWN_MS);
  }

  private freeFromJail(sourceName: string) {
    this.cooldowns.delete(sourceName);
  }

  async search(query: string, quality: Quality, atmos: string): Promise<QobuzTrack[]> {
    return new Promise((resolve) => {
      let settled = false;
      let pending = this.sources.length;

      for (const source of this.sources) {
        // 🛡️ Check if the source is in the penalty box
        if (this.isJailed(source.name)) {
          pending -= 1;
          if (pending === 0 && !settled) resolve([]);
          continue;
        }

        // 3-second hard timeout per provider
        const timeoutPromise = new Promise<never>((_, rejectTimeout) => 
          setTimeout(() => rejectTimeout(new Error('Search Timeout')), 3000)
        );

        Promise.race([
          source.provider.search(query, quality, atmos),
          timeoutPromise
        ]).then(tracks => {
          if (settled) return;
          if (tracks.length > 0) {
            settled = true;
            this.freeFromJail(source.name); // Success means they are rehabilitated
            resolve(tracks.map(track => ({ ...track, upstreamId: `${source.name}:${track.upstreamId}` })));
            return;
          }
          pending -= 1;
          if (pending === 0) resolve([]);
        }).catch((error) => {
          this.sendToJail(source.name, error.message);
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

    // 🛡️ If this specific source is already in jail, fail instantly. Don't waste Vercel's time.
    if (this.isJailed(sourceName)) {
      console.warn(`[Racing] Stream denied. ${sourceName} is currently in jail.`);
      return null; 
    }

    const source = this.sources.find(candidate => candidate.name === sourceName);
    if (!source) return null;

    try {
      // 5-second timeout for stream extraction (grabbing the actual URL can take a moment)
      const timeoutPromise = new Promise<never>((_, rejectTimeout) => 
        setTimeout(() => rejectTimeout(new Error('Stream Timeout')), 5000)
      );

      const stream = await Promise.race([
        source.provider.getStream(upstreamId, quality, atmos),
        timeoutPromise
      ]);

      if (!stream) {
        // If the provider returns null (couldn't find the FLAC), send to jail.
        this.sendToJail(sourceName, 'Returned null stream');
        return null;
      }

      // Success! Free them from jail if they were there.
      this.freeFromJail(sourceName);
      return stream;

    } catch (error: any) {
      this.sendToJail(sourceName, error.message || 'Stream failed');
      return null; // Fail gracefully, don't crash the server
    }
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
  const sources: Source[] = [];

  // Ordered by typical speed/reliability
  if (monochrome) sources.push({ name: 'monochrome', provider: monochrome });
  sources.push({ name: 'qobuzdl', provider: qobuzdl });
  if (instable) sources.push({ name: 'instable', provider: instable });
  if (deezer) sources.push({ name: 'deezer', provider: deezer });
  sources.push({ name: 'lastbabe', provider: lastbabe });
  if (eljohnzc) sources.push({ name: 'eljohnzc', provider: eljohnzc });

  return new RacingProvider(sources);
}
