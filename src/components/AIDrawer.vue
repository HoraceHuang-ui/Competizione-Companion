<script lang="ts" setup>
import { ref, watch } from 'vue'
import { useStore } from '@/store'
import { marked } from 'marked'
import { translate } from '@/i18n'
import '@mdui/icons/close--rounded.js'
import '@mdui/icons/maps-ugc--rounded.js'
import '@mdui/icons/arrow-upward--rounded.js'
import '@mdui/icons/content-copy--rounded.js'
import '@mdui/icons/check--rounded.js'
import ScrollWrapper from './ScrollWrapper.vue'

const store = useStore()

const userInput = ref('')
const loading = ref(false)
const isComposing = ref(false)
const hoveredIdx = ref<number | null>(null)
const checkedIdx = ref<number | null>(null)

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
      content: `You are a racing car setup assistant. The user asks what the car feels like (e.g. too much oversteer when trailbraking), and you respond with possible tuning advice (e.g. increasing Brake Bias and other options). Answer in the same language as the user asks. Available tuning parameters are: Tyre Compound(wet/dry), Tyre Pressure(in psi), Camber(负外倾角), Toe(束角), Caster(主销倾角), Steer Ratio, Fuel, Brake Pad Compound(1-high performance with 1.5hrs of endurance; 2-less high performance but with 12hrs of endurance; 3-not often used; 4-highest performance but with ~5mins of endurance), TC1, TC2, ABS, ECU Map, Telemetry Laps Count(saves MoTeC but takes memory space), Anti-Roll Bar(防倾杆), Wheel Rate(悬挂刚度), Bump Stop(减震胶块硬度), Bump Stop Range(减震胶块行程), Brake Torque(MAX 100%), Brake Bias, Bump(压缩阻尼), Fast Bump, Rebound(回弹阻尼), Fast Rebound, Ride Height, Splitter(前扩散器), Rear Wing(尾翼), Brake Duct(刹车通风), Differential Preload. Please answer at most 5 options, and sort by most possible solution. However, if user asks questions unrelated to racing topics, you may also answer them as far as you know; if you don't, you may ask the user for more details to better understand the questions and remember this in the following conversation. Additionally, Horace Huang (or Horace, Huang, HYY, horacehuang17, IT Boy, 黄) is the person who created you, in case the user asks, you may answer that he created you and your developer, and is like your dad and loves you; no need to list all his names in the answer.`,
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
  store.addMessage({ role: 'user', content: userInput.value })
  loading.value = true
  const input = {
    max_tokens: 10000,
    top_p: 0.05,
    top_k: 3,
    temperature: 0.4,
    stream: false,
    messages: getChatHistory().map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
  }
  userInput.value = ''
  try {
    const apiResult = await window.axios.post(
      'https://api.cloudflare.com/client/v4/accounts/b666bcb97b0bdc3983313c378229ce79/ai/run/@cf/openai/gpt-oss-120b',
      JSON.stringify(input),
      {
        headers: {
          Authorization: 'Bearer qumdW8_T-1hXUTKo4rm7QVUlYwnXfv2i7Bxr2Pkc',
          'Content-Type': 'application/json',
        },
      },
    )
    console.log('AI API result:', apiResult)
    let aiContent = ''
    let aiReasoning = ''
    // Support both old and new API result shapes
    const result = apiResult.result || apiResult
    if (
      result &&
      result.choices &&
      result.choices[0] &&
      result.choices[0].message
    ) {
      aiContent = result.choices[0].message.content || ''
      aiReasoning = result.choices[0].message.reasoning_content || ''
    } else if (
      apiResult.choices &&
      apiResult.choices[0] &&
      apiResult.choices[0].message
    ) {
      aiContent = apiResult.choices[0].message.content || ''
      aiReasoning = apiResult.choices[0].message.reasoning_content || ''
    } else {
      aiContent = translate('ai.invalidResponse')
    }
    store.addMessage({
      role: 'assistant',
      content: aiContent,
      reasoning: aiReasoning,
    })
  } catch (e) {
    store.addMessage({
      role: 'assistant',
      content: translate('ai.invalidResponse'),
    })
  }
  loading.value = false
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
</script>

<template>
  <mdui-navigation-drawer
    :open="aiDrawerOpen"
    modal
    @overlay-click="aiDrawerOpen = false"
    @close="() => {}"
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
        :stick-bottom="true"
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
                  <details
                    style="margin-bottom: 4px"
                    class="ai-reasoning"
                    :open="false"
                  >
                    <summary
                      style="cursor: pointer; font-size: 13px; color: #888"
                    >
                      {{ $t('ai.reasoningProcess') }}
                    </summary>
                    <div
                      class="markdown-body marked opacity-60 pl-4 mb-4 cursor-text"
                      v-html="marked(msg.reasoning ?? '')"
                    ></div>
                  </details>
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
        <mdui-button-icon
          slot="end-icon"
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
  position: absolute;
}
</style>
