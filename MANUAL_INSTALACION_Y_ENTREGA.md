# Manual de Instalación, Configuración de Claves y Entrega al Comprador
**Sistema:** Directo de Granja (Windows Desktop Dueño + Android Vendedor en Ruta + SQLite Cifrado)

Este documento explica paso a paso cómo obtener los instaladores desde GitHub, configurar todas las claves de seguridad obligatorias, conectar la app Windows con los teléfonos Android de los vendedores, configurar impresoras térmicas de 48 mm, administrar respaldos cifrados y entregar el sistema listo para operar al comprador.

---

## 1. Resumen de Arquitectura y Ubicación de Datos

| Componente | Plataforma | Función principal | Almacenamiento / Ubicación |
| :--- | :--- | :--- | :--- |
| **App Escritorio Dueño** | Windows x64 (`.exe` Electron + Node.js) | Caja central, bodega, clientes, saldos, aprobación de transferencias/dispositivos, abonos y cierres | SQLite WAL local en `%APPDATA%\DirectoDeGranja\data\directodegranja.db` |
| **App Vendedor en Ruta** | Android (`.apk` Kotlin/Compose) | Entregas en ruta, cobro contado/crédito, abonos parciales sin compra, tickets 48 mm | Room SQLite local en el teléfono + sincronización HTTP/WebSocket con Windows |
| **Respaldos de Seguridad** | Windows (`.dgbackup`) | Copias cifradas con AES-256-GCM y verificación de integridad SHA-256 | Carpeta `backups\` junto a la carpeta de datos (`%APPDATA%\DirectoDeGranja\backups\`) |

> **Importante:** No existen contraseñas de demostración ni usuarios precargados. Al entregar e iniciar por primera vez en la computadora del comprador, el propio dueño registrará su correo y contraseña reales.

---

## 2. Cómo Obtener el `.EXE` (Windows) y el `.APK` (Android) desde GitHub

El repositorio ya incluye el flujo automático `.github/workflows/build-apps.yml` que compila ambas aplicaciones después de ejecutar todas las pruebas de seguridad:

1. Entra a tu repositorio en GitHub y haz clic en la pestaña **Actions**.
2. Selecciona el flujo **"Compilar Apps Windows (.exe) y Android (.apk)"**.
   - Si deseas lanzarlo manualmente, haz clic en **Run workflow** -> rama **`main`** -> **Run workflow**.
3. Espera a que terminen los 3 trabajos en verde:
   - `Verificar Servidor y Pruebas de Seguridad`
   - `Compilar Windows Dueño Completo (.exe)`
   - `Compilar Android Vendedor (Directo de Granja .apk)`
4. Baja a la sección **Artifacts** dentro de esa ejecución y descarga:
   - **`DirectoDeGranja-Windows-x64`** -> Contiene el instalador / ejecutable `.exe` de Windows.
   - **`DirectoDeGranja-Android-APK`** -> Contiene el archivo `.apk` de Android (`directodegranja`) para instalar en los teléfonos de los vendedores.

---

## 3. Claves de Seguridad y Variables de Entorno

El sistema **detiene el arranque automáticamente** si faltan las claves de seguridad, si son cortas o si tienen valores de ejemplo (`REPLACE_WITH...`, `CHANGE_ME`, caracteres repetidos).

### 3.1 Qué clave pide cada parte del sistema

| Variable (acepta alias) | Para qué sirve | Formato obligatorio | Dónde se guarda |
| :--- | :--- | :--- | :--- |
| **`JWT_SECRET`** *(o `JWT_SECRETO`)* | Firma y valida las sesiones JWT (HS256) entre Windows y los teléfonos Android. Si se cambia, todas las sesiones abiertas deben volver a iniciar sesión. | Texto aleatorio de **32 a 512 caracteres** (recomendado: **64 caracteres hexadecimales**). | En `.env` local (excluido de Git por `.gitignore`). |
| **`AES_ENCRYPTION_KEY`** *(o `CLAVE_DE_CIFRADO_AES`)* | Cifra con **AES-256-GCM** los datos personales dentro de SQLite (`contact_name`, teléfonos, domicilios, notas, teléfono/dirección del negocio) y cifra los respaldos `.dgbackup`. | **Exactamente 64 caracteres hexadecimales** (`0-9`, `a-f` = 32 bytes reales), o frase secreta de 32 a 256 caracteres (derivada con SHA-256). | En `.env` local (excluido de Git por `.gitignore`). |
| **`SQLITE_DB_PATH`** | Ruta del archivo principal de base de datos SQLite en modo WAL. | Relativa o absoluta. Por defecto: `data/directodegranja.db` | En `.env` local. |
| **`PORT`** *(opcional)* | Puerto HTTP y WebSocket donde escucha el servidor de Windows. | Número entero válido. Por defecto: **`3000`**. | En `.env` local o entorno. |
| **`ALLOWED_ORIGINS`** *(opcional, producción web)* | Lista separada por comas de orígenes CORS/WebSocket permitidos fuera de la red local. | Ej.: `https://tudominio.com,https://app.tudominio.com` | En `.env` del servidor si se expone fuera de LAN. |
| **`ALLOW_INSECURE_HTTP`** *(automático en Desktop)* | Permite operar por HTTP dentro de la red local / Electron sin certificado SSL público. | `true` (la app `.exe` de Windows ya lo fija en `true`). | Configurado automáticamente por `electron/main.ts`. |

