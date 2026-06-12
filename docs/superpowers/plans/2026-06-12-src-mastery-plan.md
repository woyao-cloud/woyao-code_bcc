# src/ 代码全面掌握 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 1-2 周内达到对 src/ 目录（2,293 文件，~49 万行）的深度维护水平——能随时修改任何模块。

**Architecture:** 四阶段递进——先通过 3 条黄金路径建立全局骨架（Day 1-2），再按优先级逐模块深入（Day 3-5），然后横向补漏分支模块和 packages（Day 6-7），最后实战验证（第二周）。每步使用 CodeGraph trace/explore 做代码智能查询，Bun test 做规格理解。

**Tech Stack:** CodeGraph MCP（代码智能）、Bun test（测试框架）、手写笔记（知识内化）

---

### Task 1: 路径 1 — CLI 启动到 API 调用

**目标:** 理解从 `cli.tsx:main()` 到 `query.ts` 发送 API 请求的完整调用链。

- [ ] **Step 1: 追踪 main → query 调用链**

```
codegraph_trace from="main" to="query"
```

预期：返回从 cli.tsx 入口到 query.ts 中 query 函数的完整调用路径，含每跳的文件:行号和函数体。

- [ ] **Step 2: 批量读取链上关键符号的源码**

```
codegraph_explore query="main cli.tsx REPL App query QueryEngine claude.ts"
```

预期：返回上述符号的源码（按文件分组），覆盖入口→REPL→查询引擎→API 客户端。

- [ ] **Step 3: 阅读入口文件关键段落**

Read `src/entrypoints/cli.tsx` 的 `main()` 函数（前 200 行），理解快速路径分发逻辑。
Read `src/main.tsx` 的 `.action()` handler（搜索 `action(` 定位），理解主 CLI 如何启动 REPL。

- [ ] **Step 4: 阅读 query.ts 核心函数**

```
codegraph_node symbol="query" includeCode=true
```

理解 query 函数的签名、参数结构和返回类型。

- [ ] **Step 5: 手动画调用流程图**

用 ASCII 或纸笔画出：`cli.tsx:main() → main.tsx → REPL → PromptInput → query() → claude.ts → 流式响应`。标注每个节点产生的关键数据（Messages、ToolUseBlock、etc）。

- [ ] **Step 6: 写路径 1 总结笔记**

一句话概括这条链的职责，列出链上每个模块的入口文件和核心函数名。

---

### Task 2: 路径 2 — Tool 完整生命周期

**目标:** 理解一个 tool 从注册到执行到结果回传的全过程。

- [ ] **Step 1: 追踪 tools.ts → Tool.execute 调用链**

```
codegraph_trace from="tools.ts" to="Tool.execute"
```

如果 trace 因动态分发中断，用 `codegraph_context task="tool registration and execution flow"` 补充。

- [ ] **Step 2: 阅读 Tool 接口定义**

```
codegraph_node symbol="Tool" includeCode=true
```

理解 Tool 类型的字段（name, description, inputSchema, execute, etc）。

- [ ] **Step 3: 阅读工具注册逻辑**

Read `src/tools.ts`，关注工具列表组装方式和 `CORE_TOOLS` 白名单常量（`src/constants/tools.ts`）。

- [ ] **Step 4: 阅读一个具体工具实现**

```
codegraph_explore query="FileReadTool FileReadTool.execute builtin-tools"
```

选 FileReadTool 作为代表，理解 inputSchema 定义 → validate → 执行 → 返回 ToolResult 的完整模式。

- [ ] **Step 5: 追踪 tool_use 事件处理**

```
codegraph_context task="tool_use event handling in query loop"
```

理解 query.ts 中收到 `tool_use` 事件后的处理流程：权限检查 → 工具查找 → 执行 → tool_result 构造。

- [ ] **Step 6: 手动画 Tool 生命周期图**

画出：注册 → API 返回 tool_use → 权限弹窗 → findToolByName → execute → ToolResult → 下一轮 API 请求。

- [ ] **Step 7: 写路径 2 总结笔记**

---

### Task 3: 路径 3 — Agent spawn → 执行 → 回收

**目标:** 理解子 agent 的隔离运行和结果回收机制。

- [ ] **Step 1: 追踪 AgentTool → 子 agent 完成**

