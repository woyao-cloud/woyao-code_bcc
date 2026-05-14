# Skill 系统设计文档

## 概述

Skill 系统提供可重用的专业知识和工作流程，帮助 AI 助手更好地完成特定任务。Skill 可以从项目、用户配置、插件或 Skill 商店加载。

**文件位置**: `src/services/skill/`

---

## 系统架构

```
Skill 系统
├── Skill 加载器 (skillLoader.ts)
│   ├── 项目 Skill 发现
│   ├── 用户 Skill 发现
│   ├── 插件 Skill 集成
│   └── Skill 格式化
├── Skill 商店客户端 (skillStore.ts)
│   ├── Skill 列表获取
│   ├── Skill 安装/卸载
│   └── 缓存管理
├── Skill 工具 (SkillTool.ts)
│   ├── Skill 列表
│   └── Skill 查看
└── Skill 搜索
    ├── 本地搜索
    └── 相关性排序
```

---

## Skill 定义

### Skill 结构

```typescript
interface Skill {
  name: string           // Skill 名称
  path: string           // Skill 文件路径
  content: string        // Skill 内容 (截断到 5000 字符)
  source: 'project' | 'user' | 'plugin' | 'store'  // 来源
}
```

### Skill 文件格式

Skill 以 Markdown 文件形式存储，位于：

- **项目级**: `.agents/skills/{skill-name}/SKILL.md` 或 `.codex/skills/{skill-name}/SKILL.md`
- **用户级**: `~/.claude-code-mini/skills/{skill-name}/SKILL.md`
- **插件级**: 由插件提供
- **商店级**: 从 Skill 商店安装

```markdown
# Python 测试指南

## 概述

这是一个关于 Python 单元测试的 Skill，使用 pytest 和 coverage。

## 最佳实践

1. 编写可测试的代码
2. 使用 AAA 模式 (Arrange-Act-Assert)
3. 保持测试独立
4. 使用有意义的测试名称

## 常用命令

```bash
# 运行测试
pytest tests/

# 生成覆盖率报告
pytest --cov=src tests/
```
```

---

## Skill 加载器 (skillLoader.ts)

### 发现流程

```
项目根目录
    ↓
检查 .agents/skills/
    ↓
检查 .codex/skills/
    ↓
检查 ~/.claude-code-mini/skills/
    ↓
集成插件提供的 Skills
    ↓
合并所有 Skills
    ↓
去重 (同一名称只保留一个)
```

### 主要函数

| 函数 | 说明 |
|------|------|
| `discoverSkills(projectRoot, pluginSkills?)` | 发现所有 Skills |
| `formatSkillsForPrompt(skills)` | 格式化 Skills 用于提示词 |

### 发现规则

1. **项目 Skill**: 优先加载，覆盖其他来源
2. **用户 Skill**: 全局可用的 Skill
3. **插件 Skill**: 由插件贡献
4. **商店 Skill**: 从商店安装的 Skill

### Skill 格式化

将 Skills 格式化为提示词的一部分：

```markdown
## Skills

- python-testing: Guidelines for Python unit testing with pytest and coverage.
- react-patterns: React component patterns and hooks best practices.
- deploy-guide: Deployment guide for Docker and Kubernetes.
```

---

## Skill 商店客户端 (skillStore.ts)

### 商店 Skill 结构

```typescript
interface StoreSkill {
  skill_id: string
  name: string
  owner: string
  deprecated?: boolean
  description?: string
  category?: string
  tags?: string[]
  downloads?: number
  created_at?: string
  updated_at?: string
}

interface StoreSkillVersion {
  version: string
  skill_id: string
  body: string
  created_at?: string
}
```

### 主要函数

| 函数 | 说明 |
|------|------|
| `listStoreSkills()` | 获取商店 Skill 列表 |
| `getSkill(skillId)` | 获取 Skill 详情 |
| `installSkill(skillId)` | 安装 Skill |
| `uninstallSkill(skillName)` | 卸载 Skill |
| `listInstalledSkills()` | 列出已安装的 Skills |
| `saveCachedSkillList(skills)` | 缓存 Skill 列表 |

### 安装位置

商店安装的 Skill 保存在：`~/.claude-code-mini/skills/{skill-name}/`

---

## Skill 工具 (SkillTool.ts)

