# Claude Code Mini v3

Claude Code CLI with agent task system, patch editing, skills, and memory.

## What is new in v3

- **Agent Task system** - Create, update, and track sub-tasks (TaskCreate, TaskUpdate, TaskList)
- **ApplyPatch tool** - Precise unified diff patch editing
- **Skill system** - Auto-discover and load SKILL.md from `.agents/skills/`
- **Memory system** - Persistent user memories (~/.claude-code-mini/memories.json)
- **Enhanced system prompt** - AGENTS.md conventions, multi-step task guidance

## Quick Start

### Anthropic (default)

```bash
$env:ANTHROPIC_API_KEY = "sk-ant-..."
echo "refactor the auth module" | bun run src/entrypoints/cli.ts
```

### OpenAI / Ollama / DeepSeek

```bash
$env:OPENAI_API_KEY = "sk-..."
$env:CLAUDE_CODE_USE_OPENAI = "1"
echo "explain this code" | bun run src/entrypoints/cli.ts
```

## Commands

```bash
bun run dev        # Run in dev mode
bun run build      # Build to dist/
bun run typecheck  # TypeScript check
bun test           # Run tests
```

## Tools (13 tools)

| Category | Tools |
|----------|-------|
| Core | Bash, Read, Write, Edit, Grep, Glob |
| Web | WebFetch, WebSearch |
| Agent | TaskCreate, TaskUpdate, TaskList |
| Editing | ApplyPatch |
| Meta | Skill |

## Design

- Headless/pipe mode
- Anthropic + OpenAI providers
- Zero feature flags, zero telemetry

## License

MIT
