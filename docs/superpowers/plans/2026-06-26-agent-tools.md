# Agent Tools & Memory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace linear STT→RAG→LLM→TTS pipeline with an agent loop that supports native tool calling (lookup items, quests, maps, hideout, user memory) and persistent user memory across sessions.

**Architecture:** New `agent.js` wraps `llm.ask()` with tool dispatch. Tools are registered in `src/tools/index.js` with JSON schemas for OpenAI-compatible function calling. Persistent memory stored in SQLite `user_memory` table, editable from new Memory tab in settings UI.

**Tech Stack:** Electron, OpenAI SDK (tool calling), better-sqlite3

## Global Constraints

- No test framework — manual smoke test via `npm start`
- All tool handlers return plain text strings
- Max 5 iterations in agent loop
- Ollama fallback: skip tools, use existing RAG injection
- Tool schemas must match OpenAI function-calling format

---

### Task 1: data-store.js — user_memory table

**Files:**
- Modify: `src/data-store.js`

**Interfaces:**
- Produces: `setMemory(key, value)`, `getMemory(key)`, `getAllMemory()`, `deleteMemory(key)`, `clearMemory()`

- [ ] **Step 1: Add user_memory table to createTables()**

```js
db.exec(`
  CREATE TABLE IF NOT EXISTS user_memory (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);
```

Add after the `meta` table creation, inside `createTables()`.

- [ ] **Step 2: Add memory CRUD methods**

```js
function setMemory(key, value) {
  db.prepare(
    "INSERT OR REPLACE INTO user_memory (key, value, updated_at) VALUES (?, ?, datetime('now'))"
  ).run(key, value);
}

function getMemory(key) {
  const row = db.prepare("SELECT value, updated_at FROM user_memory WHERE key = ?").get(key);
  return row || null;
}

function getAllMemory() {
  return db.prepare("SELECT key, value, updated_at FROM user_memory ORDER BY updated_at DESC").all();
}

function deleteMemory(key) {
  db.prepare("DELETE FROM user_memory WHERE key = ?").run(key);
}

function clearMemory() {
  db.prepare("DELETE FROM user_memory").run();
}
```

- [ ] **Step 3: Export new methods**

Append to `module.exports`:
```js
setMemory, getMemory, getAllMemory, deleteMemory, clearMemory
```

- [ ] **Step 4: Verify**

Run: `node -e "require('./src/data-store')"` — no errors.

- [ ] **Step 5: Commit**

```bash
git add src/data-store.js
git commit -m "feat: add user_memory table and CRUD methods to data-store"
```

---

### Task 2: llm.js — tool calling support

**Files:**
- Modify: `src/llm.js`

**Interfaces:**
- Consumes: OpenAI SDK (already imported)
- Produces: `ask(userMessage, opts)` gains support for `opts.tools` array. Response includes `toolCalls` and `finishReason`. Conversation history stores tool role messages.

- [ ] **Step 1: Add tool message types to conversationHistory**

The `conversationHistory` array currently stores `{role, content}` pairs. It must also store:
- `{role: "assistant", content: "", tool_calls: [...]}`
- `{role: "tool", content: resultString, tool_call_id: id}`

No code change needed for the array itself — just ensure the push logic handles these shapes.

- [ ] **Step 2: Modify ask() to accept and pass tools**

Replace the `client.chat.completions.create()` call with:

```js
const completionOpts = {
  model,
  messages,
  max_tokens: 500,
  temperature: 0.7,
};

if (opts.tools && opts.tools.length > 0) {
  completionOpts.tools = opts.tools;
  completionOpts.tool_choice = "auto";
}