### 工具定义

```typescript
{
  name: 'Skill',
  description: 'Load and view available skills from the project.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        enum: ['list', 'view'],
        description: 'Command: "list" to list skills, "view" to view a specific skill'
      },
      name: { type: 'string', description: 'Skill name (for "view" command)' }
    },
    required: ['command']
  }
}
```

### 使用示例

#### 列出 Skills

```
Skill list
```

输出：
```
Available skills:
- python-testing (project)
- react-patterns (user)
- deploy-guide (plugin)
```

#### 查看 Skill

```
Skill view name="python-testing"
```

输出 Skill 的完整内容。

---

## Skill 搜索

### 搜索算法

Skill 搜索使用简单但有效的相关性评分：

1. **名称匹配**: 名称包含查询词 → 高分
2. **内容匹配**: 内容包含查询词 → 低分
3. **重复排除**: 避免重复结果

### 实现

```typescript
function searchLocalSkills(skills: Skill[], query: string): Skill[] {
  const lower = query.toLowerCase()
  const results: { skill: Skill; score: number }[] = []

  for (const skill of skills) {
    let score = 0
    if (skill.name.toLowerCase().includes(lower)) score += 10
    if (skill.content.toLowerCase().includes(lower)) score += 1
    if (score > 0) results.push({ skill, score })
  }

  return results.sort((a, b) => b.score - a.score).map(r => r.skill)
}
```

---

## 自动 Skill 匹配

当 Skill 搜索启用时，系统会自动匹配相关 Skills 并注入到对话上下文中：

```typescript
// 在 runConversationTurn 中
if (isSkillSearchEnabled()) {
  const recentText = messages.slice(-3).map(getMessageText).join(' ')
  if (recentText.trim()) {
    const relevant = searchLocalSkills(allSkills, recentText)
    if (relevant.length > 0) {
      skillContext = `
        ## Auto-matched Skills (Skill Search)
        ${relevant.slice(0, 5).map(s => `- ${s.name}: ${s.content.slice(0, 300)}`).join('\n')}
      `
    }
  }
}
```

---

## REPL 命令

### Skill 商店命令

```
/skill-store list|search|install|uninstall|installed
```

- `list`: 列出商店 Skills
- `search`: 搜索商店 Skills
- `install`: 安装 Skill
- `uninstall`: 卸载 Skill
- `installed`: 列出已安装的 Skills

### Skill 搜索命令

```
/skill-search start|stop|status
```

- `start`: 启用自动 Skill 搜索
- `stop`: 禁用自动 Skill 搜索
- `status`: 查看搜索状态

---

## 命令处理 (skillCommands.ts)

### 主要命令

| 命令 | 说明 |
|------|------|
| `handleSkillStoreCommand(subArgs)` | 处理 Skill 商店命令 |
| `handleSkillSearchCommand(subArgs)` | 处理 Skill 搜索命令 |
| `searchLocalSkills(skills, query)` | 本地 Skill 搜索 |

---

## 设计模式

### 策略模式

不同来源的 Skill 使用统一接口加载：

```typescript
loadSkillsFromDir(dir, source, skills)
```

### 缓存模式

商店 Skill 列表使用缓存：

```typescript
saveCachedSkillList(skills)
```

---

## 最佳实践

### 编写好的 Skill

1. **清晰的标题**: 简短描述 Skill 用途
2. **结构化内容**: 使用 Markdown 标题组织
3. **具体示例**: 提供代码示例和命令
4. **最佳实践**: 列出相关的最佳实践
5. **限制范围**: 每个 Skill 专注一个主题

### Skill 命名

- 使用小写和连字符
- 清晰描述用途
- 避免过于通用的名称

示例：
- ✅ `python-testing`
- ✅ `react-component-patterns`
- ❌ `coding`
- ❌ `python`

---

## 测试覆盖

- `skillCommands.test.ts`: Skill 命令测试

---

## 扩展点

1. **自定义 Skill 源**: 添加新的 Skill 发现位置
2. **Skill 版本管理**: 支持 Skill 版本和升级
3. **Skill 依赖**: 支持 Skill 之间的依赖关系
4. **Skill 参数**: 支持可配置的 Skill 参数
5. **AI 生成 Skill**: 自动从项目代码中提取 Skill
