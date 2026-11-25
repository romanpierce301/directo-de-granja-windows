# Revisión Red Team — 24 de noviembre de 2026

## Alcance

Revisión estática del backend Express, clientes React, servicios .NET 8, endpoints de sincronización, almacenamiento local y configuración Docker. No se ejecutaron pruebas dinámicas contra un entorno desplegado. Este documento recoge fallos confirmados en el código y las correcciones aplicadas en esta revisión; no representa una certificación de seguridad.

## Hallazgos corregidos

1. **Alto — Cuentas iniciales con contraseñas públicas**
   - La base nueva se inicializaba con cuentas dueño y vendedor conocidas, y la pantalla de acceso rellenaba automáticamente la contraseña del dueño.
   - Las bases existentes ahora detectan esas credenciales conocidas. El dueño adopta `INITIAL_OWNER_EMAIL` / `INITIAL_OWNER_PASSWORD` y las cuentas vendedor que usaban la contraseña compartida quedan bloqueadas. Las bases nuevas solo crean al dueño configurado; ya no crean vendedores demo.

2. **Alto — Claves criptográficas efímeras o débiles**
   - Antes se generaban claves aleatorias temporales si faltaba configuración. Tras un reinicio, las sesiones dejaban de ser válidas y los datos cifrados no podían recuperarse.
   - El backend Node ahora exige `JWT_SECRET` de al menos 32 caracteres y `AES_ENCRYPTION_KEY` de exactamente 32 bytes en hexadecimal. Los servicios .NET rechazan claves de menos de 32 caracteres. `.env.example` indica cómo generar claves; no usar los valores de ejemplo.

3. **Alto — Datos personales en texto claro y archivos de datos versionables**
   - Teléfono, contacto, domicilio y notas de clientes se guardaban en texto claro en el JSON; `data/` tampoco estaba ignorado por Git.
   - En el almacén Node esos cuatro campos ahora se guardan con AES-256-GCM, se descifran al preparar respuestas para clientes autenticados y se migran al iniciar las bases existentes. `data/` queda excluido de Git.

4. **Alto — Endpoints de alertas y sincronización con control de acceso insuficiente en .NET**
   - El hub de alertas publicaba conteos operativos a conexiones anónimas. El endpoint de sincronización aceptaba llamadas autenticadas sin exigir rol vendedor y confiaba en nombre de cliente enviado por el teléfono.
   - El hub ahora exige dueño; el envío exige vendedor activo, limita el tamaño del lote, valida cajas/precios/folios y carga el nombre del cliente desde la base. Los IDs y folios repetidos dentro del lote o ya existentes se omiten.

5. **Medio — Suplantación del autor de precios y cierres .NET**
   - Los endpoints de ledger aceptaban el ID/nombre del dueño desde el JSON.
   - El autor se obtiene ahora de los claims JWT y el nombre del vendedor de cierre se toma de la cuenta guardada.

6. **Medio — Fuerza bruta, exposición de métricas y servicios locales**
   - Se añadieron límites de acceso al login .NET (30/min) y sincronización .NET (120/min), CSP en la compilación de producción, un límite de carga WebSocket, y validación de cuenta activa al conectar o descargar datos.
   - `/api/health` dejó de revelar volumen de ventas/clientes. SQL Server y Redis en Compose solo enlazan a localhost; Compose exige contraseña SQL propia y ya no trae una contraseña de respaldo.

7. **Medio — Recuperación destructiva ante JSON dañado**
   - El almacén sustituía un archivo ilegible por una base vacía. Ahora falla de forma explícita y conserva el archivo original para recuperación.

## Riesgo pendiente / decisiones de integración

- Express recibe `deviceId` en la sincronización, pero no lo valida contra un dispositivo autorizado asociado a la cuenta. El flujo de registro Android/dispositivo necesita definirse antes de poder imponer de forma compatible la regla de un dispositivo autorizado.
- El modelo SQL de .NET conserva campos de cliente como contacto, domicilio y notas sin cifrar. Antes de usar esa base con datos reales, hay que definir cifrado de columnas y migración de esquema también para SQL Server.
- El token WebSocket del backend Express se envía actualmente en la query string. Debe migrarse a un ticket de conexión de un solo uso o a una sesión/cookie segura para evitar que aparezca en registros de URL.
- El almacén JSON local no cifra el archivo completo: campos del libro mayor distintos de los datos personales cifrados siguen legibles para quien tenga acceso al disco. En Windows conviene definir ubicación bajo perfil de usuario y ACL/DPAPI o adoptar la base SQL local prevista.
- Antes de desplegar la solución Windows, deben compartirse el contrato de autenticación y sincronización Android, el modelo de confianza para dispositivos y el modo de operación en red. Esta revisión no modifica esa arquitectura.

## Configuración inicial

Copiar `.env.example` a `.env`, generar claves distintas con `openssl rand -hex 32` y establecer correo, nombre y contraseña inicial del dueño. No reutilizar claves entre instalaciones ni perder `AES_ENCRYPTION_KEY`: los datos cifrados existentes dependen de ella.
