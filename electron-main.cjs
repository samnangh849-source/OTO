const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // Don't show until ready
    title: 'Telegram Manual Dashboard',
    autoHideMenuBar: true,
  });

  mainWindow.loadURL('http://localhost:3000');
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (serverProcess) serverProcess.kill();
  });
}

function startServer() {
  const isDev = !app.isPackaged;
  const userDataPath = app.getPath('userData');
  
  // Ensure user data path exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const serverPath = isDev 
    ? path.join(__dirname, 'server.ts') 
    : path.join(process.resourcesPath, 'app.asar.unpacked/dist/server.cjs');

  const env = { 
    ...process.env, 
    NODE_ENV: isDev ? 'development' : 'production',
    USER_DATA_PATH: userDataPath,
    APP_DIST_PATH: isDev ? path.join(__dirname, 'dist') : path.join(process.resourcesPath, 'app.asar.unpacked/dist'),
    PORT: '3000'
  };

  if (isDev) {
    serverProcess = fork(path.join(__dirname, 'node_modules/tsx/dist/cli.mjs'), [path.join(__dirname, 'server.ts')], {
      env,
      stdio: 'pipe'
    });
  } else {
    serverProcess = fork(serverPath, [], {
      env,
      stdio: 'pipe'
    });
  }

  serverProcess.stdout.on('data', (data) => console.log(`[Server]: ${data}`));
  serverProcess.stderr.on('data', (data) => console.error(`[Server Error]: ${data}`));

  serverProcess.on('exit', (code) => {
    console.error(`Server process exited with code ${code}`);
    if (app.isPackaged && code !== 0 && code !== null) {
      dialog.showErrorBox(
        'Server Connection Error',
        `The internal server failed to start (Code: ${code}). This might be due to a port conflict or missing permissions.`
      );
    }
  });

  const checkServer = () => {
    fetch('http://localhost:3000/api/login', { method: 'HEAD' })
      .then(() => {
        if (!mainWindow) createWindow();
      })
      .catch(() => {
        setTimeout(checkServer, 1000);
      });
  };

  checkServer();
}

app.whenReady().then(startServer);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (serverProcess) serverProcess.kill();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
