package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.ui.navigation.HyhAppRoot
import com.example.ui.theme.HyhHuevosTheme
import com.example.ui.viewmodel.HyhViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            HyhHuevosTheme {
                val vm: HyhViewModel = viewModel()
                HyhAppRoot(viewModel = vm)
            }
        }
    }
}
