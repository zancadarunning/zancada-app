# Logo de Zancada en el avatar del correo (BIMI)

Estado: **preparado, falta el certificado**. Hoy los mails de Zancada (confirmación de cuenta, restablecer contraseña) muestran la letra "i" de `info@`. BIMI es el estándar para mostrar el logo en Gmail, Yahoo y Apple Mail.

## Lo que ya está hecho

- Logo en el formato que pide BIMI (SVG Tiny PS, cuadrado, 4 KB): `bimi/zancada.svg`, publicado en `https://www.zancada.org/bimi/zancada.svg`. Es el ícono de la app (fondo oscuro, la Z y la palabra ZANCADA en lima), con todo el contenido dentro del círculo en el que Gmail recorta el avatar.
- Autenticación del correo: DKIM de Resend (`resend._domainkey.zancada.org`) en su lugar.

## Lo que falta (en este orden)

### 1. Verificar que los correos pasan la autenticación
Abrí un mail de Zancada en Gmail → ⋮ → **Mostrar original**. Arriba tienen que decir `SPF: PASS`, `DKIM: PASS` y `DMARC: PASS`. Si alguno falla, no se sigue hasta arreglarlo.

### 2. Subir DMARC de "solo mirar" a "cuarentena"
Hoy el registro `_dmarc.zancada.org` es `v=DMARC1; p=none;` y BIMI exige `quarantine` o `reject`. Se hace en dos tiempos, en Cloudflare → DNS:

1. **Semanas 1 a 4 (monitoreo):** reemplazar el TXT `_dmarc` por
   `v=DMARC1; p=none; rua=mailto:info@zancada.org; fo=1;`
   y mirar los informes que llegan a ese correo: tienen que mostrar que todo lo que sale con `@zancada.org` pasa (Resend / Supabase). Un servicio gratuito como Postmark DMARC digests los vuelve legibles.
2. **Si no hay fallos legítimos:** `v=DMARC1; p=quarantine; pct=25; rua=mailto:info@zancada.org;` y subir `pct` a 50, 100 en las semanas siguientes. Después se puede pasar a `p=reject`.

### 3. Publicar el registro BIMI
TXT en `default._bimi.zancada.org`:

```
v=BIMI1; l=https://www.zancada.org/bimi/zancada.svg; a=https://www.zancada.org/bimi/zancada.pem;
```

(el `a=` con el certificado se agrega recién cuando exista). Se puede probar con la herramienta gratuita de https://bimigroup.org/bimi-generator/ ("BIMI Inspector").

### 4. El certificado (sin esto Gmail NO muestra el logo)
Gmail y Apple Mail solo muestran el logo si hay un certificado de marca firmado por una autoridad (DigiCert, Entrust, GlobalSign, SSL.com):

| Tipo | Requisito | Costo aproximado |
|---|---|---|
| **VMC** (Verified Mark Certificate) | Marca **registrada** con ese logo, en una oficina reconocida | USD 1.000 a 1.500 por año |
| **CMC** (Common Mark Certificate) | Sin marca registrada, pero el logo tiene que llevar un tiempo en uso público (hoy, alrededor de un año) | Más barato que el VMC |

Con Zancada sin inscribir todavía y sin marca registrada, este paso queda para cuando haya marca (INPI en Argentina y, si se publica en tiendas internacionales, registrar también en EE. UU. o la UE) o cuando el logo lleve un año en uso. Cuando se tenga el certificado (archivo `.pem`), se publica en `https://www.zancada.org/bimi/zancada.pem` y se completa el registro del punto 3.

## Mientras tanto

La alternativa gratis para Gmail: crear una cuenta de Google con la dirección `info@zancada.org` ("usar mi dirección de correo actual") y ponerle el logo como foto de perfil. Gmail la usa como avatar del remitente (solo en Gmail, y puede tardar un día).
