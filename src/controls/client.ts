import { isControlReply, type ControlCommand, type ControlReply, type ControlVersion, type RuleLists, type TabReceipt, type TargetHint } from './protocol';

type Transport = { sendMessage(message: ControlCommand): Promise<unknown> };
export function createControlClient(transport: Transport) {
  async function send(command: ControlCommand): Promise<ControlReply> {
    // A disconnect may follow a persisted write. Never automatically retry it.
    const response = await transport.sendMessage(command);
    if (!isControlReply(response)) throw new Error('Control response is unavailable. Refresh status.');
    return response;
  }
  return {
    getStatus: (target?: TargetHint) => send({ kind: 'get-status', ...(target ? { target } : {}) }),
    setEnabled: (expected: ControlVersion, enabled: boolean) => send({ kind: 'set-enabled', expected, enabled }),
    setTabProtected: (expected: ControlVersion, target: TabReceipt, protectedValue: boolean) =>
      send({ kind: 'set-tab-protected', expected, target, protected: protectedValue }),
    saveRules: (expected: ControlVersion, baseRules: RuleLists, rules: RuleLists) => send({ kind: 'save-rules', expected, baseRules, rules }),
  };
}
