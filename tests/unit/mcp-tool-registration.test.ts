import { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { saveJobInputSchema, updateJobInputSchema } from "@/lib/validation/mcp";

/**
 * Registration converts each tool's Zod schema into the JSON Schema Claude
 * reads. A schema that cannot convert fails here rather than on a live
 * connector, where the whole server would stop listing tools.
 */
function registerTools() {
  const server = new McpServer({ name: "jobtrack", version: "0.1.0" });

  server.registerTool(
    "save_job",
    { description: "Saves a job.", inputSchema: saveJobInputSchema },
    async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
  );
  server.registerTool(
    "update_job",
    { description: "Updates a job.", inputSchema: updateJobInputSchema },
    async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
  );

  return server;
}

describe("MCP tool registration", () => {
  it("registers both tools without a schema conversion failure", () => {
    expect(() => registerTools()).not.toThrow();
  });

  it("advertises update_job with its application id required", () => {
    const schema = registerTools().toolInputSchemaJson("update_job") as {
      properties: Record<string, unknown>;
      required?: string[];
    };

    expect(Object.keys(schema.properties)).toContain("application_id");
    expect(schema.required).toEqual(["application_id"]);
  });

  it("advertises no user_id on either tool", () => {
    const server = registerTools();

    for (const tool of ["save_job", "update_job"]) {
      const schema = server.toolInputSchemaJson(tool) as {
        properties: Record<string, unknown>;
      };
      expect(Object.keys(schema.properties)).not.toContain("user_id");
    }
  });

  it("advertises the full status vocabulary on update_job", () => {
    const schema = registerTools().toolInputSchemaJson("update_job") as {
      properties: { status?: { enum?: string[] } };
    };

    expect(schema.properties.status?.enum).toContain("Interview");
    expect(schema.properties.status?.enum).toContain("Applied");
    expect(schema.properties.status?.enum).toHaveLength(10);
  });
});
