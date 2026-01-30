const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const winUnpacked = path.join(distDir, 'win-unpacked');

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, maxRetries: 2 });
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EBUSY') {
      console.error('dist 被占用，请先关闭 LocalMD 程序及打开 dist 的资源管理器窗口后重试。');
      process.exit(1);
    }
    throw e;
  }
}

try {
  rmDir(winUnpacked);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
