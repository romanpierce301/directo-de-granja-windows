# Directo de Granja — funciones y puesta en marcha de la beta

## Estado real de los entregables

| Entregable | Estado |
|---|---|
| Windows (interfaz React) | Compilado correctamente; ZIP listo para abrir en navegador local. |
| Android Directo | Código actualizado con la paleta morada y tema claro/oscuro. El APK nuevo no terminó de compilar en este entorno porque Gradle quedó detenido resolviendo dependencias. |
| Instalador `.exe` | No generado. La solución WPF separada requiere SDK .NET 8 y compilación Windows; todavía no es la aplicación React completa. |
| Base local Windows | JSON local (`data/huevocontrol-ledger.json`) en la app React. No depende de una base externa. |
| Base local Android | Room/SQLite en el teléfono. |

## Funciones disponibles en Windows

- **Inicio de sesión y autorización:** administra el acceso del dueño y el estado de los dispositivos Android.
- **Panel general:** muestra indicadores administrativos, sincronizaciones y pendientes.
- **Clientes:** alta, edición, consulta y sincronización del catálogo completo hacia teléfonos autorizados. No se asignan días fijos.
- **Vendedores/dispositivos:** revisión y autorización de teléfonos, usuarios y permisos.
- **Personal de ruta:** registro de vendedor, chofer y ayudante para identificar el origen de una ruta.
- **Entregas:** consulta entregas recibidas, marcas, modalidades, pesos, tara, precios, azúcar y contado/crédito.
- **Bodega/inventario:** administración de existencias centrales; las entregas aprobadas de Android son las que deben descontar existencias.
- **Mermas e incidentes:** revisión administrativa de reportes recibidos desde Android.
- **Pagos y abonos:** consulta de cobros y movimientos pendientes de revisión.
- **Cierres y reportes:** resumen de ventas, pagos, mermas, incidentes y efectivo entregado.
- **Excel:** importación/exportación y respaldos legibles; Excel no debe ser el almacenamiento concurrente de sincronización.
- **Configuración:** apariencia clara/oscura, parámetros y supervisión del sistema.

## Funciones disponibles en Android Directo

- **Catálogo local:** conserva clientes y datos de trabajo en Room/SQLite para operar sin internet.
- **Entregas de ruta:** captura productos, marcas, modalidad, peso bruto/tara/neto, precio aplicado y azúcar.
- **Reglas de precio:** usa cálculo decimal y redondeo de cobro para evitar diferencias de centavos.
- **Contado y crédito:** registra la modalidad de la entrega; Windows debe revisar y aceptar el movimiento.
- **Pagos y abonos:** guarda cobros y notas localmente para enviarlos posteriormente.
- **Firma y ticket:** conserva la firma local y genera el comprobante térmico/PDF disponible en la app.
- **Mermas e incidentes:** registra reportes offline para que el dueño los revise en Windows.
- **Personal de ruta:** permite identificar vendedor, chofer y ayudante.
- **Trabajo sin internet:** los movimientos quedan pendientes localmente y deben sincronizarse al volver la conexión.
- **Historial y cierres locales:** consulta movimientos y genera archivos locales de respaldo/cierre.
- **Compras e inventario:** deben permanecer ocultos/desactivados en la variante Directo; el inventario oficial pertenece a Windows.

## Qué hace falta para sincronizar de verdad

1. Ejecutar el servicio de Windows (`server.ts`) junto con la interfaz.
2. Configurar una red privada entre la PC y los teléfonos (por ejemplo, Wi-Fi del negocio o VPN privada). No abrir el puerto directamente a internet.
3. Crear el usuario y autorizar el dispositivo Android desde Windows.
4. Hacer que Android use una cola de pendientes con reintentos automáticos; hoy la sincronización completa todavía no está cerrada.
5. Persistir y validar firmas, método de pago de abonos y confirmación individual de cada movimiento.
6. Migrar el almacenamiento central de Windows de JSON a SQLite local antes de operar con varios teléfonos simultáneamente.
7. Implementar bloques de folios oficiales por instalación; el identificador aleatorio de instalación es preferible a la MAC.
8. Alinear clientes, precios, entregas, pagos, abonos, cierres y estados de aprobación.

## Cómo mostrar la beta mañana sin `.exe`

### Windows

1. Instala Node.js LTS en la PC.
2. Copia el repositorio Windows completo, no solo el ZIP de `dist`.
3. En la carpeta del proyecto ejecuta `npm install`.
4. Arranca el servicio/API con el comando definido en el proyecto (`npm run server`, si está disponible en tu copia).
5. En otra consola ejecuta `npm run dev -- --host 0.0.0.0`.
6. Abre la dirección que muestre Vite en el navegador de la PC.

El ZIP compilado solo contiene la interfaz; no sustituye el servicio `server.ts`.

### Android

Necesitas permitir instalación de APK de prueba en el teléfono y copiar el APK al dispositivo. La compilación nueva debe terminar antes de entregar esta versión; el APK actualmente disponible es anterior a la paleta morada.

## Requisitos de la PC del cliente

- Windows 10/11 de 64 bits.
- Node.js LTS.
- Navegador actualizado (Chrome o Edge).
- Permiso de firewall para el servicio local solamente dentro de la red privada.
- Carpeta de respaldos con permisos de escritura.
- Para generar un `.exe` real: Visual Studio Build Tools/SDK .NET 8 en Windows, o ejecutar el workflow `windows-latest` de GitHub Actions.

## Recomendación para la demostración

Usa datos ficticios, un teléfono y una PC en la misma red. Demuestra catálogo, alta de cliente, entrega, pago, merma/incidente y revisión en Windows. No presentes la sincronización como terminada hasta que el movimiento aparezca en Windows después de desconectar y reconectar el teléfono.
