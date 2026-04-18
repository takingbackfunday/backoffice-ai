import { openrouterWithTools, openrouterStream, type ChatMessage, type ToolDefinition } from '@/lib/llm/openrouter'

export async function runToolLoop(opts: {
  messages: ChatMessage[]
  tools: ToolDefinition[]
  dispatchTool: (name: string, args: unknown) => Promise<string>
  model: string
  maxRounds: number
  onStatus: (message: string) => void
  onToken?: (text: string) => void
}): Promise<{ answer: string; toolsUsed: string[] }> {
  const toolsUsed: string[] = []

  for (let round = 0; round < opts.maxRounds; round++) {
    const response = await openrouterWithTools(opts.messages, opts.tools, opts.model)

    // Append assistant turn (with tool_calls if present).
    // When tool_calls are present, omit content entirely if it's null/empty —
    // some providers (Claude via Vertex) reject an empty-string content alongside tool_calls.
    const assistantMsg: Record<string, unknown> = { role: 'assistant' }
    if (response.content) assistantMsg.content = response.content
    if (response.tool_calls) assistantMsg.tool_calls = response.tool_calls
    if (!assistantMsg.content && !assistantMsg.tool_calls) assistantMsg.content = ''
    opts.messages.push(assistantMsg as unknown as ChatMessage)

    // No tool calls = final answer — stream it if onToken is provided
    if (!response.tool_calls || response.tool_calls.length === 0) {
      if (opts.onToken) {
        // Re-stream: pop the assistant message we just added and stream the final answer fresh
        opts.messages.pop()
        const answer = await openrouterStream(opts.messages, opts.model, opts.onToken)
        return { answer: answer.trim(), toolsUsed }
      }
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
  if (opts.onToken) {
    const answer = await openrouterStream(opts.messages, opts.model, opts.onToken)
    return { answer: answer.trim(), toolsUsed }
  }
  const final = await openrouterWithTools(opts.messages, [], opts.model)
  return { answer: (final.content ?? 'Unable to answer.').trim(), toolsUsed }
}
