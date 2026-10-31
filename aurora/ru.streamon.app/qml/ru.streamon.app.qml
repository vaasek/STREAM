import QtQuick 2.6
import Sailfish.Silica 1.0
import "pages"

ApplicationWindow {
    id: root

    cover: Qt.resolvedUrl("cover/DefaultCover.qml")
    initialPage: Component {
        LoginPage {}
    }
    allowedOrientations: defaultAllowedOrientations
}
