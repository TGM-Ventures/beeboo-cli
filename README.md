# 🐝 BeeBoo CLI

**Be the CEO of your agent organization.**

BeeBoo gives you executive control over your AI agents — knowledge, approvals, and requests, all from the command line.

## Quick Start

```bash
# Authenticate
npx beeboo auth

# Run natural language commands
npx beeboo run "store our refund policy: full refund within 30 days"
npx beeboo run "what's our escalation protocol?"
npx beeboo run "request approval for $5000 vendor payment"
npx beeboo run "show me all pending approvals"
```

## Installation

### npx (recommended — zero install)

```bash
npx beeboo <command>
```

### Global install

```bash
npm install -g beeboo
beeboo <command>
```

## Commands

### Authentication

```bash
npx beeboo auth                    # Interactive auth
npx beeboo auth --api-key bb_sk_...  # Non-interactive
npx beeboo auth status             # Check auth status
npx beeboo auth logout             # Remove credentials
```

### Natural Language `run`

The `run` command understands natural language and routes to the right action:

```bash
# Knowledge
npx beeboo run "store our refund policy: full refund within 30 days"
npx beeboo run "what's our escalation protocol?"
npx beeboo run "find the onboarding docs"

# Approvals
npx beeboo run "request approval for $5000 vendor payment"
npx beeboo run "show me all pending approvals"
npx beeboo run "approve abc123"

# Requests
npx beeboo run "create a request to schedule HVAC inspection"
npx beeboo run "show all open requests"

# Status
npx beeboo run "status"
```

### Power-User Commands

```bash
# Knowledge management
npx beeboo knowledge list [--json]
npx beeboo knowledge add --title "Title" --content "Content"
npx beeboo knowledge search "query"
npx beeboo knowledge get <id>
npx beeboo knowledge delete <id>

# Approvals
npx beeboo approvals list [--status pending] [--json]
npx beeboo approvals request --title "Title" [--amount 5000]
npx beeboo approvals approve <id> [--reason "..."]
npx beeboo approvals deny <id> [--reason "..."]

# Requests
npx beeboo requests list [--json]
npx beeboo requests create --title "Title" [--priority high]
npx beeboo requests complete <id>

# Status & config
npx beeboo status [--json]
npx beeboo config list
npx beeboo config set <key> <value>
npx beeboo version
```

## Output Formats

```bash
# Pretty text (default)
npx beeboo knowledge list

# JSON output
npx beeboo knowledge list --json

# Disable colors
NO_COLOR=1 npx beeboo knowledge list
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BEEBOO_API_KEY` | API key (overrides saved credentials) |
| `BEEBOO_API_URL` | Custom API URL |
| `NO_COLOR` | Disable colored output |
| `DEBUG` | Show stack traces on errors |

## Configuration

Credentials and config are stored in `~/.beeboo/`:

```
~/.beeboo/
  credentials.json    # API key and org info
  config.json         # CLI preferences
```

## Zero Dependencies

BeeBoo CLI uses only Node.js built-in modules (`https`, `fs`, `path`, `os`, `readline`, `crypto`). This means:

- **Instant npx execution** — no dependency installation
- **Tiny package size** — just the code you need
- **No supply chain risk** — zero third-party dependencies

## Publishing to npm

```bash
# Test the package
npm pack --dry-run

# Publish
npm login
npm publish
```

## Requirements

- Node.js 18 or later

## Links

- **Website:** https://beeboo.ai
- **Docs:** https://docs.beeboo.ai
- **GitHub:** https://github.com/beeboo-ai/beeboo
- **Discord:** https://discord.gg/beeboo

## License

MIT — [TGM Ventures](https://tgmventures.com)
