-- Get required services
local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")

-- AI Assistant Configuration  
local config = {
    apiUrl = "https://bloxydev-production.up.railway.app",
    apiEndpoint = "/api/ai/generate-public",
    testEndpoint = "/api/test",
    debug = true -- Enable debug for troubleshooting
}

-- AI Assistant Plugin for Roblox Studio
local PluginName = "AI Dev Assistant"

-- Create the plugin toolbar and button
local toolbar = plugin:CreateToolbar(PluginName)
local toggleButton = toolbar:CreateButton(
    "AI Assistant 1.0",
    "Open AI Assistant",
    "rbxassetid://4458901886"
)

-- Create the plugin widget
local widgetInfo = DockWidgetPluginGuiInfo.new(
    Enum.InitialDockState.Right,
    false,
    false,
    300,
    400,
    250,
    250
)

local widget = plugin:CreateDockWidgetPluginGui("AIAssistantWidget", widgetInfo)
widget.Title = PluginName

-- Create the UI
local frame = Instance.new("Frame")
frame.Size = UDim2.new(1, 0, 1, 0)
frame.BackgroundColor3 = Color3.fromRGB(245, 245, 245)
frame.Parent = widget

-- Add padding
local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 10)
padding.PaddingBottom = UDim.new(0, 10)
padding.PaddingLeft = UDim.new(0, 10)
padding.PaddingRight = UDim.new(0, 10)
padding.Parent = frame

local scrollFrame = Instance.new("ScrollingFrame")
scrollFrame.Size = UDim2.new(1, -20, 1, -120)
scrollFrame.Position = UDim2.new(0, 10, 0, 10)
scrollFrame.BackgroundTransparency = 1
scrollFrame.ScrollBarThickness = 6
scrollFrame.Parent = frame

-- Add list layout for messages
local listLayout = Instance.new("UIListLayout")
listLayout.Padding = UDim.new(0, 10)
listLayout.Parent = scrollFrame

local promptBox = Instance.new("TextBox")
promptBox.Size = UDim2.new(1, -20, 0, 60)
promptBox.Position = UDim2.new(0, 10, 1, -100)
promptBox.TextWrapped = true
promptBox.PlaceholderText = "Enter your prompt here..."
promptBox.TextXAlignment = Enum.TextXAlignment.Left
promptBox.TextYAlignment = Enum.TextYAlignment.Top
promptBox.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
promptBox.Font = Enum.Font.Gotham
promptBox.PlaceholderColor3 = Color3.fromRGB(180, 180, 180)
promptBox.TextSize = 14
promptBox.Parent = frame

-- Add corner radius to prompt box
local promptBoxCorner = Instance.new("UICorner")
promptBoxCorner.CornerRadius = UDim.new(0, 6)
promptBoxCorner.Parent = promptBox

local submitButton = Instance.new("TextButton")
submitButton.Size = UDim2.new(1, -20, 0, 30)
submitButton.Position = UDim2.new(0, 10, 1, -30)
submitButton.Text = "Generate Code"
submitButton.BackgroundColor3 = Color3.fromRGB(0, 162, 255)
submitButton.BorderSizePixel = 0
submitButton.TextColor3 = Color3.fromRGB(255, 255, 255)
submitButton.AutoButtonColor = true
submitButton.Font = Enum.Font.GothamSemibold
submitButton.Parent = frame

-- Add corner radius
local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 6)
corner.Parent = submitButton

-- UI Functions
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
    submitButton.Active = not isLoading
    promptBox.Active = not isLoading
    
    -- Visual feedback for disabled state
    if isLoading then
        submitButton.BackgroundColor3 = Color3.fromRGB(150, 150, 150)
        promptBox.BackgroundColor3 = Color3.fromRGB(240, 240, 240)
    else
        submitButton.BackgroundColor3 = Color3.fromRGB(0, 162, 255)
        promptBox.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
    end
end

-- Test server connection on startup
spawn(function()
    print("[AI Plugin] Testing connection to:", config.apiUrl)
    
    -- Try test endpoint first
    local success, result = pcall(function()
        return HttpService:RequestAsync({
            Url = config.apiUrl .. config.testEndpoint,
            Method = "GET"
        }).Body
    end)
    
    if success then
        local data = HttpService:JSONDecode(result)
        print("[AI Plugin] Server test successful:", data.message)
        addMessage("Connected to AI server successfully!", false)
    else
        print("[AI Plugin] Test endpoint failed, trying health check...")
        
        -- Try health check
        local healthSuccess, healthResult = pcall(function()
            return HttpService:RequestAsync({
                Url = config.apiUrl .. "/health",
                Method = "GET"
            }).Body
        end)
        
        if healthSuccess then
            print("[AI Plugin] Health check successful")
            addMessage("Connected to AI server!", false)
        else
            warn("[AI Plugin] Connection failed:", healthResult)
            addMessage("Warning: Could not connect to AI server", true)
        end
    end
end)

