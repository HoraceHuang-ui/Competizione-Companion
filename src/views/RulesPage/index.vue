<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import OnlineRules from '@/views/RulesPage/components/OnlineRules.vue'
import aiReportPrompt from '@/assets/AIReportPrompt.txt?raw'
import {
  findRules,
  keywords,
  OnlineRuleItem,
  onlineRules,
  RacePart,
  ReportForm,
} from '@/utils/onlineRules'
import { useStore } from '@/store'
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import '@mdui/icons/info.js'
import '@mdui/icons/keyboard-arrow-down--rounded.js'
import '@mdui/icons/help-outline--rounded.js'
import '@mdui/icons/check--rounded.js'
import '@mdui/icons/add--rounded.js'
import '@mdui/icons/close--rounded.js'
import i18n, { translate } from '@/i18n'
import { snackbar } from 'mdui'

const store = useStore()

const onlineRulesRef = ref()

const formData = ref<ReportForm>({
  raceName: '',
  incidentDesc: '',
  incidentPlace: '',
  racePart: RacePart.R,
  reportee: {
    name: '',
    carNo: 0,
  },
  reporter: {
    name: '',
    carNo: 0,
  },
  rules: [],
})

const previewRule = ref<OnlineRuleItem | undefined>(undefined)

// 定义扩展类型，包含匹配次数
interface MatchedRuleItem extends OnlineRuleItem {
  matchCnt: number
}

// 菜单展示项：AI 置顶的条款带 aiPinned 标记，matchCnt 可选
interface DisplayRuleItem extends OnlineRuleItem {
  matchCnt?: number
  aiPinned?: boolean
}

// 假设 formData 是通过 props 传入或者定义的 ref
// const formData = ref({ incidentDesc: '', rule: { id: '' } })
// 这里使用你需要接入的实际 formData

const matchedRules = ref<MatchedRuleItem[]>([])
let searchTimer: number | null = null

// 辅助函数：计算子字符串在字符串中出现的次数
const countOccurrences = (source: string, keyword: string): number => {
  if (!keyword) return 0
  // 使用 split 分割计算出现次数
  return source.split(keyword).length - 1
}

const activeKeywords = computed(() => {
  const desc = formData.value.incidentDesc || ''
  return keywords.filter(k => desc.includes(k))
})

const performSearch = () => {
  const candidates = findRules(
    item => !!item.penalties && item.penalties.length > 0,
  )

  const rulesWithScore: MatchedRuleItem[] = candidates.map(rule => {
    let count = 0
    if (activeKeywords.value.length > 0) {
      activeKeywords.value.forEach(k => {
        count += countOccurrences(rule.text, k)
      })
    }
    return {
      ...rule,
      matchCnt: count,
    }
  })

  rulesWithScore.sort((a, b) => {
    return b.matchCnt - a.matchCnt
  })

  matchedRules.value = rulesWithScore
}

const getTop2Parents = (id: string) => {
  if (!id) {
    return []
  }
  const path = id.split('.')
  const p1 = path[0]
  const p2 = `${path[0]}.${path[1]}`

  return [findRules(it => it.id === p1)[0], findRules(it => it.id === p2)[0]]
}

// ---------- AI 条款分析 ----------
const aiAnalyzing = ref(false)
const aiReasoning = ref('')
const aiPinnedIds = ref<string[]>([])
const hoveringAi = ref(false)
let aiAbortController: AbortController | null = null
// 上一次发起 AI 分析时使用的“事故简介”内容
let lastAiDesc: string | null = null

const allRuleIds = new Set(findRules(() => true).map(it => it.id))

