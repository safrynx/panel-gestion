import type { Database } from "better-sqlite3";

/**
 * Retro-compatible schema migrations for the GTASUN staff manager.
 * Each migration runs once, tracked in a `schema_migrations` table.
 * Never drop or rename existing columns — additive changes only.
 */
export function runMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const isApplied = db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?");
  const record = db.prepare("INSERT INTO schema_migrations (name) VALUES (?)");

  const migrations: { name: string; sql: string }[] = [
    {
      name: "001_base_tables",
      sql: `
        CREATE TABLE IF NOT EXISTS staff_members (
          id TEXT PRIMARY KEY,
          discord_id TEXT NOT NULL UNIQUE,
          username TEXT NOT NULL,
          avatar_url TEXT,
          grade TEXT NOT NULL DEFAULT 'Helper',
          grade_level INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS activity_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_id TEXT NOT NULL,
          source TEXT NOT NULL CHECK(source IN ('discord_voice', 'fivem')),
          started_at TEXT NOT NULL,
          ended_at TEXT,
          seconds INTEGER NOT NULL DEFAULT 0,
          external_session_id TEXT UNIQUE
        );
        CREATE INDEX IF NOT EXISTS idx_activity_member_source ON activity_sessions(discord_id, source);
        CREATE TABLE IF NOT EXISTS staff_badges (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_id TEXT NOT NULL,
          color TEXT NOT NULL CHECK(color IN ('red','yellow','green','blue')),
          reason TEXT NOT NULL,
          author_discord_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          resolved_at TEXT
        );
        CREATE TABLE IF NOT EXISTS staff_notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_id TEXT NOT NULL,
          body TEXT NOT NULL,
          author_discord_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS grade_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_id TEXT NOT NULL,
          old_grade TEXT NOT NULL,
          new_grade TEXT NOT NULL,
          actor_discord_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor_discord_id TEXT NOT NULL,
          action TEXT NOT NULL,
          target_discord_id TEXT,
          details TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `
    },
    {
      name: "002_voice_sessions",
      sql: `
        CREATE TABLE IF NOT EXISTS voice_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          seconds INTEGER NOT NULL DEFAULT 0,
          reconciled INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_voice_member_open ON voice_sessions(discord_id, ended_at);
        CREATE INDEX IF NOT EXISTS idx_voice_started ON voice_sessions(started_at);
      `
    },
    {
      name: "003_staff_member_extensions",
      sql: `
        ALTER TABLE staff_members ADD COLUMN guild_joined_at TEXT;
        ALTER TABLE staff_members ADD COLUMN left_guild_at TEXT;
        ALTER TABLE staff_members ADD COLUMN roles_json TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE staff_members ADD COLUMN last_synced_at TEXT;
      `
    },
    {
      name: "004_sessions_origin",
      sql: `
        ALTER TABLE activity_sessions ADD COLUMN origin TEXT NOT NULL DEFAULT 'unknown';
      `
    },
    {
      name: "005_oauth_states",
      sql: `
        CREATE TABLE IF NOT EXISTS oauth_states (
          state TEXT PRIMARY KEY,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `
    },
    {
      name: "006_lookup_indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS idx_badges_member ON staff_badges(discord_id, status);
        CREATE INDEX IF NOT EXISTS idx_notes_member ON staff_notes(discord_id);
        CREATE INDEX IF NOT EXISTS idx_grade_history_member ON grade_history(discord_id);
      `
    },
    {
      name: "007_panel_access",
      sql: `
        CREATE TABLE IF NOT EXISTS panel_access (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kind TEXT NOT NULL CHECK(kind IN ('user','role')),
          discord_id TEXT NOT NULL,
          label TEXT,
          added_by TEXT NOT NULL DEFAULT 'system',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(kind, discord_id)
        );
        INSERT OR IGNORE INTO panel_access (kind, discord_id, label) VALUES
          ('role', '1557788967414407229', 'Rôle initial'),
          ('role', '1557788898497659012', 'Rôle initial'),
          ('user', '1243884102407422024', 'Accès initial'),
          ('user', '1130169424905785354', 'Accès initial');
      `
    },
    {
      name: "008_roles_warnings_playtime",
      sql: `
        CREATE TABLE IF NOT EXISTS discord_roles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          color INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS grade_roles (
          role_id TEXT PRIMARY KEY
        );
        CREATE TABLE IF NOT EXISTS warn_roles (
          level INTEGER PRIMARY KEY CHECK(level BETWEEN 1 AND 3),
          role_id TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS warnings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_id TEXT NOT NULL,
          level INTEGER NOT NULL,
          reason TEXT NOT NULL,
          author_discord_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          removed_at TEXT,
          removed_by TEXT,
          removed_reason TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_warnings_member ON warnings(discord_id, removed_at);
        CREATE TABLE IF NOT EXISTS playtime_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_id TEXT NOT NULL,
          seconds INTEGER NOT NULL,
          taken_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_snapshots_member ON playtime_snapshots(discord_id, taken_at);
      `
    },
    {
      name: "009_bot_status_note_authors",
      sql: `
        CREATE TABLE IF NOT EXISTS bot_status (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        ALTER TABLE staff_notes ADD COLUMN author_name TEXT;
      `
    },
    {
      name: "010_permissions_log_names",
      sql: `
        ALTER TABLE panel_access ADD COLUMN permissions TEXT;
        UPDATE panel_access SET permissions = '["view_report","rank_up","rank_down","rank_demote","set_grade","warn_add","warn_remove","comment","badges","sync"]';
        ALTER TABLE audit_log ADD COLUMN actor_name TEXT;
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(id DESC);
      `
    },
    {
      name: "011_weekly_reviews",
      sql: `
        CREATE TABLE IF NOT EXISTS weekly_reviews (
          week_start TEXT NOT NULL,
          discord_id TEXT NOT NULL,
          rating TEXT NOT NULL CHECK(rating IN ('red','yellow','green','blue')),
          summary TEXT NOT NULL,
          comments_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (week_start, discord_id)
        );
      `
    }
  ];

  for (const migration of migrations) {
    // IMMEDIATE takes the write lock first, so concurrent processes (next build workers,
    // web + bot) serialize here; the re-check inside prevents double-applying.
    db.transaction(() => {
      if (isApplied.get(migration.name)) return;
      db.exec(migration.sql);
      record.run(migration.name);
    }).immediate();
  }
}
