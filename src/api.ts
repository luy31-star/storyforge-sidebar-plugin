import type { CreateVideoParams, VideoJob, ApiError } from './types';

const DEFAULT_API_BASE = 'https://www.storyforge.asia';

export class StoryForgeApi {
  private apiBase: string;
  private apiKey: string;

  constructor(apiKey: string, apiBase?: string) {
    this.apiKey = apiKey;
    this.apiBase = apiBase || DEFAULT_API_BASE;
  }

  private getHeaders(idempotencyKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return headers;
  }

  private async handleError(res: Response): Promise<never> {
    let errorData: ApiError | null = null;
    try {
      errorData = await res.json();
    } catch (_) {}
    const message = errorData?.error?.message || `HTTP ${res.status}`;
    const code = errorData?.error?.code || 'unknown';
    throw new Error(`${message} (${code})`);
  }

  /** 创建视频生成任务 */
  async createVideo(params: CreateVideoParams): Promise<VideoJob> {
    const idempotencyKey = `sf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const body = {
      model: params.model,
      prompt: params.prompt,
      seconds: params.seconds,
      size: params.size,
      quality: params.quality,
      input_image_urls: params.input_image_urls || [],
      input_video_urls: params.input_video_urls || [],
      input_audio_urls: params.input_audio_urls || [],
      parameters: params.parameters || {},
    };

    const res = await fetch(`${this.apiBase}/v1/videos`, {
      method: 'POST',
      headers: this.getHeaders(idempotencyKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      await this.handleError(res);
    }

    return res.json();
  }

  /** 查询视频任务状态 */
  async getVideo(jobId: string): Promise<VideoJob> {
    const res = await fetch(`${this.apiBase}/v1/videos/${jobId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      await this.handleError(res);
    }

    return res.json();
  }

  /** 轮询直到完成或失败 */
  async pollUntilComplete(
    jobId: string,
    onProgress?: (job: VideoJob) => void,
    intervalMs = 5000,
    timeoutMs = 3600000, // 1小时超时
  ): Promise<VideoJob> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const job = await this.getVideo(jobId);
      onProgress?.(job);

      if (job.status === 'completed' || job.status === 'failed') {
        return job;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error('轮询超时（超过1小时）');
  }
}
