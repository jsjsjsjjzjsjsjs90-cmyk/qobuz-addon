import type { Config } from '../config.js';
import type { QobuzProvider } from '../types.js';
import { StubQobuzProvider } from './stub.js';
import { HttpQobuzProvider } from './http.js';
import { QobuzDlProvider } from './qobuzdl.js';
import { LastBabeProvider } from './lastbabe.js';
import { createRacingProvider } from './racing.js';
import { MonochromeProvider } from './monochrome.js';
import { RemoteAddonProvider } from './remote-addon.js';
import { InstableProvider } from './instable.js';
import { EljohnzcProvider } from './eljohnzc.js'; // 🌟 The new file is imported

export type IsolatedSource = 'qobuzdl' | 'lastbabe' | 'monochrome' | 'deezer' | 'eljohnzc' | 'instable';

export function createProvider(config: Config): QobuzProvider {
  if (config.provider === 'qobuzdl') return new QobuzDlProvider(config);
  if (config.provider === 'multi') {
    return createRacingProvider(
      new QobuzDlProvider(config), 
      new LastBabeProvider(config),
      new MonochromeProvider(config), 
      new RemoteAddonProvider(config), // Deezer (still uses the shared file)
      new EljohnzcProvider(config),    // 🌟 Swapped to the dedicated file!
      new InstableProvider(config),
    );
  }
  if (config.provider === 'http') return new HttpQobuzProvider(config);
  return new StubQobuzProvider();
}

export function createSourceProvider(config: Config, source: IsolatedSource): QobuzProvider {
  if (source === 'qobuzdl') return new QobuzDlProvider({ ...config, apiBaseUrl: config.apiBaseUrl ?? 'https://qobuz-dll.foreyou.workers.dev' });
  if (source === 'monochrome') return new MonochromeProvider(config);
  if (source === 'deezer') return new RemoteAddonProvider(config);
  if (source === 'eljohnzc') return new EljohnzcProvider(config); // 🌟 Swapped here too!
  if (source === 'instable') return new InstableProvider(config);
  return new LastBabeProvider(config);
}
