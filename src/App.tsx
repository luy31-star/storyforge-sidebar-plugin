import { useCallback, useEffect, useMemo, useState } from 'react';
import { bitable, FieldType, IAttachmentField } from '@lark-base-open/js-sdk';
import { StoryForgeApi } from './api';
import type { FieldConfig, GenerationTask, PluginConfig } from './types';
import {
  downloadVideo,
  extractAttachmentUrls,
  extractTextFromFieldValue,
  formatTime,
  loadConfig,
  saveConfig,
  truncateText,
} from './utils';

interface FieldMeta {
  id: string;
  name: string;
  type: number;
}

type ParameterValue = string | number | boolean;

type ModelOption = {
  id: string;
  provider: 'shunzao' | 'channel-one';
  providerLabel: string;
  name: string;
  variant: string;
  description: string;
  image: string;
  ratios: string[];
  durations: number[];
  resolutions: string[];
  imageRefs: number;
  videoRefs: number;
  audioRefs: number;
  minImageRefs?: number;
  requiresImage?: boolean;
  supportsVideoReference?: boolean;
  supportsAudioReference?: boolean;
  supportsTextToVideo?: boolean;
  specOptions?: { value: string; label: string }[];
  defaultParameters?: Record<string, ParameterValue>;
  limitations: string[];
  pricePoints: number;
  billingUnit: string;
};

// Sidebar deliberately exposes only the approved StoryForge routes for this release.
const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'sz-sd25-r2-720p', provider: 'shunzao', providerLabel: '瞬造', name: 'Seedance 2.5', variant: '720p · 15–30 秒',
    description: '高质量参考生视频，适合正式交付。', image: '/showcase/neon-city.jpg', pricePoints: 8, billingUnit: '次',
    ratios: ['16:9', '9:16'], durations: Array.from({ length: 16 }, (_, index) => index + 15), resolutions: ['720p'], imageRefs: 30, videoRefs: 10, audioRefs: 10,
    minImageRefs: 1, requiresImage: true, supportsVideoReference: true, supportsAudioReference: true, supportsTextToVideo: false,
    limitations: ['8 积分 / 次', '至少 1 张参考图', '最多 30 张图片 · 10 个视频 · 10 段音频'],
  },
  {
    id: 'sz-sd25-r2-480p', provider: 'shunzao', providerLabel: '瞬造', name: 'Seedance 2.5', variant: '480p · 20–30 秒',
    description: '更快出片，适合预览和批量分镜。', image: '/showcase/orbit.jpg', pricePoints: 6, billingUnit: '次',
    ratios: ['16:9', '9:16'], durations: Array.from({ length: 11 }, (_, index) => index + 20), resolutions: ['480p'], imageRefs: 30, videoRefs: 10, audioRefs: 10,
    minImageRefs: 1, requiresImage: true, supportsVideoReference: true, supportsAudioReference: true, supportsTextToVideo: false,
    limitations: ['6 积分 / 次', '至少 1 张参考图', '最多 30 张图片 · 10 个视频 · 10 段音频'],
  },
  {
    id: 'lec-seedance-2-0-933-stable', provider: 'channel-one', providerLabel: '渠道一', name: 'Seedance 2.0', variant: '933 Stable · 10 / 15 秒',
    description: '渠道一稳定版 933，适合可控的短视频生成。', image: '/showcase/watch.jpg', pricePoints: 4.3, billingUnit: '次',
    ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], durations: [10, 15], resolutions: [], imageRefs: 9, videoRefs: 0, audioRefs: 0, supportsTextToVideo: true,
    specOptions: [{ value: 'full_933_720p_mx', label: '满血 · 933 · 720P MX' }, { value: 'full_933_1080p', label: '满血 · 933 · 1080P' }, { value: 'super_933_1080p', label: '超分 · 933 · 1080P' }],
    defaultParameters: { spec: 'full_933_1080p' }, limitations: ['4.3 积分 / 次', '最多 9 张参考图片', '支持纯文生视频 · 不支持视频/音频参考'],
  },
  {
    id: 'MiniMaxH3', provider: 'channel-one', providerLabel: 'CNTCN', name: 'MiniMax H3', variant: '2K · 5–15 秒',
    description: '图片驱动的视频生成，支持音频参考，不支持纯文生。', image: '/showcase/city.jpg', pricePoints: 2.5, billingUnit: '次',
    ratios: ['16:9', '9:16'], durations: Array.from({ length: 11 }, (_, index) => index + 5), resolutions: ['2K'], imageRefs: 9, minImageRefs: 1, videoRefs: 0, audioRefs: 3,
    requiresImage: true, supportsVideoReference: false, supportsAudioReference: true, supportsTextToVideo: false,
    limitations: ['2.5 积分 / 次', '至少 1 张、最多 9 张图片', '最多 3 段音频 · 不支持视频参考 · 不支持纯文生 · 固定 2K'],
  },
];

