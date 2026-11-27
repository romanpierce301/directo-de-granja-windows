# Directo de Granja

Ecosistema de aplicaciones para apoyar la administración y operación de un negocio de venta directa desde granja. Este repositorio reúne dos aplicaciones cliente —Windows y Android— además de una API/servidor y una interfaz web complementaria.

> **Estado:** en desarrollo. Verifica los requisitos y configura las credenciales antes de usarlo en producción.

## Aplicaciones

### Windows (`dotnet-solution/`)

Aplicación de escritorio basada en .NET 8 y C#. La solución está organizada en los proyectos `Core`, `Desktop` y `Services`, y cuenta con pruebas y documentación dentro de `dotnet-solution/`. El proyecto contempla persistencia SQLite mediante servicios .NET y tiene una solución de Visual Studio (`HuevoControl.sln`).

Para restaurar y compilar:

```bash
cd dotnet-solution
dotnet restore
dotnet build HuevoControl.sln
```

Para ejecutar la aplicación de escritorio, abre `HuevoControl.sln` con Visual Studio o identifica el proyecto ejecutable dentro de `src/Desktop` y ejecútalo con `dotnet run --project <ruta-del-proyecto>`.

### Android (`directo-de-granja-android-beta/`)

Aplicación Android beta desarrollada con Kotlin y Gradle Kotlin DSL. El módulo de aplicación se encuentra en `app/`.

Para compilar una versión de depuración:

```bash
cd directo-de-granja-android-beta
./gradlew assembleDebug
```

En Windows PowerShell:

```powershell
cd directo-de-granja-android-beta
.\gradlew.bat assembleDebug
```

El APK de depuración se genera normalmente bajo `app/build/outputs/apk/debug/`. Para distribuir una versión de lanzamiento, configura la firma y las variables de producción antes de compilarla.

## Componentes adicionales

La raíz del repositorio también incluye una aplicación web React/TypeScript, una API en TypeScript (`server.ts`, `server/`), código compartido (`shared/`), pruebas y recursos públicos. El `package.json` define scripts para desarrollo, ejecución, compilación, vista previa, lint y pruebas.

Scripts disponibles desde la raíz:

```bash
npm install
npm run dev       # iniciar en desarrollo
npm run build     # compilar la aplicación web
npm run preview   # previsualizar la compilación
npm start         # iniciar el servidor
npm run lint      # comprobar TypeScript
npm test          # ejecutar Vitest
```

También se utiliza Bun en el repositorio (incluye `bun.lock`); si prefieres Bun, instala dependencias con `bun install` y ejecuta los scripts con `bun run <script>`.

## Arquitectura resumida

```text
Aplicación Windows ─┐
Aplicación Android ──┼──> API/servidor ──> almacenamiento y servicios configurados
Interfaz web ───────┘
```

El repositorio contiene código de autenticación y sincronización, rutas de API, persistencia SQLite y configuración opcional para servicios adicionales. Consulta `walkthrough.md` y la documentación dentro de `dotnet-solution/docs/` para más contexto técnico. La disponibilidad concreta de funciones depende de la versión y configuración utilizada.

## Requisitos

- **Web/API:** Node.js compatible con las dependencias del proyecto o Bun.
- **Windows:** .NET SDK 8; Visual Studio 2022 es recomendable para abrir la solución.
- **Android:** Android Studio, JDK compatible con el Gradle Wrapper y Android SDK requerido por el proyecto.
- **Servicios:** configura únicamente los servicios que vayas a utilizar (por ejemplo, SQLite, SQL Server o Redis según tu entorno).

Comprueba los archivos de configuración de cada aplicación para conocer las versiones exactas de SDK y dependencias requeridas.

## Configuración de entorno

Hay archivos de ejemplo de variables de entorno en la raíz y en la aplicación Android. Crea una copia local y sustituye los valores de ejemplo por valores propios:

```bash
cp .env.example .env
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Entre las variables documentadas en el archivo de ejemplo de la raíz se encuentran `GEMINI_API_KEY`, `APP_URL`, `JWT_SECRET`, `AES_ENCRYPTION_KEY`, `SQLITE_DB_PATH`, `SQL_SERVER_CONNECTION` y `REDIS_URL`. Consulta el `.env.example` correspondiente para confirmar nombres y formato.

**Nunca** guardes claves reales, contraseñas, tokens, certificados de firma ni archivos de bases de datos con información privada en Git. Usa valores de prueba en desarrollo y un gestor de secretos para despliegues.

## Pruebas

Web/API:

```bash
npm test
```

Solución .NET:

```bash
cd dotnet-solution
dotnet test
```

Ejecuta también compilaciones de Android desde su directorio con `./gradlew assembleDebug` antes de distribuir cambios.

## Seguridad y datos

El código del proyecto incluye mecanismos de autenticación, control de acceso, sincronización y protección de datos. Esto no sustituye una revisión de seguridad ni garantiza que una configuración concreta sea adecuada para producción. Antes de desplegar:

- Cambia todos los secretos de ejemplo por secretos aleatorios y únicos.
- Usa HTTPS en entornos accesibles por red.
- Restringe el acceso a la base de datos y crea respaldos protegidos.
- Revisa permisos, cuentas, dispositivos autorizados y políticas de retención.
- No publiques datos personales o de clientes en issues, logs o capturas.

## Estructura principal

```text
.
├── directo-de-granja-android-beta/  # Aplicación Android
├── dotnet-solution/                 # Solución de escritorio .NET
├── src/                             # Interfaz web React/TypeScript
├── server/                          # Módulos del servidor
├── shared/                          # Código compartido
├── tests/                           # Pruebas web/API
├── server.ts                        # Entrada del servidor
├── package.json                     # Scripts y dependencias web/API
├── .env.example                     # Variables de entorno de ejemplo
└── walkthrough.md                   # Recorrido técnico y notas de seguridad
```

## Licencia y uso comercial

Actualmente el repositorio no declara una licencia. Si deseas vender las aplicaciones y conservar control sobre la copia, modificación y redistribución, una opción a evaluar es una **licencia propietaria** acompañada de un **EULA (acuerdo de licencia de usuario final)**. La redacción debe definir, entre otras cosas, el alcance de uso, pagos, actualizaciones, soporte, garantías, limitaciones y terminación.

No agregues MIT, Apache-2.0 o GPL sin revisar sus efectos: permiten el uso comercial bajo sus condiciones y no reservan para ti el control exclusivo que normalmente se busca con un producto propietario. Antes de comercializar, confirma que tienes los derechos sobre todo el código y los recursos incluidos, revisa las licencias de dependencias y solicita asesoría legal local. Esta nota es informativa, no asesoría legal.

## Contribuciones

Antes de proponer cambios, abre un issue para describir el problema o la mejora. En tus Pull Requests incluye el alcance, los pasos para probarlo y cualquier cambio de configuración. No adjuntes secretos ni datos reales.

## Autor

**Iván Yairt Basilio Salgado**

Repositorio: <https://github.com/romanpierce301/directo-de-granja-windows>