> **¡CRÍTICO SOBRE `AES_ENCRYPTION_KEY`!**  
> La clave AES **NO se guarda dentro de la base de datos SQLite**. Si la computadora del comprador se daña o se formatea, necesitarás **la misma `AES_ENCRYPTION_KEY`** para restaurar el archivo `.dgbackup` o abrir una copia de `directodegranja.db`. Guarda una copia impresa o en un gestor de contraseñas seguro junto con el instalador.

---

### 3.2 Cómo generar claves criptográficas seguras (64 caracteres hex)

Elige cualquiera de estos métodos en la PC de administración (nunca inventes palabras simples):

**Opción A — PowerShell en Windows:**
```powershell
# Genera JWT_SECRET (64 hex):
-join ((1..32) | ForEach-Object { "{0:x2}" -f (Get-Random -Minimum 0 -Maximum 256) })

# Genera AES_ENCRYPTION_KEY (64 hex):
-join ((1..32) | ForEach-Object { "{0:x2}" -f (Get-Random -Minimum 0 -Maximum 256) })
```

**Opción B — Node.js (si está instalado):**
```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex')); console.log('AES_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'));"
```

---

### 3.3 Dónde se configura el archivo `.env` según el modo de uso

#### Caso A: Instalador Windows Desktop (`.exe`) — Recomendado para el comprador
1. Al ejecutar por primera vez el `.exe` en Windows, Electron crea automáticamente si no existe el archivo:
   ```text
   %APPDATA%\DirectoDeGranja\.env
   ```
   *(Ruta real típica: `C:\Users\<Usuario>\AppData\Roaming\DirectoDeGranja\.env`)*
2. En el primer arranque automático, genera claves aleatorias de 256 bits (`crypto.randomBytes(32).toString('hex')`) para `JWT_SECRET` y `AES_ENCRYPTION_KEY`, y fija `SQLITE_DB_PATH="data/directodegranja.db"`.
3. **Si deseas definir o cambiar tú mismo las claves antes de entregar:**
   - Abre el Explorador de Windows, escribe `%APPDATA%\DirectoDeGranja` en la barra de direcciones.
   - Edita el archivo `.env` con el Bloc de Notas **antes de registrar clientes**, o sustituye las claves con este formato exacto:
     ```env
     JWT_SECRET="tu_clave_jwt_de_64_caracteres_hex"
     AES_ENCRYPTION_KEY="tu_clave_aes_de_64_caracteres_hex"
     SQLITE_DB_PATH="data/directodegranja.db"
     ```
   - Guarda el archivo y reinicia la aplicación Windows.
