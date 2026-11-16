# Compilación del Ejecutable de Windows (.exe) — HuevoControl

En este entorno Linux en la nube no es posible generar el binario nativo `win-x64` de WPF, por lo que toda la solución **.NET 8** queda lista para compilar el archivo único `HuevoControl-Dueno.exe` en un solo comando desde Windows 10/11 o automáticamente mediante GitHub Actions.

## Opción 1: Compilación directa en tu PC Windows

### Requisitos previos
1. Instalar **.NET 8 SDK** (`winget install Microsoft.DotNet.SDK.8`).
2. Opcional para SQL Server local: **SQL Server Express / Developer** (`localhost,1433`) o levantar con Docker:
   ```powershell
   cd dotnet-solution
   docker compose up -d
   ```

### Pasos para generar el `.exe`
```powershell
cd dotnet-solution

# 1. Restaurar dependencias y ejecutar pruebas unitarias (cobertura >80%)
dotnet restore HuevoControl.sln
dotnet test tests/HuevoControl.UnitTests/HuevoControl.UnitTests.csproj --configuration Release

# 2. Compilar ejecutable único autocontenido (.exe) para Windows x64
dotnet publish src/Desktop/HuevoControl.WindowsApp/HuevoControl.WindowsApp.csproj `
  -c Release `
  -r win-x64 `
  --self-contained true `
  -p:PublishSingleFile=true `
  -o ./publish-win-x64
```

El ejecutable final aparecerá en:
`dotnet-solution/publish-win-x64/HuevoControl-Dueno.exe`

No requiere instalar .NET Runtime en la computadora del dueño.

## Opción 2: Compilación automática en CI/CD (GitHub Actions)

El flujo `.github/workflows/ci-cd-windows.yml` ejecuta:
1. Pruebas xUnit con compuerta obligatoria de **>80% de cobertura** (Coverlet) en `ubuntu-latest`.
2. Compilación y empaquetado de `HuevoControl-Dueno.exe` en `windows-latest`.
3. Publicación automática del artefacto descargable `HuevoControl-Dueno-Windows-x64`.