// 解析 AI 返回内容中的条款编号数组（最多 3 个有效条款）
const parseAiClauses = (content: string): string[] => {
  let parsed: unknown
  const arrMatch = content.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try {
      parsed = JSON.parse(arrMatch[0])
    } catch {
      parsed = undefined
    }
  }
  if (parsed === undefined || parsed === null) {
    try {
      parsed = JSON.parse(content)
    } catch {
      return []
    }
  }

  let ids: unknown[] = []
  if (Array.isArray(parsed)) {
    ids = parsed
  } else if (parsed && typeof parsed === 'object') {
    const arrVal = Object.values(parsed as Record<string, unknown>).find(v =>
      Array.isArray(v),
    )
    if (arrVal) ids = arrVal as unknown[]
  }

  return [...new Set(ids.map(it => String(it).trim()))]
    .filter(id => id && allRuleIds.has(id))
    .slice(0, 3)
}

// 中断上一次 AI 请求（若未完成），并清空 AI 结果
const cancelAiAnalysis = () => {
  if (aiAbortController) {
    aiAbortController.abort()
    aiAbortController = null
  }
  aiAnalyzing.value = false
  aiReasoning.value = ''
  // 清除 AI 生成结果：置空后 aiDedupedIds 同步变空，
  // 原先去重的条款会自动加回关键词匹配列表（displayedRules 派生计算）
  aiPinnedIds.value = []
  // 内容已变更，旧的分析结果失效，下次打开菜单需重新分析
  lastAiDesc = null
}

// 以“事故简介”为提示词调用 AI，分析可能符合的投诉条款
const runAiAnalysis = async () => {
  const desc = (formData.value.incidentDesc || '').trim()
  if (!desc) return

  // 内容与上一次发起分析时一致：不重复触发（进行中的请求继续等待其完成）
  if (lastAiDesc === desc) return

  // 内容有变更：中断上一次未完成的请求，开始新一轮分析
  if (aiAbortController) {
    aiAbortController.abort()
    aiAbortController = null
  }

  lastAiDesc = desc
  const controller = new AbortController()
  aiAbortController = controller
  aiAnalyzing.value = true
  aiReasoning.value = ''
  aiPinnedIds.value = []

  const messages: Array<{ role: string; content: string }> = []
  if (aiReportPrompt.trim()) {
    messages.push({ role: 'system', content: aiReportPrompt })
  }
  messages.push({ role: 'user', content: desc })

  const input = {
    messages,
    model: 'deepseek-v4-flash',
    thinking: { type: 'enabled' },
    max_tokens: 100000,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 1,
    top_p: 1,
    tools: null,
    tool_choice: 'none',
  }

  try {
    const response = await fetch(
      'https://api.hh17.top/competizione/ai/deepseek',
      {
        headers: {
          'X-App-Token': 'maimaidx',
          'Content-Type': 'application/json',
        },
        method: 'POST',
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    )

    if (!response.ok || !response.body) {
      throw new Error('Invalid response')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') break

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta
          if (delta) {
            if (delta.reasoning_content) {
              aiReasoning.value += delta.reasoning_content
            }
            if (delta.content) {
              content += delta.content
            }
          }
        } catch {
          // ignore malformed chunks
        }
      }
    }
    aiPinnedIds.value = parseAiClauses(content)
  } catch {
    // 若为当前请求自身失败（非被中断），清空标记，下次打开菜单时允许重试；
    // 被中断时 aiAbortController 已被取消或替换，此处不会误清。
    if (aiAbortController === controller) {
      lastAiDesc = null
    }
  } finally {
    if (aiAbortController === controller) {
      aiAbortController = null
      aiAnalyzing.value = false
    }
  }
}

// 当前因 AI 置顶而从关键词匹配列表（非 AI 列表）中去重的条款 id
// 该集合完全由 aiPinnedIds 派生：清除 AI 结果（aiPinnedIds 置空）时自动变空，
// 原先去重的条款即随之加回关键词匹配列表
const aiDedupedIds = computed(() => {
  const matchedIds = new Set(matchedRules.value.map(it => it.id))
  return aiPinnedIds.value.filter(id => matchedIds.has(id))
})

