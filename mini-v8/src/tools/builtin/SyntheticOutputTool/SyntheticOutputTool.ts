import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'

export const SyntheticOutputTool: Tool = {
  name: 'SyntheticOutput',
  description:
    'Produce structured output in a specific JSON format. Accepts a JSON Schema that defines the output format, and produces output matching that schema.',
  inputSchema: {
    type: 'object',
    properties: {
      json_schema: {
        type: 'object',
        description: 'JSON Schema that the output must conform to.',
      },
      output: {
        type: 'object',
        description: 'The output data that conforms to the schema.',
      },
    },
    required: ['json_schema', 'output'],
  },
  prompt:
    'SyntheticOutputTool produces structured JSON output. Provide a json_schema and output that matches it. Useful in non-interactive/headless mode for structured responses.',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const schema = input.json_schema as Record<string, unknown> | undefined
    const output = input.output as Record<string, unknown> | undefined

    if (!schema || !output) {
      return {
        content: 'Both json_schema and output are required.',
        success: false,
        error: 'Missing required fields',
      }
    }

    // Basic JSON Schema validation
    const errors = validateAgainstSchema(output, schema)
    if (errors.length > 0) {
      return {
        content: `Output does not match schema:\n${errors.join('\n')}`,
        success: false,
        error: 'Schema validation failed',
        metadata: { validationErrors: errors },
      }
    }

    return {
      content: JSON.stringify(output, null, 2),
      success: true,
      metadata: { schema },
    }
  },

  userFacingName: () => 'SyntheticOutput',
}

function validateAgainstSchema(
  data: Record<string, unknown>,
  schema: Record<string, unknown>,
): string[] {
  const errors: string[] = []

  // Check required fields
  const required = schema.required as string[] | undefined
  if (required) {
    for (const field of required) {
      if (
        !(field in data) ||
        data[field] === undefined ||
        data[field] === null
      ) {
        errors.push(`Missing required field: ${field}`)
      }
    }
  }

  // Check property types
  const properties = schema.properties as
    | Record<string, Record<string, unknown>>
    | undefined
  if (properties) {
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in data && data[key] !== undefined) {
        const value = data[key]
        const expectedType = propSchema.type as string | undefined

        if (expectedType === 'string' && typeof value !== 'string') {
          errors.push(`Field "${key}" expected string, got ${typeof value}`)
        } else if (expectedType === 'number' && typeof value !== 'number') {
          errors.push(`Field "${key}" expected number, got ${typeof value}`)
        } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Field "${key}" expected boolean, got ${typeof value}`)
        } else if (
          expectedType === 'object' &&
          (typeof value !== 'object' || Array.isArray(value))
        ) {
          errors.push(`Field "${key}" expected object, got ${typeof value}`)
        } else if (expectedType === 'array' && !Array.isArray(value)) {
          errors.push(`Field "${key}" expected array, got ${typeof value}`)
        }
      }
    }
  }

  return errors
}
