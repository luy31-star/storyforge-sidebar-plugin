import type { PluginConfig } from './types';

const STORAGE_KEY = 'storyforge_plugin_config';

const DEFAULT_CONFIG: PluginConfig = {
  apiBase: 'https://www.storyforge.asia',
  apiKey: '',
  model: 'sz-sd25-r2-720p',
  seconds: 10,
  size: '720p',
  quality: 'standard',
  aspectRatio: '16:9',
  parameters: {},
  fields: {},
};

/** 从 localStorage 加载配置 */
export function loadConfig(): PluginConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        aspectRatio: parsed.aspectRatio || '16:9',
        parameters: { ...DEFAULT_CONFIG.parameters, ...(parsed.parameters || {}) },
        fields: { ...DEFAULT_CONFIG.fields, ...parsed.fields },
      };
    }
  } catch (_) {}
  return { ...DEFAULT_CONFIG };
}

/** 保存配置到 localStorage */
export function saveConfig(config: PluginConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (_) {}
}

/** 从多维表格文本字段值中提取纯文本 */
export function extractTextFromFieldValue(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) return item.text;
        return '';
      })
      .join('')
      .trim();
  }
  return String(value);
}

/** 从多维表格附件字段值中提取第一个附件的 URL */
export function extractAttachmentUrls(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => item?.url || item?.tmp_url || item?.file_url || '')
      .filter(Boolean);
  }
  if (typeof value === 'object') {
    const url = value.url || value.tmp_url || value.file_url;
    return url ? [url] : [];
  }
  return [];
}

export function extractAttachmentUrl(value: any): string | null {
  if (!value) return null;
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    // 附件字段可能返回 { url, name, ... } 或 { tmp_url, ... }
    return first.url || first.tmp_url || first.file_url || null;
  }
  if (typeof value === 'object' && value !== null) {
    return value.url || value.tmp_url || value.file_url || null;
  }
  return null;
}

/** 下载视频文件为 Blob */
export async function downloadVideo(url: string, onProgress?: (percent: number) => void): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载视频失败: HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get('content-length')) || 0;
  if (!contentLength || !onProgress) {
    return response.blob();
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return response.blob();
  }

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.round((received / contentLength) * 100));
  }

  return new Blob(chunks as BlobPart[], { type: 'video/mp4' });
}

/** 格式化时间 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** 生成任务显示名称 */
export function truncateText(text: string, maxLen = 30): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}
