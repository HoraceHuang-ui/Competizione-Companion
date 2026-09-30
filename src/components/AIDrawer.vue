<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useStore } from '@/store'
import { marked } from 'marked'
import { translate } from '@/i18n'
import '@mdui/icons/close--rounded.js'
import '@mdui/icons/maps-ugc--rounded.js'
import '@mdui/icons/arrow-upward--rounded.js'
import '@mdui/icons/content-copy--rounded.js'
import '@mdui/icons/check--rounded.js'
import ScrollWrapper from './ScrollWrapper.vue'
import '@mdui/icons/generating-tokens.js'
import 'mdui/components/collapse.js'
import 'mdui/components/collapse-item.js'
import '@mdui/icons/keyboard-arrow-down--rounded.js'
import ChipSelect from './ChipSelect.vue'
import aiPrompt from '@/assets/AIPrompt.txt?raw'
import { customAiFilled, streamCustomAi } from '@/utils/customAi'
import { GPT_OSS_MODEL, requestGptOss, streamDeepSeekRaw } from '@/utils/builtinAi'
import { snackbar } from 'mdui'

const store = useStore()

const userInput = ref('')
const loading = ref(false)
const isComposing = ref(false)
const hoveredIdx = ref<number | null>(null)
const checkedIdx = ref<number | null>(null)

const selectedModel = computed({
  get: () => store.general.aiModel,
  set: (val: string) => {
    store.general.aiModel = val
  },
})
const modelOptions = ['gpt-oss-120b', 'deepseek-v4-pro', 'deepseek-v4-flash']

// 开启自定义 AI 提供商后，模型与内置额度都由用户自己的接口决定，
// 因此内置的模型选择器与用量条不再展示，也不做内置额度拦截。
const customAiOn = computed(() => store.settings.ai.enabled)

const TOKEN_LIMITS: Record<string, number> = {
  'deepseek-v4-pro': 100_000,
  'deepseek-v4-flash': 300_000,
}
const MODEL_KEY: Record<string, 'pro' | 'flash'> = {
  'deepseek-v4-pro': 'pro',
  'deepseek-v4-flash': 'flash',
}

function getToday(): string {
  return new Date().toISOString().split('T')[0]!
}

function checkAndResetTokenUsage() {
  const today = getToday()
  for (const key of ['pro', 'flash'] as const) {
    if (store.tokenUsage[key].date !== today) {
      store.tokenUsage[key] = { date: today, token: 0 }
    }
  }
}

function isTokenLimitExceeded(): boolean {
  if (customAiOn.value) return false
  if (selectedModel.value === 'gpt-oss-120b') return false
  const key = MODEL_KEY[selectedModel.value]
  if (!key) return false
  return (
    store.tokenUsage[key].token >=
    (TOKEN_LIMITS[selectedModel.value] || Infinity)
  )
}

const tokenUsageKey = computed(() => MODEL_KEY[selectedModel.value])
const tokenLimit = computed(() => TOKEN_LIMITS[selectedModel.value] || 0)
const tokenUsed = computed(() => {
  const key = tokenUsageKey.value
  return key ? store.tokenUsage[key].token : 0
})
const showTokenBar = computed(
  () => !customAiOn.value && selectedModel.value !== 'gpt-oss-120b',
)

function formatTokenCount(n: number): string {
  return (n / 1000).toFixed(1) + 'K'
}

const tokenTooltip = computed(() =>
  translate('ai.tokenUsageTooltip', {
    used: formatTokenCount(tokenUsed.value),
    limit: formatTokenCount(tokenLimit.value),
  }),
)

async function copyMessage(content: string, idx: number) {
  try {
    await navigator.clipboard.writeText(content ?? '')
    checkedIdx.value = idx
    setTimeout(() => {
      checkedIdx.value = null
    }, 2000)
  } catch (error) {
    // ignore clipboard failures
  }
}

function onEnterKey(e: KeyboardEvent) {
  if (isComposing.value) return
  e.preventDefault()
  sendMessage()
}

