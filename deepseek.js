// AI 润色：多供应商配置与调用（OpenAI 兼容接口）

const AI_PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-coder'] },
  { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'] },
  { id: 'zhipu', name: '智谱 ChatGLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-flash', 'glm-4', 'glm-4-plus'] },
  { id: 'moonshot', name: '月之暗面 Kimi', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  { id: 'baichuan', name: '百川', baseUrl: 'https://api.baichuan-ai.com/v1', models: ['Baichuan2-Turbo', 'Baichuan2-53B'] },
  { id: 'doubao', name: '字节豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: ['doubao-seed-1-6-250615', 'doubao-seed-1-6-flash-250715', 'doubao-seed-1-6-thinking-250715'] },
  { id: 'custom', name: '自定义', baseUrl: '', models: [] }
];

class DeepSeekConfig {
  constructor() {
    this.defaultConfig = {
      providerId: 'deepseek',
      apiKey: '',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      temperature: 0.7,
      maxTokens: 2000,
      systemPrompt: '你是一个专业的中文写作助手，擅长润色和改进文本，使其更加流畅、准确和专业。'
    };
    this.loadConfig();
  }

  getProviders() {
    return AI_PROVIDERS;
  }

  getProvider(id) {
    return AI_PROVIDERS.find(p => p.id === id) || AI_PROVIDERS[0];
  }

  loadConfig() {
    const saved = localStorage.getItem('deepseek_config');
    if (saved) {
      try {
        this.config = { ...this.defaultConfig, ...JSON.parse(saved) };
      } catch (e) {
        this.config = { ...this.defaultConfig };
      }
    } else {
      this.config = { ...this.defaultConfig };
    }
  }

  saveConfig(config) {
    this.config = { ...this.config, ...config };
    localStorage.setItem('deepseek_config', JSON.stringify(this.config));
  }

  getConfig() {
    return { ...this.config };
  }

  isValid() {
    return this.config.apiKey && this.config.apiKey.trim() !== '';
  }

  async polishText(text, userPrompt = '') {
    if (!this.isValid()) {
      throw new Error('请先在设置中配置 API Key');
    }

    const prompt = userPrompt || `请润色以下 Markdown 文本，保持原有格式和结构，只改进语言表达、修正错误、提升专业性：\n\n${text}`;
    const baseUrl = (this.config.baseUrl || '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('请配置 API 地址');

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: this.config.systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          stream: false
        })
      });

      if (!response.ok) {
        const errBody = await response.text();
        let errMsg = `API 请求失败: ${response.status}`;
        try {
          const j = JSON.parse(errBody);
          errMsg = j.error?.message || j.message || errMsg;
        } catch (e) { /* ignore */ }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error('API 返回格式异常');
      // 豆包等：主内容在 content，部分模型在 reasoning_content
      let content = msg.content;
      if (content == null || (typeof content === 'string' && content.trim() === '')) {
        content = msg.reasoning_content;
      }
      if (content == null) throw new Error('API 返回格式异常');
      return typeof content === 'string' ? content : String(content);
    } catch (error) {
      console.error('AI API 调用失败:', error);
      throw error;
    }
  }

  async polishTextStream(text, onChunk, userPrompt = '') {
    if (!this.isValid()) throw new Error('请先在设置中配置 API Key');

    const prompt = userPrompt || `请润色以下 Markdown 文本，保持原有格式和结构，只改进语言表达、修正错误、提升专业性：\n\n${text}`;
    const baseUrl = (this.config.baseUrl || '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('请配置 API 地址');

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'system', content: this.config.systemPrompt }, { role: 'user', content: prompt }],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: true
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      let errMsg = `API 请求失败: ${response.status}`;
      try { const j = JSON.parse(errBody); errMsg = j.error?.message || j.message || errMsg; } catch (e) {}
      throw new Error(errMsg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.slice(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) onChunk(content);
          } catch (e) { console.warn('解析 SSE 失败:', e); }
        }
      }
    }
  }

  // 豆包生图（火山方舟 images/generations）
  async generateImage(prompt, options = {}) {
    if (!this.isValid()) throw new Error('请先在设置中配置 API Key');
    const baseUrl = (this.config.baseUrl || '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('请配置 API 地址');
    const url = `${baseUrl}/images/generations`;
    const body = {
      model: options.model || 'doubao-seedream-4-5-251128',
      prompt: prompt,
      sequential_image_generation: options.sequential !== false ? 'disabled' : 'enabled',
      response_format: 'url',
      size: options.size || '2K',
      stream: false,
      watermark: options.watermark !== false
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    if (!response.ok) {
      let errMsg = `生图请求失败: ${response.status}`;
      try { const j = JSON.parse(text); errMsg = j.error?.message || j.message || errMsg; } catch (e) {}
      throw new Error(errMsg);
    }
    const data = JSON.parse(text);
    const first = data.data && data.data[0];
    if (!first) throw new Error('API 未返回图片');
    const imageUrl = first.url;
    if (!imageUrl) throw new Error('API 返回格式异常，需 response_format: url');
    return imageUrl;
  }
}

const deepSeekConfig = new DeepSeekConfig();
