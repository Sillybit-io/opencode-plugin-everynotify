# EveryNotify — Multi-Service Notifications for opencode

[![npm version](https://img.shields.io/npm/v/@sillybit/opencode-plugin-everynotify.svg)](https://www.npmjs.com/package/@sillybit/opencode-plugin-everynotify)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

EveryNotify is a lightweight, zero-dependency notification plugin for [opencode](https://github.com/opencode-ai/plugin) designed to keep you informed about your AI-driven development sessions. It dispatches notifications to multiple services simultaneously, ensuring you stay updated on task progress, errors, and interaction requests, even when you're not actively monitoring your terminal.

## Overview

In long-running development tasks or deep research sessions, it's common to switch focus while opencode works in the background. EveryNotify bridges the gap between your terminal and your preferred notification device, allowing you to react quickly when opencode requires input or has finished its work.

### Why EveryNotify?

- **Multitasking Efficiency**: Walk away from your desk while opencode processes complex requests.
- **Immediate Awareness**: Get notified the instant an error occurs or a permission is requested.
- **Centralized Logs**: Use Slack, Discord, or Telegram as a secondary history of your opencode sessions.
- **Universal Reach**: Works across desktop and mobile through native service apps.

## Features

- ✅ **4 Notification Services**: Native support for Pushover, Telegram, Slack, and Discord.
- ✅ **Automatic Event Detection**: Notifies on session completion, idle states, errors, and questions.
- ✅ **Rich Session Meta**: Notifications include the project name, session ID, and total elapsed time.
- ✅ **Intelligent Debouncing**: Prevents notification storms by aggregating repeated events within a 1-second window.
- ✅ **Fault Tolerance**: Isolated service calls ensure that a failure in one provider doesn't block others.
- ✅ **Zero Runtime Dependencies**: Built entirely on standard Node.js APIs and native `fetch()`.
- ✅ **Privacy & Control**: Completely opt-in; no notifications are sent until you enable and configure a service.
- ✅ **Event Filtering**: Selectively enable or disable notifications for specific event types.
- ✅ **Rich Content**: Notifications include the actual assistant response text for better context.

## Installation

Install EveryNotify into your opencode environment using npm:

```bash
npm install @sillybit/opencode-plugin-everynotify
```

## Using with opencode

opencode does not auto-load npm packages; you must **register the plugin** in your opencode config so it is loaded at startup.

### Option 1: Register via config (recommended)

Add EveryNotify to the `plugin` array in your opencode config. opencode will install and load it automatically (using Bun) when you run opencode.

**Global config** (all projects): edit `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["@sillybit/opencode-plugin-everynotify"]
}
```

**Project config** (single project): add or edit `opencode.json` in your project root:

```json
{
  "plugin": ["@sillybit/opencode-plugin-everynotify"]
}
```

You can list multiple plugins in the same array, e.g. `["@sillybit/opencode-plugin-everynotify", "opencode-wakatime"]`.

### Option 2: Local plugin directory

Alternatively, place the plugin in opencode’s plugin directory so it is loaded as a local plugin:

- **Project-only**: `.opencode/plugins/` (e.g. symlink or copy from `node_modules/@sillybit/opencode-plugin-everynotify`)
- **All projects**: `~/.config/opencode/plugins/`

Files in these directories are loaded automatically; no `plugin` entry in opencode config is required for them.

After the plugin is loaded, configure your notification services (see [Configuration](#configuration)) and optionally add a `.everynotify.json` for per-project overrides.

## Configuration

EveryNotify utilizes a simple JSON configuration file named `.everynotify.json`. The plugin aggregates configuration from two potential scopes:

1. **Global Configuration**: `~/.config/opencode/.everynotify.json`
   _Use this for your default tokens and webhook URLs across all projects._
2. **Project Configuration**: `.opencode/.everynotify.json` (inside your project directory)
   _Use this to override settings or redirect notifications for a specific repository._

### Example Configuration

Create your `.everynotify.json` with the tokens for the services you want to use. You can enable multiple services at once.

```json
{
  "pushover": {
    "enabled": true,
    "token": "KzG789...your_app_token",
    "userKey": "uQi678...your_user_key",
    "priority": 0
  },
  "telegram": {
    "enabled": true,
    "botToken": "123456:ABC-DEF...your_bot_token",
    "chatId": "987654321"
  },
  "slack": {
    "enabled": false,
    "webhookUrl": "https://hooks.slack.com/services/T000/B000/XXXX"
  },
  "discord": {
    "enabled": false,
    "webhookUrl": "https://discord.com/api/webhooks/0000/XXXX"
  },
  "events": {
    "complete": true,
    "subagent_complete": true,
    "error": true,
    "permission": false,
    "question": true
  }
}
```

## Configuration Options

### Event Filtering

You can control which events trigger notifications by adding an `events` block to your `.everynotify.json`. All events are enabled (`true`) by default to ensure backward compatibility.

| Event               | Description                                                                |
| ------------------- | -------------------------------------------------------------------------- |
| `complete`          | The main opencode session has finished its task and is now idle.           |
| `subagent_complete` | A subagent has completed its specific assigned task.                       |
| `error`             | A fatal error or crash occurred during the session.                        |
| `permission`        | opencode is waiting for you to grant permission for a tool or file access. |
| `question`          | The `question` tool was used to ask you for clarification.                 |

### Rich Message Content

EveryNotify provides rich context in its notifications by extracting the assistant's last response. Instead of generic "Task completed" messages, you receive the actual summary or answer provided by opencode.

**Notification Priority:**

1. **Errors**: The specific error message always takes top priority.
2. **Assistant Text**: The actual text from the assistant's final response.
3. **Fallback**: If no text is found, it defaults to a generic "Task completed" message.

**Message Format Example:**

```text
[complete] my-project
I've successfully implemented the authentication system with JWT tokens and refresh token rotation. The API endpoints are secured and tests are passing. (elapsed: 2m 18s)
```

## Usage

EveryNotify is a "fire-and-forget" plugin. Once you have [registered it with opencode](#using-with-opencode) and [configured](#configuration) at least one service with `"enabled": true`, it runs automatically. opencode loads the plugin at startup; EveryNotify then listens for events and sends notifications in the background with no further action needed.

When an event is triggered, EveryNotify builds a rich message containing the event type, project name, the actual assistant response, and the total elapsed time.

Example:
`[complete] my-project: I've finished the refactor. (elapsed: 12m 30s)`

Notifications are dispatched to all services marked as `"enabled": true`.

## Supported Services

| Service      | Requirements        | Recommended For                 | Setup Link                                                                |
| ------------ | ------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| **Pushover** | App Token, User Key | High-priority mobile alerts     | [Pushover API](https://pushover.net/api)                                  |
| **Telegram** | Bot Token, Chat ID  | Instant messaging & groups      | [Telegram Bots](https://core.telegram.org/bots)                           |
| **Slack**    | Webhook URL         | Team collaboration & logging    | [Slack Webhooks](https://api.slack.com/messaging/webhooks)                |
| **Discord**  | Webhook URL         | Community & server-based alerts | [Discord Webhooks](https://discord.com/developers/docs/resources/webhook) |

## Event Types

The plugin monitors several key lifecycle hooks within opencode:

- **`complete`**: Dispatched when a task is finished and the session becomes idle. Also triggers when a subagent completes its assigned task.
- **`error`**: Dispatched if the session crashes or encounters a fatal execution error. Includes the error message in the notification.
- **`permission`**: Dispatched when opencode pauses to ask for tool execution permissions or file access.
- **`question`**: Dispatched when opencode uses the `question` tool to seek clarification from the user.

## Advanced Features

### Priority Management (Pushover)

For Pushover users, you can customize the `priority` level:

- `-2`: Lowest priority (no notification)
- `-1`: Quiet notification
- `0`: Normal priority (default)
- `1`: High priority (bypasses quiet hours)
- `2`: Emergency priority (requires acknowledgment)

### Session Enrichment

EveryNotify automatically calculates the time elapsed since the first user message in a session. This duration is included in the notification text to give you context on how long the task took to complete.

### Project Overrides

If you are working on a sensitive or client-specific project, you can place a `.everynotify.json` file in the project's `.opencode/` directory to send notifications to a specific Slack channel or Telegram group, bypassing your global configuration.

## Development

Developers looking to extend EveryNotify or add new service providers should consult [AGENTS.md](./AGENTS.md).

### Build & Test Workflow

The project uses [Bun](https://bun.sh) for lightning-fast development:

- **Install Dependencies**: `bun install`
- **Build Plugin**: `bun run build`
- **Run Tests**: `bun test`
- **Type Check**: `bun run typecheck`

## Contributing

We welcome contributions of all kinds!

1. **Bug Reports**: Open an issue describing the bug and your environment.
2. **Feature Requests**: Propose new services or event hooks via issues.
3. **Pull Requests**: Follow the existing code style (2-space indent, strict TypeScript) and ensure all tests pass.

## License

Distributed under the **MIT License**. See `LICENSE` for more information.

## Credits

Created by **[Sillybit](https://sillybit.io)** — Pixel Perfect Innovation.

Built with ❤️ for the opencode community.
