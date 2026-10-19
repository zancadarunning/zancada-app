# Flujo de trabajo

`main` está protegido (ruleset `proteger-main`, ver `.github/rulesets/proteger-main.json`): los cambios entran por pull request y con el check `test` en verde.

1. Se trabaja en una rama (`fix/...`, `feat/...`, `docs/...`) y se sube a GitHub.
2. El CI (`.github/workflows/ci.yml`) corre la sintaxis de `app.js` y las pruebas.
3. Se abre el pull request. Vercel arma una vista previa con la URL del cambio.
4. Con el check en verde se hace *Merge*; Vercel despliega a producción al entrar a `main`.

El administrador del repositorio puede saltarse la regla en una emergencia (por ejemplo, si el CI está caído).

Una vez por semana el CI también revisa vulnerabilidades graves en las dependencias del servidor.
