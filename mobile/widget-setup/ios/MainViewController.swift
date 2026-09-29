// MainViewController.swift
//
// Reemplaza al CAPBridgeViewController genérico que usa Capacitor por defecto, para
// poder registrar plugins LOCALES (los que viven en este mismo proyecto, como
// WidgetBridgePlugin, en vez de venir de un paquete de npm instalado). En Capacitor
// (a partir de la versión 7/8) esta es la forma de registrar un plugin local, sin
// necesitar un archivo .m ni la macro CAP_PLUGIN de versiones viejas.
//
// DÓNDE VA:
// 1. Agregá este archivo al target "App" en Xcode.
// 2. Abrí Main.storyboard, seleccioná el View Controller principal (el único que
//    hay), andá al Identity Inspector (el ícono de la tarjetita) y cambiá
//    "Custom Class" de "CAPBridgeViewController" a "MainViewController".

import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }
}
