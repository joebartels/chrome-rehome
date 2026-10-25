# Foundation performance measurements

The foundation has no replacement algorithm or mutation pipeline. The smoke suite checks functional behavior on a small isolated profile; it does not establish performance budgets, idle shutdown timing, Chrome 120 compatibility or current-stable compatibility. Task 010 owns expanded measurements and release gates. CI is configured, not yet evidenced as executed by this local implementation.

## Reproducible measurement procedure

Record commit, OS/hardware, browser version/channel, Node version, profile state, extension configuration and repeated-run count. Use a fresh disposable profile, local fixture pages, and no other extensions. Keep test harness calls separate from extension calls. Report medians, p95 and sample counts; preserve raw traces outside the extension package.

For **20, 200 and 1000 tabs**, seed a known distribution of windows and groups using the harness. Test both disabled and valid enabled configuration. Capture pre/post tab IDs, window/group membership and indices. Navigate one tab through HTTP(S) committed, history and fragment cases; measure navigation-to-processing completion once the feature exposes a meaningful result. The current no-op consumer provides no such observable completion, so do not invent an event-consumption latency. Measure browser navigation latency separately and label it accordingly.

For **worker cold start**, terminate using test-only CDP `ServiceWorker.stopWorker`, wait for `stopped`, then navigate a fixture. Measure trigger-to-`running` with a monotonic harness clock, record lifecycle transitions and fresh realm evidence (target IDs may remain stable) and repeat after warm-up. CDP/DevTools observation can alter worker lifetime; label instrumented samples. The smoke test proves restart behavior but does not currently compute a startup latency distribution.

For **idle shutdown**, close worker DevTools, disconnect worker debugger/CDP instrumentation and leave the profile idle with no polling/messages/keep-alives. Observe browser-owned lifecycle tracing without evaluating the worker. Repeat and record actual stop time and observation method. Do not claim a fixed idle timeout from the forced-stop test.

For **API calls and storage writes**, use test-only Chrome API instrumentation or browser tracing established before extension startup; do not add production endpoints. Count `storage.local.get/set`, tab/group snapshot calls, mutation APIs and network calls separately for cold start, idle and each navigation scenario. Include instrumentation overhead and harness calls separately. Check stored data before/after invalid and future-schema startup to confirm preservation. Distinguish static absence of mutation code from measured API counts.

## Results actually measured

No numerical timing, API-call or storage-write baseline has been measured in this foundation delivery. The local automated smoke tests assert unchanged tab/group snapshots and preservation of invalid/future configuration; these are functional assertions. Record future measurements in this document only with environment, method, sample counts and evidence. Expanded budgets and browser compatibility remain TODO010.
