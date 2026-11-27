# Directo de Granja para Android

Este módulo contiene una sola variante distribuible: Directo de Granja. Usa Room/SQLite local y el mismo código funcional que está en este repositorio.

## Identidad de la aplicación

- Flavor: `directodegranja`.
- Identificador Android: `com.aistudio.directodegranja`.
- Recursos de marca: `app/src/directodegranja/res`.

El proyecto Android original con otras marcas está en su repositorio separado. Este módulo de Windows genera únicamente la variante Directo.

## Compilar

En Android Studio elige la variante `directodegranjaDebug`. También se puede compilar desde la terminal del proyecto con:

```bash
./gradlew assembleDirectodegranjaDebug
```

Al instalarla se crea una base local propia; no importa automáticamente datos de otra app. La app incluye respaldo y restauración local.

## Recursos de marca

- Logo de tickets y PDF: `app/src/directodegranja/res/drawable/img_ticket_logo.png`.
- Imagen de bienvenida: `app/src/directodegranja/res/drawable/img_welcome_hero.jpg`.
- Ícono: `app/src/directodegranja/res/mipmap-*`.

El flavor Android de LILI y el flavor H y H no se compilan desde este repositorio.
