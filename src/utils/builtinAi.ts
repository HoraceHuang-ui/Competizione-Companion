// 内置 AI 通道（非 BYOK 时使用）：
// - DeepSeek 走自己的服务器中转（首次响应超时后由调用方回退到 GPT-OSS）
// - GPT-OSS 走 Cloudflare Workers AI，经由主进程的 axios（window.axios）发出，不受 CORS 限制

// DeepSeek 接口的首次响应（首字节）超时：超过该时间还没有收到任何数据就中断请求，
// 返回 'timeout'，由调用方决定是否回退到 GPT-OSS
export const DEEPSEEK_FIRST_RESPONSE_TIMEOUT = 20_000

export const GPT_OSS_MODEL = 'gpt-oss-120b'

const DEEPSEEK_URL = 'https://api.hh17.top/competizione/ai/deepseek'
const DEEPSEEK_APP_TOKEN = 'maimaidx'

export type DeepSeekStreamStatus = 'ok' | 'timeout' | 'error'

export interface DeepSeekStreamOptions {
  // 外部中断（例如用户改了输入、作废当前分析）
  signal?: AbortSignal
  // 响应头已到、开始读取正文前回调（此时可以插入占位的助手消息）
  onOpen?: () => void
}

/**
 * 以流式方式调用内置 DeepSeek 接口。
 *
 * 每收到一段正文就回调一次 `onChunk`（原始文本，SSE 的拆行解析由调用方负责）；
 * 若 `DEEPSEEK_FIRST_RESPONSE_TIMEOUT` 内没有收到第一段正文则中断请求并返回 'timeout'。
 */
export async function streamDeepSeekRaw(
  body: unknown,
  onChunk: (text: string) => void,
  options: DeepSeekStreamOptions = {},
): Promise<DeepSeekStreamStatus> {
  const controller = new AbortController()

  // 外部中断同样要能立刻停掉请求
  const onExternalAbort = () => controller.abort()
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort()
    } else {
      options.signal.addEventListener('abort', onExternalAbort)
    }
  }

  let timedOut = false
  let timeoutTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, DEEPSEEK_FIRST_RESPONSE_TIMEOUT)

  try {
    const response = await fetch(DEEPSEEK_URL, {
      headers: {
        'X-App-Token': DEEPSEEK_APP_TOKEN,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok || !response.body) {
      throw new Error('Invalid response')
    }

    options.onOpen?.()

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // 已经收到首个数据块，之后不再受首次响应超时限制
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
        timeoutTimer = null
      }

      onChunk(decoder.decode(value, { stream: true }))
    }

    return 'ok'
  } catch {
    return timedOut ? 'timeout' : 'error'
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer)
    options.signal?.removeEventListener('abort', onExternalAbort)
  }
}

const CF_ACCOUNT_ID = 'b666bcb97b0bdc3983313c378229ce79'
const CF_API_TOKEN = 'qumdW8_T-1hXUTKo4rm7QVUlYwnXfv2i7Bxr2Pkc'
const CF_GPT_OSS_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/openai/gpt-oss-120b`

export interface GptOssResult {
  content: string
  reasoning: string
}

// 调用 GPT-OSS。返回结构无法识别时抛错，由调用方统一按“回复失败”处理。
export async function requestGptOss(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 10000,
): Promise<GptOssResult> {
  const apiResult = await window.axios.post(
    CF_GPT_OSS_URL,
    JSON.stringify({
      max_tokens: maxTokens,
      top_p: 0.05,
      top_k: 3,
      temperature: 0.4,
      stream: false,
      messages,
    }),
    {
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    },
  )

  // 兼容新旧两种返回结构
  const result = apiResult?.result || apiResult
  const message =
    result?.choices?.[0]?.message || apiResult?.choices?.[0]?.message
  if (!message) {
    throw new Error('Unexpected GPT-OSS response')
  }

  return {
    content: message.content || '',
    reasoning: message.reasoning_content || '',
  }
}
