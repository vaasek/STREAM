TARGET = ru.streamon.app

CONFIG += auroraapp
PKGCONFIG += aurorawebview

SOURCES += src/main.cpp \
    src/session.cpp

HEADERS += src/session.h

DISTFILES += \
    ru.streamon.app.desktop \
    rpm/ru.streamon.app.spec \
    qml/ru.streamon.app.qml \
    qml/api.js \
    qml/pages/LoginPage.qml \
    qml/pages/HomePage.qml \
    qml/pages/PasswordDialog.qml \
    qml/pages/RoomPage.qml \
    qml/cover/DefaultCover.qml

AURORAAPP_ICONS = 86x86 108x108 128x128 172x172
