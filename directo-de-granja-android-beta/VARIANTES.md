# Variantes de la app

La app permite instalar distintas marcas desde el mismo código compartido. Las variantes son independientes: cada una tiene nombre, colores, ícono y carpeta local de datos.

## Variantes actuales

- `hyhhuevos`: H y H HUEVOS.
- `lili`: Distribuidora de Huevos LILI.
- `directodegranja`: Directo de Granja. Esta variante conserva la lógica y base Room de Android, y es el punto de partida para integrar la sincronización.

Los nombres, colores, prefijos y carpetas se configuran en `app/build.gradle.kts`. Los textos e imágenes propios están en `app/src/<variante>/res`.

## Compilar

En Android Studio elige la variante `directodegranjaDebug`. También se puede compilar desde la terminal del proyecto con:

```bash
./gradlew assembleDirectodegranjaDebug
```

La app nueva usa el identificador `com.aistudio.directodegranja`, por lo que se puede instalar junto a H y H o LILI para probarla. Al instalarla aparece con una base local nueva; no mueve automáticamente los datos de otra variante. La app tiene una función de respaldo y restauración que puede servir para trasladar información, pero antes de cambiar de app hay que probar la importación con una copia del respaldo.

## Recursos de marca

- Logo de tickets y PDF: `app/src/<variante>/res/drawable/img_ticket_logo.png`.
- Imagen de bienvenida: `app/src/<variante>/res/drawable/img_welcome_hero.jpg`.
- Ícono: `app/src/<variante>/res/mipmap-*`.

La variante `directodegranja` se preparó con el logotipo incluido en el proyecto de Windows. H y H y LILI mantienen sus propios recursos y configuración.
