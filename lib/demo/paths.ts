/**
 * Where a workspace surface links to.
 *
 * The authenticated workspace and the public demo render the same records with
 * the same components, and the only thing that differs is which routes those
 * components point at. Rather than duplicating the markup once per prefix, the
 * shared components take a base path and build their links through the helpers
 * below.
 *
 * A plain string, not a bag of functions: the shell and the sidebar are client
 * components, and a string crosses that boundary while a function does not.
 *
 * The empty string is the production workspace, so every existing call site
 * that passes nothing keeps producing exactly the URLs it produced before.
 */
export type WorkspaceBasePath = "" | "/demo";

export const DEMO_BASE_PATH = "/demo";

/**
 * The workspace's home.
 *
 * The one asymmetry: production's dashboard is `/dashboard`, and the demo's is
 * `/demo` itself. A `/demo/dashboard` would have been a second name for the
 * page a visitor already landed on.
 */
export function workspaceHomePath(base: WorkspaceBasePath = ""): string {
  return base === "" ? "/dashboard" : base;
}

export function applicationsPath(base: WorkspaceBasePath = ""): string {
  return `${base}/applications`;
}

export function applicationPath(
  id: string,
  base: WorkspaceBasePath = "",
): string {
  return `${base}/applications/${id}`;
}

export function pipelinePath(base: WorkspaceBasePath = ""): string {
  return `${base}/pipeline`;
}

export function analyticsPath(base: WorkspaceBasePath = ""): string {
  return `${base}/analytics`;
}
