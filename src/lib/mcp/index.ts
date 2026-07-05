import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import getMyProfileTool from "./tools/get-my-profile";
import listMyClassesTool from "./tools/list-my-classes";

// The OAuth issuer MUST be the direct Supabase host (not the .lovable.cloud proxy).
// Build it from the project ref that Vite inlines at build time so the entry stays
// import-safe (no runtime env reads at module top level).
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "arasa-plus-mcp",
  title: "Arasa A+ MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Arasa A+ learning platform. Use `echo` to verify connectivity. " +
    "`get_my_profile` returns the signed-in user's profile and roles. " +
    "`list_my_classes` returns the classes the signed-in user is enrolled in or teaches. " +
    "All data-access tools respect row-level security and act as the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, getMyProfileTool, listMyClassesTool],
});
