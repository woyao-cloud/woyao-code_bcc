# mini-v8 vs 当前项目 src 对比分析报告

> 生成日期: 2026-05-14

---

## 一、总量对比

| 指标 | mini-v8 | 当前项目 | 差距 |
|------|---------|----------|------|
| src 文件总数 | 123 | 2306 | **18.7倍** |
| src 目录数 | 14 | 39 | +25 目录 |
| 工具数 | 19 | 59 | -40 个工具 |
| API Provider | 2 | 7 | -5 个 Provider |

---

## 二、目录级差距

### 2.1 mini-v8 完全缺失的目录（25个）

当前项目有而 mini-v8 完全缺失的目录：
ssistant, ridge, uddy, cli, components, coordinator,
daemon, environment-runner, hooks, jobs, keybindings,
memdir, migrations, moreright, 
ative-ts, outputStyles,
proactive, 
emote, schemas, screens, self-hosted-runner,
server, skills, ssh, upstreamproxy, im, oice

### 2.2 共享目录细节差距

#### commands/
| mini-v8 | 当前项目 | 差距 |
|---------|---------|------|
| 5 文件 (4 cmd + 1 test) | 387 文件 (120+命令目录) | **缺失382文件，100+ CLI命令** |

mini-v8 缺失的关键命令：
/doctor, /init, /login, /logout, /config, /compact,
/diff, /review, /security-review, /model, /add-dir,
/context, /cost, /export, /ide, /hooks, /resume,
/sandbox-toggle, /statusline, /schedule, /fork, /share 等80+

#### constants/
| mini-v8 | 当前项目 | 差距 |
|---------|---------|------|
| 4 文件 | 25 文件 | 缺失21个常量定义文件 |

#### context/
| mini-v8 | 当前项目 | 差距 |
|---------|---------|------|
| 1 文件 (context.ts) | 9 文件 | 上下文构建功能弱9倍 |

#### entrypoints/
| mini-v8 | 当前项目 | 差距 |
|---------|---------|------|
| 1 文件 (cli.ts) | 17 文件 | 缺失多个入口点 |

#### plugins/
| mini-v8 | 当前项目 | 差距 |
|---------|---------|------|
| 7 文件 (自建插件系统) | 3 文件 | mini-v8自建插件系统，当前用框架 |

### 2.3 services/ 重点对比

#### API 层
| Provider | mini-v8 | 当前项目 |
|----------|:------:|:------:|
| Anthropic (firstParty) | ✅ | ✅ |
| OpenAI | ✅ | ✅ |
| Gemini | ❌ | ✅ |
| Grok (xAI) | ❌ | ✅ |

#### compact/
| mini-v8 | 当前项目 |
|---------|---------|
| 1 文件 (autoCompact.ts) | 21 文件 |

mini-v8 压缩逻辑极简：仅 token 阈值检测 + 消息裁剪

#### mcp/
| mini-v8 | 当前项目 |
|---------|---------|
| 1 文件 (mcpClient.ts) | 31 文件 |

mini-v8 MCP 极简：仅 connect/disconnect + tool wrapper

#### memory/ 系统
| 功能 | mini-v8 | 当前项目 |
|------|:------:|:------:|
| 会话记忆 | ✅ (规则匹配) | ✅ (SessionMemory/ 8文件，含LLM提取) |
| 记忆存储 | ✅ (memoryStore.ts) | ✅ (多存储) |
| 记忆存储客户端 | ✅ (memoryStoresClient.ts) | ✅ |
| 团队记忆同步 | ✅ (teamMemorySync.ts) | ✅ (teamMemorySync/ 5文件) |
| LLM提取记忆 | ❌ | ✅ (extractMemories/) |
| 秘密扫描 | ❌ | ✅ (secretScanner.ts) |
| 记忆观察器 | ❌ | ✅ (watcher.ts) |

