const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

async function build() {
  console.log('1. Building Next.js...');
  execSync('npm run build', { stdio: 'inherit' });

  console.log('2. Preparing Electron App Directory...');
  const standalonePath = path.join(__dirname, '..', '.next', 'standalone');
  
  // Copy static assets
  fs.copySync(path.join(__dirname, '..', '.next', 'static'), path.join(standalonePath, '.next', 'static'));
  if (fs.existsSync(path.join(__dirname, '..', 'public'))) {
    fs.copySync(path.join(__dirname, '..', 'public'), path.join(standalonePath, 'public'));
  }

  // Inject Electron main.js
  const mainJsContent = `
const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let mainWindow;
let nextProcess;
const PORT = Math.floor(Math.random() * 10000) + 30000; // Random port

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false
    },
    autoHideMenuBar: true
  });
  
  mainWindow.loadURL('http://localhost:' + PORT);
}

function waitForServer(port, callback) {
  const interval = setInterval(() => {
    http.get('http://localhost:' + port, (res) => {
      if (res.statusCode === 200) {
        clearInterval(interval);
        callback();
      }
    }).on('error', () => {});
  }, 200);
}

app.whenReady().then(() => {
  // Start Next.js standalone server
  const serverPath = path.join(__dirname, 'server.js');
  nextProcess = spawn('node', [serverPath], {
    env: { ...process.env, PORT, NODE_ENV: 'production' }
  });

  waitForServer(PORT, () => {
    createWindow();
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (nextProcess) nextProcess.kill();
});
`;
  fs.writeFileSync(path.join(standalonePath, 'main.js'), mainJsContent);

  // Update standalone package.json
  const pkgPath = path.join(standalonePath, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.main = 'main.js';
  pkg.name = 'Ghost';
  pkg.version = '1.0.0';
  delete pkg.build;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  console.log('3. Running Electron Builder...');
  // electron-builder uses the config in the root package.json
  execSync('npx electron-builder', { stdio: 'inherit' });

  console.log('Build complete! Check the "dist" folder.');
}

build().catch(console.error);
