package com.example.system

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Handler
import androidx.core.content.ContextCompat
import com.example.R
import com.example.data.local.entity.BusinessSettingsEntity
import com.example.data.local.entity.ClientEntity
import com.example.data.local.entity.DeliveryEntity
import com.example.data.local.entity.SalesChannel
import com.example.domain.CalculationEngine
import com.example.domain.DeliveryModality
import com.example.domain.PaymentMethod
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.Normalizer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume

data class PairedPrinterDevice(
    val name: String,
    val address: String,
    val type: String, // "BLUETOOTH" or "USB"
    val isPaired: Boolean = type == "USB",
    val isLowEnergy: Boolean = false,
)

class ThermalPrinterManager(private val context: Context) {

    companion object {
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private const val USB_PERMISSION_ACTION = "com.aistudio.hyhhuevos.qmzpkt.USB_PERMISSION"
        private const val LINE_WIDTH_CHARS = 38
        private const val DISCOVERY_DURATION_MS = 15_000L
        private val PRINTER_SERVICE_UUIDS = setOf(
            "0000ff00-0000-1000-8000-00805f9b34fb",
            "0000ffe0-0000-1000-8000-00805f9b34fb",
            "000018f0-0000-1000-8000-00805f9b34fb",
            "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
            "49535343-fe7d-4ae5-8fa9-9fafd205e455",
        )
        private val PRINTER_WRITE_UUIDS = setOf(
            "0000ff02-0000-1000-8000-00805f9b34fb",
            "0000ffe1-0000-1000-8000-00805f9b34fb",
            "00002af1-0000-1000-8000-00805f9b34fb",
            "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
            "49535343-8841-43f4-a8d4-ecbe34729bb3",
        )
    }

    @Volatile private var discoveryReceiver: BroadcastReceiver? = null
    @Volatile private var pairingReceiver: BroadcastReceiver? = null
    @Volatile private var bleScanCallback: ScanCallback? = null
    @Volatile private var bleScanner: BluetoothLeScanner? = null
    @Volatile private var scanFinishRunnable: Runnable? = null
    private val scanHandler = Handler(context.mainLooper)