function getChatHistory() {
  if (!store.messages?.length) {
    store.addMessage({
      role: 'system',
      content: aiPrompt,
    })
    store.addMessage({
      role: 'assistant',
      content: translate('ai.welcomeMsg'),
    })
  }
  return store.messages
}

async function sendMessage() {
  if (!userInput.value.trim() || loading.value) return
  checkAndResetTokenUsage()
  if (isTokenLimitExceeded()) {
    store.addMessage({ role: 'user', content: userInput.value })
    userInput.value = ''
    store.addMessage({
      role: 'assistant',
      content: translate('ai.tokenLimitExceeded'),
    })
    return
  }
  store.addMessage({ role: 'user', content: userInput.value })
  loading.value = true
  const messages = getChatHistory().map(msg => ({
    role: msg.role,
    content: msg.content,
  }))
  userInput.value = ''

  if (customAiOn.value) {
    await sendCustomMessage(messages)
  } else if (selectedModel.value === 'gpt-oss-120b') {
    await sendGptMessage(messages)
  } else {
    const result = await sendDeepSeekMessage(messages)
    if (result === 'timeout') {
      // DeepSeek 首次响应超时：自动把模型切到 GPT-OSS 并重新发送
      store.general.aiModel = GPT_OSS_MODEL
      snackbar({
        message: translate('ai.deepseekTimeoutFallback'),
        autoCloseDelay: 3000,
      })
      await sendGptMessage(messages)
    }
  }

  loading.value = false
}

// 走用户在设置里填写的自定义接口（BYOK）
async function sendCustomMessage(
  messages: Array<{ role: string; content: string }>,
) {
  // 只做非空校验：四项里有任何一项为空都视为配置不完整
  if (!customAiFilled(store.settings.ai)) {
    store.addMessage({
      role: 'assistant',
      content: translate('ai.customAiError'),
    })
    return
  }

  store.addMessage({ role: 'assistant', content: '', reasoning: '' })
  const msgIdx = store.messages.length - 1

  const ok = await streamCustomAi(
    store.settings.ai,
    messages,
    { maxTokens: 4096 },
    {
      onContent: text => {
        const msg = store.messages[msgIdx]
        if (msg) msg.content += text
      },
      onReasoning: text => {
        const msg = store.messages[msgIdx]
        if (msg) msg.reasoning = (msg.reasoning || '') + text
      },
    },
  )

  const finalMsg = store.messages[msgIdx]
  if (!finalMsg) return

  if (!ok) {
    // 接口报错（网络错误、鉴权失败、地址或模型名写错等）统一提示去设置页检查
    finalMsg.content = translate('ai.customAiError')
    finalMsg.reasoning = ''
    return
  }

  if (!finalMsg.content) {
    finalMsg.content = translate('ai.invalidResponse')
  }
}

async function sendGptMessage(
  messages: Array<{ role: string; content: string }>,
) {
  userInput.value = ''
  try {
    const { content, reasoning } = await requestGptOss(messages)
    store.addMessage({
      role: 'assistant',
      content,
      reasoning,
    })
  } catch (e) {
    store.addMessage({
      role: 'assistant',
      content: translate('ai.invalidResponse'),
    })
  }
  loading.value = false
}

