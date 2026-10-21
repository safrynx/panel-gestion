(()=>{var a={};a.id=489,a.ids=[489],a.modules={261:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/app-paths")},3295:a=>{"use strict";a.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},3421:(a,b,c)=>{"use strict";Object.defineProperty(b,"I",{enumerable:!0,get:function(){return g}});let d=c(71237),e=c(55088),f=c(17679);async function g(a,b,c,g){if((0,d.isNodeNextResponse)(b)){var h;b.statusCode=c.status,b.statusMessage=c.statusText;let d=["set-cookie","www-authenticate","proxy-authenticate","vary"];null==(h=c.headers)||h.forEach((a,c)=>{if("x-middleware-set-cookie"!==c.toLowerCase())if("set-cookie"===c.toLowerCase())for(let d of(0,f.splitCookiesString)(a))b.appendHeader(c,d);else{let e=void 0!==b.getHeader(c);(d.includes(c.toLowerCase())||!e)&&b.appendHeader(c,a)}});let{originalResponse:i}=b;c.body&&"HEAD"!==a.method?await (0,e.pipeToNodeResponse)(c.body,i,g):i.end()}}},10846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},19121:a=>{"use strict";a.exports=require("next/dist/server/app-render/action-async-storage.external.js")},28562:a=>{"use strict";a.exports=import("@libsql/client/web")},28855:a=>{"use strict";a.exports=import("@libsql/client")},29294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")},33873:a=>{"use strict";a.exports=require("path")},44870:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},45552:(a,b,c)=>{"use strict";c.d(b,{FI:()=>h,Sl:()=>k,W5:()=>j,Zl:()=>i,bK:()=>l,mh:()=>m,tG:()=>g});var d=c(77598),e=c(87956);function f(a){return(0,d.createHmac)("sha256",function(){let a=process.env.SESSION_SECRET;if(!a||a.length<32)throw Error("SESSION_SECRET must be set and at least 32 characters long");return a}()).update(a).digest("base64url")}function g(a){let b=Math.floor(Date.now()/1e3),c={...a,issuedAt:b,expiresAt:b+28800,nonce:(0,d.randomBytes)(16).toString("base64url")},e=Buffer.from(JSON.stringify(c)).toString("base64url"),g=f(e);return`${e}.${g}`}function h(a){if(!a)return null;let b=a.lastIndexOf(".");if(b<=0)return null;let c=a.slice(0,b),e=a.slice(b+1);if(!function(a,b){let c=Buffer.from(a),e=Buffer.from(b);return c.length===e.length&&(0,d.timingSafeEqual)(c,e)}(f(c),e))return null;try{let a=JSON.parse(Buffer.from(c,"base64url").toString());if(!a.discordId||"number"!=typeof a.expiresAt||a.expiresAt<=Math.floor(Date.now()/1e3))return null;return a}catch{return null}}function i(){return(0,d.randomBytes)(24).toString("base64url")}let j="gtasun_session",k=28800;async function l(a){await e.db.run("INSERT INTO oauth_states (state) VALUES (?)",[a]),await e.db.run("DELETE FROM oauth_states WHERE created_at < datetime('now', '-15 minutes')")}async function m(a){if(!a)return!1;let{changes:b}=await e.db.run("DELETE FROM oauth_states WHERE state = ? AND created_at >= datetime('now', '-15 minutes')",[a]);return 1===b}},55511:a=>{"use strict";a.exports=require("crypto")},63033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},73024:a=>{"use strict";a.exports=require("node:fs")},73136:a=>{"use strict";a.exports=require("node:url")},76760:a=>{"use strict";a.exports=require("node:path")},77598:a=>{"use strict";a.exports=require("node:crypto")},78335:()=>{},79828:(a,b,c)=>{"use strict";c.r(b),c.d(b,{handler:()=>E,patchFetch:()=>D,routeModule:()=>z,serverHooks:()=>C,workAsyncStorage:()=>A,workUnitAsyncStorage:()=>B});var d={};c.r(d),c.d(d,{POST:()=>y,runtime:()=>x});var e=c(95736),f=c(9117),g=c(4044),h=c(39326),i=c(32324),j=c(261),k=c(54290),l=c(85328),m=c(38928),n=c(46595),o=c(3421),p=c(17679),q=c(41681),r=c(63446),s=c(86439),t=c(34679),u=c(51356),v=c(10641),w=c(45552);let x="nodejs";async function y(){let a=v.NextResponse.json({ok:!0});return a.cookies.set(w.W5,"",{httpOnly:!0,secure:!0,sameSite:"lax",maxAge:0,path:"/"}),a}let z=new e.AppRouteRouteModule({definition:{kind:f.RouteKind.APP_ROUTE,page:"/api/auth/logout/route",pathname:"/api/auth/logout",filename:"route",bundlePath:"app/api/auth/logout/route"},distDir:".next-verify",relativeProjectDir:"",resolvedPagePath:"C:\\Users\\anony\\Desktop\\Panel_Gestion_Staff\\site\\src\\app\\api\\auth\\logout\\route.ts",nextConfigOutput:"",userland:d}),{workAsyncStorage:A,workUnitAsyncStorage:B,serverHooks:C}=z;function D(){return(0,g.patchFetch)({workAsyncStorage:A,workUnitAsyncStorage:B})}async function E(a,b,c){var d;let e="/api/auth/logout/route";"/index"===e&&(e="/");let g=await z.prepare(a,b,{srcPage:e,multiZoneDraftMode:!1});if(!g)return b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve()),null;let{buildId:v,params:w,nextConfig:x,isDraftMode:y,prerenderManifest:A,routerServerContext:B,isOnDemandRevalidate:C,revalidateOnlyGenerated:D,resolvedPathname:E}=g,F=(0,j.normalizeAppPath)(e),G=!!A.routes[E]&&(z.isDev||(0,t.isRouteCacheOwner)(E,z.cacheOwner,A.routes[E])),H=!!(A.dynamicRoutes[F]||G);if(H&&!y){let a=A.dynamicRoutes[F];if(a&&!1===a.fallback&&!G)throw new s.NoFallbackError}let I=null;!H||z.isDev||y||(I="/index"===(I=E)?"/":I);let J=!0===z.isDev||!H,K=H&&!J,L=a.method||"GET",M=(0,i.getTracer)(),N=M.getActiveScopeSpan(),O={params:w,prerenderManifest:A,renderOpts:{experimental:{cacheComponents:!!x.experimental.cacheComponents,authInterrupts:!!x.experimental.authInterrupts},supportsDynamicResponse:J,incrementalCache:(0,h.getRequestMeta)(a,"incrementalCache"),cacheLifeProfiles:null==(d=x.experimental)?void 0:d.cacheLife,isRevalidate:K,waitUntil:c.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:void 0,onInstrumentationRequestError:(b,c,d)=>z.onRequestError(a,b,d,B)},sharedContext:{buildId:v}},P=new k.NodeNextRequest(a),Q=new k.NodeNextResponse(b),R=l.NextRequestAdapter.fromNodeNextRequest(P,(0,l.signalFromNodeResponse)(b));try{let d=async c=>z.handle(R,O).finally(()=>{if(!c)return;c.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let d=M.getRootSpanAttributes();if(!d)return;if(d.get("next.span_type")!==m.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${d.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=d.get("next.route");if(e){let a=`${L} ${e}`;c.setAttributes({"next.route":e,"http.route":e,"next.span_name":a}),c.updateName(a)}else c.updateName(`${L} ${a.url}`)}),g=async g=>{var i,j;let k=async({previousCacheEntry:f})=>{try{if(!(0,h.getRequestMeta)(a,"minimalMode")&&C&&D&&!f)return b.statusCode=404,b.setHeader("x-nextjs-cache","REVALIDATED"),b.end("This page could not be found"),null;let e=await d(g);a.fetchMetrics=O.renderOpts.fetchMetrics;let i=O.renderOpts.pendingWaitUntil;i&&c.waitUntil&&(c.waitUntil(i),i=void 0);let j=O.renderOpts.collectedTags;if(!H)return await (0,o.I)(P,Q,e,O.renderOpts.pendingWaitUntil),null;{let a=await e.blob(),b=(0,p.toNodeOutgoingHttpHeaders)(e.headers);j&&(b[r.NEXT_CACHE_TAGS_HEADER]=j),!b["content-type"]&&a.type&&(b["content-type"]=a.type);let c=void 0!==O.renderOpts.collectedRevalidate&&!(O.renderOpts.collectedRevalidate>=r.INFINITE_CACHE)&&O.renderOpts.collectedRevalidate,d=void 0===O.renderOpts.collectedExpire||O.renderOpts.collectedExpire>=r.INFINITE_CACHE?void 0:O.renderOpts.collectedExpire;return{value:{kind:u.CachedRouteKind.APP_ROUTE,status:e.status,body:Buffer.from(await a.arrayBuffer()),headers:b},cacheControl:{revalidate:c,expire:d}}}}catch(b){throw(null==f?void 0:f.isStale)&&await z.onRequestError(a,b,{routerKind:"App Router",routePath:e,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:K,isOnDemandRevalidate:C})},B),b}},l=await z.handleResponse({req:a,nextConfig:x,cacheKey:I,routeKind:f.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:A,isRoutePPREnabled:!1,isOnDemandRevalidate:C,revalidateOnlyGenerated:D,responseGenerator:k,waitUntil:c.waitUntil});if(!H)return null;if((null==l||null==(i=l.value)?void 0:i.kind)!==u.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(j=l.value)?void 0:j.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});(0,h.getRequestMeta)(a,"minimalMode")||b.setHeader("x-nextjs-cache",C?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),y&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return(0,h.getRequestMeta)(a,"minimalMode")&&H||m.delete(r.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||b.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,q.getCacheControlHeader)(l.cacheControl)),await (0,o.I)(P,Q,new Response(l.value.body,{headers:m,status:l.value.status||200})),null};N?await g(N):await M.withPropagatedContext(a.headers,()=>M.trace(m.BaseServerSpan.handleRequest,{spanName:`${L} ${a.url}`,kind:i.SpanKind.SERVER,attributes:{"http.method":L,"http.target":a.url}},g))}catch(b){if(b instanceof s.NoFallbackError||await z.onRequestError(a,b,{routerKind:"App Router",routePath:F,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:K,isOnDemandRevalidate:C})}),H)throw b;return await (0,o.I)(P,Q,new Response(null,{status:500})),null}}},86439:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external")},87956:(a,b,c)=>{"use strict";c.d(b,{db:()=>q,x:()=>p});var d=c(73024),e=c.n(d),f=c(76760),g=c.n(f),h=c(73136);let i=[{name:"001_base_tables",sql:`
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
  `);let b=new Set((await a.execute("SELECT name FROM schema_migrations")).rows.map(a=>String(a.name)));for(let c of i)if(!b.has(c.name))try{await a.batch([...c.sql.split(";").map(a=>a.trim()).filter(Boolean).map(a=>({sql:a,args:[]})),{sql:"INSERT INTO schema_migrations (name) VALUES (?)",args:[c.name]}],"write")}catch(b){if(0===(await a.execute({sql:"SELECT 1 FROM schema_migrations WHERE name = ?",args:[c.name]})).rows.length)throw b}}let k=globalThis;async function l(){let a=process.env.TURSO_DATABASE_URL;if(a){let{createClient:b}=await Promise.resolve().then(c.bind(c,28562));return b({url:a,authToken:process.env.TURSO_AUTH_TOKEN||void 0})}if(process.env.VERCEL)throw Error("TURSO_DATABASE_URL is not set. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the Vercel project's environment variables, then redeploy.");let{createClient:b}=await Promise.resolve().then(c.bind(c,28855));return b({url:function(){let a=process.env.DATABASE_PATH||"./data/gtasun.sqlite";if(":memory:"===a)return":memory:";let b=g().isAbsolute(a)?a:g().join(process.cwd(),a);return e().mkdirSync(g().dirname(b),{recursive:!0}),(0,h.pathToFileURL)(b).href}()})}function m(){return k.gtasunClient||(k.gtasunClient=l().catch(a=>{throw k.gtasunClient=void 0,a})),k.gtasunClient}function n(){return k.gtasunReady||(k.gtasunReady=m().then(a=>j(a)).catch(a=>{throw k.gtasunReady=void 0,a})),k.gtasunReady.then(m)}let o=a=>a.rows.map(b=>Object.fromEntries(a.columns.map((a,c)=>[a,b[c]])));function p(a,b){return{sql:a,args:b}}let q={async all(a,b){let c=await n();return o(await c.execute({sql:a,args:b??[]}))},get:async(a,b)=>(await q.all(a,b))[0],async run(a,b){let c=await n(),d=await c.execute({sql:a,args:b??[]});return{changes:d.rowsAffected,lastId:void 0===d.lastInsertRowid?null:Number(d.lastInsertRowid)}},async batch(a,b="write"){if(0===a.length)return[];let c=await n();return(await c.batch(a.map(a=>({sql:a.sql,args:a.args??[]})),b)).map(a=>({rows:o(a),changes:a.rowsAffected}))}}},95736:(a,b,c)=>{"use strict";a.exports=c(44870)},96487:()=>{}};var b=require("../../../../webpack-runtime.js");b.C(a);var c=b.X(0,[897,641],()=>b(b.s=79828));module.exports=c})();