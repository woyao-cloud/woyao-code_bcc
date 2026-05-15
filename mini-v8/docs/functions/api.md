# API 服务层详解

## 概述

API 服务层负责与 AI 模型进行通信，支持 Anthropic 和 OpenAI 兼容两种协议。该层提供统一的接口，屏蔽了底层协议差异。

---

## 一、架构设计

### 1.1 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        API 服务层                               │
├──────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │   claude.ts     │    │   openai/client │                    │
│  │  (统一入口)      │    │    (OpenAI兼容)  │                    │
│  └────────┬────────┘    └────────┬────────┘                    │
│           │                      │                              │
│           ▼                      ▼                              │
│  ┌──────────────────────────────────────────────────────┐       │
│  │              提供者选择 (providers.ts)                │       │
│  └──────────────────────────────────────────────────────┘       │
│           │                      │                              │
│           ▼                      ▼                              │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │  Anthropic SDK  │    │   raw fetch     │                    │
│  └─────────────────┘    └─────────────────┘                    │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 核心组件

| 组件 | 职责 | 文件 |
|------|------|------|
| `claude.ts` | 统一 API 入口，自动选择提供者 | `src/services/api/claude.ts` |
| `openai/client.ts` | OpenAI 兼容 API 客户端 | `src/services/api/openai/client.ts` |
| `openai/modelMap.ts` | 模型名称映射 | `src/services/api/openai/modelMap.ts` |
| `openai/streamAdapter.ts` | 流式响应转换 | `src/services/api/openai/streamAdapter.ts` |
| `providers.ts` | 提供者选择逻辑 | `src/utils/model/providers.ts` |

---

## 二、统一 API 接口

### 2.1 QueryParams

```typescript
export interface QueryParams {
  systemPrompt: string           // 系统提示词
  messages: BetaMessageParam[]   // 消息历史
  tools: Tool[]                  // 可用工具列表
  model?: string                 // 模型名称（可选）
  signal?: AbortSignal           // 取消信号（可选）
  maxTokens?: number             // 最大 token 数（可选）
}
```

### 2.2 流式调用

```typescript
export async function* streamClaudeAPI(
  params: QueryParams,
): AsyncGenerator<BetaRawMessageStreamEvent> {
  if (isOpenAIProvider()) {
    // OpenAI 兼容路径
    const config = getOpenAIConfig()
    const resolvedModel = params.model
      ? resolveOpenAIModel(resolveModel(params.model))
      : config.model

    const openAIStream = streamOpenAIAPI({
      systemPrompt: params.systemPrompt,
      messages: params.messages as Array<{ role: string; content: unknown }>,
      tools: params.tools,
      model: resolvedModel,
      signal: params.signal,
      maxTokens: params.maxTokens,
    })

    yield* openAIToAnthropicStream(openAIStream)
  } else {
    // Anthropic 原生路径
    const apiKey = getAPIKey()
    const model = resolveModel(params.model)
    const baseURL = getAnthropicBaseURL()
    const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) })

    const stream = await client.beta.messages.create(
      {
        model,
        max_tokens: params.maxTokens ?? MAX_TOKENS,
        system: params.systemPrompt,
        messages: params.messages,
        tools: params.tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        })),
        betas: baseURL ? [] : BETAS,
        stream: true,
      },
      { signal: params.signal }
    )

    for await (const event of stream) {
      yield event
    }
  }
}
```

### 2.3 非流式调用

```typescript
export async function callClaudeAPI(params: QueryParams) {
  const apiKey = getAPIKey()
  const model = resolveModel(params.model)
  const baseURL = getAnthropicBaseURL()
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) })

  const response = await client.beta.messages.create({
    model,
    max_tokens: params.maxTokens ?? MAX_TOKENS,
    system: params.systemPrompt,
    messages: params.messages,
    tools: params.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    })),
    betas: baseURL ? [] : BETAS,
  })

  return response
}
```

---

## 三、提供者选择机制

### 3.1 选择策略

```typescript
export type APIProvider = 'firstParty' | 'openai'

export function getAPIProvider(): APIProvider {
  // 优先级 1: ANTHROPIC_BASE_URL + Anthropic auth → firstParty
  const hasAnthropicAuth = !!process.env.ANTHROPIC_API_KEY || !!process.env.ANTHROPIC_AUTH_TOKEN
  const hasAnthropicBase = !!process.env.ANTHROPIC_BASE_URL

  if (hasAnthropicBase && hasAnthropicAuth) {
    return 'firstParty'
  }

  // 优先级 2: CLAUDE_CODE_USE_OPENAI=1 → openai
  if (process.env.CLAUDE_CODE_USE_OPENAI === '1') return 'openai'

  // 优先级 3: OPENAI_API_KEY 且无 ANTHROPIC_API_KEY → openai
  if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return 'openai'
  }

  // 优先级 4: 默认 → firstParty
  return 'firstParty'
}
```

