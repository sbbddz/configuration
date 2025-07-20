for i = 1, 9 do
    -- Set shortcut: Cmd+Shift+Option+Number
    hs.hotkey.bind({"ctrl", "shift", "option"}, tostring(i), function()
        local app = hs.application.frontmostApplication()
        if app then
            local bundleID = app:bundleID()
            hs.settings.set("is_" .. i, bundleID)
            hs.alert.show("Shortcut set: Cmd+" .. i .. " → " .. app:name())
        end
    end)

    -- Recall shortcut: Cmd+Number
    hs.hotkey.bind({"cmd"}, tostring(i), function()
        local bundleID = hs.settings.get("is_" .. i)
        if bundleID then
            hs.application.launchOrFocusByBundleID(bundleID)
        end
    end)
end
