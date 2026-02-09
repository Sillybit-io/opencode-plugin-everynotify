# Changelog

## [0.4.0](https://github.com/Sillybit-io/opencode-plugin-everynotify/compare/opencode-plugin-everynotify-v0.3.4...opencode-plugin-everynotify-v0.4.0) (2026-02-09)


### Features

* **config:** add delay option for deferred notification dispatch ([06ed2e4](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/06ed2e40f2319952df384d6317e7b91ac0cabaa3))
* **dispatcher:** replace debounce with configurable delay-and-replace queue ([5a51032](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/5a510329dd3065d4b88076cdaeafd9547262c61e))


### Bug Fixes

* isolate logger tests from module mock leakage ([fd7c00a](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/fd7c00ad8d68ce31df8b7e18b011cbe9e49dbe94))


### Miscellaneous

* update @types/node and undici-types to latest versions in package.json and bun.lock ([8a92651](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/8a92651c68afc08cece3b7301871160f933665b8))

## [0.3.4](https://github.com/Sillybit-io/opencode-plugin-everynotify/compare/opencode-plugin-everynotify-v0.3.3...opencode-plugin-everynotify-v0.3.4) (2026-02-09)


### Bug Fixes

* replace _fsOps spyOn with dependency injection in logger ([43fa0e5](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/43fa0e5a737387d39ec8951dde53afd55e77af66))

## [0.3.3](https://github.com/Sillybit-io/opencode-plugin-everynotify/compare/opencode-plugin-everynotify-v0.3.2...opencode-plugin-everynotify-v0.3.3) (2026-02-09)


### Bug Fixes

* mark docs/chore/test/ci as hidden in changelog-sections ([b71f671](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/b71f67178c962021f0746cfaf5929454a8f5277c))


### Code Refactoring

* replace console.error with logger across production code ([8b52a2e](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/8b52a2edf7ad94e32637aacf329911565e43b20d))


### Miscellaneous

* add changelog-sections to release-please config ([1d05078](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/1d050789e48a05d7b81012f2a7ca75bf858aaaf9))
* unhide chore commits in release-please changelog-sections ([4db701b](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/4db701b09ed98cc0e95101188227946845ee3f78))

## [0.3.2](https://github.com/Sillybit-io/opencode-plugin-everynotify/compare/opencode-plugin-everynotify-v0.3.1...opencode-plugin-everynotify-v0.3.2) (2026-02-09)


### Bug Fixes

* **tests:** use mutable _fsOps for reliable cross-module spying and add Bun types ([8bc80e7](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/8bc80e7179dee707d3d754679b318092b6de6c50))

## [0.3.1](https://github.com/Sillybit-io/opencode-plugin-everynotify/compare/opencode-plugin-everynotify-v0.3.0...opencode-plugin-everynotify-v0.3.1) (2026-02-08)


### Bug Fixes

* **ci:** pin Bun version to 1.3.9 to fix ESM spyOn flakiness ([0b24aef](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/0b24aef5670d24dcac2bbed8aaae239d1e4deb77))

## [0.3.0](https://github.com/Sillybit-io/opencode-plugin-everynotify/compare/opencode-plugin-everynotify-v0.2.0...opencode-plugin-everynotify-v0.3.0) (2026-02-08)


### Features

* add configurable truncation direction for notification messages ([be36b26](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/be36b261c8c5db7a0be581ad73d16f5edaaa2346))


### Bug Fixes

* **tests:** mock os.homedir() to prevent tests from deleting user config ([34e74a1](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/34e74a1cbce47e9586e714fe5e9dbfb551f88371))

## [0.2.0](https://github.com/Sillybit-io/opencode-plugin-everynotify/compare/opencode-plugin-everynotify-v0.1.1...opencode-plugin-everynotify-v0.2.0) (2026-02-08)


### Features

* **config:** add events config for per-event-type filtering ([3f0eefe](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/3f0eefeae67b663f9dab27045a2551401ad8e5b4))
* **hooks:** add event filtering before dispatch ([a1c2740](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/a1c2740b1163bdb5dd5a8844222df50da692b8f3))
* **integration:** wire logger into dispatcher and plugin hooks ([9a69241](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/9a692410d5e86a72fbf70e7a65b89d56ef5ed718))
* **logger:** add file-based logger with rotation and never-throw semantics ([d5577f1](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/d5577f1dac47881a2fab934ff8683d158e097b54))
* **payload:** use last assistant message as notification body ([4b6c628](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/4b6c628fe738c2050a611b0fc9cf81d89fa03eff))
* **types:** add LogConfig interface and config support for log system ([e3de540](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/e3de540577c9a1fea3f717903d1c848237fd0362))


### Bug Fixes

* **hooks:** extract sessionID from permission.ask and tool.execute.before inputs ([5e9181e](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/5e9181ea526127217680d992623d281d4311ab6e))

## [0.1.1](https://github.com/Sillybit-io/opencode-plugin-everynotify/compare/opencode-plugin-everynotify-v0.1.0...opencode-plugin-everynotify-v0.1.1) (2026-02-08)


### Bug Fixes

* correct mock setup in service tests for Bun compatibility ([77d67c9](https://github.com/Sillybit-io/opencode-plugin-everynotify/commit/77d67c930921b1d3683ce0f67eaf71ea36c997ac))
