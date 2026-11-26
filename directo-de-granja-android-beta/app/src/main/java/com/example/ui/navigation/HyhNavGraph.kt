package com.example.ui.navigation

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircleOutline
import androidx.compose.material.icons.filled.AddShoppingCart
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.FolderZip
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PointOfSale
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.R
import com.example.BuildConfig
import com.example.domain.CalculationEngine
import com.example.data.local.entity.SalesChannel
import com.example.ui.components.AuroraBackground
import com.example.ui.components.AuroraConfirmationDialog
import com.example.ui.components.AuroraStatusBadge
import com.example.ui.components.OverlayHost
import com.example.ui.screens.BienvenidaScreen
import com.example.ui.screens.CierresDiariosScreen
import com.example.ui.screens.ClientesScreen
import com.example.ui.screens.ConfiguracionScreen
import com.example.ui.screens.CreditoConfigScreen
import com.example.ui.screens.DetalleCierreScreen
import com.example.ui.screens.EntregasRealizadasScreen
import com.example.ui.screens.FirmaDigitalScreen
import com.example.ui.screens.InventarioScreen
import com.example.ui.screens.NuevaEntregaScreen
import com.example.ui.screens.PagoScreen
import com.example.ui.screens.PanelPrincipalScreen
import com.example.ui.screens.PerfilClienteScreen
import com.example.ui.screens.RecordatoriosScreen
import com.example.ui.screens.RespaldosLocalesScreen
import com.example.ui.screens.TicketScreen
import com.example.ui.screens.ComprasHuevoScreen
import com.example.ui.screens.RouteCrewAssignmentScreen
import com.example.ui.screens.RouteIncidentScreen
import com.example.ui.screens.DirectoLoginScreen
import com.example.ui.screens.DirectoSyncScreen
import com.example.ui.theme.OnSurface
import com.example.ui.theme.OnSurfaceVariant
import com.example.ui.theme.Primary
import com.example.ui.theme.PrimaryGlow
import com.example.ui.theme.Secondary
import com.example.ui.theme.SurfaceContainer
import com.example.ui.theme.SurfaceContainerLow
import com.example.ui.theme.SurfaceContainerLowest
import com.example.ui.viewmodel.HyhViewModel
import kotlinx.coroutines.launch
import java.math.BigDecimal

object HyhRoutes {
    const val DIRECTO_LOGIN = "directo_login"
    const val BIENVENIDA = "bienvenida"
    const val PANEL_PRINCIPAL = "panel_principal"
    const val CLIENTES = "clientes"
    const val PERFIL_CLIENTE = "perfil_cliente/{clientId}"
    const val NUEVA_ENTREGA = "nueva_entrega"
    const val PAGO = "pago"
    const val FIRMA_DIGITAL = "firma_digital"
    const val TICKET = "ticket/{deliveryId}"
    const val ENTREGAS_REALIZADAS = "entregas_realizadas"
    const val COMPRAS_HUEVO = "compras_huevo"
    const val INVENTARIO = "inventario"
    const val RECORDATORIOS = "recordatorios"
    const val CIERRES_DIARIOS = "cierres_diarios"
    const val DETALLE_CIERRE = "detalle_cierre/{closingId}"
    const val RESPALDOS_LOCALES = "respaldos_locales"
    const val CREDITO_CONFIG = "credito_config"
    const val CONFIGURACION = "configuracion"
    const val PERSONAL_RUTA = "personal_ruta"
    const val MERMAS_INCIDENTES = "mermas_incidentes"
    const val SYNC_WINDOWS = "sync_windows"
    const val CREMERIA = "cremeria"
    const val CREMERIA_NUEVA_ENTREGA = "cremeria_nueva_entrega"
    const val CREMERIA_PAGO = "cremeria_pago"
    const val CREMERIA_FIRMA_DIGITAL = "cremeria_firma_digital"
    const val CREMERIA_TICKET = "cremeria_ticket/{deliveryId}"
    const val CREMERIA_PERFIL_CLIENTE = "cremeria_perfil_cliente/{clientId}"

    fun perfilCliente(clientId: Long) = "perfil_cliente/$clientId"
    fun ticket(deliveryId: Long) = "ticket/$deliveryId"
    fun detalleCierre(closingId: Long) = "detalle_cierre/$closingId"
    fun cremeriaTicket(deliveryId: Long) = "cremeria_ticket/$deliveryId"
    fun cremeriaPerfilCliente(clientId: Long) = "cremeria_perfil_cliente/$clientId"
}

private data class DrawerModuleItem(
    val route: String,
    val title: String,
    val icon: ImageVector,
    val tag: String,
)

