import QtQuick 2.6
import Sailfish.Silica 1.0

CoverBackground {
    Rectangle {
        anchors.fill: parent
        color: "#090C10"
    }

    Column {
        anchors.centerIn: parent
        spacing: Theme.paddingSmall
        width: parent.width - 2 * Theme.paddingMedium

        Rectangle {
            width: Theme.iconSizeSmall
            height: width
            radius: width / 2
            color: "#3EE0A2"
            anchors.horizontalCenter: parent.horizontalCenter
        }

        Label {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            color: "#E8EEF6"
            font.pixelSize: Theme.fontSizeSmall
            text: "Streamon"
        }
    }
}
