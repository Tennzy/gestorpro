// GestorPro · db.js
// Capa SQLite local. Replica la API de Supabase JS (.from().select().eq().order())
// para que el renderer no tenga que saber de dónde vienen los datos.
//
// Funciones expuestas:
//   init()            inicializa la BD, crea schema, hace seed si está vacía
//   query(spec)       ejecuta {table, cmd, data, filters, order, single, cols, opts}
//   auth.login(u,p)   verifica credenciales y devuelve sesión { user_id, username }
//   auth.signup(u,p)  crea usuario (admin) — solo permitido si no hay usuarios
//   auth.changePass(u, newPass)
//   info()            ruta del .db, tamaño, nº usuarios
//   backup(destPath)  copia atómica del .db a destPath
//   autoBackup()      crea backup diario si pasaron > 22 h del último
//   close()

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { app } = require('electron');

let dbPath = null;
let db = null;

// ============== INIT ==============

function getDefaultDbPath() {
  // En portable mode (.exe junto a sus datos), la BD se guarda al lado del exe.
  // En modo dev (npm start), se guarda en una carpeta data/ del proyecto.
  const isPackaged = app && app.isPackaged;
  const baseDir = isPackaged
    ? path.dirname(process.execPath)
    : path.join(__dirname, 'data');
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  return path.join(baseDir, 'gestorpro.db');
}

function init(customPath) {
  dbPath = customPath || getDefaultDbPath();
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema();
  ensureDefaultProducts();
  return { dbPath };
}