-- Smart game tree function
local function getSmartGameTree(prompt, selectedInstances)
    prompt = prompt:lower()
    
    local function getBasicInfo(instance, maxDepth)
        maxDepth = maxDepth or 2
        if maxDepth <= 0 then return nil end
        
        local result = {
            Name = instance.Name,
            ClassName = instance.ClassName,
            Children = {}
        }
        
        if instance:IsA("BasePart") then
            result.Properties = {
                Size = tostring(instance.Size),
                Anchored = instance.Anchored,
                BrickColor = tostring(instance.BrickColor)
            }
        end
        
        if instance:IsA("Script") or instance:IsA("LocalScript") or instance:IsA("ModuleScript") then
            result.Properties = {
                HasSource = instance.Source ~= ""
            }
        end
        
        local childCount = 0
        for _, child in ipairs(instance:GetChildren()) do
            childCount = childCount + 1
            if childCount <= 10 then
                local childInfo = getBasicInfo(child, maxDepth - 1)
                if childInfo then
                    table.insert(result.Children, childInfo)
                end
            else
                table.insert(result.Children, {
                    Name = "...",
                    ClassName = "MoreItems",
                    Note = (#instance:GetChildren() - 10) .. " more items"
                })
                break
            end
        end
        
        return result
    end
    
    local gameTree = {}
    
    -- ALWAYS include Workspace since server validation requires it
    gameTree.Workspace = getBasicInfo(game.Workspace, 2)
    
    local needsScripts = prompt:find("script") or prompt:find("code") or
                        prompt:find("function") or prompt:find("hello world")
    
    local needsGui = prompt:find("gui") or prompt:find("screen") or prompt:find("button")
    
    local needsStorage = prompt:find("storage") or prompt:find("module")
    
    if needsScripts then
        gameTree.ServerScriptService = getBasicInfo(game.ServerScriptService, 1)
        gameTree.ReplicatedStorage = getBasicInfo(game.ReplicatedStorage, 1)
    end
    
    if needsGui then
        gameTree.StarterGui = getBasicInfo(game.StarterGui, 1)
    end
    
    if needsStorage then
        gameTree.ServerStorage = getBasicInfo(game.ServerStorage, 1)
    end
    
    gameTree.Lighting = {
        Name = "Lighting",
        ClassName = "Lighting"
    }
    
    if selectedInstances and #selectedInstances > 0 then
        gameTree.SelectedContext = {}
        for _, selected in ipairs(selectedInstances) do
            table.insert(gameTree.SelectedContext, {
                Name = selected.name,
                ClassName = selected.className,
                Path = selected.path
            })
        end
    end
    
    gameTree.Summary = {
        WorkspacePartCount = #game.Workspace:GetChildren(),
        ScriptServiceScriptCount = #game.ServerScriptService:GetChildren(),
        PlayerCount = #game.Players:GetPlayers()
    }
    
    return gameTree
end

-- Function to send request to AI service
local function requestAIGeneration(prompt)
    -- Determine the correct mode based on prompt
    local mode = "auto"
    local lowerPrompt = prompt:lower()
    
    -- Force direct_edit mode for script modification requests
    if lowerPrompt:find("modify") or lowerPrompt:find("edit") or 
       lowerPrompt:find("change") or lowerPrompt:find("update") or
       lowerPrompt:find("fix") or lowerPrompt:find("the script") or
       lowerPrompt:find("existing script") then
        mode = "direct_edit"
        print("[AI Plugin] Using direct_edit mode for script modification")
    end
    
    -- Force script_generation mode for new game/script creation
    if (lowerPrompt:find("create") or lowerPrompt:find("make") or lowerPrompt:find("new")) and 
       (lowerPrompt:find("game") or lowerPrompt:find("script")) and
       not (lowerPrompt:find("modify") or lowerPrompt:find("edit") or lowerPrompt:find("the script")) then
        mode = "script_generation"
        print("[AI Plugin] Using script_generation mode for new creation")
    end
    
    local data = {
        prompt = prompt,
        gameTree = getSmartGameTree(prompt, {}),
        requestSize = "medium",
        mode = mode
    }
    
    print("[AI Plugin] Sending request to:", config.apiUrl .. config.apiEndpoint)
    
    local success, result = pcall(function()
        return HttpService:RequestAsync({
            Url = config.apiUrl .. config.apiEndpoint,
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json"
            },
            Body = HttpService:JSONEncode(data)
        })
    end)
    
    if success then
        if result.Success then
            print("[AI Plugin] Request successful")
            return true, HttpService:JSONDecode(result.Body)
        else
            print("[AI Plugin] Server returned error:", result.StatusCode, result.Body)
            return false, "Server error: " .. (result.StatusCode or "unknown") .. " - " .. (result.Body or "")
        end
    else
        print("[AI Plugin] Request failed:", result)
        return false, "Failed to connect to AI service: " .. tostring(result)
    end
