// ZancadaWidget.swift
//
// Extensión de Widget (WidgetKit). Vive en un target NUEVO llamado "ZancadaWidget"
// que se crea desde Xcode: File > New > Target... > Widget Extension. Xcode va a
// generar un archivo de ejemplo con contenido de relleno (a veces llamado
// "ZancadaWidget.swift" directamente, a veces con otro nombre) -- borrá TODO su
// contenido y pegá este archivo entero en su lugar.
//
// Este widget NO corre el JS de la app (no puede: es un proceso completamente
// aparte, sin WebView). Solo lee un JSON chiquito que la app principal guarda en un
// UserDefaults COMPARTIDO (App Group) cada vez que se abre Inicio -- ver
// WidgetBridgePlugin.swift, que es la parte que escribe ese dato desde la app, y
// updateHomeWidget() en app.js, que es quien lo dispara.

import WidgetKit
import SwiftUI

// Tiene que ser EXACTAMENTE el mismo ID configurado en la capability "App Groups"
// de LOS DOS targets (la app "App" y esta extensión "ZancadaWidget").
private let zancadaAppGroupId = "group.org.zancada.app"
private let zancadaWidgetDataKey = "zancada_widget_data"

// Colores tomados a mano de la paleta oscura de Zancada (variables --ink y --hivis
// en index.html) -- el widget no puede leer el CSS de la app, así que quedan
// hardcodeados acá.
private let zancadaInk = Color(red: 0.071, green: 0.078, blue: 0.082)
private let zancadaHivis = Color(red: 0.839, green: 1.0, blue: 0.247)

struct ZancadaSessionData: Codable {
    var type: String
    var amount: String
    var zone: String
    var dateISO: String
}

func loadZancadaSessionData() -> ZancadaSessionData? {
    guard let defaults = UserDefaults(suiteName: zancadaAppGroupId),
          let raw = defaults.string(forKey: zancadaWidgetDataKey),
          let data = raw.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(ZancadaSessionData.self, from: data)
}

struct ZancadaEntry: TimelineEntry {
    let date: Date
    let session: ZancadaSessionData?
}

struct ZancadaProvider: TimelineProvider {
    func placeholder(in context: Context) -> ZancadaEntry {
        ZancadaEntry(date: Date(), session: ZancadaSessionData(type: "Rodaje suave", amount: "8 km", zone: "2", dateISO: ""))
    }
    func getSnapshot(in context: Context, completion: @escaping (ZancadaEntry) -> Void) {
        completion(ZancadaEntry(date: Date(), session: loadZancadaSessionData()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ZancadaEntry>) -> Void) {
        let entry = ZancadaEntry(date: Date(), session: loadZancadaSessionData())
        // Respaldo: se vuelve a pedir un timeline nuevo en 1 hora por si el corredor
        // no abre la app -- la actualización "de verdad" pasa apenas abre Inicio,
        // vía WidgetCenter.shared.reloadAllTimelines() en WidgetBridgePlugin.swift.
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct ZancadaWidgetView: View {
    var entry: ZancadaProvider.Entry

    private var isStale: Bool {
        guard let iso = entry.session?.dateISO, !iso.isEmpty else { return true }
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        guard let d = df.date(from: iso) else { return true }
        // Si hace más de 3 días que la app no actualiza este dato, mejor mostrar el
        // estado vacío en vez de una sesión posiblemente vieja/incorrecta.
        return Date().timeIntervalSince(d) > 3 * 24 * 3600
    }

    var body: some View {
        Group {
            if let s = entry.session, !isStale, !s.type.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("HOY")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(zancadaHivis)
                    Text(s.type)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(2)
                    if !s.amount.isEmpty {
                        Text(s.amount)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.white.opacity(0.75))
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            } else {
                VStack(spacing: 6) {
                    Text("Zancada")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                    Text("Abrí la app para ver tu sesión de hoy")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.6))
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .padding()
        .containerBackground(for: .widget) {
            zancadaInk
        }
    }
}

struct ZancadaWidget: Widget {
    let kind: String = "ZancadaWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ZancadaProvider()) { entry in
            ZancadaWidgetView(entry: entry)
        }
        .configurationDisplayName("Próxima sesión")
        .description("Tu entrenamiento de hoy, según el plan de Zancada.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct ZancadaWidgetBundle: WidgetBundle {
    var body: some Widget {
        ZancadaWidget()
    }
}
