// DeepSeek API 配置和调用模块

class DeepSeekConfig {
  constructor() {
    this.defaultConfig = {
      apiKey: '',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      temperature: 0.7,
      maxTokens: 2000,
      systemPrompt: '你是一个专业的中文写作助手，擅长润色和改进文本，使其更加流畅、准确和专业。'
    };
    this.loadConfig();
  }

  // 加载配置
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

  // 保存配置
  saveConfig(config) {
    this.config = { ...this.config, ...config };
    localStorage.setItem('deepseek_config', JSON.stringify(this.config));
  }

  // 获取配置
  getConfig() {
    return { ...this.config };
  }

  // 验证配置
  isValid() {
    return this.config.apiKey && this.config.apiKey.trim() !== '';
  }

  // 调用 DeepSeek API 进行文本润色
  async polishText(text, userPrompt = '') {
    if (!this.isValid()) {
      throw new Error('请先在设置中配置 DeepSeek API Key');
    }

    const prompt = userPrompt || `请润色以下 Markdown 文本，保持原有格式和结构，只改进语言表达、修正错误、提升专业性：\n\n${text}`;

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: 'system',
              content: this.config.systemPrompt
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          stream: false
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API 请求失败: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('DeepSeek API 调用失败:', error);
      throw error;
    }
  }

  // 流式调用 DeepSeek API
  async polishTextStream(text, onChunk, userPrompt = '') {
    if (!this.isValid()) {
      throw new Error('请先在设置中配置 DeepSeek API Key');
    }

    const prompt = userPrompt || `请润色以下 Markdown 文本，保持原有格式和结构，只改进语言表达、修正错误、提升专业性：\n\n${text}`;

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: 'system',
              content: this.config.systemPrompt
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          stream: true
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API 请求失败: ${response.status}`);
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
              const content = json.choices[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch (e) {
              console.warn('解析 SSE 数据失败:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('DeepSeek API 流式调用失败:', error);
      throw error;
    }
  }
}

// 导出单例
const deepSeekConfig = new DeepSeekConfig();
