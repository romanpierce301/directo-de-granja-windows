using System.Windows;
using ClosedXML.Excel;
using HuevoControl.Domain.Rules;
using HuevoControl.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace HuevoControl.WindowsApp;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private async void OnSyncSqlClick(object sender, RoutedEventArgs e)
    {
        try
        {
            string localSqlite = $"Data Source={System.IO.Path.Combine(AppContext.BaseDirectory, "huevocontrol-cache.db")}";
            var opts = new DbContextOptionsBuilder<WindowsLocalSqliteCacheContext>()
                .UseSqlite(localSqlite)
                .Options;

            await using var cache = new WindowsLocalSqliteCacheContext(opts);
            await cache.Database.EnsureCreatedAsync();
            TxtConnectionStatus.Text = $"Caché SQLite y motor EF Core verificados ({DateTime.Now:HH:mm:ss})";
        }
        catch (Exception ex)
        {
            TxtConnectionStatus.Text = $"Error de conexión: {ex.Message}";
        }
    }

    private void OnExportExcelClick(object sender, RoutedEventArgs e)
    {
        string localSqlite = $"Data Source={System.IO.Path.Combine(AppContext.BaseDirectory, "huevocontrol-cache.db")}";
        var opts = new DbContextOptionsBuilder<WindowsLocalSqliteCacheContext>()
            .UseSqlite(localSqlite)
            .Options;

        using var cache = new WindowsLocalSqliteCacheContext(opts);
        cache.Database.EnsureCreated();
        var deliveries = cache.Deliveries.OrderByDescending(d => d.CreatedAtUtc).ToList();

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Ventas");
        ws.Cell(1, 1).Value = "Folio";
        ws.Cell(1, 2).Value = "Cliente";
        ws.Cell(1, 3).Value = "Total";

        int row = 2;
        foreach (var d in deliveries)
        {
            ws.Cell(row, 1).Value = ExcelSecuritySanitizer.EscapeForExport(d.FolioFormatted);
            ws.Cell(row, 2).Value = ExcelSecuritySanitizer.EscapeForExport(d.CustomerName);
            ws.Cell(row, 3).Value = $"${d.TotalToChargeCentavos / 100.0:N2}";
            row++;
        }

        string outPath = System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            $"DirectoDeGranja_Ventas_{DateTime.Now:yyyyMMdd_HHmm}.xlsx");
        wb.SaveAs(outPath);
        TxtConnectionStatus.Text = $"Excel seguro exportado ({deliveries.Count} filas): {System.IO.Path.GetFileName(outPath)}";
    }

    private void OnPrintTicketClick(object sender, RoutedEventArgs e)
    {
        TicketPreview.PrintThermal48mm();
    }
}
