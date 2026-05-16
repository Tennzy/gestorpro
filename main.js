// GestorPro · Electron entry point
// Empaqueta index.html en una ventana desktop. Pensado para entregar como
// .exe portable a clientes que no quieren depender del navegador.
//
// Run: npm start       Build: npm run package
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'GestorPro · Palets S.L.',
    backgroundColor: '#f5f5f3',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Menú nativo limpio (sin File/Edit/View, dejamos solo Recargar/DevTools)
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
      label: 'Ayuda',
      submenu: [
        { label: 'Acerca de GestorPro', click: () => {
          const v = app.getVersion();
          require('electron').dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'GestorPro',
            message: 'GestorPro · Palets S.L.',
            detail: `Versión ${v}\n\nGestión integral: clientes, proveedores, productos, pedidos, albaranes, facturas.\nAsistente IA integrado.\n\nDesarrollado por RG Labs · Tarragona\nhttps://rglabs.es`,
            buttons: ['OK'],
          });
        }},
        { label: 'Soporte (rglabs.es)', click: () => shell.openExternal('https://rglabs.es') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  mainWindow.loadFile('index.html');

  // Cualquier link externo abre en el navegador del sistema (no en una nueva ventana Electron)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Bloquea navegación fuera del index.html (defensa anti-phishing)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isLocal = url.startsWith('file://') || url.includes('index.html');
    if (!isLocal) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
