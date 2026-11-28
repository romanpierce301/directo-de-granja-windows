package com.example.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.BuildConfig
import com.example.R
import com.example.data.local.entity.AbonoEntity
import com.example.data.local.entity.BusinessSettingsEntity
import com.example.data.local.entity.ClientEntity
import com.example.data.local.entity.DeliveryEntity
import com.example.domain.CalculationEngine
import com.example.ui.theme.SpaceMonoFontFamily
import com.example.ui.theme.ThermalAlertRed
import com.example.ui.theme.ThermalInkDark
import com.example.ui.theme.ThermalPaper
import java.math.BigDecimal
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val GrayCopyStamp = Color(0xFF6B7785)

/**
 * Plantilla visual exacta de Ticket Térmico 48 mm idéntica a Windows (`Ticket48mm`).
 */
@Composable
fun ThermalTicket48mmView(
    delivery: DeliveryEntity,
    client: ClientEntity?,
    settings: BusinessSettingsEntity,
    signatureBitmap: Bitmap?,
    modifier: Modifier = Modifier,
    isCopy: Boolean = false,
    liveCustomerTotalDebtMxn: Double? = null,
) {
    val dateFmt = SimpleDateFormat("dd/MM/yyyy", Locale("es", "MX"))
    val timeFmt = SimpleDateFormat("HH:mm", Locale.US)
    val isCancelled = delivery.status == "CANCELADA"
    val effectivePaidMxn = if (!isCancelled) {
        (delivery.finalAmountMxn - delivery.pendingBalanceMxn).coerceIn(0.0, delivery.finalAmountMxn)
    } else {
        delivery.initialPaymentMxn
    }
    val totalCustomerDebtMxn = liveCustomerTotalDebtMxn
        ?: (delivery.previousDebtSnapshotMxn + delivery.pendingBalanceMxn)

    val weighedItems = CalculationEngine.parseWeighedItemsJson(delivery.itemsSnapshotJson)
    val hasEggs = delivery.boxes > 0.0 || weighedItems.isNotEmpty()
    val hasSugar = delivery.sugarSacks > 0.0
    val sugarWeightKg = if (hasSugar) {
        BigDecimal.valueOf(delivery.sugarSacks).multiply(BigDecimal.valueOf(delivery.sugarSackWeightKg))
    } else {
        BigDecimal.ZERO
    }
    val totalNetWeightKg = BigDecimal.valueOf(delivery.netWeightKg).add(sugarWeightKg)
    val methodSummary = if (effectivePaidMxn > 0.0) "efectivo" else "crédito"

    Column(
        modifier = modifier
            .fillMaxWidth()
            .widthIn(max = 264.dp)
            .testTag("thermal_ticket_preview"),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        SerratedEdge(isTop = true)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(ThermalPaper)
                .padding(horizontal = 10.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            TicketBrandHeader(settings = settings)

            if (isCancelled) {
                Spacer(Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.5.dp, ThermalAlertRed)
                        .padding(vertical = 2.dp)
                        .testTag("ticket_cancelled_banner"),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "CANCELADA",
                        fontFamily = SpaceMonoFontFamily,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp,
                        letterSpacing = 1.sp,
                        color = ThermalAlertRed,
                    )
                }
            } else if (isCopy) {
                Spacer(Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, GrayCopyStamp)
                        .padding(vertical = 2.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "COPIA",
                        fontFamily = SpaceMonoFontFamily,
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp,
                        letterSpacing = 1.sp,
                        color = GrayCopyStamp,
                    )
                }
            }

            Spacer(Modifier.height(8.dp))
            DashedTicketDivider()
            Spacer(Modifier.height(8.dp))

            // Folio + Fecha y Hora
            TicketPairRow(
                label = "Folio: ${delivery.folio}",
                value = dateFmt.format(Date(delivery.dateMillis)),
                fontSize = 11,
            )
            Text(
                text = timeFmt.format(Date(delivery.dateMillis)),
                fontFamily = SpaceMonoFontFamily,
                fontSize = 11.sp,
                color = ThermalInkDark,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth(),
            )

            // Cliente
            Spacer(Modifier.height(6.dp))
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Cliente:",
                    fontFamily = SpaceMonoFontFamily,
                    fontSize = 11.sp,
                    color = ThermalInkDark,
                )
                Text(
                    text = delivery.clientName,
                    fontFamily = SpaceMonoFontFamily,
                    fontSize = 11.sp,
                    color = ThermalInkDark,
                )
                if (client == null && delivery.clientName.isBlank()) {
                    Text(
                        text = "Mostrador",
                        fontFamily = SpaceMonoFontFamily,
                        fontSize = 11.sp,
                        color = ThermalInkDark,
                    )
                }
            }

            Spacer(Modifier.height(8.dp))
            DashedTicketDivider()
            Spacer(Modifier.height(8.dp))

            // Cajas / Productos (idéntico a Ticket48mm)
            if (weighedItems.isNotEmpty()) {
                weighedItems.forEachIndexed { idx, item ->
                    TicketPairRow(
                        label = "Caja ${idx + 1}",
                        value = "${CalculationEngine.formatExactWeight(item.netWeightKg)} kg",
                        fontSize = 11,
                    )
                }
            } else if (hasEggs) {
                TicketPairRow(
                    label = "Cajas (${CalculationEngine.formatExactBoxes(delivery.boxes)})",
                    value = "${CalculationEngine.formatExactWeight(delivery.netWeightKg)} kg",
                    fontSize = 11,
                )
            }
            if (hasSugar) {
                TicketPairRow(
                    label = "Azúcar (${CalculationEngine.formatExactBoxes(delivery.sugarSacks)} bto)",
                    value = "${CalculationEngine.formatExactWeight(sugarWeightKg)} kg",
                    fontSize = 11,
                )
            }

            Spacer(Modifier.height(8.dp))
            DashedTicketDivider()
            Spacer(Modifier.height(8.dp))

            // Totales
            TicketPairRow(
                label = "Kilos totales",
                value = "${CalculationEngine.formatExactWeight(totalNetWeightKg)} kg",
                boldLabel = true,
                boldValue = true,
                fontSize = 11,
            )
            if (hasEggs) {
                TicketPairRow(
                    label = "Precio por kilo",
                    value = CalculationEngine.formatTicketMoney(delivery.pricePerKg, forceDecimals = true),
                    fontSize = 11,
                )
            } else if (hasSugar) {
                TicketPairRow(
                    label = "Precio por bulto",
                    value = CalculationEngine.formatTicketMoney(delivery.sugarPricePerSackMxn, forceDecimals = true),
                    fontSize = 11,
                )
            }
            TicketPairRow(
                label = "TOTAL A COBRAR",
                value = CalculationEngine.formatTicketMoney(delivery.finalAmountMxn),
                boldLabel = true,
                boldValue = true,
                fontSize = 11,
            )

            Spacer(Modifier.height(8.dp))
            DashedTicketDivider()
            Spacer(Modifier.height(8.dp))

            // Pagos y Saldos
            TicketPairRow(
                label = "Pagado ($methodSummary)",
                value = CalculationEngine.formatTicketMoney(effectivePaidMxn),
                fontSize = 10,
            )
            TicketPairRow(
                label = "Saldo de esta entrega",
                value = CalculationEngine.formatTicketMoney(delivery.pendingBalanceMxn),
                boldLabel = true,
                boldValue = true,
                fontSize = 10,
            )
            TicketPairRow(
                label = "Saldo total del cliente",
                value = CalculationEngine.formatTicketMoney(totalCustomerDebtMxn),
                fontSize = 10,
            )

            // Leyenda fiscal simple
            Spacer(Modifier.height(10.dp))
            Text(
                text = "Comprobante de entrega,\nno es factura",
                fontFamily = SpaceMonoFontFamily,
                fontSize = 10.sp,
                lineHeight = 13.sp,
                color = ThermalInkDark,
                textAlign = TextAlign.Center,
            )

            // Firma de recibido
            Spacer(Modifier.height(10.dp))
            Text(
                text = "Firma de recibido:",
                fontFamily = SpaceMonoFontFamily,
                fontSize = 10.sp,
                color = ThermalInkDark,
                modifier = Modifier.fillMaxWidth(),
            )
            if (signatureBitmap != null) {
                Spacer(Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("ticket_credit_signature_box"),
                    contentAlignment = Alignment.Center,
                ) {
                    Image(
                        bitmap = signatureBitmap.asImageBitmap(),
                        contentDescription = "Firma digital del cliente",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            } else {
                Spacer(Modifier.height(30.dp))
            }

            HorizontalDivider(color = ThermalInkDark, thickness = 1.dp)
            Spacer(Modifier.height(8.dp))
            Text(
                text = "¡Gracias por su compra!",
                fontFamily = SpaceMonoFontFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp,
                color = ThermalInkDark,
                textAlign = TextAlign.Center,
            )
        }
        SerratedEdge(isTop = false)
    }
}

