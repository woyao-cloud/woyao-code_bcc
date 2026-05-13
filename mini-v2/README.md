# Claude Code Mini v2

Minimal Claude Code CLI with multi-provider support.

## What is new in v2

- **OpenAI-compatible provider** - Use OpenAI, Ollama, DeepSeek, vLLM, or any OpenAI Chat Completions endpoint
- **WebFetch + WebSearch tools** - Fetch web pages and search the internet
- **Auto provider detection** - Set ANTHROPIC_API_KEY or OPENAI_API_KEY, the right provider is chosen automatically

## Quick Start

### Anthropic (default)

```bash
$env:c
echo "explain this code" | bun run src/entrypoints/cli.ts
```

### OpenAI / Ollama / DeepSeek

```bash
# OpenAI
$env:OPENAI_API_KEY = "sk-..."
echo "explain this code" | bun run src/entrypoints/cli.ts

# Ollama (local)
$env:OPENAI_BASE_URL = "http://localhost:11434/v1"
$env:OPENAI_API_KEY = "ollama"
$env:OPENAI_MODEL = "deepseek-v4-pro:cloud"
$env:CLAUDE_CODE_USE_OPENAI = "1"
echo "write a hello world" | bun run src/entrypoints/cli.ts

# DeepSeek
$env:OPENAI_BASE_URL = "https://api.deepseek.com/v1"
$env:OPENAI_API_KEY = "sk-..."
$env:OPENAI_MODEL = "deepseek-chat"
$env:CLAUDE_CODE_USE_OPENAI = "1"
echo "explain this code" | bun run src/entrypoints/cli.ts
```

## Commands

```bash
bun run dev        # Run in dev mode
bun run build      # Build to dist/
bun run typecheck  # TypeScript check
```

## Tools (8 core tools)

| Tool | Description |
|------|-------------|
| Bash | Execute shell commands |
| Read | Read file contents |
| Write | Write/create files |
| Edit | Edit files with find-and-replace |
| Grep | Search files with regex |
| Glob | Find files by pattern |
| WebFetch | Fetch web page content |
| WebSearch | Search the web (DuckDuckGo) |

## Model Aliases

```bash
$env:ANTHROPIC_MODEL = "sonnet"   # claude-sonnet-4
$env:ANTHROPIC_MODEL = "opus"     # claude-opus-4
$env:ANTHROPIC_MODEL = "haiku"    # claude-3-5-haiku
```

## Provider Selection

Priority: `CLAUDE_CODE_USE_OPENAI=1` > `OPENAI_API_KEY` (without ANTHROPIC_API_KEY) > default Anthropic

## Design

- Headless/pipe mode only
- Zero feature flags
- Zero telemetry
- Zero external dependencies beyond Anthropic SDK

 - OpenAI 兼容层 — 3 个文件，纯 fetch 实现，零额外依赖
      - client.ts — SSE 流式调用 OpenAI Chat Completions API
      - streamAdapter.ts — OpenAI SSE → Anthropic 流事件转换
      - modelMap.ts — 模型名双向映射
  - Provider 自动检测 — CLAUDE_CODE_USE_OPENAI=1 > 仅设 OPENAI_API_KEY > 默认 Anthropic
  - WebFetch — HTML→Markdown 转换，支持所有 http/https URL
  - WebSearch — DuckDuckGo 搜索（无需 API key）
  - auth.ts — 同时支持两种 key，按 provider 自动选择

  用法示例：

  # Ollama 本地模型
powershell
  $env:OPENAI_BASE_URL = "http://localhost:11434/v1"
  $env:OPENAI_API_KEY = "ollama"
  $env:OPENAI_MODEL = "llama3.2"
  $env:CLAUDE_CODE_USE_OPENAI = "1"

cmd
  set OPENAI_BASE_URL=http://localhost:11434/v1
set OPENAI_API_KEY=ollama
set OPENAI_MODEL=deepseek-v4-pro:cloud
set CLAUDE_CODE_USE_OPENAI=1
  echo "write hello world" | bun run mini-v2/src/entrypoints/cli.ts
## License

MIT
