// GestorPro · Electron entry point
// BD 100% local (SQLite via better-sqlite3). Solo internet para IA (opcional).
//
// Run: npm start       Build: npm run package
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');

let mainWindow = null;
let dbInitInfo = null;
let session = null;  // {user_id, username, role}

// ================== WINDOW ==================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'GestorPro',
    backgroundColor: '#f5f5f3',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const template = [
    {
      label: 'Aplicación',
      submenu: [
        { label: 'Recargar', accelerator: 'Ctrl+R', click: () => mainWindow.reload() },
        { label: 'Forzar recarga (ignora caché)', accelerator: 'Ctrl+Shift+R', click: () => mainWindow.webContents.reloadIgnoringCache() },
        { type: 'separator' },
        { label: 'Pantalla completa', accelerator: 'F11', click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
        { label: 'Herramientas de desarrollador', accelerator: 'F12', click: () => mainWindow.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: 'Salir', accelerator: 'Ctrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Base de datos',
      submenu: [
        { label: 'Hacer copia de seguridad…', click: async () => {
          const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
          const r = await dialog.showSaveDialog(mainWindow, {
            title: 'Guardar copia de la base de datos',
            defaultPath: `gestorpro-backup-${stamp}.db`,
            filters: [{ name: 'SQLite', extensions: ['db'] }],
          });
          if (r.canceled || !r.filePath) return;
          try { await db.backup(r.filePath); dialog.showMessageBox(mainWindow, { type: 'info', message: 'Copia guardada', detail: r.filePath }); }
          catch (e) { dialog.showErrorBox('Error', e.message); }
        }},
        { label: 'Cambiar ubicación de la base de datos…', click: async () => {
          const r = await dialog.showOpenDialog(mainWindow, {
            title: 'Selecciona o crea el archivo gestorpro.db',
            properties: ['openFile', 'showHiddenFiles', 'createDirectory', 'promptToCreate'],
            filters: [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }],
          });
          if (r.canceled || r.filePaths.length === 0) return;
          try {
            db.close();
            dbInitInfo = db.init(r.filePaths[0]);
            mainWindow.reload();
          } catch (e) { dialog.showErrorBox('Error', e.message); }
        }},
        { label: 'Mostrar carpeta de datos', click: () => {
          if (dbInitInfo) shell.showItemInFolder(dbInitInfo.dbPath);
        }},
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Acerca de GestorPro', click: () => {
          const v = app.getVersion();
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'GestorPro',
            message: 'GestorPro',
            detail: `Versión ${v}\n\nBase de datos local en:\n${dbInitInfo ? dbInitInfo.dbPath : '(no inicializada)'}\n\nGestión integral con asistente IA.\n\nDesarrollado por RG Labs · Tarragona\nhttps://rglabs.es`,
            buttons: ['OK'],
          });
        }},
        { label: 'Soporte (rglabs.es)', click: () => shell.openExternal('https://rglabs.es') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  mainWindow.loadFile('index.html');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isLocal = url.startsWith('file://') || url.includes('index.html');
    if (!isLocal) { event.preventDefault(); shell.openExternal(url); }
  });
}

