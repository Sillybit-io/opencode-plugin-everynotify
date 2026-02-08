# Changelog

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