```
codegraph_trace from="AgentTool" to="TaskCreate"
```

- [ ] **Step 2: 阅读 Agent 系统核心文件**

```
codegraph_explore query="AgentTool TaskCreate TaskUpdate TaskList agentRunner subagent query"
```

- [ ] **Step 3: 理解 Agent 隔离机制**

```
codegraph_context task="agent isolation worktree subagent execution"
```

关注子 agent 如何获得独立的 query loop、工具集、上下文。

- [ ] **Step 4: 理解结果回收**

```
codegraph_context task="agent result collection return to parent"
```

关注子 agent 结果如何序列化、回传给父 agent 的消息流。

- [ ] **Step 5: 手动画 Agent 生命周期图**

画出：AgentTool 触发 → TaskCreate → 子 agent 启动（独立 query loop + 工具集）→ 执行完成 → 结果序列化 → 回传父 agent → 父 agent 继续。

- [ ] **Step 6: 写路径 3 总结笔记**

---

### Task 4: Tier 1 模块 — API 查询引擎（query.ts + QueryEngine.ts）

**目标:** 深入理解核心查询循环的每一轮逻辑。

- [ ] **Step 1: 跑 query.ts 相关测试**

```bash
bun test src/__tests__/query.test.ts 2>&1 | head -100
```

如果该文件不存在，搜索相关测试：
```
Grep pattern="query" glob="*test*" output_mode="files_with_matches" path="src"
```

- [ ] **Step 2: 阅读 query.ts 完整源码**

```
codegraph_node symbol="query" includeCode=true
```

关注：函数签名、消息构造、API 调用、流处理、tool_use 拦截、错误处理。

- [ ] **Step 3: 阅读 QueryEngine.ts**

```
codegraph_node symbol="QueryEngine" includeCode=true
```

关注：它相对 query() 多做了什么——会话管理、压缩、文件历史快照、归属追踪。

- [ ] **Step 4: 理解重试和错误恢复**

```
codegraph_context task="query retry error recovery fallback"
```

- [ ] **Step 5: 写 query.ts + QueryEngine.ts 总结笔记**

---

### Task 5: Tier 1 模块 — Tool 系统（Tool.ts + tools.ts）

**目标:** 理解工具注册、发现、执行、延迟加载的完整机制。

- [ ] **Step 1: 跑 Tool 相关测试**

```bash
bun test src/__tests__/Tool.test.ts 2>&1 | head -100
bun test src/__tests__/toolsRegistry.test.ts 2>&1 | head -100
```

- [ ] **Step 2: 阅读 Tool.ts 完整源码**

```
codegraph_node symbol="Tool" includeCode=true
```

关注：Tool 类型定义、findToolByName、toolMatchesName、ToolResult 类型。

- [ ] **Step 3: 阅读 tools.ts 完整源码**

Read `src/tools.ts`，关注：工具列表组装、条件加载（feature flag + USER_TYPE）、CORE_TOOLS 白名单。

- [ ] **Step 4: 理解延迟工具加载机制**

```
codegraph_context task="deferred tool loading searchExtraTools TF-IDF tool index"
```

关注 `src/services/searchExtraTools/` 和 `CORE_TOOLS` 中的 `SearchExtraToolsTool`、`ExecuteExtraTool`。

- [ ] **Step 5: 浏览 builtin-tools 包结构**

```
codegraph_files path="packages/builtin-tools/src/tools" maxDepth=1
```

了解 60 个工具的目录布局。

- [ ] **Step 6: 写 Tool 系统总结笔记**

---

### Task 6: Tier 1 模块 — API 客户端 + Provider 体系

**目标:** 理解多 provider 架构和流适配器模式。

- [ ] **Step 1: 阅读 claude.ts 核心 API 客户端**

```
codegraph_node symbol="claude.ts" includeCode=true
```

如果 codegraph_node 不支持文件名查询，用：
```
codegraph_explore query="claude.ts BetaRawMessageStreamEvent streamMessages apiRequest"
```

- [ ] **Step 2: 理解 provider 选择逻辑**

Read `src/utils/model/providers.ts`，关注优先级：modelType > 环境变量 > 默认 firstParty。

- [ ] **Step 3: 浏览一个第三方 provider 适配器**

```
codegraph_files path="src/services/api/openai" maxDepth=1
```