private val drawerModules = buildList {
    addAll(listOf(
        DrawerModuleItem(HyhRoutes.PANEL_PRINCIPAL, "Panel Principal", Icons.Default.Dashboard, "drawer_panel"),
        DrawerModuleItem(HyhRoutes.CLIENTES, "Clientes", Icons.Default.People, "drawer_clientes"),
        DrawerModuleItem(HyhRoutes.NUEVA_ENTREGA, "Nueva Entrega", Icons.Default.AddCircleOutline, "drawer_nueva_entrega"),
        DrawerModuleItem(HyhRoutes.ENTREGAS_REALIZADAS, "Entregas Realizadas", Icons.Default.ReceiptLong, "drawer_entregas"),
    ))
    if (BuildConfig.FLAVOR == "lili") {
        add(DrawerModuleItem(HyhRoutes.CREMERIA, "Cremería del Patrón", Icons.Default.Store, "drawer_cremeria"))
    }
    if (BuildConfig.FLAVOR == "directodegranja") {
        addAll(listOf(
            DrawerModuleItem(HyhRoutes.SYNC_WINDOWS, "Sincronizar con Windows", Icons.Default.ReceiptLong, "drawer_sync_windows"),
            DrawerModuleItem(HyhRoutes.PERSONAL_RUTA, "Personal de ruta", Icons.Default.People, "drawer_personal_ruta"),
            DrawerModuleItem(HyhRoutes.MERMAS_INCIDENTES, "Mermas e incidentes", Icons.Default.NotificationsActive, "drawer_mermas_incidentes"),
        ))
    } else {
        addAll(listOf(
            DrawerModuleItem(HyhRoutes.COMPRAS_HUEVO, "Compras de Huevo", Icons.Default.AddShoppingCart, "drawer_compras"),
            DrawerModuleItem(HyhRoutes.INVENTARIO, "Inventario", Icons.Default.Inventory2, "drawer_inventario"),
        ))
    }
    addAll(listOf(
        DrawerModuleItem(HyhRoutes.RECORDATORIOS, "Recordatorios", Icons.Default.NotificationsActive, "drawer_recordatorios"),
        DrawerModuleItem(HyhRoutes.CIERRES_DIARIOS, "Cierres Diarios", Icons.Default.PointOfSale, "drawer_cierres"),
        DrawerModuleItem(HyhRoutes.RESPALDOS_LOCALES, "Respaldos Locales", Icons.Default.FolderZip, "drawer_respaldos"),
    ))
    if (BuildConfig.FLAVOR != "directodegranja") {
        addAll(listOf(
            DrawerModuleItem(HyhRoutes.CREDITO_CONFIG, "Crédito y Leyenda", Icons.Default.Schedule, "drawer_credito_config"),
            DrawerModuleItem(HyhRoutes.CONFIGURACION, "Configuración", Icons.Default.Settings, "drawer_configuracion"),
        ))
    }
}

private val topLevelDrawerRoutes = drawerModules.map { it.route }.toSet()

