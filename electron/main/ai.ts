// 自定义 AI 提供商（BYOK）的主进程实现。
//
// 放在主进程而不是渲染进程的原因：
// 1. 渲染进程直接请求第三方接口受 CORS 约束（Anthropic / OpenAI 官方接口都不允许浏览器直连）；
// 2. 流式响应需要一个长连接，主进程用 axios 的 stream 模式更好控制中断；
// 3. 用户的 API Key 不需要进入渲染进程之外的地方（仅随请求转发）。
//
// 统一把三种协议的流式响应归一化成 { type: 'content' | 'reasoning' | 'usage' } 增量，
// 通过 'ai:stream:event' 推给渲染进程，渲染进程只认这一套格式。

import { ipcMain } from 'electron'
import axios from 'axios'
import type { Readable } from 'node:stream'

export type CustomAiApiType = 'chatCompletions' | 'responses' | 'anthropic'

interface CustomAiMessage {
  role: string
  content: string
}

export interface CustomAiStartPayload {
  id: string
  apiType: CustomAiApiType
  baseUrl: string
  apiKey: string
  model: string
  messages: CustomAiMessage[]
  maxTokens?: number
}

interface AiDelta {
  id: string
  type: 'content' | 'reasoning' | 'usage'
  value: string | number
}

const DEFAULT_MAX_TOKENS = 8192

const controllers = new Map<string, AbortController>()

// 把用户填写的「API 地址」补全成具体端点：
// - 已经写到端点（.../chat/completions、.../responses、.../messages）时原样使用；
// - 以版本段结尾（.../v1、.../v1beta）时直接拼端点；
// - 其余（只有域名或一段前缀）补 /v1 + 端点。
function resolveEndpoint(baseUrl: string, apiType: CustomAiApiType): string {
  const url = (baseUrl || '').trim().replace(/\/+$/, '')
  const suffix =
    apiType === 'anthropic'
      ? '/messages'
      : apiType === 'responses'
        ? '/responses'
        : '/chat/completions'

  if (/\/(chat\/completions|responses|messages)$/.test(url)) return url
  if (/\/v\d+[a-z]*$/i.test(url)) return url + suffix
  return url + '/v1' + suffix
}

// Anthropic 不接受 system 角色出现在 messages 里，且要求首条必须是 user、
// 相邻同角色消息需要合并。助手的欢迎语会让首条变成 assistant，因此这里统一规整。
function toAnthropicMessages(messages: CustomAiMessage[]) {
  const system = messages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n')

  const chat = messages.filter(m => m.role !== 'system')
  while (chat.length && chat[0].role !== 'user') {
    chat.shift()
  }

  const merged: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const m of chat) {
    const role = m.role === 'assistant' ? 'assistant' : 'user'
    const last = merged[merged.length - 1]
    if (last && last.role === role) {
      last.content += '\n\n' + m.content
    } else {
      merged.push({ role, content: m.content })
    }
  }

  return { system, messages: merged }
}

