// 自定义 AI 提供商（BYOK）客户端封装。
//
// 真正的 HTTP 请求在主进程中完成（见 electron/main/ai.ts）：
// 渲染进程直接 fetch 第三方接口会受 CORS 限制，且 Anthropic / OpenAI 等
// 官方接口并不允许浏览器直连，走主进程可以完全绕开这些问题。
// 这里只负责：判断配置是否可用、把主进程推来的增量回调用调用方能懂的形式转出去。

export type CustomAiApiType = 'chatCompletions' | 'responses' | 'anthropic'

export const CUSTOM_AI_API_TYPES: CustomAiApiType[] = [
  'chatCompletions',
  'responses',
  'anthropic',
]

// 这些是接口的专有名词，不做多语言处理
export const CUSTOM_AI_API_TYPE_LABELS: Record<CustomAiApiType, string> = {
  chatCompletions: 'Chat Completions',
  responses: 'Responses',
  anthropic: 'Anthropic',
}

export interface CustomAiConfig {
  enabled: boolean
  apiType: CustomAiApiType
  baseUrl: string
  apiKey: string
  model: string
}

export interface AiStreamCallbacks {
  onContent?: (text: string) => void
  onReasoning?: (text: string) => void
  onUsage?: (totalTokens: number) => void
}

// 仅做非空校验：填写阶段不判断地址 / Key 是否真的有效
export const customAiFilled = (ai: CustomAiConfig | undefined): boolean => {
  if (!ai) return false
  return (
    !!ai.baseUrl?.trim() && !!ai.apiKey?.trim() && !!ai.model?.trim()
  )
}

// 是否应该把请求交给自定义提供商（已开启且四项都已填写）
export const useCustomAi = (ai: CustomAiConfig | undefined): boolean =>
  !!ai?.enabled && customAiFilled(ai)

/**
 * 调用用户自定义的 AI 接口，增量内容通过回调返回。
 * @returns 是否成功；配置不完整、网络错误、接口报错都返回 false
 */
export async function streamCustomAi(
  ai: CustomAiConfig,
  messages: Array<{ role: string; content: string }>,
  options: { maxTokens?: number; signal?: AbortSignal } = {},
  callbacks: AiStreamCallbacks = {},
): Promise<boolean> {
  if (!useCustomAi(ai)) return false
  if (!window.aiStream) return false

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`

  const off = window.aiStream.onEvent(data => {
    if (!data || data.id !== id) return
    if (data.type === 'content' && typeof data.value === 'string') {
      callbacks.onContent?.(data.value)
    } else if (data.type === 'reasoning' && typeof data.value === 'string') {
      callbacks.onReasoning?.(data.value)
    } else if (data.type === 'usage' && typeof data.value === 'number') {
      callbacks.onUsage?.(data.value)
    }
  })

  // 调用方主动中断（例如事故分析被新一轮输入取消）时，通知主进程停止请求
  const onAbort = () => window.aiStream?.abort(id)
  options.signal?.addEventListener('abort', onAbort)

  try {
    const res = await window.aiStream.start({
      id,
      apiType: ai.apiType,
      baseUrl: ai.baseUrl.trim(),
      apiKey: ai.apiKey.trim(),
      model: ai.model.trim(),
      messages,
      maxTokens: options.maxTokens,
    })
    return !!res?.ok
  } catch {
    return false
  } finally {
    off()
    options.signal?.removeEventListener('abort', onAbort)
  }
}