    fun hasBluetoothPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    fun hasBluetoothScanPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) ==
                PackageManager.PERMISSION_GRANTED && hasBluetoothPermission()
        } else {
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        }
    }

    @SuppressLint("MissingPermission")
    fun getPairedBluetoothPrinters(): List<PairedPrinterDevice> {
        if (!hasBluetoothPermission()) return emptyList()
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val adapter: BluetoothAdapter = manager?.adapter ?: return emptyList()
        return try {
            adapter.bondedDevices?.map { device: BluetoothDevice ->
                PairedPrinterDevice(
                    name = device.name ?: "Impresora Bluetooth",
                    address = device.address ?: "",
                    type = "BLUETOOTH",
                    isPaired = true,
                )
            } ?: emptyList()
        } catch (_: SecurityException) {
            emptyList()
        }
    }

    fun getConnectedUsbPrinters(): List<PairedPrinterDevice> {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as? UsbManager ?: return emptyList()
        return usbManager.deviceList.values.map { dev ->
            PairedPrinterDevice(
                name = dev.productName ?: "Impresora USB (${dev.vendorId}:${dev.productId})",
                address = dev.deviceName,
                type = "USB",
            )
        }
    }

    @SuppressLint("MissingPermission")
    fun startBluetoothDiscovery(
        onDeviceFound: (PairedPrinterDevice) -> Unit,
        onFinished: () -> Unit,
    ): Result<String> {
        if (!hasBluetoothPermission() || !hasBluetoothScanPermission()) {
            return Result.failure(IllegalStateException("Permite Bluetooth y búsqueda de dispositivos para encontrar la impresora."))
        }
        val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
            ?: return Result.failure(IllegalStateException("Este teléfono no tiene Bluetooth disponible."))
        if (!adapter.isEnabled) {
            return Result.failure(IllegalStateException("Enciende Bluetooth y vuelve a buscar impresoras."))
        }

        cancelBluetoothDiscovery()
        return runCatching {
            val filter = IntentFilter(BluetoothDevice.ACTION_FOUND)
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(receiveContext: Context, intent: Intent) {
                    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    } ?: return
                    onDeviceFound(
                        PairedPrinterDevice(
                            name = device.name ?: "Dispositivo Bluetooth",
                            address = device.address.orEmpty(),
                            type = "BLUETOOTH",
                            isPaired = device.bondState == BluetoothDevice.BOND_BONDED,
                        ),
                    )
                }
            }
            discoveryReceiver = receiver
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("DEPRECATION")
                context.registerReceiver(receiver, filter)
            }
            val classicStarted = runCatching {
                if (adapter.isDiscovering) adapter.cancelDiscovery()
                adapter.startDiscovery()
            }.getOrDefault(false)

            val scanner = adapter.bluetoothLeScanner
            val leCallback = object : ScanCallback() {
                override fun onScanResult(callbackType: Int, result: ScanResult) {
                    val device = result.device
                    onDeviceFound(
                        PairedPrinterDevice(
                            name = result.scanRecord?.deviceName ?: device.name ?: "Impresora Bluetooth LE",
                            address = device.address.orEmpty(),
                            type = "BLUETOOTH",
                            isPaired = device.bondState == BluetoothDevice.BOND_BONDED,
                            isLowEnergy = true,
                        ),
                    )
                }

                override fun onBatchScanResults(results: MutableList<ScanResult>) {
                    results.forEach { onScanResult(ScanSettings.CALLBACK_TYPE_ALL_MATCHES, it) }
                }
            }
            val lowEnergyStarted = runCatching {
                if (scanner == null) false else {
                    val scanSettings = ScanSettings.Builder()
                        .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                        .build()
                    scanner.startScan(null, scanSettings, leCallback)
                    true
                }
            }.getOrDefault(false)
            check(classicStarted || lowEnergyStarted) {
                "No se pudo iniciar la búsqueda. Revisa que Bluetooth esté encendido y vuelve a intentarlo."
            }
            bleScanner = scanner
            bleScanCallback = if (lowEnergyStarted) leCallback else null
            val finish = Runnable {
                cancelBluetoothDiscovery()
                onFinished()
            }
            scanFinishRunnable = finish
            scanHandler.postDelayed(finish, DISCOVERY_DURATION_MS)
            "Buscando impresoras Bluetooth cercanas…"
        }.onFailure {
            unregisterDiscoveryReceiver()
            stopLowEnergyDiscovery()
        }
    }

    @SuppressLint("MissingPermission")
    fun cancelBluetoothDiscovery() {
        scanFinishRunnable?.let(scanHandler::removeCallbacks)
        scanFinishRunnable = null
        try {
            val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
            if (adapter?.isDiscovering == true && hasBluetoothPermission()) adapter.cancelDiscovery()
        } catch (_: SecurityException) {
            // El cambio de permiso no debe impedir liberar el receptor.
        }
        stopLowEnergyDiscovery()
        unregisterDiscoveryReceiver()
    }

    @SuppressLint("MissingPermission")
    private fun stopLowEnergyDiscovery() {
        val scanner = bleScanner
        val callback = bleScanCallback
        bleScanner = null
        bleScanCallback = null
        if (scanner != null && callback != null) runCatching { scanner.stopScan(callback) }
    }

    private fun unregisterDiscoveryReceiver() {
        val receiver = discoveryReceiver ?: return
        discoveryReceiver = null
        runCatching { context.unregisterReceiver(receiver) }
    }

    @SuppressLint("MissingPermission")
    fun requestBluetoothPairing(
        address: String,
        onComplete: (Result<String>) -> Unit,
    ): Result<String> {
        if (!hasBluetoothPermission()) {
            return Result.failure(IllegalStateException("Permite el acceso a dispositivos Bluetooth para vincular la impresora."))
        }
        val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
            ?: return Result.failure(IllegalStateException("Este teléfono no tiene Bluetooth disponible."))
        return runCatching {
            val device = adapter.getRemoteDevice(address)
            if (device.bondState == BluetoothDevice.BOND_BONDED) {
                onComplete(Result.success("Impresora ya vinculada"))
                return Result.success("Impresora ya vinculada")
            }
            if (device.bondState == BluetoothDevice.BOND_BONDING) {
                return Result.success("Confirma la vinculación en el aviso de Android." )
            }

            unregisterPairingReceiver()
            val filter = IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(receiveContext: Context, intent: Intent) {
                    val changedDevice = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    }
                    if (changedDevice?.address != address) return
                    val state = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.ERROR)
                    val previousState = intent.getIntExtra(BluetoothDevice.EXTRA_PREVIOUS_BOND_STATE, BluetoothDevice.ERROR)
                    when {
                        state == BluetoothDevice.BOND_BONDED -> {
                            unregisterPairingReceiver()
                            onComplete(Result.success("Impresora vinculada correctamente"))
                        }
                        state == BluetoothDevice.BOND_NONE && previousState == BluetoothDevice.BOND_BONDING -> {
                            unregisterPairingReceiver()
                            onComplete(Result.failure(IllegalStateException("No se completó la vinculación. Acepta el PIN en Android y vuelve a intentarlo.")))
                        }
                    }
                }
            }
            pairingReceiver = receiver
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("DEPRECATION")
                context.registerReceiver(receiver, filter)
            }
            if (!device.createBond()) {
                unregisterPairingReceiver()
                throw IllegalStateException("Android no pudo iniciar la vinculación con esta impresora.")
            }
            "Confirma la vinculación en el aviso de Android."
        }
    }

    private fun unregisterPairingReceiver() {
        val receiver = pairingReceiver ?: return
        pairingReceiver = null
        runCatching { context.unregisterReceiver(receiver) }
    }

    suspend fun printDeliveryTicket(
        delivery: DeliveryEntity,
        settings: BusinessSettingsEntity,
        client: ClientEntity? = null,
    ): Result<String> = withContext(Dispatchers.IO) {
        val bytes = buildEscPosTicketBytes(delivery, settings, client)
        when (settings.printerType) {
            "USB" -> printViaUsb(settings.printerAddress, bytes)
            else -> printViaBluetooth(settings.printerAddress, bytes, settings.printerTransport)
        }
    }

    suspend fun printTestTicket(settings: BusinessSettingsEntity): Result<String> =
        withContext(Dispatchers.IO) {
            val out = ByteArrayOutputStream()
            out.write(byteArrayOf(0x1B, 0x40)) // ESC @ Init
            out.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center
            out.write(byteArrayOf(0x1B, 0x45, 0x01)) // Bold ON
            out.write(asciiLine(settings.businessName))
            out.write(byteArrayOf(0x1B, 0x45, 0x00)) // Bold OFF
            out.write(asciiLine(settings.slogan))
            out.write(asciiLine("--------------------------------------"))
            out.write(asciiLine("PRUEBA DE IMPRESION 60MM"))
            out.write(asciiLine("CONEXION VERIFICADA"))
            out.write(asciiLine("--------------------------------------"))
            out.write(byteArrayOf(0x0A, 0x0A, 0x0A))
            val bytes = out.toByteArray()
            when (settings.printerType) {
                "USB" -> printViaUsb(settings.printerAddress, bytes)
                else -> printViaBluetooth(settings.printerAddress, bytes, settings.printerTransport)
            }
        }

    @SuppressLint("MissingPermission")
    private suspend fun printViaBluetooth(address: String, data: ByteArray, preferredTransport: String): Result<String> {
        if (!hasBluetoothPermission()) {
            return Result.failure(IllegalStateException("Permiso de Bluetooth requerido."))
        }
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val adapter = manager?.adapter
            ?: return Result.failure(IllegalStateException("Bluetooth no disponible en este dispositivo."))
        if (!adapter.isEnabled) {
            return Result.failure(IllegalStateException("Encienda el Bluetooth para imprimir."))
        }
        val targetAddress = address.ifBlank { "" }
        if (targetAddress.isBlank()) {
            return Result.failure(IllegalStateException("Selecciona una impresora en Configuración antes de imprimir."))
        }
        val device = try {
            adapter.getRemoteDevice(targetAddress)
        } catch (e: Exception) {
            return Result.failure(IllegalStateException("No se encuentra la impresora seleccionada. Búscala otra vez."))
        }

        val preferBle = preferredTransport == "BLE"
        val first = if (preferBle) printViaBle(targetAddress, data) else printViaClassicBluetooth(adapter, device, data)
        if (first.isSuccess) return first

        val canFallback = if (preferBle) device.bondState == BluetoothDevice.BOND_BONDED else true
        if (!canFallback) return first
        val fallback = if (preferBle) printViaClassicBluetooth(adapter, device, data) else printViaBle(targetAddress, data)
        if (fallback.isSuccess) return fallback

        val preferredName = if (preferBle) "Bluetooth LE" else "Bluetooth clásico"
        val fallbackName = if (preferBle) "Bluetooth clásico" else "Bluetooth LE"
        return Result.failure(
            IllegalStateException(
                "No se pudo enviar la impresión. $preferredName: ${first.exceptionOrNull()?.message}. " +
                    "$fallbackName: ${fallback.exceptionOrNull()?.message}",
            ),
        )
    }

    @SuppressLint("MissingPermission")
    private fun printViaClassicBluetooth(
        adapter: BluetoothAdapter,
        device: BluetoothDevice,
        data: ByteArray,
    ): Result<String> {
        if (device.bondState != BluetoothDevice.BOND_BONDED) {
            return Result.failure(IllegalStateException("La impresora no está vinculada para Bluetooth clásico."))
        }
        return runCatching {
            val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            adapter.cancelDiscovery()
            socket.use {
                socket.connect()
                socket.outputStream.use { stream ->
                    stream.write(data)
                    stream.flush()
                }
            }
            "Ticket enviado a impresora Bluetooth"
        }
    }

    @SuppressLint("MissingPermission")
    private suspend fun printViaBle(address: String, data: ByteArray): Result<String> = withContext(Dispatchers.IO) {
        if (!hasBluetoothPermission()) {
            return@withContext Result.failure(IllegalStateException("Permite conectar dispositivos Bluetooth para imprimir."))
        }
        val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
            ?: return@withContext Result.failure(IllegalStateException("Bluetooth no disponible en este dispositivo."))

        val result = withTimeoutOrNull(35_000L) {
            suspendCancellableCoroutine { continuation ->
                val finished = AtomicBoolean(false)
                val servicesStarted = AtomicBoolean(false)
                var gatt: BluetoothGatt? = null
                var characteristic: BluetoothGattCharacteristic? = null
                var writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                var chunkSize = 20
                var offset = 0
                var lastChunkLength = 0

                fun finish(outcome: Result<String>) {
                    if (!finished.compareAndSet(false, true)) return
                    if (continuation.isActive) continuation.resume(outcome)
                    runCatching { gatt?.disconnect() }
                    runCatching { gatt?.close() }
                }

                fun discover(gattToUse: BluetoothGatt) {
                    if (!servicesStarted.compareAndSet(false, true)) return
                    if (!gattToUse.discoverServices()) {
                        finish(Result.failure(IllegalStateException("La impresora se conectó, pero no mostró sus servicios de impresión.")))
                    }
                }

                fun sendNextChunk(gattToUse: BluetoothGatt) {
                    val target = characteristic ?: run {
                        finish(Result.failure(IllegalStateException("No se encontró un canal de escritura en la impresora.")))
                        return
                    }
                    if (offset >= data.size) {
                        finish(Result.success("Ticket enviado a impresora Bluetooth LE"))
                        return
                    }
                    val end = minOf(offset + chunkSize, data.size)
                    val chunk = data.copyOfRange(offset, end)
                    lastChunkLength = chunk.size
                    val accepted = try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            gattToUse.writeCharacteristic(target, chunk, writeType) == BluetoothStatusCodes.SUCCESS
                        } else {
                            @Suppress("DEPRECATION")
                            target.writeType = writeType
                            @Suppress("DEPRECATION")
                            target.value = chunk
                            @Suppress("DEPRECATION")
                            gattToUse.writeCharacteristic(target)
                        }
                    } catch (_: SecurityException) {
                        false
                    }
                    if (!accepted) {
                        finish(Result.failure(IllegalStateException("Android rechazó el envío de datos a la impresora LE.")))
                    }
                }

                val callback = object : BluetoothGattCallback() {
                    override fun onConnectionStateChange(gattFromCallback: BluetoothGatt, status: Int, newState: Int) {
                        if (status != BluetoothGatt.GATT_SUCCESS) {
                            finish(Result.failure(IllegalStateException("Falló la conexión BLE (código $status).")))
                            return
                        }
                        if (newState == BluetoothProfile.STATE_CONNECTED) {
                            val mtuRequestStarted = Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP &&
                                runCatching { gattFromCallback.requestMtu(247) }.getOrDefault(false)
                            if (!mtuRequestStarted) discover(gattFromCallback)
                        } else if (newState == BluetoothProfile.STATE_DISCONNECTED && !finished.get()) {
                            finish(Result.failure(IllegalStateException("La impresora Bluetooth LE se desconectó.")))
                        }
                    }

                    override fun onMtuChanged(gattFromCallback: BluetoothGatt, mtu: Int, status: Int) {
                        chunkSize = (if (status == BluetoothGatt.GATT_SUCCESS) mtu else 23).minus(3).coerceAtLeast(20)
                        discover(gattFromCallback)
                    }

                    override fun onServicesDiscovered(gattFromCallback: BluetoothGatt, status: Int) {
                        if (status != BluetoothGatt.GATT_SUCCESS) {
                            finish(Result.failure(IllegalStateException("No se pudieron leer los servicios de la impresora LE.")))
                            return
                        }
                        val candidate = findWritablePrinterCharacteristic(gattFromCallback)
                        if (candidate == null) {
                            finish(Result.failure(IllegalStateException("La impresora BLE no ofrece un canal compatible de escritura.")))
                            return
                        }
                        characteristic = candidate
                        val properties = candidate.properties
                        writeType = if (properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) {
                            BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                        } else {
                            BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                        }
                        sendNextChunk(gattFromCallback)
                    }

                    override fun onCharacteristicWrite(
                        gattFromCallback: BluetoothGatt,
                        writtenCharacteristic: BluetoothGattCharacteristic,
                        status: Int,
                    ) {
                        if (status != BluetoothGatt.GATT_SUCCESS) {
                            finish(Result.failure(IllegalStateException("La impresora rechazó un bloque de datos (código $status).")))
                            return
                        }
                        if (writtenCharacteristic.uuid != characteristic?.uuid) return
                        offset += lastChunkLength
                        sendNextChunk(gattFromCallback)
                    }
                }

                continuation.invokeOnCancellation {
                    finished.set(true)
                    runCatching { gatt?.disconnect() }
                    runCatching { gatt?.close() }
                }

                try {
                    val device = adapter.getRemoteDevice(address)
                    gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
                    if (gatt == null) finish(Result.failure(IllegalStateException("Android no pudo abrir la conexión Bluetooth LE.")))
                } catch (error: Exception) {
                    finish(Result.failure(IllegalStateException("No se pudo conectar con la impresora BLE: ${error.message}")))
                }
            }
        }
        result ?: Result.failure(IllegalStateException("La impresora Bluetooth LE tardó demasiado en responder."))
    }

    private fun findWritablePrinterCharacteristic(gatt: BluetoothGatt): BluetoothGattCharacteristic? {
        return gatt.services
            .flatMap { service ->
                service.characteristics.mapNotNull { characteristic ->
                    val properties = characteristic.properties
                    val canWrite = properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0 ||
                        properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0
                    if (!canWrite) return@mapNotNull null
                    val serviceId = service.uuid.toString().lowercase(Locale.ROOT)
                    val characteristicId = characteristic.uuid.toString().lowercase(Locale.ROOT)
                    val score = (if (serviceId in PRINTER_SERVICE_UUIDS) 100 else 0) +
                        (if (characteristicId in PRINTER_WRITE_UUIDS) 200 else 0) +
                        (if (properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) 10 else 0)
                    score to characteristic
                }
            }
            .maxByOrNull { it.first }
            ?.second
    }

    private fun printViaUsb(deviceName: String, data: ByteArray): Result<String> {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as? UsbManager
            ?: return Result.failure(IllegalStateException("USB Host no soportado."))
        val device: UsbDevice = usbManager.deviceList[deviceName]
            ?: usbManager.deviceList.values.firstOrNull()
            ?: return Result.failure(IllegalStateException("No se detectó impresora USB OTG conectada."))

        if (!usbManager.hasPermission(device)) {
            val intent = Intent(USB_PERMISSION_ACTION).setPackage(context.packageName)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val pi = PendingIntent.getBroadcast(context, 0, intent, flags)
            usbManager.requestPermission(device, pi)
            return Result.failure(IllegalStateException("Acepte el permiso USB OTG y vuelva a intentar imprimir."))
        }

        for (i in 0 until device.interfaceCount) {
            val intf = device.getInterface(i)
            for (j in 0 until intf.endpointCount) {
                val ep = intf.getEndpoint(j)
                if (ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK &&
                    ep.direction == UsbConstants.USB_DIR_OUT
                ) {
                    val conn = usbManager.openDevice(device)
                        ?: return Result.failure(IllegalStateException("No se pudo abrir conexión USB."))
                    conn.claimInterface(intf, true)
                    val transferred = conn.bulkTransfer(ep, data, data.size, 5000)
                    conn.releaseInterface(intf)
                    conn.close()
                    return if (transferred >= 0) {
                        Result.success("Ticket enviado a impresora USB")
                    } else {
                        Result.failure(IllegalStateException("Falló la transferencia USB a la impresora."))
                    }
                }
            }
        }
        return Result.failure(IllegalStateException("El dispositivo USB no tiene endpoint de impresión compatible."))
    }

    fun buildEscPosTicketBytes(
        delivery: DeliveryEntity,
        settings: BusinessSettingsEntity,
        client: ClientEntity? = null,
    ): ByteArray {
        val out = ByteArrayOutputStream()
        val dateFmt = SimpleDateFormat("dd 'de' MMMM, yyyy", Locale("es", "MX"))
        val timeFmt = SimpleDateFormat("hh:mm a", Locale.US)
        val isCancelled = delivery.status == "CANCELADA"
        val isCredit = delivery.paymentMethod == PaymentMethod.CREDITO.dbValue
        val weighedItems = CalculationEngine.parseWeighedItemsJson(delivery.itemsSnapshotJson)
        val hasEggs = delivery.boxes > 0.0 || weighedItems.isNotEmpty()
        val hasSugar = delivery.sugarSacks > 0.0
        val sugarWeightKg = if (hasSugar) {
            BigDecimal.valueOf(delivery.sugarSacks).multiply(BigDecimal.valueOf(delivery.sugarSackWeightKg))
        } else {
            BigDecimal.ZERO
        }
        val totalNetWeightKg = BigDecimal.valueOf(delivery.netWeightKg).add(sugarWeightKg)
        val modalityLabel = CalculationEngine.resolveModalityLabel(delivery.modality, weighedItems)
        val brandBreakdown = if (hasEggs) {
            CalculationEngine.summarizeBrandBreakdown(
                items = weighedItems,
                fallbackBrand = delivery.brand,
                fallbackPricePerKg = BigDecimal.valueOf(delivery.pricePerKg),
                fallbackBoxes = BigDecimal.valueOf(delivery.boxes),
                fallbackNetWeightKg = BigDecimal.valueOf(delivery.netWeightKg),
            )
        } else {
            emptyList()
        }
        val headerBrandSummary = if (hasEggs) {
            CalculationEngine.resolveBrandSummaryLabel(delivery.brand, weighedItems)
        } else {
            ""
        }
        val rawSubtotal = BigDecimal.valueOf(delivery.rawAmountMxn).setScale(2, RoundingMode.HALF_UP)
        val finalBd = BigDecimal.valueOf(delivery.finalAmountMxn).setScale(2, RoundingMode.HALF_UP)
        val roundingDiff = finalBd.subtract(rawSubtotal).setScale(2, RoundingMode.HALF_UP)
        val effectivePaidMxn = if (!isCancelled) {
            (delivery.finalAmountMxn - delivery.pendingBalanceMxn).coerceIn(0.0, delivery.finalAmountMxn)
        } else {
            delivery.initialPaymentMxn
        }
        val statusText = when {
            isCancelled -> "CANCELADO"
            delivery.pendingBalanceMxn > 0.0 -> "ENTREGADO / PENDIENTE LIQUIDACION"
            else -> "LIQUIDADO"
        }

        out.write(byteArrayOf(0x1B, 0x40)) // Init
        out.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center

        // Logo térmico 1-bit de 432 dots (formato 60mm)
        BitmapFactory.decodeResource(context.resources, R.drawable.img_ticket_logo)?.let { bmp ->
            out.write(bitmapToEscPosRaster(bmp, maxWidthPx = 432))
        }

        if (settings.address.isNotBlank()) {
            wrapAsciiLines(settings.address).forEach { out.write(asciiLine(it)) }
        }
        if (settings.phone.isNotBlank()) out.write(asciiLine("Tel: ${settings.phone}"))
        out.write(asciiLine("======================================"))

        if (isCancelled) {
            out.write(byteArrayOf(0x1B, 0x45, 0x01))
            out.write(byteArrayOf(0x1D, 0x21, 0x11)) // Double width & height
            out.write(asciiLine("CANCELADO"))
            out.write(byteArrayOf(0x1D, 0x21, 0x00))
            out.write(byteArrayOf(0x1B, 0x45, 0x00))
            out.write(asciiLine("--------------------------------------"))
        }

        out.write(byteArrayOf(0x1B, 0x45, 0x01))
        out.write(asciiLine("COMPROBANTE DE REMISION"))
        if (delivery.salesChannel == SalesChannel.CREMERIA) out.write(asciiLine("VENTA PARA CREMERIA DEL PATRON"))
        out.write(byteArrayOf(0x1D, 0x21, 0x01)) // Double height folio
        out.write(asciiLine(delivery.folio))
        out.write(byteArrayOf(0x1D, 0x21, 0x00))
        out.write(byteArrayOf(0x1B, 0x45, 0x00))

        out.write(byteArrayOf(0x1B, 0x61, 0x00)) // Left
        out.write(pairLine("Fecha:", dateFmt.format(Date(delivery.dateMillis))))
        out.write(pairLine("Hora:", timeFmt.format(Date(delivery.dateMillis))))
        out.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center
        out.write(byteArrayOf(0x1B, 0x45, 0x01))
        wrapAsciiLines(statusText).forEach { out.write(asciiLine(it)) }
        out.write(byteArrayOf(0x1B, 0x45, 0x00))
        out.write(byteArrayOf(0x1B, 0x61, 0x00)) // Left
        out.write(asciiLine("--------------------------------------"))

        out.write(byteArrayOf(0x1B, 0x45, 0x01))
        out.write(asciiLine("CLIENTE"))
        wrapAsciiLines(delivery.clientName).forEach { out.write(asciiLine(it)) }
        out.write(byteArrayOf(0x1B, 0x45, 0x00))
        if (!client?.address.isNullOrBlank()) {
            wrapAsciiLines(client?.address.orEmpty()).forEach { out.write(asciiLine(it)) }
        }
        if (!client?.phone.isNullOrBlank()) {
            out.write(asciiLine("Tel: ${client?.phone.orEmpty()}"))
        }

        out.write(asciiLine("--------------------------------------"))
        val productHeader = when {
            hasEggs && hasSugar -> "$headerBrandSummary - $modalityLabel + Azucar"
            hasSugar -> "Azucar (Bultos)"
            else -> "$headerBrandSummary - $modalityLabel"
        }
        wrapAsciiLines(productHeader).forEach { out.write(asciiLine(it)) }

        brandBreakdown.forEach { b ->
            val leftPart = "${b.brand.take(12)} ${CalculationEngine.formatExactWeight(b.netWeightKg)}kg x ${CalculationEngine.formatMoney(b.pricePerKg)}"
            val rightSub = CalculationEngine.formatMoney(b.subtotalMxn.setScale(2, RoundingMode.HALF_UP))
            if (normalizeAscii(leftPart).length + 1 + normalizeAscii(rightSub).length <= LINE_WIDTH_CHARS) {
                out.write(pairLine(leftPart, rightSub))
            } else {
                wrapAsciiLines(b.brand).forEach { out.write(asciiLine(it)) }
                val detailLeft = "${CalculationEngine.formatExactWeight(b.netWeightKg)}kg x ${CalculationEngine.formatMoney(b.pricePerKg)}/kg"
                out.write(pairLine(detailLeft, rightSub))
            }
        }
        if (hasSugar) {
            val sLeft = "Azucar ${CalculationEngine.formatExactBoxes(delivery.sugarSacks)}bto x ${CalculationEngine.formatExactWeight(delivery.sugarSackWeightKg)}kg"
            val sRight = CalculationEngine.formatMoney(delivery.sugarSubtotalMxn)
            if (normalizeAscii(sLeft).length + 1 + normalizeAscii(sRight).length <= LINE_WIDTH_CHARS) {
                out.write(pairLine(sLeft, sRight))
            } else {
                out.write(asciiLine("Azucar (${CalculationEngine.formatExactBoxes(delivery.sugarSacks)} bto)"))
                out.write(pairLine("${CalculationEngine.formatExactWeight(delivery.sugarSackWeightKg)}kg x ${CalculationEngine.formatMoney(delivery.sugarPricePerSackMxn)}/bto", sRight))
            }
        }

        out.write(asciiLine("======================================"))
        out.write(byteArrayOf(0x1B, 0x45, 0x01))
        out.write(pairLine("KILOS NETOS", "${CalculationEngine.formatExactWeight(totalNetWeightKg)} kg"))
        out.write(byteArrayOf(0x1B, 0x45, 0x00))
        out.write(asciiLine("======================================"))

        out.write(pairLine("Subtotal:", CalculationEngine.formatMoney(rawSubtotal)))
        if (roundingDiff.compareTo(BigDecimal.ZERO) != 0) {
            val sign = if (roundingDiff > BigDecimal.ZERO) "+" else "-"
            out.write(pairLine("Redondeo:", "$sign${CalculationEngine.formatMoney(roundingDiff.abs())}"))
        }
        out.write(asciiLine("--------------------------------------"))

        out.write(byteArrayOf(0x1B, 0x45, 0x01))
        out.write(pairLine("TOTAL", "${CalculationEngine.formatMoney(delivery.finalAmountMxn)} MXN"))
        wrapAsciiLines(CalculationEngine.amountInWordsMxn(delivery.finalAmountMxn)).forEach {
            out.write(asciiLine(it))
        }
        out.write(byteArrayOf(0x1B, 0x45, 0x00))
        out.write(asciiLine("--------------------------------------"))

        val payLabel = PaymentMethod.fromDb(delivery.paymentMethod).label
        out.write(pairLine("Pagado / Abono:", "${CalculationEngine.formatMoney(effectivePaidMxn)} MXN"))
        out.write(asciiLine("Forma pago: $payLabel"))

        // Barra invertida ESC/POS (GS B 1 / GS B 0)
        out.write(byteArrayOf(0x1B, 0x45, 0x01))
        out.write(byteArrayOf(0x1D, 0x42, 0x01))
        out.write(
            pairLine(
                if (delivery.pendingBalanceMxn > 0.0) "RESTA ENTREGA" else "LIQUIDADO",
                "${CalculationEngine.formatMoney(delivery.pendingBalanceMxn)} MXN",
            ),
        )
        out.write(byteArrayOf(0x1D, 0x42, 0x00))
        out.write(byteArrayOf(0x1B, 0x45, 0x00))

        out.write(asciiLine("--------------------------------------"))
        out.write(byteArrayOf(0x1B, 0x45, 0x01))
        out.write(pairLine("Saldo anterior:", "${CalculationEngine.formatMoney(delivery.previousDebtSnapshotMxn)} MXN"))
        out.write(pairLine("Esta remision:", "+${CalculationEngine.formatMoney(delivery.pendingBalanceMxn)} MXN"))
        val totalDebt = delivery.previousDebtSnapshotMxn + delivery.pendingBalanceMxn
        out.write(pairLine("SALDO TOTAL", "${CalculationEngine.formatMoney(totalDebt)} MXN"))
        out.write(byteArrayOf(0x1B, 0x45, 0x00))

        if (isCredit) {
            out.write(asciiLine("--------------------------------------"))
            val legend = when {
                isCancelled -> "Nota cancelada. Las obligaciones de pago y entrega correspondientes fueron revertidas."
                delivery.pendingBalanceMxn > 0.0 ->
                    CalculationEngine.buildPendingCreditLegendSegments(
                        deliveryDateMillis = delivery.dateMillis,
                        pendingBalanceMxn = delivery.pendingBalanceMxn,
                        totalDebtMxn = totalDebt,
                        effectiveTermDays = client?.creditTermDays ?: settings.creditTermDays,
                        moratoriumInterestPercent = settings.creditMoratoriumInterestPercent,
                        paymentPlace = settings.creditPaymentPlace,
                        extraCondition = settings.creditLegendExtra,
                        closingNote = settings.creditLegendClosing,
                    ).joinToString("") { it.text }
                else ->
                    "Recibi la mercancia descrita en esta remision a mi entera satisfaccion y cubri el importe total senalado. Acepto mi firma digitalizada como constancia de recepcion."
            }
            out.write(byteArrayOf(0x1B, 0x61, 0x00)) // Left
            wrapAsciiLines(legend).forEach { out.write(asciiLine(it)) }
            out.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center
            delivery.signaturePath?.let { path ->
                val sigFile = File(path)
                if (sigFile.exists()) {
                    BitmapFactory.decodeFile(sigFile.absolutePath)?.let { sigBmp ->
                        out.write(bitmapToEscPosRaster(sigBmp, maxWidthPx = 360))
                    }
                }
            }
            out.write(asciiLine("Recibi de conformidad"))
            out.write(byteArrayOf(0x1B, 0x45, 0x01))
            wrapAsciiLines(delivery.clientName).forEach { out.write(asciiLine(it)) }
            out.write(byteArrayOf(0x1B, 0x45, 0x00))
        }

        out.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center
        out.write(asciiLine("--------------------------------------"))
        out.write(byteArrayOf(0x1B, 0x45, 0x01))
        out.write(asciiLine("!Gracias por su preferencia!"))
        out.write(byteArrayOf(0x1B, 0x45, 0x00))
        out.write(asciiLine("Calidad y frescura en cada huevo"))

        out.write(byteArrayOf(0x0A, 0x0A, 0x0A))
        out.write(byteArrayOf(0x1D, 0x56, 0x41, 0x00)) // Cut if supported
        return out.toByteArray()
    }

    private fun wrapAsciiLines(text: String, maxCols: Int = LINE_WIDTH_CHARS): List<String> {
        val clean = normalizeAscii(text).trim()
        if (clean.isEmpty()) return emptyList()
        val lines = mutableListOf<String>()
        var current = StringBuilder()
        for (word in clean.split(Regex("\\s+"))) {
            if (current.isEmpty()) {
                current.append(word.take(maxCols))
            } else if (current.length + 1 + word.length <= maxCols) {
                current.append(' ').append(word)
            } else {
                lines += current.toString()
                current = StringBuilder(word.take(maxCols))
            }
        }
        if (current.isNotEmpty()) lines += current.toString()
        return lines
    }

    private fun pairLine(left: String, right: String): ByteArray {
        val cleanLeft = normalizeAscii(left)
        val cleanRight = normalizeAscii(right)
        val spaces = (LINE_WIDTH_CHARS - cleanLeft.length - cleanRight.length).coerceAtLeast(1)
        return (cleanLeft + " ".repeat(spaces) + cleanRight + "\n").toByteArray(Charsets.US_ASCII)
    }

    private fun asciiLine(text: String): ByteArray {
        return (normalizeAscii(text) + "\n").toByteArray(Charsets.US_ASCII)
    }

    private fun normalizeAscii(input: String): String {
        val norm = Normalizer.normalize(input, Normalizer.Form.NFD)
        return norm.replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
            .replace(Regex("[^\\x20-\\x7E]"), "")
    }

    private fun bitmapToEscPosRaster(source: Bitmap, maxWidthPx: Int): ByteArray {
        val targetW = ((source.width.coerceAtMost(maxWidthPx)) / 8) * 8
        val safeW = targetW.coerceAtLeast(8)
        val targetH = ((source.height.toFloat() / source.width.toFloat()) * safeW).toInt().coerceAtLeast(8)
        val scaled = Bitmap.createScaledBitmap(source, safeW, targetH, true)

        val widthBytes = safeW / 8
        val out = ByteArrayOutputStream()
        // GS v 0 m xL xH yL yH
        out.write(
            byteArrayOf(
                0x1D,
                0x76,
                0x30,
                0x00,
                (widthBytes and 0xFF).toByte(),
                ((widthBytes shr 8) and 0xFF).toByte(),
                (targetH and 0xFF).toByte(),
                ((targetH shr 8) and 0xFF).toByte(),
            ),
        )
        for (y in 0 until targetH) {
            for (xByte in 0 until widthBytes) {
                var slice = 0
                for (bit in 0 until 8) {
                    val px = scaled.getPixel(xByte * 8 + bit, y)
                    val alpha = Color.alpha(px)
                    val lum = (0.299 * Color.red(px) + 0.587 * Color.green(px) + 0.114 * Color.blue(px))
                    val isDark = alpha > 128 && lum < 160
                    if (isDark) {
                        slice = slice or (1 shl (7 - bit))
                    }
                }
                out.write(slice)
            }
        }
        return out.toByteArray()
    }
}
