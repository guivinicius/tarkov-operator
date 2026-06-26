# Agent Tools & Memory — Design Spec

## Problem

The current pipeline is linear: STT → RAG context injection → LLM → TTS. The LLM gets whatever game data the RAG search happens to find, but cannot actively look things up, chain queries, or remember the user between sessions.

## Architecture

### Before (current)
```
processPipeline → rag.search() → append context to system prompt → llm.ask() → TTS
```

### After
```
processPipeline → agent.process(userText)
                      │
                  LLM (with tool definitions)
                      │
                  ┌───┴───┐
                  │       │
            tool_call  response text
                  │       │
           execute handler │
           feed result ────┘
                      │
                  final text → TTS
```

Replaces the direct `rag.search()` + `llm.ask()` call in `main.js` with a single `agent.process()` call that owns the orchestration loop.

## Agent Loop (`src/agent.js`)

New module wrapping `llm.ask()` with tool dispatch.

```
async function process(userText, opts)
  1. Load settings, build tool schemas from registry
  2. Build messages: system prompt + memory profile + RAG context + history + user text
  3. Call LLM (with tools array)
  4. If response has tool_calls:
     a. For each tool_call: look up handler → parse args → execute → collect result
     b. Push tool role messages with results
     c. Call LLM again (max 5 rounds)
  5. If response is text: push user+assistant to conversation history, return text
  6. If Ollama/local provider: skip tools, inject RAG context into system prompt (current behavior)
```

Max 5 iterations to prevent runaway loops.

## Tools

Each tool has a JSON schema (name, description, parameters) and a handler function. Registered in `src/tools/index.js`.

### Tool catalog

| Tool | Schema description | Handler |
|---|---|---|
| `lookup_item` | `{ query: string }` — FTS5 item search by name/category | `tools/lookup-item.js` |
| `search_quests` | `{ query: string }` — FTS5 quest search | `tools/search-quests.js` |
| `get_map_info` | `{ map_name: string }` — map description, enemies, raid duration | `tools/get-map-info.js` |
| `get_hideout_requirements` | `{ module_name: string, level: integer }` — material requirements | `tools/get-hideout-reqs.js` |
| `remember_fact` | `{ key: string, value: string }` — save persistent fact | `tools/user-memory.js` |
| `recall_fact` | `{ key: string }` — retrieve persistent fact | `tools/user-memory.js` |

### Handler signature

Each handler is an async function `(args) => string`. Returns a plain text result that gets sent back to the LLM as a `tool` role message.

### llm.js tool interface

`llm.ask()` gains an optional `tools` parameter (array of tool schemas). When provided, the OpenAI client call includes them. The response object includes:
- `text` — assistant content text (empty string if tool_calls present)
- `toolCalls` — raw tool_call array from the response (null if none)
- `finishReason` — "tool_calls" or "stop"

`agent.js` checks `finishReason === "tool_calls"` to decide whether to dispatch tools or finalize.

### Fallback (non-tool-calling LLMs)

If the provider is Ollama or any model that doesn't return `tool_calls`, the agent falls back to the current approach: RAG context is injected directly into the system prompt, no tool loop.

## Memory

Two layers:

### Session memory

Existing `conversationHistory` in `llm.js`. Extended to include `tool` and `tool_result` role messages so the LLM can reference earlier lookups.

### Persistent memory (`user_memory` table)

Stored in the existing `tarkov-data.db`:

```sql
CREATE TABLE IF NOT EXISTS user_memory (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

API in `data-store.js`:
- `setMemory(key, value)` — upsert
- `getMemory(key)` — read by key
- `getAllMemory()` — entire table
- `deleteMemory(key)` — remove by key
- `clearMemory()` — wipe table

On agent start, all rows from `user_memory` are loaded into the system prompt:
```
[USER PROFILE]
key: value
...
[/USER PROFILE]
```

### UI (Settings window — new tab)

New "Memory" tab in the settings window with:
- A table showing all key/value pairs with timestamps
- Inline edit (click value to edit)
- Delete button per row
- "Clear All" button

### IPC API additions (`preload.js`)

| Method | Returns | Description |
|---|---|---|
| `getMemory()` | `{key, value, updated_at}[]` | All facts |
| `setMemory(key, value)` | `{ ok }` | Upsert fact |
| `deleteMemory(key)` | `{ ok }` | Remove fact |
| `clearMemory()` | `{ ok }` | Wipe all |

## Files changed

| File | Change |
|---|---|
| `src/agent.js` | **New** — agent loop, tool dispatch, iteration cap |
| `src/tools/index.js` | **New** — tool registry (schema + handler map) |
| `src/tools/lookup-item.js` | **New** — item FTS5 handler |
| `src/tools/search-quests.js` | **New** — quest FTS5 handler |
| `src/tools/get-map-info.js` | **New** — map FTS5 handler |
| `src/tools/get-hideout-reqs.js` | **New** — hideout FTS5 handler |
| `src/tools/user-memory.js` | **New** — remember/recall handlers |
| `src/data-store.js` | **Modified** — add user_memory table + CRUD |
| `src/llm.js` | **Modified** — support tool role messages in history, `askWithTools()` |
| `src/main.js` | **Modified** — swap rag.search+llm.ask for agent.process, add memory IPC |
| `src/preload.js` | **Modified** — expose memory IPC methods |
| `src/renderer/index.html` | **Modified** — add Memory tab panel |
| `src/renderer/app.js` | **Modified** — Memory tab logic |
| `src/renderer/styles.css` | **Modified** — memory table styles |
| `src/rag.js` | **Kept** — still used for proactive context injection |

## Key design decisions

- **Tools return plain text**, not structured data. Simpler for the LLM to consume, and avoids serialization complexity.
- **Max 5 iterations** prevents runaway loops. If the LLM keeps calling tools without producing a response, the agent returns the last tool result as a fallback text.
- **User memory is free-form key/value**. The LLM decides what to name and store. No rigid schema, no validation. The editable UI makes debugging and correction easy.
- **Ollama fallback** reuses existing RAG injection. No tool calling for local models — keeps it simple.
- **RAG context is still injected proactively** in addition to tools. The agent still searches game data on every query and includes it in the system prompt. Tools supplement this by letting the LLM request *specific* lookups.
