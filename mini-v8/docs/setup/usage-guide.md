# mini-v8 使用向导

## 概述

mini-v8 是一个轻量级 AI 编码助手 CLI，基于 Anthropic Claude API 构建。它支持多 API 提供商（Anthropic、OpenAI 兼容、Gemini），提供 REPL 交互和管道模式，内置文件操作、Shell 执行、Web 搜索、Agent 协调等工具。

---

## 一、环境准备

### 1.1 安装 Bun

mini-v8 使用 Bun 运行时（非 Node.js），需先安装 Bun：

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# 验证安装
bun --version
```

要求 Bun >= 1.3.0。

### 1.2 获取 API 密钥

至少设置一个 API 提供商：

#### Anthropic（默认）

```bash
export ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
```

#### OpenAI 兼容

```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-xxxxxxxxxxxx
export OPENAI_BASE_URL=https://api.openai.com/v1  # 可自定义
export OPENAI_MODEL=gpt-4o                          # 可选
```

支持 Ollama / DeepSeek / vLLM 等任意 OpenAI 兼容端点。

#### Gemini

```bash
export CLAUDE_CODE_USE_GEMINI=1
export GEMINI_API_KEY=xxxxxxxxxxxx
export GEMINI_MODEL=gemini-2.0-flash                # 可选
```

### 1.3 克隆项目并安装依赖

```bash
git clone <repo-url>
cd mini-v8
bun install
```

---

## 二、快速开始

### 2.1 运行 CLI

```bash
# 开发模式（默认启用全部功能）
bun run dev

# 构建后运行
bun run build
bun dist/cli.js
```

### 2.2 REPL 交互模式

启动后进入交互式命令行，显示提示符 `>`：

```
Claude Code Mini v8.0.0 | claude-sonnet-4-20250514 | 45 tools | 2 plugins | 12 skills | 8 agents
Type /help, Ctrl+C cancel, Ctrl+D exit

>
```

支持的操作：

| 操作 | 说明 |
|------|------|
| 直接输入文本 | 向 AI 提问或发出指令 |
| `/help` | 查看帮助 |
| `/commands` | 查看所有可用命令 |
| `Ctrl+C` | 取消当前操作 |
| `Ctrl+D` | 退出 CLI |

### 2.3 管道模式（Pipe）

支持非交互式的一次性处理：

```bash
# 通过参数传递
bun run dev "解释一下什么是闭包"

# 通过 stdin 管道
echo "列出当前目录的文件" | bun run dev -p
echo "分析这段代码的复杂度" | bun run dev
```

管道模式下自动执行后退出，不会进入 REPL。

### 2.4 指定模型

通过环境变量指定模型：

```bash
# 使用 DeepSeek
export ANTHROPIC_MODEL=deepseek-v4-flash

# 使用 Claude Opus 4
export ANTHROPIC_MODEL=claude-opus-4-20250514

# 运行
bun run dev
```

---

## 三、配置说明

### 3.1 环境变量完整清单

#### API 认证

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | - |
| `ANTHROPIC_AUTH_TOKEN` | 替代 API 密钥（次优先） | - |
| `CLAUDE_API_KEY` | 第三优先级 API 密钥 | - |
| `OPENAI_API_KEY` | OpenAI 兼容 API 密钥 | - |
| `GEMINI_API_KEY` | Gemini API 密钥 | - |

#### 模型选择

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_MODEL` | 指定模型 | `claude-sonnet-4-20250514` |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet 类模型映射 | - |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Opus 类模型映射 | - |
| `OPENAI_MODEL` | OpenAI 模型名 | - |
| `GEMINI_MODEL` | Gemini 模型名 | - |

#### 提供商切换

| 变量 | 说明 |
|------|------|
| `CLAUDE_CODE_USE_OPENAI=1` | 启用 OpenAI 兼容模式 |
| `CLAUDE_CODE_USE_GEMINI=1` | 启用 Gemini 模式 |

提供商优先级：`ANTHROPIC_BASE_URL` 已设置 > `CLAUDE_CODE_USE_GEMINI` > `CLAUDE_CODE_USE_OPENAI` > 自动检测 > 默认 firstParty。

#### 调试

