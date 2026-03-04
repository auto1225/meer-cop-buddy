# MeerCOP Electron 패키징 가이드

> Lovable 외부(로컬 환경)에서 진행해야 합니다.

## 1. 사전 준비

```bash
# GitHub에서 프로젝트 클론
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm install
```

## 2. Electron 의존성 설치

```bash
npm install --save-dev electron electron-builder concurrently wait-on
```

## 3. Electron 메인 프로세스 파일 생성

`electron/main.cjs` 파일을 생성합니다:

```javascript
const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 750,
    minWidth: 380,
    minHeight: 600,
    icon: path.join(__dirname, '../public/pwa-icon-512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
  });

  // 프로덕션: 빌드된 파일 로드 / 개발: dev 서버 로드
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:8080');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 트레이 아이콘 설정
  tray = new Tray(path.join(__dirname, '../public/pwa-icon-192.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'MeerCOP 열기', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]);
  tray.setToolTip('MeerCOP - Security Guard');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow.show());

  // 닫기 버튼 클릭 시 트레이로 최소화
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// 시스템 시작 시 자동 실행 설정
app.setLoginItemSettings({
  openAtLogin: true,
  openAsHidden: true,
});

app.whenReady().then(createWindow);

app.on('before-quit', () => {
  app.isQuiting = true;
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

## 4. package.json 수정

`package.json`에 다음을 추가합니다:

```json
{
  "main": "electron/main.cjs",
  "scripts": {
    "electron:dev": "concurrently \"npm run dev\" \"wait-on http://localhost:8080 && electron .\"",
    "electron:build": "npm run build && electron-builder"
  },
  "build": {
    "appId": "com.meercop.security",
    "productName": "MeerCOP",
    "directories": {
      "output": "electron-dist"
    },
    "files": [
      "dist/**/*",
      "electron/**/*",
      "public/pwa-icon-*.png"
    ],
    "win": {
      "target": "nsis",
      "icon": "public/pwa-icon-512.png"
    },
    "mac": {
      "target": "dmg",
      "icon": "public/pwa-icon-512.png"
    },
    "linux": {
      "target": "AppImage",
      "icon": "public/pwa-icon-512.png"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "installerIcon": "public/pwa-icon-512.png",
      "uninstallerIcon": "public/pwa-icon-512.png"
    }
  }
}
```

## 5. 빌드 및 배포

```bash
# Windows .exe 생성
npm run electron:build -- --win

# macOS .dmg 생성 (Mac에서만)
npm run electron:build -- --mac

# Linux AppImage 생성
npm run electron:build -- --linux
```

빌드된 설치 파일은 `electron-dist/` 폴더에 생성됩니다.

## 6. 다운로드 서버 구성

빌드된 파일을 사용자에게 배포하려면:

1. **정적 파일 호스팅**: AWS S3, Google Cloud Storage, GitHub Releases 등에 설치 파일 업로드
2. **다운로드 페이지 생성**: 사용자가 OS에 맞는 설치 파일을 다운로드할 수 있는 페이지 생성
3. **자동 업데이트 (선택)**: `electron-updater` 패키지를 사용하여 자동 업데이트 기능 추가

### GitHub Releases 활용 (추천)

```bash
# GitHub에 릴리스 생성 및 설치 파일 업로드
gh release create v1.0.0 electron-dist/*.exe electron-dist/*.dmg --title "MeerCOP v1.0.0"
```

---

*© 2026 MeerCOP. All rights reserved.*
