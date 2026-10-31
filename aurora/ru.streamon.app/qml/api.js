.pragma library

function normalize(raw) {
    var url = String(raw || "").trim().replace(/\/+$/, "")
    if (!url)
        return ""
    if (url.indexOf("http://") !== 0 && url.indexOf("https://") !== 0)
        url = "http://" + url
    return url
}

function roomPageUrl(base, code, secure) {
    var url = normalize(base)
    var match = url.match(/^(https?:\/\/)([^\/:]+)(?::(\d+))?/i)
    if (!match)
        return url + "/r/" + code
    var host = match[2]
    if (secure)
        return "https://" + host + ":8443/r/" + code
    var port = match[3] ? (":" + match[3]) : ""
    return "http://" + host + port + "/r/" + code
}

function request(method, url, token, body, ok, fail) {
    var xhr = new XMLHttpRequest()
    xhr.onreadystatechange = function () {
        if (xhr.readyState !== XMLHttpRequest.DONE)
            return
        var data = {}
        try {
            data = JSON.parse(xhr.responseText || "{}")
        } catch (e) {
            data = {}
        }
        if (xhr.status >= 200 && xhr.status < 300)
            ok(data)
        else
            fail((data && data.error) ? data.error : ("Ошибка " + xhr.status))
    }
    xhr.onerror = function () {
        fail("Нет связи с сервером")
    }
    xhr.open(method, url)
    xhr.setRequestHeader("Accept", "application/json")
    if (token)
        xhr.setRequestHeader("Authorization", "Bearer " + token)
    if (body) {
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify(body))
    } else {
        xhr.send()
    }
}

function roomKind(type) {
    if (type === "wall")
        return "Стена"
    if (type === "stream")
        return "Эфир"
    return "Комната"
}
