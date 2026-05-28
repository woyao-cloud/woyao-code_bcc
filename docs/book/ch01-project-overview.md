# 第 1 章：项目全景

## 1.1 项目定位

Claude Code 是 Anthropic 公司推出的官方 AI 编程命令行工具。与传统 IDE 插件不同，它运行在终端中，开发者通过自然语言向 AI 描述编码需求，AI 自主完成代码阅读、编写、调试和文件操作等一系列任务。这种"对话即编程"的模式，将 AI 从一个辅助补全工具提升为一个真正的编程协作者。

本书分析的项目是这个官方工具的逆向工程版本。Anthropic 官方版本的 Claude Code 由闭源的业务逻辑层和开源的工具层组成。这个社区版本基于 decompiled 代码重新构建，目标是在保持核心能力的同时，裁剪掉不必要的次要功能（如部分埋点、远程控制等），形成一个更精简、更适合学习和二次开发的技术制品。

项目的核心哲学可以用一句话概括：**用 TypeScript 在终端中复现一个完整的 AI 编程 Agent**。这意味着它不仅要处理 API 调用和流式响应，还要管理上下文窗口、调度工具执行、维护跨会话记忆、处理错误恢复 —— 这些都是一个 AI Agent 系统的通用挑战。

## 1.2 技术栈全景

Claude Code 的技术栈选择反映了它对性能和开发效率的追求：

**运行环境：Bun。** Bun 是一个为现代 JavaScript 设计的全栈运行时，集成了包管理器、测试运行器和打包器。项目选择 Bun 而非 Node.js，主要看中了它的启动速度（对于 CLI 工具至关重要）和内置的 TypeScript 支持（无需预编译即可运行 TSX 文件）。Bun 的 `bun:bundle` 模块提供了构建时的宏替换能力，项目用它实现了 Feature Flag 系统。

**编程语言：TypeScript 严格模式。** 整个项目采用 TypeScript 编写，并开启了 strict 模式。这对逆向工程代码尤其重要 —— 类型系统帮助理清了 decompiled 代码中模糊的数据流和接口边界。项目对类型有严格要求：生产代码禁止使用 `as any`，类型不匹配时优先使用 `as unknown as SpecificType` 双重断言。

**UI 框架：React/Ink。** 终端渲染是 CLI 工具最棘手的部分之一。项目选择了 Ink —— 一个用 React 组件渲染终端界面的框架。这意味着开发者可以用熟悉的 React 组件模型（JSX、状态管理、生命周期）来构建终端 UI。项目使用的 Ink 版本是一个 fork，位于 `packages/@ant/ink/` 目录下，包含自定义的组件库、hooks、主题系统和键绑定支持。整个终端 UI 由超过 149 个组件构成，覆盖消息展示、输入框、权限对话框、进度条等场景。

**构建系统：Bun.build + Code Splitting。** 项目使用 Bun 内置的打包器进行构建，开启了代码拆分（splitting）选项。入口文件 `src/entrypoints/cli.tsx` 经过构建后输出 `dist/cli.js` 和若干 chunk 文件。构建时会将 65 个以上的 Feature Flags 以宏定义形式注入，实现构建时的死代码消除。构建产物同时兼容 Bun 和 Node.js 运行时。

**包管理：Bun Workspaces（Monorepo）。** 项目采用 Monorepo 结构，包含 17 个 workspace 包，通过 `workspace:*` 协议互相引用。这种结构使各模块边界清晰，同时共享统一的构建和测试配置。

**测试：bun:test。** 使用 Bun 内置的测试框架，提供断言、mock 和覆盖率报告。单元测试就近放置在 `src/**/__tests__/` 目录下，遵循 `describe + test` 的命名规范。集成测试集中在 `tests/integration/` 目录。项目对 mock 有严格规范 —— 只 mock 有副作用的依赖链（如日志、配置、网络），不 mock 纯函数和纯数据模块。

**代码规范：Biome。** 项目使用 Biome 替代 ESLint + Prettier 进行 lint 和格式化。配置保留了 recommended 基线，因 decompiled 代码的特殊性关闭了 42 条规则。TSX 文件使用 120 列宽 + 强制分号，其他文件使用 80 列宽。pre-commit 阶段通过 husky + lint-staged 自动对暂存文件执行格式化。

**CI 流水线：GitHub Actions。** 主要的 `ci.yml` 流水线执行 lint 检查、项目构建和测试。另有 `release-rcs.yml` 用于 Remote Control Server 的发布，`update-contributors.yml` 自动维护贡献者列表。

## 1.3 模块地图（核心）

从代码组织的角度，Claude Code 可以划分为以下核心模块，每个模块都承担一个独立的职责：