Read `src/services/api/openai/client.ts`（或类似入口文件），理解流适配器模式：如何将 OpenAI 格式转为 Anthropic 内部格式。

- [ ] **Step 4: 写 API 客户端总结笔记**

---

### Task 7: Tier 1 模块 — 状态管理（AppState）

**目标:** 理解全局状态的类型定义、存储机制和选择器模式。

- [ ] **Step 1: 阅读 AppState 类型定义**

```
codegraph_node symbol="AppState" includeCode=true
```

- [ ] **Step 2: 阅读 store 工厂**

Read `src/state/store.ts`，理解 Zustand-style store 的创建方式。

- [ ] **Step 3: 阅读 bootstrap/state.ts**

Read `src/bootstrap/state.ts`，理解模块级单例：session ID、CWD、project root、token counts、permission mode。

- [ ] **Step 4: 写状态管理总结笔记**

---

### Task 8: Tier 2 模块 — REPL 屏幕 + 上下文构建 + 类型系统 + 启动引导

**目标:** 理解交互界面、系统提示词构建、类型契约和启动流程。

- [ ] **Step 1: REPL 屏幕**

```
codegraph_explore query="REPL REPL.tsx PromptInput Messages MessageRow"
```

关注：用户输入 → 消息展示 → 权限弹窗的组件树。

- [ ] **Step 2: 上下文构建**

Read `src/context.ts`，理解系统提示词如何组装（git status、date、CLAUDE.md、memory files）。
Read `src/utils/claudemd.ts`，理解 CLAUDE.md 文件发现和加载机制。

- [ ] **Step 3: 类型系统**

Read `src/types/message.ts`，理解消息类型层级（UserMessage、AssistantMessage、SystemMessage 等）。
Read `src/types/permissions.ts`，理解权限模式和结果类型。

- [ ] **Step 4: 启动引导**

Read `src/bootstrap/state.ts`（已在 Task 7 读过，这里回顾）。
Read `src/entrypoints/init.ts`，理解一次性初始化（telemetry、config、trust dialog）。

- [ ] **Step 5: 写 Tier 2 总结笔记**

---

### Task 9: Tier 3 模块 — UI 组件 + 命令系统 + Feature Flag + 工具共享层

**目标:** 理解支撑设施。

- [ ] **Step 1: UI 组件关键部分**

```
codegraph_files path="src/components" maxDepth=1
```

重点阅读：`PromptInput/`（用户输入处理）、`Messages.tsx`（消息渲染）、`permissions/`（权限 UI）。

- [ ] **Step 2: 命令系统**

```
codegraph_files path="src/commands" maxDepth=1
```

理解 slash command 的注册和执行模式。选一个简单命令（如 `/poor`）追踪其实现。

- [ ] **Step 3: Feature Flag 系统**

Read `scripts/defines.ts`，理解 MACRO defines 集中管理。
用 Grep 搜索 `feature(` 调用点分布：
```
Grep pattern="feature\(" path="src" output_mode="count" head_limit=20
```

- [ ] **Step 4: 工具共享层**

```
codegraph_files path="packages/builtin-tools/src/tools/shared" maxDepth=1
```

理解工具间共享的工具函数。

- [ ] **Step 5: 写 Tier 3 总结笔记**

---

### Task 10: 交叉串联 — 模块依赖图

**目标:** 将 Task 4-9 的孤立知识点连接成网络。

- [ ] **Step 1: 汇总所有笔记**

回顾 Task 4-9 的总结笔记，列出每个模块的：入口文件、核心符号、被谁依赖、依赖谁。

- [ ] **Step 2: 画模块依赖图**

用 ASCII 或工具画出模块间 import 关系图。标注关键事件流：用户输入 → query → tool_use → 权限 → 执行 → 响应。

- [ ] **Step 3: 识别危险区域**

标注改了容易炸的地方：类型定义文件（影响全项目）、bootstrap/state.ts（会话级单例）、query.ts（核心循环）。

---

### Task 11: 分支模块扫盲（Day 6）

**目标:** 对 7 个分支模块建立"在哪里、干什么"的索引。

每个子任务 30-45 分钟：读入口文件 → codegraph 看核心符号 → 写一句总结。

- [ ] **Step 1: Bridge/Remote Control**

```
codegraph_files path="src/bridge" maxDepth=1
codegraph_context task="bridge remote control session management JWT"
```

