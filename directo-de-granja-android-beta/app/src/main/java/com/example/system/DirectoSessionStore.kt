package com.example.system

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Stores the Windows API session encrypted with a per-install Android Keystore key. */
class DirectoSessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("directo_session", Context.MODE_PRIVATE)
    private val alias = "directo_session_aes_v1"

    fun serverUrl(): String = prefs.getString("server_url", "").orEmpty()
    fun deviceId(): String = prefs.getString("device_id", null) ?: java.util.UUID.randomUUID().toString().also {
        prefs.edit().putString("device_id", it).apply()
    }

    fun saveSession(serverUrl: String, token: String, userName: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        prefs.edit()
            .putString("server_url", serverUrl.trimEnd('/'))
            .putString("token_cipher", Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString("token_iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString("user_name", userName)
            .apply()
    }

    fun token(): String? = runCatching {
        val encrypted = Base64.decode(prefs.getString("token_cipher", null), Base64.NO_WRAP)
        val iv = Base64.decode(prefs.getString("token_iv", null), Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
        String(cipher.doFinal(encrypted), Charsets.UTF_8)
    }.getOrNull()

    fun userName(): String = prefs.getString("user_name", "").orEmpty()
    @Synchronized fun saveFolios(series: String, folios: List<Int>) {
        val existingSeries = prefs.getString("folio_series", null)
        val existing = if (existingSeries == series) prefs.getString("folio_numbers", "").orEmpty()
            .split(',').mapNotNull { it.toIntOrNull() } else emptyList()
        val combined = (existing + folios).distinct()
        prefs.edit().putString("folio_series", series).putString("folio_numbers", combined.joinToString(",")).apply()
    }
    @Synchronized fun consumeNextFolio(): Pair<String, Int>? {
        val series = prefs.getString("folio_series", null) ?: return null
        val numbers = prefs.getString("folio_numbers", "").orEmpty().split(',').mapNotNull { it.toIntOrNull() }
        val next = numbers.firstOrNull() ?: return null
        prefs.edit().putString("folio_numbers", numbers.drop(1).joinToString(",")).apply()
        return series to next
    }
    fun foliosRemaining(): Int = prefs.getString("folio_numbers", "").orEmpty().split(',').count { it.toIntOrNull() != null }
    fun lastSyncIso(): String = prefs.getString("last_sync_iso", "").orEmpty()
    fun saveLastSyncIso(iso: String) { prefs.edit().putString("last_sync_iso", iso).apply() }
    fun isDeviceAuthorized(): Boolean = prefs.getBoolean("device_authorized", false)
    fun saveDeviceAuthorized(authorized: Boolean) { prefs.edit().putBoolean("device_authorized", authorized).apply() }
    fun clear() {
        prefs.edit()
            .remove("token_cipher")
            .remove("token_iv")
            .remove("user_name")
            .remove("device_authorized")
            .remove("last_sync_iso")
            .apply()
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }
}
