import { openrouterWithTools, type ChatMessage, type ToolDefinition } from '@/lib/llm/openrouter'

export async function runToolLoop(opts: {
  messages: ChatMessage[]
  tools: ToolDefinition[]
  dispatchTool: (name: string, args: unknown) => Promise<string>
  model: string
  maxRounds: number
  onStatus: (message: string) => void
}): Promise<{ answer: string; toolsUsed: string[] }> {
  const toolsUsed: string[] = []

  for (let round = 0; round < opts.maxRounds; round++) {
    const response = await openrouterWithTools(opts.messages, opts.tools, opts.model)

    // Append assistant turn (with tool_calls if present)
    opts.messages.push({
      role: 'assistant',
      content: response.content ?? '',
      ...(response.tool_calls
        ? { tool_calls: response.tool_calls } as unknown as Record<string, unknown>
        : {}),
    } as ChatMessage)

    // No tool calls = final answer
    if (!response.tool_calls || response.tool_calls.length === 0) {
      return { answer: (response.content ?? '').trim(), toolsUsed }
    }

    // Execute every tool call in this round
    for (const tc of response.tool_calls) {
      const toolName = tc.function.name
      let args: unknown
      try { args = JSON.parse(tc.function.arguments) } catch { args = {} }

      toolsUsed.push(toolName)
      console.log('[tool-loop] call', JSON.stringify({ round: round + 1, tool: toolName, args }))
      opts.onStatus(`Querying ${toolName.replace(/_/g, ' ')}…`)

      let result: string
      try {
        result = await opts.dispatchTool(toolName, args)
      } catch (e) {
        result = `Error: ${e instanceof Error ? e.message : String(e)}`
      }

      console.log('[tool-loop] result', JSON.stringify({ tool: toolName, resultLen: result.length }))
      opts.messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      })
    }
  }

  // Exceeded max rounds — force a final answer
  opts.onStatus('Composing answer…')
  opts.messages.push({
    role: 'user',
    content: 'Please give your final answer now based on the data you have gathered.',
  })
  const final = await openrouterWithTools(opts.messages, [], opts.model)
  return { answer: (final.content ?? 'Unable to answer.').trim(), toolsUsed }
}
