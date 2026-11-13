#!/bin/sh
# Сжатые копии для сайта: app.js -> app.min.js, style.css -> style.min.css. Правим только исходники, перед публикацией запускаем этот файл.
cd "$(dirname "$0")/.." || exit 1
E="${ESBUILD:-npx -y esbuild@0.24.0}"
$E app.js --minify --charset=utf8 --target=es2020 --log-level=warning --outfile=app.min.js || exit 1
$E style.css --minify --charset=utf8 --log-level=warning --outfile=style.min.css || exit 1
