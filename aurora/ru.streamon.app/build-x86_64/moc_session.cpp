/****************************************************************************
** Meta object code from reading C++ file 'session.h'
**
** Created by: The Qt Meta Object Compiler version 67 (Qt 5.6.3)
**
** WARNING! All changes made in this file will be lost!
*****************************************************************************/

#include "../src/session.h"
#include <QtCore/qbytearray.h>
#include <QtCore/qmetatype.h>
#if !defined(Q_MOC_OUTPUT_REVISION)
#error "The header file 'session.h' doesn't include <QObject>."
#elif Q_MOC_OUTPUT_REVISION != 67
#error "This file was generated using the moc from 5.6.3. It"
#error "cannot be used with the include files from this version of Qt."
#error "(The moc has changed too much.)"
#endif

QT_BEGIN_MOC_NAMESPACE
struct qt_meta_stringdata_Session_t {
    QByteArrayData data[18];
    char stringdata0[187];
};
#define QT_MOC_LITERAL(idx, ofs, len) \
    Q_STATIC_BYTE_ARRAY_DATA_HEADER_INITIALIZER_WITH_OFFSET(len, \
    qptrdiff(offsetof(qt_meta_stringdata_Session_t, stringdata0) + ofs \
        - idx * sizeof(QByteArrayData)) \
    )
static const qt_meta_stringdata_Session_t qt_meta_stringdata_Session = {
    {
QT_MOC_LITERAL(0, 0, 7), // "Session"
QT_MOC_LITERAL(1, 8, 14), // "baseUrlChanged"
QT_MOC_LITERAL(2, 23, 0), // ""
QT_MOC_LITERAL(3, 24, 12), // "tokenChanged"
QT_MOC_LITERAL(4, 37, 15), // "userNameChanged"
QT_MOC_LITERAL(5, 53, 12), // "emailChanged"
QT_MOC_LITERAL(6, 66, 15), // "lastCodeChanged"
QT_MOC_LITERAL(7, 82, 15), // "grabNoteChanged"
QT_MOC_LITERAL(8, 98, 10), // "finishGrab"
QT_MOC_LITERAL(9, 109, 11), // "requestGrab"
QT_MOC_LITERAL(10, 121, 12), // "windowObject"
QT_MOC_LITERAL(11, 134, 7), // "baseUrl"
QT_MOC_LITERAL(12, 142, 5), // "token"
QT_MOC_LITERAL(13, 148, 8), // "userName"
QT_MOC_LITERAL(14, 157, 5), // "email"
QT_MOC_LITERAL(15, 163, 8), // "lastCode"
QT_MOC_LITERAL(16, 172, 5), // "frame"
QT_MOC_LITERAL(17, 178, 8) // "grabNote"

    },
    "Session\0baseUrlChanged\0\0tokenChanged\0"
    "userNameChanged\0emailChanged\0"
    "lastCodeChanged\0grabNoteChanged\0"
    "finishGrab\0requestGrab\0windowObject\0"
    "baseUrl\0token\0userName\0email\0lastCode\0"
    "frame\0grabNote"
};
#undef QT_MOC_LITERAL

static const uint qt_meta_data_Session[] = {

 // content:
       7,       // revision
       0,       // classname
       0,    0, // classinfo
       8,   14, // methods
       7,   64, // properties
       0,    0, // enums/sets
       0,    0, // constructors
       0,       // flags
       6,       // signalCount

 // signals: name, argc, parameters, tag, flags
       1,    0,   54,    2, 0x06 /* Public */,
       3,    0,   55,    2, 0x06 /* Public */,
       4,    0,   56,    2, 0x06 /* Public */,
       5,    0,   57,    2, 0x06 /* Public */,
       6,    0,   58,    2, 0x06 /* Public */,
       7,    0,   59,    2, 0x06 /* Public */,

 // slots: name, argc, parameters, tag, flags
       8,    0,   60,    2, 0x08 /* Private */,

 // methods: name, argc, parameters, tag, flags
       9,    1,   61,    2, 0x02 /* Public */,

 // signals: parameters
    QMetaType::Void,
    QMetaType::Void,
    QMetaType::Void,
    QMetaType::Void,
    QMetaType::Void,
    QMetaType::Void,

 // slots: parameters
    QMetaType::Void,

 // methods: parameters
    QMetaType::Void, QMetaType::QObjectStar,   10,

 // properties: name, type, flags
      11, QMetaType::QString, 0x00495103,
      12, QMetaType::QString, 0x00495103,
      13, QMetaType::QString, 0x00495103,
      14, QMetaType::QString, 0x00495103,
      15, QMetaType::QString, 0x00495103,
      16, QMetaType::QString, 0x00495001,
      17, QMetaType::QString, 0x00495001,

 // properties: notify_signal_id
       0,
       1,
       2,
       3,
       4,
       5,
       5,

       0        // eod
};

