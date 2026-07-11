# EVEN's Team Panel — App de Android

App de Android (TWA - Trusted Web Activity) que abre el [panel web de EVEN's Team](https://evens-team-pagina-web-production.up.railway.app) a pantalla completa, sin la barra de Chrome — como una app nativa. Está verificada contra el dominio (`/.well-known/assetlinks.json`), así que Android confía en que la app y la web son del mismo dueño.

No es una copia de la web: siempre carga la versión en vivo desde Railway.

## Descargar e instalar

Ve a la pestaña [Releases](../../releases) y descarga el `.apk` de la última versión. Hay que activar "Instalar apps de origenes desconocidos" para el navegador/gestor de archivos la primera vez (Android lo pide solo).

## Recompilar tras un cambio en la web

Cada vez que cambie el `manifest.json` de la web (nombre, colores, icono...) o queramos subir de versión:

```
npm install
$env:KEYSTORE_PASSWORD="..."   # la clave de firma, pedirsela a quien la tenga guardada
$env:KEY_PASSWORD="..."
node build-apk.js
```

Genera `app-release-signed.apk` en esta carpeta. Sube ese archivo como nuevo Release en GitHub.

**Importante**: `android.keystore` (la clave de firma) NO está en este repositorio a propósito — nunca debe subirse a un repo público. Es la misma clave para todas las versiones; si se pierde, Android ya no deja instalar actualizaciones sobre la app que la gente ya tiene instalada (habría que desinstalar y reinstalar todos, y perderían el reconocimiento de "app instalada"). Guárdala en un sitio seguro (gestor de contraseñas / disco cifrado), junto con `KEYSTORE_PASSWORD`.

## Requisitos para compilar (una sola vez por PC)

- Node.js
- JDK 17 (ej. Eclipse Temurin)
- Android SDK command-line tools
- Archivo `~/.bubblewrap/config.json` con:
  ```json
  {"jdkPath": "ruta al JDK", "androidSdkPath": "ruta al Android SDK"}
  ```