### 3.2 选择流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                    getAPIProvider()                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌──────────────────────────────┐
              │ ANTHROPIC_BASE_URL 已设置？   │
              └────────────┬─────────────────┘
                    Yes    │    No
                    ▼      │      ▼
        ┌──────────────────┐      │
        │ 有 Anthropic auth？ │      │
        └────────┬─────────┘      │
          Yes    │    No          │
          ▼      │      ▼          │
    firstParty   │   继续检查      │
                 │                 │
                 └────────┬────────┘
                          ▼
              ┌──────────────────────────────┐
              │ CLAUDE_CODE_USE_OPENAI=1？   │
              └────────────┬─────────────────┘
                    Yes    │    No
                    ▼      │      ▼
                openai     │      │
                           │      ▼
                   ┌───────┴───────────────┐
                   │ OPENAI_API_KEY 存在？   │
                   └───────────┬───────────┘
                         Yes   │   No
                         ▼     │     ▼
                  ┌────────────┘     │
                  │ ANTHROPIC_API_KEY │
                  │ 不存在？          │
                  └────────┬─────────┘
                    Yes    │    No
                    ▼      │      ▼
                openai     │    firstParty
                           │
                           └──→ firstParty (默认)
```

---

## 四、OpenAI 兼容客户端

### 4.1 配置管理

```typescript
export interface OpenAIConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export function getOpenAIConfig(): OpenAIConfig {
  const apiKey = process.env.OPENAI_API_KEY || ''
  const baseUrl = process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1'
  const model = process.env.OPENAI_MODEL || 'deepseek-v4-flash:cloud'
  return { apiKey, baseUrl, model }
}
```

### 4.2 工具格式转换

```typescript
export function toolsToOpenAIFormat(tools: Tool[]): Array<Record<string, unknown>> {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }))
}
```

### 4.3 流式调用实现

```typescript
export async function* streamOpenAIAPI(params: {
  systemPrompt: string
  messages: Array<{ role: string; content: unknown }>
  tools: Tool[]
  model?: string
  signal?: AbortSignal
  maxTokens?: number
}): AsyncGenerator<OpenAIStreamChunk> {
  const config = getOpenAIConfig()
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`

  const body: OpenAIRequest = {
    model: params.model || config.model,
    messages: [
      { role: 'system', content: params.systemPrompt },
      ...messagesToOpenAIFormat(params.messages),
    ],
    tools: params.tools.length > 0 ? toolsToOpenAIFormat(params.tools) : undefined,
    stream: true,
    max_tokens: params.maxTokens ?? 32000,
    temperature: 0,
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: params.signal,
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`OpenAI API error ${response.status}: ${errText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') return
      try {
        const chunk = JSON.parse(data) as OpenAIStreamChunk
        yield chunk
      } catch {
        // 跳过解析失败的 chunk
      }
    }
  }
}
```

---

## 五、模型映射系统

### 5.1 映射表

```typescript
export const OPENAI_MODEL_MAP: Record<string, string> = {
  // Anthropic → OpenAI 映射
  'claude-sonnet-4-20250514': 'gpt-4o',
  'claude-opus-4-20250514': 'gpt-4o',
  
  // OpenAI 原生模型（透传）
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4-turbo': 'gpt-4-turbo',
  'gpt-3.5-turbo': 'gpt-3.5-turbo',
  o1: 'o1',
  'o3-mini': 'o3-mini',
  
  // Qwen 模型（透传）
  'qwen-max': 'qwen-max',
  'qwen-plus': 'qwen-plus',
  'qwen-turbo': 'qwen-turbo',
  'qwen-coder-plus': 'qwen-coder-plus',
}
```

### 5.2 映射函数

```typescript
export function resolveOpenAIModel(anthropicModel: string): string {
  return OPENAI_MODEL_MAP[anthropicModel] || anthropicModel
}
```

---

## 六、流式响应适配器

### 6.1 OpenAI → Anthropic 转换

```typescript
export async function* openAIToAnthropicStream(
  openAIStream: AsyncGenerator<OpenAIStreamChunk>,
): AsyncGenerator<BetaRawMessageStreamEvent> {
  for await (const chunk of openAIStream) {
    // 将 OpenAI 格式转换为 Anthropic 格式
    // 处理文本内容和工具调用
    yield convertOpenAIChunkToAnthropic(chunk)
  }
}
```

### 6.2 转换逻辑

| OpenAI 字段 | Anthropic 字段 | 说明 |
|-------------|----------------|------|
| `choices[0].delta.content` | `content[0].text` | 文本内容 |
| `choices[0].delta.tool_calls` | `content[0].tool_use` | 工具调用 |
| `choices[0].finish_reason` | `stop_reason` | 停止原因 |

---

## 七、模型管理

### 7.1 模型配置

```typescript
export const MODELS: Record<string, { maxTokens: number; displayName: string }> = {
  'claude-sonnet-4-20250514': { maxTokens: 128000, displayName: 'Claude Sonnet 4' },
  'claude-opus-4-20250514': { maxTokens: 200000, displayName: 'Claude Opus 4' },
  'claude-3-5-sonnet-20241022': { maxTokens: 8192, displayName: 'Claude 3.5 Sonnet' },
  'claude-3-5-haiku-20241022': { maxTokens: 8192, displayName: 'Claude 3.5 Haiku' },
  'deepseek-v4-pro:cloud': { maxTokens: 128000, displayName: 'DeepSeek V4 Pro' },
  'deepseek-v4-flash:cloud': { maxTokens: 128000, displayName: 'DeepSeek V4 Flash' },
  'deepseek-v4-pro': { maxTokens: 128000, displayName: 'DeepSeek V4 Pro (local)' },
  'deepseek-v4-flash': { maxTokens: 128000, displayName: 'DeepSeek V4 Flash (local)' },
  'qwen-max': { maxTokens: 32000, displayName: 'Qwen Max' },
  'qwen-plus': { maxTokens: 32000, displayName: 'Qwen Plus' },
  'qwen-turbo': { maxTokens: 32000, displayName: 'Qwen Turbo' },
  'qwen-coder-plus': { maxTokens: 32000, displayName: 'Qwen Coder Plus' },
}
```

### 7.2 模型别名

```typescript
export const MODEL_ALIASES: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-3-5-haiku-20241022',
  'sonnet-3.5': 'claude-3-5-sonnet-20241022',
  qwen: 'qwen-max',
  'qwen-max': 'qwen-max',
  'qwen-plus': 'qwen-plus',
  'qwen-turbo': 'qwen-turbo',
  'qwen-coder': 'qwen-coder-plus',
}
```

### 7.3 模型解析

```typescript
export function resolveModel(override?: string): string {
  const resolved = resolveModelAlias(
    override ??
      process.env.ANTHROPIC_MODEL ??
      process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ??
      process.env.ANTHROPIC_DEFAULT_OPUS_MODEL ??
      process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ??
      DEFAULT_MODEL,
  )
  if (MODELS[resolved]) return resolved
  return resolved  // 允许未知模型通过
}
```

---

## 八、环境变量配置

### 8.1 API 配置

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | - |
| `OPENAI_API_KEY` | OpenAI 兼容 API 密钥 | - |
| `OPENAI_BASE_URL` | OpenAI 兼容 API 地址 | `http://localhost:11434/v1` |
| `OPENAI_MODEL` | 默认 OpenAI 模型 | `deepseek-v4-flash:cloud` |
| `CLAUDE_CODE_USE_OPENAI` | 强制使用 OpenAI 模式 | - |
| `ANTHROPIC_BASE_URL` | 自定义 Anthropic 端点 | - |
| `ANTHROPIC_MODEL` | 默认模型 | `claude-sonnet-4-20250514` |

