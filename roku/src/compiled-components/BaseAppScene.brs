sub init()
    m.app = m.top.findNode("palcoApp")
    m.socket = CreateObject("roSGNode", "PalcoSocketTask")
    m.top.appendChild(m.socket)
    config = PalcoLoadSettings()
    m.socket.host = config.host
    m.socket.wsPort = config.wsPort
    m.socket.token = config.token
    m.socket.observeField("message", "onPalcoMessage")
    m.socket.observeField("connectionState", "onConnectionState")
    m.app.setFocus(true)
end sub

sub onPalcoMessage()
    message = m.socket.message
    if message <> invalid then m.app.message = message
end sub

sub onConnectionState()
    m.app.connectionState = m.socket.connectionState
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if press and key = "options" then
        ' Settings remain in Registry; sender config is never logged.
        return true
    end if
    return false
end function
