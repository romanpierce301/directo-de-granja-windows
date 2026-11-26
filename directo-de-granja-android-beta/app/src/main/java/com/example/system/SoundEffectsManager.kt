package com.example.system

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

class SoundEffectsManager {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun playNotificationSound() {
        playSequence(
            listOf(
                ToneStep(freqHz = 880.0, durationMs = 110, pauseMs = 35),
                ToneStep(freqHz = 1174.66, durationMs = 170, pauseMs = 0),
            ),
        )
    }

    fun playPaymentSuccessSound() {
        playSequence(
            listOf(
                ToneStep(freqHz = 1046.50, durationMs = 85, pauseMs = 20),
                ToneStep(freqHz = 1318.51, durationMs = 85, pauseMs = 20),
                ToneStep(freqHz = 1567.98, durationMs = 190, pauseMs = 0),
            ),
        )
    }

    fun playCancellationSound() {
        playSequence(
            listOf(
                ToneStep(freqHz = 493.88, durationMs = 150, pauseMs = 40),
                ToneStep(freqHz = 329.63, durationMs = 240, pauseMs = 0),
            ),
        )
    }

    private data class ToneStep(val freqHz: Double, val durationMs: Int, val pauseMs: Int)

    private fun playSequence(steps: List<ToneStep>) {
        scope.launch {
            try {
                val sampleRate = 22050
                val samplesList = ArrayList<Short>()
                for (step in steps) {
                    val numSamples = (sampleRate * step.durationMs) / 1000
                    for (i in 0 until numSamples) {
                        val t = i.toDouble() / sampleRate
                        val attack = if (i < 180) i / 180.0 else 1.0
                        val decay = exp(-4.5 * i / numSamples)
                        val wave = sin(2.0 * PI * step.freqHz * t) * 0.65 +
                            sin(4.0 * PI * step.freqHz * t) * 0.15
                        val sample = (wave * attack * decay * Short.MAX_VALUE * 0.55)
                            .toInt()
                            .coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                            .toShort()
                        samplesList.add(sample)
                    }
                    val pauseSamples = (sampleRate * step.pauseMs) / 1000
                    repeat(pauseSamples) { samplesList.add(0) }
                }

                val pcm = samplesList.toShortArray()
                val bufferBytes = pcm.size * 2
                val track = AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build(),
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(sampleRate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build(),
                    )
                    .setBufferSizeInBytes(bufferBytes)
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .build()

                track.write(pcm, 0, pcm.size)
                track.play()
                val totalDuration = steps.sumOf { it.durationMs + it.pauseMs } + 120L
                kotlinx.coroutines.delay(totalDuration)
                track.stop()
                track.release()
            } catch (_: Throwable) {
                // Ignorar de forma segura si el hardware de audio no está disponible en pruebas
            }
        }
    }
}