void Session::qt_static_metacall(QObject *_o, QMetaObject::Call _c, int _id, void **_a)
{
    if (_c == QMetaObject::InvokeMetaMethod) {
        Session *_t = static_cast<Session *>(_o);
        Q_UNUSED(_t)
        switch (_id) {
        case 0: _t->baseUrlChanged(); break;
        case 1: _t->tokenChanged(); break;
        case 2: _t->userNameChanged(); break;
        case 3: _t->emailChanged(); break;
        case 4: _t->lastCodeChanged(); break;
        case 5: _t->grabNoteChanged(); break;
        case 6: _t->finishGrab(); break;
        case 7: _t->requestGrab((*reinterpret_cast< QObject*(*)>(_a[1]))); break;
        default: ;
        }
    } else if (_c == QMetaObject::IndexOfMethod) {
        int *result = reinterpret_cast<int *>(_a[0]);
        void **func = reinterpret_cast<void **>(_a[1]);
        {
            typedef void (Session::*_t)();
            if (*reinterpret_cast<_t *>(func) == static_cast<_t>(&Session::baseUrlChanged)) {
                *result = 0;
                return;
            }
        }
        {
            typedef void (Session::*_t)();
            if (*reinterpret_cast<_t *>(func) == static_cast<_t>(&Session::tokenChanged)) {
                *result = 1;
                return;
            }
        }
        {
            typedef void (Session::*_t)();
            if (*reinterpret_cast<_t *>(func) == static_cast<_t>(&Session::userNameChanged)) {
                *result = 2;
                return;
            }
        }
        {
            typedef void (Session::*_t)();
            if (*reinterpret_cast<_t *>(func) == static_cast<_t>(&Session::emailChanged)) {
                *result = 3;
                return;
            }
        }
        {
            typedef void (Session::*_t)();
            if (*reinterpret_cast<_t *>(func) == static_cast<_t>(&Session::lastCodeChanged)) {
                *result = 4;
                return;
            }
        }
        {
            typedef void (Session::*_t)();
            if (*reinterpret_cast<_t *>(func) == static_cast<_t>(&Session::grabNoteChanged)) {
                *result = 5;
                return;
            }
        }
    }
#ifndef QT_NO_PROPERTIES
    else if (_c == QMetaObject::ReadProperty) {
        Session *_t = static_cast<Session *>(_o);
        Q_UNUSED(_t)
        void *_v = _a[0];
        switch (_id) {
        case 0: *reinterpret_cast< QString*>(_v) = _t->baseUrl(); break;
        case 1: *reinterpret_cast< QString*>(_v) = _t->token(); break;
        case 2: *reinterpret_cast< QString*>(_v) = _t->userName(); break;
        case 3: *reinterpret_cast< QString*>(_v) = _t->email(); break;
        case 4: *reinterpret_cast< QString*>(_v) = _t->lastCode(); break;
        case 5: *reinterpret_cast< QString*>(_v) = _t->frame(); break;
        case 6: *reinterpret_cast< QString*>(_v) = _t->grabNote(); break;
        default: break;
        }
    } else if (_c == QMetaObject::WriteProperty) {
        Session *_t = static_cast<Session *>(_o);
        Q_UNUSED(_t)
        void *_v = _a[0];
        switch (_id) {
        case 0: _t->setBaseUrl(*reinterpret_cast< QString*>(_v)); break;
        case 1: _t->setToken(*reinterpret_cast< QString*>(_v)); break;
        case 2: _t->setUserName(*reinterpret_cast< QString*>(_v)); break;
        case 3: _t->setEmail(*reinterpret_cast< QString*>(_v)); break;
        case 4: _t->setLastCode(*reinterpret_cast< QString*>(_v)); break;
        default: break;
        }
    } else if (_c == QMetaObject::ResetProperty) {
    }
#endif // QT_NO_PROPERTIES
}

const QMetaObject Session::staticMetaObject = {
    { &QObject::staticMetaObject, qt_meta_stringdata_Session.data,
      qt_meta_data_Session,  qt_static_metacall, Q_NULLPTR, Q_NULLPTR}
};


const QMetaObject *Session::metaObject() const
{
    return QObject::d_ptr->metaObject ? QObject::d_ptr->dynamicMetaObject() : &staticMetaObject;
}

void *Session::qt_metacast(const char *_clname)
{
    if (!_clname) return Q_NULLPTR;
    if (!strcmp(_clname, qt_meta_stringdata_Session.stringdata0))
        return static_cast<void*>(const_cast< Session*>(this));
    return QObject::qt_metacast(_clname);
}

int Session::qt_metacall(QMetaObject::Call _c, int _id, void **_a)
{
    _id = QObject::qt_metacall(_c, _id, _a);
    if (_id < 0)
        return _id;
    if (_c == QMetaObject::InvokeMetaMethod) {
        if (_id < 8)
            qt_static_metacall(this, _c, _id, _a);
        _id -= 8;
    } else if (_c == QMetaObject::RegisterMethodArgumentMetaType) {
        if (_id < 8)
            *reinterpret_cast<int*>(_a[0]) = -1;
        _id -= 8;
    }
#ifndef QT_NO_PROPERTIES
   else if (_c == QMetaObject::ReadProperty || _c == QMetaObject::WriteProperty
            || _c == QMetaObject::ResetProperty || _c == QMetaObject::RegisterPropertyMetaType) {
        qt_static_metacall(this, _c, _id, _a);
        _id -= 7;
    } else if (_c == QMetaObject::QueryPropertyDesignable) {
        _id -= 7;
    } else if (_c == QMetaObject::QueryPropertyScriptable) {
        _id -= 7;
    } else if (_c == QMetaObject::QueryPropertyStored) {
        _id -= 7;
    } else if (_c == QMetaObject::QueryPropertyEditable) {
        _id -= 7;
    } else if (_c == QMetaObject::QueryPropertyUser) {
        _id -= 7;
    }
#endif // QT_NO_PROPERTIES
    return _id;
}

// SIGNAL 0
void Session::baseUrlChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 0, Q_NULLPTR);
}

// SIGNAL 1
void Session::tokenChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 1, Q_NULLPTR);
}

// SIGNAL 2
void Session::userNameChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 2, Q_NULLPTR);
}

// SIGNAL 3
void Session::emailChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 3, Q_NULLPTR);
}

// SIGNAL 4
void Session::lastCodeChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 4, Q_NULLPTR);
}

// SIGNAL 5
void Session::grabNoteChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 5, Q_NULLPTR);
}
QT_END_MOC_NAMESPACE
