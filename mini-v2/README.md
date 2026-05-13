# Claude Code Mini

Minimal viable Claude Code CLI 

## Design

- **Headless/pipe mode only** - no Ink UI, no React, single prompt multi-turn tool loop
- **Anthropic firstParty only** - no OpenAI/Gemini/Grok/bedrock/vertex
- **6 core tools** - Bash, FileRead, FileWrite, FileEdit, Grep, Glob
- **Zero feature flags** - no `bun:bundle` dependency, all features hard-enabled
- **Zero telemetry** - no OTel/Sentry/GrowthBook/analytics

## Quick Start

```bash
# Set your API key
$env:ANTHROPIC_API_KEY = "sk-ant-..."

# Pipe mode
echo "say hello" | bun run src/entrypoints/cli.ts

# Argument mode
bun run src/entrypoints/cli.ts "explain this codebase"

# Use short model names
$env:ANTHROPIC_MODEL = "sonnet"  # or "opus", "haiku", "sonnet-3.5"
```

## Commands

```bash
bun run dev        # Run in dev mode
bun run build      # Build to dist/
bun run typecheck  # TypeScript check
```

## Structure

```
src/
  entrypoints/cli.ts    # CLI entry (pipe/args, tool loop)
  services/api/claude.ts # Anthropic API client (streaming + non-streaming)
  tools/builtin/        # 6 core tools (Bash, Read, Write, Edit, Grep, Glob)
  bootstrap/state.ts    # Session-global state
  context.ts            # System context builder
  types/                # Type definitions
  constants/            # Constants (betas, prompts, product)
  utils/                # Auth, config, git, log, model, settings, etc.
```

## License

MIT
