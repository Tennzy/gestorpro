// Empaqueta el build de Electron en un ZIP listo para enviar al cliente.
// Lo deja en dist/GestorPro-vX.Y.Z-win64.zip
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkg = require('../package.json');
const SRC = path.join(__dirname, '..', 'dist', 'GestorPro-win32-x64');
const OUT = path.join(__dirname, '..', 'dist', `GestorPro-v${pkg.version}-win64.zip`);

if (!fs.existsSync(SRC)) {
  console.error(`❌ No existe el build: ${SRC}\n   Ejecuta primero: npm run package`);
  process.exit(1);
}

console.log(`📦 Comprimiendo ${SRC} → ${OUT}`);

// PowerShell Compress-Archive: nativo en Windows, no requiere instalar nada.
try {
  fs.rmSync(OUT, { force: true });
  // Usamos PowerShell para garantizar buena compresión en Windows
  const cmd = `powershell -NoProfile -Command "Compress-Archive -Path '${SRC}' -DestinationPath '${OUT}' -CompressionLevel Optimal -Force"`;
  execSync(cmd, { stdio: 'inherit' });
  const stat = fs.statSync(OUT);
  const mb = (stat.size / (1024 * 1024)).toFixed(1);
  console.log(`✅ Listo: ${OUT} (${mb} MB)`);
} catch (err) {
  console.error('❌ Error comprimiendo:', err.message);
  process.exit(1);
}
