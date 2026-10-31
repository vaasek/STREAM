Name:       ru.streamon.app
Summary:    Клиент видеоконференций Streamon
Version:    1.0.0
Release:    21
License:    Proprietary
Source0:    %{name}-%{version}.tar.bz2
Requires:   sailfishsilica-qt5 >= 0.10.9
Requires:   ru.auroraos.webview
BuildRequires:  pkgconfig(auroraapp)
BuildRequires:  pkgconfig(Qt5Core)
BuildRequires:  pkgconfig(Qt5Qml)
BuildRequires:  pkgconfig(Qt5Quick)
BuildRequires:  pkgconfig(Qt5Network)

%description
%{summary}. Вход на свой сервер Streamon, список живых комнат и открытие комнаты.

%prep
%setup -q -n %{name}-%{version}

%build
%qmake5
%make_build

%install
%qmake5_install
find %{buildroot}%{_datadir} -type f -exec chmod 644 {} +
chmod 755 %{buildroot}%{_bindir}/%{name}

%files
%defattr(644,root,root,-)
%attr(755,root,root) %{_bindir}/%{name}
%{_datadir}/%{name}
%{_datadir}/applications/%{name}.desktop
%{_datadir}/icons/hicolor/*/apps/%{name}.png
