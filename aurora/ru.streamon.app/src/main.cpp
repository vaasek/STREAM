#include <auroraapp.h>
#include <aurorawebview/webenginecontext.h>

#include <QtQuick>

#include <cstring>
#include <string>
#include <unistd.h>
#include <vector>

#include "session.h"

int main(int argc, char *argv[])
{
    bool software = false;
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--preset-default-sw-rendering") == 0)
            software = true;
    }
    if (!software) {
        std::vector<std::string> held;
        held.emplace_back(argv[0] ? argv[0] : "/usr/bin/ru.streamon.app");
        held.emplace_back("--preset-default-sw-rendering");
        held.emplace_back("--use-gl=angle");
        held.emplace_back("--use-angle=swiftshader");
        for (int i = 1; i < argc; ++i)
            held.emplace_back(argv[i]);
        std::vector<char *> next;
        next.reserve(held.size() + 1);
        for (std::string &arg : held)
            next.push_back(arg.data());
        next.push_back(nullptr);
        execv(next[0], next.data());
    }

    qputenv("OVERRIDE_ARGS", "1");
    qputenv("MESA_LOADER_DRIVER_OVERRIDE", "virtio_gpu");
    QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);

    std::vector<std::string> storage;
    storage.emplace_back(argv[0] ? argv[0] : "ru.streamon.app");
    for (int i = 1; i < argc; ++i)
        storage.emplace_back(argv[i]);
    if (!software)
        storage.emplace_back("--preset-default-sw-rendering");
    storage.emplace_back("--use-gl=angle");
    storage.emplace_back("--use-angle=swiftshader");
    storage.emplace_back("--use-fake-ui-for-media-stream");
    storage.emplace_back("--auto-select-desktop-capture-source=Entire screen");
    storage.emplace_back("--ignore-certificate-errors=rNoltUHgXCsoW9Dm9RsTny9hdmw9q3P8JALd/tbX+nE=");
    storage.emplace_back("--autoplay-policy=no-user-gesture-required");

    std::vector<char *> browserArgv;
    browserArgv.reserve(storage.size() + 1);
    for (std::string &arg : storage)
        browserArgv.push_back(arg.data());
    browserArgv.push_back(nullptr);

    const std::vector<std::string> engineArgs(storage.begin() + 1, storage.end());
    QMap<QString, QString> params;
    Aurora::WebView::WebEngineContext::InitBrowser(static_cast<int>(storage.size()), browserArgv.data(), engineArgs, params);

    QScopedPointer<QGuiApplication> application(Aurora::Application::application(argc, argv));
    application->setOrganizationName(QStringLiteral("ru.streamon"));
    application->setApplicationName(QStringLiteral("app"));

    Session session;
    QScopedPointer<QQuickView> view(Aurora::Application::createView());
    view->rootContext()->setContextProperty(QStringLiteral("session"), &session);
    view->setSource(Aurora::Application::pathTo(QStringLiteral("qml/ru.streamon.app.qml")));
    view->show();

    return application->exec();
}
