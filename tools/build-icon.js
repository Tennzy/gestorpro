// Genera icon.ico desde favicon.svg con múltiples tamaños (16, 32, 48, 64, 128, 256).
// Requiere: @resvg/resvg-js (SVG → PNG) y to-ico (PNGs → ICO).
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const toIco = require('to-ico');

const SVG = fs.readFileSync(path.join(__dirname, '..', 'favicon.svg'));
const OUT = path.join(__dirname, '..', 'icon.ico');

const sizes = [16, 32, 48, 64, 128, 256];

async function build() {
  const pngs = sizes.map(s => {
    const r = new Resvg(SVG, { fitTo: { mode: 'width', value: s } });
    return r.render().asPng();
  });
  const ico = await toIco(pngs);
  fs.writeFileSync(OUT, ico);
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`✅ icon.ico generado (${kb} KB) con sizes: ${sizes.join(', ')}`);
}
build().catch(e => { console.error('❌', e); process.exit(1); });