const response = await client.chat.completions.create(completionOpts);
```

- [ ] **Step 3: Parse tool_calls from response**

After getting the response, check for tool calls:

```js
const choice = response.choices?.[0];
const rawContent = choice?.message?.content || "";
const text = rawContent.trim();
const toolCalls = choice?.message?.tool_calls || null;
const finishReason = choice?.finish_reason || "unknown";
```

- [ ] **Step 4: Store assistant message with tool_calls in history**

Replace the current history push:

```js
if (toolCalls && toolCalls.length > 0) {
  conversationHistory.push({
    role: "assistant",
    content: rawContent,
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      type: "function",
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    })),
  });
} else {
  conversationHistory.push(
    { role: "user", content: userMessage },
    { role: "assistant", content: text },
  );
}
```

- [ ] **Step 5: Update return object**

```js
return {
  text,
  raw: rawContent,
  toolCalls,
  finishReason,
  latency,
  model: response.model || model,
  promptTokens: usage.prompt_tokens || 0,
  completionTokens: usage.completion_tokens || 0,
};
```

- [ ] **Step 6: Add pushToolResult() helper for agent.js**

```js
function pushToolResult(toolCallId, content) {
  conversationHistory.push({
    role: "tool",
    content,
    tool_call_id: toolCallId,
  });
}
```

Export it:
```js
module.exports = { ask, newSession, pushToolResult };
```

- [ ] **Step 7: Verify**

Run: `node -e "require('./src/llm.js')"` — no errors.

- [ ] **Step 8: Commit**

```bash
git add src/llm.js
git commit -m "feat: add tool calling support to llm.ask()"
```

---

### Task 3: Tool handlers + registry

**Files:**
- Create: `src/tools/index.js`
- Create: `src/tools/lookup-item.js`
- Create: `src/tools/search-quests.js`
- Create: `src/tools/get-map-info.js`
- Create: `src/tools/get-hideout-reqs.js`
- Create: `src/tools/user-memory.js`

**Interfaces:**
- Consumes: `dataStore.fullTextSearch()`, `dataStore.setMemory()`, `dataStore.getMemory()`
- Produces: Each handler is `async (args) => string`. Registry maps tool name → `{schema, handler}`.

- [ ] **Step 1: Create `src/tools/lookup-item.js`**

```js
const dataStore = require("../data-store");

const schema = {
  name: "lookup_item",
  description: "Search for items in Tarkov by name, short name, or category. Returns price, category, and description.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search term — item name, short name, or category" },
    },
    required: ["query"],
  },
};

async function handler(args) {
  const results = dataStore.fullTextSearch(args.query, 5);
  const items = results.filter((r) => r.type === "item");
  if (items.length === 0) return "No items found.";
  return items.map((i) =>
    `${i.name} (${i.short_name}) — ${i.base_price}₽ — ${i.category}`
  ).join("\n");
}

module.exports = { schema, handler };
```

- [ ] **Step 2: Create `src/tools/search-quests.js`**

```js
const dataStore = require("../data-store");

const schema = {
  name: "search_quests",
  description: "Search for quests in Tarkov by name, trader, or objective keywords.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search term — quest name, trader, or objective" },
    },
    required: ["query"],
  },
};

async function handler(args) {
  const results = dataStore.fullTextSearch(args.query, 5);
  const quests = results.filter((r) => r.type === "quest");
  if (quests.length === 0) return "No quests found.";
  return quests.map((q) =>
    `${q.name} — ${q.objectives.slice(0, 200)}`
  ).join("\n");
}

module.exports = { schema, handler };
```

- [ ] **Step 3: Create `src/tools/get-map-info.js`**

```js
const dataStore = require("../data-store");

const schema = {
  name: "get_map_info",
  description: "Get raid information for a Tarkov map: description, enemies, raid duration.",
  parameters: {
    type: "object",
    properties: {
      map_name: { type: "string", description: "Map name (e.g. Customs, Woods, Factory)" },
    },
    required: ["map_name"],
  },
};

async function handler(args) {
  const results = dataStore.fullTextSearch(args.map_name, 3);
  const map = results.find((r) => r.type === "map");
  if (!map) return "Map not found.";
  return `${map.name}: ${map.description.slice(0, 300)} | Enemies: ${map.enemies}`;
}

module.exports = { schema, handler };
```

- [ ] **Step 4: Add `searchHideout()` to data-store.js**

`hideout_modules` has no FTS5 index, so add a LIKE-based search:

```js
function searchHideout(query) {
  const term = `%${query}%`;
  return db.prepare(
    "SELECT name, requirements FROM hideout_modules WHERE name LIKE ? LIMIT 5"
  ).all(term);
}
```

Export it in `module.exports`.

- [ ] **Step 5: Create `src/tools/get-hideout-reqs.js`**

```js
const dataStore = require("../data-store");

