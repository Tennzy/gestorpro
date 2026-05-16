// GestorPro · preload.js
// Expone una API segura al renderer (no expone Node directamente).
// El renderer detecta `window.gpAPI` para saber si está en Electron.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gpAPI', {
  isElectron: true,
  version: () => ipcRenderer.invoke('app:version'),

  // DB
  query:        (spec)   => ipcRenderer.invoke('db:query', spec),
  dbInfo:       ()       => ipcRenderer.invoke('db:info'),
  dbBackup:     ()       => ipcRenderer.invoke('db:backup'),
  dbChangePath: ()       => ipcRenderer.invoke('db:change-path'),

  // Auth local
  hasAnyUser:   ()        => ipcRenderer.invoke('auth:has-any-user'),
  login:        (u, p)    => ipcRenderer.invoke('auth:login', { u, p }),
  signup:       (u, p)    => ipcRenderer.invoke('auth:signup', { u, p }),
  logout:       ()        => ipcRenderer.invoke('auth:logout'),
  changePass:   (newP)    => ipcRenderer.invoke('auth:change-pass', { newP }),
  getSession:   ()        => ipcRenderer.invoke('auth:get-session'),

  // Multi-usuario (admin)
  usersList:        ()                    => ipcRenderer.invoke('users:list'),
  usersCreate:      (u, p, role)          => ipcRenderer.invoke('users:create', { u, p, role }),
  usersResetPass:   (userId, newPass)     => ipcRenderer.invoke('users:reset-pass', { userId, newPass }),
  usersUpdateRole:  (userId, role)        => ipcRenderer.invoke('users:update-role', { userId, role }),
  usersDelete:      (userId)              => ipcRenderer.invoke('users:delete', { userId }),

  // SQL Studio (admin)
  execSql:          (sql, params)         => ipcRenderer.invoke('db:exec-sql', { sql, params }),
  listTables:       ()                    => ipcRenderer.invoke('db:list-tables'),

  // File system para abrir/guardar
  saveFile:     (args)   => ipcRenderer.invoke('app:save-file', args),
  openFile:     (args)   => ipcRenderer.invoke('app:open-file', args),
});
