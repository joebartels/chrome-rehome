import { createStatusNotifier } from '../browser/control-status-hints';
import { createControlTargets, createNativeControlTargets } from '../browser/control-target';
import { createChromeProtectionStorage } from '../browser/protection-storage';
import { createProtectionRepository } from '../protections/repository';
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

const notifyStatus = createStatusNotifier(chrome.runtime);
const diagnostics = createDiagnostics();
const tracker = createNavigationTracker();
const port = createPlacementAdapter(chrome);
const journal = createReplacementJournal({ storage: createChromeJournalStorage(chrome), createOperationId: () => crypto.randomUUID() });
const recovery = createRecovery({ journal, port });
const config = createConfigRepository(createChromeConfigStorage(chrome));
let recoveryInitialized = false;
const controls = createControlService({ config, protections: createProtectionRepository(createChromeProtectionStorage(chrome)), targets: createControlTargets(chrome), workerId: crypto.randomUUID(),
  nativeTargets: createNativeControlTargets(chrome), whenReady: (): Promise<void> => coordinator.initialize(),
  runtime: () => !recoveryInitialized ? 'checking' : recovery.isReady() ? 'ready' : 'blocked' });
controls.subscribe(notifyStatus);
const consume = createPlacementConsumer({ tracker, port, journal, diagnostics });
const coordinator = createCoordinator({
  config,
  controls,
  tracker,
  recovery: { async initialize() { try { await recovery.initialize(); } finally { recoveryInitialized = true; notifyStatus(); } }, isReady: recovery.isReady },
  queue: createOperationQueue(),
  diagnostics,
  async consume(event, context) { try { await consume(event, context); } finally { notifyStatus(); } },
});
const reportFailure = () => { diagnostics.record({ code: 'operation-failed' }); };

registerControlMessages(chrome.runtime, controls);
registerEvents(chrome, coordinator, reportFailure);
void coordinator.initialize().catch(() => { reportFailure(); }).finally(notifyStatus);
