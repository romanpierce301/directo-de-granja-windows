# Mapa funcional: Android actual y Windows

Revisión estática de los repositorios locales `app-huevo-more-act` y `directo-de-granja-windows`, realizada el 24 de noviembre de 2026. Se comparó código y estructura; no se ejecutaron ambas apps ni se probó una sincronización real.

## Funciones que se parecen y diferencias que hay que resolver

| Función | Android actual | Windows actual | Resultado para la variante de vendedores |
|---|---|---|---|
| Clientes | Guarda clientes en Room con ID numérico; incluye teléfono, domicilio, precio especial y plazo de crédito. | El dueño crea y une clientes; usa ID de texto. No tiene los campos de precio especial ni plazo de crédito. | Hace falta un identificador compartido y decidir cómo representar tarifas especiales/plazos. Los clientes nuevos creados sin conexión deben quedar provisionales hasta que Windows los reciba. |
| Entregas | Guarda varios artículos pesados, modalidad, marca, tara, precio por artículo, monto total y azúcar. También guarda firma local. | El contrato de sincronización ahora acepta líneas con marca, modalidad, pesos, precio individual y azúcar; el ticket puede mostrarlas. | Es el primer bloque de compatibilidad. Aún falta implementar la captura/salida real desde Android, conservar firmas, validar medias cajas con la misma precisión y mostrar todo el detalle en las pantallas administrativas. |
| Precios y redondeo | Usa `BigDecimal`; primero redondea el importe a centavos y luego aplica su regla de cobro. | El cálculo compartido de Windows ya redondea a centavos primero y aplica después la regla comercial. | Quedó alineada la regla descrita en el código. Ejemplo: 2.714 kg a $37.03/kg da $100.49942, que primero queda en $100.50 y conserva esos 50 centavos. Falta cotejar todos los casos límite con Android antes de usar importes reales. |
| Folios | La app actual crea folios localmente con prefijo, año y secuencia. | Windows mantiene series y contadores centrales. | La variante nueva recibirá bloques exclusivos por dispositivo desde Windows mientras tenga internet. Android los consume offline; el ID de instalación identifica el equipo. La MAC no se usará como identificador ni como mecanismo de seguridad. Si se agota el bloque sin conexión, la venta queda con ID temporal hasta recibir folio oficial. |
| Cobros y abonos | La entrega distingue `CONTADO`/`CREDITO`; los abonos guardan monto y nota, pero no guardan método de pago. | El contrato de entrega ya conserva `CONTADO`/`CREDITO`; cada movimiento de pago sigue diferenciando efectivo/transferencia y verificación. | Esa distinción ya está modelada en Windows. Falta definir e implementar la sincronización de abonos y su método de pago porque Android no lo guarda hoy. |
| Cierre diario | Calcula un cierre local con ventas, abonos, clientes, kilos y archivos PDF/JSON locales. | Calcula el cierre en Windows desde ventas, pagos, mermas, incidentes y efectivo entregado por el vendedor. | Windows debe calcular el cierre oficial con los movimientos sincronizados; el PDF/hash de Android no sustituye ese cálculo. Se debe conservar el cierre local como comprobante si así se necesita. |
| Inventario y compras | La base Android incluye compras e inventario local. | Windows controla las existencias de bodega. | En la variante Directo se ocultan Compras e Inventario. Android no registra compras; las entregas aprobadas por el dueño descuentan bodega en Windows. |
| Mermas e incidentes | La variante Directo añade una pantalla local para registrar mermas e incidentes offline. | Windows revisa los reportes recibidos y decide su tratamiento. | Los registros se sincronizan como pendientes; no alteran existencias por sí solos. |
| Usuarios, personal y dispositivos | La app base no tiene perfiles, contraseña ni vinculación de teléfono. No tiene pantalla para asignar al personal de ruta. | El teléfono puede registrarse como pendiente y el servidor exige dispositivo activo para descargar/subir como vendedor; el dueño autoriza desde Windows. | Android necesita inicio de sesión y una pantalla sencilla para asignar nombres/puestos de vendedor, chofer y ayudante. Windows mantiene los permisos administrativos. |
| Sincronización | No tiene permiso de internet ni un cliente de red activo. | Existe `/api/sync/push` y `/api/sync/pull`; Windows hoy guarda estado en JSON y su pantalla de Android solo simula el envío. | Android funcionará con Room offline-first y una cola de movimientos. Al reconectar por internet/VPN privada sincroniza con el servicio Windows. No se usará una base externa; se propone SQLite local central en Windows. Excel queda para importaciones, reportes y respaldos, no para concurrencia de sincronización. |

## Conclusión práctica

El código Android actual es una app local de administración con muchas funciones del dueño, no todavía una app de ruta para vendedores. El sabor Directo de Granja cambia marca e ícono, pero comparte esas mismas pantallas. Antes de dárselo al personal hay que añadir acceso por cuenta, asignación de ruta, sincronización offline-first y estado de movimientos pendientes de revisión.

La variante Directo descarga el catálogo completo de clientes, precios y folios; registra entregas, abonos, personal de ruta, mermas e incidentes offline y los envía para revisión administrativa. No asigna días fijos a los clientes. No incluye pantallas de Compras ni de Inventario: Windows administra la bodega y descuenta las entregas aprobadas.

## Orden recomendado para evitar descuadres

1. Reemplazar el almacén JSON de Windows por SQLite local y mantener Excel para importación/exportación/respaldo.
2. Completar personal, acceso, aprobación del teléfono y asignación de ruta.
3. Crear bloques automáticos de folios exclusivos por dispositivo.
4. Implementar la cola offline-first de Android y sincronización por internet cifrada, con confirmación por registro.
5. Alinear entregas, pagos, abonos, firmas, clientes y estado de revisión en Windows.
6. Probar con dos teléfonos, desconexiones y folios agotados antes de usar datos o efectivo reales.
