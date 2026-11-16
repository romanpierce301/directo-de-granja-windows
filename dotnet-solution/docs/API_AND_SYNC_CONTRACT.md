# Contrato de Sincronización Android <-> Backend <-> Windows

La aplicación Android nativa existente se conecta al backend mediante HTTPS + JWT Bearer.

## 1. Autenticación
`POST /api/auth/login`
- Respuesta: `{ "token": "<JWT>", "user": { "id", "role", "folioSeries" } }`

## 2. Envío de lotes sin conexión (`POST /api/sync/push`)
- Cabecera: `Authorization: Bearer <JWT>`
- Cuerpo: `{ "deviceId": "...", "deliveries": [...], "payments": [...], "losses": [...], "incidents": [...] }`
- **Idempotencia**: Cada registro lleva su UUID generado en el teléfono; si se reenvía tras un corte de red, el servidor ignora duplicados (`skippedDuplicates`) sin duplicar folios ni ventas.
- **Tiempo real**: Al confirmar el lote, el servidor emite `delivery:synced` por WebSocket (`/ws`) o SignalR (`/hubs/sync`) hacia la aplicación Windows del dueño.

## 3. Descarga incremental (`GET /api/sync/pull`)
- Devuelve: `accountStatus` (activa / pendiente / bloqueada), `folioSeries`, `dailyPrice` más reciente y catálogo de `customers` vigentes.
- **Documentación interactiva**: Disponible en `/api/docs` (Swagger UI) y `/api/swagger.json`.
