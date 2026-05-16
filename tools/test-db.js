// Tests automáticos de db.js — verifica CRUD, auth y execSql.
// Run: node tools/test-db.js
// Crea un .db temporal, ejecuta todos los tests, lo borra.

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock app de Electron para que db.js use ruta custom
process.argv.includes('--keep') || null;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-test-'));
const tmpDb = path.join(tmpDir, 'test.db');

// Inyectar mock antes de require
require.cache[require.resolve('electron')] = { exports: { app: { isPackaged: false } } };
const db = require('../db');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ✓', name); pass++; }
  else { console.log('  ❌', name, detail ? '· ' + detail : ''); fail++; }
}
function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function throws(name, fn) {
  try { fn(); ok(name, false, 'should have thrown'); }
  catch (_e) { ok(name, true); }
}

console.log('===== Test db.js =====');
console.log('DB temporal:', tmpDb);

// === INIT ===
console.log('\n[Init]');
const info = db.init(tmpDb);
ok('init devuelve dbPath', info.dbPath === tmpDb);
ok('archivo .db creado', fs.existsSync(tmpDb));

// === SCHEMA ===
console.log('\n[Schema]');
const tables = db.listTables();
['usuarios','empresa','clientes','proveedores','productos','facturas','pedidos','pedidos_venta','albaranes_compra','albaranes_venta']
  .forEach(t => ok(`tabla ${t} existe`, tables.includes(t)));

// === SEED PRODUCTOS ===
console.log('\n[Seed productos]');
const productos = db.query({ table: 'productos', cmd: 'select' });
ok('seed 5 productos palets', productos.length === 5, `got ${productos.length}`);
ok('producto tiene precio_venta', typeof productos[0].precio_venta === 'number');

// === AUTH ===
console.log('\n[Auth]');
ok('hasAnyUser=false al inicio', db.auth.hasAnyUser() === false);
throws('signup contraseña corta', () => db.auth.signup('admin', '123'));
throws('signup username con espacios', () => db.auth.signup('ad min', 'password123'));
const user = db.auth.signup('admin', 'password123');
ok('signup admin OK', user.user_id > 0);
ok('signup devuelve role admin', user.role === 'admin');
ok('hasAnyUser=true', db.auth.hasAnyUser() === true);
throws('signup duplicado falla', () => db.auth.signup('admin', 'otherpass'));
throws('login pass incorrecto', () => db.auth.login('admin', 'wrong'));
const session = db.auth.login('admin', 'password123');
ok('login OK', session.user_id === user.user_id);
ok('last_login_at actualizado', db.query({table:'usuarios',cmd:'select',filters:[{op:'eq',c:'id',v:user.user_id}]})[0].last_login_at !== null);

// === CRUD CLIENTES ===
console.log('\n[CRUD clientes]');
const c1 = db.query({ table: 'clientes', cmd: 'insert', data: { nombre: 'Test SL', nif: 'B12345674', email: 'a@b.es', archivos: [] } });
ok('insert cliente OK', c1[0].id > 0);
const c1id = c1[0].id;

const c2 = db.query({ table: 'clientes', cmd: 'insert', data: { nombre: 'Otro SA' } });
ok('insert cliente con datos mínimos', c2[0].id > 0);

const clientes = db.query({ table: 'clientes', cmd: 'select', order: { c: 'nombre', asc: true } });
ok('select all + order', clientes.length === 2 && clientes[0].nombre === 'Otro SA');

const upd = db.query({ table: 'clientes', cmd: 'update', filters: [{ op: 'eq', c: 'id', v: c1id }], data: { ciudad: 'Tarragona' } });
ok('update por eq', upd[0].ciudad === 'Tarragona');

// JSON columns (archivos)
db.query({ table: 'clientes', cmd: 'update', filters: [{ op: 'eq', c: 'id', v: c1id }], data: { archivos: [{ nombre: 'dni.pdf', data: 'data:application/pdf;base64,abc' }] } });
const updated = db.query({ table: 'clientes', cmd: 'select', filters: [{ op: 'eq', c: 'id', v: c1id }], single: 'one' });
ok('archivos jsonb deserializado a array', Array.isArray(updated.archivos) && updated.archivos[0].nombre === 'dni.pdf');