// 返回 'timeout' 表示首次响应超时（由调用方决定是否回退到 GPT-OSS），
// 'error' 表示其他失败，'ok' 表示正常完成
async function sendDeepSeekMessage(
  messages: Array<{ role: string; content: string }>,
): Promise<'ok' | 'timeout' | 'error'> {
  const input = {
    messages,
    model: selectedModel.value,
    thinking: { type: 'enabled' },
    reasoning_effort: 'high',
    max_tokens: 4096,
    response_format: { type: 'text' },
    stop: null,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 1,
    top_p: 1,
    tools: null,
    tool_choice: 'none',
    logprobs: false,
    top_logprobs: null,
  }

  // 超时时可能已经先插入了一条空的助手消息（响应头已到、正文未到），需要撤掉
  let addedMsgIdx: number | null = null
  let buffer = ''
  let streamUsage = 0

  const status = await streamDeepSeekRaw(
    input,
    text => {
      buffer += text
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6)
        if (data === '[DONE]') break

        try {
          const parsed = JSON.parse(data)
          if (parsed.usage && parsed.usage.total_tokens) {
            streamUsage = parsed.usage.total_tokens
          }
          const delta = parsed.choices?.[0]?.delta
          const msg = addedMsgIdx === null ? null : store.messages[addedMsgIdx]
          if (delta && msg) {
            if (delta.content) {
              msg.content += delta.content
            }
            if (delta.reasoning_content) {
              msg.reasoning = (msg.reasoning || '') + delta.reasoning_content
            }
          }
        } catch {
          // ignore malformed JSON chunks
        }
      }
    },
    {
      onOpen: () => {
        store.addMessage({ role: 'assistant', content: '', reasoning: '' })
        addedMsgIdx = store.messages.length - 1
      },
    },
  )

  if (status === 'timeout') {
    // 不留空消息，交给调用方回退到 GPT-OSS
    if (addedMsgIdx !== null) {
      const emptyMsg = store.messages[addedMsgIdx]
      if (emptyMsg && !emptyMsg.content && !emptyMsg.reasoning) {
        store.messages.splice(addedMsgIdx, 1)
      }
    }
    return 'timeout'
  }

  if (status === 'error') {
    store.addMessage({
      role: 'assistant',
      content: translate('ai.invalidResponse'),
    })
    return 'error'
  }

  // accumulate daily usage
  if (streamUsage > 0) {
    const key = MODEL_KEY[selectedModel.value]
    if (key) {
      store.tokenUsage[key].token += streamUsage
    }
  }

  if (addedMsgIdx !== null) {
    const finalMsg = store.messages[addedMsgIdx]
    if (finalMsg && !finalMsg.content) {
      finalMsg.content = translate('ai.invalidResponse')
    }
  }
  return 'ok'
}

const aiDrawerOpen = defineModel({
  type: Boolean,
  default: false,
})
defineProps({
  platform: {
    type: String,
    default: 'win32',
  },
})

watch(aiDrawerOpen, newVal => {
  if (newVal) {
    if ((store.messages?.length || 0) <= 2) {
      store.messages = []
      getChatHistory()
    }
  }
})

// ---- auto-scroll-to-bottom (replaces ScrollWrapper stick-bottom) ----
const scrollWrapperRef = ref<InstanceType<typeof ScrollWrapper>>()

function scrollChatToBottom() {
  scrollWrapperRef.value?.scrollTo({
    top: 999_999,
    left: 0,
    behavior: 'auto',
  })
}

// scroll when a new message is appended
watch(
  () => store.messages?.length || 0,
  () => nextTick(() => scrollChatToBottom()),
)

// scroll while the assistant is streaming its answer
const lastAssistantContent = computed(() => {
  const msgs = store.messages
  if (!msgs?.length) return ''
  const last = msgs[msgs.length - 1]
  return last?.role === 'assistant' ? last.content : ''
})

watch(lastAssistantContent, (newVal, oldVal) => {
  if (loading.value && newVal !== oldVal) {
    scrollChatToBottom()
  }
})

// scroll while the assistant is streaming its reasoning (collapse is open)
const lastAssistantReasoning = computed(() => {
  const msgs = store.messages
  if (!msgs?.length) return ''
  const last = msgs[msgs.length - 1]
  return last?.role === 'assistant' ? last.reasoning || '' : ''
})

watch(lastAssistantReasoning, (newVal, oldVal) => {
  if (loading.value && newVal !== oldVal) {
    scrollChatToBottom()
  }
})

// scroll when loading starts (to reveal the "thinking" indicator)
watch(loading, newVal => {
  if (newVal) {
    nextTick(() => scrollChatToBottom())
  }
})
</script>

