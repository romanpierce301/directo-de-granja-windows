using System.Windows;
using System.Windows.Controls;

namespace HuevoControl.WindowsApp.Controls;

public sealed record TicketBoxLine(string Label, string Weight);

public partial class Ticket48mmControl : UserControl
{
    public Ticket48mmControl()
    {
        InitializeComponent();
        BoxesList.ItemsSource = new[]
        {
            new TicketBoxLine("Caja 1", "25.35 kg"),
            new TicketBoxLine("Caja 2", "24.45 kg"),
            new TicketBoxLine("Caja 3", "25.12 kg"),
            new TicketBoxLine("Caja 4", "22.78 kg"),
            new TicketBoxLine("Caja 5", "22.90 kg")
        };
    }

    public void PrintThermal48mm()
    {
        var dlg = new PrintDialog();
        if (dlg.ShowDialog() == true)
        {
            Measure(new Size(181.4, double.PositiveInfinity));
            Arrange(new Rect(new Point(0, 0), DesiredSize));
            dlg.PrintVisual(this, $"Ticket_{TxtFolio.Text}");
        }
    }
}
