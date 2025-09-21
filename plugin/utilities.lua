local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")

-- UI Utilities
local function addMessage(message, isError)
    local messageFrame = Instance.new("Frame")
    messageFrame.Size = UDim2.new(1, 0, 0, 40)
    messageFrame.BackgroundColor3 = isError and Color3.fromRGB(255, 240, 240) or Color3.fromRGB(240, 255, 240)
    messageFrame.BorderSizePixel = 0
    
    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 6)
    corner.Parent = messageFrame
    
    local messageText = Instance.new("TextLabel")
    messageText.Size = UDim2.new(1, -20, 1, 0)
    messageText.Position = UDim2.new(0, 10, 0, 0)
    messageText.BackgroundTransparency = 1
    messageText.Text = message
    messageText.TextColor3 = isError and Color3.fromRGB(200, 0, 0) or Color3.fromRGB(0, 100, 0)
    messageText.TextXAlignment = Enum.TextXAlignment.Left
    messageText.TextWrapped = true
    messageText.Font = Enum.Font.Gotham
    messageText.TextSize = 14
    messageText.Parent = messageFrame
    
    messageFrame.Parent = scrollFrame
    messageFrame.LayoutOrder = #scrollFrame:GetChildren()
    
    -- Update canvas size
    local totalHeight = 0
    for _, child in ipairs(scrollFrame:GetChildren()) do
        if child:IsA("Frame") then
            totalHeight = totalHeight + child.Size.Y.Offset + listLayout.Padding.Offset
        end
    end
    scrollFrame.CanvasSize = UDim2.new(0, 0, 0, totalHeight)
    
    -- Scroll to bottom
    scrollFrame.CanvasPosition = Vector2.new(0, totalHeight)
    
    return messageFrame
end

local function setLoadingState(isLoading)
    submitButton.Text = isLoading and "Generating..." or "Generate Code"
    submitButton.Enabled = not isLoading
    promptBox.Enabled = not isLoading
end

local function clearMessages()
    for _, child in ipairs(scrollFrame:GetChildren()) do
        if child:IsA("Frame") then
            child:Destroy()
        end
    end
    scrollFrame.CanvasSize = UDim2.new(0, 0, 0, 0)
end

-- Script Management Utilities
local function createScriptInstance(scriptType)
    local validTypes = {
        ["Script"] = true,
        ["LocalScript"] = true,
        ["ModuleScript"] = true
    }
    
    if not validTypes[scriptType] then
        error("Invalid script type: " .. tostring(scriptType))
    end
    
    return Instance.new(scriptType)
end

local function getScriptPath(instance)
    local path = {}
    local current = instance
    while current and current ~= game do
        table.insert(path, 1, current.Name)
        current = current.Parent
    end
    return path
end

local function findOrCreatePath(pathArray)
    local current = game
    for _, name in ipairs(pathArray) do
        local next = current:FindFirstChild(name)
        if not next then
            next = Instance.new("Folder")
            next.Name = name
            next.Parent = current
        end
        current = next
    end
    return current
end

-- Checkpoint System
local checkpoints = {}

local function createCheckpoint(name)
    local checkpoint = {
        name = name or ("Checkpoint_" .. #checkpoints + 1),
        timestamp = os.time(),
        changes = {}
    }
    
    -- Store selected instances
    local selected = Selection:Get()
    for _, instance in ipairs(selected) do
        if instance:IsA("LuaSourceContainer") then
            table.insert(checkpoint.changes, {
                path = getScriptPath(instance),
                type = instance.ClassName,
                source = instance.Source
            })
        end
    end
    
    table.insert(checkpoints, checkpoint)
    return checkpoint
end

local function restoreCheckpoint(index)
    local checkpoint = checkpoints[index]
    if not checkpoint then
        error("Checkpoint not found: " .. tostring(index))
    end
    
    for _, change in ipairs(checkpoint.changes) do
        local parent = findOrCreatePath(change.path)
        local script = createScriptInstance(change.type)
        script.Name = change.path[#change.path]
        script.Source = change.source
        script.Parent = parent
    end
    
    return true
end

local function listCheckpoints()
    local list = {}
    for i, checkpoint in ipairs(checkpoints) do
        table.insert(list, {
            index = i,
            name = checkpoint.name,
            timestamp = checkpoint.timestamp,
            changeCount = #checkpoint.changes
        })
    end
    return list
end

-- Error Handling
local function wrapAsync(func)
    return function(...)
        local success, result = pcall(func, ...)
        if not success then
            addMessage(tostring(result), true)
            return nil
        end
        return result
    end
end

return {
    addMessage = addMessage,
    setLoadingState = setLoadingState,
    clearMessages = clearMessages,
    createScriptInstance = createScriptInstance,
    getScriptPath = getScriptPath,
    findOrCreatePath = findOrCreatePath,
    createCheckpoint = wrapAsync(createCheckpoint),
    restoreCheckpoint = wrapAsync(restoreCheckpoint),
    listCheckpoints = listCheckpoints,
    wrapAsync = wrapAsync
}