# MediConnect — Guía rápida de ejecución, despliegue HTTPS y APK real

## 1. Correr en local (XAMPP + Node.js)
1. Asegúrate de tener MySQL encendido en XAMPP y la base de datos `mediconnect` creada.
   - Si es una instalación limpia, importa `database/schema.sql` en phpMyAdmin.
   - Si ya tienes la base de datos de Momento III, **no hace falta borrar nada**: al arrancar `serve.js`, el servidor aplica automáticamente la migración (`glicemia`, `fecha_resolucion` y las 5 especialidades base).
2. Entra a `backend/` en tu terminal y ejecuta:
   ```bash
   npm install
   npm start
   ```
3. Abre `http://localhost:3000` en tu navegador.
   - Prueba de salud del servidor: `http://localhost:3000/api/health`

## 2. Despliegue en producción con HTTPS (Railway o VPS)
HTTPS es **obligatorio** para que la cámara y el micrófono (fotos de evidencia y videoconsulta WebRTC) funcionen en teléfonos reales.

Variables de entorno necesarias en tu servidor (ver `backend/.env.example`):
- `PORT` (Railway lo asigna automáticamente)
- `NODE_ENV=production`
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL=true` (si tu MySQL cloud usa SSL)
- `JWT_SECRET`
- `GEMINI_API_KEY` (y opcionalmente `GEMINI_MODEL=gemini-2.5-flash`)
- Opcional para videollamadas en redes móviles 4G con NAT restrictivo:
  `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`

> **Nota de almacenamiento:** Si despliegas en Railway, monta un **Volume** en `/app/backend/uploads` para que las fotos subidas no se pierdan al redesplegar.

## 3. Sobre el APK (`MediConnect-Paciente.apk`)
El APK actual dentro de `prototipos/` es un **prototipo offline**:
- Solo declara `android.permission.INTERNET` (no tiene permisos de `CAMERA` ni `RECORD_AUDIO`).
- Carga un HTML local con datos simulados (`file:///android_asset/index.html`, cuenta demo `8456123` / `Paciente2026`), sin conexión al backend.

Para obtener el **APK real conectado a MediConnect** una vez desplegado en HTTPS:
1. Como el frontend ya incluye `manifest.json`, entra a **https://www.pwabuilder.com/** con tu URL HTTPS de producción y genera el paquete Android (Trusted Web Activity) listo para instalar — hereda automáticamente cámara, micrófono y WebRTC del navegador Chrome del teléfono.
2. Alternativamente, si prefieres recompilar tu WebView de Android Studio, cambia `loadUrl("file:///android_asset/index.html")` por `loadUrl("https://tu-dominio-mediconnect...")` y agrega `CAMERA` y `RECORD_AUDIO` en `AndroidManifest.xml` más `onPermissionRequest` en `WebChromeClient`.
