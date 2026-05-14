# Claude Code Mini v7 文档索引

欢迎来到 Claude Code Mini v7 的文档中心！

## 快速开始

- [README](../README.md) - 项目概述和快速开始指南

## 架构文档

- [整体架构](architecture.md) - 系统整体架构和设计

## 模块文档

### 核心模块

- [记忆系统](modules/memory-system.md) - 会话记忆、本地记忆、云端记忆、团队同步
- [Skill 系统](modules/skill-system.md) - Skill 加载、商店、搜索
- [插件系统](modules/plugin-system.md) - 插件架构、安装、市场
- [权限系统](modules/permission-system.md) - 权限模式、安全控制
- [工具系统](modules/tool-system.md) - 15+ 内置工具、MCP 集成
- [CLI 系统](modules/cli.md) - 主入口、REPL、对话循环

## 项目结构

```
mini-v7/
├── src/
│   ├── __tests__/              # 测试文件 (257+ 测试)
│   ├── bootstrap/              # 启动和状态
│   ├── commands/               # REPL 命令
│   ├── constants/              # 常量
│   ├── entrypoints/            # 入口点 (cli.ts)
│   ├── plugins/                # 插件系统
│   ├── services/               # 核心服务
│   │   ├── api/                # API 集成
│   │   ├── compact/            # 对话压缩
│   │   ├── config/             # 配置管理
│   │   ├── mcp/                # MCP 协议
│   │   ├── memory/             # 记忆系统
│   │   ├── permission/         # 权限管理
│   │   └── skill/              # Skill 系统
│   ├── tools/                  # 工具系统
│   │   └── builtin/            # 15+ 内置工具
│   ├── types/                  # 类型定义
│   └── utils/                  # 工具函数
├── docs/                       # 文档 (本目录)
│   ├── architecture.md         # 架构文档
│   └── modules/                # 模块文档
├── package.json
├── tsconfig.json
└── README.md
```

## 版本历史

| 版本 | 主要特性 |
|------|---------|
| v7 | Memory 系统 (会话记忆、本地记忆、云端记忆、团队同步) |
| v6 | 插件系统 |
| v5 | Skill 系统 |
| v4 | 权限系统 |
| v3 | 任务管理 |
| v2 | 完善工具系统 |
| v1 | 基础版本 |

## 开发指南

### 运行项目

```bash
# 安装依赖
bun install

# 开发模式 (REPL)
bun run dev

# 类型检查
bun run typecheck

# 运行测试
bun test

# 构建
bun run build
```

### 目录说明

- `src/__tests__/`: 测试文件，运行 `bun test` 执行
- `src/bootstrap/`: 启动和全局状态管理
- `src/commands/`: REPL 命令实现
- `src/entrypoints/`: 入口点 (cli.ts)
- `src/plugins/`: 插件系统
- `src/services/`: 核心业务逻辑
- `src/tools/`: 工具定义和实现
- `src/types/`: TypeScript 类型定义
- `src/utils/`: 通用工具函数

## 贡献指南

1. 阅读相关模块的设计文档
2. 遵循现有代码风格
3. 添加测试覆盖
4. 提交 PR 前运行 `bun test` 和 `bun run typecheck`

## 许可证

参见项目根目录的 LICENSE 文件。
