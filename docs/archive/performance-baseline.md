# ChromeReHome performance baseline

> Historical record. This describes a past build, not current behavior or instructions. Personal paths and examples have been sanitized; external artifacts are not bundled. See the [archive guide](README.md).

## Reproduce

Build and check the extension, then run the benchmark with Node 24 and a Chrome for Testing executable. Run on a quiet machine. The script creates and removes its own Chrome profiles and serves small HTML pages on loopback. It writes a JSON checkpoint after each sample, with a completion flag and a failure field if a run stops early.

```sh
npm run build
npm run check:package
node tests/performance/benchmark.mjs \
  --chrome "/absolute/path/to/Chrome for Testing" \
  --output /tmp/chromerehome-performance.json
node tests/performance/benchmark.mjs \
  --chrome "/absolute/path/to/Chrome for Testing" \
  --output /tmp/chromerehome-foreground.json \
  --headed --tabs 20 --rules 100 --scenario replacement-foreground --skip-idle
```

The default headless run covers 20, 200 and 1000 total open tabs, with 1, 25 and 100 active rules per list at each size, five warm and five cold samples per scenario. The profile has two normal windows, two filler groups, a destination group and a replacement anchor. To bound renderer memory at 1000 tabs, the harness first loads most filler pages and then discards them. Chrome retains their URLs and positions in the tab model. The incoming and anchor documents stay loaded. Actual discarded counts are in the rows. Use the headed command for foreground replacement and `--idle-only` to repeat idle without measuring latency. The script uses a disposable keychain for Chrome's macOS fixture startup and checks that the extension worker belongs to the copied package.

## What the measurements represent

- **Copied worker.** The script copies the package and inserts probes into its worker bundle. The probes wrap selected Chrome methods and the production navigation handler and record the placement result. The independently observed Chrome commit must match the acknowledgment by tab, URL and document ID. The worker must consume the event, see the expected rule count, build the expected plan and return a completed executor result. This gives the no-match case a real endpoint even though the incoming tab stays where it is. The only package file with different bytes is the worker bundle. Keep the probe copy out of the release ZIP.
- **Latency.** Handler duration uses a monotonic clock within one worker realm. Trigger to acknowledgment uses the Node monotonic clock and includes CDP navigation, browser dispatch, and delivery of the acknowledgment, with up to one polling interval before observation. The cold path stops the previous worker through CDP and checks a new realm and a running transition after the stimulus. Warm and cold trials use the same fixture and run in a fixed warm-then-cold order. Before timing, the harness waits for the protection indicator to finish and for 30 ms without a counted API invocation, then detaches the worker inspector. Browser event timestamps identify the commit.
- **API and storage counts.** Handler counts cover invocations between the start and return of the production coordinator promise. Action and menu work can overlap that interval or continue after the acknowledgment. Cold realm totals at acknowledgment also include calls before the handler starts. A second sample waits for that realm's indicator and API activity to settle after the handler, before any new fixture work. The test-only acknowledgment, fixture calls and browser-owned work are outside these counts. `storage.local` is durable settings storage. `storage.session` tracks recovery and protection state for the browser session.
- **Untouched package.** A byte-identical copy of the package separately verifies actual tab, group and window state. For mutations, the harness records time to observation, including its polling. The untouched no-match case records unchanged state after a bounded observation period. True no-match completion comes from the copied worker.
- **Idle and memory.** An untouched profile observes browser-owned lifecycle transitions from an ordinary page's ServiceWorker domain with no worker debugger attached. After the options tab closes, the harness sends no extension calls. Memory is the sum of RSS for the browser process and Chrome-reported process IDs, which can count shared pages more than once. A separate post-sample V8 heap reading attaches briefly to the copied worker. It includes probe allocations and cannot isolate the extension's production memory cost.

## Results

Chrome for Testing 157.0.8103.50 on macOS 27.0.1, Apple M5 Pro arm64 with 64 GiB RAM, and Node 24.22.2. The full matrix and idle runs used the pre-fix 0.1.3 release candidate, with original worker SHA-256 `533e9ec57614bc016d2f9c29c8d04306045a417afada214524de65d0492679e0` and 189,663 bytes across eight unpacked files. The reports contain the full package inventories. The headless matrix completed 270 copied-worker trials across 54 cells, plus three untouched-package checks. The headed run completed ten copied-worker trials and one untouched-package check.

### Latency

Milliseconds, median / p95, at 100 active rules in each list. At five repetitions per cell, nearest-rank p95 equals the sample maximum.

| Tabs | Scenario | Warm handler | Warm trigger to acknowledgment | Cold handler | Cold trigger to acknowledgment |
| ---: | --- | ---: | ---: | ---: | ---: |
| 20 | No match | 7.2 / 8.2 | 17.3 / 18.6 | 12.2 / 12.9 | 24.8 / 26.1 |
| 20 | Grouping | 9.3 / 15.3 | 15.2 / 20.6 | 13.6 / 21.2 | 24.7 / 31.8 |
| 20 | Background replacement | 14.5 / 20.2 | 24.4 / 32.4 | 20.7 / 24.9 | 30.6 / 41.6 |
| 200 | No match | 18.7 / 23.5 | 32.6 / 36.3 | 28.6 / 33.9 | 44.3 / 50.3 |
| 200 | Grouping | 43.5 / 44.1 | 55.0 / 57.7 | 47.2 / 51.6 | 63.9 / 72.7 |
| 200 | Background replacement | 50.0 / 60.5 | 61.0 / 68.7 | 61.8 / 72.3 | 80.4 / 88.1 |
| 1000 | No match | 121.1 / 127.3 | 134.5 / 147.6 | 140.0 / 141.4 | 169.7 / 177.9 |
| 1000 | Grouping | 277.3 / 305.4 | 297.4 / 323.3 | 286.0 / 327.8 | 324.1 / 366.0 |
| 1000 | Background replacement | 416.7 / 452.9 | 437.2 / 469.3 | 426.1 / 452.2 | 455.9 / 496.7 |
| 20 | Foreground replacement, headed | 72.2 / 91.9 | 88.0 / 108.1 | 78.6 / 79.9 | 98.0 / 103.1 |

