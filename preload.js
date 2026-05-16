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

  // File system para abrir/guardar
  saveFile:     (args)   => ipcRenderer.invoke('app:save-file', args),
  openFile:     (args)   => ipcRenderer.invoke('app:open-file', args),
});
