package com.example

import android.app.Application
import com.example.data.local.HyhDatabase
import com.example.data.local.repository.HyhRepository
import com.example.system.ReminderScheduler
import com.example.system.SoundEffectsManager
import com.example.system.ThermalPrinterManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class HyhApplication : Application() {

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    lateinit var database: HyhDatabase
        private set

    lateinit var repository: HyhRepository
        private set

    lateinit var soundManager: SoundEffectsManager
        private set

    lateinit var printerManager: ThermalPrinterManager
        private set

    override fun onCreate() {
        super.onCreate()
        database = HyhDatabase.getInstance(this)
        soundManager = SoundEffectsManager()
        printerManager = ThermalPrinterManager(this)
        repository = HyhRepository(
            context = this,
            database = database,
        )
        ReminderScheduler.ensureNotificationChannel(this)
        appScope.launch {
            repository.ensureDefaultSettings()
        }
    }
}