const SHOWCASE = [
  { title: '霓虹夜航', image: '/showcase/neon-city.jpg' },
  { title: '零重力讯号', image: '/showcase/orbit.jpg' },
  { title: '清晨产品片', image: '/showcase/watch.jpg' },
];

const statusLabel: Record<GenerationTask['status'], string> = {
  pending: '等待中',
  creating: '准备中',
  queued: '排队中',
  in_progress: '生成中',
  completed: '已完成',
  failed: '失败',
};

const getModel = (modelId: string) =>
  MODEL_OPTIONS.find((item) => item.id === modelId) || MODEL_OPTIONS[0];

function normalizeConfig(config: PluginConfig): PluginConfig {
  const model = getModel(config.model);
  const duration = model.durations.includes(config.seconds)
    ? config.seconds
    : model.durations[0];
  const aspectRatio = model.ratios.includes(config.aspectRatio)
    ? config.aspectRatio
    : model.ratios[0];
  const parameters = { ...(config.parameters || {}), ...(model.defaultParameters || {}) };
  if (model.specOptions?.length) {
    const selectedSpec = String(config.parameters?.spec || '');
    parameters.spec = model.specOptions.some((item) => item.value === selectedSpec)
      ? selectedSpec
      : model.specOptions[0].value;
  }
  return {
    ...config,
    model: model.id,
    seconds: duration,
    aspectRatio,
    size: model.resolutions.includes(config.size) ? config.size : model.resolutions[0] || 'auto',
    parameters,
  };
}

