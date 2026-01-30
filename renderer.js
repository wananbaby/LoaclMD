const { ipcRenderer } = require('electron');

// 状态管理
let currentContent = '';
let currentFilePath = null;
let isDarkTheme = false;
let isModified = false;
let fileOpened = false; // 标记是否通过文件打开
let windowLoaded = false; // 标记 window.load 是否已触发
let storedContentTimerId = null; // 用于取消“加载上次内容”定时器

// DOM 元素（在 DOM 加载后初始化）
let editor, preview, statusText, settingsModal, aiLoadingEl;

// 配置 marked
function configureMarked() {
  if (typeof marked !== 'undefined') {
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
  } else {
    console.error('[renderer] marked 库未加载');
  }
}

// 初始化编辑器
function init() {
  console.log('[renderer] init() 被调用');

  // 初始化 DOM 元素
  editor = document.getElementById('markdown-editor');
  preview = document.getElementById('markdown-preview');
  statusText = document.getElementById('status-text');
  settingsModal = document.getElementById('settings-modal');
  aiLoadingEl = document.getElementById('ai-loading');

  if (!editor || !preview) {
    console.error('[renderer] DOM 元素未找到');
    return;
  }

  // 配置 marked
  configureMarked();

  // 加载主题设置
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    isDarkTheme = true;
    document.body.classList.add('dark-theme');
  }

  // 绑定事件（先绑定事件，确保file-opened事件能被正确处理）
  bindEvents();
  bindSettingsEvents();

  // 延迟执行：仅在未通过文件打开且编辑器为空时加载 localStorage
  function tryLoadStoredContent() {
    if (storedContentTimerId) clearTimeout(storedContentTimerId);
    const delay = document.readyState === 'complete' ? 100 : 800;
    storedContentTimerId = setTimeout(() => {
      storedContentTimerId = null;
      if (!fileOpened && editor.value === '') {
        const savedContent = localStorage.getItem('lastContent');
        if (savedContent) {
          editor.value = savedContent;
          currentContent = savedContent;
          updatePreview();
        }
      }
    }, delay);
  }

  if (document.readyState === 'complete') {
    tryLoadStoredContent();
  } else {
    window.addEventListener('load', () => {
      windowLoaded = true;
      tryLoadStoredContent();
    });
  }

  // 自动聚焦
  editor.focus();
}