const schema = {
  name: "get_hideout_requirements",
  description: "Get material requirements for hideout module upgrades.",
  parameters: {
    type: "object",
    properties: {
      module_name: { type: "string", description: "Hideout module name (e.g. Workbench, Lavatory, Med Station)" },
    },
    required: ["module_name"],
  },
};

async function handler(args) {
  const rows = dataStore.searchHideout(args.module_name);
  if (rows.length === 0) return "No hideout modules found.";
  return rows.map((m) => `${m.name}: ${m.requirements}`).join("\n");
}

module.exports = { schema, handler };
```

- [ ] **Step 6: Create `src/tools/user-memory.js`**

```js
const dataStore = require("../data-store");

const rememberSchema = {
  name: "remember_fact",
  description: "Save a persistent fact about the Operator. Use for quest status, map preferences, playstyle, raid notes.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Fact name, e.g. current_quest, preferred_map, playstyle" },
      value: { type: "string", description: "Fact value" },
    },
    required: ["key", "value"],
  },
};

const recallSchema = {
  name: "recall_fact",
  description: "Retrieve a previously saved fact about the Operator.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Fact name to look up" },
    },
    required: ["key"],
  },
};

async function rememberHandler(args) {
  dataStore.setMemory(args.key, args.value);
  return `Saved: ${args.key} = ${args.value}`;
}

async function recallHandler(args) {
  const result = dataStore.getMemory(args.key);
  if (!result) return `No saved fact for "${args.key}".`;
  return `${args.key}: ${result.value} (saved ${result.updated_at})`;
}

module.exports = {
  remember: { schema: rememberSchema, handler: rememberHandler },
  recall: { schema: recallSchema, handler: recallHandler },
};
```

- [ ] **Step 7: Create `src/tools/index.js` — tool registry**

```js
const lookupItem = require("./lookup-item");
const searchQuests = require("./search-quests");
const getMapInfo = require("./get-map-info");
const getHideoutReqs = require("./get-hideout-reqs");
const userMemory = require("./user-memory");

const toolRegistry = {
  lookup_item: lookupItem,
  search_quests: searchQuests,
  get_map_info: getMapInfo,
  get_hideout_requirements: getHideoutReqs,
  remember_fact: userMemory.remember,
  recall_fact: userMemory.recall,
};

function getSchemas() {
  return Object.values(toolRegistry).map((t) => t.schema);
}

function getHandler(name) {
  return toolRegistry[name]?.handler || null;
}

module.exports = { getSchemas, getHandler };
```

- [ ] **Step 8: Verify**

Run: `node -e "const t = require('./src/tools'); console.log(t.getSchemas().length + ' tools')"` — outputs "6 tools".

- [ ] **Step 9: Commit**

```bash
git add src/data-store.js src/tools/
git commit -m "feat: add tool handlers and registry for item/quest/map/hideout/memory"
```

---

### Task 4: src/agent.js — agent loop

**Files:**
- Create: `src/agent.js`

**Interfaces:**
- Consumes: `llm.ask()`, `llm.pushToolResult()`, `tools.getSchemas()`, `tools.getHandler()`, `rag.search()`, `dataStore.getAllMemory()`, `settingsStore.load()`
- Produces: `process(userText, opts)` → `{text, model, promptTokens, completionTokens}`

- [ ] **Step 1: Create `src/agent.js`**

```js
const llm = require("./llm");
const tools = require("./tools/index");
const rag = require("./rag");
const dataStore = require("./data-store");
const settingsStore = require("./settings-store");

const MAX_ITERATIONS = 5;