export default function App() {
  const [config, setConfig] = useState<PluginConfig>(() => normalizeConfig(loadConfig()));
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedRecordData, setSelectedRecordData] = useState<Record<string, any> | null>(null);
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  const [showConfig, setShowConfig] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSdkReady, setIsSdkReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [table, setTable] = useState<any>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const activeTable = await bitable.base.getActiveTable();
        setTable(activeTable);
        const fieldMetaList = await activeTable.getFieldMetaList();
        setFields(fieldMetaList as unknown as FieldMeta[]);
        setIsSdkReady(true);
        bitable.base.onSelectionChange(async (selection: any) => {
          const recordId = selection?.recordId;
          if (!recordId) return;
          setSelectedRecordId(recordId);
          try {
            const record = await activeTable.getRecordById(recordId);
            setSelectedRecordData(record?.fields || {});
          } catch (_) {
            setSelectedRecordData(null);
          }
        });
      } catch (err: any) {
        setError(`初始化失败：${err?.message || err}`);
      }
    };
    void init();
  }, []);

  const updateConfig = useCallback((patch: Partial<PluginConfig>) => {
    setConfig((previous) => {
      const next = { ...previous, ...patch };
      saveConfig(next);
      return next;
    });
  }, []);

  const updateFieldConfig = useCallback((patch: Partial<FieldConfig>) => {
    setConfig((previous) => {
      const next = { ...previous, fields: { ...previous.fields, ...patch } };
      saveConfig(next);
      return next;
    });
  }, []);

  const updateTask = useCallback((taskId: string, patch: Partial<GenerationTask>) => {
    setTasks((previous) => previous.map((task) => (task.id === taskId ? { ...task, ...patch } : task)));
  }, []);

  const selectedModel = useMemo(() => getModel(config.model), [config.model]);
  const textFields = fields.filter((field) => field.type === FieldType.Text);
  const attachmentFields = fields.filter((field) => field.type === FieldType.Attachment);
  const selectedDuration = selectedModel.durations.includes(config.seconds)
    ? config.seconds
    : selectedModel.durations[0];
  const selectedRatio = selectedModel.ratios.includes(config.aspectRatio)
    ? config.aspectRatio
    : selectedModel.ratios[0];
  const selectedSize = selectedModel.resolutions.includes(config.size)
    ? config.size
    : selectedModel.resolutions[0] || 'auto';
  const selectedSpec = selectedModel.specOptions?.find(
    (option) => option.value === String(config.parameters?.spec),
  ) || selectedModel.specOptions?.[0];
  const setupReady = Boolean(
    config.apiKey
      && config.fields.promptFieldId
      && config.fields.outputFieldId
      && (!selectedModel.requiresImage || config.fields.imageFieldId),
  );
  const mappingReady = Boolean(
    config.fields.promptFieldId
      && config.fields.outputFieldId
      && (!selectedModel.requiresImage || config.fields.imageFieldId),
  );

  const selectModel = useCallback(
    (modelId: string) => {
      const nextModel = getModel(modelId);
      const next: PluginConfig = {
        ...config,
        model: nextModel.id,
        seconds: nextModel.durations[0],
        aspectRatio: nextModel.ratios[0],
        size: nextModel.resolutions[0] || 'auto',
        parameters: { ...(nextModel.defaultParameters || {}) },
      };
      setConfig(next);
      saveConfig(next);
      setShowModels(false);
    },
    [config],
  );

  const updateParameter = useCallback(
    (key: string, value: ParameterValue) => {
      updateConfig({ parameters: { ...config.parameters, [key]: value } });
    },
    [config.parameters, updateConfig],
  );

  const generateForRecord = useCallback(
    async (recordId: string, recordData: Record<string, any>) => {
      const fieldConfig = config.fields;
      if (!config.apiKey) {
        setError('请先填写 StoryForge API Key');
        return;
      }
      if (!fieldConfig.promptFieldId || !fieldConfig.outputFieldId) {
        setError('请先完成“提示词字段”和“输出视频字段”配置');
        return;
      }

      const prompt = extractTextFromFieldValue(recordData[fieldConfig.promptFieldId]);
      if (!prompt) {
        setError('选中行的提示词字段为空，已跳过该记录');
        return;
      }

      const imageUrls = fieldConfig.imageFieldId
        ? extractAttachmentUrls(recordData[fieldConfig.imageFieldId])
        : [];
      // Ignore persisted mappings for unsupported reference types after a model switch.
      // This keeps a previously configured field from making a valid request fail.
      const videoUrls = selectedModel.supportsVideoReference && fieldConfig.videoFieldId
        ? extractAttachmentUrls(recordData[fieldConfig.videoFieldId])
        : [];
      const audioUrls = selectedModel.supportsAudioReference && fieldConfig.audioFieldId
        ? extractAttachmentUrls(recordData[fieldConfig.audioFieldId])
        : [];

      const minImageRefs = selectedModel.minImageRefs || (selectedModel.requiresImage ? 1 : 0);
      if (imageUrls.length < minImageRefs) {
        setError(`当前模型至少需要 ${minImageRefs} 张参考图片，请配置参考图片字段`);
        return;
      }
      if (imageUrls.length > selectedModel.imageRefs) {
        setError(`当前模型最多支持 ${selectedModel.imageRefs} 张参考图片，请减少参考图数量`);
        return;
      }
      if (videoUrls.length > selectedModel.videoRefs) {
        setError(`当前模型最多支持 ${selectedModel.videoRefs} 个参考视频，请减少附件数量`);
        return;
      }
      if (audioUrls.length > selectedModel.audioRefs) {
        setError(`当前模型最多支持 ${selectedModel.audioRefs} 个参考音频，请减少附件数量`);
        return;
      }

      const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setTasks((previous) => [
        {
          id: taskId,
          recordId,
          prompt,
          status: 'creating',
          progress: 5,
          createdAt: Date.now(),
        },
        ...previous,
      ]);

      try {
        const api = new StoryForgeApi(config.apiKey, config.apiBase);
        const parameters: Record<string, ParameterValue> = {
          ...(config.parameters || {}),
          duration: selectedDuration,
          aspect_ratio: selectedRatio,
          ratio: selectedRatio,
          resolution: selectedSize,
        };
        const job = await api.createVideo({
          model: selectedModel.id,
          prompt,
          seconds: selectedDuration,
          size: selectedSize,
          quality: 'standard',
          input_image_urls: imageUrls.length ? imageUrls : undefined,
          input_video_urls: selectedModel.supportsVideoReference && videoUrls.length ? videoUrls : undefined,
          input_audio_urls: selectedModel.supportsAudioReference && audioUrls.length ? audioUrls : undefined,
          parameters,
        });

        updateTask(taskId, { status: job.status, progress: job.progress || 10 });
        const finalJob = await api.pollUntilComplete(
          job.id,
          (currentJob) => updateTask(taskId, { status: currentJob.status, progress: currentJob.progress || 0 }),
          5000,
          3600000,
        );

        if (finalJob.status === 'failed') {
          updateTask(taskId, { status: 'failed', error: finalJob.error?.message || '生成失败' });
          return;
        }

        const videoDownloadUrl = finalJob.data?.[0]?.url;
        if (!videoDownloadUrl) {
          updateTask(taskId, { status: 'failed', error: '生成完成但未获取到视频 URL' });
          return;
        }

        updateTask(taskId, { status: 'in_progress', progress: 95, videoUrl: videoDownloadUrl });
        try {
          const videoBlob = await downloadVideo(videoDownloadUrl);
          const videoFile = new File([videoBlob], `storyforge_${job.id.replace(/^video_/, '')}.mp4`, { type: 'video/mp4' });
          const outputField = await table.getField(fieldConfig.outputFieldId) as IAttachmentField;
          await outputField.setValue(recordId, videoFile);
          updateTask(taskId, { status: 'completed', progress: 100, completedAt: Date.now() });
        } catch (writeErr: any) {
          updateTask(taskId, {
            status: 'completed',
            progress: 100,
            error: `视频已生成，但回写表格失败：${writeErr?.message || writeErr}`,
            completedAt: Date.now(),
          });
        }
      } catch (err: any) {
        const message = err?.message || '未知错误';
        updateTask(taskId, { status: 'failed', error: message });
        if (message.includes('insufficient_balance') || message.includes('余额不足')) setError('账户余额不足，请充值后重试');
        else if (message.includes('invalid_api_key') || message.includes('API key')) setError('API Key 无效，请检查配置');
      }
    },
    [config, selectedModel, selectedDuration, selectedRatio, selectedSize, table, updateTask],
  );

  const handleGenerateSelected = useCallback(async () => {
    if (!selectedRecordId || !selectedRecordData) {
      setError('请先在表格中选中一行记录');
      return;
    }
    setIsGenerating(true);
    setError(null);
    await generateForRecord(selectedRecordId, selectedRecordData);
    setIsGenerating(false);
  }, [generateForRecord, selectedRecordData, selectedRecordId]);

  const handleBatchGenerate = useCallback(async () => {
    if (!table) return;
    setIsGenerating(true);
    setError(null);
    try {
      const recordIdList = await table.getRecordIdList();
      for (const recordId of recordIdList) {
        const record = await table.getRecordById(recordId);
        if (record?.fields) await generateForRecord(recordId, record.fields);
      }
    } catch (err: any) {
      setError(`批量生成失败：${err?.message || err}`);
    }
    setIsGenerating(false);
  }, [generateForRecord, table]);

  const handleRetry = useCallback(async (task: GenerationTask) => {
    if (!table) return;
    const record = await table.getRecordById(task.recordId);
    if (record?.fields) {
      setTasks((previous) => previous.filter((item) => item.id !== task.id));
      await generateForRecord(task.recordId, record.fields);
    }
  }, [generateForRecord, table]);

  const runningCount = tasks.filter((task) => ['creating', 'queued', 'in_progress'].includes(task.status)).length;
  const completedCount = tasks.filter((task) => task.status === 'completed').length;
  const failedCount = tasks.filter((task) => task.status === 'failed').length;

  return (
    <main className="app-shell">
      <section className="hero-card">
        <img src="/showcase/neon-city.jpg" alt="StoryForge 视频生成灵感" className="hero-image" />
        <div className="hero-shade" />
        <div className="hero-content">
          <div className="hero-kicker"><span className="brand-dot" /> STORYFORGE × 飞书多维表格</div>
          <h1>把一行灵感，变成一支视频</h1>
          <p>从当前记录读取提示词和参考素材，生成完成后自动写回附件字段。</p>
          <div className="hero-pills"><span>模型已对齐 StoryForge</span><span>参数按模型约束显示</span></div>
        </div>
      </section>

      <section className="inspiration-strip" aria-label="灵感预览">
        <div className="strip-heading"><span>灵感预览</span><small>选择一行记录开始创作</small></div>
        <div className="showcase-row">
          {SHOWCASE.map((item) => (
            <div className="showcase-card" key={item.title}>
              <img src={item.image} alt={item.title} />
              <span>{item.title}</span>
            </div>
          ))}
        </div>
      </section>

      {error && <button className="alert alert-error" onClick={() => setError(null)}>{error}<span>×</span></button>}

      <section className="panel setup-panel">
        <div className="panel-heading">
          <div><span className="step-index">01</span><div><h2>开始前准备</h2><p>只填写真正需要的信息，配置会自动保存。</p></div></div>
          <button className="text-button" onClick={() => setShowConfig((value) => !value)}>{showConfig ? '收起' : '展开'} <span>{showConfig ? '⌃' : '⌄'}</span></button>
        </div>
        {showConfig && <div className="setup-body">
          <div className="form-row required-row">
            <label htmlFor="api-key">StoryForge API Key <em>必填</em></label>
            <input id="api-key" type="password" placeholder="sk-fd-xxxxxxxx" value={config.apiKey} onChange={(event) => updateConfig({ apiKey: event.target.value.trim() })} />
            <small>在 StoryForge API 门户通过邮箱验证码获取，仅保存在当前浏览器。</small>
          </div>
          <div className="mapping-heading"><div><strong>字段映射</strong><span>告诉插件从哪一列读取、写回</span></div><span className="mapping-status">{mappingReady ? '已完成' : '还差必填项'}</span></div>
          <div className="field-grid">
            <FieldSelect label="提示词字段" required value={config.fields.promptFieldId} options={textFields} placeholder="选择文本字段" onChange={(value) => updateFieldConfig({ promptFieldId: value })} />
            <FieldSelect label="输出视频字段" required value={config.fields.outputFieldId} options={attachmentFields} placeholder="选择附件字段" onChange={(value) => updateFieldConfig({ outputFieldId: value })} />
            <FieldSelect label="参考图片字段" required={selectedModel.requiresImage} value={config.fields.imageFieldId} options={attachmentFields} placeholder="不使用参考图" onChange={(value) => updateFieldConfig({ imageFieldId: value || undefined })} hint={selectedModel.requiresImage ? '当前模型必填' : '可选'} />
            {selectedModel.supportsVideoReference && <FieldSelect label="参考视频字段" value={config.fields.videoFieldId} options={attachmentFields} placeholder="不使用参考视频" onChange={(value) => updateFieldConfig({ videoFieldId: value || undefined })} hint="可选" />}
            {selectedModel.supportsAudioReference && <FieldSelect label="参考音频字段" value={config.fields.audioFieldId} options={attachmentFields} placeholder="不使用参考音频" onChange={(value) => updateFieldConfig({ audioFieldId: value || undefined })} hint="可选" />}
          </div>
          <button
            className="advanced-toggle"
            aria-expanded={showAdvanced}
            aria-controls="advanced-settings"
            onClick={() => setShowAdvanced((value) => !value)}
          ><span>高级设置</span><span>{showAdvanced ? '收起' : 'API 地址等'}</span></button>
          {showAdvanced && <div className="form-row advanced-row" id="advanced-settings"><label htmlFor="api-base">API 地址</label><input id="api-base" type="text" value={config.apiBase} onChange={(event) => updateConfig({ apiBase: event.target.value })} placeholder="https://www.storyforge.asia" /></div>}
        </div>}
      </section>

      <section className="panel model-panel">
        <div className="panel-heading model-heading">
          <div><span className="step-index">02</span><div><h2>选择模型</h2><p>仅开放 4 个已对齐 StoryForge 的模型，价格按次透明显示。</p></div></div>
          <span className="approved-badge"><span />已开放 {MODEL_OPTIONS.length} 个</span>
        </div>
        <button
          className={`model-selected ${showModels ? 'is-open' : ''}`}
          aria-expanded={showModels}
          aria-controls="model-options"
          onClick={() => setShowModels((value) => !value)}
        >
          <img src={selectedModel.image} alt="" />
          <span className="model-selected-copy"><strong>{selectedModel.name}</strong><small>{selectedModel.providerLabel} · {selectedModel.variant} · {selectedModel.pricePoints} 积分 / 次</small></span>
          <span className="model-chevron">{showModels ? '⌃' : '⌄'}</span>
        </button>
        {showModels && <div className="model-options" id="model-options">
          {MODEL_OPTIONS.map((model) => <button key={model.id} className={`model-option ${model.id === selectedModel.id ? 'active' : ''}`} onClick={() => selectModel(model.id)}>
            <img src={model.image} alt="" /><span className="model-option-copy"><span className="provider-label">{model.providerLabel}</span><strong>{model.name}</strong><small>{model.variant} · {model.pricePoints} 积分 / 次</small><em>{model.description}</em></span>{model.id === selectedModel.id && <span className="check-mark">✓</span>}
          </button>)}
        </div>}
        <div className="model-detail"><div className="model-detail-top"><div><span className="provider-label">{selectedModel.providerLabel}</span><h3>{selectedModel.name}</h3><p>{selectedModel.description}</p><strong className="model-price">{selectedModel.pricePoints} 积分 / 次</strong></div><img src={selectedModel.image} alt="" /></div><div className="capability-tags">{selectedModel.limitations.map((item) => <span key={item}>{item}</span>)}</div></div>
      </section>

      <section className="panel parameter-panel">
        <div className="panel-heading"><div><span className="step-index">03</span><div><h2>生成参数</h2><p>仅显示当前模型支持的选项。</p></div></div><span className="constraint-note">已按模型约束</span></div>
        <div className="parameter-grid">
          <SelectControl label="画幅" value={selectedRatio} options={selectedModel.ratios.map((value) => ({ value, label: value === '16:9' ? '16:9 · 横屏' : value === '9:16' ? '9:16 · 竖屏' : value }))} onChange={(value) => updateConfig({ aspectRatio: value })} />
          <SelectControl label="时长" value={String(selectedDuration)} options={selectedModel.durations.map((value) => ({ value: String(value), label: `${value} 秒` }))} onChange={(value) => updateConfig({ seconds: Number(value) })} />
          {selectedModel.resolutions.length > 1 && <SelectControl label="清晰度" value={selectedSize} options={selectedModel.resolutions.map((value) => ({ value, label: value.toUpperCase() }))} onChange={(value) => updateConfig({ size: value })} />}
          {selectedModel.specOptions && <SelectControl label="规格" value={selectedSpec?.value || ''} options={selectedModel.specOptions} onChange={(value) => updateParameter('spec', value)} />}
        </div>
        <div className="constraint-summary"><span className="constraint-icon">✦</span><span>{selectedModel.limitations.join(' · ')}</span></div>
      </section>

      {selectedRecordId && <section className="selected-record"><div className="record-icon">↳</div><div><strong>当前记录已选中</strong><span>ID：{selectedRecordId.slice(0, 12)}…</span>{selectedRecordData && config.fields.promptFieldId && <p>{truncateText(extractTextFromFieldValue(selectedRecordData[config.fields.promptFieldId]), 72) || '提示词字段为空'}</p>}</div><span className="record-check">✓</span></section>}

      <section className="action-panel">
        <div className="action-copy"><strong>{setupReady ? '准备就绪，可以开始生成' : '完成上方必填配置后开始'}</strong><span>{selectedRecordId ? '当前记录将写入输出视频字段' : '请先在多维表格中选中一行记录'}</span></div>
        <div className="action-buttons"><button className="btn btn-primary" onClick={handleGenerateSelected} disabled={isGenerating || !selectedRecordId || !setupReady}>{isGenerating ? '生成中…' : '生成当前记录'}</button><button className="btn btn-secondary" onClick={handleBatchGenerate} disabled={isGenerating || !setupReady}>批量生成</button></div>
      </section>

      {tasks.length > 0 && <div className="stats-bar"><span>任务 <b>{tasks.length}</b></span><span className="stat-running">进行中 <b>{runningCount}</b></span><span className="stat-success">完成 <b>{completedCount}</b></span><span className="stat-failed">失败 <b>{failedCount}</b></span></div>}

      {tasks.length > 0 ? <section className="task-list">{tasks.map((task) => <article className="task-card" key={task.id}><div className="task-header"><div className="task-title-wrap"><span className={`task-status-dot dot-${task.status}`} /><span className="task-prompt" title={task.prompt}>{truncateText(task.prompt, 42)}</span></div><span className={`status-tag status-${task.status}`}>{statusLabel[task.status]}</span></div><div className="task-meta">记录 {task.recordId.slice(0, 10)}… · {formatTime(task.createdAt)}</div>{['creating', 'queued', 'in_progress'].includes(task.status) && <div className="progress-bar"><div className="progress-fill" style={{ width: `${task.progress}%` }} /></div>}{task.error && <div className="task-error">{task.error}</div>}<div className="task-actions">{task.status === 'failed' && <button className="btn btn-secondary btn-sm" onClick={() => handleRetry(task)}>重试</button>}{task.videoUrl && task.status === 'completed' && <a className="btn btn-secondary btn-sm" href={task.videoUrl} target="_blank" rel="noopener noreferrer">下载视频</a>}<button className="btn btn-ghost btn-sm" onClick={() => setTasks((previous) => previous.filter((item) => item.id !== task.id))}>移除</button></div></article>)}</section> : <section className="empty-state"><div className="empty-visual"><img src="/showcase/orbit.jpg" alt="" /><span>✦</span></div><strong>{isSdkReady ? '从一条记录开始你的第一支视频' : '正在连接飞书多维表格…'}</strong><p>{isSdkReady ? '配置字段映射后，选中记录即可开始。' : '请在飞书多维表格中打开此插件。'}</p></section>}
      {!isSdkReady && !error && <div className="alert alert-info">插件需要在飞书多维表格环境中运行，浏览器直接打开时无法读取当前表格。</div>}
    </main>
  );
}

function FieldSelect({ label, required, value, options, placeholder, hint, onChange }: { label: string; required?: boolean; value?: string; options: FieldMeta[]; placeholder: string; hint?: string; onChange: (value: string) => void }) {
  const fieldId = `field-${label}`;
  return <div className="form-row"><label htmlFor={fieldId}>{label} {required && <em>必填</em>}{hint && !required && <small>{hint}</small>}</label><select id={fieldId} value={value || ''} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></div>;
}

function SelectControl({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <div className="form-row compact-control"><label>{label}</label><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}
