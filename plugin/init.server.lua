-- Get required services
local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")

-- AI Assistant Configuration
local config = {
    apiUrl = "https://bloxydev-production.up.railway.app", -- Railway deployment URL
    apiEndpoint = "/api/ai/chat", -- Using chat endpoint (no auth required)
    testEndpoint = "/api/test", -- Test endpoint
    debug = true -- Enable debug logging
}

-- Test server connection on startup
spawn(function()
    if config.debug then
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
            print("[AI Plugin] Available endpoints:", HttpService:JSONEncode(data.endpoints))
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
            else
                warn("[AI Plugin] Connection failed:", healthResult)
                warn("[AI Plugin] Make sure the server is running and the URL is correct")
            end
        end
    end
end)

-- AI Assistant Plugin for Roblox Studio
local PluginName = "AI Dev Assistant"

-- Create the plugin toolbar and button
local toolbar = plugin:CreateToolbar(PluginName)
local toggleButton = toolbar:CreateButton(
    "AI Assistant 1.0 [SEX VERSION]",
    "Open AI Assistant",
    "rbxassetid://4458901886" -- Default script icon
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

-- Load utilities module (safe require). Utilities expect the UI objects (scrollFrame, listLayout, promptBox, submitButton)
-- to exist when their functions are called, so require after UI creation.
local utilities
pcall(function()
    -- Try common require paths used in plugin structure
    if script and script.Parent and script.Parent:FindFirstChild("utilities") then
        utilities = require(script.Parent:FindFirstChild("utilities"))
    elseif plugin and plugin:FindFirstChild("utilities") then
        utilities = require(plugin:FindFirstChild("utilities"))
    end
end)

-- Safe local bindings with fallbacks to prevent nil calls
local addMessage = (utilities and utilities.addMessage) or function(msg, isError)
    if isError then
        warn("AI Plugin - ", tostring(msg))
    else
        print("AI Plugin - ", tostring(msg))
    end
end

local setLoadingState = (utilities and utilities.setLoadingState) or function(_) end

-- Function to get the game tree
local function getGameTree()
    local function serializeInstance(instance)
        local result = {
            Name = instance.Name,
            ClassName = instance.ClassName,
            Children = {}
        }
        
        -- Serialize relevant properties based on class
        if instance:IsA("BasePart") then
            result.Properties = {
                Position = tostring(instance.Position),
                Size = tostring(instance.Size),
                CFrame = tostring(instance.CFrame)
            }
        elseif instance:IsA("Script") or instance:IsA("LocalScript") or instance:IsA("ModuleScript") then
            result.Properties = {
                Source = instance.Source
            }
        end
        
        -- Recursively serialize children
        for _, child in ipairs(instance:GetChildren()) do
            table.insert(result.Children, serializeInstance(child))
        end
        
        return result
    end
    
    return {
        Workspace = serializeInstance(game.Workspace),
        StarterGui = serializeInstance(game.StarterGui),
        ReplicatedStorage = serializeInstance(game.ReplicatedStorage),
        ServerStorage = serializeInstance(game.ServerStorage),
        Players = serializeInstance(game.Players),
        Lighting = serializeInstance(game.Lighting)
    }
end

-- Function to send request to AI service
local function requestAIGeneration(prompt)
    local data = {
        prompt = prompt,
        gameTree = getGameTree(),
        requestSize = "medium" -- Can be configurable later
    }
    
    if config.debug then
        print("[AI Plugin] Sending request to:", config.apiUrl .. config.apiEndpoint)
    end
    
    -- Test server connection first
    local testSuccess, testResult = pcall(function()
        return HttpService:RequestAsync({
            Url = config.apiUrl .. "/health",
            Method = "GET"
        }).Body
    end)
    
    if not testSuccess then
        if config.debug then
            print("[AI Plugin] Server connection test failed:", testResult)
            print("[AI Plugin] Make sure the server is running: npm run start")
        end
        return false, "Server is not responding. Make sure it's running (npm run start)"
    end
    
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
            if config.debug then
                print("[AI Plugin] Request successful")
            end
            return true, HttpService:JSONDecode(result.Body)
        else
            if config.debug then
                print("[AI Plugin] Server returned error:", result.StatusCode, result.Body)
            end
            return false, "Server error: " .. (result.StatusCode or "unknown") .. " - " .. (result.Body or "")
        end
    else
        if config.debug then
            print("[AI Plugin] Request failed:", result)
        end
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
        -- Handle typed properties from AI service (new format)
        if type(value) == "table" and value.type and value.value then
            if value.type == "Vector3" then
                instance[propName] = Vector3.new(unpack(value.value))
            elseif value.type == "Color3" then
                instance[propName] = Color3.fromRGB(unpack(value.value))
            elseif value.type == "CFrame" then
                if #value.value == 3 then
                    -- Position only
                    instance[propName] = CFrame.new(unpack(value.value))
                elseif #value.value == 12 then
                    -- Full CFrame with rotation matrix
                    instance[propName] = CFrame.new(unpack(value.value))
                elseif #value.value == 6 then
                    -- Position + lookVector
                    local pos = {value.value[1], value.value[2], value.value[3]}
                    local look = {value.value[4], value.value[5], value.value[6]}
                    instance[propName] = CFrame.lookAt(Vector3.new(unpack(pos)), Vector3.new(unpack(look)))
                end
            elseif value.type == "UDim2" then
                instance[propName] = UDim2.new(unpack(value.value))
            else
                -- Fallback for unknown typed values
                instance[propName] = value.value
            end
        -- Handle legacy raw array properties (backward compatibility)
        elseif type(value) == "table" and type(value[1]) == "number" then
            if #value == 3 then
                if propName:match("Color") then
                    instance[propName] = Color3.new(unpack(value))
                else
                    instance[propName] = Vector3.new(unpack(value))
                end
            elseif #value == 4 then
                -- UDim2 format
                instance[propName] = UDim2.new(unpack(value))
            elseif #value == 12 then
                -- CFrame properties
                instance[propName] = CFrame.new(unpack(value))
            else
                -- Direct property assignment for other arrays
                instance[propName] = value
            end
        else
            -- Direct property assignment for simple types
            instance[propName] = value
        end
    end
end

-- Function to handle script line operations (read/modify specific lines)
local function handleScriptLineOperation(operation)
    if not operation.path or not operation.operation then return end
    
    -- Find the script instance
    local script = game
    for _, pathPart in ipairs(operation.path) do
        script = script:FindFirstChild(pathPart)
        if not script then 
            addMessage("Could not find script at path: " .. table.concat(operation.path, "/"), true)
            return 
        end
    end
    
    -- Ensure it's a script-like object
    if not (script:IsA("Script") or script:IsA("LocalScript") or script:IsA("ModuleScript")) then
        addMessage("Object is not a script: " .. script.Name, true)
        return
    end
    
    -- Split source into lines more safely
    local lines = {}
    if script.Source and script.Source ~= "" then
        for line in (script.Source .. "\n"):gmatch("(.-)\n") do
            table.insert(lines, line)
        end
    end
    
    if operation.operation == "read" then
        -- Read specific line range with proper validation
        local startLine = math.max(1, operation.lineStart or 1)
        local endLine = math.min(#lines, operation.lineEnd or #lines)
        
        -- Ensure valid range
        if startLine > endLine then
            addMessage("Invalid line range: start (" .. startLine .. ") > end (" .. endLine .. ")", true)
            return
        end
        
        local readLines = {}
        for i = startLine, endLine do
            table.insert(readLines, lines[i] or "")
        end
        
        addMessage("Read lines " .. startLine .. "-" .. endLine .. " from " .. script.Name .. ":\n" .. table.concat(readLines, "\n"), false)
        
    elseif operation.operation == "modify" and operation.newContent then
        -- Modify specific line range with proper validation
        local startLine = math.max(1, operation.lineStart or 1)
        local endLine = math.min(#lines, operation.lineEnd or startLine)
        
        -- Ensure valid range
        if startLine > endLine then
            addMessage("Invalid line range: start (" .. startLine .. ") > end (" .. endLine .. ")", true)
            return
        end
        
        -- Split new content into lines more safely
        local newContentLines = {}
        if operation.newContent and operation.newContent ~= "" then
            for line in (operation.newContent .. "\n"):gmatch("(.-)\n") do
                table.insert(newContentLines, line)
            end
        end
        
        -- Remove old lines from end to start to maintain indices
        for i = endLine, startLine, -1 do
            table.remove(lines, i)
        end
        
        -- Insert new lines at the starting position
        for i = #newContentLines, 1, -1 do
            table.insert(lines, startLine, newContentLines[i])
        end
        
        script.Source = table.concat(lines, "\n")
        addMessage("Modified lines " .. startLine .. "-" .. endLine .. " in " .. script.Name, false)
    end
end

-- Function to handle part deletions
local function handlePartDeletion(deletion)
    if not deletion.path and not deletion.name and not deletion.className then 
        addMessage("Deletion requires either path, name, or className", true)
        return 
    end
    
    if deletion.operation == "single" then
        -- Delete a single part by path
        if deletion.path and #deletion.path > 0 then
            local instance = game
            for _, pathPart in ipairs(deletion.path) do
                instance = instance:FindFirstChild(pathPart)
                if not instance then 
                    addMessage("Could not find part at path: " .. table.concat(deletion.path, "/"), true)
                    return 
                end
            end
            
            local partName = instance.Name
            instance:Destroy()
            addMessage("Deleted part: " .. partName, false)
        else
            addMessage("Single deletion requires a valid path", true)
        end
        
    elseif deletion.operation == "bulk" then
        -- Delete all parts with the same name/type within specified scope
        if not deletion.name and not deletion.className then
            addMessage("Bulk deletion requires either name or className criteria", true)
            return
        end
        
        local deletedCount = 0
        local searchName = deletion.name
        local searchClassName = deletion.className
        local deleteAll = deletion.deleteAll or false
        
        local function deleteRecursive(parent, depth)
            -- Add depth limit for safety
            if depth > 50 then
                addMessage("Recursion depth limit reached, stopping deletion", true)
                return
            end
            
            local children = parent:GetChildren()
            for _, child in ipairs(children) do
                local shouldDelete = false
                
                -- Match criteria based on deleteAll flag
                if deleteAll then
                    -- Delete if ANY criteria matches
                    if (searchName and child.Name == searchName) or
                       (searchClassName and child.ClassName == searchClassName) then
                        shouldDelete = true
                    end
                else
                    -- Delete only if ALL specified criteria match
                    local nameMatches = not searchName or child.Name == searchName
                    local classMatches = not searchClassName or child.ClassName == searchClassName
                    shouldDelete = nameMatches and classMatches
                end
                
                if shouldDelete then
                    local childName = child.Name
                    local childClass = child.ClassName
                    child:Destroy()
                    deletedCount = deletedCount + 1
                    addMessage("Deleted: " .. childName .. " (" .. childClass .. ")", false)
                else
                    -- Continue recursing only if not deleted
                    deleteRecursive(child, depth + 1)
                end
            end
        end
        
        -- Determine starting point with proper scope limiting
        local startPoint = game.Workspace -- Default scope
        if deletion.path and #deletion.path > 0 then
            startPoint = game
            for _, pathPart in ipairs(deletion.path) do
                startPoint = startPoint:FindFirstChild(pathPart)
                if not startPoint then 
                    addMessage("Could not find starting path: " .. table.concat(deletion.path, "/"), true)
                    return 
                end
            end
        end
        
        addMessage("Starting bulk deletion from: " .. startPoint:GetFullName(), false)
        deleteRecursive(startPoint, 0)
        addMessage("Bulk deletion complete: " .. deletedCount .. " objects deleted", false)
    end
end

-- Function to apply generated code
local function applyGeneratedCode(codeData)
    if not codeData then return end
    
    -- Create or modify scripts
    if codeData.scripts then
        for _, scriptData in ipairs(codeData.scripts) do
            local targetParent = findOrCreatePath(game, scriptData.path)
            if targetParent then
                local newScript = Instance.new(scriptData.type)
                newScript.Name = scriptData.name
                newScript.Source = scriptData.source
                newScript.Parent = targetParent
            end
        end
    end
    
    -- Handle line-range script operations
    if codeData.scriptOperations then
        for _, operation in ipairs(codeData.scriptOperations) do
            handleScriptLineOperation(operation)
        end
    end
    
    -- Create new instances
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
            end
        end
    end
    
    -- Modify existing instances
    if codeData.modifications then
        for _, modData in ipairs(codeData.modifications) do
            local instance = game
            for _, pathPart in ipairs(modData.path) do
                instance = instance:FindFirstChild(pathPart)
                if not instance then break end
            end
            
            if instance and modData.properties then
                setInstanceProperties(instance, modData.properties)
            end
        end
    end
    
    -- Handle part deletions
    if codeData.deletions then
        for _, deletion in ipairs(codeData.deletions) do
            handlePartDeletion(deletion)
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
    
    -- Wrapped in pcall to catch any unexpected errors
    local ok, successOrErr, response = pcall(function()
        return requestAIGeneration(prompt)
    end)
    
    if not ok then
        addMessage("Plugin error: " .. tostring(successOrErr), true)
        if config.debug then
            warn("[AI Plugin] Error:", successOrErr)
        end
    elseif successOrErr then -- success case
        local ok2, err2 = pcall(function()
            applyGeneratedCode(response.data)
        end)
        
        if ok2 then
            promptBox.Text = ""
            addMessage("Code generated and applied successfully!", false)
        else
            addMessage("Error applying changes: " .. tostring(err2), true)
            if config.debug then
                warn("[AI Plugin] Error applying changes:", err2)
            end
        end
    else -- API error case
        addMessage("Error: " .. tostring(response), true)
        if config.debug then
            warn("[AI Plugin] API Error:", response)
        end
    end
    
    setLoadingState(false)
end)

-- Toggle widget visibility when toolbar button is clicked
toggleButton.Click:Connect(function()
    widget.Enabled = not widget.Enabled
end)