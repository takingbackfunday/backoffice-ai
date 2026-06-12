# SSE Event Contract

Backoffice AI uses Server-Sent Events (SSE) for streaming AI responses. This document defines the event contract for all SSE endpoints.

## Endpoints

| Endpoint | Events | Notes |
|----------|--------|-------|
| `POST /api/agent/omni` | All event types | Full streaming agent |
| `GET /api/agent/rules` | Base four only | Rules suggestions |

## Event Types

### `session` (Omni only)
```json
{ "type": "session", "sessionId": "string", "turnCount": 0 }
```
Sent as the first event. Contains the session identifier and current conversation turn count.

### `status`
```json
{ "type": "status", "message": "Loading your data…" }
```
Italic status text shown above the streaming response. Indicates current activity (e.g., "Querying get_transactions…").

### `token`
```json
{ "type": "token", "text": "delta chunk" }
```
**Delta semantics**: Each `token` event carries a **delta chunk** — the incremental text added since the last token. The client must **append** this chunk to the accumulated message text.

Never sends the full accumulated text. The server accumulates internally but only emits the delta.

### `answer`
```json
{ "type": "answer", "answer": "complete final text" }
```
Sent after the stream is complete. Contains the full, final answer text. Useful for clients that may have missed tokens or need to verify the complete response.

### `done`
```json
{ "type": "done" }
```
Stream end marker. No more events will follow.

### `error`
```json
{ "type": "error", "error": "human-readable error message" }
```
Sent when the stream fails. The client should display the error and stop streaming.

### `action` (Omni only)
```json
{ "type": "action", "target": "invoice", "action": { /* editor action */ } }
```
Editor action dispatched client-side via `pageContext.dispatch`. Targets: `invoice`, `estimate`, `quote`.

### `link` (Omni only)
```json
{ "type": "link", "route": "/projects/abc/invoices", "anchor": "payments", "label": "View invoices", "reason": "…" }
```
Deep-link card rendered inline in the chat. The client appends it to the current assistant message.

## Client Handling Rules

1. **Append, don't replace**: For `token` events, append `event.text` to the accumulated message.
2. **Set directly on full-text events**: For `answer` events, replace the message content with `event.answer`.
3. **Status updates**: `status` events update the loading indicator. Clear it when the first `token` arrives.
4. **Error handling**: On `error`, stop the stream and display the error. Do not wait for `done`.
5. **Action dispatch**: Only dispatch `action` events if the editor is currently open (`pageContext.dispatch` exists). Otherwise, flag missed actions for display.

## Wire Format

```
data: {"type":"token","text":"Hello"}

data: {"type":"token","text":" world"}

data: {"type":"done"}

```

Each event is a single line prefixed with `data: `. Events are separated by double newlines (`\n\n`). The client should split on `\n\n` and parse each `data: ` line as JSON.

## Keep-alive

The server sends `: ping\n\n` every 5 seconds to prevent connection timeouts. Lines starting with `:` should be ignored by the client.