// 展示列表：AI 推断的条款置顶；关键词匹配列表（非 AI 列表）去除与置顶项重复的内容
const displayedRules = computed<DisplayRuleItem[]>(() => {
  const pinned: DisplayRuleItem[] = []
  for (const id of aiPinnedIds.value) {
    const inMatched = matchedRules.value.find(it => it.id === id)
    const item = inMatched ?? findRules(it => it.id === id)[0]
    if (!item) continue
    pinned.push({ ...item, aiPinned: true })
  }
  // 去重集合仅包含当前仍处于置顶状态的条款：AI 结果清除后集合为空，
  // 此前被去重的条款全部回到关键词匹配列表原位置
  const deduped = new Set(aiDedupedIds.value)
  const rest = matchedRules.value.filter(it => !deduped.has(it.id))
  return [...pinned, ...rest]
})

const previewScrollRef = ref()

const onAiItemEnter = () => {
  hoveringAi.value = true
  nextTick(() => {
    previewScrollRef.value?.scrollTo({
      top: 999_999_999,
      left: 0,
      behavior: 'auto',
    })
  })
}

const onAiItemLeave = () => {
  hoveringAi.value = false
}

// 思考过程流式更新时，右侧面板实时滚动到底部
watch(aiReasoning, () => {
  if (!hoveringAi.value) return
  nextTick(() => {
    previewScrollRef.value?.scrollTo({
      top: 999_999_999,
      left: 0,
      behavior: 'auto',
    })
  })
})

const keywordDialogShow = ref(false)

// 监听 incidentDesc 变化，防抖 300ms
watch(
  () => formData.value.incidentDesc,
  () => {
    // 事故简介变化：中断上一次 AI 请求（若未完成），或清空 AI 结果（若已完成）
    cancelAiAnalysis()
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      performSearch()
    }, 300)
  },
  { immediate: true }, // 初始化时也执行一次，展示默认列表
)

const res = computed(() => {
  return `赛事名称：${formData.value.raceName}
投诉人ID：${formData.value.reporter.name} #${formData.value.reporter.carNo}
被投诉人ID：${formData.value.reportee.name} #${formData.value.reportee.carNo}
比赛轮次：${formData.value.series ? formData.value.series + '组' : ''}${formData.value.racePart}${formData.value.round ? '第' + formData.value.round + '轮' : ''}
事故时间：${formData.value.incidentPlace}
投诉条款：${formData.value.rules.map((it: OnlineRuleItem) => it.id + '. ' + it.text).join('\n\n')}
事故简介：${formData.value.incidentDesc}
事故VCR：`
})
const copyContent = () => {
  navigator.clipboard.writeText(res.value).then(() => {
    snackbar({
      message: translate('report.copySuccess'),
      autoCloseDelay: 3000,
    })
  })
}
</script>