@Composable
fun HyhAppRoot(viewModel: HyhViewModel) {
    val navController = rememberNavController()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val clients by viewModel.clientsWithDebt.collectAsStateWithLifecycle()
    val purchases by viewModel.purchases.collectAsStateWithLifecycle()
    val sugarPurchases by viewModel.sugarPurchases.collectAsStateWithLifecycle()
    val inventoryBrands by viewModel.inventoryBrands.collectAsStateWithLifecycle()
    val sugarInventory by viewModel.sugarInventory.collectAsStateWithLifecycle()
    val deliveries by viewModel.deliveries.collectAsStateWithLifecycle()
    val cremeriaDeliveries by viewModel.cremeriaDeliveries.collectAsStateWithLifecycle()
    val cremeriaClients by viewModel.cremeriaClientsWithDebt.collectAsStateWithLifecycle()
    val cremeriaAbonos by viewModel.activeCremeriaAbonos.collectAsStateWithLifecycle()
    val activeAbonos by viewModel.activeAbonos.collectAsStateWithLifecycle()
    val reminders by viewModel.reminders.collectAsStateWithLifecycle()
    val dueTodayReminders by viewModel.dueTodayBannerReminders.collectAsStateWithLifecycle()
    val closings by viewModel.dailyClosings.collectAsStateWithLifecycle()
    val backups by viewModel.backups.collectAsStateWithLifecycle()
    val routeCrew by viewModel.routeCrew.collectAsStateWithLifecycle()
    val routeIncidents by viewModel.routeIncidents.collectAsStateWithLifecycle()
    val overlayState by viewModel.overlayState.collectAsStateWithLifecycle()
    val draft by viewModel.deliveryDraft.collectAsStateWithLifecycle()
    val cremeriaDraft by viewModel.cremeriaDraft.collectAsStateWithLifecycle()
    val feedbackMessage by viewModel.feedbackMessage.collectAsStateWithLifecycle()
    val pendingSafSave by viewModel.pendingSafSave.collectAsStateWithLifecycle()
    val printers by viewModel.pairedPrinters.collectAsStateWithLifecycle()
    val isScanningPrinters by viewModel.isScanningPrinters.collectAsStateWithLifecycle()
    val directoAuthenticated by viewModel.directoAuthenticated.collectAsStateWithLifecycle()
    val directoWsConnected by viewModel.directoWsConnected.collectAsStateWithLifecycle()
    val directoSyncStatus by viewModel.directoSyncStatus.collectAsStateWithLifecycle()
    val directoLastSyncIso by viewModel.directoLastSyncIso.collectAsStateWithLifecycle()
    val directoPendingSyncCount by viewModel.directoPendingSyncCount.collectAsStateWithLifecycle()

    val safCreateLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("*/*"),
    ) { uri ->
        viewModel.completePendingSafSave(uri)
    }

    LaunchedEffect(pendingSafSave) {
        val pending = pendingSafSave ?: return@LaunchedEffect
        safCreateLauncher.launch(pending.suggestedFileName)
    }

    LaunchedEffect(feedbackMessage) {
        val msg = feedbackMessage ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        viewModel.clearFeedback()
    }

    val navBackStack by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStack?.destination?.route
    val isDrawerEnabled = currentRoute in topLevelDrawerRoutes

    var pendingDrawerDestination by remember { mutableStateOf<String?>(null) }
    var showAppExitDialog by remember { mutableStateOf(false) }
    var lastBackPressMs by remember { mutableLongStateOf(0L) }

    fun navigateToTopModule(route: String) {
        if (currentRoute == route) {
            scope.launch { drawerState.close() }
            return
        }
        if ((currentRoute == HyhRoutes.NUEVA_ENTREGA && draft.hasCapturedData) ||
            (currentRoute == HyhRoutes.CREMERIA_NUEVA_ENTREGA && cremeriaDraft.hasCapturedData)) {
            scope.launch { drawerState.close() }
            pendingDrawerDestination = route
            return
        }
        scope.launch { drawerState.close() }
        if (route == HyhRoutes.NUEVA_ENTREGA) {
            viewModel.startDeliveryForClient(null)
        }
        if (route == HyhRoutes.CREMERIA) viewModel.startDeliveryForClient(null, true)
        navController.navigate(route) {
            popUpTo(HyhRoutes.PANEL_PRINCIPAL) { saveState = false }
            launchSingleTop = true
        }
    }

    AuroraBackground {
        ModalNavigationDrawer(
            drawerState = drawerState,
            gesturesEnabled = isDrawerEnabled,
            drawerContent = {
                ModalDrawerSheet(
                    drawerContainerColor = SurfaceContainerLowest,
                    drawerContentColor = OnSurface,
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .verticalScroll(rememberScrollState())
                            .padding(vertical = 14.dp),
                    ) {
                        // Identidad en menú hamburguesa
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Image(
                                painter = painterResource(R.drawable.img_welcome_hero),
                                contentDescription = "Logotipo ${BuildConfig.BRAND_APP_NAME}",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(50.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .border(1.dp, Secondary.copy(alpha = 0.5f), RoundedCornerShape(12.dp)),
                            )
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = settings.businessName,
                                    style = MaterialTheme.typography.titleLarge,
                                    color = OnSurface,
                                )
                                Text(
                                    text = settings.slogan,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Secondary,
                                )
                            }
                        }

                        Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                            val badgeText = when {
                                BuildConfig.FLAVOR != "directodegranja" -> "MODO LOCAL OFFLINE"
                                directoWsConnected -> "EN VIVO CON WINDOWS"
                                directoPendingSyncCount > 0 -> "COLA LOCAL ($directoPendingSyncCount)"
                                else -> "RUTA · RECONECTANDO"
                            }
                            AuroraStatusBadge(text = badgeText, tint = PrimaryGlow)
                        }

                        HorizontalDivider(
                            color = Primary.copy(alpha = 0.16f),
                            modifier = Modifier.padding(vertical = 10.dp),
                        )

                        drawerModules.forEach { module ->
                            val selected = currentRoute == module.route
                            NavigationDrawerItem(
                                label = {
                                    Text(
                                        text = module.title,
                                        style = MaterialTheme.typography.titleSmall,
                                    )
                                },
                                icon = {
                                    Icon(
                                        imageVector = module.icon,
                                        contentDescription = null,
                                    )
                                },
                                selected = selected,
                                onClick = { navigateToTopModule(module.route) },
                                colors = NavigationDrawerItemDefaults.colors(
                                    selectedContainerColor = Primary.copy(alpha = 0.20f),
                                    selectedIconColor = Primary,
                                    selectedTextColor = Primary,
                                    unselectedContainerColor = Color.Transparent,
                                    unselectedIconColor = OnSurfaceVariant,
                                    unselectedTextColor = OnSurface,
                                ),
                                modifier = Modifier
                                    .padding(horizontal = 12.dp, vertical = 2.dp)
                                    .testTag(module.tag),
                            )
                        }
                    }
                }
            },
        ) {
            Scaffold(
                containerColor = Color.Transparent,
                contentWindowInsets = WindowInsets.safeDrawing,
                snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
            ) { innerPadding ->
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                ) {
                    NavHost(
                        navController = navController,
                        startDestination = if (BuildConfig.FLAVOR == "directodegranja" && !directoAuthenticated) HyhRoutes.DIRECTO_LOGIN else HyhRoutes.BIENVENIDA,
                    ) {
                        composable(HyhRoutes.DIRECTO_LOGIN) {
                            DirectoLoginScreen(
                                initialServerUrl = viewModel.directoServerUrl,
                                onLogin = viewModel::loginDirecto,
                                onAuthenticated = {
                                    navController.navigate(HyhRoutes.BIENVENIDA) {
                                        popUpTo(HyhRoutes.DIRECTO_LOGIN) { inclusive = true }
                                        launchSingleTop = true
                                    }
                                },
                            )
                        }
                        composable(HyhRoutes.BIENVENIDA) {
                            BienvenidaScreen(
                                settings = settings,
                                onEnterDashboard = {
                                    navController.navigate(HyhRoutes.PANEL_PRINCIPAL) {
                                        popUpTo(HyhRoutes.BIENVENIDA) { inclusive = true }
                                        launchSingleTop = true
                                    }
                                },
                            )
                        }

                        composable(HyhRoutes.PANEL_PRINCIPAL) {
                            // Protección doble-atrás para salida general (Sección 12.2)
                            BackHandler {
                                val now = System.currentTimeMillis()
                                if (now - lastBackPressMs <= 2200L) {
                                    showAppExitDialog = true
                                } else {
                                    lastBackPressMs = now
                                    viewModel.showFeedback("Pulsa Atrás otra vez para salir de la aplicación")
                                }
                            }
                            PanelPrincipalScreen(
                                settings = settings,
                                deliveries = deliveries,
                                activeAbonos = activeAbonos,
                                inventoryBrands = inventoryBrands,
                                dueTodayReminders = dueTodayReminders,
                                onOpenDrawer = { scope.launch { drawerState.open() } },
                                showInventory = true,
                            )
                        }

                        composable(HyhRoutes.PERSONAL_RUTA) {
                            BackHandler { navigateToTopModule(HyhRoutes.PANEL_PRINCIPAL) }
                            RouteCrewAssignmentScreen(
                                assignment = routeCrew,
                                onOpenDrawer = { scope.launch { drawerState.open() } },
                                onSave = viewModel::saveRouteCrew,
                            )
                        }

                        composable(HyhRoutes.MERMAS_INCIDENTES) {
                            BackHandler { navigateToTopModule(HyhRoutes.PANEL_PRINCIPAL) }
                            RouteIncidentScreen(
                                incidents = routeIncidents,
                                onOpenDrawer = { scope.launch { drawerState.open() } },
                                onSave = viewModel::registerRouteIncident,
                            )
                        }

                        composable(HyhRoutes.SYNC_WINDOWS) {
                            BackHandler { navigateToTopModule(HyhRoutes.PANEL_PRINCIPAL) }
                            DirectoSyncScreen(
                                userName = viewModel.directoUserName,
                                customerCount = clients.size,
                                foliosRemaining = viewModel.directoFoliosRemaining,
                                wsConnected = directoWsConnected,
                                syncStatus = directoSyncStatus,
                                pendingSyncCount = directoPendingSyncCount,
                                lastSyncIso = directoLastSyncIso,
                                onOpenDrawer = { scope.launch { drawerState.open() } },
                                onSync = { viewModel.syncDirectoData(silent = false) },
                            )
                        }

                        composable(HyhRoutes.CLIENTES) {
                            BackHandler { navigateToTopModule(HyhRoutes.PANEL_PRINCIPAL) }
                            ClientesScreen(
                                clients = clients,
                                settings = settings,
                                onOpenDrawer = { scope.launch { drawerState.open() } },
                                onOpenClientProfile = { clientId ->
                                    navController.navigate(HyhRoutes.perfilCliente(clientId))
                                },
                                onSaveClient = { id, name, phone, address, specialPrice, onSaved ->
                                    viewModel.saveClient(id, name, phone, address, specialPrice, onSaved)
                                },
                                onDeleteClient = { client -> viewModel.deleteClient(client) },
                                allowOwnerEdits = BuildConfig.FLAVOR != "directodegranja",
                            )
                        }

                        composable(
                            route = HyhRoutes.PERFIL_CLIENTE,
                            arguments = listOf(navArgument("clientId") { type = NavType.LongType }),
                        ) { entry ->
                            val clientId = entry.arguments?.getLong("clientId") ?: 0L
                            val client = clients.firstOrNull { it.client.id == clientId }?.client
                            val clientDeliveries = remember(deliveries, clientId) {
                                deliveries.filter { it.clientId == clientId }
                            }
                            val clientAbonos = remember(activeAbonos, clientId) {
                                activeAbonos.filter { it.clientId == clientId }
                            }
                            PerfilClienteScreen(
                                client = client,
                                deliveries = clientDeliveries,
                                abonos = clientAbonos,
                                settings = settings,
                                onBack = { navController.popBackStack() },
                                onStartNewDeliveryForClient = { cid ->
                                    viewModel.startDeliveryForClient(cid)
                                    navController.navigate(HyhRoutes.NUEVA_ENTREGA)
                                },
                                onRecordAbono = { cid, did, amount, note, onDone ->
                                    viewModel.recordAbono(cid, did, amount, note, onDone)
                                },
                                onOpenTicket = { deliveryId ->
                                    viewModel.openTicketWithLoading {
                                        navController.navigate(HyhRoutes.ticket(deliveryId))
                                    }
                                },
                            )
                        }

                        composable(HyhRoutes.NUEVA_ENTREGA) {
                            NuevaEntregaScreen(
                                draft = draft,
                                clients = clients,
                                inventoryBrands = inventoryBrands,
                                settings = settings,
                                onSelectClient = { viewModel.selectDraftClient(it) },
                                onUpdateBrand = { viewModel.updateDraftBrand(it) },
                                onUpdateModality = { viewModel.updateDraftModality(it) },
                                onUpdateWeight = { viewModel.updateDraftWeight(it) },
                                onUpdatePricePerKg = { viewModel.updateDraftPricePerKg(it) },
                                onUpdateSugarSacks = { viewModel.updateDraftSugarSacks(it) },
                                onUpdateSugarWeightPerSack = { viewModel.updateDraftSugarWeightPerSack(it) },
                                onUpdateSugarPricePerSack = { viewModel.updateDraftSugarPricePerSack(it) },
                                onAddBoxItem = { viewModel.addWeighedBoxItem() },
                                onRemoveBoxItem = { viewModel.removeWeighedBoxItem(it) },
                                onContinueToPayment = {
                                    navController.navigate(HyhRoutes.PAGO)
                                },
                                onExitDelivery = {
                                    viewModel.clearDeliveryDraft()
                                    if (!navController.popBackStack()) {
                                        navController.navigate(HyhRoutes.PANEL_PRINCIPAL) {
                                            launchSingleTop = true
                                        }
                                    }
                                },
                            )
                        }

                        composable(HyhRoutes.PAGO) {
                            val selectedClientWithDebt = clients.firstOrNull { it.client.id == draft.clientId }
                            PagoScreen(
                                draft = draft,
                                clientWithDebt = selectedClientWithDebt,
                                settings = settings,
                                onBack = { navController.popBackStack() },
                                onSelectPaymentMethod = { viewModel.updateDraftPaymentMethod(it) },
                                onUpdateInitialAbono = { viewModel.updateDraftInitialAbono(it) },
                                onConfirmContado = {
                                    viewModel.finalizeDelivery(signatureBitmap = null) { deliveryId ->
                                        navController.navigate(HyhRoutes.ticket(deliveryId)) {
                                            popUpTo(HyhRoutes.NUEVA_ENTREGA) { inclusive = true }
                                        }
                                    }
                                },
                                onProceedToCreditSignature = {
                                    navController.navigate(HyhRoutes.FIRMA_DIGITAL)
                                },
                            )
                        }

                        composable(HyhRoutes.FIRMA_DIGITAL) {
                            val clientWithDebt = clients.firstOrNull { it.client.id == draft.clientId }
                            val calc = viewModel.computeDraftCalculation(draft, settings, clients)
                            val abono = CalculationEngine.parsePositiveDecimal(draft.initialAbonoInput)
                                .coerceIn(BigDecimal.ZERO, calc.finalAmountMxn)
                            val pending = calc.finalAmountMxn.subtract(abono)
                            FirmaDigitalScreen(
                                clientName = clientWithDebt?.client?.name ?: "Cliente",
                                pendingAmountMxn = pending,
                                onBack = { navController.popBackStack() },
                                onConfirmSignature = { bmp ->
                                    viewModel.finalizeDelivery(signatureBitmap = bmp) { deliveryId ->
                                        navController.navigate(HyhRoutes.ticket(deliveryId)) {
                                            popUpTo(HyhRoutes.NUEVA_ENTREGA) { inclusive = true }
                                        }
                                    }
                                },
                            )
                        }

                        composable(
                            route = HyhRoutes.TICKET,
                            arguments = listOf(navArgument("deliveryId") { type = NavType.LongType }),
                        ) { entry ->
                            val deliveryId = entry.arguments?.getLong("deliveryId") ?: 0L
                            val delivery = deliveries.firstOrNull { it.id == deliveryId }
                            val client = delivery?.let { del ->
                                clients.firstOrNull { it.client.id == del.clientId }?.client
                            }
                            TicketScreen(
                                delivery = delivery,
                                client = client,
                                settings = settings,
                                onBack = { navController.popBackStack() },
                                onPrint = viewModel::printDeliveryTicket,
                                onShareWhatsApp = viewModel::shareDeliveryPdfWhatsApp,
                                onDownloadPdf = viewModel::downloadDeliveryPdf,
                                onDownloadJson = viewModel::downloadDeliveryJson,
                                onCancelDelivery = { id, reason -> viewModel.cancelDelivery(id, reason) },
                                allowCancel = BuildConfig.FLAVOR != "directodegranja",
                            )
                        }

                        composable(HyhRoutes.ENTREGAS_REALIZADAS) {
                            BackHandler { navigateToTopModule(HyhRoutes.PANEL_PRINCIPAL) }
                            EntregasRealizadasScreen(
                                deliveries = deliveries,
                                onEnterScreenLoading = viewModel::runDeliveriesHistoryLoading,
                                onOpenDrawer = { scope.launch { drawerState.open() } },
                                onOpenTicket = { deliveryId ->
                                    viewModel.openTicketWithLoading {
                                        navController.navigate(HyhRoutes.ticket(deliveryId))
                                    }
                                },
                                onCancelDelivery = { id, reason -> viewModel.cancelDelivery(id, reason) },
                                allowCancel = BuildConfig.FLAVOR != "directodegranja",
                            )
                        }

                        composable(HyhRoutes.CREMERIA) {
                            BackHandler { navigateToTopModule(HyhRoutes.PANEL_PRINCIPAL) }
                            EntregasRealizadasScreen(
                                deliveries = cremeriaDeliveries,
                                onEnterScreenLoading = viewModel::runDeliveriesHistoryLoading,
                                onOpenDrawer = { scope.launch { drawerState.open() } },
                                onOpenTicket = { id -> viewModel.openTicketWithLoading { navController.navigate(HyhRoutes.cremeriaTicket(id)) } },
                                onCancelDelivery = { id, reason -> viewModel.cancelDelivery(id, reason, true) },
                                title = "Cremería del Patrón",
                                newDeliveryLabel = "Nueva venta para Cremería",
                                onNewDelivery = {
                                    viewModel.startDeliveryForClient(null, true)
                                    navController.navigate(HyhRoutes.CREMERIA_NUEVA_ENTREGA)
                                },
                                onOpenClientProfile = { id -> navController.navigate(HyhRoutes.cremeriaPerfilCliente(id)) },
                            )
                        }

                        composable(HyhRoutes.CREMERIA_NUEVA_ENTREGA) {
                            NuevaEntregaScreen(
                                draft = cremeriaDraft, clients = cremeriaClients, inventoryBrands = inventoryBrands, settings = settings,
                                onSelectClient = { viewModel.selectDraftClient(it, true) },
                                onUpdateBrand = { viewModel.updateDraftBrand(it, true) },
                                onUpdateModality = { viewModel.updateDraftModality(it, true) },
                                onUpdateWeight = { viewModel.updateDraftWeight(it, true) },
                                onUpdatePricePerKg = { viewModel.updateDraftPricePerKg(it, true) },
                                onUpdateSugarSacks = { viewModel.updateDraftSugarSacks(it, true) },
                                onUpdateSugarWeightPerSack = { viewModel.updateDraftSugarWeightPerSack(it, true) },
                                onUpdateSugarPricePerSack = { viewModel.updateDraftSugarPricePerSack(it, true) },
                                onAddBoxItem = { viewModel.addWeighedBoxItem(true) },
                                onRemoveBoxItem = { viewModel.removeWeighedBoxItem(it, true) },
                                onContinueToPayment = { navController.navigate(HyhRoutes.CREMERIA_PAGO) },
                                onExitDelivery = {
                                    viewModel.clearDeliveryDraft(true)
                                    if (!navController.popBackStack()) navController.navigate(HyhRoutes.CREMERIA) { launchSingleTop = true }
                                },
                                screenTitle = "Venta para Cremería",
                                screenSubtitle = "Cremería del Patrón • Huevo Lili",
                                fixedClientName = SalesChannel.CREMERIA_CLIENT_NAME,
                            )
                        }

                        composable(HyhRoutes.CREMERIA_PAGO) {
                            val selected = cremeriaClients.firstOrNull { it.client.id == cremeriaDraft.clientId }
                            PagoScreen(
                                draft = cremeriaDraft, clientWithDebt = selected, settings = settings,
                                onBack = { navController.popBackStack() },
                                onSelectPaymentMethod = { viewModel.updateDraftPaymentMethod(it, true) },
                                onUpdateInitialAbono = { viewModel.updateDraftInitialAbono(it, true) },
                                onConfirmContado = { viewModel.finalizeDelivery(null, true) { id -> navController.navigate(HyhRoutes.cremeriaTicket(id)) { popUpTo(HyhRoutes.CREMERIA_NUEVA_ENTREGA) { inclusive = true } } } },
                                onProceedToCreditSignature = { navController.navigate(HyhRoutes.CREMERIA_FIRMA_DIGITAL) },
                                screenSubtitle = "Cremería del Patrón • Huevo Lili",
                            )
                        }

                        composable(HyhRoutes.CREMERIA_FIRMA_DIGITAL) {
                            val cw = cremeriaClients.firstOrNull { it.client.id == cremeriaDraft.clientId }
                            val calc = viewModel.computeDraftCalculation(cremeriaDraft, settings, cremeriaClients)
                            val abono = CalculationEngine.parsePositiveDecimal(cremeriaDraft.initialAbonoInput).coerceIn(BigDecimal.ZERO, calc.finalAmountMxn)
                            FirmaDigitalScreen(
                                clientName = cw?.client?.name ?: "Cliente", pendingAmountMxn = calc.finalAmountMxn.subtract(abono),
                                onBack = { navController.popBackStack() },
                                onConfirmSignature = { bmp -> viewModel.finalizeDelivery(bmp, true) { id -> navController.navigate(HyhRoutes.cremeriaTicket(id)) { popUpTo(HyhRoutes.CREMERIA_NUEVA_ENTREGA) { inclusive = true } } } },
                            )
                        }

                        composable(HyhRoutes.CREMERIA_TICKET, arguments = listOf(navArgument("deliveryId") { type = NavType.LongType })) { entry ->
                            val id = entry.arguments?.getLong("deliveryId") ?: 0L
                            val delivery = cremeriaDeliveries.firstOrNull { it.id == id }
                            val client = delivery?.let { d -> cremeriaClients.firstOrNull { it.client.id == d.clientId }?.client }
                            TicketScreen(delivery, client, settings, { navController.popBackStack() }, viewModel::printDeliveryTicket,
                                viewModel::shareDeliveryPdfWhatsApp, viewModel::downloadDeliveryPdf, viewModel::downloadDeliveryJson,
                                { deliveryId, reason -> viewModel.cancelDelivery(deliveryId, reason, true) })
                        }

                        composable(HyhRoutes.CREMERIA_PERFIL_CLIENTE, arguments = listOf(navArgument("clientId") { type = NavType.LongType })) { entry ->
                            val id = entry.arguments?.getLong("clientId") ?: 0L
                            val client = cremeriaClients.firstOrNull { it.client.id == id }?.client
                            PerfilClienteScreen(
                                client = client, deliveries = cremeriaDeliveries.filter { it.clientId == id },
                                abonos = cremeriaAbonos.filter { it.clientId == id }, settings = settings,
                                onBack = { navController.popBackStack() },
                                onStartNewDeliveryForClient = { cid -> viewModel.startDeliveryForClient(cid, true); navController.navigate(HyhRoutes.CREMERIA_NUEVA_ENTREGA) },
                                onRecordAbono = { cid, did, amount, note, done -> viewModel.recordAbono(cid, did, amount, note, done, true) },
                                onOpenTicket = { did -> viewModel.openTicketWithLoading { navController.navigate(HyhRoutes.cremeriaTicket(did)) } },
                            )
                        }

                        composable(HyhRoutes.COMPRAS_HUEVO) {
                            BackHandler { navigateToTopModule(HyhRoutes.PANEL_PRINCIPAL) }
                            ComprasHuevoScreen(
                                purchases = purchases,
                                sugarPurchases = sugarPurchases,
                                inventoryBrands = inventoryBrands,
                                onOpenDrawer = { scope.launch { drawerState.open() } },
                                onRegisterPurchase = viewModel::registerPurchase,
                                onRegisterSugarPurchase = viewModel::registerSugarPurchase,
                            )
                        }

                        composable(HyhRoutes.INVENTARIO) {
                            BackHandler { navigateToTopModule(HyhRoutes.PANEL_PRINCIPAL) }
                            InventarioScreen(
                                inventoryBrands = inventoryBrands,
                                purchases = purchases,
                                sugarInventory = sugarInventory,
                                sugarPurchases = sugarPurchases,
                                onOpenDrawer = { scope.launch { drawerState.open() } },
                            )
                        }

                        composable(HyhRoutes.RECORDATORIOS) {
                            BackHandler { navigateToTopModule(HyhRoutes.PANEL_PRINCIPAL) }
                            RecordatoriosScreen(
                                reminders = reminders,
                                clients = clients,
                                onOpenDrawer = { scope.launch { drawerState.open() } },
                                onSaveReminder = viewModel::saveReminder,
                                onToggleCompleted = viewModel::toggleReminderCompleted,
                                onDeleteReminder = viewModel::deleteReminder,
                            )
                        }

                        composable(HyhRoutes.CIERRES_DIARIOS) {
                            BackHandler { navigateToTopModule(HyhRoutes.PANEL_PRINCIPAL) }
                            CierresDiariosScreen(
                                deliveries = deliveries,
                                activeAbonos = activeAbonos,
                                closings = closings,
                                onOpenDrawer = { scope.launch { drawerState.open() } },
                                onGenerateClosing = viewModel::generateDailyClosing,
                                onOpenClosingDetail = { closingId ->
                                    navController.navigate(HyhRoutes.detalleCierre(closingId))
                                },
                                onDownloadPdf = viewModel::downloadClosingPdf,
                                onDownloadJson = viewModel::downloadClosingJson,
                            )
                        }

                        composable(
                            route = HyhRoutes.DETALLE_CIERRE,
                            arguments = listOf(navArgument("closingId") { type = NavType.LongType }),
                        ) { entry ->
                            val closingId = entry.arguments?.getLong("closingId") ?: 0L
                            val closing = closings.firstOrNull { it.id == closingId }
                            DetalleCierreScreen(
                                closing = closing,
                                onBack = { navController.popBackStack() },
                                onDownloadPdf = viewModel::downloadClosingPdf,
                                onDownloadJson = viewModel::downloadClosingJson,
                            )
                        }

                        composable(HyhRoutes.RESPALDOS_LOCALES) {
                            BackHandler { navigateToTopModule(HyhRoutes.PANEL_PRINCIPAL) }
                            RespaldosLocalesScreen(
                                backups = backups,
                                onOpenDrawer = { scope.launch { drawerState.open() } },
                                onCreateZipBackup = viewModel::createFullBackupZip,
                                onExportJsonBackup = viewModel::exportFullJsonBackup,
                                onSaveBackupToDownloads = viewModel::saveExistingBackupToDownloads,
                                onRestoreFromUri = viewModel::restoreFromUri,
                                onRestoreFromRecord = viewModel::restoreFromRecord,
                                backupFolderName = BuildConfig.BRAND_BACKUPS_FOLDER,
                            )
                        }

                        composable(HyhRoutes.CREDITO_CONFIG) {
                            BackHandler { navigateToTopModule(HyhRoutes.PANEL_PRINCIPAL) }
                            CreditoConfigScreen(
                                settings = settings,
                                clients = clients,
                                onOpenDrawer = { scope.launch { drawerState.open() } },
                                onSaveCreditLegendConfig = viewModel::saveCreditLegendConfig,
                                onUpdateClientCreditTermDays = viewModel::updateClientCreditTermDays,
                            )
                        }

                        composable(HyhRoutes.CONFIGURACION) {
                            BackHandler { navigateToTopModule(HyhRoutes.PANEL_PRINCIPAL) }
                            ConfiguracionScreen(
                                settings = settings,
                                clients = clients,
                                printers = printers,
                                onOpenDrawer = { scope.launch { drawerState.open() } },
                                onSaveBusinessConfig = viewModel::saveBusinessConfig,
                                onUpdateClientSpecialPrice = viewModel::updateClientSpecialPrice,
                                onRefreshPrinters = viewModel::refreshPrinters,
                                onScanPrinters = viewModel::scanPrinters,
                                onStopPrinterScan = viewModel::stopPrinterScan,
                                onPrinterPermissionDenied = { viewModel.showFeedback("Para buscar la impresora, permite los permisos Bluetooth solicitados.") },
                                isScanningPrinters = isScanningPrinters,
                                onSelectPrinterType = viewModel::selectPrinterType,
                                onSelectPrinter = viewModel::selectPrinter,
                                onTestPrinter = viewModel::testPrinter,
                            )
                        }
                    }

                    // Overlays del sistema (Cargando, Éxito, Error)
                    OverlayHost(state = overlayState)
                }
            }
        }
    }

    // Confirmación de salida si se cambia de módulo desde el menú mientras se captura Nueva Entrega
    pendingDrawerDestination?.let { dest ->
        AuroraConfirmationDialog(
            title = stringResource(R.string.exit_delivery_title),
            message = "Si abandonas el registro actual se perderán los datos capturados de esta entrega.",
            confirmText = stringResource(R.string.exit_delivery_confirm),
            dismissText = stringResource(R.string.exit_delivery_cancel),
            isDangerConfirm = true,
            onConfirm = {
                pendingDrawerDestination = null
                val leavingCremeriaFlow = currentRoute == HyhRoutes.CREMERIA_NUEVA_ENTREGA
                viewModel.clearDeliveryDraft(leavingCremeriaFlow)
                if (dest == HyhRoutes.NUEVA_ENTREGA) {
                    viewModel.startDeliveryForClient(null)
                }
                if (dest == HyhRoutes.CREMERIA) viewModel.startDeliveryForClient(null, true)
                navController.navigate(dest) {
                    popUpTo(HyhRoutes.PANEL_PRINCIPAL) { saveState = false }
                    launchSingleTop = true
                }
            },
            onDismiss = { pendingDrawerDestination = null },
        )
    }

    // Confirmación de salida general de la aplicación tras doble Atrás (Sección 12.2)
    if (showAppExitDialog) {
        AuroraConfirmationDialog(
            title = stringResource(R.string.exit_app_title),
            message = "Toda tu información local permanece guardada de forma segura en el dispositivo.",
            confirmText = stringResource(R.string.exit_app_confirm),
            dismissText = stringResource(R.string.exit_app_stay),
            onConfirm = {
                showAppExitDialog = false
                (context as? Activity)?.finish()
            },
            onDismiss = { showAppExitDialog = false },
        )
    }
}
