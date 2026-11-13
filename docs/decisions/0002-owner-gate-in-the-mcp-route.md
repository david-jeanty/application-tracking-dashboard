# 0002: The owner gate lives in the MCP route

**Context.** Every agent feature is for one account (`OWNER_USER_ID`). Other Interndex users must see no change, including in the list of tools their assistant is offered and the instructions it receives. The MCP library (`mcp-handler`) builds a new server per request but never tells the server's setup code who is calling.

**Decision.** The route keeps two handlers: `standard` (today's five tools and instructions, unchanged) and `agent` (the same plus the agent tools and instructions). After the access token is verified, the route sends the request to `agent` only if the user id matches `OWNER_USER_ID` (`lib/mcp/servers.ts`). Each agent tool checks the owner again before touching data, and row-level security limits every agent row to its owner. An unset or malformed `OWNER_USER_ID` means nobody is the owner.

**Alternatives.** Register the agent tools for everyone and refuse non-owners inside each tool (every student's assistant would see a dozen tools it can never use, and the instructions would change for everyone). A separate MCP endpoint for the agent (a second connector to set up and secure, and a second OAuth resource).

**Why.** It is the only option where other students see exactly what they saw before, byte for byte, which a test checks. Three layers (route, tool, database) mean one mistake cannot expose the agent or its data.