| 变量 | 说明 |
|------|------|
| `DEBUG=1` | 开启调试日志 |
| `CLAUDE_CODE_DEBUG=1` | 开启 Claude Code 调试 |
| `VERBOSE=1` | 开启详细日志 |
| `CLAUDE_CODE_VERBOSE=1` | 详细调试模式 |
| `NO_COLOR=1` | 禁用颜色输出 |
| `CLAUDE_CODE_DISABLE_AUTO_CACHE=1` | 禁用自动缓存 |

#### 其他

| 变量 | 说明 |
|------|------|
| `CWD` | 强制指定工作目录 |
| `HOME` | 用户主目录（用于定位配置） |
| `BUN_INSPECT=9229` | 启用 Bun 调试端口 |

### 3.2 配置文件

#### 全局配置 `~/.claude-code-mini/config.json`

```json
{
  "sessionMemoryCompactEnabled": true,
  "minTokensForInit": 2000,
  "minTokensBetweenUpdate": 1000,
  "maxNotes": 30
}
```

#### 设置文件 `~/.claude/settings.json`

```json
{
  "permissionMode": "default",
  "theme": "dark",
  "alwaysThinkingEnabled": true
}
```

项目级设置：项目根目录下 `.claude/settings.json`，覆盖全局设置。

#### CLAUDE.md 项目指令

项目根目录的 `CLAUDE.md` 文件会被自动读取，作为 AI 的系统提示注入，用于告知 AI 项目的约定和规范。

### 3.3 模型别名与可用模型

| 模型 ID | 上下文窗口 | 说明 |
|---------|-----------|------|
| `claude-sonnet-4-20250514` | 128K | 默认模型，最佳编码模型 |
| `claude-opus-4-20250514` | 200K | 深度推理模型 |
| `claude-3-5-sonnet-20241022` | 8,192 | 旧版 Sonnet |
| `claude-3-5-haiku-20241022` | 8,192 | 快速轻量模型 |
| `deepseek-v4-pro` | 128K | DeepSeek Pro |
| `deepseek-v4-flash` | 128K | DeepSeek Flash |
| `qwen-max` | 32K | 通义千问 Max |
| `qwen-plus` | 32K | 通义千问 Plus |

---

## 四、数据存储位置

| 数据类型 | 路径 | 说明 |
|---------|------|------|
| 会话快照 | `~/.claude-code-mini/sessions/{sessionId}.json` | 完整对话历史 |
| 会话记忆 | `~/.claude-code-mini/session-memory/{sessionId}.md` | 提取的结构化笔记 |
| 全局配置 | `~/.claude-code-mini/config.json` | 用户配置 |
| 全局设置 | `~/.claude/settings.json` | 用户设置 |
| 项目设置 | `.claude/settings.json` | 项目级设置 |
| 项目指令 | `CLAUDE.md` | 项目级 AI 指令 |

---

## 五、高级用法

### 5.1 会话恢复

使用 `--resume` 参数恢复上次会话：

```bash
# 恢复最新会话
bun run dev --resume

# 恢复指定会话
bun run dev --resume=<session-id>
```

恢复后自动加载：
- 完整对话历史
- 压缩边界状态
- 会话记忆笔记
- 工具结果预算状态

### 5.2 记忆管理系统

mini-v8 采用七层记忆架构：

1. **会话记忆** — 自动从对话中提取结构化笔记（用户请求、决策记录、文件路径引用）
2. **上下文构建** — 系统上下文（Git 状态、CLAUDE.md）和用户上下文（日期、项目文件）
3. **对话历史** — 完整的消息列表管理
4. **多级压缩** — 从轻到重的逐层压缩策略：
   - 微压缩：清除旧工具输出
   - 工具预算：用预览替换大结果
   - SM 压缩：用会话记忆替代摘要（零 API 成本）
   - 语义压缩：生成结构化摘要
   - Snip 裁剪：直接移除旧消息（需 `/force-snip` 手动触发）
5. **API 投影** — 发送前的消息裁剪和清理
6. **会话存储** — JSON 快照持久化到磁盘
7. **长期记忆** — 跨会话上下文延续（CLAUDE.md + 会话记忆）

### 5.3 工具系统

内置工具按功能分类：

**文件操作**：文件读写、编辑、搜索、Glob 匹配
**Shell 执行**：Bash/PowerShell 命令执行
**Web 访问**：网页抓取、Web 搜索
**Agent 系统**：Agent 创建、任务管理（创建/更新/列表/获取）
**规划**：计划模式、验证执行
**调度**：Cron 任务创建/删除/列表
**MCP**：MCP 服务器连接、工具注册