function buildRequest(payload: CustomAiStartPayload, url: string) {
  const maxTokens = payload.maxTokens || DEFAULT_MAX_TOKENS

  if (payload.apiType === 'anthropic') {
    const { system, messages } = toAnthropicMessages(payload.messages)
    return {
      headers: {
        'x-api-key': payload.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: {
        model: payload.model,
        max_tokens: maxTokens,
        stream: true,
        ...(system ? { system } : {}),
        messages,
      },
    }
  }

  if (payload.apiType === 'responses') {
    return {
      headers: {
        Authorization: `Bearer ${payload.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: payload.model,
        input: payload.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
        max_output_tokens: maxTokens,
      },
    }
  }

  return {
    headers: {
      Authorization: `Bearer ${payload.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: payload.model,
      messages: payload.messages,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: maxTokens,
    },
  }
}

async function readAll(stream: Readable | string): Promise<string> {
  if (typeof stream === 'string') return stream
  const decoder = new TextDecoder()
  let text = ''
  for await (const chunk of stream) {
    text +=
      typeof chunk === 'string'
        ? chunk
        : decoder.decode(chunk as Buffer, { stream: true })
  }
  return text + decoder.decode()
}

function handleEvent(
  apiType: CustomAiApiType,
  evt: any,
  emit: (type: AiDelta['type'], value: string | number) => void,
) {
  if (apiType === 'anthropic') {
    if (evt.type === 'content_block_delta') {
      const delta = evt.delta || {}
      if (delta.type === 'text_delta' && delta.text) {
        emit('content', delta.text)
      } else if (delta.type === 'thinking_delta' && delta.thinking) {
        emit('reasoning', delta.thinking)
      }
    } else if (evt.type === 'message_start') {
      const usage = evt.message?.usage
      if (usage) {
        emit('usage', (usage.input_tokens || 0) + (usage.output_tokens || 0))
      }
    } else if (evt.type === 'message_delta') {
      const usage = evt.usage
      if (usage) {
        emit('usage', (usage.input_tokens || 0) + (usage.output_tokens || 0))
      }
    } else if (evt.type === 'error') {
      throw new Error(evt.error?.message || 'Anthropic response error')
    }
    return
  }

  if (apiType === 'responses') {
    if (evt.type === 'response.output_text.delta' && evt.delta) {
      emit('content', evt.delta)
    } else if (
      (evt.type === 'response.reasoning_summary_text.delta' ||
        evt.type === 'response.reasoning_text.delta') &&
      evt.delta
    ) {
      emit('reasoning', evt.delta)
    } else if (evt.type === 'response.completed') {
      const total = evt.response?.usage?.total_tokens
      if (typeof total === 'number') emit('usage', total)
    } else if (evt.type === 'response.failed' || evt.type === 'error') {
      throw new Error(
        evt.response?.error?.message || evt.message || 'Responses error',
      )
    }
    return
  }

  // Chat Completions（含 DeepSeek 等 OpenAI 兼容实现）
  if (evt.error) {
    throw new Error(evt.error.message || 'Chat completions error')
  }
  const delta = evt.choices?.[0]?.delta
  if (delta) {
    if (delta.content) emit('content', delta.content)
    if (delta.reasoning_content) {
      emit('reasoning', delta.reasoning_content)
    } else if (delta.reasoning) {
      emit('reasoning', delta.reasoning)
    }
  }
  if (typeof evt.usage?.total_tokens === 'number') {
    emit('usage', evt.usage.total_tokens)
  }
}

async function consumeSse(
  stream: Readable,
  apiType: CustomAiApiType,
  emit: (type: AiDelta['type'], value: string | number) => void,
) {
  const decoder = new TextDecoder()
  let buffer = ''

  for await (const chunk of stream) {
    buffer +=
      typeof chunk === 'string'
        ? chunk
        : decoder.decode(chunk as Buffer, { stream: true })

    let idx = buffer.indexOf('\n')
    while (idx !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, '')
      buffer = buffer.slice(idx + 1)
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim()
        if (data && data !== '[DONE]') {
          try {
            handleEvent(apiType, JSON.parse(data), emit)
          } catch (e) {
            // JSON 解析失败只是忽略这一行；接口自身返回的错误需要中断整个请求
            if (e instanceof SyntaxError) {
              // ignore malformed chunk
            } else {
              throw e
            }
          }
        }
      }
      idx = buffer.indexOf('\n')
    }
  }
}

async function runStream(
  payload: CustomAiStartPayload,
  controller: AbortController,
  emit: (type: AiDelta['type'], value: string | number) => void,
) {
  const url = resolveEndpoint(payload.baseUrl, payload.apiType)
  const { headers, body } = buildRequest(payload, url)

  const res = await axios.post(url, body, {
    headers,
    responseType: 'stream',
    signal: controller.signal,
    // 非 2xx 也要拿到响应体，好把接口的报错原样透出到日志
    validateStatus: () => true,
    // 思考型模型首字节可能很慢，这里不设超时，由调用方主动中断
    timeout: 0,
  })

  if (res.status < 200 || res.status >= 300) {
    const text = await readAll(res.data)
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`)
  }

  await consumeSse(res.data as Readable, payload.apiType, emit)
}

export function initAiStream() {
  ipcMain.handle('ai:stream:start', async (event, payload: CustomAiStartPayload) => {
    const controller = new AbortController()
    controllers.set(payload.id, controller)

    const sender = event.sender
    const send = (delta: Omit<AiDelta, 'id'>) => {
      if (!sender.isDestroyed()) {
        sender.send('ai:stream:event', { id: payload.id, ...delta })
      }
    }

    try {
      await runStream(payload, controller, (type, value) =>
        send({ type, value }),
      )
      return { ok: true }
    } catch (e: any) {
      // 被调用方中断不算失败，渲染进程会自行忽略
      return {
        ok: false,
        canceled: controller.signal.aborted,
        error: e?.message || String(e),
      }
    } finally {
      controllers.delete(payload.id)
    }
  })

  ipcMain.on('ai:stream:abort', (_event, id: string) => {
    controllers.get(id)?.abort()
  })
}