end

-- Function to find or create path
local function findOrCreatePath(startInstance, pathArray)
    local current = startInstance
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

-- Function to set instance properties
local function setInstanceProperties(instance, properties)
    for propName, value in pairs(properties) do
        if type(value) == "table" and value.type and value.value then
            if value.type == "Vector3" then
                if type(value.value) == "string" then
                    local parts = {}
                    for part in value.value:gmatch("[^,]+") do
                        table.insert(parts, tonumber(part:match("^%s*(.-)%s*$")))
                    end
                    if #parts == 3 then
                        instance[propName] = Vector3.new(parts[1], parts[2], parts[3])
                    end
                else
                    instance[propName] = Vector3.new(unpack(value.value))
                end
            elseif value.type == "Color3" then
                if type(value.value) == "string" then
                    local parts = {}
                    for part in value.value:gmatch("[^,]+") do
                        table.insert(parts, tonumber(part:match("^%s*(.-)%s*$")))
                    end
                    if #parts == 3 then
                        instance[propName] = Color3.fromRGB(parts[1], parts[2], parts[3])
                    end
                else
                    instance[propName] = Color3.fromRGB(unpack(value.value))
                end
            elseif value.type == "UDim2" then
                if type(value.value) == "string" then
                    local parts = {}
                    for part in value.value:gmatch("[^,]+") do
                        table.insert(parts, tonumber(part:match("^%s*(.-)%s*$")))
                    end
                    if #parts == 4 then
                        instance[propName] = UDim2.new(parts[1], parts[2], parts[3], parts[4])
                    end
                else
                    instance[propName] = UDim2.new(unpack(value.value))
                end
            else
                instance[propName] = value.value
            end
        elseif type(value) == "table" and type(value[1]) == "number" then
            if #value == 3 then
                if propName:match("Color") then
                    instance[propName] = Color3.new(unpack(value))
                else
                    instance[propName] = Vector3.new(unpack(value))
                end
            elseif #value == 4 then
                instance[propName] = UDim2.new(unpack(value))
            end
        else
            -- Handle special property types
            if propName == "BrickColor" and type(value) == "string" then
                local success, brickColor = pcall(function()
                    return BrickColor.new(value)
                end)
                if success then
                    instance[propName] = brickColor
                else
                    addMessage("Warning: Invalid BrickColor '" .. value .. "', using default", false)
                    instance[propName] = BrickColor.new("Medium stone grey")
                end
            elseif propName == "Material" and type(value) == "string" then
                local success, material = pcall(function()
                    return Enum.Material[value]
                end)
                if success then
                    instance[propName] = material
                else
                    addMessage("Warning: Invalid Material '" .. value .. "', using default", false)
                    instance[propName] = Enum.Material.Plastic
                end
            else
                instance[propName] = value
            end
        end
    end
end

