"use strict";exports.id=604,exports.ids=[604],exports.modules={3440:(a,b,c)=>{c.d(b,{Jj:()=>d,MJ:()=>f,cv:()=>g,lp:()=>e});let d=[{key:"view_report",label:"Voir le bilan hebdo",group:"Consultation"},{key:"view_logs",label:"Voir les logs",group:"Consultation"},{key:"rank_up",label:"Up (monter d'un grade)",group:"Grades"},{key:"rank_down",label:"Down / Derank",group:"Grades"},{key:"rank_demote",label:"Demote (retirer du staff)",group:"Grades"},{key:"set_grade",label:"Choisir un grade pr\xe9cis",group:"Grades"},{key:"recruit",label:"Recruter du staff",group:"Grades"},{key:"warn_add",label:"Ajouter un avert",group:"Avertissements"},{key:"warn_remove",label:"Retirer un avert",group:"Avertissements"},{key:"comment",label:"\xc9crire des commentaires",group:"Suivi"},{key:"badges",label:"G\xe9rer les pastilles",group:"Suivi"},{key:"sync",label:"Synchroniser Discord",group:"Suivi"},{key:"run_review",label:"Lancer le bilan IA",group:"Suivi"},{key:"reset_counters",label:"Reset des compteurs",group:"Suivi"}],e=d.map(a=>a.key),f=["view_report","comment"];function g(a){if(!a)return f;try{let b=JSON.parse(a);if(!Array.isArray(b))return f;return b.filter(a=>e.includes(a))}catch{return f}}},52604:(a,b,c)=>{c.d(b,{ER:()=>v,Gv:()=>m,Im:()=>h,QY:()=>n,Ru:()=>w,T$:()=>s,U$:()=>o,VE:()=>x,YI:()=>r,Z:()=>p,Z9:()=>i,kw:()=>t,lU:()=>q,qc:()=>k,rV:()=>l,ze:()=>u});var d=c(87956),e=c(53702),f=c(3440);let g=null;function h(){g=null}async function i(){let a=Number(process.env.CONFIG_CACHE_MS??5e3);if(g&&Date.now()-g.at<a)return g;let[b,c,e,f]=await d.db.batch([{sql:"SELECT kind, discord_id, permissions FROM panel_access"},{sql:`SELECT g.role_id AS role_id, COALESCE(r.name, g.role_id) AS name, COALESCE(r.position, 0) AS position
              FROM grade_roles g LEFT JOIN discord_roles r ON r.id = g.role_id`},{sql:"SELECT level, role_id FROM warn_roles ORDER BY level"},{sql:"SELECT id, name FROM discord_roles"}],"read");return g={access:b.rows,gradeRows:c.rows,warnRows:e.rows,roles:f.rows,at:Date.now()}}function j(a){return(a||"").split(",").map(a=>a.trim()).filter(Boolean)}function k(){return j(process.env.PANEL_OWNER_IDS)}function l(a){return k().includes(a)}function m(a){let b=(0,e.j)(process.env.GRADE_ROLE_MAPPING_JSON);return b.length?b:[...a.gradeRows].sort((a,b)=>a.position-b.position||a.role_id.localeCompare(b.role_id)).map((a,b)=>({name:a.name,level:b+1,discordRoleId:a.role_id}))}function n(a){return[...new Set([...j(process.env.DISCORD_STAFF_ROLE_IDS),...m(a).map(a=>a.discordRoleId)])]}function o(a,b){let c=n(a);return b.some(a=>c.includes(a))}function p(a,b){let c=m(a).filter(a=>b.includes(a.discordRoleId)).sort((a,b)=>b.level-a.level);return c.length?{grade:c[0].name,gradeLevel:c[0].level,roleId:c[0].discordRoleId}:null}function q(a){if(a.warnRows.length)return a.warnRows.map(a=>({level:a.level,roleId:a.role_id}));let b=new Map;for(let c of a.roles){let a=/avert\w*\W*(?:n[°o]?\W*)?([1-3])\b/i.exec(c.name);a&&!b.has(Number(a[1]))&&b.set(Number(a[1]),c.id)}return[...b.entries()].sort((a,b)=>a[0]-b[0]).map(([a,b])=>({level:a,roleId:b}))}function r(a,b){let c=q(a);return c.length?c.filter(a=>b.includes(a.roleId)).reduce((a,b)=>Math.max(a,b.level),0):null}function s(a,b){return a.roles.find(a=>a.id===b)?.name??b}async function t(){return m(await i())}async function u(a){return p(await i(),a)}async function v(){return q(await i())}async function w(a,b){var c;return c=await i(),!!l(a)||c.access.some(c=>"user"===c.kind?c.discord_id===a:b.includes(c.discord_id))}async function x(a,b){var c=await i();if(l(a))return[...f.lp];let d=new Set;for(let e of c.access)("user"===e.kind?e.discord_id===a:b.includes(e.discord_id))&&(0,f.cv)(e.permissions).forEach(a=>d.add(a));return[...d]}},53702:(a,b,c)=>{function d(a,b,c,e=!1){return!!e||b<a&&c<a}function e(a){if(!a)return[];try{let b=JSON.parse(a);return Object.entries(b).filter(([,a])=>!!a.roleId&&Number.isFinite(a.level)).map(([a,b])=>({name:a,level:Number(b.level),discordRoleId:String(b.roleId)})).sort((a,b)=>a.level-b.level)}catch{return[]}}c.d(b,{j:()=>e,v:()=>d})},87956:(a,b,c)=>{c.d(b,{db:()=>q,x:()=>p});var d=c(73024),e=c.n(d),f=c(76760),g=c.n(f),h=c(73136);let i=[{name:"001_base_tables",sql:`
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
    `},{name:"002_voice_sessions",sql:`
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
    `},{name:"003_staff_member_extensions",sql:`
      ALTER TABLE staff_members ADD COLUMN guild_joined_at TEXT;
      ALTER TABLE staff_members ADD COLUMN left_guild_at TEXT;
      ALTER TABLE staff_members ADD COLUMN roles_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE staff_members ADD COLUMN last_synced_at TEXT;
    `},{name:"004_sessions_origin",sql:`
      ALTER TABLE activity_sessions ADD COLUMN origin TEXT NOT NULL DEFAULT 'unknown';
    `},{name:"005_oauth_states",sql:`
      CREATE TABLE IF NOT EXISTS oauth_states (
        state TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `},{name:"006_lookup_indexes",sql:`
      CREATE INDEX IF NOT EXISTS idx_badges_member ON staff_badges(discord_id, status);
      CREATE INDEX IF NOT EXISTS idx_notes_member ON staff_notes(discord_id);
      CREATE INDEX IF NOT EXISTS idx_grade_history_member ON grade_history(discord_id);
    `},{name:"007_panel_access",sql:`
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
        ('role', '1557788967414407229', 'R\xf4le initial'),
        ('role', '1557788898497659012', 'R\xf4le initial'),
        ('user', '1243884102407422024', 'Acc\xe8s initial'),
        ('user', '1130169424905785354', 'Acc\xe8s initial');
    `},{name:"008_roles_warnings_playtime",sql:`
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
    `},{name:"009_bot_status_note_authors",sql:`
      CREATE TABLE IF NOT EXISTS bot_status (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      ALTER TABLE staff_notes ADD COLUMN author_name TEXT;
    `},{name:"010_permissions_log_names",sql:`
      ALTER TABLE panel_access ADD COLUMN permissions TEXT;
      UPDATE panel_access SET permissions = '["view_report","rank_up","rank_down","rank_demote","set_grade","warn_add","warn_remove","comment","badges","sync"]';
      ALTER TABLE audit_log ADD COLUMN actor_name TEXT;
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(id DESC);
    `},{name:"011_weekly_reviews",sql:`
      CREATE TABLE IF NOT EXISTS weekly_reviews (
        week_start TEXT NOT NULL,
        discord_id TEXT NOT NULL,
        rating TEXT NOT NULL CHECK(rating IN ('red','yellow','green','blue')),
        summary TEXT NOT NULL,
        comments_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (week_start, discord_id)
      );
    `},{name:"012_playtime_totals",sql:`
      CREATE TABLE IF NOT EXISTS playtime_totals (
        discord_id TEXT PRIMARY KEY,
        seconds INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
    `}];async function j(a){await a.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);let b=new Set((await a.execute("SELECT name FROM schema_migrations")).rows.map(a=>String(a.name)));for(let c of i)if(!b.has(c.name))try{await a.batch([...c.sql.split(";").map(a=>a.trim()).filter(Boolean).map(a=>({sql:a,args:[]})),{sql:"INSERT INTO schema_migrations (name) VALUES (?)",args:[c.name]}],"write")}catch(b){if(0===(await a.execute({sql:"SELECT 1 FROM schema_migrations WHERE name = ?",args:[c.name]})).rows.length)throw b}}let k=globalThis;async function l(){let a=process.env.TURSO_DATABASE_URL;if(a){let{createClient:b}=await Promise.resolve().then(c.bind(c,28562));return b({url:a,authToken:process.env.TURSO_AUTH_TOKEN||void 0})}if(process.env.VERCEL)throw Error("TURSO_DATABASE_URL is not set. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the Vercel project's environment variables, then redeploy.");let{createClient:b}=await Promise.resolve().then(c.bind(c,28855));return b({url:function(){let a=process.env.DATABASE_PATH||"./data/gtasun.sqlite";if(":memory:"===a)return":memory:";let b=g().isAbsolute(a)?a:g().join(process.cwd(),a);return e().mkdirSync(g().dirname(b),{recursive:!0}),(0,h.pathToFileURL)(b).href}()})}function m(){return k.gtasunClient||(k.gtasunClient=l().catch(a=>{throw k.gtasunClient=void 0,a})),k.gtasunClient}function n(){return k.gtasunReady||(k.gtasunReady=m().then(a=>j(a)).catch(a=>{throw k.gtasunReady=void 0,a})),k.gtasunReady.then(m)}let o=a=>a.rows.map(b=>Object.fromEntries(a.columns.map((a,c)=>[a,b[c]])));function p(a,b){return{sql:a,args:b}}let q={async all(a,b){let c=await n();return o(await c.execute({sql:a,args:b??[]}))},get:async(a,b)=>(await q.all(a,b))[0],async run(a,b){let c=await n(),d=await c.execute({sql:a,args:b??[]});return{changes:d.rowsAffected,lastId:void 0===d.lastInsertRowid?null:Number(d.lastInsertRowid)}},async batch(a,b="write"){if(0===a.length)return[];let c=await n();return(await c.batch(a.map(a=>({sql:a.sql,args:a.args??[]})),b)).map(a=>({rows:o(a),changes:a.rowsAffected}))}}}};