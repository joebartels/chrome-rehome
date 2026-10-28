import { createControlService } from './controls';
import { registerControlMessages } from '../browser/control-messages';
import { createChromeJournalStorage } from '../browser/journal-storage';
import { createReplacementJournal } from '../execution/journal';
import { createRecovery } from './recovery';
import { createPlacementAdapter } from '../browser/placement';
import { createPlacementConsumer } from './placement';
import { createChromeConfigStorage } from '../browser/config-storage';
import { createConfigRepository } from '../config/repository';
import { createDiagnostics } from '../diagnostics/diagnostics';
import { createCoordinator } from './coordinator';
import { createNavigationTracker } from './navigation';
import { createOperationQueue } from './operation-queue';
import { registerEvents } from './register-events';

const diagnostics = createDiagnostics();
const tracker = createNavigationTracker();
const port = createPlacementAdapter(chrome);
const journal = createReplacementJournal({ storage: createChromeJournalStorage(chrome), createOperationId: () => crypto.randomUUID() });
const recovery = createRecovery({ journal, port });
const config = createConfigRepository(createChromeConfigStorage(chrome));
let recoveryInitialized = false;
const controls = createControlService({ config, workerId: crypto.randomUUID(),
  runtime: () => !recoveryInitialized ? 'checking' : recovery.isReady() ? 'ready' : 'blocked' });
const coordinator = createCoordinator({
  config,
  controls,
  tracker,
  recovery: { async initialize() { await recovery.initialize(); recoveryInitialized = true; }, isReady: recovery.isReady },
  queue: createOperationQueue(),
  diagnostics,
  consume: createPlacementConsumer({ tracker, port, journal, diagnostics }),
});
const reportFailure = () => { diagnostics.record({ code: 'operation-failed' }); };

registerControlMessages(chrome.runtime, controls);
registerEvents(chrome, coordinator, reportFailure);
void coordinator.initialize().catch(() => { reportFailure(); });
