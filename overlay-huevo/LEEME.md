# Overlay de huevo (Windows, Compose Desktop)

1. Copia `kotlin/EggOverlay.kt` y `kotlin/EggOverlayController.kt` a `desktopApp/ui/overlay/` y cambia el `package`.
2. Envuelve tu pantalla raíz con `EggOverlayHost(controller) { ... }`.
3. Llama `controller.run { ... }` en cada operación importante (arranque, confirmar venta, entrada de camión, conteo, Excel, cierre, imprimir).
4. `html/` tiene las 3 animaciones en HTML por si quieres compararlas; no se usan en la app.
Textos: Cargando / Se han sumado mis huevitos también / Se están atorando mis huevos (botones Reintentar y Cancelar).
Relleno del huevo: amarillo #F6C928. Dependencias: solo compose foundation, ui y animation (sin Material).
