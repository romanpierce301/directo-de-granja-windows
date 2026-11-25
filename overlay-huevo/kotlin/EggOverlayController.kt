package com.example.directogranja.desktop.ui.overlay // TODO: ajusta al paquete real

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Controla cuándo se muestra el overlay.
 *
 * Reglas (las de la sección de diseño):
 *  - solo aparece si la operación tarda más de [showAfterMs] (0.3 s), para que no parpadee;
 *  - una vez visible, se queda mínimo [minShowMs] (0.6 s);
 *  - al terminar bien muestra el éxito [successMs] (1.5 s) y se cierra solo;
 *  - si falla, muestra el error y espera: Reintentar vuelve a ejecutar, Cancelar devuelve null.
 *
 * Uso:
 *   val egg = remember { EggOverlayController() }
 *   EggOverlayHost(egg) { PantallaPrincipal() }
 *
 *   // en cualquier corrutina de la interfaz:
 *   scope.launch { egg.run { api.guardarEntradaCamion(datos) } }
 */
class EggOverlayController {
    var state by mutableStateOf<EggOverlayState?>(null)
        private set
    private var pending: CompletableDeferred<Boolean>? = null

    fun retry() { pending?.complete(true) }
    fun cancel() { pending?.complete(false) }

    suspend fun <T> run(
        showAfterMs: Long = 300,
        minShowMs: Long = 600,
        successMs: Long = 1500,
        block: suspend () -> T
    ): T? {
        while (true) {
            state = null
            var shownAt = 0L
            try {
                val result = coroutineScope {
                    val shower = launch {
                        delay(showAfterMs)
                        shownAt = System.currentTimeMillis()
                        state = EggOverlayState.LOADING
                    }
                    try { block() } finally { shower.cancel() }
                }
                if (state == EggOverlayState.LOADING) {
                    val left = minShowMs - (System.currentTimeMillis() - shownAt)
                    if (left > 0) delay(left)
                    state = EggOverlayState.SUCCESS
                    delay(successMs)
                }
                state = null
                return result
            } catch (e: CancellationException) {
                state = null
                throw e
            } catch (e: Exception) {
                state = EggOverlayState.ERROR
                val choice = CompletableDeferred<Boolean>().also { pending = it }
                val again = choice.await()
                pending = null
                if (!again) { state = null; return null }
            }
        }
    }
}

/** Pone el overlay encima de tu pantalla. */
@Composable
fun EggOverlayHost(controller: EggOverlayController, content: @Composable () -> Unit) {
    Box {
        content()
        controller.state?.let {
            EggOverlay(it, onRetry = controller::retry, onCancel = controller::cancel)
        }
    }
}
