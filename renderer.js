const { ipcRenderer } = require('electron');

// 状态管理
let currentContent = '';
let currentFilePath = null;
let isDarkTheme = false;
let isModified = false;

// DOM 元素
const editor = document.getElementById('markdown-editor');
const preview = document.getElementById('markdown-preview');
const statusText = document.getElementById('status-text');
const settingsModal = document.getElementById('settings-modal');
const aiLoadingEl = document.getElementById('ai-loading');

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: true,
  mangle: false,
  pedantic: false,
  sanitize: false,
  smartLists: true,
  smartypants: true,
  highlight: function(code, lang) {
    return code;
  }
});

// 初始化编辑器
function init() {
  // 加载主题设置
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    isDarkTheme = true;
    document.body.classList.add('dark-theme');
  }

  // 加载上次编辑内容
  const savedContent = localStorage.getItem('lastContent');
  if (savedContent) {
    editor.value = savedContent;
    updatePreview();
  }

  // 绑定事件
  bindEvents();
  
  // 自动聚焦
  editor.focus();
}

// 绑定所有事件
function bindEvents() {
  // 编辑器输入事件
  editor.addEventListener('input', () => {
    updatePreview();
    markAsModified();
    // 自动保存到 localStorage
    localStorage.setItem('lastContent', editor.value);
  });

  // 编辑器键盘快捷键
  editor.addEventListener('keydown', (e) => {
    // Ctrl+B - 加粗
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      insertFormatting('**', '**');
    }
    // Ctrl+I - 斜体
    if (e.ctrlKey && e.key === 'i') {
      e.preventDefault();
      insertFormatting('*', '*');
    }
    // Ctrl+Shift+P - AI 润色
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      aiPolishText();
    }
    // Tab - 插入4个空格
    if (e.key === 'Tab') {
      e.preventDefault();
      insertText('    ');
    }
  });

  // 工具栏按钮
  document.getElementById('btn-h1').addEventListener('click', () => insertHeading(1));
  document.getElementById('btn-h2').addEventListener('click', () => insertHeading(2));
  document.getElementById('btn-h3').addEventListener('click', () => insertHeading(3));
  document.getElementById('btn-bold').addEventListener('click', () => insertFormatting('**', '**'));
  document.getElementById('btn-italic').addEventListener('click', () => insertFormatting('*', '*'));
  document.getElementById('btn-strikethrough').addEventListener('click', () => insertFormatting('~~', '~~'));
  document.getElementById('btn-quote').addEventListener('click', () => insertLinePrefix('> '));
  document.getElementById('btn-code').addEventListener('click', () => insertFormatting('`', '`'));
  document.getElementById('btn-link').addEventListener('click', () => insertLink());
  document.getElementById('btn-image').addEventListener('click', () => insertImage());
  document.getElementById('btn-ul').addEventListener('click', () => insertLinePrefix('- '));
  document.getElementById('btn-ol').addEventListener('click', () => insertLinePrefix('1. '));
  document.getElementById('btn-task').addEventListener('click', () => insertLinePrefix('- [ ] '));
  document.getElementById('btn-theme').addEventListener('click', () => toggleTheme());
  document.getElementById('btn-ai-polish').addEventListener('click', () => aiPolishText());
  document.getElementById('btn-settings').addEventListener('click', () => openSettings());

  // IPC 事件监听
  ipcRenderer.on('new-file', () => newFile());
  ipcRenderer.on('save-file', () => saveFile());
  ipcRenderer.on('save-file-as', () => saveFileAs());
  ipcRenderer.on('toggle-theme', () => toggleTheme());
  ipcRenderer.on('file-opened', (event, data) => {
    editor.value = data.content;
    currentFilePath = data.path;
    currentContent = data.content;
    isModified = false;
    updateStatusText();
    updatePreview();
  });
  ipcRenderer.on('save-file-response', (event, response) => {
    if (response.success) {
      currentFilePath = response.path;
      currentContent = editor.value;
      isModified = false;
      updateStatusText();
    } else {
      alert('保存失败: ' + response.error);
    }
  });
}

// 更新预览
function updatePreview() {
  const content = editor.value;
  preview.innerHTML = marked.parse(content);
  
  // 同步滚动
  syncScroll();
}

// 同步滚动
function syncScroll() {
  const editorScroll = editor.scrollTop;
  const editorHeight = editor.scrollHeight - editor.clientHeight;
  const previewHeight = preview.scrollHeight - preview.clientHeight;
  
  if (editorHeight > 0) {
    const scrollPercent = editorScroll / editorHeight;
    preview.scrollTop = scrollPercent * previewHeight;
  }
}

editor.addEventListener('scroll', syncScroll);

// 插入格式化文本
function insertFormatting(before, after) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selectedText = editor.value.substring(start, end);
  const newText = before + (selectedText || '文本') + after;
  
  editor.setRangeText(newText, start, end, 'end');
  editor.focus();
  
  // 如果没有选中文本，选中默认文本
  if (!selectedText) {
    editor.setSelectionRange(start + before.length, start + before.length + 2);
  }
  
  updatePreview();
  markAsModified();
}

// 插入标题
function insertHeading(level) {
  const prefix = '#'.repeat(level) + ' ';
  insertLinePrefix(prefix);
}

// 插入行前缀
function insertLinePrefix(prefix) {
  const start = editor.selectionStart;
  const text = editor.value;
  
  // 找到当前行的开始
  let lineStart = start;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') {
    lineStart--;
  }
  
  editor.setRangeText(prefix, lineStart, lineStart, 'end');
  editor.focus();
  updatePreview();
  markAsModified();
}