// 绑定所有事件
function bindEvents() {
  // 编辑器滚动同步
  editor.addEventListener('scroll', syncScroll);

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
  document.getElementById('btn-ai-image').addEventListener('click', openImageGenModal);
  document.getElementById('btn-ai-polish').addEventListener('click', () => aiPolishText());
  document.getElementById('btn-settings').addEventListener('click', () => openSettings());

  // IPC 事件监听
  ipcRenderer.on('new-file', () => newFile());
  ipcRenderer.on('save-file', () => saveFile());
  ipcRenderer.on('save-file-as', () => saveFileAs());
  ipcRenderer.on('toggle-theme', () => toggleTheme());
  ipcRenderer.on('file-opened', (event, data) => {
    if (!data || !editor) return;
    if (storedContentTimerId) {
      clearTimeout(storedContentTimerId);
      storedContentTimerId = null;
    }
    const content = typeof data.content === 'string' ? data.content : String(data.content ?? '');
    const path = data.path || '';

    fileOpened = true;
    currentFilePath = path;
    currentContent = content;
    isModified = false;

    editor.value = content;
    updateStatusText();
    updatePreview();
    localStorage.removeItem('lastContent');

    setTimeout(() => {
      if (editor.value !== content) {
        editor.value = content;
        currentContent = content;
        updatePreview();
      }
    }, 1000);
  });
  ipcRenderer.on('save-file-response', (event, response) => {
    if (response.success) {
      currentFilePath = response.path;
      currentContent = editor.value;
      isModified = false;
      updateStatusText();
    } else if (!response.canceled && response.error) {
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
  fileOpened = false; // 重置文件打开标记
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
    const fileName = currentFilePath.replace(/^.*[/\\]/, '');
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
    const confirmed = confirm('请先配置 API Key，是否现在打开设置？');
    if (confirmed) {
      openSettings();
    }
    return;
  }

  try {
    const loadingTextEl = document.getElementById('ai-loading-text');
    if (loadingTextEl) loadingTextEl.textContent = 'AI 正在润色中...';
    aiLoadingEl.style.display = 'flex';

    let polishedText = await deepSeekConfig.polishText(textToPolish);

    // 隐藏加载提示
    aiLoadingEl.style.display = 'none';

    if (polishedText == null || typeof polishedText !== 'string') {
      polishedText = String(polishedText != null ? polishedText : '');
    }

    // 替换文本
    if (selectedText) {
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.setRangeText(polishedText, start, end, 'end');
    } else {
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

// 根据供应商刷新 API 地址与模型列表；updateBaseUrl 为 true 时才覆盖 API 地址
function applyProviderToForm(providerId, updateBaseUrl) {
  const provider = deepSeekConfig.getProvider(providerId);
  const baseUrlEl = document.getElementById('base-url');
  const modelSelect = document.getElementById('model');
  const modelSelectGroup = document.getElementById('model-select-group');
  const modelCustomGroup = document.getElementById('model-custom-group');
  const modelCustomEl = document.getElementById('model-custom');

  if (updateBaseUrl) baseUrlEl.value = provider.baseUrl || '';
  if (providerId === 'custom') {
    modelSelectGroup.style.display = 'none';
    modelCustomGroup.style.display = 'block';
    modelCustomEl.value = deepSeekConfig.getConfig().model || '';
  } else {
    modelCustomGroup.style.display = 'none';
    modelSelectGroup.style.display = 'block';
    modelSelect.innerHTML = '';
    (provider.models || []).forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      modelSelect.appendChild(opt);
    });
    const cfg = deepSeekConfig.getConfig();
    const current = cfg.model;
    if (provider.models && provider.models.includes(current)) {
      modelSelect.value = current;
    } else if (provider.models && provider.models.length) {
      modelSelect.value = provider.models[0];
    }
  }
}

// 打开设置页面
function openSettings() {
  const config = deepSeekConfig.getConfig();
  document.getElementById('provider').value = config.providerId || 'deepseek';
  document.getElementById('api-key').value = config.apiKey;
  document.getElementById('temperature').value = config.temperature;
  document.getElementById('temp-value').textContent = config.temperature;
  document.getElementById('max-tokens').value = config.maxTokens;
  document.getElementById('system-prompt').value = config.systemPrompt;

  applyProviderToForm(config.providerId || 'deepseek', false);

  document.getElementById('provider').addEventListener('change', function onProviderChange() {
    applyProviderToForm(this.value, true);
  }, { once: true });

  settingsModal.classList.add('show');
}

// 关闭设置页面
function closeSettings() {
  settingsModal.classList.remove('show');
}

// 保存设置
function saveSettings() {
  const providerId = document.getElementById('provider').value;
  const modelSelectGroup = document.getElementById('model-select-group');
  const model = modelSelectGroup.style.display !== 'none'
    ? document.getElementById('model').value
    : document.getElementById('model-custom').value.trim();

  const config = {
    providerId,
    apiKey: document.getElementById('api-key').value.trim(),
    baseUrl: document.getElementById('base-url').value.trim(),
    model: model || deepSeekConfig.getProvider(providerId).models?.[0] || '',
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

  const modelSelectGroup = document.getElementById('model-select-group');
  const model = modelSelectGroup.style.display !== 'none'
    ? document.getElementById('model').value
    : document.getElementById('model-custom').value.trim();
  const tempConfig = {
    apiKey: apiKey,
    baseUrl: document.getElementById('base-url').value.trim(),
    model: model,
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

// 生图弹窗
function openImageGenModal() {
  if (!deepSeekConfig.isValid()) {
    const c = confirm('生图使用豆包 API，请先在设置中选用「字节豆包」并配置 API Key。是否打开设置？');
    if (c) openSettings();
    return;
  }
  document.getElementById('image-prompt').value = '';
  document.getElementById('image-gen-modal').classList.add('show');
  document.getElementById('image-prompt').focus();
}

function closeImageGenModal() {
  document.getElementById('image-gen-modal').classList.remove('show');
}

async function doImageGen() {
  const promptEl = document.getElementById('image-prompt');
  const prompt = promptEl.value.trim();
  if (!prompt) {
    alert('请输入描述');
    return;
  }
  const model = document.getElementById('image-model').value || 'doubao-seedream-4-5-251128';
  const size = document.getElementById('image-size').value || '2K';
  const loadingText = document.getElementById('ai-loading-text');
  try {
    if (loadingText) loadingText.textContent = '正在生图...';
    aiLoadingEl.style.display = 'flex';
    const url = await deepSeekConfig.generateImage(prompt, { model, size });
    aiLoadingEl.style.display = 'none';
    closeImageGenModal();
    const desc = (prompt.length > 30 ? prompt.slice(0, 30) + '...' : prompt).replace(/[\[\]]/g, '');
    const md = '![' + (desc || '图') + '](' + url + ')';
    const start = editor.selectionStart;
    editor.setRangeText(md, start, start, 'end');
    updatePreview();
    markAsModified();
    editor.focus();
  } catch (error) {
    aiLoadingEl.style.display = 'none';
    alert('生图失败: ' + error.message);
    console.error('生图错误:', error);
  }
}

// 设置页面事件监听（在 init 内调用，确保 DOM 已就绪）
function bindSettingsEvents() {
  document.getElementById('close-settings').addEventListener('click', closeSettings);
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('test-api').addEventListener('click', testApiConnection);
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeSettings();
    });
  }
  document.getElementById('close-image-gen').addEventListener('click', closeImageGenModal);
  document.getElementById('do-image-gen').addEventListener('click', doImageGen);
  const imgModal = document.getElementById('image-gen-modal');
  if (imgModal) {
    imgModal.addEventListener('click', (e) => {
      if (e.target === imgModal) closeImageGenModal();
    });
  }
  const temperatureInput = document.getElementById('temperature');
  if (temperatureInput) {
    temperatureInput.addEventListener('input', (e) => {
      const tempValue = document.getElementById('temp-value');
      if (tempValue) tempValue.textContent = e.target.value;
    });
  }
}

// 等待 DOM 加载完成后初始化应用
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[renderer] DOMContentLoaded 事件触发');
    init();
  });
} else {
  console.log('[renderer] DOM 已加载，直接调用 init()');
  init();
}
