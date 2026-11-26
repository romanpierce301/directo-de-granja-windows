package com.example.system

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.example.MainActivity
import com.example.R
import com.example.data.local.HyhDatabase
import com.example.data.local.entity.ReminderEntity
import com.example.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.Calendar

object ReminderScheduler {
    const val CHANNEL_ID = "hyh_reminders_channel"
    private const val EXTRA_REMINDER_ID = "extra_reminder_id"
    private const val EXTRA_CLIENT_NAME = "extra_client_name"
    private const val EXTRA_MESSAGE = "extra_message"

    fun ensureNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Recordatorios de Entrega",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Alertas locales la noche anterior y el día de la entrega"
            }
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            nm?.createNotificationChannel(channel)
        }
    }

    fun scheduleReminderAlarms(context: Context, reminder: ReminderEntity) {
        if (reminder.isCompleted) {
            cancelReminderAlarms(context, reminder.id)
            return
        }
        ensureNotificationChannel(context)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return

        // 1. Noche anterior a las 20:00
        val nightBeforeCal = Calendar.getInstance().apply {
            timeInMillis = reminder.deliveryDateMillis
            add(Calendar.DAY_OF_YEAR, -1)
            set(Calendar.HOUR_OF_DAY, 20)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (nightBeforeCal.timeInMillis > System.currentTimeMillis()) {
            scheduleOneAlarm(
                context = context,
                alarmManager = alarmManager,
                requestCode = (reminder.id * 10 + 1).toInt(),
                triggerAtMillis = nightBeforeCal.timeInMillis,
                reminder = reminder,
                titlePrefix = "Entrega mañana",
            )
        }

        // 2. Día de la entrega a las 07:00
        val dayOfCal = Calendar.getInstance().apply {
            timeInMillis = reminder.deliveryDateMillis
            set(Calendar.HOUR_OF_DAY, 7)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (dayOfCal.timeInMillis > System.currentTimeMillis()) {
            scheduleOneAlarm(
                context = context,
                alarmManager = alarmManager,
                requestCode = (reminder.id * 10 + 2).toInt(),
                triggerAtMillis = dayOfCal.timeInMillis,
                reminder = reminder,
                titlePrefix = "Entrega hoy",
            )
        }
    }

    private fun scheduleOneAlarm(
        context: Context,
        alarmManager: AlarmManager,
        requestCode: Int,
        triggerAtMillis: Long,
        reminder: ReminderEntity,
        titlePrefix: String,
    ) {
        val intent = Intent(context, ReminderReceiver::class.java).apply {
            putExtra(EXTRA_REMINDER_ID, reminder.id)
            putExtra(EXTRA_CLIENT_NAME, "$titlePrefix: ${reminder.clientName}")
            val details = listOf(reminder.boxesNote, reminder.note)
                .filter { it.isNotBlank() }
                .joinToString(" • ")
                .ifBlank { "Recordatorio de entrega especial ${BuildConfig.BRAND_APP_NAME}" }
            putExtra(EXTRA_MESSAGE, details)
        }
        val pi = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi)
            } else {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi)
            }
        } catch (_: SecurityException) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi)
        }
    }

    fun cancelReminderAlarms(context: Context, reminderId: Long) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        listOf(1, 2).forEach { suffix ->
            val intent = Intent(context, ReminderReceiver::class.java)
            val pi = PendingIntent.getBroadcast(
                context,
                (reminderId * 10 + suffix).toInt(),
                intent,
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
            )
            if (pi != null) {
                alarmManager.cancel(pi)
            }
        }
    }

    fun showNotificationNow(context: Context, reminderId: Long, title: String, message: String) {
        ensureNotificationChannel(context)
        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(
            context,
            reminderId.toInt(),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        try {
            nm?.notify(reminderId.toInt(), notification)
        } catch (_: SecurityException) {
            // Permiso de notificaciones revocado por el usuario
        }
        SoundEffectsManager().playNotificationSound()
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getLongExtra("extra_reminder_id", 1L)
        val title = intent.getStringExtra("extra_client_name") ?: "Recordatorio ${BuildConfig.BRAND_APP_NAME}"
        val message = intent.getStringExtra("extra_message") ?: "Tienes una entrega programada."
        ReminderScheduler.showNotificationNow(context, id, title, message)
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val dao = HyhDatabase.getInstance(context).hyhDao()
                val pending = dao.getPendingRemindersOnce()
                pending.forEach { reminder ->
                    ReminderScheduler.scheduleReminderAlarms(context, reminder)
                }
            } finally {
                pendingResult.finish()
            }
        }
    }
}