<template>
  <mdui-navigation-drawer
    :open="aiDrawerOpen"
    modal
    @overlay-click="aiDrawerOpen = false"
    @close="() => {}"
    @opened="scrollChatToBottom"
  >
    <div class="flex flex-row items-center justify-between mt-3 mx-3 drag">
      <div class="flex flex-row" :class="{ 'ml-22': platform === 'darwin' }">
        <mdui-button-icon
          class="p-2 mr-1"
          :class="{ 'mr-5': platform === 'win32' }"
        >
          <img src="/favicon.ico" alt="Website logo" />
        </mdui-button-icon>
        <div class="text-base mt-2">
          <span
            class="font-bold title mr-2"
            style="color: rgb(var(--mdui-color-primary))"
            >{{ 'AI ' + $t('general.appNickName') }}</span
          >
          |
          <span class="ml-2 opacity-70">{{ $t('general.appName') }}</span>
        </div>
      </div>

      <div class="flex flex-row no-drag">
        <mdui-tooltip :content="$t('ai.newConversation')">
          <mdui-button-icon @click="store.newConversation()">
            <mdui-icon-maps-ugc--rounded></mdui-icon-maps-ugc--rounded>
          </mdui-button-icon>
        </mdui-tooltip>
        <mdui-button-icon @click="aiDrawerOpen = false">
          <mdui-icon-close--rounded></mdui-icon-close--rounded>
        </mdui-button-icon>
      </div>
    </div>
    <div class="ai-chat flex flex-col mt-2 px-4">
      <ScrollWrapper
        ref="scrollWrapperRef"
        class="chat-history mb-4 rounded-2xl p-1 bg-[rgb(var(--mdui-color-surface-container-lowest))] select-text"
        style="height: calc(100vh - 56px - 8px - 12px - 56px - 16px - 20px)"
      >
        <div class="p-3">
          <TransitionGroup name="message-appear" tag="div">
            <div
              v-for="(msg, idx) in getChatHistory().filter(
                it => it.role !== 'system',
              )"
              :key="idx"
              class="message-row"
              :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
              @mouseenter="hoveredIdx = idx"
              @mouseleave="hoveredIdx = null"
            >
              <transition name="fade">
                <mdui-button-icon
                  class="inline opacity-60"
                  v-if="hoveredIdx === idx && msg.role === 'user'"
                  @click="copyMessage(msg.content, idx)"
                >
                  <transition name="fade" mode="out-in">
                    <mdui-icon-check--rounded
                      v-if="checkedIdx === idx"
                    ></mdui-icon-check--rounded>
                    <mdui-icon-content-copy--rounded
                      v-else
                    ></mdui-icon-content-copy--rounded>
                  </transition>
                </mdui-button-icon>
              </transition>
              <div :class="msg.role === 'user' ? 'user-msg' : 'ai-msg'">
                <template v-if="msg.role === 'assistant' && msg.reasoning">
                  <mdui-collapse
                    accordion
                    class="ai-reasoning"
                    :value="loading && !msg.content ? 'reasoning' : ''"
                  >
                    <mdui-collapse-item value="reasoning">
                      <div
                        slot="header"
                        class="reasoning-header cursor-pointer flex flex-row items-center"
                      >
                        <mdui-icon-keyboard-arrow-down--rounded
                          class="opacity-60"
                        ></mdui-icon-keyboard-arrow-down--rounded>
                        <div class="opacity-60">
                          {{ $t('ai.reasoningProcess') }}
                        </div>
                      </div>
                      <div
                        class="markdown-body marked opacity-60 pl-4 mb-4 cursor-text"
                        v-html="marked(msg.reasoning ?? '')"
                      ></div>
                    </mdui-collapse-item>
                  </mdui-collapse>
                </template>
                <span
                  class="markdown-body marked cursor-text"
                  v-html="marked(msg.content ?? '')"
                ></span>
              </div>
              <transition name="fade">
                <mdui-button-icon
                  class="inline opacity-60"
                  v-if="hoveredIdx === idx && msg.role !== 'user'"
                  @click="copyMessage(msg.content, idx)"
                >
                  <transition name="fade" mode="out-in">
                    <mdui-icon-check--rounded
                      v-if="checkedIdx === idx"
                    ></mdui-icon-check--rounded>
                    <mdui-icon-content-copy--rounded
                      v-else
                    ></mdui-icon-content-copy--rounded>
                  </transition>
                </mdui-button-icon>
              </transition>
            </div>
          </TransitionGroup>

          <transition name="message-appear">
            <div class="flex flex-row items-center select-none" v-if="loading">
              <div class="text-left ai-msg">
                <div class="markdown-body marked">{{ $t('ai.thinking') }}</div>
              </div>
              <mdui-circular-progress
                class="w-5 h-5 ml-2 inline-block"
              ></mdui-circular-progress>
            </div>
          </transition>
        </div>
      </ScrollWrapper>
      <mdui-text-field
        variant="outlined"
        class="flex-1 text-field mb-2"
        :value="userInput"
        @input="userInput = $event.target.value"
        @keydown.enter.prevent="onEnterKey"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
        :placeholder="$t('ai.inputPlaceholder')"
      >
        <div slot="end-icon" class="flex flex-row items-center gap-1">
          <mdui-tooltip v-if="showTokenBar">
            <mdui-button-icon>
              <mdui-icon-generating-tokens></mdui-icon-generating-tokens>
            </mdui-button-icon>
            <div slot="content">
              <span>{{ tokenTooltip }}</span>
            </div>
          </mdui-tooltip>
          <ChipSelect
            v-if="!customAiOn"
            v-model="selectedModel"
            :items="modelOptions"
            chip-class="text-xs h-10 rounded-full"
            dropdown-placement="top-end"
            :max-items="3"
          />
          <mdui-button-icon
            @click="sendMessage"
            :disabled="loading || !userInput"
            :class="
              loading || !userInput
                ? ''
                : 'text-[rgb(var(--mdui-color-primary))] bg-[rgb(var(--mdui-color-secondary-container))]'
            "
          >
            <mdui-icon-arrow-upward--rounded></mdui-icon-arrow-upward--rounded>
          </mdui-button-icon>
        </div>
      </mdui-text-field>
      <div class="opacity-50 text-sm text-center mb-2">
        {{ $t('ai.disclaimer') }}
      </div>
    </div>
  </mdui-navigation-drawer>
