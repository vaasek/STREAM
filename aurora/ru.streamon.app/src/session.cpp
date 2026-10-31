#include "session.h"

#include <QBuffer>
#include <QImage>
#include <QQuickItem>
#include <QQuickWindow>

Session::Session(QObject *parent)
    : QObject(parent)
{
}

QString Session::value(const QString &key, const QString &fallback) const
{
    return m_settings.value(key, fallback).toString();
}

void Session::store(const QString &key, const QString &next, void (Session::*signal)())
{
    if (value(key) == next)
        return;
    m_settings.setValue(key, next);
    emit (this->*signal)();
}

QString Session::frame() const
{
    return m_frame;
}

QString Session::grabNote() const
{
    return m_grabNote;
}

void Session::setGrabNote(const QString &note)
{
    if (m_grabNote == note)
        return;
    m_grabNote = note;
    emit grabNoteChanged();
}

void Session::requestGrab(QObject *windowObject)
{
    QQuickWindow *window = qobject_cast<QQuickWindow *>(windowObject);
    if (!window || !window->contentItem()) {
        setGrabNote(QStringLiteral("Окно не найдено"));
        return;
    }
    if (m_grabbing && m_grabTimer.isValid() && m_grabTimer.elapsed() < 2000)
        return;
    m_grab = window->contentItem()->grabToImage(QSize(240, 426));
    if (m_grab.isNull()) {
        m_grabbing = false;
        setGrabNote(QStringLiteral("Снимок не начался"));
        return;
    }
    m_grabbing = true;
    m_grabTimer.start();
    connect(m_grab.data(), SIGNAL(ready()), this, SLOT(finishGrab()));
}

void Session::finishGrab()
{
    m_grabbing = false;
    if (m_grab.isNull())
        return;
    QImage image = m_grab->image();
    m_grab.clear();
    if (image.isNull()) {
        setGrabNote(QStringLiteral("Снимок пустой"));
        return;
    }
    QByteArray bytes;
    QBuffer buffer(&bytes);
    buffer.open(QIODevice::WriteOnly);
    if (!image.save(&buffer, "JPEG", 25)) {
        setGrabNote(QStringLiteral("Снимок не сохранился"));
        return;
    }
    m_frame = QString::fromLatin1(bytes.toBase64());
    setGrabNote(QStringLiteral("кадр ") + QString::number(++m_grabCount));
}

QString Session::baseUrl() const
{
    return value(QStringLiteral("baseUrl"), QStringLiteral("http://192.168.89.102:8080"));
}

void Session::setBaseUrl(const QString &value)
{
    store(QStringLiteral("baseUrl"), value, &Session::baseUrlChanged);
}

QString Session::token() const
{
    return value(QStringLiteral("token"));
}

void Session::setToken(const QString &value)
{
    store(QStringLiteral("token"), value, &Session::tokenChanged);
}

QString Session::userName() const
{
    return value(QStringLiteral("userName"));
}

void Session::setUserName(const QString &value)
{
    store(QStringLiteral("userName"), value, &Session::userNameChanged);
}

QString Session::email() const
{
    return value(QStringLiteral("email"));
}

void Session::setEmail(const QString &value)
{
    store(QStringLiteral("email"), value, &Session::emailChanged);
}

QString Session::lastCode() const
{
    return value(QStringLiteral("lastCode"));
}

void Session::setLastCode(const QString &value)
{
    store(QStringLiteral("lastCode"), value, &Session::lastCodeChanged);
}
