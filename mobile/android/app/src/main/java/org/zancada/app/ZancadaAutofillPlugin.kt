// ZancadaAutofillPlugin.kt
//
// Plugin LOCAL de Capacitor (mismo esquema que ZancadaDisplayPlugin.kt): guardar y recuperar la contraseña con el gestor de contraseñas del sistema
// (Google Password Manager) mediante Credential Manager, la API oficial de Android para esto.
//
// Por qué no alcanza el autocompletar normal del WebView: la app se muestra bajo una dirección interna (https://localhost) y el gestor de Google no
// ofrece guardar contraseñas para esa dirección, aunque el formulario sea correcto. Credential Manager guarda la credencial para la APP, sin
// depender de la dirección de la página.
//
//   savePassword({ id, password }) -> el sistema muestra "¿Guardar contraseña?"; resuelve { saved: true|false }
//   getPassword()                  -> el sistema muestra las contraseñas guardadas para elegir; resuelve { id, password } o {} si no hay / cancela
//   commit()                       -> compatibilidad con el autocompletar clásico (AutofillManager.commit)
//
// La contraseña solo pasa por acá en el momento en que la persona la entrega o la elige en la hoja del sistema; no se guarda en ningún archivo
// de la app ni se escribe en los registros.

package org.zancada.app

import android.os.Build
import android.view.autofill.AutofillManager
import androidx.core.content.ContextCompat
import androidx.credentials.CreatePasswordRequest
import androidx.credentials.CreateCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetPasswordOption
import androidx.credentials.PasswordCredential
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialException
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "ZancadaAutofill")
class ZancadaAutofillPlugin : Plugin() {

    @PluginMethod
    fun savePassword(call: PluginCall) {
        val id = call.getString("id")
        val password = call.getString("password")
        if (id.isNullOrEmpty() || password.isNullOrEmpty()) { call.reject("faltan datos"); return }
        activity.runOnUiThread {
            try {
                val manager = CredentialManager.create(activity)
                manager.createCredentialAsync(
                    activity,
                    CreatePasswordRequest(id, password),
                    null,
                    ContextCompat.getMainExecutor(activity),
                    object : CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException> {
                        override fun onResult(result: CreateCredentialResponse) {
                            call.resolve(JSObject().put("saved", true))
                        }
                        override fun onError(e: CreateCredentialException) {
                            // la persona dijo "ahora no", o no hay gestor disponible: no es un error de la app
                            call.resolve(JSObject().put("saved", false).put("reason", e.type))
                        }
                    }
                )
            } catch (e: Exception) {
                call.resolve(JSObject().put("saved", false).put("reason", "unavailable"))
            }
        }
    }

    @PluginMethod
    fun getPassword(call: PluginCall) {
        activity.runOnUiThread {
            try {
                val manager = CredentialManager.create(activity)
                manager.getCredentialAsync(
                    activity,
                    GetCredentialRequest(listOf(GetPasswordOption())),
                    null,
                    ContextCompat.getMainExecutor(activity),
                    object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                        override fun onResult(result: GetCredentialResponse) {
                            val credential = result.credential
                            if (credential is PasswordCredential) {
                                call.resolve(JSObject().put("id", credential.id).put("password", credential.password))
                            } else {
                                call.resolve(JSObject())
                            }
                        }
                        override fun onError(e: GetCredentialException) {
                            call.resolve(JSObject())
                        }
                    }
                )
            } catch (e: Exception) {
                call.resolve(JSObject())
            }
        }
    }

    @PluginMethod
    fun commit(call: PluginCall) {
        activity.runOnUiThread {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    activity.getSystemService(AutofillManager::class.java)?.commit()
                }
            } catch (e: Exception) {
                // sin autocompletar disponible: no pasa nada
            }
            call.resolve()
        }
    }
}
