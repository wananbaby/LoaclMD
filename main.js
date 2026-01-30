const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 确保只创建一个应用实例
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    for (let i = 1; i < commandLine.length; i++) {
      let arg = commandLine[i];
      if (typeof arg !== 'string') continue;
      arg = arg.replace(/^["']|["']$/g, '').trim();
      if (!arg || arg.startsWith('-')) continue;
      try {
        if (fs.existsSync(arg) && fs.lstatSync(arg).isFile()) {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            openFileFromPath(path.resolve(arg));
          }
          break;
        }
      } catch (e) { /* 忽略 */ }
    }
  });
}

let mainWindow;
let currentFilePath = null;
let startupFile = null;

// 处理命令行参数（打包后双击 .md 时路径在 argv[1]，开发时可能在 argv[2]）
function handleCommandLineArgs() {
  const args = process.argv;
  for (let i = 1; i < args.length; i++) {
    let arg = args[i];
    if (typeof arg !== 'string') continue;
    arg = arg.replace(/^["']|["']$/g, '').trim(); // 去掉首尾引号
    if (!arg || arg.startsWith('-')) continue;
    try {
      if (fs.existsSync(arg) && fs.lstatSync(arg).isFile()) {
        startupFile = path.resolve(arg);
        break;
      }
    } catch (e) { /* 忽略无效路径 */ }
  }
}

// 从路径打开文件
function openFileFromPath(filePath) {
  if (!filePath) {
    console.error('文件路径为空');
    return;
  }

  if (!mainWindow) {
    console.error('主窗口未创建');
    return;
  }

  console.log('[main] 尝试打开文件:', filePath);

  // 验证文件是否存在
  if (!fs.existsSync(filePath)) {
    console.error('[main] 文件不存在:', filePath);
    dialog.showErrorBox('错误', '文件不存在');
    return;
  }

  // 强制重新读取文件内容，避免缓存
  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err) {
      console.error('[main] 读取文件失败:', err);
      dialog.showErrorBox('错误', '无法读取文件: ' + err.message);
      return;
    }

    console.log('[main] 文件读取成功，长度:', data.length);
    console.log('[main] 文件内容前100字符:', data.substring(0, 100));
    currentFilePath = filePath;

    // 等待窗口准备好后再发送
    setTimeout(() => {
      // 发送文件打开事件
      mainWindow.webContents.send('file-opened', {
        content: data,
        path: filePath
      });

      console.log('[main] 文件打开事件已发送');
    }, 300);
  });
}

// 应用就绪后处理启动文件
function openStartupFile() {
  if (startupFile && mainWindow) {
    console.log('处理启动文件:', startupFile);
    // 延迟执行，确保窗口完全准备好
    setTimeout(() => {
      openFileFromPath(startupFile);
    }, 500);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // 窗口准备好后，尝试打开启动文件
    setTimeout(openStartupFile, 200);
  });

  // 创建菜单
  const menuTemplate = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('new-file');
          }
        },
        {
          label: '打开',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            openFile();
          }
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('save-file');
          }
        },
        {
          label: '另存为',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            mainWindow.webContents.send('save-file-as');
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'Alt+F4',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '切换主题',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            mainWindow.webContents.send('toggle-theme');
          }
        },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
        { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于 LocalMD',
              message: 'LocalMD v1.0.0',
              detail: '本地 Markdown 编辑器\n类似 Typora 的简洁体验'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 打开文件
function openFile() {
  dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  }).then(result => {
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) return;
    const filePath = result.filePaths[0];
    if (!mainWindow || mainWindow.isDestroyed()) return;
    fs.readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        dialog.showErrorBox('错误', '无法读取文件: ' + err.message);
        return;
      }
      if (!mainWindow || mainWindow.isDestroyed()) return;
      currentFilePath = filePath;
      const payload = { content: String(data ?? ''), path: filePath };
      setImmediate(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file-opened', payload);
        }
      });
    });
  }).catch(err => {
    if (err) dialog.showErrorBox('错误', '打开对话框失败: ' + err.message);
  });
}

// IPC 通信处理
ipcMain.on('save-file-request', (event, content) => {
  if (currentFilePath) {
    fs.writeFile(currentFilePath, content, 'utf-8', (err) => {
      if (err) {
        event.reply('save-file-response', { success: false, error: err.message });
      } else {
        event.reply('save-file-response', { success: true, path: currentFilePath });
      }
    });
  } else {
    saveFileAs(event, content);
  }
});

ipcMain.on('save-file-as-request', (event, content) => {
  saveFileAs(event, content);
});

function saveFileAs(event, content) {
  dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  }).then(result => {
    if (!result.canceled && result.filePath) {
      fs.writeFile(result.filePath, content, 'utf-8', (err) => {
        if (err) {
          event.reply('save-file-response', { success: false, error: err.message });
        } else {
          currentFilePath = result.filePath;
          event.reply('save-file-response', { success: true, path: result.filePath });
        }
      });
    } else {
      event.reply('save-file-response', { success: false, canceled: true });
    }
  }).catch(err => {
    event.reply('save-file-response', { success: false, error: err?.message || '未知错误' });
  });
}

app.whenReady().then(() => {
  handleCommandLineArgs();
  createWindow();
  // 文件打开逻辑移到 ready-to-show 事件中处理
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
