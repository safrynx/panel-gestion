-- Fiverax agent: links this FiveM server to its panel.
--
-- Every few seconds the agent calls the panel (POST <fiverax_url>/api/fivem/agent) with what happened since the
-- previous call (players joining / leaving, console lines, results of actions) and, now and then, a snapshot of the
-- server (players, resources). The answer holds the actions queued from the panel (kick, message, announce,
-- resources, console) and the delay before the next call. The agent always opens the connection: no port to open.
--
-- server.cfg:
--   set fiverax_url "https://ton-panel.example"
--   set fiverax_token "fvm_..."                       # token of this server (panel > Configuration)
--   add_ace resource.fiverax_agent command allow      # needed for console commands and resources
--   set fiverax_console 0                             # optional: refuse console commands from the panel
--   ensure fiverax_agent

local VERSION = '2.0.0'
local RESOURCE = GetCurrentResourceName()

-- The 1.x convars (gtasun_staff_api_url pointed at /api/fivem) still work.
local function baseUrl()
    local url = GetConvar('fiverax_url', '')
    if url == '' then url = GetConvar('gtasun_staff_api_url', ''):gsub('/api/fivem/?$', '') end
    return (url:gsub('/+$', ''))
end

local URL = baseUrl()
local TOKEN = GetConvar('fiverax_token', '')
if TOKEN == '' then TOKEN = GetConvar('gtasun_staff_api_token', '') end
local ALLOW_CONSOLE = GetConvarInt('fiverax_console', 1) == 1

local STATE_EVERY = 15   -- seconds between two snapshots when nothing changed
local MAX_EVENTS = 300
local MAX_CONSOLE = 500

local sessions = {}      -- [server id] = session id
local events = {}
local consoleLines = {}
local results = {}
local dirty = true
local lastState = 0
local interval = 8
local booted = false
local warnedAuth = false

local function stripColors(text)
    return (text:gsub('%^%d', ''))
end

