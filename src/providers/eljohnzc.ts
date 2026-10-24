import type { Config } from '../config.js';
import type { QobuzProvider, QobuzStream, QobuzTrack, Quality } from '../types.js';
import { UpstreamError } from './http.js';

type RecordValue = Record<string, unknown>;

export class EljohnzcProvider implements QobuzProvider {
  constructor(private readonly config: Config) {}

  async search(query: string, quality: Quality, atmos: string): Promise<QobuzTrack[]> {
    const body = await this.request('/search', { q: query, quality, atmos });
    const items = isRecord(body) && Array.isArray(body.tracks) ? body.tracks : Array.isArray(body) ? body : [];
    return items.filter(isRecord).map(toTrack).filter((track): track is QobuzTrack => track !== null);
  }

  async getStream(trackId: string, quality: Quality, atmos: string): Promise<QobuzStream | null> {
    // Basic sanitization to prevent URL injection
    if (!/^[A-Za-z0-9_-]+$/.test(trackId)) return null;

    try {
      const body = await this.request(`/stream/${encodeURIComponent(trackId)}`, { quality, atmos });
      
      if (!isRecord(body) || typeof body.url !== 'string' || !/^https:\/\//i.test(body.url)) return null;
      
      return {
        url: body.url, 
        format: typeof body.format === 'string' ? body.format : undefined,
        quality: typeof body.quality === 'string' ? body.quality : quality,
        manifest: body.manifest === 'hls' || body.manifest === 'dash' ? body.manifest : 'none',
        encrypted: body.encrypted === true,
      };
    } catch (error) {
      // 🛡️ Silent failure to protect the server from 502 crashes
      return null; 
    }
  }

  private async request(path: string, params: Record<string, string>): Promise<unknown> {
    const base = this.config.eljohnzcBaseUrl?.trim() || 'https://eljohnzcaddon.velixir.run/c57e7b0ef2031b2f1fcd';
    
    const url = new URL(path.replace(/^\/+/, ''), base.endsWith('/') ? base : `${base}/`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    
    try {
      const response = await fetch(url, { 
        headers: { 
          accept: 'application/json',
          'accept-language': 'en-US,en;q=0.9,th;q=0.8',
          // 🛡️ The Camouflage: Spoofing an iPhone Safari Browser
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
          'referer': base.replace(/\/$/, '') + '/',
          'origin': base.replace(/\/$/, '')
        }, 
        signal: controller.signal 
      });
      
      let body: unknown;
      try { 
        body = await response.json(); 
      } catch { 
        throw new UpstreamError(502, 'Eljohnzc returned invalid JSON'); 
      }
      
      if (!response.ok) {
        throw new UpstreamError(response.status >= 500 ? 502 : response.status, `Eljohnzc request failed (HTTP ${response.status})`);
      }
      return body;
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      throw new UpstreamError(502, 'Eljohnzc request failed');
    } finally { 
      clearTimeout(timeout); 
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function toTrack(raw: RecordValue): QobuzTrack | null {
  const id = raw.id;
  const title = raw.title;
  if ((typeof id !== 'number' && typeof id !== 'string') || typeof title !== 'string' || !title.trim()) return null;
  
  const artist = typeof raw.artist === 'string' ? raw.artist : isRecord(raw.artist) && typeof raw.artist.name === 'string' ? raw.artist.name : undefined;
  const album = typeof raw.album === 'string' ? raw.album : isRecord(raw.album) && typeof raw.album.title === 'string' ? raw.album.title : undefined;
  
  return { 
    upstreamId: String(id), 
    title: title.trim(), 
    artist, 
    album, 
    duration: typeof raw.duration === 'number' ? raw.duration : undefined, 
    artworkURL: typeof raw.artworkURL === 'string' ? raw.artworkURL : typeof raw.artwork === 'string' ? raw.artwork : undefined,
    format: typeof raw.format === 'string' ? raw.format : undefined,
    audioQuality: typeof raw.audioQuality === 'string' ? raw.audioQuality : undefined
  };
}

function isRecord(value: unknown): value is RecordValue { 
  return typeof value === 'object' && value !== null; 
}