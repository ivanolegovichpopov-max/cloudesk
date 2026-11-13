#!/bin/sh
# Сжатые копии для сайта: app.js -> app.min.js, style.css -> style.min.css. Правим только исходники, перед публикацией запускаем этот файл.
# В index.html к ним дописывается метка версии (?v=…), чтобы браузер не взял старый стиль к новому коду.
cd "$(dirname "$0")/.." || exit 1
E="${ESBUILD:-npx -y esbuild@0.24.0}"
$E app.js --minify --charset=utf8 --target=es2020 --log-level=warning --outfile=app.min.js || exit 1
$E style.css --minify --charset=utf8 --log-level=warning --outfile=style.min.css || exit 1
V=$(cat app.min.js style.min.css | md5sum | cut -c1-8)
sed -i -E "s#(app\.min\.js|style\.min\.css)(\?v=[0-9a-f]+)?\"#\1?v=$V\"#g" index.html
