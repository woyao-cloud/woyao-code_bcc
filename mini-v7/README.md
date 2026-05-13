# Claude Code Mini v7

基于 Anthropic Claude Code CLI 逆向工程的裁剪版本 v7。

## 新增功能 (v7)

### Memory 系统
- **Session Memory**: 对话过程中自动提取关键笔记，保存为 markdown 文件
  - 启用/禁用: `/session-memory on|off`
  - 自动触发: token 阈值达到时后台提取
  - 分类: User Requests / Decisions / Context & Files
  - 手动提取: `/memory extract`
- **Memory Stores (云)**: `/memory-stores list|create|get|archive|memories`
  - 完整 CRUD: Store + Memory + Versions
  - 需要 ANTHROPIC_API_KEY + Claude 订阅
- **Team Memory Sync**: 团队记忆双向同步
  - `/sync-memory pull|push|sync`
  - Delta 上传: 只上传 checksum 变化的文件
  - 本地存储: `~/.claude-code-mini/team-memory/`
- **增强本地记忆**: tags/categories/search/export/import
  - `/memory add|list|search|delete|categories|tags|export|import`

## 版本演进

| 指标 | v1 | v2 | v3 | v4 | v5 | v6 | v7 |
|------|----|----|----|----|----|----|----|
| TS 文件 | 49 | 68 | 79 | 85 | 89 | 95 | 101 |
| 测试数 | 0 | 130 | 147 | 161 | 213 | 236 | 257+ |
| 工具数 | 6 | 8 | 13 | 15 | 15+ | 15+ | 15+ |
| 插件市场 | - | - | - | - | - | - | - |
| Skill 商店 | - | - | - | - | - | - | - |
| Session 记忆 | - | - | - | - | - | - | - |
| 记忆同步 | - | - | - | - | - | - | - |

## 命令

```bash
bun install
bun run dev          # 启动 REPL
bun run build        # 构建
bun run typecheck    # 类型检查
bun test             # 运行测试
```

## REPL 命令

```
/help /exit /clear /tools /config
/plugin [install|uninstall|list|enable|disable|marketplace]
/skill-store [list|search|install|uninstall|installed]
/skill-search [start|stop|status]
/memory [add|list|search|delete|categories|tags|export|import|extract]
/session-memory [on|off|status|config|view]
/memory-stores [list|create|get|archive|memories]
/sync-memory [on|off|status|repo|pull|push|sync|list]
```
