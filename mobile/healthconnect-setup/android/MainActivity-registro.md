# Registrar el plugin en MainActivity

Mismo archivo que ya tocaste para el widget (`MainActivity.java` o `.kt`, según cómo
haya quedado tu proyecto) -- si ya registraste `WidgetBridgePlugin` ahí, solo agregá
una línea más al lado. Si es la primera vez que tocás este archivo, ver también
`widget-setup/android/MainActivity-registro.md` para el contexto completo.

**Java:**
```java
package org.zancada.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(HealthConnectBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

**Kotlin:**
```kotlin
package org.zancada.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(WidgetBridgePlugin::class.java)
        registerPlugin(HealthConnectBridgePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
```
