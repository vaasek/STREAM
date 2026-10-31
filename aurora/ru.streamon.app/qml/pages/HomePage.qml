import QtQuick 2.6
import Sailfish.Silica 1.0
import "../api.js" as Api

Page {
    id: page

    Rectangle {
        anchors.fill: parent
        color: "#090C10"
        z: -1
    }

    SilicaListView {
        id: rooms
        anchors.fill: parent
        model: roomModel
        header: headerColumn
        spacing: Theme.paddingSmall

        ViewPlaceholder {
            enabled: rooms.count === 0 && !busy
            text: "Сейчас нет живых комнат"
        }

    Component {
        id: headerColumn
        Column {
            width: rooms.width
            spacing: Theme.paddingMedium

            Item { width: 1; height: Theme.paddingMedium }

            Row {
                width: parent.width - 2 * Theme.horizontalPageMargin
                x: Theme.horizontalPageMargin
                spacing: Theme.paddingMedium

                Label {
                    width: parent.width - logoutButton.width - Theme.paddingMedium
                    color: "#E8EEF6"
                    font.pixelSize: Theme.fontSizeLarge
                    font.bold: true
                    elide: Text.ElideRight
                    text: session.userName.length ? ("Здравствуйте, " + session.userName) : "Комнаты"
                }

                Button {
                    id: logoutButton
                    text: "Выйти"
                    preferredWidth: Theme.buttonWidthSmall
                    onClicked: page.logout()
                }
            }

            TextField {
                x: Theme.horizontalPageMargin
                width: parent.width - 2 * Theme.horizontalPageMargin
                placeholderText: "Код комнаты"
                label: "Код комнаты"
                text: session.lastCode
                onTextChanged: page.codeText = text
                EnterKey.iconSource: "image://theme/icon-m-enter-next"
                EnterKey.onClicked: roomPasswordField.focus = true
            }

            TextField {
                id: roomPasswordField
                x: Theme.horizontalPageMargin
                width: parent.width - 2 * Theme.horizontalPageMargin
                placeholderText: "Пароль комнаты, если есть"
                label: "Пароль комнаты"
                echoMode: TextInput.Password
                text: page.roomPassword
                onTextChanged: page.roomPassword = text
                EnterKey.iconSource: "image://theme/icon-m-enter-accept"
                EnterKey.onClicked: page.joinTyped()
            }

            Row {
                x: Theme.horizontalPageMargin
                width: parent.width - 2 * Theme.horizontalPageMargin
                spacing: Theme.paddingMedium

                Button {
                    text: "Войти в комнату"
                    preferredWidth: (parent.width - Theme.paddingMedium) / 2
                    onClicked: page.joinTyped()
                }

                Button {
                    text: "Стена экранов"
                    preferredWidth: (parent.width - Theme.paddingMedium) / 2
                    enabled: !page.busy
                    onClicked: page.createWall()
                }
            }

            Label {
                x: Theme.horizontalPageMargin
                width: parent.width - 2 * Theme.horizontalPageMargin
                wrapMode: Text.Wrap
                color: "#FF6B7D"
                font.pixelSize: Theme.fontSizeSmall
                visible: page.errorText.length > 0
                text: page.errorText
            }

        Label {
            x: Theme.horizontalPageMargin
            width: parent.width - 2 * Theme.horizontalPageMargin
            color: "#8EA0B5"
            font.pixelSize: Theme.fontSizeSmall
            text: "Живые комнаты"
        }
        }
    }

    delegate: ListItem {
        width: rooms.width
        contentHeight: card.height + Theme.paddingSmall

        Rectangle {
            id: card
            x: Theme.horizontalPageMargin
            width: parent.width - 2 * Theme.horizontalPageMargin
            height: textColumn.height + Theme.paddingLarge
            radius: Theme.paddingSmall
            color: "#17202A"

            Column {
                id: textColumn
                anchors.verticalCenter: parent.verticalCenter
                x: Theme.paddingMedium
                width: parent.width - 2 * Theme.paddingMedium
                spacing: Theme.paddingSmall

                Label {
                    color: "#3EE0A2"
                    font.pixelSize: Theme.fontSizeExtraSmall
                    text: Api.roomKind(model.type)
                }
                Label {
                    width: parent.width
                    color: "#E8EEF6"
                    font.pixelSize: Theme.fontSizeMedium
                    elide: Text.ElideRight
                    text: model.title || "Без названия"
                }
                Label {
                    width: parent.width
                    color: "#8EA0B5"
                    font.pixelSize: Theme.fontSizeSmall
                    text: model.code + " · " + peopleText(model.peers)
                }
            }
        }

        onClicked: openKnown(model.code, model.title, model.hasPassword)
    }
    }

    ListModel { id: roomModel }

    property bool busy: false
    property string errorText: ""
    property string codeText: ""
    property string roomPassword: ""

    Component.onCompleted: {
        console.log("Streamon home")
        codeText = session.lastCode
        loadLive()
    }

    function peopleText(peers) {
        if (!peers)
            return "пусто"
        if (peers === 1)
            return "1 человек"
        return peers + " в комнате"
    }

    function loadLive() {
        busy = true
        errorText = ""
        Api.request("GET", Api.normalize(session.baseUrl) + "/api/live", session.token, null, function (data) {
            busy = false
            roomModel.clear()
            var list = data.rooms || []
            for (var i = 0; i < list.length; i++) {
                var room = list[i]
                roomModel.append({
                    code: room.code || "",
                    title: room.title || "",
                    type: room.type || "conference",
                    peers: room.peers || 0,
                    hasPassword: !!room.hasPassword
                })
            }
        }, function (message) {
            busy = false
            errorText = message
        })
    }

    function joinTyped() {
        var code = codeText.trim()
        if (!code) {
            errorText = "Введите код комнаты"
            return
        }
        errorText = ""
        Api.request("GET", Api.normalize(session.baseUrl) + "/api/rooms/" + encodeURIComponent(code.toLowerCase()) + "/public", "", null, function (info) {
            var roomCode = info.code || code
            var title = info.title || code
            if (page.roomPassword.length > 0)
                openRoom(roomCode, title, page.roomPassword)
            else if (info.hasPassword)
                askPassword(roomCode, title)
            else
                openRoom(roomCode, title, "")
        }, function (message) {
            errorText = message
        })
    }

    function openKnown(code, title, hasPassword) {
        if (page.roomPassword.length > 0)
            openRoom(code, title, page.roomPassword)
        else if (hasPassword)
            askPassword(code, title)
        else
            openRoom(code, title, "")
    }

    function askPassword(code, title) {
        var dialog = pageStack.push(Qt.resolvedUrl("PasswordDialog.qml"), {
            roomCode: code,
            roomTitle: title,
            entered: page.roomPassword
        })
        dialog.accepted.connect(function () {
            page.roomPassword = dialog.entered
            openRoom(code, title, dialog.entered)
        })
    }

    function openRoom(code, title, password) {
        session.lastCode = String(code || "").toLowerCase()
        pageStack.push(Qt.resolvedUrl("RoomPage.qml"), {
            roomCode: session.lastCode,
            roomTitle: title || session.lastCode,
            roomPassword: password || ""
        })
    }

    function createWall() {
        busy = true
        errorText = ""
        Api.request("POST", Api.normalize(session.baseUrl) + "/api/rooms", session.token, {
            title: "Стена экранов",
            type: "wall",
            isPublic: true,
            maxParticipants: 0,
            password: page.roomPassword
        }, function (data) {
            busy = false
            var room = data.room || {}
            loadLive()
            openRoom(room.code || "", room.title || "Стена экранов", page.roomPassword)
        }, function (message) {
            busy = false
            errorText = message
        })
    }

    function logout() {
        session.token = ""
        session.userName = ""
        pageStack.replace(Qt.resolvedUrl("LoginPage.qml"))
    }
}