4. **Respaldo de las claves del comprador:** Copia ese `.env` a una memoria USB cifrada o bóveda del comprador marcada como *"LLAVES MAESTRAS DIRECTO DE GRANJA — NO PERDER"*.

#### Caso B: Modo Servidor Node / Desarrollo (`npm run dev` o `npm start`)
1. Crea un archivo `.env` en la raíz del proyecto (junto a `package.json`). Este archivo está bloqueado en `.gitignore` para que nunca se suba a GitHub.
2. Contenido mínimo requerido:
   ```env
   JWT_SECRET="pon_aqui_64_hex_aleatorios"
   AES_ENCRYPTION_KEY="pon_aqui_otros_64_hex_aleatorios"
   SQLITE_DB_PATH="data/directodegranja.db"
   PORT=3000
   ```
3. Para uso fuera de red local en la nube (VPS con HTTPS), configura `NODE_ENV=production`, un certificado HTTPS/reverse proxy (Nginx/Caddy) y define `ALLOWED_ORIGINS="https://tu-dominio.com"`.

---

## 4. Configuración de Red en Windows para Sincronizar con Android

Para que los teléfonos Android de los vendedores se conecten en tiempo real (HTTP + WebSocket) con la computadora Windows de la bodega/oficina, ambos deben estar en la **misma red Wi-Fi / LAN** (o VPN local) y el puerto `3000` debe estar abierto en Windows.

### Paso 1: Configurar perfil de red como "Red privada" en Windows
1. En la PC con Windows, ve a **Configuración** -> **Red e Internet** -> **Wi-Fi** (o **Ethernet**).
2. Selecciona la red de la oficina/bodega y cambia el perfil de **Público** a **Privado**.

### Paso 2: Asignar IP fija (o reserva DHCP) a la PC Windows
Si cambia la IP del servidor Windows cuando se reinicia el módem, los teléfonos perderán la ruta:
1. Abre **CMD** (`cmd.exe`) y ejecuta:
   ```bat
   ipconfig
   ```
2. Anota la dirección **`IPv4 Address`** (ejemplo: `192.168.1.50`), **Máscara de subred** (`255.255.255.0`) y **Puerta de enlace** (`192.168.1.1`).
3. En la configuración del router/módem de la bodega, crea una **Reserva DHCP** para la MAC de la PC Windows (ej. siempre `192.168.1.50`), o asigna esa IP estática en Windows.

### Paso 3: Abrir el puerto TCP `3000` en el Firewall de Windows
Sin esta regla, la PC sí funciona localmente (`127.0.0.1:3000`), pero los teléfonos Android darán error de conexión al apuntar a `http://192.168.1.50:3000`:
1. Abre **PowerShell como Administrador** en la PC Windows.
2. Ejecuta este comando único:
   ```powershell
   New-NetFirewallRule -DisplayName "Directo de Granja LAN 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
   ```
3. Verifica en el navegador de un teléfono conectado al mismo Wi-Fi abriendo `http://192.168.1.50:3000` (debe cargar la pantalla de Directo de Granja).

---

## 5. Puesta en Marcha y Primer Arranque (Paso a Paso con el Comprador)

### 5.1 Crear la cuenta del Dueño en Windows (Primer Arranque)
1. Abre **Directo de Granja** en la PC Windows.
2. Como la base SQLite inicia **totalmente vacía sin usuarios demo**, aparecerá la pantalla de **Registro Inicial del Dueño**.
3. Captura junto con el comprador:
   - **Nombre completo del dueño**
   - **Correo electrónico del dueño** (ej. `dueno@bodega.mx`)
   - **Contraseña fuerte propia** (mínimo 8 caracteres, combinación de letras y números; nunca usar contraseñas de prueba).
4. Al guardar, el sistema almacena la contraseña con **bcrypt (costo 12)** y entra al panel del Dueño.

