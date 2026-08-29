// ============ StoryForge API 类型定义 ============

export interface VideoJob {
  id: string;
  model: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  created_at: number;
  completed_at?: number;
  expires_at?: number;
  size: string;
  seconds: string;
  quality: string;
  prompt: string;
  data?: { url: string }[];
  error?: { message: string; code: string };
}

export interface CreateVideoParams {
  model: string;
  prompt: string;
  seconds: number;
  size: string;
  quality: string;
  input_image_urls?: string[];
  input_video_urls?: string[];
  input_audio_urls?: string[];
  parameters?: Record<string, string | number | boolean>;
}

export interface ApiError {
  error: {
    message: string;
    type: string;
    param?: string;
    code: string;
  };
}

// ============ 插件配置类型 ============

export interface FieldConfig {
  promptFieldId?: string;
  imageFieldId?: string;
  videoFieldId?: string;
  audioFieldId?: string;
  outputFieldId?: string;
}

export interface PluginConfig {
  apiBase: string;
  apiKey: string;
  model: string;
  seconds: number;
  size: string;
  quality: string;
  aspectRatio: string;
  parameters: Record<string, string | number | boolean>;
  fields: FieldConfig;
}

// ============ 任务状态 ============

export interface GenerationTask {
  id: string;
  recordId: string;
  prompt: string;
  status: 'pending' | 'creating' | 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}
