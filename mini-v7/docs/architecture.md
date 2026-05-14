# Claude Code Mini v7 - 代码架构文档

## 项目概述

Claude Code Mini v7 是基于 Anthropic Claude Code CLI 逆向工程的精简版本，是一个功能强大的 AI 辅助开发工具。该项目采用 TypeScript + Bun 运行时，提供对话式开发体验。

**版本**: v7.0.0  
**主要特性**: Memory 系统、Skill 系统、Plugin 系统、权限管理、任务管理

---

## 目录结构

```
mini-v7/
├── src/
│   ├── __tests__/                      # 测试文件
│   │   ├── applyPatch.test.ts
│   │   ├── array.test.ts
│   │   ├── auth.test.ts
│   │   ├── autoCompact.test.ts
│   │   ├── bashTool.test.ts
│   │   ├── configManager.test.ts
│   │   ├── context.test.ts
│   │   ├── crypto.test.ts
│   │   ├── errors.test.ts
│   │   ├── fileTools.test.ts
│   │   ├── grepGlobTools.test.ts
│   │   ├── mcpTool.test.ts
│   │   ├── messages.test.ts
│   │   ├── model.test.ts
│   │   ├── permissionManager.test.ts
│   │   ├── planMode.test.ts
│   │   ├── providers.test.ts
│   │   ├── retry.test.ts
│   │   ├── signal.test.ts
│   │   ├── taskStore.test.ts
│   │   └── toolsRegistry.test.ts
│   ├── bootstrap/                      # 启动配置
│   │   └── state.ts                    # 会话全局状态
│   ├── commands/                       # REPL 命令处理
│   │   ├── __tests__/
│   │   │   └── skillCommands.test.ts
│   │   ├── memoryCommands.ts           # 记忆相关命令
│   │   ├── pluginCommands.ts           # 插件相关命令
│   │   └── skillCommands.ts            # Skill 相关命令
│   ├── constants/                      # 常量定义
│   │   ├── betas.ts
│   │   ├── common.ts
│   │   ├── product.ts
│   │   └── prompts.ts
│   ├── entrypoints/                    # 入口文件
│   │   └── cli.ts                      # CLI 主入口
│   ├── plugins/                        # 插件系统
│   │   ├── __tests__/
│   │   │   ├── marketplaceManager.test.ts
│   │   │   └── pluginLoader.test.ts
│   │   ├── index.ts                    # 插件主模块
│   │   ├── marketplaceManager.ts       # 市场管理
│   │   ├── pluginInstaller.ts          # 插件安装器
│   │   ├── pluginLoader.ts             # 插件加载器
│   │   └── types.ts                    # 插件类型定义
│   ├── services/                       # 核心服务
│   │   ├── api/                        # API 相关
│   │   │   ├── claude.ts               # Claude API 集成
│   │   │   └── openai/                 # OpenAI 相关
│   │   │       ├── client.ts
│   │   │       ├── modelMap.ts
│   │   │       └── streamAdapter.ts
│   │   ├── compact/                    # 对话压缩
│   │   │   └── autoCompact.ts          # 自动压缩
│   │   ├── config/                     # 配置管理
│   │   │   └── configManager.ts        # 配置管理器
│   │   ├── mcp/                        # Model Context Protocol
│   │   │   └── mcpClient.ts            # MCP 客户端
│   │   ├── memory/                     # 记忆系统
│   │   │   ├── __tests__/
│   │   │   │   ├── memoryStore.test.ts
│   │   │   │   ├── sessionMemory.test.ts
│   │   │   │   └── teamMemorySync.test.ts
│   │   │   ├── memoryStore.ts          # 本地记忆存储
│   │   │   ├── memoryStoresClient.ts   # 云端记忆商店
│   │   │   ├── sessionMemory.ts        # 会话记忆
│   │   │   └── teamMemorySync.ts       # 团队记忆同步
│   │   ├── permission/                 # 权限管理
│   │   │   └── permissionManager.ts    # 权限管理器
│   │   ├── skill/                      # Skill 系统
│   │   │   ├── skillLoader.ts          # Skill 加载器
│   │   │   └── skillStore.ts           # Skill 商店
│   │   ├── planMode.ts                 # 计划模式
│   │   ├── retry.ts                    # 重试机制
│   │   └── taskStore.ts                # 任务存储
│   ├── tools/                          # 工具系统
│   │   ├── builtin/                    # 内置工具
│   │   │   ├── ApplyPatchTool/
│   │   │   │   └── ApplyPatchTool.ts   # 补丁应用工具
│   │   │   ├── BashTool/
│   │   │   │   └── BashTool.ts         # Bash 执行工具
│   │   │   ├── EnterPlanModeTool/
│   │   │   │   └── EnterPlanModeTool.ts
│   │   │   ├── ExitPlanModeTool/
│   │   │   │   └── ExitPlanModeTool.ts
│   │   │   ├── FileEditTool/
│   │   │   │   └── FileEditTool.ts     # 文件编辑工具
│   │   │   ├── FileReadTool/
│   │   │   │   └── FileReadTool.ts     # 文件读取工具
│   │   │   ├── FileWriteTool/
│   │   │   │   └── FileWriteTool.ts    # 文件写入工具
│   │   │   ├── GlobTool/
│   │   │   │   └── GlobTool.ts         # 文件查找工具
│   │   │   ├── GrepTool/
│   │   │   │   └── GrepTool.ts         # 搜索工具
│   │   │   ├── MCPTool/
│   │   │   │   └── MCPTool.ts          # MCP 工具包装器
│   │   │   ├── SkillTool/
│   │   │   │   └── SkillTool.ts        # Skill 工具
│   │   │   ├── TaskCreateTool/
│   │   │   │   └── TaskCreateTool.ts   # 任务创建工具
│   │   │   ├── TaskListTool/
│   │   │   │   └── TaskListTool.ts     # 任务列表工具
│   │   │   ├── TaskUpdateTool/
│   │   │   │   └── TaskUpdateTool.ts   # 任务更新工具
│   │   │   ├── WebFetchTool/
│   │   │   │   └── WebFetchTool.ts     # 网页抓取工具
│   │   │   └── WebSearchTool/
│   │   │       └── WebSearchTool.ts    # 网页搜索工具
│   │   └── tools.ts                    # 工具注册表
│   ├── types/                          # 类型定义
│   │   ├── global.d.ts
│   │   ├── ids.ts
│   │   ├── internal-modules.d.ts
│   │   ├── message.ts
│   │   └── permissions.ts              # 权限类型
│   ├── utils/                          # 工具函数
│   │   ├── Shell.ts
│   │   ├── abortController.ts
│   │   ├── api.ts
│   │   ├── array.ts
│   │   ├── auth.ts
│   │   ├── claudemd.ts
│   │   ├── config.ts
│   │   ├── crypto.ts
│   │   ├── cwd.ts
│   │   ├── debug.ts
│   │   ├── envUtils.ts
│   │   ├── errors.ts
│   │   ├── execFileNoThrow.ts
│   │   ├── git.ts
│   │   ├── log.ts
│   │   ├── messages.ts
│   │   ├── permissions.ts
│   │   ├── platform.ts
│   │   ├── signal.ts
│   │   ├── systemPromptType.ts
│   │   ├── tokens.ts
│   │   └── settings/                   # 设置相关
│   │       ├── constants.ts
│   │       ├── managedPath.ts
│   │       ├── settings.ts
│   │       ├── settingsCache.ts
│   │       └── types.ts
│   ├── Tool.ts                         # 工具接口定义
│   └── context.ts                      # 系统上下文
├── README.md
├── package.json
└── tsconfig.json
```