### 5.2 Configurar datos del negocio (para que los tickets 48 mm salgan iguales)
1. En Windows, entra a **Configuración**.
2. Verifica o edita:
   - **Nombre del negocio** (`Directo de Granja`)
   - **Eslogan** (`Te faltan huevos a nosotros nos sobran`)
   - **Teléfono** y **Dirección de bodega/oficina** (estos campos se cifran con AES-256-GCM en SQLite y se sincronizan hacia Android para que los tickets sean idénticos).

### 5.3 Dar de alta a los Vendedores desde Windows
1. En Windows, entra al módulo **Equipo y Dispositivos**.
2. Crea cada cuenta de vendedor asignándole:
   - **Nombre**
   - **Correo** (usuario de acceso en su teléfono)
   - **Contraseña inicial fuerte**
   - **Serie de folios exclusiva** (ej. `A` para Vendedor 1, `B` para Vendedor 2; nunca repetir series).

### 5.4 Instalar y conectar la App Android en cada teléfono
1. Copia el archivo **`directodegranja-debug.apk`** (descargado de GitHub Actions -> `DirectoDeGranja-Android-APK`) al teléfono Android del vendedor.
2. En Android, permite **"Instalar aplicaciones desconocidas"** para el administrador de archivos e instala el APK.
3. Abre **Directo de Granja** en Android.
4. En la pantalla de inicio de sesión (`Conectar con Windows`):
   - **URL del servidor Windows:** escribe `http://<IP-DE-WINDOWS>:3000` (ejemplo: `http://192.168.1.50:3000`).
   - **Correo y contraseña:** los del vendedor creados en el paso 5.3.
5. Pulsa **Iniciar sesión y conectar**.
6. **Autorización obligatoria del dispositivo:** Por seguridad (Control de Dispositivos), el primer inicio de sesión registra el teléfono como *Pendiente*.
   - En la PC Windows, ve a **Equipo y Dispositivos**, localiza el nuevo teléfono y haz clic en **Autorizar dispositivo**.
   - Desde ese instante, el teléfono descargará clientes, inventario, precios, saldos y rango de folios, y quedará **EN VIVO CON WINDOWS** por WebSocket.

---

## 6. Configuración de Impresoras Térmicas 48 mm (Windows y Android)

Ambas aplicaciones emiten tickets exactamente de **48 mm** (tanto para **Entregas** como para **Abonos `AB-XXXX`**):

### En Windows:
1. Abre la app **Directo de Granja** en Windows y entra a **Sistema** -> panel **Impresora Térmica 48 mm**.
2. Elige cómo conectarás tu impresora térmica:
   - **Impresora Windows (Driver instalado):** instala el driver oficial de la impresora en Windows, pulsa **Detectar impresoras de Windows**, selecciona tu impresora térmica en la lista y pulsa **Guardar impresora** para imprimir directo sin diálogos.
   - **USB / Puerto COM directo (ESC/POS):** conecta la impresora térmica por cable USB o puerto COM serie, pulsa **Vincular impresora USB / COM**, selecciona el puerto en la ventana del sistema y ajusta la velocidad (`9600 bps` estándar).
   - **Diálogo estándar 48 mm:** abre la ventana de impresión del sistema (papel `48mm` / `58mm`, márgenes `0`, escala `100%`).
3. Pulsa **Imprimir prueba 48 mm** para verificar que la impresora emite el ticket de prueba antes de operar.

### En Android:
1. Enciende la impresora térmica portátil (Bluetooth Clásico, Bluetooth LE o USB OTG).
2. Abre el menú lateral de la app Android -> **Impresora Térmica** (en versión conectada a Windows) o **Configuración**:
   - Concede permisos de **Bluetooth / Ubicación** si los solicita.
   - Elige **Bluetooth** o **USB OTG**, pulsa **Buscar impresora**, toca tu impresora para vincularla (acepta el PIN o permiso USB OTG si Android lo solicita).
   - Pulsa **Prueba 48mm** para confirmar que imprime `"PRUEBA DE IMPRESION 48MM"`.