- [ ] **Step 2: ACP Protocol**

```
codegraph_files path="src/services/acp" maxDepth=1
codegraph_context task="ACP agent client protocol permissions"
```

- [ ] **Step 3: Daemon**

```
codegraph_files path="src/daemon" maxDepth=1
```

- [ ] **Step 4: Voice**

```
codegraph_files path="src/voice" maxDepth=1
```

- [ ] **Step 5: Skills**

```
codegraph_files path="src/skills" maxDepth=1
```

- [ ] **Step 6: Plugins**

```
codegraph_files path="src/plugins" maxDepth=1
```

- [ ] **Step 7: Multi-API 兼容层**

```
codegraph_files path="src/services/api/openai" maxDepth=1
codegraph_files path="src/services/api/gemini" maxDepth=1
codegraph_files path="src/services/api/grok" maxDepth=1
```

---

### Task 12: packages/ 扫尾 + 全局复盘（Day 7）

**目标:** 理解 workspace 包结构，产出个人架构地图。

- [ ] **Step 1: 浏览 builtin-tools 包**

```
codegraph_files path="packages/builtin-tools/src/tools" maxDepth=2
```

选 3 个不同类型的工具（文件操作、Shell、Agent）读其实现，对比异同。

- [ ] **Step 2: 浏览 @ant/ink 框架**

```
codegraph_files path="packages/@ant/ink" maxDepth=2
```

理解 Ink fork 的组件、hooks、keybindings、theme 结构。

- [ ] **Step 3: 浏览 mcp-client**

```
codegraph_files path="packages/mcp-client" maxDepth=2
```

- [ ] **Step 4: 全局复盘 — 整理个人架构地图**

将 7 天所有笔记汇总为一份文档，包含：
- 每个模块的入口文件、核心符号、一句话职责
- 模块依赖图
- 危险区域列表
- 快速查找索引（"想改 X 应该看哪个文件"）

---

### Task 13: 实战验证 1 — 修一个真实 bug

**目标:** 验证定位和修复能力。

- [ ] **Step 1: 从 git log 选一个已修复的 bug**

```bash
git log --oneline --grep="fix" -10
```

选一个范围明确、改动量小的 bug。

- [ ] **Step 2: 回退到 bug 存在的版本**

```bash
git show <commit-hash> --stat
```

理解 bug 的影响范围。

- [ ] **Step 3: 独立定位根因**

不看 commit 的 diff，只用 codegraph + 源码阅读定位 bug 位置和原因。记录定位过程。

- [ ] **Step 4: 对照实际修复**

```bash
git show <commit-hash>
```

对比自己的定位和实际修复，分析差距。

---

### Task 14: 实战验证 2 — 加一个小功能

**目标:** 走完整 dev → test → precheck 流程。

- [ ] **Step 1: 选择一个简单功能**

建议选项（选一个）：
- 给 FileReadTool 加一个 `encoding` 参数
- 给 `/poor` 命令加一个 `--stats` 选项显示节省的 token 数
- 给某个工具加一个测试用例

- [ ] **Step 2: 写测试（TDD）**

先写失败的测试，描述期望行为。

- [ ] **Step 3: 实现功能**

修改源码使测试通过。

- [ ] **Step 4: 运行 precheck**

```bash
bun run precheck
```

确保 typecheck + lint + test 全部通过。

- [ ] **Step 5: 提交**

```bash
git add <files>
git commit -m "feat: <描述>"
```

---

### Task 15: 实战验证 3 — 教一遍

**目标:** 通过讲述发现知识盲区。

- [ ] **Step 1: 准备讲述大纲**

列出"一次对话的完整生命周期"的关键节点：入口 → 启动 → 上下文构建 → 用户输入 → API 请求 → 流式响应 → tool_use 拦截 → 权限 → 执行 → tool_result → 下一轮 → 响应渲染。

- [ ] **Step 2: 对着空气/同事讲一遍**

每个节点解释：哪个文件、哪个函数、输入什么、输出什么、下一步是什么。

- [ ] **Step 3: 记录卡壳点**

讲不下去的地方就是没真懂的地方。回到对应模块重新深入。

- [ ] **Step 4: 更新个人架构地图**

把讲述中发现的遗漏补充到架构地图中。
