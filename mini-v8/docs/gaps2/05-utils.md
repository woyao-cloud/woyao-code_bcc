# Utils 差距分析

## 现状

mini-v8 `utils/` 有 31 文件（含 `model/` + `settings/` 子目录）。完整版有 **770 文件**（最大的目录）。

## mini-v8 现有的工具

| 文件 | 说明 |
|------|------|
| `abortController.ts` | 中止控制器 |
| `agentContext.ts` | ALS 上下文隔离 |
| `api.ts` | API 工具函数 |
| `array.ts` | 数组工具 |
| `auth.ts` | 认证 |
| `claudemd.ts` | CLAUDE.md 发现 |
| `config.ts` | 配置 |
| `crypto.ts` | 加密 |
| `cwd.ts` | CWD 管理 |
| `debug.ts` | 调试日志 |
| `envUtils.ts` | 环境变量工具 |
| `errors.ts` | 错误类型 |
| `execFileNoThrow.ts` | 文件执行 |
| `git.ts` | Git 工具 |
| `log.ts` | 日志 |
| `messages.ts` | 消息工具 |
| `permissions.ts` | 权限工具 |
| `platform.ts` | 平台检测 |
| `Shell.ts` | Shell 抽象 |
| `signal.ts` | 信号处理 |
| `systemPromptType.ts` | System prompt 类型 |
| `tokens.ts` | Token 计数 |
| `turnLimit.ts` | Turn 限制 |

### model/
- `model.ts` — 模型解析
- `modelStrings.ts` — 模型字符串
- `providers.ts` — 提供商选择

### settings/
- `constants.ts` — 设置常量
- `managedPath.ts` — 托管路径
- `settings.ts` — 设置读写
- `settingsCache.ts` — 设置缓存
- `types.ts` — 设置类型

## 完整版有而 mini 没有的重要工具

### P0 (核心)

| 工具 | 说明 |
|------|------|
| `git/git.ts` | 增强 Git 操作 (diff, log, blame, status) |
| `model/modelMap.ts` | 完整模型映射表 |
| `permissions/` | 权限规则匹配 + yolo 分类器 |
| `shell/shell.ts` | Shell 抽象 + 多平台 |

### P1 (重要)

| 工具 | 说明 |
|------|------|
| `bash/` | Bash 工具 (安全执行, 超时, 会话) |
| `powershell/` | PowerShell 工具 |
| `processUserInput/` | 用户输入处理 |
| `settings/ (mdm/)` | MDM 策略支持 |
| `messages/` | 消息处理工具 |
| `memory/` | 内存工具 |

### P2 (增强)

| 工具 | 说明 |
|------|------|
| `computerUse/` | 计算机使用 (截屏/键鼠) |
| `swarm/` | Swarm 协调 |
| `ultraplan/` | UltraPlan 规划系统 |
| `todo/` | TODO 跟踪 |
| `task/` | 任务工具 |
| `skills/` | 技能工具 |
| `mcp/` | MCP 工具 |

### P3 (特定)

| 工具 | 说明 |
|------|------|
| `telemetry/` | 遥测 |
| `teleport/` | Teleport 工具 |
| `secureStorage/` | 安全存储 |
| `sandbox/` | 沙箱 |
| `deepLink/` | 深链接 |
| `plugins/` | 插件工具 |
| `github/` | GitHub 工具 |
| `vendor/ripgrep/` | Ripgrep 集成 |
| `suggestions/` | 建议系统 |
| `dxt/` | 开发者体验 |
| `nativeInstaller/` | 原生安装器 |
| `claudeInChrome/` | Chrome 集成 |
| `hooks/` | Ink hooks |
| `filePersistence/` | 文件持久化 |

## 推荐

- P0: 增强 `git/`、`model/`、`shell/` 工具 (日常使用频繁)
- P1: 增加 `processUserInput/`、`bash/`、`messages/`
- P2: 根据需求增加 `swarm/`、`ultraplan/`
- 大部分 `utils/` 文件是简单工具函数 (100 行以内)，渐进式添加
