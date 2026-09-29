# Registrar el plugin en MainActivity

`npx cap add android` genera `android/app/src/main/java/org/zancada/app/MainActivity.java`
(en Java, no Kotlin, en la plantilla estándar de Capacitor). Agregale el registro del
plugin así:

```java
package org.zancada.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

Si en tu proyecto `MainActivity` terminó siendo un archivo `.kt` (Kotlin) en vez de
`.java`, el equivalente es:

```kotlin
package org.zancada.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(WidgetBridgePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
```

Solo hace falta agregar la línea de `registerPlugin(...)` (y el import si hiciera
falta) -- no reemplaces el resto del archivo que ya esté ahí.