db.query({ table: 'clientes', cmd: 'delete', filters: [{ op: 'eq', c: 'id', v: c2[0].id }] });
const after = db.query({ table: 'clientes', cmd: 'select' });
ok('delete por eq', after.length === 1);

// === EMPRESA (singleton upsert) ===
console.log('\n[Empresa singleton]');
const emp1 = db.query({ table: 'empresa', cmd: 'upsert', data: { razon_social: 'Palets SL', nif: 'B12345674' } });
ok('upsert crea empresa id=1', emp1.id === 1);
const emp2 = db.query({ table: 'empresa', cmd: 'upsert', data: { razon_social: 'Palets SL', nif: 'B12345674', telefono: '977000000' } });
ok('upsert actualiza, sigue id=1', emp2.id === 1 && emp2.telefono === '977000000');
const empRows = db.query({ table: 'empresa', cmd: 'select' });
ok('solo 1 fila empresa', empRows.length === 1);

// === FACTURAS con lineas JSON ===
console.log('\n[Facturas con lineas JSON]');
const f1 = db.query({ table: 'facturas', cmd: 'insert', data: {
  numero: 'F-2026-0001', fecha: '2026-05-16', cliente_id: c1id, estado: 'borrador',
  lineas: [{ desc: 'Palet EUR', qty: 10, precio: 18.5 }, { desc: 'Palet US', qty: 5, precio: 22 }],
  notas: 'Test'
}});
ok('insert factura con lineas array', f1[0].id > 0);
const fact = db.query({ table: 'facturas', cmd: 'select', single: 'one', filters: [{ op: 'eq', c: 'id', v: f1[0].id }] });
ok('lineas deserializadas', Array.isArray(fact.lineas) && fact.lineas.length === 2 && fact.lineas[0].qty === 10);

// === MULTI-USUARIO ===
console.log('\n[Multi-usuario]');
const u2 = db.auth.createUser('operario', 'changeme', 'user');
ok('createUser user OK', u2.user_id > user.user_id);
const users = db.auth.listUsers();
ok('listUsers devuelve 2', users.length === 2);

db.auth.updateUserRole(u2.user_id, 'viewer');
const updatedUser = db.query({ table: 'usuarios', cmd: 'select', filters: [{ op: 'eq', c: 'id', v: u2.user_id }], single: 'one' });
ok('updateUserRole', updatedUser.role === 'viewer');

db.auth.resetUserPass(u2.user_id, 'newpass99');
throws('login con password viejo falla', () => db.auth.login('operario', 'changeme'));
const newSess = db.auth.login('operario', 'newpass99');
ok('login con password nuevo OK', newSess.user_id === u2.user_id);

throws('cannot_delete_last_admin', () => db.auth.deleteUser(user.user_id));
db.auth.deleteUser(u2.user_id);
ok('deleteUser non-admin OK', db.auth.listUsers().length === 1);

// === SQL EXEC ===
console.log('\n[execSql]');
const sql1 = db.execSql('SELECT COUNT(*) AS n FROM productos');
ok('execSql SELECT devuelve rows', sql1.kind === 'rows' && sql1.rows[0].n === 5);

const sql2 = db.execSql('UPDATE clientes SET ciudad = ? WHERE id = ?', ['Reus', c1id]);
ok('execSql UPDATE con params', sql2.kind === 'ok' && sql2.changes === 1);

const sql3 = db.execSql('SELECT ciudad FROM clientes WHERE id = ?', [c1id]);
ok('execSql verifica update', sql3.rows[0].ciudad === 'Reus');

// === SECURITY: identificador inválido ===
throws('escapeIdent rechaza ; en table', () => db.query({ table: "clientes; DROP TABLE clientes; --", cmd: 'select' }));
throws('table no permitida', () => db.query({ table: 'sqlite_master', cmd: 'select' }));

// === BACKUP ===
console.log('\n[Backup]');
const bk = path.join(tmpDir, 'bk.db');
db.backup(bk).then(() => {
  ok('backup crea archivo', fs.existsSync(bk));
  // CLEANUP
  db.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) {}

  console.log(`\n===== RESULTADO =====`);
  console.log(`✓ ${pass} pasados · ❌ ${fail} fallados`);
  process.exit(fail > 0 ? 1 : 0);
});
