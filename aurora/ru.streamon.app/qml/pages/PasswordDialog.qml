import QtQuick 2.6
import Sailfish.Silica 1.0

Dialog {
    property string roomCode
    property string roomTitle
    property alias entered: passwordField.text

    canAccept: passwordField.text.length > 0

    Rectangle {
        anchors.fill: parent
        color: "#090C10"
        z: -1
    }

    Column {
        width: parent.width
        spacing: Theme.paddingLarge

        DialogHeader {
            title: "Пароль комнаты"
            acceptText: "Войти"
        }

        Label {
            x: Theme.horizontalPageMargin
            width: parent.width - 2 * Theme.horizontalPageMargin
            wrapMode: Text.Wrap
            color: "#E8EEF6"
            text: roomTitle || roomCode
        }

        TextField {
            id: passwordField
            x: Theme.horizontalPageMargin
            width: parent.width - 2 * Theme.horizontalPageMargin
            placeholderText: "Пароль"
            label: "Пароль"
            echoMode: TextInput.Password
            EnterKey.iconSource: "image://theme/icon-m-enter-accept"
            EnterKey.onClicked: accept()
        }
    }
}
