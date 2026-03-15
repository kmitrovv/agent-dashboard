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

function extractMeta(filePath: string, fallback: string): { name: string; description: string } {
  try {
    const content = fs.readFileSync(filePath, "utf-8");

    // 1. Try YAML frontmatter: ---\nname: "..."\ndescription: ...\n---
    const fmMatch = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---/);
    if (fmMatch) {
      const fm = fmMatch[1];

      // name: bare, quoted, or double-quoted on a single line
      const fmName = fm.match(/^name:\s*["']?([^"'\n]+?)["']?\s*$/m)?.[1]?.trim();

      // description: try block scalars (>-, >+, >, |-, |+, |) first
      let desc: string | undefined;
      const blockMatch = fm.match(/^description:\s*[>|][+-]?[ \t]*\r?\n((?:(?:[ \t]+[^\r\n]*)?\r?\n)+)/m);
      if (blockMatch) {
        desc = blockMatch[1]
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .join(" ")
          .slice(0, 200);
      } else {
        // inline / quoted value — only if it doesn't start with > or |
        const inlineMatch = fm.match(/^description:\s*(?![ \t]*[>|])["']?(.+?)["']?\s*$/m)?.[1]?.trim();
        desc = inlineMatch;
      }

      if (fmName || desc) {
        return { name: fmName || fallback, description: desc || fmName || fallback };
      }
    }

    // 2. Try markdown H1
    const h1 = content.match(/^#\s+(.+)/m);
    if (h1) {
      const name = h1[1].trim();
      const afterH1 = content.slice(content.indexOf(h1[0]) + h1[0].length).replace(/^\n+/, "");
      const body = afterH1.match(/^(?!#|\s*$)(.+)/m);
      return { name, description: body ? body[1].trim().slice(0, 200) : name };
    }

    // 3. Fallback: slug
    return { name: fallback, description: fallback };
  } catch {
    return { name: fallback, description: fallback };
  }
}

/**
 * Read skills from a directory. Handles three layouts:
 *   1. Flat .md files:         commands/my-skill.md
 *   2. Subdirectory + SKILL.md: commands/my-skill/SKILL.md  (or {name}.md / README.md)
 *   3. Same layout under .claude/skills/
 */
function readSkillsFromDir(dir: string, source: "global" | "project"): Skill[] {
  if (!fs.existsSync(dir)) return [];
  try {
    const skills: Skill[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Resolve symlinks: isDirectory() returns false for symlinks, so check manually
      let isDir = entry.isDirectory();
      if (!isDir && entry.isSymbolicLink()) {
        try {
          const resolved = fs.realpathSync(path.join(dir, entry.name));
          isDir = fs.statSync(resolved).isDirectory();
        } catch { /* broken symlink — skip */ }
      }

      if (isDir) {
        // Subdirectory (or symlink→dir) — look for SKILL.md, {name}.md, or README.md inside
        const subdir = path.join(dir, entry.name);
        const candidates = [
          path.join(subdir, "SKILL.md"),
          path.join(subdir, `${entry.name}.md`),
          path.join(subdir, "README.md"),
        ];
        const skillFile = candidates.find((f) => fs.existsSync(f));
        if (skillFile) {
          const slug = entry.name;
          const meta = extractMeta(skillFile, slug);
          skills.push({
            name: meta.name,
            slug,
            description: meta.description,
            source,
            path: skillFile,
          });
        }
      } else if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".md")) {
        // Flat .md file
        const filePath = path.join(dir, entry.name);
        const slug = entry.name.replace(/\.md$/, "");
        const meta = extractMeta(filePath, slug);
        skills.push({
          name: meta.name,
          slug,
          description: meta.description,
          source,
          path: filePath,
        });
      }
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  // Normalise: strip trailing slashes so path.join works predictably
  const rawCwd = request.nextUrl.searchParams.get("cwd") ?? "";
  const cwd = rawCwd.replace(/\/+$/, "");

  const globalCommandsDir = path.join(os.homedir(), ".claude", "commands");

  // Project: check both .claude/commands/ AND .claude/skills/
  const projectCommandsDir = cwd ? path.join(cwd, ".claude", "commands") : "";
  const projectSkillsDir   = cwd ? path.join(cwd, ".claude", "skills")   : "";

  const globalSkills = readSkillsFromDir(globalCommandsDir, "global");

  const rawProjectSkills = [
    ...(projectCommandsDir ? readSkillsFromDir(projectCommandsDir, "project") : []),
    ...(projectSkillsDir   ? readSkillsFromDir(projectSkillsDir,   "project") : []),
  ];
  // Deduplicate by slug (commands/ takes precedence)
  const seen = new Set<string>();
  const projectSkills: Skill[] = [];
  for (const s of rawProjectSkills) {
    if (!seen.has(s.slug)) { seen.add(s.slug); projectSkills.push(s); }
  }

  return Response.json({
    skills: [...projectSkills, ...globalSkills],
    paths: {
      projectCommands: projectCommandsDir || null,
      projectSkills:   projectSkillsDir   || null,
      global:          globalCommandsDir,
    },
  });
}
