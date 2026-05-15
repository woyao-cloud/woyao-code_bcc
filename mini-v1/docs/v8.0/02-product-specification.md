# Claude Code Mini v8 - 产品说明书

> 版本: 8.0.0 | 日期: 2026-05-14

---

## 1. 产品简介

Claude Code Mini v8 是一个基于命令行的 AI 编程助手工具，可帮助开发者进行代码搜索、文件编辑、任务执行和复杂的多 Agent 协调工作。

### 核心定位

轻量级终端 AI 编程伙伴，聚焦核心编码场景，提供三大能力：
- **Agent 协调**: 多 Agent 并行执行、团队协作、Swarm 模式
- **记忆管理**: 会话记忆自动提取、本地存储、云端同步
- **插件扩展**: Plugin/Skill 生态、Marketplace 发现

---

## 2. 安装与配置

### 环境要求
- Bun >= 1.3.0
- Node.js (可选，用于构建产物运行)

### 安装

```bash
cd mini-v8
bun install
```

### 配置 API Key

**Anthropic API (默认):**
```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

**OpenAI 兼容 API:**
```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://api.openai.com/v1"
export OPENAI_MODEL="gpt-4o"
```

支持任意 OpenAI Chat Completions 协议端点 (Ollama, DeepSeek, vLLM 等)。

### MCP 配置

在 `~/.claude-code-mini/mcp.json` 配置 MCP 服务器:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-filesystem", "/tmp"]
    }
  }
}
```

---

## 3. 运行方式

```bash
# 交互式 REPL
bun run dev

# Pipe 模式
cat prompt.txt | bun run src/entrypoints/cli.ts

# 参数模式
bun run src/entrypoints/cli.ts "explain this codebase"

# 构建后运行
bun run build
bun dist/cli.js
```

---

## 4. 工具列表 (19个)

### 文件操作
| 工具 | 说明 |
|------|------|
| **Read** | 读取文件内容，支持 offset/limit |
| **Write** | 创建或覆写文件 |
| **Edit** | 精准编辑 (search/replace) |
| **ApplyPatch** | 应用 unified diff patch |

### 搜索工具
| 工具 | 说明 |
|------|------|
| **Glob** | 文件模式匹配 (e.g. src/**/*.ts) |
| **Grep** | 正则搜索文件内容 |

### 执行工具
| 工具 | 说明 |
|------|------|
| **Bash** | 执行 Shell 命令 (120s timeout) |

### 网络工具
| 工具 | 说明 |
|------|------|
| **WebFetch** | 抓取网页内容 |
| **WebSearch** | 搜索互联网 |

### 任务管理
| 工具 | 说明 |
|------|------|
| **TaskCreate** | 创建子任务 |
| **TaskList** | 列出所有子任务 |
| **TaskUpdate** | 更新任务状态 |

### Agent / 协调
| 工具 | 说明 |
|------|------|
| **Agent** | 生成子 Agent 处理复杂任务 |
| **Skill** | 调用已安装的 Skill |
| **EnterPlanMode** | 进入规划模式 |
| **ExitPlanMode** | 退出规划并提交计划 |
| **TeamCreate** | 创建多 Agent 团队 |
| **TeamDelete** | 解散团队 |

### MCP
| 工具 | 说明 |
|------|------|
| **MCP** | 动态注册的 MCP 工具 |

---

## 5. REPL 命令速查

### Agent 管理
```
/agent list | info <type> | run <type> <task>
/agent create <name> | delete <name> | stop <id>
/team create <name> | delete <name> | list | members <name>
/swarm start | stop | status
```

### 记忆管理
```
/memory add <text> | list | search <q> | delete <id>
/memory categories | tags | export | import
/session-memory config | status
/memory-stores list | create <n> | archive <id>
/team-memory pull | push | sync
```

### 插件/Skill
```
/plugin list | install <s> | uninstall <id> | enable <id> | disable <id>
/skill list | search <q> | install <id> | uninstall <n>
```

---

## 6. 内置 Agent (6个)

| Agent | 类型 | 工具权限 | 用途 |
|-------|------|:------:|------|
| **Explore** | read-only | 读+搜索 | 快速代码库搜索 |
| **Plan** | read-only | 读+搜索 | 任务规划分解 |
| **general-purpose** | full | 全部 | 研究+实现任务 |
| **Verify** | read-only | 读+搜索 | 代码审查验证 |
| **coordinator** | full | 全部 | 团队协调委派 |
| **worker** | full | 全部 | 执行协调器任务 |

---

## 7. 权限模式

| 模式 | Bash | Write/Edit | WebFetch | Read/Search |
|------|:----:|:----------:|:--------:|:-----------:|
| default | 审批 | 审批 | 审批 | 允许 |
| acceptEdits | 审批 | 允许 | 审批 | 允许 |
| bypassPermissions | 允许 | 允许 | 允许 | 允许 |

---

## 8. 配置路径

```
~/.claude-code-mini/
  config.json           # 应用配置
  mcp.json             # MCP 服务器
  memories-v2.json     # 本地记忆
  session-memory/      # 会话记忆
  team-memory/         # 团队记忆
  plugins/             # 插件
  marketplaces/        # 市场缓存
  skills/              # 已安装Skill
  teams/               # 团队数据
```

---

## 9. 测试

```bash
bun test              # 运行全部测试 (298 pass)
bun run typecheck     # 类型检查 (零错误)
```