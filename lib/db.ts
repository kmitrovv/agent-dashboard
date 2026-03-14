import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

const DB_DIR = path.join(os.homedir(), ".agent-dashboard");
const DB_PATH = path.join(DB_DIR, "history.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      session_id  TEXT PRIMARY KEY,
      agent_type  TEXT,
      prompt      TEXT,
      project_path TEXT,
      started_at  INTEGER NOT NULL,
      ended_at    INTEGER,
      cost_usd    REAL,
      status      TEXT DEFAULT 'running'
    );

    CREATE INDEX IF NOT EXISTS idx_app_sessions_project
      ON app_sessions(project_path);
    CREATE INDEX IF NOT EXISTS idx_app_sessions_started
      ON app_sessions(started_at DESC);
  `);
}

export interface AppSession {
  session_id: string;
  agent_type: string | null;
  prompt: string | null;
  project_path: string | null;
  started_at: number;
  ended_at: number | null;
  cost_usd: number | null;
  status: string;
}

export const db = {
  upsertSession(s: Omit<AppSession, "ended_at" | "cost_usd"> & { status: string }) {
    getDb()
      .prepare(
        `INSERT INTO app_sessions (session_id, agent_type, prompt, project_path, started_at, status)
         VALUES (@session_id, @agent_type, @prompt, @project_path, @started_at, @status)
         ON CONFLICT(session_id) DO UPDATE SET
           agent_type   = excluded.agent_type,
           prompt       = excluded.prompt,
           project_path = excluded.project_path,
           status       = excluded.status`
      )
      .run(s);
  },

  completeSession(session_id: string, cost_usd: number | null, status: string) {
    getDb()
      .prepare(
        `UPDATE app_sessions
         SET ended_at = ?, cost_usd = ?, status = ?
         WHERE session_id = ?`
      )
      .run(Date.now(), cost_usd ?? null, status, session_id);
  },

  getSession(session_id: string): AppSession | null {
    return (
      (getDb()
        .prepare("SELECT * FROM app_sessions WHERE session_id = ?")
        .get(session_id) as AppSession) ?? null
    );
  },

  listAppSessions(project_path?: string, limit = 100): AppSession[] {
    if (project_path) {
      return getDb()
        .prepare(
          "SELECT * FROM app_sessions WHERE project_path = ? ORDER BY started_at DESC LIMIT ?"
        )
        .all(project_path, limit) as AppSession[];
    }
    return getDb()
      .prepare("SELECT * FROM app_sessions ORDER BY started_at DESC LIMIT ?")
      .all(limit) as AppSession[];
  },
};