async function process(userText, opts = {}) {
  const s = settingsStore.load();

  let ragContext = "";
  try {
    ragContext = await rag.search(userText);
  } catch {}

  let memoryProfile = "";
  try {
    const allMemory = dataStore.getAllMemory();
    if (allMemory.length > 0) {
      memoryProfile = "\n[USER PROFILE]\n" +
        allMemory.map((m) => `${m.key}: ${m.value}`).join("\n") +
        "\n[/USER PROFILE]\n";
    }
  } catch {}

  const isLocal = !opts.apiKey && (!opts.baseURL || opts.baseURL.includes("localhost"));
  const useTools = !isLocal && tools.getSchemas().length > 0;

  let systemPromptAppend = ragContext;
  if (memoryProfile) systemPromptAppend += memoryProfile;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const llmOpts = {
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      model: opts.model,
      systemPrompt: opts.systemPrompt,
      systemPromptAppend,
    };

    if (useTools) llmOpts.tools = tools.getSchemas();

    const result = await llm.ask(userText, llmOpts);

    if (result.finishReason === "tool_calls" && result.toolCalls) {
      for (const tc of result.toolCalls) {
        const handler = tools.getHandler(tc.function.name);
        if (handler) {
          try {
            const args = JSON.parse(tc.function.arguments);
            const output = await handler(args);
            llm.pushToolResult(tc.id, output);
          } catch (err) {
            llm.pushToolResult(tc.id, `Error: ${err.message}`);
          }
        } else {
          llm.pushToolResult(tc.id, `Unknown tool: ${tc.function.name}`);
        }
      }
      continue;
    }

    return {
      text: result.text,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    };
  }

  return {
    text: "Unable to complete request. Too many steps.",
    model: "unknown",
    promptTokens: 0,
    completionTokens: 0,
  };
}

