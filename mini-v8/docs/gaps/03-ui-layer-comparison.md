# UI 组件层对比

## 核心结论

**mini-v8 完全没有 UI 层。** 这是一个纯后端/命令行管道模式的实现，与完整版的 Ink (React for CLI) TUI 应用是两种完全不同的架构范式。

## 完整版 UI 架构

```
src/
├── components/          (32 个目录, ~412 文件)
│   ├── messages/        — 消息流渲染（用户/助手/工具消息）
│   ├── PromptInput/     — 用户输入处理组件
│   ├── permissions/     — 工具权限审批 UI
│   ├── design-system/   — 设计系统（Dialog, FuzzyPicker, ProgressBar 等）
│   ├── diff/            — Diff 展示
│   ├── HighlightedCode/ — 语法高亮代码块
│   ├── mcp/             — MCP 配置 UI
│   ├── memory/          — Memory 管理 UI
│   ├── tasks/           — 任务管理 UI
│   ├── teams/           — 团队管理 UI
│   ├── agents/          — Agent 设置 UI
│   ├── skills/          — Skill 设置 UI
│   ├── Settings/        — 设置面板
│   ├── shell/           — Shell 集成 UI
│   ├── TrustDialog/     — 信任对话框
│   ├── sandbox/         — 沙箱 UI
│   ├── ultraplan/       — Ultra 计划 UI
│   ├── ui/              — 通用 UI 原语
│   ├── Spinner/         — 加载动画
│   ├── HelpV2/          — 帮助系统 V2
│   └── ...              — 其他
│
├── hooks/               (~90 个 React Hooks)
│   ├── useArrowKeyHistory.tsx     — 方向键历史导航
│   ├── useBlink.ts                — 闪烁动画
│   ├── useCommandKeybindings.tsx  — 命令快捷键
│   ├── useCanUseTool.tsx          — 工具权限判定
│   ├── useTerminalSize.ts         — 终端尺寸适配
│   ├── usePasteHandler.ts         — 粘贴处理
│   ├── useTextInput.ts            — 文本输入
│   ├── useTypeahead.ts            — 自动补全
│   ├── useVimInput.ts             — Vim 输入模式
│   └── ...
│
├── screens/             (3 个全屏视图)
│   ├── REPL.tsx          — 主交互式 REPL 屏幕
│   ├── Doctor.tsx        — 系统诊断屏幕
│   └── ResumeConversation.tsx — 会话恢复
│
├── context/             (9 个 React Context)
│   ├── stats.tsx         — 统计上下文
│   ├── mailbox.tsx       — 收件箱上下文
│   ├── overlayContext.tsx — 覆盖层上下文
│   └── ...
│
└── state/               (7 文件, Zustand Store)
    ├── AppState.tsx      — 中心状态类型 (消息/工具/权限/MCP/...)
    └── store.ts          — Zustand 风格 store
```

## mini-v8 架构

```
src/
├── entrypoints/cli.ts   — 单入口，直接命令行 I/O
├── commands/            — 4 个命令处理文件
│   ├── agentCommands.ts  — /agent, /team (纯文本输出)
│   ├── memoryCommands.ts — /memory (纯文本输出)
│   ├── pluginCommands.ts — /plugin (纯文本输出)
│   └── skillCommands.ts  — /skill (纯文本输出)
│
└── (无 components/ 目录)
└── (无 hooks/ 目录)
└── (无 screens/ 目录)
└── (无 .tsx 文件)
```

## 依赖对比

| 依赖 | 完整版 | mini-v8 |
|------|--------|---------|
| ink | YES | - |
| react | YES | - |
| react-reconciler | YES | - |
| ink-text-input | YES | - |
| @anthropic-ai/sdk | YES | YES |
| zod | YES | - |
| zustand | YES | - |

## 交互模型差异

| 方面 | 完整版 | mini-v8 |
|------|--------|---------|
| **渲染方式** | `<Box>`, `<Text>` 等 Ink 组件渲染到终端 | `console.log()` 直接输出纯文本 |
| **用户输入** | PromptInput 组件 + 方向键历史 + 自动补全 + Vim 模式 | `readline` 标准输入 |
| **消息展示** | 消息流组件树（用户/助手/工具消息分类渲染） | 文本流直接打印 |
| **权限审批** | Dialog + FuzzyPicker + 快捷键（y/n/d 等） | 内存状态匹配，无交互 UI |
| **进度显示** | Spinner + ProgressBar + 工具执行进度 | 无 |
| **快捷键** | 完整的 keybindings 系统（~64 KB） | 无 |
| **主题** | ThemeProvider + 32 色主题系统 | 无 |
| **Diff 展示** | StructuredDiff + diff 组件树 | 无（直接文本输出） |
| **多面板** | tmux 布局管理 + 分屏支持 | 无 |
| **状态持久化** | Zustand AppState + 磁盘快照 | 模块级 singleton |

## 功能差距清单

以下是完整版通过 UI 层实现、mini-v8 完全无法提供的功能：

1. **交互式 REPL** — 完整的 Read-Eval-Print-Loop 终端界面
2. **方向键历史** — 上下方向键浏览历史命令
3. **Tab 自动补全** — 文件路径/工具名/Agent 名补全
4. **Vim 模式** — hjkl 导航、operator+motion 组合
5. **工具权限审批** — 可视化权限对话框（允许/拒绝/总是允许）
6. **实时流式展示** — streaming token 逐字渲染
7. **工具执行进度** — Spinner + 进度描述 + 执行状态
8. **语法高亮代码块** — HighlightedCode 组件
9. **Diff 对比展示** — 并排/统一 diff 视图
10. **设置面板** — 交互式设置浏览和修改
11. **帮助系统** — HelpV2 帮助浏览和搜索
12. **通知系统** — 后台任务完成通知
13. **主题切换** — 亮色/暗色主题
14. **快捷键系统** — 自定义快捷键绑定
15. **会话恢复 UI** — 会话浏览和恢复选择

## 总结

mini-v8 和完整版在 UI 层面的差异不是"简化"而是"完全不同的产品形态"：
- **完整版** = TUI 应用（类似 vim/htop/lazygit 的交互体验）
- **mini-v8** = CLI 工具（类似 grep/curl/git 的命令行管道体验）

从代码层面看，完整版 UI 相关代码占整个 src 约 30% 的代码量（components + hooks + context + state + screens ≈ 800+ 文件），这部分在 mini-v8 中零覆盖。
