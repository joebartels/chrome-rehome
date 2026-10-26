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
const coordinator = createCoordinator({
  config: createConfigRepository(createChromeConfigStorage(chrome)),
  tracker,
  queue: createOperationQueue(),
  diagnostics,
  consume: createPlacementConsumer({tracker,port:createPlacementAdapter(chrome),diagnostics}),
});
const reportFailure = () => { diagnostics.record({ code: 'operation-failed' }); };

registerEvents(chrome, coordinator, reportFailure);
void coordinator.initialize().catch(() => { reportFailure(); });