#### 完全缺失的服务模块（18+个）
cp, AgentSummary, uth, utoDream, contextCollapse,
extractMemories, langfuse, localVault, lsp, MagicDocs,
oauth, policyLimits, providerRegistry, providerUsage,
PromptSuggestion, 
emoteManagedSettings, searchExtraTools,
sessionTranscript, settingsSync, skillLearning, skillSearch,
	ips, 	ools(流式执行器/编排器), 	oolUseSummary

#### state/
| mini-v8 | 当前项目 |
|---------|---------|
| 0 | 7 文件 (AppState, store, selectors) |

**mini-v8 无 Zustand 风格状态管理**

#### 	ypes/
| mini-v8 | 当前项目 |
|---------|---------|
| 5 文件 | 25 文件 |

缺失关键类型：command, tool permission, JSON schema 等 20+

#### utils/
| mini-v8 | 当前项目 | 比例 |
|---------|---------|:---:|
| 29 文件 | 770 文件 | **3.8%** |

缺失 util 类别（50+）：
utonomy, console, context, cost, diff, editor,
env, ile, ormat, generators, ignore, image,
markdown, memory, mcp, model, package, patch,
permission, pipe, semver, 	extHighlighting,
	elemetry, 	eleport, ultraplan, endor 等

---

## 三、功能维度差距

### 3.1 UI / 交互层

| 能力 | mini-v8 | 当前项目 |
|------|:------:|:------:|
| 终端渲染 | readline + console | 完整 Ink/React 框架 |
| UI 组件 | ❌ | 149 个 React 组件 |
| 主题系统 | ❌ | ThemeProvider |
| 快捷键管理 | ❌ | keybindings 系统 |
| Fuzzy Picker | ❌ | ✅ |
| 进度条 / Dialog | ❌ | ✅ |
| 文本截断/高亮/滚动 | ❌ | ✅ |

### 3.2 API Provider 支持

| Provider | mini-v8 | 当前项目 |
|----------|:------:|:------:|
| Anthropic (firstParty) | ✅ | ✅ |
| OpenAI 兼容 (Ollama/DeepSeek/vLLM) | ✅ | ✅ |
| Google Gemini | ❌ | ✅ |
| xAI Grok | ❌ | ✅ |
| AWS Bedrock | ❌ | ✅ |
| GCP Vertex | ❌ | ✅ |
| Foundry | ❌ | ✅ |

### 3.3 Agent 系统对比

| 功能 | mini-v8 | 当前项目 |
|------|:------:|:------:|
| Agent 定义与注册 | ✅ (agentRegistry.ts) | ✅ (packages 中) |
| 内置 Agent | 6 个 | 多个 |
| Agent 执行器 | ✅ (agentRunner.ts, 同步循环) | ✅ (StreamingToolExecutor) |
| Team 管理 | ✅ (teamManager.ts) | ✅ |
| Swarm 协调 | ✅ (coordinator agent) | ✅ (coordinator 目录) |
| UI 展示 | ❌ 纯文本 | ✅ (AgentsMenu 组件) |
| Plan 可视化 | ❌ | ✅ (PlanView 组件) |
| ACP 协议 | ❌ | ✅ (acp/ 目录) |
| Agent 摘要 | ❌ | ✅ (AgentSummary) |

### 3.4 记忆系统对比

| 功能 | mini-v8 | 当前项目 |
|------|:------:|:------:|
| 会话记忆 | ✅ (规则匹配) | ✅ (含 LLM 提取) |
| 记忆存储 | ✅ | ✅ (多存储) |
| 团队记忆同步 | ✅ | ✅ |
| LLM 提取记忆 | ❌ | ✅ |
| 秘密扫描 | ❌ | ✅ |
| 记忆观察器 | ❌ | ✅ |

### 3.5 MCP 支持对比

| 功能 | mini-v8 | 当前项目 |
|------|:------:|:------:|
| 基本连接/断开 | ✅ | ✅ |
| MCP Tool 包装 | ✅ | ✅ |
| MCP OAuth | ❌ | ✅ (简化版) |
| MCP 资源读写 | ❌ | ✅ |
| MCP Auth 工具 | ❌ | ✅ |

