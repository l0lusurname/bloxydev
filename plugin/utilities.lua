-- Add these functions before the button click handler

-- Function to add message to the scroll frame
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
end

-- Function to show loading state
local function setLoadingState(isLoading)
    submitButton.Text = isLoading and "Generating..." or "Generate Code"
    submitButton.Enabled = not isLoading
    promptBox.Enabled = not isLoading
end