### 5.4 技能系统

支持通过技能（Skills）扩展功能：

```bash
# 查看可用技能
> /skills

# 调用技能
> /skill-name [args]
```

技能发现自配置文件中的技能目录。

### 5.5 插件系统

支持插件化扩展，插件存放在 `~/.claude/plugins/` 或项目 `plugins/` 目录：

```bash
# 查看插件状态
> /plugins

# 启用/禁用插件
> /plugin enable <name>
> /plugin disable <name>
```

### 5.6 Agent 协调

支持多 Agent 协调工作：

```bash
# 创建团队（多个 Agent 协同）
> /team create <name>

# 查看注册的 Agent
> /agents
```

Agent 类型：
- **内置 Agent**：planner、architect、code-reviewer、debugger 等
- **用户 Agent**：自定义配置的 Agent
- **插件 Agent**：由插件提供的 Agent

### 5.7 命令参考

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助 |
| `/clear` | 清屏 |
| `/exit` | 退出 |
| `/force-snip` | 手动触发消息裁剪 |
| `/skills` | 列出可用技能 |
| `/plugins` | 管理插件 |
| `/agents` | 列出所有 Agent |
| `/team create <name>` | 创建 Agent 团队 |
| `/model` | 显示当前模型 |
| `/config` | 查看/修改配置 |

---

## 六、故障排查

### 6.1 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `ANTHROPIC_API_KEY not set` | 未设置 API 密钥 | 设置对应提供商的环境变量 |
| `prompt_too_long` | 对话太长 | 自动触发反应式压缩，无需手动操作 |
| `Connection refused` | API 不可达 | 检查网络和 API 端点 URL |
| `401 Unauthorized` | API 密钥无效 | 验证密钥是否正确 |

### 6.2 调试环境变量

```bash
# 启用调试输出
export DEBUG=1
bun run dev

# 查看详细错误
export CLAUDE_CODE_VERBOSE=1
bun run dev
```

### 6.3 重置状态

```bash
# 清除所有会话数据
rm -rf ~/.claude-code-mini/sessions/
rm -rf ~/.claude-code-mini/session-memory/

# 重置配置
rm ~/.claude-code-mini/config.json
```

---

## 七、构建与部署

### 7.1 生产构建

```bash
# 构建（代码分割，输出 dist/cli.js + chunk 文件）
bun run build

# Vite 构建（备选）
bun run build:vite
```

### 7.2 运行构建产物

```bash
# Bun 运行
bun dist/cli.js "你好"

# Node.js 运行（构建产物自动兼容）
node dist/cli.js
```

### 7.3 健康检查

```bash
bun run health
```

---

## 八、开发指南

### 8.1 常用命令

```bash
# 运行所有测试
bun test

# 运行单个测试文件
bun test src/path/to/__tests__/module.test.ts

# 测试覆盖率
bun test --coverage

# 类型检查 + Lint + 测试（提交前必须通过）
bun run precheck

# Lint 检查
bun run lint

# 格式化
bun run format
```

### 8.2 项目结构

```
src/
├── entrypoints/cli.tsx    # CLI 入口
├── main.tsx               # 主程序（Commander.js）
├── query.ts               # API 查询核心
├── QueryEngine.ts          # 查询编排引擎
├── context.ts              # 上下文构建
├── Tool.ts                 # 工具系统
├── tools.ts                # 工具注册
├── services/
│   ├── api/                # API 客户端（Anthropic/OpenAI/Gemini）
│   ├── compact/            # 多级压缩系统
│   ├── memory/             # 会话记忆管理
│   ├── messages/           # 消息处理与 API 投影
│   └── mcp/                # MCP 客户端
├── utils/                  # 工具函数
├── agents/                 # Agent 注册与协调
├── plugins/                # 插件系统
├── commands/               # 命令系统
└── components/             # Ink UI 组件
```

---

## 九、设计理念

mini-v8 的设计遵循以下原则：

1. **轻量** — 最小化依赖，快速启动
2. **可扩展** — 插件、技能、Agent 三级扩展体系
3. **持久化** — 会话自动保存，断线可恢复
4. **成本可控** — 多级压缩减少 API 调用，会话记忆压缩零成本
5. **多提供商** — 支持 Anthropic、OpenAI 兼容、Gemini 三种后端


ANTHROPIC_BASE_URL = http://localhost:11434
ANTHROPIC_MODEL = deepseek-v4-flash:cloud