/**
 * Alias de compatibilidad hacia la plantilla unificada 48 mm.
 */
@Composable
fun ThermalTicket60mmView(
    delivery: DeliveryEntity,
    client: ClientEntity?,
    settings: BusinessSettingsEntity,
    signatureBitmap: Bitmap?,
    modifier: Modifier = Modifier,
    isCopy: Boolean = false,
    liveCustomerTotalDebtMxn: Double? = null,
) = ThermalTicket48mmView(
    delivery = delivery,
    client = client,
    settings = settings,
    signatureBitmap = signatureBitmap,
    modifier = modifier,
    isCopy = isCopy,
    liveCustomerTotalDebtMxn = liveCustomerTotalDebtMxn,
)

/**
 * Plantilla visual exacta de Ticket Térmico 48 mm para Abonos (`AbonoTicket48mm`).
 */
@Composable
fun ThermalAbonoTicket48mmView(
    abono: AbonoEntity,
    clientName: String,
    settings: BusinessSettingsEntity,
    modifier: Modifier = Modifier,
    isCopy: Boolean = false,
) {
    val dateFmt = SimpleDateFormat("dd/MM/yyyy", Locale("es", "MX"))
    val timeFmt = SimpleDateFormat("HH:mm", Locale.US)
    val displayFolio = abono.receiptFolio.trim().ifBlank {
        "AB-${abono.id.toString().padStart(4, '0')}"
    }
    val appliedToLabel = abono.deliveryFolio.trim().ifBlank { "Saldo de cuenta" }
    val methodLabel = if (abono.paymentMethod == "transferencia") "Transferencia" else "Efectivo"
    val statusLabel = if (abono.paymentMethod == "transferencia") "Por verificar" else "Verificado"

    Column(
        modifier = modifier
            .fillMaxWidth()
            .widthIn(max = 264.dp)
            .testTag("thermal_abono_ticket_preview"),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        SerratedEdge(isTop = true)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(ThermalPaper)
                .padding(horizontal = 10.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            TicketBrandHeader(settings = settings)

            if (isCopy) {
                Spacer(Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, GrayCopyStamp)
                        .padding(vertical = 2.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "COPIA",
                        fontFamily = SpaceMonoFontFamily,
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp,
                        letterSpacing = 1.sp,
                        color = GrayCopyStamp,
                    )
                }
            }

            Spacer(Modifier.height(8.dp))
            DashedTicketDivider()
            Spacer(Modifier.height(8.dp))

            Text(
                text = "COMPROBANTE DE ABONO",
                fontFamily = SpaceMonoFontFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp,
                color = ThermalInkDark,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(6.dp))

            TicketPairRow(
                label = "Folio: $displayFolio",
                value = dateFmt.format(Date(abono.dateMillis)),
                fontSize = 11,
            )
            Text(
                text = timeFmt.format(Date(abono.dateMillis)),
                fontFamily = SpaceMonoFontFamily,
                fontSize = 11.sp,
                color = ThermalInkDark,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(6.dp))
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Cliente:",
                    fontFamily = SpaceMonoFontFamily,
                    fontSize = 11.sp,
                    color = ThermalInkDark,
                )
                Text(
                    text = clientName,
                    fontFamily = SpaceMonoFontFamily,
                    fontSize = 11.sp,
                    color = ThermalInkDark,
                )
            }
            Spacer(Modifier.height(4.dp))
            TicketPairRow(
                label = "Aplica a:",
                value = appliedToLabel,
                fontSize = 10,
            )

            Spacer(Modifier.height(8.dp))
            DashedTicketDivider()
            Spacer(Modifier.height(8.dp))

            TicketPairRow(
                label = "Saldo anterior",
                value = CalculationEngine.formatTicketMoney(abono.previousDebtSnapshotMxn),
                fontSize = 11,
            )
            TicketPairRow(
                label = "ABONO RECIBIDO",
                value = CalculationEngine.formatTicketMoney(abono.amountMxn),
                boldLabel = true,
                boldValue = true,
                fontSize = 11,
            )
            TicketPairRow(
                label = "Forma de pago",
                value = methodLabel,
                fontSize = 11,
            )
            TicketPairRow(
                label = "Estado",
                value = statusLabel,
                fontSize = 11,
            )
            if (abono.note.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Nota: ${abono.note.trim()}",
                    fontFamily = SpaceMonoFontFamily,
                    fontSize = 10.sp,
                    lineHeight = 12.sp,
                    color = ThermalInkDark,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Spacer(Modifier.height(8.dp))
            DashedTicketDivider()
            Spacer(Modifier.height(8.dp))

            TicketPairRow(
                label = "SALDO RESTANTE",
                value = CalculationEngine.formatTicketMoney(abono.remainingDebtSnapshotMxn),
                boldLabel = true,
                boldValue = true,
                fontSize = 11,
            )

            Spacer(Modifier.height(10.dp))
            Text(
                text = "Comprobante de abono,\nno es factura",
                fontFamily = SpaceMonoFontFamily,
                fontSize = 10.sp,
                lineHeight = 13.sp,
                color = ThermalInkDark,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(10.dp))
            Text(
                text = "Firma de recibido:",
                fontFamily = SpaceMonoFontFamily,
                fontSize = 10.sp,
                color = ThermalInkDark,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(30.dp))

            HorizontalDivider(color = ThermalInkDark, thickness = 1.dp)
            Spacer(Modifier.height(8.dp))
            Text(
                text = "¡Gracias por su abono!",
                fontFamily = SpaceMonoFontFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp,
                color = ThermalInkDark,
                textAlign = TextAlign.Center,
            )
        }
        SerratedEdge(isTop = false)
    }
}

