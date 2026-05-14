# Claude Code Mini v8 - 项目架构文档

> 版本: 8.0.0 | 日期: 2026-05-14

---

## 1. 项目概述

Claude Code Mini v8 是一个精简的 AI 编程助手 CLI 工具，支持多 Agent 协调、记忆系统、插件生态和 MCP 协议。基于 Bun 运行时和 TypeScript 构建，兼容 Anthropic 和 OpenAI API。

### 技术栈

| 层面 | 技术选型 |
|------|---------|
| 运行时 | Bun (ESM) |
| 语言 | TypeScript 5.7, Strict Mode |
| 核心依赖 | @anthropic-ai/sdk ^0.81.0 |
| 测试框架 | bun:test |
| 构建工具 | bun build |

---

## 2. 目录结构

```
mini-v8/
  package.json
  tsconfig.json
  src/
    entrypoints/cli.ts          # 唯一入口 (CLI + REPL)
    Tool.ts                     # Tool 接口定义
    context.ts                  # 上下文构建
    agents/                     # 多Agent协调系统
      agentTypes.ts             # 类型定义
      agentRegistry.ts          # 注册中心
      agentRunner.ts            # 执行引擎
      builtInAgents.ts          # 6个内置Agent
      teamManager.ts            # 团队管理
    commands/                   # REPL命令
      agentCommands.ts          # /agent /team /swarm
      memoryCommands.ts         # /memory
      pluginCommands.ts         # /plugin
      skillCommands.ts          # /skill
    services/                   # 业务服务层
      api/claude.ts             # 核心API (Anthropic+OpenAI)
      api/openai/               # OpenAI兼容层
      compact/autoCompact.ts    # 消息压缩
      config/configManager.ts   # 配置管理
      mcp/mcpClient.ts          # MCP客户端
      memory/                   # 记忆系统
      permission/               # 权限管理
      retry.ts                  # 重试逻辑
      taskStore.ts              # 任务追踪
      planMode.ts               # Plan模式
      skill/                    # Skill系统
    plugins/                    # 插件生态
    tools/                      # 工具系统 (19内置)
    types/                      # 全局类型
    utils/                      # 工具函数 (29文件)
    constants/                  # 全局常量
    bootstrap/state.ts          # 会话状态
    __tests__/                  # 25个测试
  dist/cli.js                   # 构建产物
```

---

## 3. 分层架构

```
+---------------------------------------------------+
|                  Entry Layer                        |
|            entrypoints/cli.ts                       |
|  (参数解析, REPL循环, 多模式分发)                     |
+----+----------------+------------------+-----------+
     |                |                  |
+----v-----+  +------v------+  +------v------+
| Agent 层 |  |  Command 层 |  |   Tool 层   |
| agents/  |  |  commands/  |  |   tools/    |
+----+-----+  +------+------+  +------+------+
     |                |                  |
+----v----------------v------------------v-----------+
|                Service Layer                        |
|  api/ | compact/ | config/ | mcp/ | memory/         |
|  permission/ | retry/ | task/ | plan/ | skill/     |
+----+----------------------------------+------------+
     |                                  |
+----v-----+                      +----v-----+
| Plugin 层 |                     | Context 层|
| plugins/  |                     | context.ts|
+-----------+                      +-----------+
+---------------------------------------------------+
|              Foundation Layer                       |
|    types/ + utils/ + constants/ + bootstrap/       |
+---------------------------------------------------+
```

---

## 4. 主数据流

### 4.1 REPL 交互流程

```
User Input
    |
    v
cli.ts: 检查命令前缀
    |
    +-- /xxx --> Commands层 --> 对应Service
    |
    +-- 普通消息
        |
        v
    context.ts: 构建系统上下文
        |-- Git Status
        |-- ClaudeMd
        |-- Skills
        |-- Memories
        |-- Agents & Teams
        |
        v
    services/api/claude.ts
        |-- Provider 路由
        |-- 流式API调用
        |
        v
    Tool 执行循环:
        |-- permissionManager
        |-- tool.execute()
        |-- 结果回传API
        |
        v
    Auto-Compact (如需要)
    Memory Extraction (如需要)
```

### 4.2 Agent 子流程

```
AgentTool.execute()
    |
    v
agentRunner.ts: runAgent()
    |-- Registry 查找 AgentDefinition
    |-- filterToolsForAgent
    |-- 构建独立上下文
    |-- Agent 循环 (maxTurns)
    |-- 返回 AgentResult
```

---

## 5. 关键设计决策

1. **单入口设计**: 所有功能通过 cli.ts 入口分发
2. **进程内Agent**: Agent 在同进程内运行，通过工具过滤实现隔离
3. **模块级状态**: 使用 JS 模块单例管理全局状态
4. **同步执行循环**: Agent 和主循环均为同步 async/await 模式
5. **Provider 透明切换**: 自动路由，下游代码无感知