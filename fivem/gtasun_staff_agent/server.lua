-- GTASUN Staff Manager — FiveM agent starter.
-- Each server of the panel has its own token (generated in "Accès & rôles"): it tells the panel which server the sessions belong to.
-- Do not enable production reporting until the API endpoint and token are configured.
local API_URL = GetConvar('gtasun_staff_api_url', '')
local API_TOKEN = GetConvar('gtasun_staff_api_token', '')

-- Session ids must be identical for start and end, so they are created once per player.
local sessions = {}

local function sendSessionEvent(eventName, playerId)
    if API_URL == '' or API_TOKEN == '' then
        print('[gtasun_staff_agent] API URL/token not configured; event not sent.')
        return
    end

    local discordId = nil
    for _, identifier in ipairs(GetPlayerIdentifiers(playerId)) do
        if string.sub(identifier, 1, 8) == 'discord:' then
            discordId = string.sub(identifier, 9)
            break
        end
    end

    if not discordId then return end

    local sessionId = sessions[playerId]
    if eventName == 'session_start' then
        sessionId = ('%s-%s-%s'):format(discordId, playerId, os.time())
        sessions[playerId] = sessionId
    elseif not sessionId then
        return
    else
        sessions[playerId] = nil
    end

    PerformHttpRequest(API_URL, function(statusCode, body, headers)
        if statusCode < 200 or statusCode >= 300 then
            print(('[gtasun_staff_agent] API returned HTTP %s'):format(statusCode))
        end
    end, 'POST', json.encode({
        event = eventName,
        discordId = discordId,
        playerName = GetPlayerName(playerId),
        sessionId = sessionId,
        timestamp = os.time()
    }), {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer ' .. API_TOKEN
    })
end

AddEventHandler('playerJoining', function()
    sendSessionEvent('session_start', source)
end)

AddEventHandler('playerDropped', function()
    sendSessionEvent('session_end', source)
end)