All 1000-tab rows had 983 discarded filler tabs. The untouched package also moved the grouping and background-replacement tabs to their expected destination, observed 53.8 ms and 52.9 ms after trigger. The headed replacement moved focus and the active tab to the destination, observed after 101.0 ms. The raw records include both windows’ before and after Chrome focus and active-tab state.

### Browser calls and memory

Worker calls during warm handlers. `getFrame` reads top-level document identity. No row wrote durable settings storage.

| Scenario | `tabs.query` | `tabGroups.query` | `webNavigation.getFrame` | `windows.getAll` | `storage.session.set` | `storage.session.remove` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| No match | 7 | 7 | 3 | 1 | 3 | 1 |
| Grouping | 15 | 15 | 7 | 1 | 9 | 1 |
| Background replacement | 19 | 19 | 18 | 1 | 12 | 1 |
| Foreground replacement | 27 | 27 | 26 | 66 | 18 | 1 |

No-match reached normal executor completion with zero tab mutations. It still performed seven fresh tab/group reads and three session journal writes. Grouping moved and grouped one tab. Replacement also removed one duplicate. Foreground replacement additionally activated the winning tab and focused the destination.

At 1000 tabs, a fresh worker invoked `action.setBadgeText` 1,001 times in every cold sample before settling. Its last counted API call came 371–1,160 ms after handler completion. This startup work overlaps navigation. The pilot exposed that overlap in later warm samples and the controlled run waited for it to finish before the next trigger.

| Tabs | Chrome processes seen by RSS sample | Summed browser RSS, GiB | Copied worker V8 heap used, MiB |
| ---: | ---: | ---: | ---: |
| 20 | 26 | 2.56 | 1.72 |
| 200 | 206 | 17.69 | 2.42 |
| 1,000 | 1,007 | 84.46 | 4.87 |

The RSS figures sum per-process observations and can exceed physical memory when mappings are shared. The heap figures are post-sample snapshots from a recently restarted worker. They describe this profile and browser, including instrumentation.

Both untouched Chrome 157 idle profiles stopped naturally after 30.02 seconds and stayed stopped for the next 8.07 and 8.08 seconds. Each used enabled settings with 100 rules per list and one ordinary tab after closing the options page. A source scan found no timer, alarm or persistent runtime port used for background polling.

### Provisional local budgets

These trigger-to-acknowledgment regression targets cover the measured background scenarios and rule counts. They leave headroom above the worst observed cell p95. Recheck on the same fixture before comparing other hardware or Chrome builds.

| Tabs | Worst observed warm / cold p95, ms | Proposed warm / cold ceiling, ms |
| ---: | ---: | ---: |
| 20 | 32.4 / 41.6 | 50 / 75 |
| 200 | 71.1 / 102.9 | 125 / 175 |
| 1,000 | 726.4 / 894.7 | 900 / 1,100 |

For the 20-tab headed foreground case, a provisional 150 ms ceiling covers both warm and cold p95 observations.

Use 200 open tabs as the routine performance envelope for the tested workload. The 1000-tab profile is a functional stress case with mostly discarded tabs, two windows and one duplicate per replacement. The observed worst cell was a cold replacement at 25 rules per list. Loaded-renderer saturation, simultaneous navigations and mass duplicate removal remain outside the measured envelope.

Keep the existing cap of 100 rules per list. Each tested duplicate policy used one ignored parameter and each replacement used one duplicate. The policy and operation limits allow 100 ignored parameter names and 100 total replacement participants, respectively. The browser probes measured at most 1.9 ms p95 for rule compilation and 1.2 ms p95 for grouping match. A separate Node 24 run at 100 rules per list recorded 0.515 ms compile p95, 0.030 ms last-rule grouping-match p95 and 1.697 ms p95 for scanning 1000 synthetic candidates. The larger browser cost appears in workflows that repeatedly read and validate Chrome tab and group state. Keep fresh reads and navigation guards. Profile the no-match journal path and cold badge reconciliation before considering a tab index.

### Final package spot checks

The corrected 0.1.3 worker SHA-256 is `854ddd3eb5c269f343e7c5586442410a9a7c928e5d357a798729f7b38fdf4678`. The corrected package completed 18 copied-worker trials at 200 tabs and 100 rules per list, six headed foreground trials at 20 tabs and 100 rules per list, and four untouched-package outcome checks. Worst trigger-to-acknowledgment times were 64.4 ms warm and 85.7 ms cold for the 200-tab cases, and 90.0 ms warm and 106.3 ms cold for the headed case. Each cell had three trials. The fresh read and placement paths are the same in both packages.

Raw reports are `performance-matrix.json`, `performance-foreground.json`, `performance-idle.json`, `pure-phase-costs.json`, `performance-final-200.json` and `performance-final-foreground.json`.
