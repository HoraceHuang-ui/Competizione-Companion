<template>
  <div class="online-rules-container w-full">
    <RuleTreeNode
      :items="rules.content"
      :layer="1"
      :cur-open-items="curOpenItems"
      :selected-id="selectedId"
      @path-change="handlePathChange"
      @select="handleSelect"
      @register-ref="handleRegisterRef"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import {
  onlineRules,
  type OnlineRuleItem,
  type OnlineRules,
} from '@/utils/onlineRules'
import RuleTreeNode from './RuleTreeNode.vue'

interface Props {
  rulesData?: OnlineRules
}
const props = withDefaults(defineProps<Props>(), {
  rulesData: () => onlineRules,
})
const rules = computed(() => props.rulesData)

// --- 状态管理 ---
// 现在的 curOpenItems 是一个有序路径，例如 ['1', '1.1', '1.1.1']
const curOpenItems = ref<string[]>([])
const selectedId = ref<string>('')
const itemRefs = new Map<string, HTMLElement>()

// --- 辅助索引 ---
const itemMap = new Map<string, OnlineRuleItem>()
const parentMap = new Map<string, string>()

const buildMaps = (items: OnlineRuleItem[], parentId: string | null = null) => {
  for (const item of items) {
    itemMap.set(item.id, item)
    if (parentId) parentMap.set(item.id, parentId)
    if (item.children) buildMaps(item.children, item.id)
  }
}
buildMaps(rules.value.content)

// --- 事件处理 ---

const handleRegisterRef = (id: string, el: HTMLElement | null) => {
  if (el) itemRefs.set(id, el)
  else itemRefs.delete(id)
}

// 核心：处理路径变更
// 逻辑：当第 N 层发生变化时，保留 0 到 N-1 层的内容，然后追加新的 ID（如果有）
const handlePathChange = ({
  layer,
  id,
}: {
  layer: number
  id: string | undefined
}) => {
  // 1. 截取当前层级之上的路径 (父级路径)
  const newPath = curOpenItems.value.slice(0, layer - 1)

  // 2. 如果该层级选择了新的 ID，则加入路径
  if (id) {
    newPath.push(id)
  }

  // 3. 更新状态
  curOpenItems.value = newPath
  console.log(curOpenItems.value)
}

const emit = defineEmits<{
  (e: 'select', items: OnlineRuleItem[]): void
}>()

const handleSelect = (item: OnlineRuleItem) => {
  selectedId.value = item.id
  emit('select', [item])
}

// --- Expose 接口 ---
const focusItem = (id: string, select: boolean): OnlineRuleItem | undefined => {
  const item = itemMap.get(id)
  if (!item) return undefined

  // 1. 构建从根节点到当前节点的路径数组
  const path: string[] = []
  let curr: string | undefined = id

  // 如果目标本身有子节点（是文件夹），它自己也应该在路径里被展开吗？
  // 这里的逻辑是：如果 focus 一个父节点，应该展开它的父级以便看到它，
  // 至于它自己是否展开，通常如果是 'focus'，我们希望看到它里面的内容，或者至少看到它被高亮。
  // 按照常规 Accordion 逻辑，路径通常包含该项的所有**父级**。
  // 如果 id 对应的项有 children，我们可以选择是否把 id 也放进 curOpenItems。
  // 这里采取策略：只展开 item 的所有父级，让 item 本身可见。
  // 如果你需要 item 自己也展开（如果有 children），可以去掉下面第一行的 curr = parentMap.get(curr)。

  // 修正策略：按照题目示例 "展开到对应的项"，通常意味着展开所有父级。
  curr = parentMap.get(curr)

  while (curr) {
    path.unshift(curr) // 添加到数组头部
    curr = parentMap.get(curr)
  }

  // 更新路径
  curOpenItems.value = path

  // 2. 选中高亮
  if (select) {
    selectedId.value = id
  }

  // 3. 滚动
  nextTick(() => {
    // 稍微延迟以等待 mdui 动画
    setTimeout(() => {
      const el = itemRefs.get(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 300)
  })

  return item
}

defineExpose({
  focusItem,
})
</script>
