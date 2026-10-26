// ZancadaMediaPlugin.kt
//
// Plugin LOCAL de Capacitor (mismo esquema que ZancadaDisplayPlugin.kt). Guarda un video en la galería del teléfono
// (carpeta Movies/Zancada), para el botón "Descargar" del video del recorrido. El Filesystem de Capacitor solo escribe en
// carpetas privadas de la app, que la galería no ve.
//   Android 10+  -> MediaStore (no pide ningún permiso)
//   Android 9 o menos -> carpeta pública Movies/Zancada, que sí pide el permiso de almacenamiento (se pide al guardar)

package org.zancada.app

import android.Manifest
import android.content.ContentValues
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.File
import java.io.FileOutputStream

@CapacitorPlugin(
    name = "ZancadaMedia",
    permissions = [Permission(strings = [Manifest.permission.WRITE_EXTERNAL_STORAGE], alias = "storage")]
)
class ZancadaMediaPlugin : Plugin() {

    @PluginMethod
    fun saveVideo(call: PluginCall) {
        if (call.getString("data").isNullOrEmpty()) { call.reject("sin datos"); return }
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storageResult")
            return
        }
        write(call)
    }

    // Imagen (plantilla para compartir): misma ruta que el video, pero a la galería de fotos (Pictures/Zancada)
    @PluginMethod
    fun saveImage(call: PluginCall) {
        call.data.put("image", true)
        saveVideo(call)
    }

    @PermissionCallback
    private fun storageResult(call: PluginCall) {
        if (getPermissionState("storage") == PermissionState.GRANTED) write(call)
        else call.reject("permiso denegado")
    }

    private fun write(call: PluginCall) {
        try {
            val bytes = Base64.decode(call.getString("data"), Base64.DEFAULT)
            val isImage = call.getBoolean("image", false) == true
            val name = call.getString("name", if (isImage) "zancada.png" else "zancada.webm") ?: (if (isImage) "zancada.png" else "zancada.webm")
            val mime = call.getString("mime", if (isImage) "image/png" else "video/webm") ?: (if (isImage) "image/png" else "video/webm")
            val publicDir = if (isImage) Environment.DIRECTORY_PICTURES else Environment.DIRECTORY_MOVIES
            val collection = if (isImage) MediaStore.Images.Media.EXTERNAL_CONTENT_URI else MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, publicDir + "/Zancada")
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val resolver = context.contentResolver
                val uri = resolver.insert(collection, values)
                    ?: throw IllegalStateException("no se pudo crear el archivo")
                resolver.openOutputStream(uri)?.use { it.write(bytes) }
                    ?: throw IllegalStateException("no se pudo abrir el archivo")
                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                call.resolve(JSObject().put("uri", uri.toString()))
            } else {
                val dir = File(Environment.getExternalStoragePublicDirectory(publicDir), "Zancada")
                if (!dir.exists() && !dir.mkdirs()) throw IllegalStateException("no se pudo crear la carpeta")
                val file = File(dir, File(name).name.ifBlank { "zancada" })   // solo el nombre: sin rutas (../) que salgan de la carpeta
                FileOutputStream(file).use { it.write(bytes) }
                MediaScannerConnection.scanFile(context, arrayOf(file.absolutePath), arrayOf(mime), null)
                call.resolve(JSObject().put("uri", file.absolutePath))
            }
        } catch (e: Exception) {
            call.reject(e.message ?: "error al guardar")
        }
    }
}