**入口与启动（Entry & Bootstrap）。** 真正的入口是 `src/entrypoints/cli.tsx` 中的 `main()` 函数。它按优先级处理多条快速路径：版本号查询（零模块加载）、System Prompt 转储、Chrome MCP 模式、Computer Use MCP 独立服务器、Daemon Worker、Remote Control 模式等。如果未匹配任何快速路径，则加载 `src/main.tsx` 启动完整 CLI。`main.tsx` 是一个约 5700 行的 Commander.js CLI 定义文件，注册了大量子命令（mcp、server、ssh、auth、plugin、agents 等），主处理器负责权限管理、MCP 初始化、会话恢复和 REPL/Headless 模式的分发。初始化模块 `src/entrypoints/init.ts` 处理首次运行的遥测同意、配置生成和信任对话框。

**核心运行循环（Core Loop）。** 这是 Claude Code 的心脏。`src/query.ts` 是主要的 API 查询函数，负责向 Claude API 发送消息、处理流式响应、编排工具调用、管理对话轮次循环。`src/QueryEngine.ts` 是一个更高级别的编排器，它包装了 `query()`，增加了会话状态管理、上下文压缩调度、文件历史快照、归因追踪和轮次级记账。`src/screens/REPL.tsx` 是交互式 REPL 界面，渲染对话消息、工具权限提示和键盘快捷键处理。

**API 层（API Layer）。** `src/services/api/claude.ts` 是核心 API 客户端，负责构建请求参数（System Prompt、消息历史、工具定义、beta 标志），调用 Anthropic SDK 的流式端点，并处理流式事件。项目支持 7 个 Provider：firstParty（Anthropic 直连）、Bedrock（AWS）、Vertex（Google Cloud）、Foundry、OpenAI、Gemini 和 Grok（xAI）。所有第三方兼容层均采用流适配器模式 —— 将各自 API 格式转为 Anthropic 内部格式，下游代码完全不变。Provider 选择优先级为：`modelType` 参数 > 环境变量 > 默认 firstParty。

**工具系统（Tool System）。** `src/Tool.ts` 定义了工具接口和查找工具的工具函数。`src/tools.ts` 是工具注册中心，从 `@claude-code-best/builtin-tools` 包导入并组装工具列表。整个系统包含 60 个内置工具实现，分布在 `packages/builtin-tools/src/tools/` 下。这些工具按功能分类：文件操作（读写编辑、Glob 搜索、Grep 搜索）、Shell 执行（Bash、PowerShell）、Agent 系统（Agent 调用、任务创建/更新/查询）、规划工具（进入/退出计划模式、验证执行）、Web 和 MCP 工具（网页抓取、搜索、MCP 服务调用）、调度工具（Cron 创建/删除/列表）、工具发现（延迟工具按需加载）、以及其他（LSP 诊断、配置查询、技能调用等）。`CORE_TOOLS` 白名单定义了 38 个核心工具，用于延迟工具的按需加载决策。工具可条件加载：部分工具通过 `feature()` 标志或 `process.env.USER_TYPE` 控制何时可见。

**UI 层（Ink Components）。** 项目使用定制的 Ink 框架（位于 `packages/@ant/ink/`）渲染终端界面。`src/ink.ts` 是 Ink 渲染包装器，注入 ThemeProvider。`src/components/` 包含 149 个组件，覆盖 App 根 Provider（AppState、Stats、FpsMetrics）、消息展示（Messages、MessageRow）、用户输入（PromptInput）、工具权限审批、设计系统组件（Dialog、FuzzyPicker、ProgressBar、ThemeProvider）等。由于是 decompiled 代码，组件中包含 React Compiler 生成的记忆化调用。

**状态管理（State Management）。** `src/state/AppState.tsx` 定义了中央应用状态类型和 Context Provider，包含消息、工具、权限、MCP 连接等数据。`src/state/AppStateStore.ts` 提供默认状态和 Store 工厂。`src/state/store.ts` 实现了 Zustand 风格的 Store。`src/bootstrap/state.ts` 维护模块级单例，存储会话级别的全局状态（会话 ID、当前工作目录、项目根路径、Token 计数、模型覆盖、客户端类型、权限模式）。

**上下文管理（Context Management）。** `src/context.ts` 负责构建每次 API 调用所需的系统和用户上下文（Git 状态、日期、CLAUDE.md 内容、记忆文件）。这是一个多层压缩系统，在下游代码中实现了五层压缩策略和八级截断优先级链，确保 Token 预算被高效使用。

**记忆系统（Memory System）。** 跨会话的持久化记忆系统，包含自动提取 Pipeline、Auto-Dream 离线巩固策略、Hooks 系统的事件驱动注入，以及指令注入的一致性保障。这是 Claude Code 区别于"一次对话即忘"的简易 AI 工具的关键能力。

