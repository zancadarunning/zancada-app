#!/usr/bin/env python3
"""Aplica al proyecto Android recién generado (`npx cap add android`) todo lo que las
guías de mobile/*-setup/ piden hacer a mano en Android Studio, para poder compilar un APK
de prueba en GitHub Actions sin tocar nada a mano:
  - Health Connect (mobile/healthconnect-setup/): .kt, manifest, dependencia, registro.
  - Calendario (mobile/calendar-setup/): permisos READ/WRITE_CALENDAR.
  - Tracking en segundo plano: strings del canal de notificación (mobile/README.md).
  - Kotlin en el módulo app (los .kt de Health Connect lo necesitan).
  - applicationIdSuffix ".test" + nombre "Zancada (prueba)": se instala AL LADO de la app
    de la tienda (firma distinta), sin tener que desinstalarla.
"""
import pathlib, re, shutil, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
AND = ROOT / 'mobile' / 'android'
APP = AND / 'app'
MAIN = APP / 'src' / 'main'
PKG_DIR = MAIN / 'java' / 'org' / 'zancada' / 'app'
HC = ROOT / 'mobile' / 'healthconnect-setup' / 'android'

def sub_once(text, pattern, repl, label):
    new, n = re.subn(pattern, repl, text, count=1, flags=re.S)
    if n != 1:
        sys.exit(f'patch-android: no encontré dónde aplicar "{label}"')
    return new

# --- Kotlin en el build ---
root_gradle = AND / 'build.gradle'
g = root_gradle.read_text()
if 'kotlin-gradle-plugin' not in g:
    g = sub_once(g, r"(classpath ['\"]com\.android\.tools\.build:gradle:[^'\"]+['\"])",
                 r"\1\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.20'", 'kotlin classpath')
    root_gradle.write_text(g)

app_gradle = APP / 'build.gradle'
g = app_gradle.read_text()
g = sub_once(g, r"(apply plugin: ['\"]com\.android\.application['\"])",
             r"\1\napply plugin: 'org.jetbrains.kotlin.android'", 'kotlin plugin')
g = sub_once(g, r"(applicationId\s+[\"'][^\"']+[\"'])", r'\1\n        applicationIdSuffix ".test"', 'applicationIdSuffix')
g = sub_once(g, r"(dependencies\s*\{)",
             r'\1\n    implementation "androidx.health.connect:connect-client:1.0.0-alpha11"\n'
             r'    implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1"\n'
             r'    implementation "androidx.lifecycle:lifecycle-runtime-ktx:2.8.7"', 'dependencies')
app_gradle.write_text(g)

# Health Connect (connect-client) pide minSdk 26 -- sin esto el merge del manifest falla.
variables = AND / 'variables.gradle'
v = variables.read_text()
v = sub_once(v, r'minSdkVersion = \d+', 'minSdkVersion = 26', 'minSdk')
variables.write_text(v)

# --- Health Connect: código nativo + registro ---
for f in ('HealthConnectBridgePlugin.kt', 'PermissionsRationaleActivity.kt'):
    shutil.copy(HC / f, PKG_DIR / f)
main_activity = PKG_DIR / 'MainActivity.java'
main_activity.write_text('''package org.zancada.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthConnectBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
''')

# --- Manifest ---
manifest = MAIN / 'AndroidManifest.xml'
m = manifest.read_text()
perms = '''
    <uses-permission android:name="android.permission.READ_CALENDAR" />
    <uses-permission android:name="android.permission.WRITE_CALENDAR" />
    <uses-permission android:name="android.permission.health.READ_EXERCISE" />
    <uses-permission android:name="android.permission.health.READ_DISTANCE" />
    <uses-permission android:name="android.permission.health.READ_HEART_RATE" />
    <queries>
        <package android:name="com.google.android.apps.healthdata" />
    </queries>
'''
m = sub_once(m, r'(</manifest>)', perms + r'\1', 'manifest permissions')
activities = '''
        <activity
            android:name=".PermissionsRationaleActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
            </intent-filter>
        </activity>
        <activity-alias
            android:name="ViewPermissionUsageActivity"
            android:exported="true"
            android:targetActivity=".PermissionsRationaleActivity"
            android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
            <intent-filter>
                <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
                <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
            </intent-filter>
        </activity-alias>
'''
m = sub_once(m, r'(</application>)', activities + r'    \1', 'application activities')
manifest.write_text(m)

# --- strings: nombre de prueba + canal de tracking en segundo plano ---
strings = MAIN / 'res' / 'values' / 'strings.xml'
s = strings.read_text()
s = re.sub(r'(<string name="app_name">)[^<]*(</string>)', r'\1Zancada (prueba)\2', s)
s = re.sub(r'(<string name="title_activity_main">)[^<]*(</string>)', r'\1Zancada (prueba)\2', s)
s = sub_once(s, r'(</resources>)',
             '    <string name="capacitor_background_geolocation_notification_channel_name">Seguimiento de carrera</string>\n'
             '    <string name="capacitor_background_geolocation_notification_color">#D6FF3F</string>\n' + r'\1',
             'strings')
strings.write_text(s)
print('patch-android: OK')