3. Al registrar una **Entrega** o un **Abono parcial** (con o sin compra nueva):
   - La app abre automáticamente el **Ticket 48 mm** (o **Ticket Abono 48 mm**).
   - Puedes **Imprimir (48 mm)**, **Reimprimir como COPIA** (agrega el sello `[ COPIA ]`), **Compartir PDF por WhatsApp** o **Descargar PDF**.

---

## 7. Abonos Parciales sin Nueva Compra (Cómo Operarlos)

Tanto en Windows como en Android, los clientes con crédito pendiente pueden abonar **sin comprar mercancía nueva**:
- **En Windows:** Ve a **Clientes** -> selecciona al cliente -> formulario **Abono parcial a deuda (sin compra)** -> escribe manualmente el monto a abonar, elige `Efectivo` o `Transferencia` y una nota opcional -> al confirmar se genera el folio **`AB-XXXX`** y se abre la ventana del **Ticket de Abono 48 mm** listo para imprimir. También puedes reimprimir cualquier abono desde el historial con el botón **Ticket**.
- **En Android:** Ve a **Clientes** -> toca el cliente -> pulsa **Registrar Abono a Deuda** -> selecciona **"Saldo general (automático)"** (para abonar a toda su cuenta o deuda sincronizada) o una nota específica, escribe manualmente el monto del abono y la forma de pago -> al guardar se abre **Ticket Abono 48 mm** para imprimir o enviar por WhatsApp, y queda sincronizado en tiempo real con Windows (`AB-XXXX`).

---

## 8. Copias de Seguridad Cifradas (`.dgbackup`), Migración y Restauración

1. **Crear respaldo:** En Windows -> **Respaldos**, genera un respaldo cifrado `.dgbackup`.
   - Todo el contenido se cifra con **AES-256-GCM** usando `AES_ENCRYPTION_KEY` e incluye hash **SHA-256** de integridad.
2. **Verificar integridad:** Usa el botón de verificación o carga el archivo para comprobar que no esté alterado ni corrupto antes de sobrescribir nada.
3. **Restauración segura:** Antes de restaurar un `.dgbackup`, el servidor crea automáticamente un respaldo preventivo de seguridad (`safety backup`) y ejecuta la carga de forma atómica; si falla o la clave AES no coincide, no borra ni corrompe la base SQLite actual.
4. **Migración desde copias antiguas:** Si una base anterior contiene contraseñas de demostración conocidas o campos de contacto en texto plano, al arrancar el servidor:
   - Bloquea automáticamente las cuentas con contraseñas demo hasta que el dueño asigne contraseñas nuevas.
   - Cifra automáticamente los registros en texto plano dentro de SQLite sin perder ningún cliente, saldo ni entrega.

---

## 9. Checklist Final Antes de Entregar al Comprador

- [ ] Se instaló el `.exe` más reciente en la PC Windows del comprador (o se configuró `.env` sin claves de ejemplo).
- [ ] Se guardó una copia segura de `JWT_SECRET` y `AES_ENCRYPTION_KEY` de `%APPDATA%\DirectoDeGranja\.env`.
- [ ] El Firewall de Windows permite TCP `3000` en perfil Privado y la PC tiene IP fija en el módem/router.
- [ ] El dueño registró su propio correo y contraseña fuerte en el primer arranque.
- [ ] Se configuró nombre, eslogan, teléfono y dirección reales en **Configuración**.
- [ ] Se crearon las cuentas de vendedores con sus series de folio (`A`, `B`, etc.) y se instaló el `.apk` en sus teléfonos.
- [ ] Cada teléfono Android inició sesión, fue **autorizado en Windows** y mostró estado **EN VIVO CON WINDOWS**.
- [ ] Se hizo 1 entrega de prueba, 1 abono parcial de prueba sin compra nueva, y se imprimió el ticket de entrega y el ticket de abono (`AB-0001`) en la impresora de 48 mm verificando coincidencia exacta Windows vs Android.
- [ ] Se probó generar y verificar 1 respaldo cifrado `.dgbackup` en USB externo.