function createSchema() {
  // Usuarios locales
  db.exec(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at TEXT DEFAULT (datetime('now')),
    last_login_at TEXT
  )`);
  // Migración silenciosa: añadir last_login_at si no existía
  try { db.exec(`ALTER TABLE usuarios ADD COLUMN last_login_at TEXT`); } catch (_e) { /* ya existe */ }

  // Empresa (siempre id=1, singleton)
  db.exec(`CREATE TABLE IF NOT EXISTS empresa (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    razon_social TEXT DEFAULT '',
    nombre_comercial TEXT DEFAULT '',
    nif TEXT DEFAULT '',
    direccion TEXT DEFAULT '',
    cp TEXT DEFAULT '',
    ciudad TEXT DEFAULT '',
    provincia TEXT DEFAULT '',
    pais TEXT DEFAULT 'España',
    telefono TEXT DEFAULT '',
    email TEXT DEFAULT '',
    web TEXT DEFAULT '',
    logo_data TEXT DEFAULT '',
    iva_default REAL DEFAULT 21,
    iban TEXT DEFAULT '',
    notas_factura TEXT DEFAULT '',
    color_primario TEXT DEFAULT '#185FA5',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // Contactos
  db.exec(`CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL DEFAULT '',
    email TEXT DEFAULT '',
    telefono TEXT DEFAULT '',
    nif TEXT DEFAULT '',
    ciudad TEXT DEFAULT '',
    direccion_envio TEXT DEFAULT '',
    direccion_facturacion TEXT DEFAULT '',
    notas TEXT DEFAULT '',
    archivos TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS proveedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL DEFAULT '',
    email TEXT DEFAULT '',
    telefono TEXT DEFAULT '',
    nif TEXT DEFAULT '',
    ciudad TEXT DEFAULT '',
    direccion_envio TEXT DEFAULT '',
    direccion_facturacion TEXT DEFAULT '',
    notas TEXT DEFAULT '',
    archivos TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL DEFAULT '',
    categoria TEXT DEFAULT '',
    precio_venta REAL DEFAULT 0,
    precio_compra REAL DEFAULT 0,
    stock REAL DEFAULT 0,
    unidad TEXT DEFAULT 'ud',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Documentos (lineas se almacena como TEXT/JSON)
  for (const t of ['facturas', 'pedidos', 'pedidos_venta', 'albaranes_compra', 'albaranes_venta']) {
    const fk = ['facturas', 'pedidos_venta', 'albaranes_venta'].includes(t) ? 'cliente_id' : 'proveedor_id';
    db.exec(`CREATE TABLE IF NOT EXISTS ${t} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT DEFAULT '',
      fecha TEXT DEFAULT (date('now')),
      ${fk} INTEGER,
      estado TEXT DEFAULT 'borrador',
      lineas TEXT DEFAULT '[]',
      notas TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )`);
  }
}

function ensureDefaultProducts() {
  const c = db.prepare('SELECT count(*) AS n FROM productos').get().n;
  if (c > 0) return;
  const seed = [
    ['Palet Europeo Estándar 1200x800', 'Palets', 12, 18.50, 150, 'ud'],
    ['Palet Americano 1200x1000', 'Palets', 14, 22.00, 80, 'ud'],
    ['Palet Doble Uso 1200x800 Reforzado', 'Palets', 18, 28.90, 60, 'ud'],
    ['Palet Recuperado 1200x800', 'Palets', 5, 9.50, 200, 'ud'],
    ['Palet Pharma Higiénico 1200x1000', 'Palets', 38, 65.00, 25, 'ud'],
  ];
  const ins = db.prepare('INSERT INTO productos (nombre,categoria,precio_compra,precio_venta,stock,unidad) VALUES (?,?,?,?,?,?)');
  const tx = db.transaction((rows) => { for (const r of rows) ins.run(...r); });
  tx(seed);
}

// ============== AUTH ==============

function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

const auth = {
  hasAnyUser() {
    return db.prepare('SELECT count(*) AS n FROM usuarios').get().n > 0;
  },
  login(username, password) {
    const u = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(String(username).trim().toLowerCase());
    if (!u) throw new Error('invalid_credentials');
    const { hash } = hashPassword(password, u.salt);
    if (hash !== u.password_hash) throw new Error('invalid_credentials');
    db.prepare('UPDATE usuarios SET last_login_at = datetime(\'now\') WHERE id = ?').run(u.id);
    return { user_id: u.id, username: u.username, role: u.role };
  },
  signup(username, password, role) {
    const uname = String(username).trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(uname)) throw new Error('invalid_username');
    if (!password || password.length < 6) throw new Error('password_too_short');
    const exists = db.prepare('SELECT 1 FROM usuarios WHERE username = ?').get(uname);
    if (exists) throw new Error('username_taken');
    const { hash, salt } = hashPassword(password);
    const r = db.prepare('INSERT INTO usuarios (username, password_hash, salt, role) VALUES (?, ?, ?, ?)').run(uname, hash, salt, role || 'admin');
    return { user_id: r.lastInsertRowid, username: uname, role: role || 'admin' };
  },
  changePass(userId, newPassword) {
    if (!newPassword || newPassword.length < 6) throw new Error('password_too_short');
    const { hash, salt } = hashPassword(newPassword);
    db.prepare('UPDATE usuarios SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, userId);
    return { ok: true };
  },
  // === Gestión multi-usuario (solo admin) ===
  listUsers() {
    return db.prepare('SELECT id, username, role, created_at, last_login_at FROM usuarios ORDER BY id').all();
  },
  createUser(username, password, role) {
    return this.signup(username, password, role || 'user');
  },
  resetUserPass(userId, newPassword) {
    return this.changePass(userId, newPassword);
  },
  updateUserRole(userId, newRole) {
    if (!['admin','user','viewer'].includes(newRole)) throw new Error('invalid_role');
    db.prepare('UPDATE usuarios SET role = ? WHERE id = ?').run(newRole, userId);
    return { ok: true };
  },
  deleteUser(userId) {
    // Impedir borrar al último admin (para no dejar la app sin admins)
    const remaining = db.prepare('SELECT count(*) AS n FROM usuarios WHERE role = ? AND id != ?').get('admin', userId).n;
    const isAdmin = db.prepare('SELECT role FROM usuarios WHERE id = ?').get(userId)?.role === 'admin';
    if (isAdmin && remaining < 1) throw new Error('cannot_delete_last_admin');
    db.prepare('DELETE FROM usuarios WHERE id = ?').run(userId);
    return { ok: true };
  },
};

// ============== QUERY ==============

// Listado de columnas que se deben (de)serializar como JSON
const JSON_COLS = ['lineas', 'archivos'];

function deserializeRow(row) {
  if (!row) return row;
  const out = { ...row };
  for (const c of JSON_COLS) {
    if (typeof out[c] === 'string') {
      try { out[c] = JSON.parse(out[c]); } catch (_e) { out[c] = []; }
    }
  }
  return out;
}
function serializeData(data) {
  const out = { ...data };
  for (const c of JSON_COLS) {
    if (Array.isArray(out[c]) || (typeof out[c] === 'object' && out[c] !== null)) {
      out[c] = JSON.stringify(out[c]);
    }
  }
  return out;
}

const ALLOWED_TABLES = new Set([
  'usuarios', 'empresa', 'clientes', 'proveedores', 'productos',
  'facturas', 'pedidos', 'pedidos_venta', 'albaranes_compra', 'albaranes_venta',
]);

function escapeIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error('invalid_identifier: ' + name);
  return '"' + name + '"';
}

function query(spec) {
  if (!spec || !spec.table) throw new Error('table_required');
  if (!ALLOWED_TABLES.has(spec.table)) throw new Error('table_not_allowed: ' + spec.table);

  const T = escapeIdent(spec.table);
  const filters = spec.filters || [];
  const where = []; const params = [];
  for (const f of filters) {
    if (f.op === 'eq') { where.push(`${escapeIdent(f.c)} = ?`); params.push(f.v); }
    else if (f.op === 'in') { where.push(`${escapeIdent(f.c)} IN (${f.v.map(() => '?').join(',')})`); params.push(...f.v); }
  }
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

  // SELECT
  if (spec.cmd === 'select') {
    let sql = `SELECT * FROM ${T}${whereSql}`;
    if (spec.order && spec.order.c) {
      sql += ` ORDER BY ${escapeIdent(spec.order.c)} ${spec.order.asc === false ? 'DESC' : 'ASC'}`;
    }
    const rows = db.prepare(sql).all(...params).map(deserializeRow);
    if (spec.single === 'one') {
      if (rows.length !== 1) throw new Error('expected_single_got_' + rows.length);
      return rows[0];
    }
    if (spec.single === 'maybe') return rows[0] || null;
    return rows;
  }

  // INSERT
  if (spec.cmd === 'insert') {
    const datas = Array.isArray(spec.data) ? spec.data : [spec.data];
    const out = [];
    const tx = db.transaction(() => {
      for (let d of datas) {
        d = stripMeta(d);
        d = serializeData(d);
        const keys = Object.keys(d);
        if (keys.length === 0) continue;
        const sql = `INSERT INTO ${T} (${keys.map(escapeIdent).join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
        const r = db.prepare(sql).run(...keys.map(k => d[k]));
        const inserted = db.prepare(`SELECT * FROM ${T} WHERE id = ?`).get(r.lastInsertRowid);
        out.push(deserializeRow(inserted));
      }
    });
    tx();
    return out;
  }

  // UPSERT (para empresa que es singleton, o conflict resolution)
  if (spec.cmd === 'upsert') {
    let d = serializeData(stripMeta(spec.data));
    const conflictCol = (spec.opts && spec.opts.onConflict) ? spec.opts.onConflict : 'id';
    // Si la tabla es empresa, garantizar id=1
    if (spec.table === 'empresa') d.id = 1;
    const existing = db.prepare(`SELECT 1 FROM ${T} WHERE ${escapeIdent(conflictCol)} = ?`).get(d[conflictCol]);
    if (existing) {
      const keys = Object.keys(d).filter(k => k !== conflictCol);
      const sql = `UPDATE ${T} SET ${keys.map(k => `${escapeIdent(k)} = ?`).join(', ')} WHERE ${escapeIdent(conflictCol)} = ?`;
      db.prepare(sql).run(...keys.map(k => d[k]), d[conflictCol]);
    } else {
      const keys = Object.keys(d);
      const sql = `INSERT INTO ${T} (${keys.map(escapeIdent).join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
      db.prepare(sql).run(...keys.map(k => d[k]));
    }
    const row = db.prepare(`SELECT * FROM ${T} WHERE ${escapeIdent(conflictCol)} = ?`).get(d[conflictCol]);
    return deserializeRow(row);
  }

  // UPDATE
  if (spec.cmd === 'update') {
    let d = serializeData(stripMeta(spec.data));
    const keys = Object.keys(d);
    if (keys.length === 0) return [];
    const setSql = keys.map(k => `${escapeIdent(k)} = ?`).join(', ');
    const sql = `UPDATE ${T} SET ${setSql}${whereSql}`;
    db.prepare(sql).run(...keys.map(k => d[k]), ...params);
    // Devuelve filas afectadas
    const rows = db.prepare(`SELECT * FROM ${T}${whereSql}`).all(...params).map(deserializeRow);
    return rows;
  }

  // DELETE
  if (spec.cmd === 'delete') {
    db.prepare(`DELETE FROM ${T}${whereSql}`).run(...params);
    return [];
  }

  throw new Error('unsupported_cmd: ' + spec.cmd);
}

function stripMeta(d) {
  // Quita campos meta que vienen del cliente y no deben tocarse en BD
  const out = { ...d };
  delete out.created_at;
  delete out.updated_at;
  // user_id no existe en local pero el frontend lo manda — lo quitamos
  delete out.user_id;
  return out;
}

// ============== INFO / BACKUP ==============

function info() {
  if (!db) return null;
  const stat = fs.statSync(dbPath);
  return {
    dbPath,
    sizeBytes: stat.size,
    users: db.prepare('SELECT count(*) AS n FROM usuarios').get().n,
    clientes: db.prepare('SELECT count(*) AS n FROM clientes').get().n,
    proveedores: db.prepare('SELECT count(*) AS n FROM proveedores').get().n,
    productos: db.prepare('SELECT count(*) AS n FROM productos').get().n,
    facturas: db.prepare('SELECT count(*) AS n FROM facturas').get().n,
  };
}

async function backup(destPath) {
  await db.backup(destPath);
  return destPath;
}

async function autoBackup() {
  const backupsDir = path.join(path.dirname(dbPath), 'backups');
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  const files = fs.readdirSync(backupsDir).filter(f => f.startsWith('gestorpro-') && f.endsWith('.db'));
  const now = Date.now();
  if (files.length > 0) {
    const last = files.sort().slice(-1)[0];
    const lastStat = fs.statSync(path.join(backupsDir, last));
    if (now - lastStat.mtimeMs < 22 * 60 * 60 * 1000) {
      return { skipped: true, last };
    }
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const f = path.join(backupsDir, `gestorpro-${stamp}.db`);
  await db.backup(f);
  // Purgar backups > 30 días
  let purged = 0;
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  for (const file of files) {
    const fp = path.join(backupsDir, file);
    if (fs.statSync(fp).mtimeMs < cutoff) { fs.unlinkSync(fp); purged++; }
  }
  return { ok: true, file: f, purged };
}

function close() { try { if (db) db.close(); } catch (_e) {} }

// ============== EXEC SQL (modo experto · admin only) ==============
// Ejecuta SQL libre. Devuelve filas (SELECT/RETURNING) o {changes, lastInsertRowid}.
// Distingue entre SELECT (read-only) y comandos que modifican.
function execSql(sql, params) {
  if (!sql || typeof sql !== 'string') throw new Error('sql_required');
  const trimmed = sql.trim();
  if (!trimmed) throw new Error('sql_empty');
  // Detectar si es solo SELECT (sin punto y coma seguido de otras cosas)
  const isPureSelect = /^\s*select\b/i.test(trimmed) && !/;\s*\S/.test(trimmed.replace(/;\s*$/, ''));
  try {
    if (isPureSelect) {
      const stmt = db.prepare(trimmed.replace(/;\s*$/, ''));
      const rows = stmt.all(...(params || []));
      const cols = rows.length > 0 ? Object.keys(rows[0]) : (stmt.columns ? stmt.columns().map(c => c.name) : []);
      return { kind: 'rows', cols, rows, count: rows.length };
    } else {
      // Para INSERT/UPDATE/DELETE/DDL usamos exec si tiene varias sentencias, o prepare/run si una sola
      const hasMulti = (trimmed.replace(/;\s*$/, '').match(/;/g) || []).length > 0;
      if (hasMulti) {
        db.exec(trimmed);
        return { kind: 'ok', message: 'Sentencias ejecutadas (múltiples).' };
      }
      const stmt = db.prepare(trimmed);
      const r = stmt.run(...(params || []));
      return { kind: 'ok', changes: r.changes, lastInsertRowid: r.lastInsertRowid, message: `${r.changes} fila(s) afectada(s).` };
    }
  } catch (e) {
    throw new Error(e.message);
  }
}

function listTables() {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
}

module.exports = { init, query, auth, info, backup, autoBackup, close, execSql, listTables };