module.exports = { process };
```

- [ ] **Step 2: Verify**

Run: `node -e "require('./src/agent')"` — no errors.

- [ ] **Step 3: Commit**

```bash
git add src/agent.js
git commit -m "feat: add agent loop with tool dispatch"
```

---

### Task 5: main.js + preload.js — pipeline swap, memory IPC, memory profile

**Files:**
- Modify: `src/main.js`
- Modify: `src/preload.js`

**Interfaces:**
- Consumes: `agent.process()`, `dataStore.setMemory/getMemory/getAllMemory/deleteMemory/clearMemory`
- Produces: IPC handlers `get-memory`, `set-memory`, `delete-memory`, `clear-memory`

- [ ] **Step 1: Replace pipeline in main.js**

In `main.js`, require `agent` at the top:
```js
const agent = require("./agent");
```

Replace the `rag.search()` + `llm.ask()` block in `processPipeline()` (lines 78-97) with:

```js
const agentResult = await agent.process(sttResult.text, {
  apiKey: llmApiKey(s),
  baseURL: s.LLM_BASE_URL,
  model: s.LLM_MODEL,
  systemPrompt: undefined, // agent.js uses default from llm.js
});
const wordCount = agentResult.text ? agentResult.text.split(/\s+/).length : 0;
log("info", `[llm] ${(Date.now() - tLlm) / 1000}s, ${wordCount} words, model=${agentResult.model}, pt=${agentResult.promptTokens} ct=${agentResult.completionTokens}`);
log("info", `[op] ${agentResult.text}`);
```

Remove the `ragContext` variable and the old `rag.search()` / `llm.ask()` blocks. The `rag.search()` call moves inside `agent.process()`.

- [ ] **Step 2: Add memory IPC handlers in main.js**

Add after the existing `clear-game-data` handler:

```js
ipcMain.handle("get-memory", () => {
  try { return dataStore.getAllMemory(); }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle("set-memory", (_event, key, value) => {
  try { dataStore.setMemory(key, value); return { ok: true }; }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle("delete-memory", (_event, key) => {
  try { dataStore.deleteMemory(key); return { ok: true }; }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle("clear-memory", () => {
  try { dataStore.clearMemory(); return { ok: true }; }
  catch (err) { return { error: err.message }; }
});
```

- [ ] **Step 3: Add preload.js methods**

```js
getMemory: () => ipcRenderer.invoke("get-memory"),
setMemory: (key, value) => ipcRenderer.invoke("set-memory", key, value),
deleteMemory: (key) => ipcRenderer.invoke("delete-memory", key),
clearMemory: () => ipcRenderer.invoke("clear-memory"),
```

Place them after `onDataUpdated` in the `contextBridge.exposeInMainWorld` object.

- [ ] **Step 4: Verify**

Run: `node -e "require('./src/main')"` — should error about Electron APIs in plain Node (expected). Check: `node -e "require('./src/agent')"` — no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/preload.js
git commit -m "feat: integrate agent pipeline, add memory IPC handlers"
```

---

### Task 6: Renderer — Memory tab

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Add Memory tab button to tab bar**

In `src/renderer/index.html`, add `Memory` button after `Logs`:

```html
<button class="tab" data-tab="memory">Memory</button>
```

- [ ] **Step 2: Add Memory tab panel**

Before the closing `</div>` of `#app`:

```html
<!-- Tab: Memory -->
<div id="tab-memory" class="tab-panel">
  <div class="card">
    <h2>User Memory</h2>
    <p class="hint" style="margin-bottom:8px">
      Persistent facts the agent remembers about you. Edit or delete as needed.
      The agent uses these facts to personalize responses.
    </p>
    <table id="memory-table">
      <thead>
        <tr><th>Key</th><th>Value</th><th>Saved</th><th></th></tr>
      </thead>
      <tbody id="memory-body"></tbody>
    </table>
    <div id="memory-empty" class="hint">No facts saved yet. Ask the operator to remember something.</div>
    <div id="memory-actions" style="margin-top:8px">
      <button id="clear-memory-btn" class="btn-sm">Clear All</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add Memory tab switching to switchTab() in app.js**

In the `switchTab` function, add:
```js
if (tabId === "memory") refreshMemory();
```

The `refreshMemory()` function replaces `refreshDataStatus` pattern — you'll define it in step 4.

- [ ] **Step 4: Add memory logic to app.js**

```js
async function refreshMemory() {
  const data = await window.operator.getMemory();
  const tbody = document.getElementById("memory-body");
  const empty = document.getElementById("memory-empty");
  const actions = document.getElementById("memory-actions");
  tbody.innerHTML = "";
  if (data.error || !data.length) {
    tbody.innerHTML = "";
    empty.style.display = "";
    actions.style.display = "none";
    return;
  }
  empty.style.display = "none";
  actions.style.display = "";
  for (const row of data) {
    const tr = document.createElement("tr");
    const keyTd = document.createElement("td");
    keyTd.textContent = row.key;
    const valTd = document.createElement("td");
    const valInput = document.createElement("input");
    valInput.type = "text";
    valInput.value = row.value;
    valInput.className = "memory-edit-input";
    valInput.dataset.key = row.key;
    valInput.dataset.originalValue = row.value;
    valInput.addEventListener("change", async () => {
      if (valInput.value !== valInput.dataset.originalValue) {
        await window.operator.setMemory(row.key, valInput.value);
        valInput.dataset.originalValue = valInput.value;
      }
    });
    valTd.appendChild(valInput);
    const timeTd = document.createElement("td");
    timeTd.className = "memory-time";
    timeTd.textContent = row.updated_at ? new Date(row.updated_at + "Z").toLocaleString() : "";
    const delTd = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.className = "btn-sm";
    delBtn.textContent = "✕";
    delBtn.addEventListener("click", async () => {
      await window.operator.deleteMemory(row.key);
      refreshMemory();
    });
    delTd.appendChild(delBtn);
    tr.appendChild(keyTd);
    tr.appendChild(valTd);
    tr.appendChild(timeTd);
    tr.appendChild(delTd);
    tbody.appendChild(tr);
  }
}

document.getElementById("clear-memory-btn").addEventListener("click", async () => {
  await window.operator.clearMemory();
  refreshMemory();
});
```

- [ ] **Step 5: Add Memory tab styles to styles.css**

```css
#memory-table {
  width: 100%;
  border-collapse: collapse;
}

#memory-table th {
  text-align: left;
  padding: 6px 8px;
  font-size: 0.8rem;
  color: #888;
  border-bottom: 1px solid #333;
}

#memory-table td {
  padding: 4px 8px;
  vertical-align: middle;
}

.memory-edit-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid #444;
  color: #ddd;
  width: 100%;
  font-size: 0.85rem;
  padding: 2px 4px;
}

.memory-edit-input:focus {
  border-bottom-color: #4caf50;
  outline: none;
}

.memory-time {
  font-size: 0.75rem;
  color: #666;
  white-space: nowrap;
}

#memory-empty {
  text-align: center;
  padding: 20px;
}
```

- [ ] **Step 6: Verify**

Run: `npm start` — Memory tab should appear in settings window, show/hide correctly, and allow inline editing and deletion of memory facts.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/
git commit -m "feat: add Memory tab for persistent fact management"
```<｜end▁of▁thinking｜>

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="edit">
<｜｜DSML｜｜parameter name="filePath" string="true">/Users/guivinicius/projects/tarkov-operator/docs/superpowers/plans/2026-06-26-agent-tools.md