### 8.2 模型配置

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet 默认模型 | - |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Opus 默认模型 | - |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Haiku 默认模型 | - |

---

## 九、错误处理

### 9.1 重试机制

```typescript
export function isRetryableError(error: Error): boolean {
  const retryableCodes = [429, 500, 502, 503, 504]
  // 检查 HTTP 状态码
  if ('status' in error && retryableCodes.includes(error.status)) {
    return true
  }
  // 检查网络错误
  if (error.message.includes('fetch failed') || error.message.includes('ECONNRESET')) {
    return true
  }
  return false
}

export async function withRetry<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
  let lastError: Error | undefined
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (!isRetryableError(lastError)) throw error
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
    }
  }
  throw lastError!
}
```

### 9.2 错误类型

| 错误类型 | 处理方式 |
|----------|----------|
| API key 缺失 | 抛出明确错误提示 |
| HTTP 4xx | 直接返回错误 |
| HTTP 5xx / 网络错误 | 自动重试 |
| 流式解析错误 | 跳过错误 chunk |

---

## 十、扩展能力

### 10.1 添加新模型

1. 在 `src/utils/model/model.ts` 添加模型定义
2. 在 `src/utils/model/modelStrings.ts` 添加别名（可选）
3. 在 `src/services/api/openai/modelMap.ts` 添加映射（如果需要）

### 10.2 添加新 API 提供者

1. 创建新的 API 客户端
2. 在 `providers.ts` 中添加选择逻辑
3. 在 `claude.ts` 中添加调用分支

---

**文档版本**: v1.0  
**生成时间**: 2026-05-15