---

## 整体架构

### 架构层次

```
┌─────────────────────────────────────────────────────────┐
│                      表现层 (Presentation)                │
│                cli.ts - REPL & 命令处理                    │
├─────────────────────────────────────────────────────────┤
│                     业务层 (Business Logic)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  命令处理 │  │  对话循环 │  │  工具执行 │  │  权限控制 │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
├─────────────────────────────────────────────────────────┤
│                      服务层 (Services)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  记忆系统 │  │ Skill系统│  │ 插件系统 │  │ 任务管理 │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  API调用  │  │  对话压缩 │  │  重试机制 │  │ 配置管理 │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
├─────────────────────────────────────────────────────────┤
│                      工具层 (Tools)                        │
│           15+ 内置工具 + MCP 扩展工具                      │
├─────────────────────────────────────────────────────────┤
│                      基础设施层 (Infrastructure)           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  文件系统 │  │  网络API  │  │  状态管理 │  │  工具函数 │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 核心模块关系图

```
cli.ts (主入口)
    │
    ├── 启动会话
    │
    ├── 对话循环
    │   ├── 流式调用 Claude API
    │   ├── 工具使用检测
    │   │
    │   ├── 权限检查 (permissionManager.ts)
    │   │
    │   └── 工具执行
    │       ├── 内置工具 (tools/builtin/)
    │       └── MCP 工具
    │
    ├── 上下文管理
    │   ├── Skill 注入 (skillLoader.ts)
    │   ├── Memory 注入 (memoryStore.ts, sessionMemory.ts)
    │   └── Git 上下文 (git.ts)
    │
    ├── 对话压缩 (autoCompact.ts)
    │
    └── 会话记忆提取 (sessionMemory.ts)

