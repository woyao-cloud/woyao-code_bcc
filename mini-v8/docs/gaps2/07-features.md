# 特性模块差距分析

## Bridge / Remote Control

| 特性 | 完整版 | mini-v8 |
|------|--------|---------|
| 文件 | 40 文件 | ❌ 无 |
| 功能 | remote-control, bridge, 会话管理, JWT, WebSocket | ❌ |
| 推荐 | 大功能暂缓。如需可参考 `packages/remote-control-server/` | P5 |

## Daemon 模式

| 特性 | 完整版 | mini-v8 |
|------|--------|---------|
| 文件 | 5 文件 | ❌ 无 |
| 功能 | 长驻 Supervisor, Worker 注册 | ❌ |
| 推荐 | feature-gated (DAEMON)。暂缓。 | P5 |

## 插件系统

| 特性 | 完整版 | mini-v8 |
|------|--------|---------|
| 文件 | 3+ 文件 | 7 文件 |
| 功能 | 打包插件, MCP 集成 | 插件加载 + marketplace + installer |
| 差距 | marketplace 已有，bundled plugins 缺失 | 小差距 |
| 推荐 | 打包插件 (`plugins/bundled/`) 按需添加 | P2 |

## Bg Sessions (后台会话)

| 特性 | 完整版 | mini-v8 |
|------|--------|---------|
| 文件 | cli/bg/ + cli/bg.ts | ❌ 无 |
| 功能 | attach, kill, ps, logs | ❌ |
| 推荐 | feature-gated (BG_SESSIONS)。暂缓。 | P5 |

## Vim 模式

| 特性 | 完整版 | mini-v8 |
|------|--------|---------|
| 文件 | 5 文件 | ❌ 无 |
| 功能 | motions, operators, textObjects | ❌ |
| 推荐 | 仅在 readline 增强后考虑 | P5 |

## 语音模式

| 特性 | 完整版 | mini-v8 |
|------|--------|---------|
| 文件 | 1+ 文件 | ❌ 无 |
| 功能 | Push-to-Talk 语音输入 | ❌ |
| 推荐 | 需 Anthropic OAuth + 录音硬件 | P5 |

## 服务器 / SSH

| 特性 | 完整版 | mini-v8 |
|------|--------|---------|
| 文件 | 17 文件 | ❌ 无 |
| 功能 | Direct Connect, SSH 会话 | ❌ |
| 推荐 | 独立子系统，可后续添加 | P4 |

## Keybindings

| 特性 | 完整版 | mini-v8 |
|------|--------|---------|
| 文件 | 15 文件 | ❌ 无 |
| 功能 | 自定义快捷键绑定 | ❌ |
| 推荐 | 需 readline 增强 | P5 |

## Skills (MCP)

| 特性 | 完整版 | mini-v8 |
|------|--------|---------|
| 文件 | 26 文件 | 2 文件 (skillLoader + skillStore) |
| 功能 | mcpSkillBuilders, bundledSkills, loadSkillsDir | 基础 skill 加载 |
| 推荐 | 增加 MCP skill 构建器 + 打包 skill | P3 |

## 任务系统 (TaskTypes)

| 特性 | 完整版 | mini-v8 |
|------|--------|---------|
| 文件 | 15 文件 | ❌ 无 |
| 功能 | DreamTask, LocalAgentTask, RemoteAgentTask | ❌ |
| 推荐 | AgentTask 已在 agentRunner 中实现。其余暂缓。 | P4 |

## 迁移系统

| 特性 | 完整版 | mini-v8 |
|------|--------|---------|
| 文件 | 10 文件 | ❌ 无 |
| 功能 | 模型/配置升级迁移 | ❌ |
| 推荐 | 仅在版本升级时需要 | P5 |

## 内存 (memdir)

| 特性 | 完整版 | mini-v8 |
|------|--------|---------|
| 文件 | 9 文件 | ❌ 无 |
| 功能 | findRelevantMemories, memoryAge, memoryScan | ❌ |
| 推荐 | Agent Memory 已实现 (Phase 3)。memdir 是完整版特定增强。 | P3 |
