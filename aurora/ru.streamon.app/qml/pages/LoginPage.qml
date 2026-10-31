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

    SilicaFlickable {
        anchors.fill: parent
        contentHeight: column.height + Theme.paddingLarge * 2

        Column {
            id: column
            width: parent.width - 2 * Theme.horizontalPageMargin
            x: Theme.horizontalPageMargin
            spacing: Theme.paddingLarge

            Item { width: 1; height: Theme.paddingLarge }

            Row {
                spacing: Theme.paddingMedium
                Rectangle {
                    width: Theme.iconSizeSmall
                    height: width
                    radius: width / 2
                    color: "#3EE0A2"
                    anchors.verticalCenter: parent.verticalCenter
                }
                Label {
                    text: "Streamon"
                    color: "#E8EEF6"
                    font.pixelSize: Theme.fontSizeExtraLarge
                    font.bold: true
                }
            }

            Label {
                width: parent.width
                wrapMode: Text.Wrap
                color: "#8EA0B5"
                font.pixelSize: Theme.fontSizeSmall
                text: "Экран устройства на общей стене. Войдите на свой сервер."
            }

            TextField {
                id: serverField
                width: parent.width
                placeholderText: "Адрес сервера"
                label: "Адрес сервера"
                text: session.baseUrl
                inputMethodHints: Qt.ImhUrlCharactersOnly | Qt.ImhNoAutoUppercase
                EnterKey.iconSource: "image://theme/icon-m-enter-next"
                EnterKey.onClicked: emailField.focus = true
            }

            TextField {
                id: emailField
                width: parent.width
                placeholderText: "Почта"
                label: "Почта"
                text: session.email
                inputMethodHints: Qt.ImhEmailCharactersOnly | Qt.ImhNoAutoUppercase
                EnterKey.iconSource: "image://theme/icon-m-enter-next"
                EnterKey.onClicked: passwordField.focus = true
            }

            TextField {
                id: passwordField
                width: parent.width
                placeholderText: "Пароль"
                label: "Пароль"
                echoMode: TextInput.Password
                EnterKey.iconSource: "image://theme/icon-m-enter-accept"
                EnterKey.onClicked: login()
            }

            Button {
                id: loginButton
                text: "Войти"
                anchors.horizontalCenter: parent.horizontalCenter
                enabled: !busy
                onClicked: login()
            }

            Label {
                id: errorLabel
                width: parent.width
                wrapMode: Text.Wrap
                color: "#FF6B7D"
                font.pixelSize: Theme.fontSizeSmall
                visible: text.length > 0
            }
        }
    }

    property bool busy: false

    Component.onCompleted: {
        if (session.token.length > 0 && session.baseUrl.length > 0)
            restore()
    }

    function login() {
        var base = Api.normalize(serverField.text)
        var email = emailField.text.trim()
        var password = passwordField.text
        if (!base || !email || !password) {
            errorLabel.text = "Нужны адрес сервера, почта и пароль"
            return
        }
        busy = true
        errorLabel.text = ""
        Api.request("POST", base + "/api/auth/login", "", {
            email: email,
            password: password
        }, function (data) {
            busy = false
            var user = data.user || {}
            session.baseUrl = base
            session.token = data.token || ""
            session.email = email
            session.userName = user.name || ""
            passwordField.text = ""
            pageStack.replace(Qt.resolvedUrl("HomePage.qml"))
        }, function (message) {
            busy = false
            errorLabel.text = message
        })
    }

    function restore() {
        Api.request("GET", Api.normalize(session.baseUrl) + "/api/auth/me", session.token, null, function (user) {
            session.userName = user.name || session.userName
            pageStack.replace(Qt.resolvedUrl("HomePage.qml"))
        }, function () {
            session.token = ""
        })
    }
}
