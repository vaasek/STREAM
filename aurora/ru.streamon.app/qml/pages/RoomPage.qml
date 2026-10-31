import QtQuick 2.6
import QtQuick.Window 2.2
import Sailfish.Silica 1.0
import ru.auroraos.WebView 1.0
import "../api.js" as Api

Page {
    id: page

    property string roomCode
    property string roomTitle
    property string titleText: roomTitle
    property string kind: "conference"
    property string roomPassword: ""
    property bool tokenSent: false
    property bool viewOpened: false
    property bool renderStarted: false
    property bool sharing: false
    property bool sending: false
    property string sentNote: ""
    property string failText: ""
    property string statusText: ""

    readonly property string roomUrl: Api.roomPageUrl(session.baseUrl, roomCode, true)

    allowedOrientations: Orientation.All

    PageHeader {
        id: header
        title: titleText.length ? titleText : roomCode
    }

    WebView {
        id: webView
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: header.bottom
        anchors.bottom: shareButton.top
        dpr: 1

        TouchInput { id: touchInput }
        MouseInput {}
        KeyboardInput {}

        onWidthChanged: page.syncView()
        onHeightChanged: page.syncView()
        onTitleChanged: {
            if (title.indexOf("SF:") === 0) {
                page.sending = false
                sendWatch.stop()
                var drawn = title.slice(3)
                if (drawn === "bad") {
                    page.sentNote = ""
                    page.statusText = "Кадр повреждён"
                    page.deliverFrame()
                } else if (page.sharing) {
                    page.statusText = "Экран уходит на стену · " + session.grabNote + " / " + drawn
                }
                return
            }
            if (title.indexOf("SS:") === 0)
                page.statusText = title.slice(3)
        }

        onLoadError: {
            console.log("Streamon room error", errorCode, url)
            page.failText = "Не удалось открыть комнату (" + errorCode + ")"
        }

        onLoadFinished: {
            page.syncView()
            if (httpStatusCode >= 400) {
                page.failText = "Сервер ответил " + httpStatusCode
                return
            }
            page.failText = ""
            page.prepareRoom()
        }
    }

    Timer {
        id: sharePoll
        interval: 1500
        onTriggered: page.readShareResult()
    }

    Timer {
        id: framePump
        interval: 800
        repeat: true
        onTriggered: page.requestFrame()
    }

    Timer {
        id: sendWatch
        interval: 1500
        onTriggered: {
            page.sending = false
            page.sentNote = ""
        }
    }

    Connections {
        target: session
        onGrabNoteChanged: page.deliverFrame()
    }

    Button {
        id: shareButton
        anchors.bottom: parent.bottom
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottomMargin: Theme.paddingLarge
        z: 2
        text: page.sharing ? "Остановить показ" : "Показать экран"
        onClicked: page.shareScreen()
    }

    Label {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: shareButton.top
        anchors.leftMargin: Theme.horizontalPageMargin
        anchors.rightMargin: Theme.horizontalPageMargin
        anchors.bottomMargin: Theme.paddingSmall
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.Wrap
        color: "#E8EEF6"
        font.pixelSize: Theme.fontSizeSmall
        visible: page.statusText.length > 0
        text: page.statusText
        z: 2
    }

    BusyIndicator {
        anchors.centerIn: webView
        size: BusyIndicatorSize.Large
        running: webView.loading && page.failText.length === 0
    }

    Rectangle {
        anchors.fill: webView
        visible: page.failText.length > 0
        color: "#090C10"

        Label {
            anchors.centerIn: parent
            width: parent.width - 2 * Theme.horizontalPageMargin
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
            color: "#E8EEF6"
            text: page.failText
        }
    }

    Connections {
        target: PermissionHandler
        onPermissionsRequested: permissionRequest.accept()
        onMediaAccessRequested: mediaAccessRequest.accept()
    }

    Connections {
        target: JSDialogHandler
        onAlertDialogRequested: jsDialogRequest.ok()
        onConfirmDialogRequested: jsDialogRequest.ok()
    }

    Component.onCompleted: {
        refresh()
        syncView()
    }

    onStatusChanged: {
        if (status === PageStatus.Active)
            syncView()
    }

    function syncView() {
        var w = Math.round(webView.width)
        var h = Math.round(webView.height)
        console.log("Streamon view", w, h)
        if (w < 2 || h < 2)
            return
        if (!viewOpened) {
            viewOpened = true
            webView.url = roomUrl
        }
        if (!renderStarted) {
            renderStarted = true
            webView.startRender()
        }
    }

    function refresh() {
        Api.request("GET", Api.normalize(session.baseUrl) + "/api/rooms/" + encodeURIComponent(roomCode) + "/public", "", null, function (info) {
            kind = info.type || "conference"
            titleText = info.title || roomTitle || roomCode
        }, function (message) {
            failText = message
        })
    }

    function prepareRoom() {
        if (!tokenSent && session.token.length > 0) {
            tokenSent = true
            webView.runJavaScript("localStorage.setItem('streamon_token'," + jsString(session.token) + ")", function () {
                webView.reload()
            }, function () {})
            return
        }
        if (roomPassword.length > 0)
            webView.runJavaScript(passwordScript(), function () {}, function () {})
        webView.runJavaScript(armScript(), function () {}, function () {})
        framePump.start()
    }

    function requestFrame() {
        var win = page.Window.window
        if (!win) {
            statusText = "Окно не найдено"
            return
        }
        session.requestGrab(win)
    }

    function deliverFrame() {
        var note = session.grabNote
        if (!sharing)
            statusText = note
        if (sending || note === sentNote)
            return
        var jpeg = session.frame
        if (!jpeg || jpeg.length < 32 || note.indexOf("кадр") !== 0)
            return
        sending = true
        sentNote = note
        sendWatch.stop()
        sendWatch.start()
        var step = 1000
        var scripts = ["window.__parts=[]"]
        for (var i = 0; i < jpeg.length; i += step)
            scripts.push("window.__parts.push('" + jpeg.substring(i, i + step) + "')")
        scripts.push("if(window.__frame)window.__frame(window.__parts.join(''));window.__parts=[]")
        for (var s = 0; s < scripts.length; s++)
            webView.runJavaScript(scripts[s])
    }

    function shareScreen() {
        if (sharing) {
            statusText = "Останавливаю показ…"
            framePump.stop()
            webView.runJavaScript("(function(){var button=document.querySelector('[aria-label=\"Экран\"]');if(button)button.click();return 'stop';})()", function () {
                sharing = false
                statusText = ""
            }, function () {
                statusText = "Не удалось остановить показ"
            })
            return
        }
        statusText = "Запускаю показ экрана…"
        framePump.start()
        sharePoll.interval = 4000
        sharePoll.stop()
        sharePoll.start()
        webView.runJavaScript(armScript(), function () {
            webView.runJavaScript(buttonPointScript(), function (result) {
                var parts = String(result || "").split(",")
                var x = parseInt(parts[0], 10)
                var y = parseInt(parts[1], 10)
                if (parts.length === 2 && !isNaN(x) && !isNaN(y)) {
                    touchInput.touchPressed(1, x, y)
                    touchInput.touchReleased(1, x, y)
                }
                sharePoll.start()
            }, function () {
                statusText = "Не удалось показать экран"
            })
        }, function () {
            statusText = "Не удалось показать экран"
        })
    }

    function readShareResult() {
        webView.runJavaScript("(function(){var text=String(window.__streamonShare||'');document.title='SS:'+text;return text;})()", function (result) {
            var text = String(result || webView.title || "")
            if (text.indexOf("SS:") === 0)
                text = text.slice(3)
            if (text === "ok" || text.indexOf("кадров") === 0) {
                sharing = true
                statusText = text === "ok" ? "Экран уходит на стену" : "Экран уходит на стену · " + text
            } else if (text.indexOf("NotReadable") >= 0) {
                sharing = false
                statusText = "Видеокарта не отдала экран"
            } else if (text.length > 0) {
                sharing = false
                statusText = text
            } else {
                sharing = false
                statusText = "Показ не стартовал"
            }
        }, function () {
            statusText = "Не удалось показать экран"
        })
    }

    function armScript() {
        return "(function(){var canvas=document.getElementById('streamon-grab');"
            + "if(!canvas){canvas=document.createElement('canvas');canvas.id='streamon-grab';canvas.width=240;canvas.height=426;"
            + "canvas.style.cssText='position:fixed;right:8px;top:52px;width:72px;height:128px;opacity:1;z-index:30;pointer-events:none;background:#16324f';"
            + "(document.body||document.documentElement).appendChild(canvas);}"
            + "var ctx=canvas.getContext('2d');"
            + "function tick(){var track=window.__grabStream&&window.__grabStream.getVideoTracks()[0];if(track&&track.requestFrame)track.requestFrame();"
            + "window.__frames=(window.__frames||0)+1;document.title='SF:'+window.__frames;"
            + "var wait=window.__grabWait||[];window.__grabWait=[];wait.forEach(function(fn){fn();});}"
            + "window.__frame=function(b64){var img=new Image();img.onerror=function(){document.title='SF:bad';};img.onload=function(){ctx.drawImage(img,0,0,canvas.width,canvas.height);tick();};img.src='data:image/jpeg;base64,'+b64;};"
            + "if(!window.__grabStream){ctx.fillStyle='#16324f';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.font='28px sans-serif';ctx.fillText('Streamon',24,80);"
            + "if(!canvas.captureStream){window.__streamonShare='Показ кадра недоступен';document.title='SS:'+window.__streamonShare;return 'no';}"
            + "window.__grabStream=canvas.captureStream(8);tick();}"
            + "window.__grabWait=window.__grabWait||[];"
            + "if(navigator.mediaDevices){navigator.mediaDevices.getDisplayMedia=function(){return new Promise(function(resolve){var done=false;function go(){if(done)return;done=true;window.__streamonShare='ok';document.title='SS:ok';resolve(window.__grabStream);}"
            + "if((window.__frames||0)>=2)go();else{window.__grabWait.push(go);setTimeout(go,2500);}});};}"
            + "return 'armed';})()"
    }

    function buttonPointScript() {
        return "(function(){var button=document.querySelector('.empty-wall .btn')||document.querySelector('[aria-label=\"Экран\"]');"
            + "if(!button){window.__streamonShare='Комната ещё открывается';return '';}"
            + "button.scrollIntoView({block:'center'});var r=button.getBoundingClientRect();"
            + "return Math.round(r.left+r.width/2)+','+Math.round(r.top+r.height/2);})()"
    }

    function jsString(value) {
        return "'" + String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'"
    }

    function passwordScript() {
        return "(function(){var value=" + jsString(roomPassword) + ";"
            + "function fill(){var input=document.querySelector('input[type=password]');if(!input)return false;"
            + "var set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"
            + "set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));"
            + "var form=input.form||input.closest('form');"
            + "if(form){if(form.requestSubmit)form.requestSubmit();else form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}"
            + "return true;}if(!fill()){var n=0;var t=setInterval(function(){if(fill()||++n>15)clearInterval(t);},300);}})()"
    }
}