@Composable
private fun TicketBrandHeader(settings: BusinessSettingsEntity) {
    val isDirecto = BuildConfig.FLAVOR == "directodegranja" ||
        settings.businessName.contains("directo", ignoreCase = true)

    if (isDirecto) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Image(
                painter = painterResource(R.drawable.img_ticket_logo),
                contentDescription = "Directo de Granja",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .width(106.dp)
                    .heightIn(max = 88.dp),
            )
            Spacer(Modifier.width(4.dp))
            Column(
                modifier = Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = "DIRECTO",
                    fontFamily = FontFamily.SansSerif,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 17.sp,
                    color = ThermalInkDark,
                    lineHeight = 18.sp,
                )
                Text(
                    text = "DE",
                    fontFamily = FontFamily.SansSerif,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 10.sp,
                    color = ThermalInkDark,
                    lineHeight = 12.sp,
                )
                Text(
                    text = "GRANJA",
                    fontFamily = FontFamily.SansSerif,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 17.sp,
                    color = ThermalInkDark,
                    lineHeight = 18.sp,
                )
            }
        }
    } else {
        Image(
            painter = painterResource(R.drawable.img_ticket_logo),
            contentDescription = settings.businessName,
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 78.dp),
        )
    }

    if (settings.slogan.isNotBlank()) {
        Spacer(Modifier.height(6.dp))
        val parts = settings.slogan.split(" a ", limit = 2)
        Text(
            text = parts[0],
            fontFamily = SpaceMonoFontFamily,
            fontWeight = FontWeight.Bold,
            fontSize = 10.5.sp,
            color = ThermalInkDark,
            textAlign = TextAlign.Center,
            lineHeight = 13.sp,
        )
        if (parts.size > 1) {
            Text(
                text = "a ${parts[1]}",
                fontFamily = SpaceMonoFontFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 10.5.sp,
                color = ThermalInkDark,
                textAlign = TextAlign.Center,
                lineHeight = 13.sp,
            )
        }
    }

    if (settings.phone.isNotBlank() || settings.address.isNotBlank()) {
        Spacer(Modifier.height(6.dp))
        if (settings.phone.isNotBlank()) {
            Text(
                text = "Tel. ${settings.phone}",
                fontFamily = SpaceMonoFontFamily,
                fontSize = 10.sp,
                color = ThermalInkDark,
                textAlign = TextAlign.Center,
            )
        }
        if (settings.address.isNotBlank()) {
            Text(
                text = settings.address,
                fontFamily = SpaceMonoFontFamily,
                fontSize = 10.sp,
                color = ThermalInkDark,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun TicketPairRow(
    label: String,
    value: String,
    boldLabel: Boolean = false,
    boldValue: Boolean = false,
    fontSize: Int = 10,
    valueColor: Color = ThermalInkDark,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 1.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            fontFamily = SpaceMonoFontFamily,
            fontWeight = if (boldLabel) FontWeight.Bold else FontWeight.Normal,
            fontSize = fontSize.sp,
            color = ThermalInkDark,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = value,
            fontFamily = SpaceMonoFontFamily,
            fontWeight = if (boldValue) FontWeight.Bold else FontWeight.Normal,
            fontSize = fontSize.sp,
            color = valueColor,
            textAlign = TextAlign.End,
        )
    }
}

@Composable
private fun DashedTicketDivider() {
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(2.dp),
    ) {
        var x = 0f
        val dash = 8f
        val gap = 6f
        while (x < size.width) {
            drawLine(
                color = ThermalInkDark,
                start = androidx.compose.ui.geometry.Offset(x, 1f),
                end = androidx.compose.ui.geometry.Offset((x + dash).coerceAtMost(size.width), 1f),
                strokeWidth = 1.5f,
            )
            x += dash + gap
        }
    }
}

@Composable
private fun SerratedEdge(isTop: Boolean) {
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(8.dp),
    ) {
        val toothW = 14f
        val count = (size.width / toothW).toInt().coerceAtLeast(8)
        val step = size.width / count
        val path = Path()
        if (isTop) {
            path.moveTo(0f, size.height)
            for (i in 0 until count) {
                path.lineTo(i * step + step / 2f, 0f)
                path.lineTo((i + 1) * step, size.height)
            }
            path.close()
        } else {
            path.moveTo(0f, 0f)
            for (i in 0 until count) {
                path.lineTo(i * step + step / 2f, size.height)
                path.lineTo((i + 1) * step, 0f)
            }
            path.close()
        }
        drawPath(path = path, color = ThermalPaper)
    }
}