-- Function to apply generated code
local function applyGeneratedCode(codeData)
    if not codeData then return end
    
    -- Handle script operations (modifications to existing scripts)
    if codeData.operations then
        for _, operation in ipairs(codeData.operations) do
            if operation.type == "modify_instance" and operation.path then
                -- Find the instance to modify
                local instance = game
                for _, pathPart in ipairs(operation.path) do
                    instance = instance:FindFirstChild(pathPart)
                    if not instance then 
                        addMessage("Could not find instance at path: " .. table.concat(operation.path, "/"), true)
                        break
                    end
                end
                
                if instance and operation.properties then
                    -- Check if this is a script modification
                    if instance:IsA("Script") or instance:IsA("LocalScript") or instance:IsA("ModuleScript") then
                        if operation.properties.Source then
                            instance.Source = operation.properties.Source
                            addMessage("Modified script: " .. instance.Name, false)
                        end
                    else
                        -- Regular property modification
                        setInstanceProperties(instance, operation.properties)
                        addMessage("Modified instance: " .. instance.Name, false)
                    end
                end
            elseif operation.type == "edit_script" and operation.path then
                -- Handle specific script editing operations
                local script = game
                for _, pathPart in ipairs(operation.path) do
                    script = script:FindFirstChild(pathPart)
                    if not script then 
                        addMessage("Could not find script at path: " .. table.concat(operation.path, "/"), true)
                        break
                    end
                end
                
                if script and (script:IsA("Script") or script:IsA("LocalScript") or script:IsA("ModuleScript")) then
                    if operation.newSource then
                        script.Source = operation.newSource
                        addMessage("Edited script: " .. script.Name, false)
                    elseif operation.modifications then
                        -- Handle line-by-line modifications
                        local lines = {}
                        if script.Source and script.Source ~= "" then
                            for line in (script.Source .. "\n"):gmatch("(.-)\n") do
                                table.insert(lines, line)
                            end
                        end
                        
                        for _, mod in ipairs(operation.modifications) do
                            if mod.action == "replace" and mod.lineNumber and mod.newContent then
                                if lines[mod.lineNumber] then
                                    lines[mod.lineNumber] = mod.newContent
                                end
                            elseif mod.action == "insert" and mod.lineNumber and mod.content then
                                table.insert(lines, mod.lineNumber, mod.content)
                            elseif mod.action == "append" and mod.content then
                                table.insert(lines, mod.content)
                            end
                        end
                        
                        script.Source = table.concat(lines, "\n")
                        addMessage("Applied modifications to script: " .. script.Name, false)
                    end
                end
            elseif operation.type == "delete_instance" and operation.path then
                -- Handle deletions
                local instance = game
                for _, pathPart in ipairs(operation.path) do
                    instance = instance:FindFirstChild(pathPart)
                    if not instance then 
                        addMessage("Could not find instance to delete at path: " .. table.concat(operation.path, "/"), true)
                        break
                    end
                end
                
                if instance then
                    local instanceName = instance.Name
                    instance:Destroy()
                    addMessage("Deleted instance: " .. instanceName, false)
                end
            end
        end
    end
    
    -- Handle script operations (legacy format)
    if codeData.scriptOperations then
        for _, operation in ipairs(codeData.scriptOperations) do
            if operation.path and operation.operation then
                local script = game
                for _, pathPart in ipairs(operation.path) do
                    script = script:FindFirstChild(pathPart)
                    if not script then 
                        addMessage("Could not find script at path: " .. table.concat(operation.path, "/"), true)
                        break
                    end
                end
                
                if script and (script:IsA("Script") or script:IsA("LocalScript") or script:IsA("ModuleScript")) then
                    if operation.operation == "modify" and operation.newContent then
                        script.Source = operation.newContent
                        addMessage("Modified script: " .. script.Name, false)
                    end
                end
            end
        end
    end
    
    -- Handle modifications (direct property changes)
    if codeData.modifications then
        for _, modData in ipairs(codeData.modifications) do
            local instance = game
            for _, pathPart in ipairs(modData.path) do
                instance = instance:FindFirstChild(pathPart)
                if not instance then break end
            end
            
            if instance and modData.properties then
                setInstanceProperties(instance, modData.properties)
                addMessage("Modified instance: " .. instance.Name, false)
            end
        end
    end
    
    -- Only create NEW scripts if we're NOT in modification mode
    if codeData.scripts then
        for _, scriptData in ipairs(codeData.scripts) do
            local targetParent = findOrCreatePath(game, scriptData.path)
            if targetParent then
                local newScript = Instance.new(scriptData.type)
                newScript.Name = scriptData.name
                newScript.Source = scriptData.source
                newScript.Parent = targetParent
                addMessage("Created NEW script: " .. scriptData.name .. " in " .. table.concat(scriptData.path, "/"), false)
            end
        end
    end
    
    -- Only create NEW instances if we're NOT in modification mode
    if codeData.instances then
        for _, instanceData in ipairs(codeData.instances) do
            local targetParent = findOrCreatePath(game, instanceData.path)
            if targetParent then
                local newInstance = Instance.new(instanceData.className)
                newInstance.Name = instanceData.name
                if instanceData.properties then
                    setInstanceProperties(newInstance, instanceData.properties)
                end
                newInstance.Parent = targetParent
                addMessage("Created NEW instance: " .. instanceData.name .. " (" .. instanceData.className .. ")", false)
            end
        end
    end
end

-- Handle button click
submitButton.MouseButton1Click:Connect(function()
    local prompt = promptBox.Text
    if prompt == "" then 
        addMessage("Please enter a prompt first!", true)
        return 
    end
    
    setLoadingState(true)
    addMessage("Generating code for: " .. prompt, false)
    
    local ok, successOrErr, response = pcall(function()
        return requestAIGeneration(prompt)
    end)
    
    if not ok then
        addMessage("Plugin error: " .. tostring(successOrErr), true)
        print("[AI Plugin] Error:", successOrErr)
    elseif successOrErr then
        local ok2, err2 = pcall(function()
            applyGeneratedCode(response.data)
        end)
        
        if ok2 then
            promptBox.Text = ""
            addMessage("Code generated and applied successfully!", false)
        else
            addMessage("Error applying changes: " .. tostring(err2), true)
            print("[AI Plugin] Error applying changes:", err2)
        end
    else
        addMessage("Error: " .. tostring(response), true)
        print("[AI Plugin] API Error:", response)
    end
    
    setLoadingState(false)
end)

-- Toggle widget visibility when toolbar button is clicked
toggleButton.Click:Connect(function()
    widget.Enabled = not widget.Enabled
end)