**Daemon 与 Bridge 模式。** `src/daemon/` 实现了 Daemon 模式（长驻 Supervisor），通过 `DAEMON` feature flag 控制。`src/bridge/` 实现了 Remote Control / Bridge 模式，包含 Bridge API、会话管理、JWT 认证、消息传输和权限回调。Bridge 模式通过 `BRIDGE_MODE` flag 控制。`packages/remote-control-server/` 提供了自托管的 Remote Control Server，支持 Docker 部署，包含 React + Vite + Radix UI 构建的 Web 控制面板。

**ACP 协议（Agent Client Protocol）。** `src/services/acp/` 实现了 ACP Agent，包含 Agent 类、Claude Code 到 ACP 的桥接、权限处理和入口逻辑。`packages/acp-link/` 是一个 ACP 代理服务器，将 WebSocket 客户端桥接到 ACP Agent，支持自定义端口、HTTPS、认证和会话管理。

## 1.4 仓库结构

项目采用 Monorepo 布局，核心代码集中在 `src/` 和 `packages/` 两个目录下：

**`src/` —— 核心应用代码。** 包含入口文件（`entrypoints/cli.tsx`、`main.tsx`）、CLI 命令定义（`commands/`）、API 服务（`services/api/`）、UI 组件（`components/`，149 个组件）、状态管理（`state/`）、工具注册（`tools.ts` 和 `shared/`）、上下文构建（`context.ts`）、会话管理（`screens/`）、工具函数（`utils/`）、类型定义（`types/`）、桥接模式（`bridge/`）、Daemon（`daemon/`）等。

**`packages/builtin-tools/` —— 60 个工具实现。** 这是项目中最大的独立包，包含所有内置工具的完整实现。通过 `@claude-code-best/builtin-tools` 导出，被 `src/tools.ts` 引用。

**`packages/@ant/ink/` —— Fork 版 Ink 框架。** 包含了自定义的组件库、hooks、键绑定系统、主题支持等，是终端 UI 的渲染基础。

**其他 Workspace 包：**
- `packages/@ant/computer-use-mcp/` —— Computer Use MCP 服务器（截图、键鼠模拟、剪贴板、应用管理）
- `packages/@ant/computer-use-input/` —— 键鼠模拟（多平台后端：Darwin、Win32、Linux）
- `packages/@ant/computer-use-swift/` —— 截图和应用管理
- `packages/@ant/claude-for-chrome-mcp/` —— Chrome 浏览器控制
- `packages/@ant/model-provider/` —— Model Provider 抽象层
- `packages/agent-tools/` —— Agent 工具集
- `packages/acp-link/` —— ACP 代理服务器
- `packages/mcp-client/` —— MCP 客户端库
- `packages/remote-control-server/` —— 自托管 Remote Control Server
- `packages/audio-capture-napi/` —— 原生音频捕获
- `packages/color-diff-napi/` —— 颜色差异计算
- `packages/image-processor-napi/` —— 图像处理
- `packages/modifiers-napi/` —— 键盘修饰键检测（macOS FFI）
- `packages/url-handler-napi/` —— URL Scheme 处理

**非 Workspace 辅助目录：** `langfuse-dashboard`（Langfuse 面板）、`shared-web-ui`（共享 Web UI 组件）、`highlight-code`（代码高亮）、`claude-pencil`（编辑器）、`vscode-ide-bridge`（VS Code 桥接）、`weixin`（微信集成）。

## 1.5 Feature Flag 体系

Feature Flag 是 Claude Code 架构中的一个关键设计。它解决的问题是：一个功能可以在运行时或构建时被打开或关闭，而不需要修改代码。

**实现方式。** 项目利用 Bun 的 `bun:bundle` 内置模块，通过 `import { feature } from 'bun:bundle'` 导入 `feature()` 函数。调用 `feature('FLAG_NAME')` 返回布尔值，决定某段代码是否执行。这个函数只能在 `if` 语句的条件位置或三元表达式中使用 —— 这是 Bun 编译器的限制。

**启用方式。** 运行时通过环境变量 `FEATURE_<FLAG_NAME>=1` 控制。例如 `FEATURE_BUDDY=1 bun run dev` 会在开发模式下启用 BUDDY 功能。

**构建时的死代码消除。** 构建时，`build.ts` 会将特性列表以宏定义形式注入 `Bun.build({ define })`。由于 `feature('X')` 在构建时被替换为常量 `true` 或 `false`，Bun 的打包器可以在构建时就消除被关闭特性的代码。这意味着未启用的功能不会出现在最终产物中。

**Build 默认 vs Dev 模式。** 构建时默认启用 65 个以上的 Feature（包含基础能力、缓存、Agent 触发、工作流、多 Worker 等），而开发模式（`scripts/dev.ts`）默认全部启用。两者之间的差距意味着某些功能在开发环境中可用但不在生产构建中 —— 这是控制发布范围的策略。

