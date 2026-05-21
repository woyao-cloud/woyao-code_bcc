import { EXECUTE_TOOL_NAME } from './constants.js'

export function getExecutePrompt(): string {
  return `${EXECUTE_TOOL_NAME} is a first-class core tool that invokes any discovered deferred tool.

How it works:
1. Use SearchExtraTools to discover available deferred tools
2. Call ${EXECUTE_TOOL_NAME} with the discovered tool name and parameters
3. ${EXECUTE_TOOL_NAME} delegates the call to the target tool and returns its result

Important:
- Only use ${EXECUTE_TOOL_NAME} for tools found via SearchExtraTools
- Core tools (Read, Write, Edit, Bash, Grep, Glob, etc.) are called directly
- If a tool is not found, you will receive an error suggesting SearchExtraTools`
}
