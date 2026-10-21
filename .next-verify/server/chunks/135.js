"use strict";exports.id=135,exports.ids=[135],exports.modules={46145:(a,b,c)=>{function d(a){let b=Math.max(0,Math.floor(a||0)),c=Math.floor(b/3600),d=Math.floor(b%3600/60);return 0===c?`${d} min`:`${c} h ${String(d).padStart(2,"0")}`}function e(a){return new Date(a.includes("T")?a:a.replace(" ","T")+"Z").toLocaleString("fr-FR",{timeZone:"Europe/Paris",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}c.d(b,{a:()=>d,r:()=>e})},48355:(a,b,c)=>{c.d(b,{_:()=>i,t:()=>j});var d=c(87956),e=c(54979),f=c(64076),g=c(75741);let h="counters_reset_at";async function i(){let a=await (0,f.Wp)(h);return a?new Date(a):null}async function j(a){let b=new Date,c=b.toISOString(),f=await d.db.all("SELECT id, discord_id, channel_id, started_at FROM voice_sessions WHERE ended_at IS NULL"),i=[];for(let a of f){let e=Math.max(0,Math.floor((b.getTime()-new Date(a.started_at).getTime())/1e3));i.push((0,d.x)("UPDATE voice_sessions SET ended_at = ?, seconds = ? WHERE id = ?",[c,e,a.id])),i.push((0,d.x)("INSERT INTO voice_sessions (discord_id, channel_id, started_at, ended_at, seconds, reconciled) VALUES (?, ?, ?, NULL, 0, 0)",[a.discord_id,a.channel_id,c]))}i.push((0,d.x)(`INSERT INTO bot_status (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,[h,c,c])),await d.db.batch(i);let j=await (0,g.kk)(c);return await (0,e.s)(a,"counters_reset",null,{at:c,fivemSnapshot:j,restartedVoice:f.length}),{resetAt:c,fivemSnapshot:j,restartedVoice:f.length}}},48977:(a,b,c)=>{c.d(b,{Ud:()=>r,YQ:()=>p,dO:()=>o,mO:()=>s,t5:()=>n});var d=c(77598),e=c(87956),f=c(52604),g=c(64076),h=c(54979);let i={grade:"Staff",gradeLevel:0},j=`
  INSERT INTO staff_members (id, discord_id, username, avatar_url, grade, grade_level, created_at, updated_at, guild_joined_at, left_guild_at, roles_json, last_synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  ON CONFLICT(discord_id) DO UPDATE SET
    username = excluded.username,
    avatar_url = excluded.avatar_url,
    grade = excluded.grade,
    grade_level = excluded.grade_level,
    updated_at = excluded.updated_at,
    guild_joined_at = COALESCE(staff_members.guild_joined_at, excluded.guild_joined_at),
    left_guild_at = NULL,
    roles_json = excluded.roles_json,
    last_synced_at = excluded.last_synced_at
`,k=`
  UPDATE staff_members SET left_guild_at = ?, updated_at = ?, roles_json = ?, last_synced_at = ?
  WHERE discord_id = ? AND left_guild_at IS NULL
`;function l(a,b,c,g){let h=b.get(c.discordId);if(!c.presentInGuild||!(0,f.U$)(a,c.roleIds))return h?.active?{kind:"left",statement:(0,e.x)(k,[g,g,JSON.stringify(c.roleIds),g,c.discordId])}:{kind:"skipped",statement:null};let{grade:l,gradeLevel:m}=(0,f.Z)(a,c.roleIds)??i;return{kind:h?"updated":"inserted",statement:(0,e.x)(j,[h?.id??(0,d.randomUUID)(),c.discordId,c.username,c.avatarUrl,l,m,g,g,c.joinedAt,JSON.stringify(c.roleIds),g])}}async function m(){return new Map((await e.db.all("SELECT id, discord_id, left_guild_at FROM staff_members")).map(a=>[a.discord_id,{id:a.id,active:null===a.left_guild_at}]))}async function n(a,b="system"){let c=await (0,f.Z9)(),d=await m(),g=new Date().toISOString(),i=[],j={inserted:0,updated:0,markedLeft:0},o=new Set;for(let b of a){o.add(b.discordId);let{kind:a,statement:e}=l(c,d,b,g);e&&i.push(e),"inserted"===a?j.inserted++:"updated"===a?j.updated++:"left"===a&&j.markedLeft++}for(let[a,b]of d)!o.has(a)&&b.active&&(i.push((0,e.x)(k,[g,g,"[]",g,a])),j.markedLeft++);let p={...j,total:a.length};return i.push((0,h.Y)(b,"staff_sync",null,p)),await e.db.batch(i),p}async function o(a){let{kind:b,statement:c}=l(await (0,f.Z9)(),new Map((await e.db.all("SELECT id, left_guild_at FROM staff_members WHERE discord_id = ?",[a.discordId])).map(b=>[a.discordId,{id:b.id,active:null===b.left_guild_at}])),a,new Date().toISOString());return{kind:b,statements:c?[c]:[]}}async function p(a){let{kind:b,statements:c}=await o(a);return await e.db.batch(c),b}let q=a=>`CASE WHEN ended_at IS NULL
  THEN MAX(0, CAST((julianday(@${a}) - julianday(started_at)) * 86400 AS INTEGER))
  ELSE seconds END`;async function r(a,b,c){let d=await (0,g.Y4)(),f=d.alive?new Date().toISOString():d.heartbeatAt??"1970-01-01T00:00:00.000Z";return(await e.db.all(`
    SELECT
      s.id, s.discord_id, s.username, s.avatar_url, s.grade, s.grade_level,
      s.guild_joined_at, s.left_guild_at,
      COALESCE(v.seconds, 0) AS voice_seconds,
      COALESCE(f.seconds, 0) AS fivem_seconds,
      (
        SELECT color FROM staff_badges b
        WHERE b.discord_id = s.discord_id AND b.status = 'active'
        ORDER BY b.created_at DESC, b.id DESC LIMIT 1
      ) AS badge_color,
      COALESCE(n.notes_count, 0) AS notes_count,
      MAX(COALESCE(v.last_start, ''), COALESCE(f.last_start, '')) AS last_activity,
      COALESCE(v.open_count, 0) AS voice_open,
      s.roles_json AS roles_json,
      ln.body AS note_body, ln.created_at AS note_at,
      COALESCE(ln.author_name, (SELECT username FROM staff_members x WHERE x.discord_id = ln.author_discord_id), ln.author_discord_id) AS note_author,
      (SELECT COUNT(*) FROM warnings w WHERE w.discord_id = s.discord_id AND w.removed_at IS NULL) AS active_warnings,
      COALESCE(f.open_count, 0) AS fivem_open
    FROM staff_members s
    LEFT JOIN (
      SELECT discord_id, SUM(${q("liveVoice")}) AS seconds, MAX(started_at) AS last_start,
             SUM(ended_at IS NULL) AS open_count
      FROM voice_sessions WHERE (@since IS NULL OR started_at >= @since) AND (@until IS NULL OR started_at < @until)
      GROUP BY discord_id
    ) v ON v.discord_id = s.discord_id
    LEFT JOIN (
      SELECT discord_id, SUM(${q("liveFivem")}) AS seconds, MAX(started_at) AS last_start,
             SUM(ended_at IS NULL) AS open_count
      FROM activity_sessions WHERE source = 'fivem' AND (@since IS NULL OR started_at >= @since) AND (@until IS NULL OR started_at < @until)
      GROUP BY discord_id
    ) f ON f.discord_id = s.discord_id
    LEFT JOIN staff_notes ln ON ln.id = (
      SELECT id FROM staff_notes WHERE discord_id = s.discord_id ORDER BY created_at DESC, id DESC LIMIT 1
    )
    LEFT JOIN (
      SELECT discord_id, COUNT(*) AS notes_count FROM staff_notes GROUP BY discord_id
    ) n ON n.discord_id = s.discord_id
    WHERE s.left_guild_at IS NULL AND (@only IS NULL OR s.discord_id = @only)
    ORDER BY s.grade_level DESC, s.username COLLATE NOCASE
    `,{since:a?a.toISOString():null,until:b?b.toISOString():null,only:c??null,liveVoice:f,liveFivem:new Date().toISOString()})).map(a=>({id:a.id,discordId:a.discord_id,username:a.username,avatarUrl:a.avatar_url,grade:a.grade,gradeLevel:a.grade_level,guildJoinedAt:a.guild_joined_at,leftGuildAt:a.left_guild_at,voiceSeconds:a.voice_seconds,fivemSeconds:a.fivem_seconds,activeBadgeColor:a.badge_color,notesCount:a.notes_count,lastActivity:a.last_activity||null,inVoice:a.voice_open>0&&d.alive,inFivem:a.fivem_open>0,roleIds:function(a){try{return JSON.parse(a)}catch{return[]}}(a.roles_json),activeWarnings:a.active_warnings,lastNote:a.note_body?{body:a.note_body,author:a.note_author??"?",createdAt:a.note_at??""}:null}))}async function s(a,b){let[c,d,f,g,h]=await Promise.all([r(b,void 0,a),e.db.all("SELECT id, color, reason, author_discord_id, status, created_at, resolved_at FROM staff_badges WHERE discord_id = ? ORDER BY created_at DESC, id DESC",[a]),e.db.all("SELECT id, body, author_discord_id, author_name, created_at FROM staff_notes WHERE discord_id = ? ORDER BY created_at DESC, id DESC",[a]),e.db.all("SELECT id, level, reason, author_discord_id, created_at, removed_at, removed_by, removed_reason FROM warnings WHERE discord_id = ? ORDER BY created_at DESC, id DESC",[a]),e.db.all("SELECT id, old_grade, new_grade, actor_discord_id, reason, sync_status, created_at FROM grade_history WHERE discord_id = ? ORDER BY created_at DESC, id DESC",[a])]);return{member:c[0]??null,badges:d,notes:f,warnings:g,gradeHistory:h}}},54979:(a,b,c)=>{c.d(b,{Y:()=>e,s:()=>f});var d=c(87956);function e(a,b,c,e){let f="string"==typeof a?a:a.discordId,g="string"==typeof a?null:a.username??null;return(0,d.x)("INSERT INTO audit_log (actor_discord_id, actor_name, action, target_discord_id, details) VALUES (?, ?, ?, ?, ?)",[f,g,b,c,JSON.stringify(e??{})])}async function f(a,b,c,f){let g=e(a,b,c,f);await d.db.run(g.sql,g.args)}},64076:(a,b,c)=>{c.d(b,{JK:()=>f,LD:()=>i,Wp:()=>g,Y4:()=>h,co:()=>e,x_:()=>j});var d=c(87956);async function e(a,b){await d.db.run(`INSERT INTO bot_status (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,[a,b,new Date().toISOString()])}async function f(){await d.db.run("DELETE FROM bot_status WHERE key = 'heartbeat'")}async function g(a){let b=await d.db.get("SELECT value FROM bot_status WHERE key = ?",[a]);return b?.value??null}async function h(){let a=new Map((await d.db.all("SELECT key, value FROM bot_status WHERE key IN ('heartbeat', 'top_role_position')")).map(a=>[a.key,a.value])),b=a.get("heartbeat")??null,c=a.get("top_role_position");return{alive:null!==b&&Date.now()-new Date(b).getTime()<18e4,heartbeatAt:b,topRolePosition:void 0===c?null:Number(c)}}async function i(a,b){let c=new Date,e=new Date(c.getTime()-b).toISOString(),{changes:f}=await d.db.run(`INSERT INTO bot_status (key, value, updated_at) VALUES (@key, @now, @now)
     ON CONFLICT(key) DO UPDATE SET value = @now, updated_at = @now WHERE bot_status.value < @expired`,{key:`lock:${a}`,now:c.toISOString(),expired:e});return f>0}async function j(a){await d.db.run("DELETE FROM bot_status WHERE key = ?",[`lock:${a}`])}},75741:(a,b,c)=>{c.d(b,{$5:()=>f,a3:()=>h,kk:()=>g,w_:()=>e});var d=c(87956);async function e(a,b=new Date){let c=new Set((await d.db.all("SELECT discord_id FROM staff_members")).map(a=>a.discord_id)),f=a.filter(a=>c.has(a.discordId)),g=b.toISOString(),h=await d.db.get("SELECT MAX(taken_at) AS at FROM playtime_snapshots"),i=!h?.at||b.getTime()-new Date(h.at).getTime()>=18e5,j=f.map(a=>(0,d.x)(`INSERT INTO playtime_totals (discord_id, seconds, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(discord_id) DO UPDATE SET seconds = excluded.seconds, updated_at = excluded.updated_at`,[a.discordId,a.seconds,g]));if(i)for(let a of f)j.push((0,d.x)("INSERT INTO playtime_snapshots (discord_id, seconds, taken_at) VALUES (?, ?, ?)",[a.discordId,a.seconds,g]));return await d.db.batch(j),{stored:f.length,snapshot:i}}async function f(){return!!await d.db.get("SELECT 1 AS x FROM playtime_totals LIMIT 1")}async function g(a){let b=await d.db.all("SELECT discord_id, seconds FROM playtime_totals");return!!b.length&&(await d.db.batch(b.map(b=>(0,d.x)("INSERT INTO playtime_snapshots (discord_id, seconds, taken_at) VALUES (?, ?, ?)",[b.discord_id,b.seconds,a]))),!0)}async function h(a,b){if(!a){let a=await d.db.all("SELECT discord_id, seconds FROM playtime_totals");return a.length?new Map(a.map(a=>[a.discord_id,a.seconds])):null}let c=await d.db.all(`SELECT t.discord_id, t.seconds AS total,
       COALESCE(
         (SELECT s.seconds FROM playtime_snapshots s WHERE s.discord_id = t.discord_id AND s.taken_at <= @since ORDER BY s.taken_at DESC LIMIT 1),
         (SELECT s.seconds FROM playtime_snapshots s WHERE s.discord_id = t.discord_id ORDER BY s.taken_at ASC LIMIT 1)
       ) AS base,
       (SELECT s.seconds FROM playtime_snapshots s WHERE s.discord_id = t.discord_id AND s.taken_at <= @until ORDER BY s.taken_at DESC LIMIT 1) AS end_snap
     FROM playtime_totals t`,{since:a.toISOString(),until:(b??new Date).toISOString()});if(!c.length)return null;let e=new Map;for(let a of c){let c=b?a.end_snap:a.total;null!==a.base&&null!==c&&e.set(a.discord_id,Math.max(0,c-a.base))}return e}},81383:(a,b,c)=>{c.d(b,{YY:()=>j,fl:()=>h,iQ:()=>k,nm:()=>i});var d=c(48977),e=c(75741),f=c(52604),g=c(48355);async function h(){return await (0,e.$5)()?"database":"agent"}async function i(a,b,c){let[d,g]=await Promise.all([(0,e.a3)(b,c),(0,f.Z9)()]);return a.map(a=>({...a,fivemSeconds:d?.get(a.discordId)??a.fivemSeconds,warnLevel:Math.min(3,(0,f.YI)(g,a.roleIds)??a.activeWarnings)}))}async function j(a){let b=await (0,g._)();return b&&(!a||b>a)?b:a}async function k(a,b,c=!0){let e=c?await j(a):a;return i(await (0,d.Ud)(e,b),e,b)}}};