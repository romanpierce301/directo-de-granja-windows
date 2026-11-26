package com.example.system

import android.os.Build
import com.example.data.local.entity.ClientEntity
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

data class DirectoLoginResult(val token: String, val userName: String)

data class DirectoEggStock(
    val brand: String,
    val availableBoxes: Double,
    val soldBoxes: Double,
    val remainingBoxes: Double,
)

data class DirectoSugarStock(
    val availableSacks: Double,
    val soldSacks: Double,
    val availableKg: Double,
)

data class DirectoBusinessSettings(
    val phone: String,
    val address: String,
    val slogan: String,
)

data class DirectoSnapshot(
    val customers: List<ClientEntity>,
    val pricePerKg: Double,
    val folioSeries: String,
    val deviceAuthorized: Boolean,
    val eggStocks: List<DirectoEggStock>,
    val sugarStock: DirectoSugarStock?,
    val settings: DirectoBusinessSettings?,
    val serverTimeUtc: String,
)

class DirectoSocketHandle(private val webSocket: WebSocket) {
    fun close() {
        runCatching { webSocket.close(1000, "closed") }
    }
}

object WindowsApiClient {
    private val wsClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .pingInterval(25, TimeUnit.SECONDS)
            .build()
    }

    fun loginAndRegisterDevice(baseUrl: String, email: String, password: String, deviceId: String): DirectoLoginResult {
        val cleanBase = validateBaseUrl(baseUrl)
        val login = post("$cleanBase/api/auth/login", JSONObject().put("email", email.trim()).put("password", password))
        val user = login.optJSONObject("user") ?: throw IllegalStateException("El servidor no devolvió el perfil de usuario")
        require(user.optString("role") == "vendedor") { "Esta variante acepta cuentas de vendedor. Pide al dueño que cree y autorice tu cuenta." }
        val token = login.optString("token")
        require(token.isNotBlank()) { "El servidor no devolvió una sesión válida" }
        val model = listOf(Build.MANUFACTURER, Build.MODEL).filter { it.isNotBlank() }.joinToString(" ").take(100).ifBlank { "Android" }
        post(
            "$cleanBase/api/devices/register",
            JSONObject().put("deviceId", deviceId).put("deviceName", model),
            token,
        )
        return DirectoLoginResult(token, user.optString("name", email))
    }

    fun downloadSnapshot(baseUrl: String, token: String, deviceId: String): DirectoSnapshot {
        val cleanBase = validateBaseUrl(baseUrl)
        val encodedDeviceId = URLEncoder.encode(deviceId, "UTF-8")
        val pull = get("$cleanBase/api/sync/pull?deviceId=$encodedDeviceId", token)

        val remoteCustomers = mutableListOf<ClientEntity>()
        val customerArray = pull.optJSONArray("customers")
        if (customerArray != null) {
            for (index in 0 until customerArray.length()) {
                val customer = customerArray.optJSONObject(index) ?: continue
                val windowsId = customer.optString("id").takeIf { it.isNotBlank() } ?: continue
                val name = customer.optString("businessName").trim()
                if (name.isBlank()) continue
                val windowsDebtMxn = customer.optDouble("activeDebtCentavos", 0.0)
                    .let { if (it.isFinite() && it >= 0.0) it / 100.0 else 0.0 }
                remoteCustomers += ClientEntity(
                    windowsId = windowsId,
                    name = name,
                    phone = customer.optString("phone"),
                    address = customer.optString("address"),
                    specialPricePerKg = if (customer.isNull("specialPriceCentavosPerKg")) null else customer.optDouble("specialPriceCentavosPerKg") / 100.0,
                    creditTermDays = if (customer.isNull("creditTermDays")) null else customer.optInt("creditTermDays"),
                    windowsSyncedDebtMxn = windowsDebtMxn,
                )
            }
        }

        val price = pull.optJSONObject("dailyPrice")?.optDouble("priceCentavosPerKg", 0.0)?.div(100.0) ?: 0.0
        val series = pull.optString("folioSeries")
        require(series.isNotBlank()) { "Windows no devolvió una serie de folios para esta cuenta" }

        val eggStocks = mutableListOf<DirectoEggStock>()
        var sugarSacksArrived = 0.0
        var sugarSacksSold = 0.0
        var sugarGramsAvailable = 0.0
        var hasSugarInventory = false

        val inventoryArray = pull.optJSONArray("inventory")
        if (inventoryArray != null) {
            for (index in 0 until inventoryArray.length()) {
                val item = inventoryArray.optJSONObject(index) ?: continue
                val productType = item.optString("productType", "huevo")
                val arrived = item.optDouble("boxesArrived", 0.0)
                val sold = item.optDouble("boxesSold", 0.0)
                val available = item.optDouble("boxesAvailable", 0.0)
                if (productType == "azucar") {
                    hasSugarInventory = true
                    sugarSacksArrived += arrived
                    sugarSacksSold += sold
                    sugarGramsAvailable += item.optDouble("gramsAvailable", 0.0)
                } else {
                    val brandName = item.optString("brandName").trim()
                    if (brandName.isNotBlank()) {
                        eggStocks += DirectoEggStock(
                            brand = brandName,
                            availableBoxes = arrived,
                            soldBoxes = sold,
                            remainingBoxes = available,
                        )
                    }
                }
            }
        }

        val sugarStock = if (hasSugarInventory) {
            DirectoSugarStock(
                availableSacks = sugarSacksArrived,
                soldSacks = sugarSacksSold,
                availableKg = sugarGramsAvailable / 1000.0,
            )
        } else {
            null
        }

        val settingsObj = pull.optJSONObject("settings")
        val settings = settingsObj?.let {
            DirectoBusinessSettings(
                phone = it.optString("businessPhone", ""),
                address = it.optString("businessAddress", ""),
                slogan = it.optString("slogan", ""),
            )
        }

        return DirectoSnapshot(
            customers = remoteCustomers,
            pricePerKg = price,
            folioSeries = series,
            deviceAuthorized = pull.optBoolean("deviceAuthorized", true),
            eggStocks = eggStocks,
            sugarStock = sugarStock,
            settings = settings,
            serverTimeUtc = pull.optString("serverTimeUtc", ""),
        )
    }

    fun reserveFolios(baseUrl: String, token: String, deviceId: String, count: Int = 100): Pair<String, List<Int>> {
        val cleanBase = validateBaseUrl(baseUrl)
        val reservation = post(
            "$cleanBase/api/sync/folios/reserve",
            JSONObject().put("deviceId", deviceId).put("count", count.coerceIn(1, 200)),
            token,
        )
        val series = reservation.optString("folioSeries")
        require(series.isNotBlank()) { "Windows no devolvió la serie de folios reservada" }
        val folios = reservation.optJSONArray("folios")
        val numbers = if (folios == null) emptyList() else (0 until folios.length()).map { folios.optInt(it) }.filter { it > 0 }
        require(numbers.isNotEmpty()) { "Windows no reservó folios para este teléfono" }
        return series to numbers
    }

    fun pushAndroidBatch(baseUrl: String, token: String, deviceId: String, payload: JSONObject): JSONObject =
        post("${validateBaseUrl(baseUrl)}/api/sync/push", payload.put("deviceId", deviceId), token)

    fun openSyncWebSocket(
        baseUrl: String,
        token: String,
        onEvent: (String) -> Unit,
        onConnectedChanged: (Boolean) -> Unit,
        onFailure: (String) -> Unit,
    ): DirectoSocketHandle {
        val cleanBase = validateBaseUrl(baseUrl)
        val wsBase = when {
            cleanBase.startsWith("https://", ignoreCase = true) -> "wss://" + cleanBase.substring(8)
            cleanBase.startsWith("http://", ignoreCase = true) -> "ws://" + cleanBase.substring(7)
            else -> throw IllegalArgumentException("URL de servidor inválida")
        }
        val encodedToken = URLEncoder.encode(token, "UTF-8")
        val request = Request.Builder()
            .url("$wsBase/ws?token=$encodedToken")
            .build()
        val ws = wsClient.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    onConnectedChanged(true)
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    val eventType = runCatching { JSONObject(text).optString("type") }.getOrDefault("")
                    if (eventType.isNotBlank()) {
                        onEvent(eventType)
                    }
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(1000, null)
                    onConnectedChanged(false)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    onConnectedChanged(false)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    onConnectedChanged(false)
                    onFailure(t.message ?: "Desconectado de Windows")
                }
            },
        )
        return DirectoSocketHandle(ws)
    }

    private fun validateBaseUrl(baseUrl: String): String {
        val cleanBase = baseUrl.trim().trimEnd('/')
        val parsed = URL(cleanBase)
        require(parsed.protocol == "http" || parsed.protocol == "https") { "La dirección debe comenzar con http:// o https://" }
        require(parsed.host.isNotBlank() && parsed.userInfo == null && parsed.query == null) { "La dirección del servidor no es válida" }
        return cleanBase
    }

    private fun post(url: String, body: JSONObject, token: String? = null): JSONObject {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val response = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(response) }.getOrElse { JSONObject() }
            if (status !in 200..299) throw IllegalStateException(json.optString("error").ifBlank { "Windows respondió con error HTTP $status" })
            return json
        } finally {
            connection.disconnect()
        }
    }

    private fun get(url: String, token: String): JSONObject {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.setRequestProperty("Authorization", "Bearer $token")
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val response = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(response) }.getOrElse { JSONObject() }
            if (status !in 200..299) throw IllegalStateException(json.optString("error").ifBlank { "Windows respondió con error HTTP $status" })
            return json
        } finally {
            connection.disconnect()
        }
    }
}
