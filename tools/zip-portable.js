// Empaqueta el build de Electron en un ZIP listo para enviar al cliente.
// Incluye el manual de usuario al lado para que esté visible al descomprimir.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkg = require('../package.json');
const BUILD = path.join(__dirname, '..', 'dist', 'GestorPro-win32-x64');
const STAGING = path.join(__dirname, '..', 'dist', `GestorPro-v${pkg.version}`);
const OUT = path.join(__dirname, '..', 'dist', `GestorPro-v${pkg.version}-win64.zip`);
const MANUAL = path.join(__dirname, '..', 'MANUAL-USUARIO.md');

if (!fs.existsSync(BUILD)) {
  console.error(`❌ No existe el build: ${BUILD}\n   Ejecuta primero: npm run package`);
  process.exit(1);
}

console.log(`📦 Preparando entregable: ${STAGING}`);

// Limpia staging anterior
if (fs.existsSync(STAGING)) fs.rmSync(STAGING, { recursive: true, force: true });
fs.mkdirSync(STAGING, { recursive: true });

// Copia el build dentro de la carpeta staging
const dest = path.join(STAGING, 'GestorPro');
fs.cpSync(BUILD, dest, { recursive: true });
console.log('   ✓ App copiada a', dest);

// Copia manual junto al .exe (queda visible al descomprimir)
if (fs.existsSync(MANUAL)) {
  fs.copyFileSync(MANUAL, path.join(STAGING, 'MANUAL-USUARIO.md'));
  console.log('   ✓ Manual incluido');
}

// README breve para el cliente
const README_TXT = `GestorPro v${pkg.version}
===========================

INSTALACIÓN
-----------
1. Mete la carpeta entera donde quieras (Escritorio, USB, etc.).
2. Abre la carpeta "GestorPro".
3. Doble click en "GestorPro.exe".
4. La primera vez te pedirá crear el usuario administrador.

DATOS
-----
- Se guardan en "GestorPro\\gestorpro.db" junto al .exe.
- Backups automáticos diarios en "GestorPro\\data\\backups\\".
- Para más detalles consulta MANUAL-USUARIO.md

REQUISITOS
----------
- Windows 10/11 (64 bits).
- No requiere instalación previa.
- Sin internet excepto para el Asistente IA opcional.

SOPORTE
-------
rglabs.es@gmail.com · https://rglabs.es

(c) 2026 RG Labs · Tarragona
`;
fs.writeFileSync(path.join(STAGING, 'LEEME.txt'), README_TXT, 'utf8');
console.log('   ✓ LEEME.txt creado');

// Comprime el staging en un ZIP
console.log(`📦 Comprimiendo → ${OUT}`);
try {
  fs.rmSync(OUT, { force: true });
  const cmd = `powershell -NoProfile -Command "Compress-Archive -Path '${STAGING}\\*' -DestinationPath '${OUT}' -CompressionLevel Optimal -Force"`;
  execSync(cmd, { stdio: 'inherit' });
  const stat = fs.statSync(OUT);
  const mb = (stat.size / (1024 * 1024)).toFixed(1);
  console.log(`✅ Listo: ${OUT} (${mb} MB)`);
  console.log(`   Esta carpeta es la que envías al cliente.`);
} catch (err) {
  console.error('❌ Error comprimiendo:', err.message);
  process.exit(1);
}