bootstrap/state.ts (全局状态)
    ├── 会话 ID
    ├── 工作目录
    ├── 权限模式
    └── 模型使用统计
```

---

## 核心功能模块

### 1. 记忆系统 (Memory System)

记忆系统是 v7 版本的核心特性，包含以下组件：

- **会话记忆 (Session Memory)**: 自动从对话中提取关键信息
- **本地记忆存储 (Local Memory Store)**: 用户自定义记忆，支持标签和分类
- **云端记忆商店 (Memory Stores)**: 云端存储和共享记忆
- **团队记忆同步 (Team Memory Sync)**: 团队记忆双向同步

详细设计见 [memory-system.md](./modules/memory-system.md)

### 2. Skill 系统

Skill 系统提供可重用的专业知识和工作流程：

- 自动发现项目 Skill
- Skill 搜索和匹配
- Skill 商店集成

详细设计见 [skill-system.md](./modules/skill-system.md)

### 3. 插件系统

插件系统支持功能扩展：

- 插件市场
- 插件安装/卸载
- 插件加载和激活

详细设计见 [plugin-system.md](./modules/plugin-system.md)

### 4. 权限管理

权限系统控制工具执行的安全性：

- 多种权限模式
- 交互式权限请求
- 会话级权限缓存

详细设计见 [permission-system.md](./modules/permission-system.md)

### 5. 工具系统

工具系统提供 15+ 内置工具：

- 文件操作工具 (Read, Write, Edit)
- 搜索工具 (Grep, Glob)
- 系统工具 (Bash)
- 网络工具 (WebFetch, WebSearch)
- 任务工具 (TaskCreate, TaskList, TaskUpdate)
- 补丁工具 (ApplyPatch)
- Skill 工具 (Skill)
- 计划模式工具 (EnterPlanMode, ExitPlanMode)

详细设计见 [tool-system.md](./modules/tool-system.md)

---

## 数据流程

### 对话流程

```
用户输入
    ↓
添加到 messages 数组
    ↓
构建系统上下文
    ├── Skill 上下文
    ├── Memory 上下文
    └── Git 上下文
    ↓
调用 Claude API (流式)
    ↓
检测工具使用
    ↓
请求权限
    ↓
执行工具
    ↓
添加工具结果到 messages
    ↓
检查是否需要压缩
    ↓
检查是否需要提取会话记忆
    ↓
继续循环 (最多 20 轮)
```

### 工具执行流程

```
工具调用请求
    ↓
查找工具定义
    ↓
权限检查 (needsPermission)
    ├── bypassPermissions → 直接允许
    ├── acceptEdits + (Write/Edit/ApplyPatch) → 允许
    └── 其他 → 询问用户
    ↓
执行工具 (execute)
    ↓
返回结果
```

---

## 关键设计决策

### 1. 流式 API 处理

- 使用 `input_json_delta` 增量构建工具输入
- `safeJsonMerge` 函数处理部分 JSON 解析失败的情况
- 解析失败时保留现有输入而非清空

### 2. 状态管理

- 使用模块级单例模式管理全局状态
- `state.ts` 集中管理会话状态
- 支持测试环境的路径覆盖

### 3. 权限设计

- 危险工具 (Bash, Write, Edit, ApplyPatch, WebFetch) 需要显式授权
- 支持 `always` 选项，会话内记忆授权决策
- 多种权限模式适应不同使用场景

### 4. 对话压缩

- 自动检测对话长度
- 超过阈值时自动压缩历史消息
- 保持重要的上下文信息

---

## 扩展点

### 1. 添加新工具

- 在 `src/tools/builtin/` 创建新工具类
- 实现 `Tool` 接口
- 在 `src/tools/tools.ts` 中注册

### 2. 添加新插件

- 遵循插件 manifest 格式
- 支持 Skill 贡献
- 支持 MCP 服务器

### 3. 自定义记忆提取规则

- 修改 `sessionMemory.ts` 中的提取逻辑
- 添加新的正则表达式模式
- 支持自定义分类

---

## 技术栈

- **运行时**: Bun
- **语言**: TypeScript
- **AI SDK**: @anthropic-ai/sdk
- **测试框架**: Bun test

---

## 版本演进

| 版本 | 主要特性 | TS 文件数 | 测试数 |
|------|----------|-----------|--------|
| v1 | 基础功能 | 49 | 0 |
| v2 | 工具系统完善 | 68 | 130 |
| v3 | 任务管理 | 79 | 147 |
| v4 | 权限系统 | 85 | 161 |
| v5 | Skill 系统 | 89 | 213 |
| v6 | 插件系统 | 95 | 236 |
| v7 | Memory 系统 | 101+ | 257+ |