</template>

<style lang="scss" scoped>
::part(panel) {
  width: 80vw;
}

.text-field::part(container) {
  border-radius: 999px;
  background: rgb(var(--mdui-color-background));
  cursor: text;
  padding: 2px 8px 2px 20px;
}

.user-msg {
  display: inline-block;
  background: rgb(var(--mdui-color-primary-container));
  color: rgb(var(--mdui-color-primary));
  border-radius: 8px;
  padding: 8px 12px;
  margin: 4px;
  max-width: 80%;
}
.ai-msg {
  display: inline-block;
  background: rgb(var(--mdui-color-surface-container));
  color: rgb(var(--mdui-color-secondary));
  border-radius: 8px;
  padding: 8px 12px;
  margin: 4px;
  max-width: 80%;
}

.message-row {
  width: 100%;
  display: flex;
  padding: 2px 8px;
}

.message-row-content {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
}

.copy-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  padding: 4px;
  opacity: 0.75;
  transition: opacity 0.1s ease;
}

.copy-btn:hover {
  opacity: 1;
}

.copy-left {
  left: -32px;
}

.copy-right {
  right: -32px;
}

.message-appear-enter-active {
  transition: all 0.5s ease;
}

.message-appear-leave-active {
  transition: all 0.25s ease;
  position: absolute;
}

.message-appear-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.message-appear-enter-to,
.message-appear-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.message-appear-leave-to {
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.ai-reasoning {
  margin-bottom: 4px;

  &::part(header) {
    cursor: pointer;
    font-size: 13px;
    color: #888;
  }

  &::part(body) {
    padding: 0;
  }
}
</style>
