<template>
  <!--
    1. accordion: 启用手风琴模式（同级互斥）
    2. value: 绑定当前层级应该打开的 ID (字符串)
  -->
  <mdui-collapse
    accordion
    :value="currentLevelOpenId"
    @change="onCollapseChange"
    class="w-full"
  >
    <template v-for="item in items" :key="item.id">
      <!-- 情况 A：有子节点 -> 渲染为折叠项 -->
      <mdui-collapse-item
        v-if="item.children && item.children.length > 0"
        :value="item.id"
        :ref="el => registerRef(item.id, el)"
      >
        <!-- Header -->
        <mdui-list-item
          slot="header"
          :class="[
            layer === 1 ? 'list-header title my-2 rounded-full' : '',
            layer === 1 ? 'font-bold' : '',
          ]"
          :style="
            layer === 1
              ? 'background: rgba(var(--mdui-color-secondary-container), 0.4)'
              : ''
          "
          :rounded="layer === 1"
        >
          <!-- 层级缩进 -->
          <div
            :style="{
              paddingLeft: layer > 1 ? (layer - 1) * 1.2 + 'rem' : '0',
            }"
          >
            <span
              class="title font-bold mr-1"
              v-if="!item.hideId"
              style="font-size: larger; color: rgb(var(--mdui-color-primary))"
            >
              {{ item.id }}
            </span>
            {{ item.text }}
          </div>

          <!-- 罚判 Chips -->
          <div
            slot="description"
            v-if="item.penalties && item.penalties.length"
          >
            <div
              class="flex gap-2 mt-1"
              :style="{
                paddingLeft: layer > 1 ? (layer - 1) * 1.2 + 'rem' : '0',
              }"
            >
              <mdui-chip
                v-for="p in item.penalties"
                :key="p"
                variant="input"
                class="h-6 text-xs"
              >
                {{ getPenaltyText(p) }}
              </mdui-chip>
            </div>
          </div>

          <!-- 箭头图标 -->
          <mdui-icon-keyboard-arrow-down
            slot="end-icon"
            style="
              transition: all var(--mdui-motion-duration-short4)
                var(--mdui-motion-easing-standard);
            "
            :class="{ 'rotate-180': props.curOpenItems.includes(item.id) }"
          ></mdui-icon-keyboard-arrow-down>
        </mdui-list-item>

        <!-- 递归调用自身 -->
        <div class="w-full" @click.stop>
          <RuleTreeNode
            :items="item.children"
            :layer="layer + 1"
            :cur-open-items="curOpenItems"
            :selected-id="selectedId"
            @path-change="$emit('path-change', $event)"
            @select="$emit('select', $event)"
            @register-ref="(id, el) => $emit('registerRef', id, el)"
          />
        </div>
      </mdui-collapse-item>

      <!-- 情况 B：无子节点 -> 渲染为可点击项 -->
      <div v-else class="w-full">
        <mdui-list-item
          :disabled="item.id.includes('desc')"
          :active="selectedId === item.id"
          @click.stop="$emit('select', item)"
          :ref="el => registerRef(item.id, el)"
          class="cursor-pointer"
        >
          <div
            :style="{
              paddingLeft:
                layer > 1 ? (layer - 1) * 1.2 + 2.5 + 'rem' : '0.5rem',
            }"
          >
            <span
              class="title font-bold mr-1"
              v-if="!item.hideId"
              style="font-size: larger; color: rgb(var(--mdui-color-primary))"
            >
              {{ item.id }}
            </span>
            {{ item.text }}
          </div>

          <div
            slot="description"
            v-if="item.penalties && item.penalties.length"
          >
            <div
              class="flex gap-2 mt-1"
              :style="{
                paddingLeft:
                  layer > 1 ? (layer - 1) * 1.2 + 2.5 + 'rem' : '0.5rem',
              }"
            >
              <mdui-chip
                v-for="p in item.penalties"
                :key="p"
                variant="filter"
                class="h-6 text-xs"
              >
                {{ getPenaltyText(p) }}
              </mdui-chip>
            </div>
          </div>
        </mdui-list-item>
      </div>
    </template>
  </mdui-collapse>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { type OnlineRuleItem } from './onlineRules'

defineOptions({ name: 'RuleTreeNode' })

const props = defineProps<{
  items: OnlineRuleItem[]
  layer: number
  curOpenItems: string[] // 注意：这是完整的路径数组 ['1', '1.2', '1.2.2']
  selectedId: string
}>()

const emit = defineEmits<{
  // 变更：改为传回层级和ID
  (e: 'path-change', payload: { layer: number; id: string | undefined }): void
  (e: 'select', item: OnlineRuleItem): void
  (e: 'registerRef', id: string, el: HTMLElement | null): void
}>()

// 计算当前层级应该打开哪个 ID
// 例如路径是 ['1', '1.2']，layer 是 1，则取 '1'
// layer 是 2，则取 '1.2'
// 如果数组越界（即当前层级未打开），则为 undefined/空字符串
const currentLevelOpenId = computed(() => {
  return props.curOpenItems[props.layer - 1] || ''
})

const getPenaltyText = (level: number) => {
  const map: Record<number, string> = {
    1: '等级一',
    2: '等级二',
    3: '等级三',
    4: '等级四',
    5: '等级五',
  }
  return map[level] || `等级${level}`
}

const onCollapseChange = (e: Event) => {
  if (e.target !== e.currentTarget) {
    return
  }
  const target = e.target as any
  const newVal = target.value as string

  emit('path-change', {
    layer: props.layer,
    id: newVal || undefined,
  })
}

const registerRef = (id: string, el: any) => {
  emit('registerRef', id, el as HTMLElement)
}
</script>

<style scoped>
.rotate-180 {
  transform: rotate(180deg);
}
</style>
