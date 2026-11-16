# Auditoría de Seguridad Red Team — HuevoControl

Se realizó una evaluación Red Team sobre todo el proyecto (backend Node/Express, frontend React, solución .NET 8 y manejo de archivos Excel).

## Vectores evaluados y controles implementados

1. **Inyección de fórmulas en Excel (CSV/XLSX Formula Injection — CWE-1236)**
   - **Riesgo**: Un nombre de cliente malicioso como `=CMD|'/C calc'!A0` o `+SUM(...)` podría ejecutar comandos al abrir el reporte en Excel.
   - **Mitigación**: Al importar se leen solo valores (`cellFormula: false` en SheetJS / valores crudos en ClosedXML). Al exportar, `escapeExcelFormulaInjection` / `ExcelSecuritySanitizer.EscapeForExport` antepone `'` a toda celda que inicie con `=`, `+`, `-`, `@`, `\t` o `\r`. Validado con pruebas automatizadas (Casos X2 y X3).

2. **Escalada de privilegios y autenticación JWT (Broken Access Control — OWASP A01)**
   - **Riesgo**: Un usuario con rol `vendedor` podría intentar aprobar cuentas, publicar precios globales o revisar sus propios incidentes.
   - **Mitigación**: Todas las rutas administrativas exigen `requireRole('dueno')` en Express y `[Authorize(Policy = "RequireDueno")]` en .NET 8; los tokens firman `issuer`, `audience` y algoritmo `HS256` explícito (sin aceptar `alg: none`).

3. **Autenticación WebSocket sin autorización**
   - **Riesgo**: Conexiones WebSocket anónimas escuchando ventas y saldos en tiempo real.
   - **Mitigación**: `/ws` y `/hubs/sync` validan el token JWT antes de aceptar datos; conexiones sin token válido se cierran inmediatamente (`4001`/`4003`).

4. **Secretos en código fuente y almacenamiento de contraseñas**
   - **Riesgo**: Claves JWT/AES estáticas en el repositorio o contraseñas guardadas en texto plano.
   - **Mitigación**: Se usan variables de entorno (`JWT_SECRET`, `AES_ENCRYPTION_KEY`, `SQL_SERVER_CONNECTION`) documentadas en `.env.example`, con respaldo efímero CSPRNG (`crypto.randomBytes(32)`) en desarrollo local y hashing `bcrypt` (factor 12). La sesión JWT vive únicamente en `sessionStorage` sin almacenar contraseñas.

5. **Integridad de dinero, pesos y libro mayor (Business Logic Tampering)**
   - **Riesgo**: Manipulación por redondeos de punto flotante o borrado de entregas pagadas.
   - **Mitigación**: Todo peso se calcula en gramos enteros y todo dinero en `BIGINT` de centavos; las entregas son de solo agregado (`append-only`), solo se cancelan con motivo obligatorio conservando el folio y su bitácora inmutable.

6. **Fuerza bruta y abuso de sincronización (Rate Limiting & XSS)**
   - **Mitigación**: `express-rate-limit` / ASP.NET `RateLimiter` protegen `/api/auth/login` (30 req/min) y `/api/sync/push` (120 req/min); `helmet` endurece cabeceras HTTP; `sanitizePlainText` limpia caracteres HTML `< >` y caracteres de control.
