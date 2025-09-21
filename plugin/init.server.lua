-- AI Assistant Plugin for Roblox Studio
local PluginName = "AI Dev Assistant"
local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")

-- Configuration
local config = {
    apiUrl = "http://localhost:3000", -- Change this to your deployed API URL
    apiEndpoint = "/api/ai/generate",
}

-- Create the plugin toolbar and button
local toolbar = plugin:CreateToolbar(PluginName)
local toggleButton = toolbar:CreateButton(
    "AI Assistant",
    "Open AI Assistant",
    "rbxassetid://0" -- Replace with your icon ID
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
frame.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
frame.Parent = widget

local scrollFrame = Instance.new("ScrollingFrame")
scrollFrame.Size = UDim2.new(1, -20, 1, -120)
scrollFrame.Position = UDim2.new(0, 10, 0, 10)
scrollFrame.BackgroundTransparency = 1
scrollFrame.Parent = frame

local promptBox = Instance.new("TextBox")
promptBox.Size = UDim2.new(1, -20, 0, 60)
promptBox.Position = UDim2.new(0, 10, 1, -100)
promptBox.TextWrapped = true
promptBox.PlaceholderText = "Enter your prompt here..."
promptBox.Parent = frame

local submitButton = Instance.new("TextButton")
submitButton.Size = UDim2.new(1, -20, 0, 30)
submitButton.Position = UDim2.new(0, 10, 1, -30)
submitButton.Text = "Generate Code"
submitButton.Parent = frame

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
    
    if success and result.Success then
        return true, HttpService:JSONDecode(result.Body)
    else
        return false, "Failed to connect to AI service"
    end
end

-- Function to apply generated code
local function applyGeneratedCode(codeData)
    if not codeData or not codeData.scripts then return end
    
    for _, scriptData in ipairs(codeData.scripts) do
        local targetParent = game
        for _, pathPart in ipairs(scriptData.path) do
            targetParent = targetParent:FindFirstChild(pathPart)
            if not targetParent then break end
        end
        
        if targetParent then
            local newScript = Instance.new(scriptData.type)
            newScript.Name = scriptData.name
            newScript.Source = scriptData.source
            newScript.Parent = targetParent
        end
    end
end

-- Handle button click
submitButton.MouseButton1Click:Connect(function()
    local prompt = promptBox.Text
    if prompt == "" then return end
    
    submitButton.Text = "Generating..."
    submitButton.Enabled = false
    
    local success, response = requestAIGeneration(prompt)
    
    if success then
        applyGeneratedCode(response.data)
        promptBox.Text = ""
    else
        -- Show error in the UI
        local errorLabel = Instance.new("TextLabel")
        errorLabel.Text = "Error: " .. tostring(response)
        errorLabel.Size = UDim2.new(1, -20, 0, 30)
        errorLabel.Position = UDim2.new(0, 10, 0, scrollFrame.CanvasSize.Y.Offset)
        errorLabel.Parent = scrollFrame
        scrollFrame.CanvasSize = UDim2.new(0, 0, 0, scrollFrame.CanvasSize.Y.Offset + 40)
    end
    
    submitButton.Text = "Generate Code"
    submitButton.Enabled = true
end)

-- Toggle widget visibility when toolbar button is clicked
toggleButton.Click:Connect(function()
    widget.Enabled = not widget.Enabled
end)