### 3.6 其他关键功能差距

| 功能 | mini-v8 | 当前项目 |
|------|:------:|:------:|
| Remote Control / Bridge | ❌ | ✅ |
| Daemon 后台模式 | ❌ | ✅ |
| 后台会话 (BG Sessions) | ❌ | ✅ |
| SSH 远程连接 | ❌ | ✅ |
| 语音输入 (Voice Mode) | ❌ | ✅ |
| LSP 集成 | ❌ | ✅ |
| 任务调度 (Cron) | ❌ | ✅ |
| IDE 工作树 | ❌ | ✅ |
| Pipe 传输 | ❌ | ✅ |
| 代码审查自动化 (autofix-pr) | ❌ | ✅ |
| OAuth 认证 | ❌ | ✅ |
| 遥测/可观测性 (Langfuse/Perfetto) | ❌ | ✅ |
| 上下文折叠 (contextCollapse) | ❌ | ✅ |
| 主动建议 (proactive) | ❌ | ✅ |
| 自定义主题 (/theme) | ❌ | ✅ |
| 穷鬼模式 (/poor) | ❌ | ✅ |
| Feature Flags | ❌ | ✅ (19 flags) |
| RCS (自托管服务器) | ❌ | ✅ |
| Web UI (RCS 控制面板) | ❌ | ✅ |

---

## 四、架构层面差距

### 4.1 项目结构
- **mini-v8**: 单项目，扁平 src/ 结构
- **当前项目**: Bun Workspaces monorepo，15 个 packages

### 4.2 工具系统
- **mini-v8**: 工具内联在 src/tools/builtin/，简单函数式实现
- **当前项目**: 工具在独立 packages/builtin-tools 包，含 shared 工具、permission hooks、流式执行编排器

### 4.3 构建系统
- **mini-v8**: un build src/entrypoints/cli.ts --outdir=dist
- **当前项目**: 复杂 uild.ts + Vite 备选，code splitting，19 个 feature flag define 注入，post-build 处理

### 4.4 类型系统
- **mini-v8**: 基础 TypeScript 类型，5 个类型文件
- **当前项目**: 25 个类型文件，strict mode，泛型、union type guard、Zod schema，@types/bun 深度集成

### 4.5 测试体系
- **mini-v8**: 23 测试文件集中在 src/__tests__/，298 pass / 1 fail
- **当前项目**: 测试就近分布在各模块 __tests__/，含集成测试 (	ests/integration/)、共享 mock 体系

---

## 五、总结

### mini-v8 定位

精简的概念验证 / 教学模型：
- ✅ 完整实现 Multi-Agent 协调核心 (Registry, Runner, Team, Swarm)
- ✅ 完整实现记忆系统 (Session/Memory Store/Team Sync)
- ✅ 基本工具集 (19 个核心 tool)
- ✅ Anthropic + OpenAI API
- ✅ TypeScript strict mode 通过

### 本质差距量化

| 维度 | 差距 | 说明 |
|------|:----:|------|
| 代码量 | **18.7x** | 123 vs 2306 文件 |
| UI 能力 | **∞** | 纯文本 vs 完整 Ink/React |
| API Provider | **3.5x** | 2 vs 7 |
| 工具数量 | **3.1x** | 19 vs 59 |
| 服务文件数 | **14x** | 20 vs 282 |
| 命令数量 | **25x** | 4 vs 100+ |
| utils 文件数 | **26x** | 29 vs 770 |
| 项目架构 | **monorepo vs single** | 15 packages vs 单项目 |

### 核心结论

**mini-v8 是当前项目的 ~5% 精简实现。**

Multi-Agent 协调和记忆系统思路一致但实现简化很多。
主要差距集中于：
1. **UI 层** — 完全缺失 (Ink/React 框架 + 149 组件)
2. **多 Provider** — 仅支持 2 个 (Anthropic + OpenAI)
3. **工具生态** — 仅 19 个基础 tool (缺 40 个)
4. **企业功能** — 无 Remote Control, Daemon, ACP, 调度, 语音等