// ================== IPC: APP ==================

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('app:save-file', async (event, { suggestedName, filters, content, encoding }) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggestedName,
    filters: filters || [{ name: 'Todos', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    if (content instanceof Uint8Array || Buffer.isBuffer(content)) {
      fs.writeFileSync(result.filePath, Buffer.from(content));
    } else {
      fs.writeFileSync(result.filePath, content, encoding || 'utf8');
    }
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:open-file', async (event, { filters } = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: filters || [{ name: 'Todos', extensions: ['*'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
  try {
    const buf = fs.readFileSync(result.filePaths[0]);
    return { ok: true, path: result.filePaths[0], name: path.basename(result.filePaths[0]), bytes: buf };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ================== IPC: DB ==================

ipcMain.handle('db:query', (event, spec) => {
  // No requerir sesión para leer la lista de usuarios (usado en login screen)
  // Para todo lo demás, requerir sesión activa
  if (!session && spec.table !== 'usuarios') {
    throw new Error('not_authenticated');
  }
  return db.query(spec);
});

ipcMain.handle('db:info', () => db.info());

ipcMain.handle('db:backup', async () => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const r = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar copia de la base de datos',
    defaultPath: `gestorpro-backup-${stamp}.db`,
    filters: [{ name: 'SQLite', extensions: ['db'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  await db.backup(r.filePath);
  return { ok: true, path: r.filePath };
});

ipcMain.handle('db:change-path', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecciona el archivo gestorpro.db',
    properties: ['openFile', 'showHiddenFiles', 'createDirectory', 'promptToCreate'],
    filters: [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }],
  });
  if (r.canceled || r.filePaths.length === 0) return { ok: false, canceled: true };
  db.close();
  dbInitInfo = db.init(r.filePaths[0]);
  session = null;
  mainWindow.reload();
  return { ok: true, path: r.filePaths[0] };
});

// ================== IPC: AUTH ==================

ipcMain.handle('auth:has-any-user', () => db.auth.hasAnyUser());

ipcMain.handle('auth:login', (event, { u, p }) => {
  try {
    session = db.auth.login(u, p);
    return { ok: true, session };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('auth:signup', (event, { u, p }) => {
  // Solo permitir signup si NO hay usuarios todavía (primer admin)
  if (db.auth.hasAnyUser()) return { ok: false, error: 'signup_disabled_users_exist' };
  try {
    session = db.auth.signup(u, p);
    return { ok: true, session };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('auth:logout', () => { session = null; return { ok: true }; });

ipcMain.handle('auth:change-pass', (event, { newP }) => {
  if (!session) return { ok: false, error: 'not_authenticated' };
  try { db.auth.changePass(session.user_id, newP); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('auth:get-session', () => session);

// === Gestión multi-usuario (solo admin) ===
function requireAdmin() {
  if (!session) throw new Error('not_authenticated');
  if (session.role !== 'admin') throw new Error('admin_required');
}

ipcMain.handle('users:list',   () => { requireAdmin(); return db.auth.listUsers(); });
ipcMain.handle('users:create', (event, { u, p, role }) => {
  requireAdmin();
  try { return { ok: true, user: db.auth.createUser(u, p, role) }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('users:reset-pass', (event, { userId, newPass }) => {
  requireAdmin();
  try { db.auth.resetUserPass(userId, newPass); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('users:update-role', (event, { userId, role }) => {
  requireAdmin();
  try { db.auth.updateUserRole(userId, role); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('users:delete', (event, { userId }) => {
  requireAdmin();
  if (session.user_id === userId) return { ok: false, error: 'cannot_delete_self' };
  try { db.auth.deleteUser(userId); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// === SQL Studio (admin only) ===
ipcMain.handle('db:exec-sql', (event, { sql, params }) => {
  requireAdmin();
  try { return { ok: true, result: db.execSql(sql, params) }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('db:list-tables', () => { requireAdmin(); return db.listTables(); });

// ================== LIFECYCLE ==================

app.whenReady().then(async () => {
  try {
    dbInitInfo = db.init();
    console.log('[GestorPro] BD lista:', dbInitInfo.dbPath);
  } catch (err) {
    console.error('[GestorPro] Error inicializando BD:', err);
    dialog.showErrorBox('Error de base de datos',
      `No se pudo abrir la base de datos:\n${err.message}`);
    app.quit(); return;
  }
  try {
    const r = await db.autoBackup();
    if (r.ok && !r.skipped) console.log('[GestorPro] Backup diario creado:', r.file, '· purgados:', r.purged);
  } catch (err) { console.error('[GestorPro] Auto-backup falló:', err); }
  createWindow();
});

app.on('window-all-closed', () => {
  try { db.close(); } catch (_e) {}
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => { try { db.close(); } catch (_e) {} });
