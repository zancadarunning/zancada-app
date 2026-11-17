// Huawei y otros telefonos sin servicios de Google: el plugin de ubicacion en segundo plano usaba solo el cliente "fused" de Google y no registraba el recorrido.
// El parche (mobile/patches/) usa el GPS del sistema (LocationManager) cuando faltan esos servicios. Estas pruebas cuidan que el parche siga ahi y conserve sus garantias.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const patchFile = path.join(root, 'mobile', 'patches', '@capacitor-community+background-geolocation+1.3.1.patch');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'mobile', 'package.json'), 'utf8'));

test('el parche del plugin de ubicacion existe y se reaplica solo con npm install (postinstall: patch-package)', () => {
  assert.ok(fs.existsSync(patchFile), 'falta mobile/patches/...background-geolocation...patch');
  assert.equal(pkg.scripts.postinstall, 'patch-package');
  assert.ok((pkg.devDependencies || {})['patch-package'] || (pkg.dependencies || {})['patch-package'], 'patch-package en package.json');
});

test('el parche usa LocationManager (GPS del sistema) solo cuando no hay servicios de Google, sin tocar el camino normal', () => {
  const p = fs.readFileSync(patchFile, 'utf8');
  assert.match(p, /GoogleApiAvailability[\s\S]*isGooglePlayServicesAvailable/, 'decide segun los servicios de Google');
  assert.match(p, /LocationManager\.GPS_PROVIDER/, 'usa el GPS del sistema');
  assert.match(p, /if \(useSystemLocation\(\)\)/, 'bifurca antes de crear el cliente de Google');
  assert.match(p, /startForeground\(NOTIFICATION_ID, backgroundNotification\)/, 'sigue con la notificacion en primer plano');
  assert.match(p, /removeUpdates\(watcher\.systemListener\)/, 'detiene el GPS del sistema al cerrar el seguimiento');
});

test('el atajo de prueba force_nogms solo funciona en builds de depuracion', () => {
  const p = fs.readFileSync(patchFile, 'utf8');
  assert.match(p, /FLAG_DEBUGGABLE\) != 0;\s*\n\+\s*if \(debuggable && new File\(getFilesDir\(\), "force_nogms"\)\.exists\(\)\) return true;/);
});
