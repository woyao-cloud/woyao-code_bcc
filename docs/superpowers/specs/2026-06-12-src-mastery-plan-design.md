# src/ 目录代码全面掌握方案

## 目标

达到对 `src/` 目录下 2,293 个源文件（~49 万行代码）的**深度维护/二次开发**水平——能随时上手修改任何模块、修复 bug、添加功能。

## 约束与节奏

- **时间投入**：每天 4-6 小时，集中突击
- **周期**：1-2 周建立全局掌控感
- **学习风格**：自顶向下（从入口沿调用链逐层深入）
- **策略**：黄金路径追踪 + 测试即规格的混合体

## 工具栈

| 工具 | 用途 | 关键能力 |
|------|------|---------|
| **CodeGraph MCP** | AST 级代码智能 | `codegraph_trace` 一键出调用链；`codegraph_explore` 批量读源码；`codegraph_context` 任务上下文 |
| **Bun test** | 测试即规格 | 每个模块先跑测试理解"该做什么"，再读实现 |
| **CLAUDE.md** | 架构地图 | 已覆盖 entry、core loop、API、tools、UI、state、packages |
| **docs/book/** | 8 章架构解析 | 补充深度分析 |
| **手写笔记** | 知识内化 | 每个模块读完写一段总结，Day 7 汇总为个人架构地图 |

## Phase 1：三条黄金路径（Day 1-2）

目标：建立"一次完整请求怎么走的"全局心智模型。

### 路径 1：CLI 启动 → 一次完整对话

```
cli.tsx:main() → main.tsx:CLI action handler → REPL.tsx → PromptInput
→ query.ts → services/api/claude.ts → 响应渲染
```

回答：用户敲了一句话，从入口到 API 到屏幕输出，经过了什么？

### 路径 2：Tool 的完整生命周期

```
tools.ts:工具注册 → query.ts:tool_use event → 权限检查
→ Tool 执行 → tool_result 回传 → 下一轮 API 调用
```

回答：Claude 说"我要读文件"，这个意图怎么变成实际的文件内容，又怎么送回模型？

### 路径 3：Agent 的 spawn → 执行 → 回收

```
AgentTool → TaskCreate → 子 agent 启动 → 独立 query loop
→ 结果收集 → 回传父 agent
```

回答：子 agent 怎么隔离运行、怎么跟父 agent 通信、怎么合并结果？

### 每条路径的具体做法

1. `codegraph_trace from→to` 一键拿到完整调用链（含动态分发桥接）
2. `codegraph_explore` 批量读链上关键符号的源码
3. 手动画调用流程图，标注关键数据结构在哪个节点产生/变换

## Phase 2：模块深度攻坚（Day 3-5）

每个模块流程：**跑测试看规格 → codegraph_explore 批量读核心源码 → 手写一段总结笔记**。

### Tier 1 — 核心命脉（Day 3）

| 模块 | 关键文件 | 为什么重要 |
|------|---------|-----------|
| API 查询引擎 | `query.ts` (204 symbols), `QueryEngine.ts` (106 symbols) | 工具调用循环的大脑 |
| Tool 系统 | `Tool.ts` (157 symbols), `tools.ts` (82 symbols) | 60+ 工具的注册、发现、执行 |
| API 客户端 | `services/api/claude.ts` + 7 个 provider | 所有模型交互的出口 |
| 状态管理 | `state/AppState.tsx`, `state/store.ts` | 全局状态真相来源 |

### Tier 2 — 高频接触（Day 4）

| 模块 | 关键文件 | 为什么重要 |
|------|---------|-----------|
| REPL 屏幕 | `screens/REPL.tsx` | 交互界面根组件 |
| 上下文构建 | `context.ts`, `utils/claudemd.ts` | 系统提示词、CLAUDE.md 加载 |
| 类型系统 | `types/message.ts`, `types/permissions.ts` | 全模块共享的类型契约 |
| 启动引导 | `bootstrap/state.ts`, `entrypoints/cli.tsx` | 会话级单例、入口分发 |

### Tier 3 — 支撑设施（Day 5 上午）

| 模块 | 关键文件 |
|------|---------|
| UI 组件 | `components/` 下：`PromptInput/`、`Messages.tsx`、`permissions/` |
| 命令系统 | `commands/` — slash command 注册与执行 |
| Feature Flag | `scripts/defines.ts` + `feature()` 调用点分布 |
| 工具共享层 | `tools/shared/` + `packages/builtin-tools/` |

### Day 5 下午：交叉串联

将 Tier 1-3 的笔记汇总，画**模块依赖图**——谁 import 了谁、谁的事件触发了谁。把孤立知识点变成网络。

## Phase 3：横向补漏（Day 6-7）

### Day 6：分支模块扫盲（每个 30-45 分钟）

| 模块 | 关键文件 | 一句话本质 |
|------|---------|-----------|
| Bridge/Remote Control | `bridge/`, `packages/remote-control-server/` | 远程会话管理 + Web UI 控制面板 |
| ACP Protocol | `services/acp/`, `packages/acp-link/` | Agent Client Protocol，外部 agent 接入标准 |
| Daemon | `daemon/` | 长驻后台 supervisor |
| Voice | `voice/` | Push-to-Talk 语音输入 |
| Skills | `skills/` | 技能系统，可扩展 slash command 机制 |
| Plugins | `plugins/` | 插件安装/启用/禁用 + Marketplace |
| Multi-API 兼容层 | `services/api/openai/`, `gemini/`, `grok/` | 第三方 API 流适配器 |

每个模块：读入口文件 → codegraph 看核心符号 → 写一句总结。只建立索引，不深入。

### Day 7：packages/ 扫尾 + 全局复盘

- **上午**：扫 `packages/` 下 17 个 workspace 包，重点：
  - `builtin-tools/` — 60 个工具实现
  - `@ant/ink/` — Ink 框架 fork（components、hooks、keybindings、theme）
  - `mcp-client/` — MCP 客户端库
- **下午**：全局复盘——整理个人版"架构地图"，标注每个模块的：
  - 入口文件
  - 核心符号
  - 依赖关系
  - 危险区域（改了容易炸的地方）

## Phase 4：实战验证（第二周）

知识不用会蒸发。三个验证动作：

1. **修一个真实 bug** — 从 git log 找已修复的 bug，先自己定位、理解根因，再对照 commit 看差距
2. **加一个小功能** — 给某个工具加参数、给 slash command 加选项，走完整 dev → test → precheck 流程
3. **教一遍** — 对着空气或同事讲"一次对话的完整生命周期"，讲不下去的地方就是没真懂的地方

## 成功标准

完成本方案后应能达到：

- [ ] 能不看笔记画出核心调用链图（入口 → API → 工具 → 响应）
- [ ] 能说出每个 Tier 1 模块的核心符号和职责
- [ ] 能独立定位一个 bug 到具体文件和函数
- [ ] 能独立完成一个小功能的添加（含测试 + precheck 通过）
- [ ] 知道每个分支模块"在哪里、干什么"，需要时能快速深入

## 风险与注意事项

1. **反编译代码的残留** — 部分模块是 decompiled output，有 React Compiler memoization  boilerplate（`_c()` 调用），这是正常的，不要花时间纠结
2. **Stubbed 模块** — 部分模块是空实现（Analytics、GrowthBook、Sentry），遇到空文件直接跳过
3. **Feature flag 迷宫** — 65+ feature flags，很多模块默认关闭。理解 `feature()` 机制即可，不需要记住每个 flag
4. **CodeGraph 索引延迟** — 修改代码后索引有 ~1 秒延迟，读源码前注意 staleness banner
5. **Mock 污染陷阱** — 测试文件间 `mock.module` 是进程全局的，单独运行和批量运行结果可能不同
