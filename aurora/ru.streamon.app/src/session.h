#ifndef SESSION_H
#define SESSION_H

#include <QElapsedTimer>
#include <QObject>
#include <QQuickItemGrabResult>
#include <QSettings>
#include <QSharedPointer>

class Session : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QString baseUrl READ baseUrl WRITE setBaseUrl NOTIFY baseUrlChanged)
    Q_PROPERTY(QString token READ token WRITE setToken NOTIFY tokenChanged)
    Q_PROPERTY(QString userName READ userName WRITE setUserName NOTIFY userNameChanged)
    Q_PROPERTY(QString email READ email WRITE setEmail NOTIFY emailChanged)
    Q_PROPERTY(QString lastCode READ lastCode WRITE setLastCode NOTIFY lastCodeChanged)
    Q_PROPERTY(QString frame READ frame NOTIFY grabNoteChanged)
    Q_PROPERTY(QString grabNote READ grabNote NOTIFY grabNoteChanged)

public:
    explicit Session(QObject *parent = nullptr);

    QString baseUrl() const;
    void setBaseUrl(const QString &value);
    QString token() const;
    void setToken(const QString &value);
    QString userName() const;
    void setUserName(const QString &value);
    QString email() const;
    void setEmail(const QString &value);
    QString lastCode() const;
    void setLastCode(const QString &value);
    QString frame() const;
    QString grabNote() const;
    Q_INVOKABLE void requestGrab(QObject *windowObject);

signals:
    void baseUrlChanged();
    void tokenChanged();
    void userNameChanged();
    void emailChanged();
    void lastCodeChanged();
    void grabNoteChanged();

private slots:
    void finishGrab();

private:
    QString value(const QString &key, const QString &fallback = QString()) const;
    void store(const QString &key, const QString &value, void (Session::*signal)());
    void setGrabNote(const QString &note);

    QSettings m_settings;
    QSharedPointer<QQuickItemGrabResult> m_grab;
    QElapsedTimer m_grabTimer;
    bool m_grabbing = false;
    int m_grabCount = 0;
    QString m_frame;
    QString m_grabNote;
};

#endif
