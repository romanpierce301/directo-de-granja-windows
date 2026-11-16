# Arquitectura Modular y Microservicios — HuevoControl (.NET 8)

## Vista general
El ecosistema implementa una **Arquitectura Limpia (Clean Architecture)** separando reglas de dominio puras, casos de uso, infraestructura de persistencia y microservicios independientes detrás de un API Gateway YARP.

### Capas compartidas (`src/Core/`)
- **HuevoControl.Domain**: Las 16 entidades del modelo de datos, aritmética entera exacta (`int` gramos, `long` centavos), `DeliveryCalculator` (redondeo de Directo de Granja) y `ExcelSecuritySanitizer`. Sin dependencias externas.
- **HuevoControl.Application**: Interfaces (`IHuevoControlDbContext`, `IRedisCacheService`, `IAesEncryptionService`, `IJwtTokenService`, `IRealtimeAlertPublisher`) y `SyncProcessorService` para sincronización idempotente.
- **HuevoControl.Infrastructure**:
  - `HuevoControlSqlServerDbContext` (Entity Framework Core 8 sobre SQL Server).
  - `WindowsLocalSqliteCacheContext` (caché local SQLite para arranque instantáneo en Windows).
  - `Aes256EncryptionService` (AES-256-GCM), `BcryptPasswordHasher` (factor 12) y `JwtTokenService` (HS256 RBAC).
  - `RedisCacheService` (`StackExchange.Redis`).

### Microservicios (`src/Services/`)
1. **HuevoControl.Gateway**: YARP Reverse Proxy, Rate Limiting y validación JWT centralizada.
2. **HuevoControl.AuthService**: Login JWT con roles (`dueno`, `vendedor`), gestión de usuarios cifrados y Swagger OpenAPI.
3. **HuevoControl.SyncService**: Recepción idempotente de lotes Android (`POST /api/sync/push`), descarga incremental (`GET /api/sync/pull`), caché Redis y hub **SignalR** con backplane Redis hacia Windows.
4. **HuevoControl.LedgerService**: Consultas de entregas, publicación de precio del día en Redis y cierres de caja.
5. **HuevoControl.MonitoringService**: HealthChecks de SQL Server y Redis + Worker en segundo plano para alertas proactivas en tiempo real vía SignalR.

### Aplicación de Escritorio Windows (`src/Desktop/HuevoControl.WindowsApp`)
- **WPF (.NET 8 `net8.0-windows`)** con botones 3D táctiles (`Tactile3DStyles.xaml`, estrictamente sin ámbar ni amarillo).
- **Plantilla de Ticket 48mm (`Ticket48mmControl.xaml`)** integrada directamente con la mascota de Directo de Granja y soporte nativo de impresión térmica (`PrintDialog` a 48mm = `181.4 DIP`).
- **ClosedXML** para importación/exportación Excel con escape anti-inyección de fórmulas.
