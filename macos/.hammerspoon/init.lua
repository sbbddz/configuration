for i = 1, 9 do
    -- Set shortcut: Cmd+Shift+Number
    hs.hotkey.bind({"cmd", "shift"}, tostring(i), function()
        local windows = hs.window.orderedWindows()
        if not windows[1] then return end

        local firstWin = windows[1]
        local winFrame = firstWin:frame()
        local screenFrame = firstWin:screen():frame()
        local isMaximized = math.abs(winFrame.w - screenFrame.w) < 5 and math.abs(winFrame.h - screenFrame.h) < 5

        local bundleIDs = {}
        local saveCount = isMaximized and 1 or 2

        for j = 1, saveCount do
            if windows[j] then
                local app = windows[j]:application()
                if app then
                    table.insert(bundleIDs, app:bundleID())
                end
            end
        end

        if #bundleIDs > 0 then
            hs.settings.set("is_" .. i, bundleIDs)
            local appNames = {}
            for _, bid in ipairs(bundleIDs) do
                local app = hs.application.get(bid)
                if app then
                    table.insert(appNames, app:name())
                end
            end
            hs.alert.show("Saved " .. #bundleIDs .. " app(s) to " .. i .. ": " .. table.concat(appNames, ", "))
        end
    end)

    -- Recall shortcut: Cmd+Number
    hs.hotkey.bind({"cmd"}, tostring(i), function()
        local bundleIDs = hs.settings.get("is_" .. i)
        if not bundleIDs or #bundleIDs == 0 then return end

        for j = #bundleIDs, 1, -1 do
            hs.application.launchOrFocusByBundleID(bundleIDs[j])
        end
    end)
end
