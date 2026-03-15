import { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const root = request.nextUrl.searchParams.get("root");
  if (!root) return Response.json({ error: "No root specified" }, { status: 400 });

  // Expand ~ to home dir
  const expanded = root.startsWith("~") ? path.join(os.homedir(), root.slice(1)) : root;

  if (!fs.existsSync(expanded) || !fs.statSync(expanded).isDirectory()) {
    return Response.json({ error: "Path not found or not a directory" }, { status: 404 });
  }

  try {
    const entries = fs.readdirSync(expanded, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
      .map((e) => ({
        name: e.name,
        path: path.join(expanded, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return Response.json({ dirs, root: expanded });
  } catch {
    return Response.json({ error: "Could not read directory" }, { status: 500 });
  }
}
