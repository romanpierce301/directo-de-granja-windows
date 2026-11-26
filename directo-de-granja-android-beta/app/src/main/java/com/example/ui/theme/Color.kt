package com.example.ui.theme

import android.graphics.Color as AndroidColor
import androidx.compose.ui.graphics.Color

import com.example.BuildConfig

// Directo de Granja uses the shared purple design system; other flavors retain Aurora.
private val IsDirecto = BuildConfig.BRAND_APP_NAME == "Directo de Granja"
val BackgroundDark = if (IsDirecto) Color(0xFF090312) else Color(0xFF0A141E)
val SurfaceDark = if (IsDirecto) Color(0xFF130824) else Color(0xFF0A141E)
val SurfaceDim = if (IsDirecto) Color(0xFF090312) else Color(0xFF070E16)
val SurfaceContainerLowest = if (IsDirecto) Color(0xFF090312) else Color(0xFF050F19)
val SurfaceContainerLow = if (IsDirecto) Color(0xFF130824) else Color(0xFF121C26)
val SurfaceContainer = if (IsDirecto) Color(0xFF1F0E3B) else Color(0xFF17202B)
val SurfaceContainerHigh = if (IsDirecto) Color(0xFF341961) else Color(0xFF212B35)
val SurfaceContainerHighest = if (IsDirecto) Color(0xFF341961) else Color(0xFF2C3640)
val SurfaceBright = if (IsDirecto) Color(0xFF4C2889) else Color(0xFF303A45)

val OnSurface = if (IsDirecto) Color(0xFFF4EFFF) else Color(0xFFD9E3F2)
val OnSurfaceVariant = if (IsDirecto) Color(0xFF9E8FB2) else Color(0xFFBFC9C1)
val Outline = if (IsDirecto) Color(0xFF4C2889) else Color(0xFF89938B)
val OutlineVariant = if (IsDirecto) Color(0xFF341961) else Color(0xFF404943)

val Primary = Color(AndroidColor.parseColor(BuildConfig.BRAND_PRIMARY))
val OnPrimary = if (IsDirecto) Color(0xFFF4EFFF) else Color(0xFF003823)
val PrimaryContainer = Color(AndroidColor.parseColor(BuildConfig.BRAND_PRIMARY_CONTAINER))
val OnPrimaryContainer = if (IsDirecto) Color(0xFFF4EFFF) else Color(0xFF00492F)
val PrimaryFixed = if (IsDirecto) Color(0xFFC084FC) else Color(0xFFACF2CA)
val PrimaryGlow = Color(AndroidColor.parseColor(BuildConfig.BRAND_PRIMARY_GLOW))
val Primary3DLip = if (IsDirecto) Color(0xFF4C2889) else Color(0xFF1B5E3C)

val Secondary = if (IsDirecto) Color(0xFFC084FC) else Color(0xFFECC068)
val OnSecondary = if (IsDirecto) Color(0xFF090312) else Color(0xFF402D00)
val SecondaryContainer = if (IsDirecto) Color(0xFF341961) else Color(0xFF745400)
val OnSecondaryContainer = if (IsDirecto) Color(0xFFF4EFFF) else Color(0xFFF7CB71)
val SecondaryFixed = if (IsDirecto) Color(0xFFC084FC) else Color(0xFFFFDEA2)
val SecondaryGlow = if (IsDirecto) Color(0xFFC084FC) else Color(0xFFF2C66D)

val Tertiary = if (IsDirecto) Color(0xFF10B981) else Color(0xFF9AD3B3)
val OnTertiary = if (IsDirecto) Color(0xFF090312) else Color(0xFF003823)
val TertiaryContainer = if (IsDirecto) Color(0xFF064E3B) else Color(0xFF7FB798)
val OnTertiaryContainer = if (IsDirecto) Color(0xFFD1FAE5) else Color(0xFF0D4931)

val Error = if (IsDirecto) Color(0xFFF43F5E) else Color(0xFFFFB4AB)
val OnError = if (IsDirecto) Color(0xFFF4EFFF) else Color(0xFF690005)
val ErrorContainer = if (IsDirecto) Color(0xFF881337) else Color(0xFF93000A)
val OnErrorContainer = if (IsDirecto) Color(0xFFFECDD3) else Color(0xFFFFDAD6)

val SubtleGlassBorder = Color(0x18FFFFFF)
val AuroraTeal = Color(0xFF2DD4BF)

// Thermal 48mm Ticket Paper Tokens
val ThermalPaper = Color(0xFFFAFAF9)
val ThermalInk = Color(0xFF1C1917)
val ThermalInkDark = Color(0xFF0C0A09)
val ThermalInkMuted = Color(0xFF57534E)
val ThermalBoxBg = Color(0xFFE7E5E4)
val ThermalSubBoxBg = Color(0xFFF5F5F4)
val ThermalDivider = Color(0xFFD6D3D1)
val ThermalAlertRed = Color(0xFFB91C1C)