<template>
  <div class="h-full flex flex-col justify-center items-center relative w-full">
    <mdui-card
      variant="outlined"
      class="size-full transition-all border border-[rgb(var(--mdui-color-inverse-primary-dark))] mx-4 mb-4 flex"
      :style="{
        background: `rgba(var(--mdui-color-surface-container-lowest), ${(0.65 * (store.settings.general.bgOpacity || 0.75)) / 0.75})`,
      }"
    >
      <div
        class="w-1/2 h-full relative ml-2 pt-2 pr-2 flex flex-col border-r border-[rgb(var(--mdui-color-surface-container-highest))]"
      >
        <ScrollWrapper>
          <div class="pl-2">
            <div
              class="text-gray-500 flex flex-row items-start mb-3"
              v-if="i18n.global.locale !== 'zh_CN'"
            >
              <div class="w-6 h-6 mr-1">
                <mdui-icon-info></mdui-icon-info>
              </div>
              <div>
                {{ $t('report.tip') }}
              </div>
            </div>
            <div class="flex flex-row gap-2 items-center mt-1">
              <div class="w-28">赛事名称：</div>
              <mdui-text-field
                variant="outlined"
                class="flex-1 text-field"
                :value="formData.raceName"
                @input="formData.raceName = $event.target.value"
                placeholder="例：青铜争锋赛2025第12赛季 第1站 Spa#GT3"
              >
              </mdui-text-field>
            </div>
            <div class="flex flex-row gap-2 items-center mt-2">
              <div class="w-28">投诉人车号：</div>
              <mdui-text-field
                type="number"
                variant="outlined"
                class="w-20 text-field"
                :value="formData.reporter.carNo"
                @input="formData.reporter.carNo = $event.target.value"
              >
              </mdui-text-field>
              <div class="ml-2">ID：</div>

              <mdui-text-field
                variant="outlined"
                class="flex-1 text-field"
                :value="formData.reporter.name"
                @input="formData.reporter.name = $event.target.value"
              >
              </mdui-text-field>
            </div>
            <div class="flex flex-row gap-2 items-center mt-2">
              <div class="w-28">被投诉人车号：</div>
              <mdui-text-field
                type="number"
                variant="outlined"
                class="w-20 text-field"
                :value="formData.reportee.carNo"
                @input="formData.reportee.carNo = $event.target.value"
              >
              </mdui-text-field>
              <div class="ml-2">ID：</div>

              <mdui-text-field
                variant="outlined"
                class="flex-1 text-field"
                :value="formData.reportee.name"
                @input="formData.reportee.name = $event.target.value"
              >
              </mdui-text-field>
            </div>

            <div class="flex flex-row items-center gap-2 mt-2">
              <div class="flex flex-row items-center gap-2 w-1/2 mr-1">
                <div class="w-28">比赛轮次：</div>
                <mdui-select
                  :value="formData.racePart"
                  class="flex-1"
                  variant="outlined"
                  @change="formData.racePart = $event.target.value"
                >
                  <mdui-icon-keyboard-arrow-down--rounded
                    slot="end-icon"
                  ></mdui-icon-keyboard-arrow-down--rounded>
                  <mdui-menu-item
                    v-for="part in RacePart"
                    :key="part"
                    :value="part"
                    >{{ part }}</mdui-menu-item
                  >
                </mdui-select>
              </div>

              <div class="flex flex-row items-center gap-2 w-1/2 ml-1">
                <div>事故时间：</div>
                <mdui-text-field
                  variant="outlined"
                  class="flex-1 text-field"
                  :value="formData.incidentPlace"
                  @input="formData.incidentPlace = $event.target.value"
                >
                </mdui-text-field>
              </div>
            </div>

            <div class="flex flex-row items-center gap-2 mt-2">
              <div class="flex flex-row items-center gap-2 w-1/2 mr-1">
                <div class="w-28">比赛回合：</div>
                <mdui-text-field
                  type="number"
                  variant="outlined"
                  class="flex-1 text-field"
                  :value="formData.round"
                  @input="formData.round = $event.target.value"
                >
                </mdui-text-field>
              </div>

              <div class="flex flex-row items-center gap-2 w-1/2 ml-1">
                <div>比赛组别：</div>
                <mdui-text-field
                  variant="outlined"
                  class="flex-1 text-field"
                  :value="formData.series"
                  @input="formData.series = $event.target.value"
                  placeholder="例：A"
                >
                </mdui-text-field>
              </div>
            </div>

            <div class="flex flex-row items-baseline gap-2 mt-1">
              <div class="h-full flex flex-row w-28 items-center">
                <div>投诉条款:</div>
                <mdui-tooltip
                  content="条款项目排序规则：优先按匹配到的关键词数量降序；若匹配词数相同，则按右侧条款顺序排序。"
                  placement="right-start"
                >
                  <mdui-button-icon
                    ><mdui-icon-help-outline--rounded></mdui-icon-help-outline--rounded
                  ></mdui-button-icon>
                </mdui-tooltip>
              </div>
              <div class="flex-1 flex flex-row gap-2 flex-wrap">
                <mdui-dropdown placement="bottom-start" @open="runAiAnalysis">
                  <mdui-chip
                    slot="trigger"
                    class="h-[36px] rounded-full border border-[rgb(var(--mdui-color-outline))]"
                  >
                    <mdui-icon class="text-[rgb(var(--mdui-color-primary))]">
                      <mdui-icon-add--rounded></mdui-icon-add--rounded>
                    </mdui-icon>
                  </mdui-chip>

                  <mdui-menu>
                    <div
                      class="flex flex-row bg-[rgb(var(--mdui-color-background))] w-[500px] shadow-md"
                      :style="{
                        height: displayedRules.length > 6 ? '293px' : '100%',
                      }"
                    >
                      <ScrollWrapper width="50%">
                        <mdui-menu-item
                          v-if="aiAnalyzing"
                          value="__ai-analyzing__"
                          @mouseenter="onAiItemEnter"
                          @mouseleave="onAiItemLeave"
                          @click.prevent.stop="() => {}"
                        >
                          AI分析中……
                        </mdui-menu-item>
                        <mdui-menu-item
                          v-for="rule in displayedRules"
                          :key="(rule.aiPinned ? 'ai-' : '') + rule.id"
                          :value="rule.id"
                          :class="{
                            'bg-[rgb(var(--mdui-color-primary-container))] text-[rgb(var(--mdui-color-primary))]':
                              formData.rules.findIndex(
                                (it: OnlineRuleItem) => it.id === rule.id,
                              ) !== -1,
                          }"
                          @mouseenter="
                            () => {
                              previewRule = findRules(
                                (item: OnlineRuleItem) => item.id === rule.id,
                              )?.[0]
                            }
                          "
                          @click="
                            () => {
                              formData.rules = onlineRulesRef?.focusItem(
                                rule.id,
                                true,
                              )
                            }
                          "
                        >
                          <template v-if="rule.aiPinned">
                            {{ rule.id }}
                          </template>
                          <template v-else>
                            {{ rule.id }}（匹配到{{ rule.matchCnt }}个关键词）
                          </template>

                          <div
                            class="ai-badge"
                            slot="icon"
                            v-if="rule.aiPinned"
                            :style="
                              formData.rules.findIndex(
                                (it: OnlineRuleItem) => it.id === rule.id,
                              ) !== -1
                                ? 'background: rgb(var(--mdui-color-primary)); color: rgb(var(--mdui-color-primary-container))'
                                : ''
                            "
                          >
                            AI
                          </div>
                          <mdui-icon-check--rounded
                            slot="end-icon"
                            v-if="
                              formData.rules.findIndex(
                                (it: OnlineRuleItem) => it.id === rule.id,
                              ) !== -1
                            "
                          ></mdui-icon-check--rounded>
                        </mdui-menu-item>
                      </ScrollWrapper>
                      <ScrollWrapper
                        ref="previewScrollRef"
                        width="50%"
                        class="p-2 h-full border-l border-[rgb(var(--mdui-color-surface-container-highest))]"
                      >
                        <div
                          v-if="hoveringAi && aiAnalyzing"
                          class="select-text"
                        >
                          <div
                            class="whitespace-pre-wrap break-words text-sm leading-relaxed opacity-80"
                          >
                            {{ aiReasoning || 'AI 正在分析事故简介…' }}
                          </div>
                        </div>
                        <template v-else>
                          <div
                            v-if="previewRule"
                            class="pb-2 mb-2 border-b border-b-[rgb(var(--mdui-color-surface-container-highest))]"
                          >
                            <div v-for="p in getTop2Parents(previewRule?.id)">
                              <div>
                                <span
                                  class="text-[rgb(var(--mdui-color-primary))]"
                                  >{{ p.id }}</span
                                >
                                {{ p.text }}
                              </div>
                            </div>
                          </div>
                          <div>
                            <span
                              class="text-[rgb(var(--mdui-color-primary))]"
                              >{{ previewRule?.id }}</span
                            >
                            {{ previewRule?.text }}
                          </div>
                        </template>
                      </ScrollWrapper>
                    </div>
                  </mdui-menu>
                </mdui-dropdown>
                <mdui-chip
                  deletable
                  v-for="rule in formData.rules"
                  :key="rule.id"
                  class="h-[36px] rounded-full border border-[rgb(var(--mdui-color-outline))]"
                  @click="() => onlineRulesRef?.focusItem(rule.id, false)"
                  @delete="() => onlineRulesRef?.focusItem(rule.id, true)"
                >
                  {{ rule.id }}
                </mdui-chip>
              </div>
            </div>

            <div class="flex flex-row items-start gap-2 mt-2">
              <div class="h-full flex-col w-28 pt-2">
                <div>事故简介：</div>
                <mdui-tooltip
                  content="查看事故简介匹配到的关键词及词库"
                  placement="bottom-start"
                >
                  <mdui-button
                    variant="tonal"
                    class="mt-2"
                    @click="keywordDialogShow = true"
                    >关键词</mdui-button
                  >
                </mdui-tooltip>
              </div>
              <mdui-text-field
                variant="outlined"
                class="flex-1 text-area"
                :value="formData.incidentDesc"
                @input="formData.incidentDesc = $event.target.value"
                rows="3"
                placeholder="试试看先输入事故简介，再选择上面的投诉条款吧！点击左侧的关键词按钮，尽量使用里面列举的关键词，效果更佳"
              >
              </mdui-text-field>
            </div>

            <div class="flex flex-row flex-1 items-start gap-2 mt-2">
              <div class="h-full flex-col w-28 pt-2">
                <div>投诉文案：</div>
                <mdui-button variant="tonal" class="mt-2" @click="copyContent"
                  >一键复制</mdui-button
                >
              </div>
              <mdui-text-field
                variant="outlined"
                class="flex-1 text-area"
                autosize
                min-rows="7"
                :value="res"
                contenteditable="false"
              >
              </mdui-text-field>
            </div>
          </div>
        </ScrollWrapper>
      </div>
      <div
        class="w-1/2 h-full relative pt-1 pl-2 mr-2 border-l border-[rgb(var(--mdui-color-surface-container-highest))]"
      >
        <OnlineRules
          ref="onlineRulesRef"
          :online-rules="onlineRules"
          @select="
            (items: OnlineRuleItem[]) => {
              formData.rules = items
            }
          "
        />
      </div>
    </mdui-card>

    <mdui-dialog
      :open="keywordDialogShow"
      @close="keywordDialogShow = false"
      close-on-esc
      close-on-overlay-click
    >
      <mdui-text-field
        variant="outlined"
        class="flex-1 text-area mb-4"
        :value="formData.incidentDesc"
        @input="formData.incidentDesc = $event.target.value"
        rows="3"
        placeholder="在此输入事故简介，尝试尽量多命中下方的关键词吧！命中越多，条款推荐越准"
      >
      </mdui-text-field>
      <mdui-chip
        v-for="keyword in keywords"
        class="mr-2 pointer-events-none"
        :class="{
          'bg-[rgb(var(--mdui-color-primary-container))]':
            activeKeywords.includes(keyword),
        }"
        style="--mdui-state-layer-hover: 0; --mdui-state-layer-pressed: 0"
      >
        {{ keyword }}
      </mdui-chip>
    </mdui-dialog>
  </div>
</template>

<style scoped lang="scss">
.text-field::part(container) {
  border-radius: 999px;
  background: rgb(var(--mdui-color-background));
  cursor: text;
  height: 36px;
}
.text-area::part(container) {
  border-radius: 18px;
  background: rgb(var(--mdui-color-background));
  cursor: text;
}
.ai-badge {
  align-items: center;
  padding: 0 10px;
  border-radius: 999px;
  vertical-align: 1px;
  font-size: 16px;
  background: rgb(var(--mdui-color-primary-container));
  color: rgb(var(--mdui-color-primary));
}
::part(text-field__container) {
  border-radius: 999px;
  background: rgb(var(--mdui-color-background));
  height: 36px;
}
</style>