local function identifiersOf(src)
    local out = {}
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 3) ~= 'ip:' then out[#out + 1] = id end
    end
    return out
end

local function playerJoined(src)
    if sessions[src] then return end
    local session = ('%d-%d-%d'):format(src, os.time(), math.random(100000, 999999))
    sessions[src] = session
    events[#events + 1] = { type = 'join', session = session, name = GetPlayerName(src) or '?', identifiers = identifiersOf(src), timestamp = os.time() }
    dirty = true
end

local function playerLeft(src, reason)
    local session = sessions[src]
    if not session then return end
    sessions[src] = nil
    events[#events + 1] = { type = 'leave', session = session, reason = reason and tostring(reason):sub(1, 200) or nil, timestamp = os.time() }
    dirty = true
end

AddEventHandler('playerJoining', function() playerJoined(source) end)
AddEventHandler('playerDropped', function(reason) playerLeft(source, reason) end)
AddEventHandler('onResourceStart', function() dirty = true end)
AddEventHandler('onResourceStop', function() dirty = true end)

RegisterConsoleListener(function(channel, message)
    message = stripColors(message or ''):gsub('%s+$', '')
    if message == '' then return end
    if #consoleLines >= MAX_CONSOLE then table.remove(consoleLines, 1) end
    consoleLines[#consoleLines + 1] = { channel = channel and channel:sub(1, 60) or nil, message = message:sub(1, 4000) }
end)

local function snapshot()
    local players = {}
    for _, id in ipairs(GetPlayers()) do
        local src = tonumber(id)
        players[#players + 1] = { id = src, name = GetPlayerName(src) or '?', ping = GetPlayerPing(src), session = sessions[src] }
    end
    local resources = {}
    for i = 0, GetNumResources() - 1 do
        local name = GetResourceByFindIndex(i)
        if name then resources[#resources + 1] = { name = name, state = GetResourceState(name) } end
    end
    local hostname = GetConvar('sv_projectName', '')
    if hostname == '' then hostname = GetConvar('sv_hostname', '') end
    return {
        hostname = stripColors(hostname):sub(1, 300),
        maxClients = GetConvarInt('sv_maxclients', 32),
        uptime = math.floor(GetGameTimer() / 1000),
        build = GetConvar('version', ''):sub(1, 40),
        players = players,
        resources = resources
    }
end

-- ---- actions from the panel: each returns ok, message ----

local function online(target)
    return GetPlayerName(target) ~= nil
end

local handlers = {
    kick = function(p)
        if not online(p.target) then return false, 'Joueur déconnecté' end
        DropPlayer(p.target, p.reason)
        return true, 'Joueur expulsé'
    end,
    dm = function(p)
        if not online(p.target) then return false, 'Joueur déconnecté' end
        TriggerClientEvent('chat:addMessage', p.target, { color = { 212, 176, 106 }, multiline = true, args = { 'Staff', p.message } })
        return true, 'Message envoyé'
    end,
    announce = function(p)
        TriggerClientEvent('chat:addMessage', -1, { color = { 212, 176, 106 }, multiline = true, args = { 'Annonce', p.message } })
        return true, 'Annonce envoyée'
    end,
    resource = function(p)
        if p.name == RESOURCE then return false, "L'agent ne peut pas agir sur lui-même" end
        if GetResourceState(p.name) == 'missing' then return false, 'Ressource introuvable (essaie « Recharger la liste »)' end
        local ok = true
        if p.action == 'stop' or p.action == 'restart' then ok = StopResource(p.name) end
        if ok and (p.action == 'start' or p.action == 'restart') then ok = StartResource(p.name) end
        dirty = true
        return ok, ('%s : %s'):format(p.name, GetResourceState(p.name))
    end,
    refresh = function()
        ExecuteCommand('refresh')
        dirty = true
        return true, 'Liste des ressources rechargée'
    end,
    console = function(p)
        if not ALLOW_CONSOLE then return false, 'Console désactivée sur ce serveur (fiverax_console 0)' end
        ExecuteCommand(p.command)
        return true, 'Commande exécutée'
    end
}

local function run(command)
    local handler = handlers[command.kind]
    if not handler then return { id = command.id, ok = false, message = 'Action inconnue : mets à jour fiverax_agent' } end
    local payload = command.payload or {}
    -- JSON numbers may decode as floats ("3.0" once turned into a player source string).
    if payload.target then payload.target = math.floor(tonumber(payload.target) or -1) end
    local success, ok, message = pcall(handler, payload)
    if not success then return { id = command.id, ok = false, message = tostring(ok):sub(1, 2000) } end
    return { id = command.id, ok = ok and true or false, message = message }
end

-- ---- the call to the panel ----

local function prepend(list, items, max)
    local merged = {}
    for _, v in ipairs(items) do merged[#merged + 1] = v end
    for _, v in ipairs(list) do merged[#merged + 1] = v end
    while #merged > max do table.remove(merged, 1) end
    return merged
end

-- Returns how long to wait before the next call (seconds).
local function call()
    local sentEvents, sentConsole, sentResults = events, consoleLines, results
    events, consoleLines, results = {}, {}, {}
    local body = { version = VERSION, boot = not booted or nil, events = sentEvents, console = sentConsole, results = sentResults }
    if dirty or os.time() - lastState >= STATE_EVERY then
        body.state = snapshot()
        dirty, lastState = false, os.time()
    end

    local p = promise.new()
    PerformHttpRequest(URL .. '/api/fivem/agent', function(status, response)
        p:resolve({ status = status, body = response })
    end, 'POST', json.encode(body), { ['Content-Type'] = 'application/json', ['Authorization'] = 'Bearer ' .. TOKEN })
    local res = Citizen.Await(p)

    if res.status < 200 or res.status >= 300 then
        -- Keep what was not delivered for the next call (console lines are best effort).
        events = prepend(events, sentEvents, MAX_EVENTS)
        results = prepend(results, sentResults, 100)
        if body.state then dirty = true end
        if res.status == 401 then
            if not warnedAuth then print('[fiverax] Token refusé : vérifie fiverax_token (panel > Configuration).') end
            warnedAuth = true
        elseif res.status == 0 then
            print('[fiverax] Panel injoignable : ' .. URL)
        else
            print(('[fiverax] Le panel a répondu HTTP %s'):format(res.status))
        end
        return 15
    end

    booted, warnedAuth = true, false
    local data = json.decode(res.body or '') or {}
    if type(data.interval) == 'number' then interval = math.max(1, math.min(60, data.interval)) end
    local commands = data.commands or {}
    for _, command in ipairs(commands) do results[#results + 1] = run(command) end
    -- Report the results right away rather than at the next tick.
    if #commands > 0 then return 0.5 end
    return interval
end

CreateThread(function()
    if URL == '' or TOKEN == '' then
        print('[fiverax] fiverax_url / fiverax_token non configurés : agent inactif.')
        return
    end
    math.randomseed(os.time())
    -- Players already connected (the resource was restarted).
    for _, id in ipairs(GetPlayers()) do playerJoined(tonumber(id)) end
    print(('[fiverax] Agent %s relié à %s'):format(VERSION, URL))
    while true do
        local ok, wait = pcall(call)
        if not ok then
            print('[fiverax] Erreur : ' .. tostring(wait))
            wait = 15
        end
        Wait(math.floor(wait * 1000))
    end
end)
