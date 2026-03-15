import { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const dynamic = "force-dynamic";

export interface Skill {
  name: string;
  slug: string;
  description: string;
  source: "global" | "project";
  path: string;
}

function readSkillsFromDir(dir: string, source: "global" | "project"): Skill[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const filePath = path.join(dir, f);
        const slug = f.replace(/\.md$/, "");
        let description = slug;
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          // Try to extract H1 header or first non-empty line
          const h1 = content.match(/^#\s+(.+)/m);
          const desc = content.match(/^(?!#|\s*$)(.+)/m);
          description = h1 ? h1[1].trim() : desc ? desc[1].trim().slice(0, 100) : slug;
        } catch {}
        return { name: slug, slug, description, source, path: filePath };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const cwd = request.nextUrl.searchParams.get("cwd") ?? "";

  const globalDir = path.join(os.homedir(), ".claude", "commands");
  const projectDir = cwd ? path.join(cwd, ".claude", "commands") : "";

  const globalSkills = readSkillsFromDir(globalDir, "global");
  const projectSkills = projectDir ? readSkillsFromDir(projectDir, "project") : [];

  // Project skills take precedence (appear first)
  return Response.json({ skills: [...projectSkills, ...globalSkills] });
}
