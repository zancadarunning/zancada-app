package org.zancada.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthConnectBridgePlugin.class);
        registerPlugin(ZancadaCalendarPlugin.class);
        registerPlugin(ZancadaRunNotificationPlugin.class);
        registerPlugin(ZancadaDisplayPlugin.class);
        registerPlugin(ZancadaCadencePlugin.class);
        registerPlugin(ZancadaMediaPlugin.class);
        registerPlugin(ZancadaAutofillPlugin.class);
        super.onCreate(savedInstanceState);
        // Sin esto, el WebView hereda el "Tamaño de letra" de Ajustes > Accesibilidad del
        // sistema Android (ej. 130% en un Moto E6 Plus real probado en este mismo repo) y
        // agranda TODO el texto de la app ese mismo porcentaje por encima del font-size real
        // del CSS -- ni siquiera un !important en línea lo pisa, porque no es un tema de
        // cascada CSS: es el "font boosting" nativo del WebView (WebSettings.textZoom),
        // completamente aparte de text-size-adjust. La tipografía de esta app ya está
        // ajustada a mano pantalla por pantalla (ver los @media (max-height) del splash,
        // por ejemplo) -- ese ajuste manual asume 100%, así que dejar pasar el textZoom del
        // sistema rompe ese trabajo de forma impredecible según qué tamaño de letra tenga
        // elegido cada usuario en su celular.
        // Ahora el tamaño del texto es una preferencia (Perfil > Preferencias > Tamaño del texto):
        // por defecto sigue al sistema con tope de 130%, o el que el usuario haya elegido.
        ZancadaDisplayPlugin.Companion.apply(this, getBridge().getWebView());
        // Barras del sistema con el último tema usado (así no arranca con barras oscuras si la app está en claro).
        ZancadaDisplayPlugin.Companion.applyBars(this, ZancadaDisplayPlugin.Companion.readBarsLight(this));
        getBridge().getWebView().requestApplyInsets();
    }
}