**已禁用的特性。** 部分高复杂度或次要的特性在构建时被禁用，包括 `CONTEXT_COLLAPSE`（上下文折叠）、`FORK_SUBAGENT`（Fork 子代理）、`SKILL_LEARNING`（技能学习）等。这些功能仍保留在代码中，通过 Feature Flag 开关控制，未来可以按需启用。

**新增功能的正确做法。** 开发者应当保留 `import { feature } from 'bun:bundle'` 的标准模式，通过环境变量或配置控制开关，不要绕过 Feature Flag 直接导入。

可以将 Feature Flag 理解为一套"电气开关系统"：代码中的每个 Feature 就像一盏灯，`feature()` 调用就是墙壁开关，环境变量是总闸，构建时的宏替换则是布线阶段就决定是否安装这盏灯。这种多层控制让项目既能灵活开关功能，又能确保最终产物尽可能精简。

## 1.6 开发工作流

Claude Code 的开发工作流围绕几个核心命令展开：

**依赖安装。** `bun install` — 安装所有 workspace 包的依赖。

**开发模式。** `bun run dev` — 通过 `scripts/dev.ts` 以 Bun 的宏定义注入模式运行 `src/entrypoints/cli.tsx`，默认启用全部 Feature。`bun run dev:inspect` 可以附加调试器。

**构建。** `bun run build` — 执行 `build.ts`，使用 `Bun.build()` 进行代码拆分打包，输出 `dist/cli.js` 和 chunk 文件。构建时会注入 65 个以上的 Feature Flags、复制 vendor 二进制文件、后处理 `import.meta.require` 使其兼容 Node.js。`bun run build:vite` 是使用 Vite 的备选构建流水线。

**测试。** `bun test` 运行所有测试，也可以指定单个文件。`bun test --coverage` 输出覆盖率报告。

**代码规范。** `bun run lint:fix` 自动修复 lint 问题，`bun run check:fix` 同时修复 lint 和格式化问题。

**完整检查。** `bun run precheck` 是任务完成后的必执行命令，包含 TypeScript 类型检查、lint 修复和测试三个阶段，全部通过才算完成。

**提交规范。** 项目遵循 Conventional Commits 规范，commit message 格式为 `<type>: <描述>`。常见 type 包括 `feat`（新功能）、`fix`（修复）、`docs`（文档）、`chore`（杂务）、`refactor`（重构）。pre-commit 阶段通过 husky + lint-staged 自动格式化暂存文件。

**CI 流水线。** GitHub Actions 的 `ci.yml` 在每次提交时执行：依赖安装 → Biome lint 检查 → TypeScript 类型检查 → 构建 → 测试。任何环节失败都会阻止合并。

这种开发工作流的设计体现了"预防优于修复"的理念。pre-commit hook 在本地拦截格式问题，`precheck` 在提交前发现类型错误，CI 在合并前验证整体健康状态。三层防线确保代码库始终保持可发布状态。

## 小结

本章揭示了 Claude Code 项目架构的几个核心设计原则：

**原则一：分层解耦。** 项目通过明确的模块边界（入口、核心循环、API 层、工具系统、UI 层、状态管理）将复杂系统分解为独立单元。每个模块只负责一个职责，模块之间通过类型接口（TypeScript Interface）通信。这种解耦使得系统可以独立演进 —— 例如，增加一个新的 API Provider 不需要修改任何工具逻辑。

**原则二：编译期与运行期双层控制。** Feature Flag 体系展示了如何在编译期（构建宏替换）和运行期（环境变量）两个层面控制功能开关。编译期的死代码消除保证了最终产物的精简，运行期的灵活开关支持了调试和灰度发布。

**原则三：技术选型服务于场景。** 选择 Bun 而非 Node.js 是为了 CLI 启动速度和内置 TypeScript 支持；选择 React/Ink 而非传统 TUI 框架是为了组件化开发和 React 生态；选择 Monorepo 是为了模块边界清晰和共享构建配置。每个技术选型都有明确的场景驱动。

**原则四：防御性工程实践。** 三层检查防线（pre-commit、precheck、CI）、严格类型规范（禁止 `as any`）、Mock 规范（只 mock 有副作用的依赖链）—— 这些实践不是为了炫技，而是因为逆向工程代码本身就面临着类型模糊和逻辑复杂的挑战，需要更严格的纪律来维持代码质量。

**原则五：社区驱动的适度精简。** 作为逆向工程版本，项目不是简单复刻官方功能，而是有选择地恢复核心能力、裁剪次要功能。这种适度的范围控制使得项目既足够复杂以展示架构深度，又足够精简以保持可维护性。
