(()=>{var a={};a.id=415,a.ids=[415],a.modules={261:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/app-paths")},3295:a=>{"use strict";a.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},10846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},13658:(a,b,c)=>{"use strict";c.d(b,{Mj:()=>k,ql:()=>m,qn:()=>j,xY:()=>l});let d={Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6};function e(a,b=process.env.APP_TIMEZONE||"Europe/Paris"){let c=new Intl.DateTimeFormat("en-US",{timeZone:b,hourCycle:"h23",year:"numeric",month:"numeric",day:"numeric",hour:"numeric",minute:"numeric",weekday:"short"}).formatToParts(a),f=a=>c.find(b=>b.type===a)?.value??"";return{year:Number(f("year")),month:Number(f("month")),day:Number(f("day")),hour:Number(f("hour")),minute:Number(f("minute")),weekday:d[f("weekday")]??0}}function f(a,b){let c=e(a,b);return Date.UTC(c.year,c.month-1,c.day,c.hour,c.minute)-6e4*Math.floor(a.getTime()/6e4)}function g(a,b,c,d=process.env.APP_TIMEZONE||"Europe/Paris"){let e=Date.UTC(a,b-1,c),h=e-f(new Date(e),d);return new Date(h=e-f(new Date(h),d))}let h=a=>String(a).padStart(2,"0"),i=a=>`${h(a.getUTCDate())}/${h(a.getUTCMonth()+1)}`;function j(a,b=new Date){let c=process.env.APP_TIMEZONE||"Europe/Paris",d=e(b,c),f=new Date(Date.UTC(d.year,d.month-1,d.day-d.weekday-7*a)),k=new Date(f.getTime()+6048e5),l=new Date(f.getTime()+5184e5),m=g(f.getUTCFullYear(),f.getUTCMonth()+1,f.getUTCDate(),c),n=g(k.getUTCFullYear(),k.getUTCMonth()+1,k.getUTCDate(),c),o=n.getTime()>b.getTime();return{start:m,end:o?b:n,partial:o,label:`du ${i(f)} au ${i(l)}`,key:`${f.getUTCFullYear()}-${h(f.getUTCMonth()+1)}-${h(f.getUTCDate())}`}}function k(a){return a.key}function l(a,b=new Date){let c=e(b);return 6===c.weekday&&c.hour>=a}function m(a){return a.toISOString().replace("T"," ").slice(0,19)}},19121:a=>{"use strict";a.exports=require("next/dist/server/app-render/action-async-storage.external.js")},28562:a=>{"use strict";a.exports=import("@libsql/client/web")},28855:a=>{"use strict";a.exports=import("@libsql/client")},29294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")},33873:a=>{"use strict";a.exports=require("path")},44026:(a,b,c)=>{"use strict";c.d(b,{l:()=>d,s:()=>e});let d={red:{label:"Nul",color:"#fb7185"},yellow:{label:"Moyen",color:"#fbbf24"},green:{label:"Bien",color:"#4ade80"},blue:{label:"Parfait",color:"#60a5fa"}};function e(a){return"string"==typeof a&&a in d}},44870:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},48385:(a,b,c)=>{"use strict";c.d(b,{t:()=>f});var d=c(77598),e=c(10641);async function f(a,b,c){let f;if(!function(a){let b=process.env.BOT_API_TOKEN;if(!b||!a?.startsWith("Bearer "))return!1;let c=Buffer.from(a.slice(7)),e=Buffer.from(b);return c.length===e.length&&(0,d.timingSafeEqual)(c,e)}(a.headers.get("authorization")))return e.NextResponse.json({error:"unauthorized"},{status:401});if(b){let c=await a.json().catch(()=>null),d=b.safeParse(c);if(!d.success)return e.NextResponse.json({error:"validation",issues:d.error.issues.slice(0,5).map(a=>`${a.path.join(".")}: ${a.message}`)},{status:400});f=d.data}try{return e.NextResponse.json({ok:!0,...await c(f)})}catch(b){return console.error("[bot-api]",a.nextUrl.pathname,b instanceof Error?b.message:b),e.NextResponse.json({error:"internal"},{status:500})}}},54979:(a,b,c)=>{"use strict";c.d(b,{Y:()=>e,s:()=>f});var d=c(87956);function e(a,b,c,e){let f="string"==typeof a?a:a.discordId,g="string"==typeof a?null:a.username??null;return(0,d.x)("INSERT INTO audit_log (actor_discord_id, actor_name, action, target_discord_id, details) VALUES (?, ?, ?, ?, ?)",[f,g,b,c,JSON.stringify(e??{})])}async function f(a,b,c,f){let g=e(a,b,c,f);await d.db.run(g.sql,g.args)}},55511:a=>{"use strict";a.exports=require("crypto")},62963:(a,b,c)=>{"use strict";c.d(b,{Fd:()=>h,_Z:()=>j,iP:()=>g,k9:()=>i});var d=c(77598),e=c(45711),f=c(87956);function g(a){let b=process.env.FIVEM_AGENT_TOKEN;if(!b||!a)return!1;let c=Buffer.from(a),e=Buffer.from(b);return c.length===e.length&&(0,d.timingSafeEqual)(c,e)}let h=e.Ik({event:e.k5(["session_start","session_end"]),discordId:e.Yj().regex(/^\d{17,20}$/),playerName:e.Yj().max(100).optional().nullable(),sessionId:e.Yj().min(1).max(128),timestamp:e.ai().int().positive()});async function i(a){if(!await f.db.get("SELECT id FROM staff_members WHERE discord_id = ? AND left_guild_at IS NULL",[a.discordId]))return{ok:!0,action:"ignored"};let b=new Date(1e3*a.timestamp).toISOString();if("session_start"===a.event){let{changes:c}=await f.db.run(`INSERT OR IGNORE INTO activity_sessions (discord_id, source, started_at, ended_at, seconds, external_session_id, origin)
       VALUES (?, 'fivem', ?, NULL, 0, ?, 'fivem_agent')`,[a.discordId,b,a.sessionId]);return{ok:!0,action:c>0?"opened":"ignored"}}let c=await f.db.get("SELECT id, started_at FROM activity_sessions WHERE external_session_id = ? AND source = 'fivem' AND ended_at IS NULL",[a.sessionId]);if(!c)return{ok:!0,action:"ignored"};let d=new Date(1e3*a.timestamp).getTime(),e=Math.max(0,Math.floor((d-new Date(c.started_at).getTime())/1e3));return await f.db.run("UPDATE activity_sessions SET ended_at = ?, seconds = ? WHERE id = ?",[new Date(d).toISOString(),e,c.id]),{ok:!0,action:"closed"}}async function j(a){let b=new Date(Date.now()-1e3*Math.floor(a)).toISOString(),c=await f.db.all("SELECT id, started_at FROM activity_sessions WHERE source = 'fivem' AND ended_at IS NULL AND started_at <= ?",[b]),d=Math.floor(a);return await f.db.batch(c.map(a=>(0,f.x)("UPDATE activity_sessions SET ended_at = ?, seconds = ? WHERE id = ?",[new Date(new Date(a.started_at).getTime()+1e3*d).toISOString(),d,a.id]))),c.length}},63033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},64076:(a,b,c)=>{"use strict";c.d(b,{JK:()=>f,LD:()=>i,Wp:()=>g,Y4:()=>h,co:()=>e,x_:()=>j});var d=c(87956);async function e(a,b){await d.db.run(`INSERT INTO bot_status (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,[a,b,new Date().toISOString()])}async function f(){await d.db.run("DELETE FROM bot_status WHERE key = 'heartbeat'")}async function g(a){let b=await d.db.get("SELECT value FROM bot_status WHERE key = ?",[a]);return b?.value??null}async function h(){let a=new Map((await d.db.all("SELECT key, value FROM bot_status WHERE key IN ('heartbeat', 'top_role_position')")).map(a=>[a.key,a.value])),b=a.get("heartbeat")??null,c=a.get("top_role_position");return{alive:null!==b&&Date.now()-new Date(b).getTime()<18e4,heartbeatAt:b,topRolePosition:void 0===c?null:Number(c)}}async function i(a,b){let c=new Date,e=new Date(c.getTime()-b).toISOString(),{changes:f}=await d.db.run(`INSERT INTO bot_status (key, value, updated_at) VALUES (@key, @now, @now)
     ON CONFLICT(key) DO UPDATE SET value = @now, updated_at = @now WHERE bot_status.value < @expired`,{key:`lock:${a}`,now:c.toISOString(),expired:e});return f>0}async function j(a){await d.db.run("DELETE FROM bot_status WHERE key = ?",[`lock:${a}`])}},73024:a=>{"use strict";a.exports=require("node:fs")},73136:a=>{"use strict";a.exports=require("node:url")},76760:a=>{"use strict";a.exports=require("node:path")},77598:a=>{"use strict";a.exports=require("node:crypto")},78099:(a,b,c)=>{"use strict";c.r(b),c.d(b,{handler:()=>M,patchFetch:()=>L,routeModule:()=>H,serverHooks:()=>K,workAsyncStorage:()=>I,workUnitAsyncStorage:()=>J});var d={};c.r(d),c.d(d,{POST:()=>G,maxDuration:()=>F,runtime:()=>E});var e=c(95736),f=c(9117),g=c(4044),h=c(39326),i=c(32324),j=c(261),k=c(54290),l=c(85328),m=c(38928),n=c(46595),o=c(3421),p=c(17679),q=c(41681),r=c(63446),s=c(86439),t=c(34679),u=c(51356),v=c(10641),w=c(48385),x=c(62963),y=c(64076),z=c(83594),A=c(13658);async function B(a=new Date){return!!(0,z.Zh)()&&!!(0,A.xY)(Number(process.env.REVIEW_HOUR??20),a)&&await (0,y.Wp)("review_done")!==(0,A.Mj)((0,A.qn)(0,a))}async function C(){let a=(0,A.Mj)((0,A.qn)(0)),b=await (0,z.Cv)(0,{maxMembers:15});b.ok&&(console.log(`[review] week ${a}: generated=${b.generated} skipped=${b.skipped} failed=${b.failed} remaining=${b.remaining}`),0===b.failed&&0===b.remaining?await (0,y.co)("review_done",a):b.errors.length&&console.error("[review] errors:",b.errors.join(" | ")))}async function D(){return{staleFivemClosed:await (0,x._Z)(43200),reviewDue:await B()}}let E="nodejs",F=300;function G(a){return(0,w.t)(a,null,async()=>{let a=await D();return a.reviewDue&&(0,v.after)(()=>C().catch(a=>console.error("[review] failed:",a instanceof Error?a.message:a))),a})}let H=new e.AppRouteRouteModule({definition:{kind:f.RouteKind.APP_ROUTE,page:"/api/bot/tick/route",pathname:"/api/bot/tick",filename:"route",bundlePath:"app/api/bot/tick/route"},distDir:".next-verify",relativeProjectDir:"",resolvedPagePath:"C:\\Users\\anony\\Desktop\\Panel_Gestion_Staff\\site\\src\\app\\api\\bot\\tick\\route.ts",nextConfigOutput:"",userland:d}),{workAsyncStorage:I,workUnitAsyncStorage:J,serverHooks:K}=H;function L(){return(0,g.patchFetch)({workAsyncStorage:I,workUnitAsyncStorage:J})}async function M(a,b,c){var d;let e="/api/bot/tick/route";"/index"===e&&(e="/");let g=await H.prepare(a,b,{srcPage:e,multiZoneDraftMode:!1});if(!g)return b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve()),null;let{buildId:v,params:w,nextConfig:x,isDraftMode:y,prerenderManifest:z,routerServerContext:A,isOnDemandRevalidate:B,revalidateOnlyGenerated:C,resolvedPathname:D}=g,E=(0,j.normalizeAppPath)(e),F=!!z.routes[D]&&(H.isDev||(0,t.isRouteCacheOwner)(D,H.cacheOwner,z.routes[D])),G=!!(z.dynamicRoutes[E]||F);if(G&&!y){let a=z.dynamicRoutes[E];if(a&&!1===a.fallback&&!F)throw new s.NoFallbackError}let I=null;!G||H.isDev||y||(I="/index"===(I=D)?"/":I);let J=!0===H.isDev||!G,K=G&&!J,L=a.method||"GET",M=(0,i.getTracer)(),N=M.getActiveScopeSpan(),O={params:w,prerenderManifest:z,renderOpts:{experimental:{cacheComponents:!!x.experimental.cacheComponents,authInterrupts:!!x.experimental.authInterrupts},supportsDynamicResponse:J,incrementalCache:(0,h.getRequestMeta)(a,"incrementalCache"),cacheLifeProfiles:null==(d=x.experimental)?void 0:d.cacheLife,isRevalidate:K,waitUntil:c.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:void 0,onInstrumentationRequestError:(b,c,d)=>H.onRequestError(a,b,d,A)},sharedContext:{buildId:v}},P=new k.NodeNextRequest(a),Q=new k.NodeNextResponse(b),R=l.NextRequestAdapter.fromNodeNextRequest(P,(0,l.signalFromNodeResponse)(b));try{let d=async c=>H.handle(R,O).finally(()=>{if(!c)return;c.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let d=M.getRootSpanAttributes();if(!d)return;if(d.get("next.span_type")!==m.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${d.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=d.get("next.route");if(e){let a=`${L} ${e}`;c.setAttributes({"next.route":e,"http.route":e,"next.span_name":a}),c.updateName(a)}else c.updateName(`${L} ${a.url}`)}),g=async g=>{var i,j;let k=async({previousCacheEntry:f})=>{try{if(!(0,h.getRequestMeta)(a,"minimalMode")&&B&&C&&!f)return b.statusCode=404,b.setHeader("x-nextjs-cache","REVALIDATED"),b.end("This page could not be found"),null;let e=await d(g);a.fetchMetrics=O.renderOpts.fetchMetrics;let i=O.renderOpts.pendingWaitUntil;i&&c.waitUntil&&(c.waitUntil(i),i=void 0);let j=O.renderOpts.collectedTags;if(!G)return await (0,o.I)(P,Q,e,O.renderOpts.pendingWaitUntil),null;{let a=await e.blob(),b=(0,p.toNodeOutgoingHttpHeaders)(e.headers);j&&(b[r.NEXT_CACHE_TAGS_HEADER]=j),!b["content-type"]&&a.type&&(b["content-type"]=a.type);let c=void 0!==O.renderOpts.collectedRevalidate&&!(O.renderOpts.collectedRevalidate>=r.INFINITE_CACHE)&&O.renderOpts.collectedRevalidate,d=void 0===O.renderOpts.collectedExpire||O.renderOpts.collectedExpire>=r.INFINITE_CACHE?void 0:O.renderOpts.collectedExpire;return{value:{kind:u.CachedRouteKind.APP_ROUTE,status:e.status,body:Buffer.from(await a.arrayBuffer()),headers:b},cacheControl:{revalidate:c,expire:d}}}}catch(b){throw(null==f?void 0:f.isStale)&&await H.onRequestError(a,b,{routerKind:"App Router",routePath:e,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:K,isOnDemandRevalidate:B})},A),b}},l=await H.handleResponse({req:a,nextConfig:x,cacheKey:I,routeKind:f.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:z,isRoutePPREnabled:!1,isOnDemandRevalidate:B,revalidateOnlyGenerated:C,responseGenerator:k,waitUntil:c.waitUntil});if(!G)return null;if((null==l||null==(i=l.value)?void 0:i.kind)!==u.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(j=l.value)?void 0:j.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});(0,h.getRequestMeta)(a,"minimalMode")||b.setHeader("x-nextjs-cache",B?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),y&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return(0,h.getRequestMeta)(a,"minimalMode")&&G||m.delete(r.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||b.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,q.getCacheControlHeader)(l.cacheControl)),await (0,o.I)(P,Q,new Response(l.value.body,{headers:m,status:l.value.status||200})),null};N?await g(N):await M.withPropagatedContext(a.headers,()=>M.trace(m.BaseServerSpan.handleRequest,{spanName:`${L} ${a.url}`,kind:i.SpanKind.SERVER,attributes:{"http.method":L,"http.target":a.url}},g))}catch(b){if(b instanceof s.NoFallbackError||await H.onRequestError(a,b,{routerKind:"App Router",routePath:E,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:K,isOnDemandRevalidate:B})}),G)throw b;return await (0,o.I)(P,Q,new Response(null,{status:500})),null}}},78335:()=>{},83594:(a,b,c)=>{"use strict";c.d(b,{Cv:()=>o,Gs:()=>m,Zh:()=>j});var d=c(87956),e=c(54979),f=c(64076),g=c(44026),h=c(13658);let i=`Tu aides \xe0 r\xe9diger le bilan hebdomadaire d'un membre du staff d'un serveur de jeu.
Tu re\xe7ois les commentaires que ses responsables ont \xe9crits sur lui cette semaine.
R\xe9ponds UNIQUEMENT par un objet JSON : {"rating":"red|yellow|green|blue","summary":"..."}.
- rating : red = nul (probl\xe8mes s\xe9rieux), yellow = moyen (mitig\xe9), green = bien, blue = parfait (excellent).
- summary : 1 \xe0 2 phrases en fran\xe7ais, factuelles, fond\xe9es uniquement sur les commentaires. N'invente rien.`;function j(){return!!process.env.AI_API_KEY}let k=a=>new Promise(b=>setTimeout(b,a));async function l(a,b){let c=(process.env.AI_BASE_URL||"https://api.groq.com/openai/v1").replace(/\/$/,""),d=process.env.AI_MODEL||"llama-3.3-70b-versatile",e=b.map(a=>`- (${a.author}) ${a.body}`).join("\n").slice(0,6e3);for(let b=0;b<3;b++){let f=await fetch(`${c}/chat/completions`,{method:"POST",headers:{Authorization:`Bearer ${process.env.AI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:d,temperature:.2,response_format:{type:"json_object"},messages:[{role:"system",content:i},{role:"user",content:`Membre : ${a}
Commentaires de la semaine :
${e}`}]})});if(429===f.status&&b<2){await k(12e3);continue}if(!f.ok)throw Error(`AI HTTP ${f.status}`);let g=await f.json();return g.choices?.[0]?.message?.content??""}throw Error("AI rate limited")}async function m(a){return new Map((await d.db.all("SELECT discord_id, rating, summary FROM weekly_reviews WHERE week_start = ?",[a])).filter(a=>(0,g.s)(a.rating)).map(a=>[a.discord_id,{rating:a.rating,summary:a.summary}]))}let n="review";async function o(a=0,b={}){if(!j())return{ok:!1,error:"ai_not_configured"};if(!await (0,f.LD)(n,36e4))return{ok:!1,error:"already_running"};try{let c=(0,h.qn)(a),f=(0,h.Mj)(c),i=(0,h.ql)(c.start),j=(0,h.ql)(c.end),[n,o,p]=await Promise.all([d.db.all(`SELECT s.discord_id, s.username FROM staff_members s
         WHERE s.left_guild_at IS NULL AND EXISTS (
           SELECT 1 FROM staff_notes n WHERE n.discord_id = s.discord_id AND n.created_at >= ? AND n.created_at <= ?)
         ORDER BY s.grade_level DESC, s.username`,[i,j]),d.db.all(`SELECT n.discord_id, n.body, COALESCE(n.author_name, sa.username, n.author_discord_id) AS author
         FROM staff_notes n LEFT JOIN staff_members sa ON sa.discord_id = n.author_discord_id
         WHERE n.created_at >= ? AND n.created_at <= ? ORDER BY n.id`,[i,j]),m(f)]),q=new Map;for(let a of o)q.set(a.discord_id,[...q.get(a.discord_id)??[],a]);let r=b.maxMembers??25,s=0,t=0,u=0,v=0,w=[];for(let a of n){if(p.has(a.discord_id)&&!b.force){t++;continue}if(s+u>=r){v++;continue}let c=q.get(a.discord_id)??[];try{let b=function(a){let b=/\{[\s\S]*\}/.exec(a);if(!b)return null;try{let a=JSON.parse(b[0]),c="string"==typeof a.rating?a.rating.toLowerCase().trim():"",d="string"==typeof a.summary?a.summary.trim():"";if(!(0,g.s)(c)||!d)return null;return{rating:c,summary:d.slice(0,600)}}catch{return null}}(await l(a.username,c));if(!b)throw Error("r\xe9ponse IA illisible");await d.db.batch([(0,d.x)(`INSERT INTO weekly_reviews (week_start, discord_id, rating, summary, comments_count) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(week_start, discord_id) DO UPDATE SET rating = excluded.rating, summary = excluded.summary,
               comments_count = excluded.comments_count, created_at = CURRENT_TIMESTAMP`,[f,a.discord_id,b.rating,b.summary,c.length]),(0,d.x)("UPDATE staff_badges SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE discord_id = ? AND status = 'active' AND author_discord_id = 'ia'",[a.discord_id]),(0,d.x)("INSERT INTO staff_badges (discord_id, color, reason, author_discord_id) VALUES (?, ?, ?, 'ia')",[a.discord_id,b.rating,`Bilan IA \xb7 ${g.l[b.rating].label} : ${b.summary}`])]),s++}catch(b){u++,w.push(`${a.username}: ${b instanceof Error?b.message:String(b)}`)}0!==b.delayMs&&await k(b.delayMs??2200)}return await (0,e.s)(b.actor??"ia","review_generate",null,{week:f,generated:s,skipped:t,failed:u,remaining:v}),{ok:!0,generated:s,skipped:t,failed:u,remaining:v,errors:w}}finally{await (0,f.x_)(n)}}},86439:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external")},87956:(a,b,c)=>{"use strict";c.d(b,{db:()=>q,x:()=>p});var d=c(73024),e=c.n(d),f=c(76760),g=c.n(f),h=c(73136);let i=[{name:"001_base_tables",sql:`
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
  `);let b=new Set((await a.execute("SELECT name FROM schema_migrations")).rows.map(a=>String(a.name)));for(let c of i)if(!b.has(c.name))try{await a.batch([...c.sql.split(";").map(a=>a.trim()).filter(Boolean).map(a=>({sql:a,args:[]})),{sql:"INSERT INTO schema_migrations (name) VALUES (?)",args:[c.name]}],"write")}catch(b){if(0===(await a.execute({sql:"SELECT 1 FROM schema_migrations WHERE name = ?",args:[c.name]})).rows.length)throw b}}let k=globalThis;async function l(){let a=process.env.TURSO_DATABASE_URL;if(a){let{createClient:b}=await Promise.resolve().then(c.bind(c,28562));return b({url:a,authToken:process.env.TURSO_AUTH_TOKEN||void 0})}if(process.env.VERCEL)throw Error("TURSO_DATABASE_URL is not set. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the Vercel project's environment variables, then redeploy.");let{createClient:b}=await Promise.resolve().then(c.bind(c,28855));return b({url:function(){let a=process.env.DATABASE_PATH||"./data/gtasun.sqlite";if(":memory:"===a)return":memory:";let b=g().isAbsolute(a)?a:g().join(process.cwd(),a);return e().mkdirSync(g().dirname(b),{recursive:!0}),(0,h.pathToFileURL)(b).href}()})}function m(){return k.gtasunClient||(k.gtasunClient=l().catch(a=>{throw k.gtasunClient=void 0,a})),k.gtasunClient}function n(){return k.gtasunReady||(k.gtasunReady=m().then(a=>j(a)).catch(a=>{throw k.gtasunReady=void 0,a})),k.gtasunReady.then(m)}let o=a=>a.rows.map(b=>Object.fromEntries(a.columns.map((a,c)=>[a,b[c]])));function p(a,b){return{sql:a,args:b}}let q={async all(a,b){let c=await n();return o(await c.execute({sql:a,args:b??[]}))},get:async(a,b)=>(await q.all(a,b))[0],async run(a,b){let c=await n(),d=await c.execute({sql:a,args:b??[]});return{changes:d.rowsAffected,lastId:void 0===d.lastInsertRowid?null:Number(d.lastInsertRowid)}},async batch(a,b="write"){if(0===a.length)return[];let c=await n();return(await c.batch(a.map(a=>({sql:a.sql,args:a.args??[]})),b)).map(a=>({rows:o(a),changes:a.rowsAffected}))}}},96487:()=>{}};var b=require("../../../../webpack-runtime.js");b.C(a);var c=b.X(0,[897,641,22],()=>b(b.s=78099));module.exports=c})();