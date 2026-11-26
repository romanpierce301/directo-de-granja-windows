import com.google.gms.googleservices.GoogleServicesPlugin.MissingGoogleServicesStrategy

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.google.devtools.ksp)
  alias(libs.plugins.secrets)
  alias(libs.plugins.google.services)
}

android {
  namespace = "com.example"
  compileSdk { version = release(36) { minorApiLevel = 1 } }

  defaultConfig {
    applicationId = "com.aistudio.hyhhuevos.qmzpkt"
    minSdk = 24
    targetSdk = 36
    versionCode = 3
    versionName = "1.2"

    // Branding base (H y H HUEVOS)
    buildConfigField("String", "BRAND_APP_NAME", "\"H y H HUEVOS\"")
    buildConfigField("String", "BRAND_SLOGAN", "\"LOS MAS FRESCOS DE LA ZONA\"")
    buildConfigField("String", "BRAND_PRIMARY", "\"#91D5AF\"")
    buildConfigField("String", "BRAND_PRIMARY_CONTAINER", "\"#76B995\"")
    buildConfigField("String", "BRAND_PRIMARY_GLOW", "\"#34D399\"")
    buildConfigField("String", "BRAND_FILE_PREFIX", "\"HYH\"")
    buildConfigField("String", "BRAND_TICKETS_FOLDER", "\"HYH_Huevos\"")
    buildConfigField("String", "BRAND_CLOSINGS_FOLDER", "\"HYH_Cierres\"")
    buildConfigField("String", "BRAND_BACKUPS_FOLDER", "\"HYH_Backups\"")

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }

  // Do not remove or modify these signingConfigs. They are necessary for building, installing,
  // and updating Android apps in AI Studio.
  signingConfigs {
    create("release") {
      val keystorePath = System.getenv("KEYSTORE_PATH") ?: "${rootDir}/my-upload-key.jks"
      storeFile = file(keystorePath)
      storePassword = System.getenv("STORE_PASSWORD")
      keyAlias = "upload"
      keyPassword = System.getenv("KEY_PASSWORD")
    }
    create("debugConfig") {
      storeFile = file("${rootDir}/debug.keystore")
      storePassword = "android"
      keyAlias = "androiddebugkey"
      keyPassword = "android"
    }
  }

  buildTypes {
    release {
      isCrunchPngs = false
      isMinifyEnabled = false
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      // Do not remove or modify this signingConfig assignment. It is necessary for Android apps in
      // AI Studio.
      signingConfig = signingConfigs.getByName("release")
    }
    debug {
      // Do not remove or modify this signingConfig assignment. It is necessary for Android apps in
      // AI Studio.
      signingConfig = signingConfigs.getByName("debugConfig")
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
  }
  buildFeatures {
    compose = true
    buildConfig = true
  }
  testOptions { unitTests { isIncludeAndroidResources = true } }

  flavorDimensions += "brand"
  productFlavors {
    create("hyhhuevos") {
      // Marca base (H y H HUEVOS). Usa el applicationId y recursos de main.
    }
    create("lili") {
      // Variante: Distribuidora de Huevos LILI
      applicationId = "com.aistudio.hyhhuevos.lili"
      versionCode = 4
      versionName = "1.3"
      buildConfigField("String", "BRAND_APP_NAME", "\"Distribuidora de Huevos LILI\"")
      buildConfigField("String", "BRAND_SLOGAN", "\"Tenemos los huevos que te hacen falta\"")
      buildConfigField("String", "BRAND_PRIMARY", "\"#91D5AF\"")
      buildConfigField("String", "BRAND_PRIMARY_CONTAINER", "\"#76B995\"")
      buildConfigField("String", "BRAND_PRIMARY_GLOW", "\"#34D399\"")
      buildConfigField("String", "BRAND_FILE_PREFIX", "\"LILI\"")
      buildConfigField("String", "BRAND_TICKETS_FOLDER", "\"LILI_Tickets\"")
      buildConfigField("String", "BRAND_CLOSINGS_FOLDER", "\"LILI_Cierres\"")
      buildConfigField("String", "BRAND_BACKUPS_FOLDER", "\"LILI_Backups\"")
    }
    create("directodegranja") {
      // Variante Directo de Granja: comparte el código y Room local con las otras marcas.
      applicationId = "com.aistudio.directodegranja"
      versionCode = 1
      versionName = "1.0"
      buildConfigField("String", "BRAND_APP_NAME", "\"Directo de Granja\"")
      buildConfigField("String", "BRAND_SLOGAN", "\"Te faltan huevos a nosotros nos sobran\"")
      buildConfigField("String", "BRAND_PRIMARY", "\"#8A2BE2\"")
      buildConfigField("String", "BRAND_PRIMARY_CONTAINER", "\"#1F0E3B\"")
      buildConfigField("String", "BRAND_PRIMARY_GLOW", "\"#C084FC\"")
      buildConfigField("String", "BRAND_FILE_PREFIX", "\"DIRECTO\"")
      buildConfigField("String", "BRAND_TICKETS_FOLDER", "\"Directo_de_Granja\"")
      buildConfigField("String", "BRAND_CLOSINGS_FOLDER", "\"Directo_de_Granja_Cierres\"")
      buildConfigField("String", "BRAND_BACKUPS_FOLDER", "\"Directo_de_Granja_Respaldos\"")
    }
  }
  dependenciesInfo {
    includeInApk = false
    includeInBundle = true
  }
}

// Configure the Secrets Gradle Plugin to use .env and .env.example files
// to match the convention used in Web projects.
secrets {
  propertiesFileName = ".env"
  defaultPropertiesFileName = ".env.example"
  ignoreList.add("FIREBASE_APPCHECK_DEBUG_TOKEN")
}

googleServices { missingGoogleServicesStrategy = MissingGoogleServicesStrategy.WARN }

// Some unused dependencies are commented out below instead of being removed.
// This makes it easy to add them back in the future if needed.
dependencies {
  implementation(platform(libs.androidx.compose.bom))
  // implementation(platform(libs.firebase.bom))
  // implementation(libs.accompanist.permissions)
  implementation(libs.androidx.activity.compose)
  // implementation(libs.androidx.camera.camera2)
  // implementation(libs.androidx.camera.core)
  // implementation(libs.androidx.camera.lifecycle)
  // implementation(libs.androidx.camera.view)
  implementation(libs.androidx.compose.material.icons.core)
  implementation(libs.androidx.compose.material.icons.extended)
  implementation(libs.androidx.compose.material3)
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.graphics)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.core.ktx)
  // implementation(libs.androidx.datastore.preferences)
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.lifecycle.viewmodel.compose)
  implementation(libs.androidx.navigation.compose)
  implementation(libs.androidx.room.ktx)
  implementation(libs.androidx.room.runtime)
  // implementation(libs.coil.compose)
  // implementation(libs.converter.moshi)
  // implementation(libs.firebase.ai)
  // implementation(libs.firebase.firestore)
  // implementation(libs.firebase.auth)
  // implementation(libs.androidx.credentials)
  // implementation(libs.androidx.credentials.play.services)
  // implementation(libs.googleid)
  // implementation(libs.firebase.appcheck.recaptcha)
  // implementation(libs.firebase.appcheck.debug)
  implementation(libs.kotlinx.coroutines.android)
  implementation(libs.kotlinx.coroutines.core)
  // implementation(libs.logging.interceptor)
  // implementation(libs.moshi.kotlin)
  implementation(libs.okhttp)
  // implementation(libs.play.services.location)
  // implementation(libs.retrofit)
  testImplementation(libs.androidx.compose.ui.test.junit4)
  testImplementation(libs.androidx.core)
  testImplementation(libs.androidx.junit)
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)
  testImplementation(libs.robolectric)
  androidTestImplementation(platform(libs.androidx.compose.bom))
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  androidTestImplementation(libs.androidx.espresso.core)
  androidTestImplementation(libs.androidx.junit)
  androidTestImplementation(libs.androidx.runner)
  debugImplementation(libs.androidx.compose.ui.test.manifest)
  debugImplementation(libs.androidx.compose.ui.tooling)
  "ksp"(libs.androidx.room.compiler)
  // "ksp"(libs.moshi.kotlin.codegen)
}
