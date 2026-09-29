// WidgetBridgePlugin.swift
//
// Plugin LOCAL de Capacitor (vive directo en el target de la app "App", no es un
// paquete de npm instalado aparte). Le permite a app.js guardar un resumen chiquito
// de la sesión de HOY en un UserDefaults COMPARTIDO (App Group) que el widget
// (ZancadaWidget.swift, un target completamente aparte, sin WebView) puede leer.
//
// DÓNDE VA: agregá este archivo al target principal de la app ("App") en Xcode
// (clic derecho en la carpeta App > Add Files...). Ver INSTRUCCIONES.md para el
// resto de los pasos (App Groups, MainViewController, etc.).

import Foundation
import Capacitor
import WidgetKit

@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise)
    ]

    // Tiene que ser EXACTAMENTE el mismo ID que configures en la capability
    // "App Groups" de LOS DOS targets (la app "App" y la extensión "ZancadaWidget")
    // -- ver también la constante igual en ZancadaWidget.swift.
    let appGroupId = "group.org.zancada.app"
    let dataKey = "zancada_widget_data"

    @objc func save(_ call: CAPPluginCall) {
        let payload: [String: Any] = [
            "type": call.getString("type") ?? "",
            "amount": call.getString("amount") ?? "",
            "zone": call.getString("zone") ?? "",
            "dateISO": call.getString("dateISO") ?? ""
        ]

        guard let defaults = UserDefaults(suiteName: appGroupId) else {
            call.reject("No existe el App Group '\(appGroupId)' -- revisá la capability App Groups en los dos targets.")
            return
        }
        guard let json = try? JSONSerialization.data(withJSONObject: payload),
              let jsonString = String(data: json, encoding: .utf8) else {
            call.reject("No se pudo armar el JSON para el widget")
            return
        }
        defaults.set(jsonString, forKey: dataKey)

        // Le pedimos al sistema que refresque el widget lo antes posible -- iOS igual
        // decide cuándo hacerlo de verdad según su propio presupuesto de batería, no
        // es instantáneo garantizado, pero suele ser rápido en primer plano.
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }
}
