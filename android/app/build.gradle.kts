plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// الشاشة نفسها (مجلد web/ في المستودع) تنسخ داخل التطبيق وقت البناء، فنفس الكود يشتغل في المتصفح وفي التلفزيون
val webAssets = layout.buildDirectory.dir("generated/webassets")
val copyWeb by tasks.registering(Copy::class) {
    from(rootProject.file("../web")) {
        exclude("**/*.map")
    }
    into(webAssets.map { it.dir("web") })
}

android {
    namespace = "app.riwaq.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.riwaq.tv"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    signingConfigs {
        // التوقيع للإصدارات: المفتاح يجي من أسرار GitHub Actions، ما ينحفظ في المستودع أبداً
        create("release") {
            val ks = System.getenv("RIWAQ_KEYSTORE")
            if (ks != null && file(ks).exists()) {
                storeFile = file(ks)
                storePassword = System.getenv("RIWAQ_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("RIWAQ_KEY_ALIAS")
                keyPassword = System.getenv("RIWAQ_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            val rel = signingConfigs.getByName("release")
            if (rel.storeFile != null) signingConfig = rel
        }
    }

    sourceSets["main"].assets.srcDir(webAssets)

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.google.zxing:core:3.5.3") // رسم الباركود (Apache-2.0)
}