// 插入文本
function insertText(text) {
  const start = editor.selectionStart;
  editor.setRangeText(text, start, start, 'end');
  editor.focus();
  updatePreview();
  markAsModified();
}

// 插入链接
function insertLink() {
  const url = prompt('输入链接地址:', 'https://');
  if (url) {
    insertFormatting('[', `](${url})`);
  }
}

// 插入图片
function insertImage() {
  const url = prompt('输入图片地址:', 'https://');
  if (url) {
    insertFormatting('![', `](${url})`);
  }
}

// 新建文件
function newFile() {
  if (isModified) {
    const confirmed = confirm('当前文件未保存，确定要新建文件吗？');
    if (!confirmed) return;
  }
  
  editor.value = '';
  currentFilePath = null;
  currentContent = '';
  isModified = false;
  updateStatusText();
  updatePreview();
  editor.focus();
}

// 保存文件
function saveFile() {
  ipcRenderer.send('save-file-request', editor.value);
}

// 另存为
function saveFileAs() {
  ipcRenderer.send('save-file-as-request', editor.value);
}

// 切换主题
function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  document.body.classList.toggle('dark-theme');
  localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
}

// 标记为已修改
function markAsModified() {
  if (editor.value !== currentContent) {
    isModified = true;
  } else {
    isModified = false;
  }
  updateStatusText();
}

// 更新状态文本
function updateStatusText() {
  if (currentFilePath) {
    const fileName = currentFilePath.split('\\').pop();
    statusText.textContent = isModified ? `${fileName} *` : fileName;
  } else {
    statusText.textContent = isModified ? '未保存 *' : '未保存';
  }
}

// AI 润色功能
async function aiPolishText() {
  const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
  const textToPolish = selectedText || editor.value;

  if (!textToPolish.trim()) {
    alert('请输入或选中要润色的文本');
    return;
  }

  if (!deepSeekConfig.isValid()) {
    const confirmed = confirm('请先配置 DeepSeek API Key,是否现在打开设置?');
    if (confirmed) {
      openSettings();
    }
    return;
  }

  try {
    // 显示加载提示
    aiLoadingEl.style.display = 'flex';

    // 调用 API
    const polishedText = await deepSeekConfig.polishText(textToPolish);

    // 隐藏加载提示
    aiLoadingEl.style.display = 'none';

    // 替换文本
    if (selectedText) {
      // 如果有选中文本,只替换选中部分
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.setRangeText(polishedText, start, end, 'end');
    } else {
      // 否则替换全部
      editor.value = polishedText;
    }

    updatePreview();
    markAsModified();
    editor.focus();
  } catch (error) {
    aiLoadingEl.style.display = 'none';
    alert('AI 润色失败:' + error.message);
    console.error('AI 润色错误:', error);
  }
}

// 打开设置页面
function openSettings() {
  // 加载当前配置
  const config = deepSeekConfig.getConfig();
  document.getElementById('api-key').value = config.apiKey;
  document.getElementById('base-url').value = config.baseUrl;
  document.getElementById('model').value = config.model;
  document.getElementById('temperature').value = config.temperature;
  document.getElementById('temp-value').textContent = config.temperature;
  document.getElementById('max-tokens').value = config.maxTokens;
  document.getElementById('system-prompt').value = config.systemPrompt;

  // 显示弹窗
  settingsModal.classList.add('show');
}

// 关闭设置页面
function closeSettings() {
  settingsModal.classList.remove('show');
}

// 保存设置
function saveSettings() {
  const config = {
    apiKey: document.getElementById('api-key').value.trim(),
    baseUrl: document.getElementById('base-url').value.trim(),
    model: document.getElementById('model').value,
    temperature: parseFloat(document.getElementById('temperature').value),
    maxTokens: parseInt(document.getElementById('max-tokens').value),
    systemPrompt: document.getElementById('system-prompt').value.trim()
  };

  if (!config.apiKey) {
    alert('请输入 API Key');
    return;
  }

  deepSeekConfig.saveConfig(config);
  alert('设置已保存');
  closeSettings();
}

// 测试 API 连接
async function testApiConnection() {
  const apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey) {
    alert('请先输入 API Key');
    return;
  }

  // 临时保存配置用于测试
  const tempConfig = {
    apiKey: apiKey,
    baseUrl: document.getElementById('base-url').value.trim(),
    model: document.getElementById('model').value,
    temperature: parseFloat(document.getElementById('temperature').value),
    maxTokens: parseInt(document.getElementById('max-tokens').value),
    systemPrompt: document.getElementById('system-prompt').value.trim()
  };

  deepSeekConfig.saveConfig(tempConfig);

  try {
    aiLoadingEl.style.display = 'flex';
    const result = await deepSeekConfig.polishText('测试');
    aiLoadingEl.style.display = 'none';
    alert('连接成功!API 工作正常。');
  } catch (error) {
    aiLoadingEl.style.display = 'none';
    alert('连接失败:' + error.message);
  }
}

// 设置页面事件监听
document.getElementById('close-settings').addEventListener('click', closeSettings);
document.getElementById('save-settings').addEventListener('click', saveSettings);
document.getElementById('test-api').addEventListener('click', testApiConnection);

// 点击背景关闭弹窗
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    closeSettings();
  }
});

// Temperature 滑块实时更新显示
document.getElementById('temperature').addEventListener('input', (e) => {
  document.getElementById('temp-value').textContent = e.target.value;
});

// 初始化应用
init();
