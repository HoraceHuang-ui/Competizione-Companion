<script setup lang="ts">
import { computed, defineModel, onMounted, PropType, ref, watch } from 'vue'
import { useTimeout } from '../utils/timeout'

const props = defineProps({
  autoplay: {
    type: Boolean,
    default: true,
  },
  autoplayInterval: {
    type: Number,
    default: 5000,
  },
  showArrow: {
    type: String as PropType<'always' | 'hover' | 'never'>,
    default: 'hover',
  },
  showIndicator: {
    type: String as PropType<'always' | 'hover' | 'never'>,
    default: 'never',
  },
  indicatorStyle: {
    type: String as PropType<'circle' | 'bar'>,
    default: 'bar',
  },
  indicatorBg: {
    type: Boolean,
    default: true,
  },
  indicatorPlacement: {
    type: String as PropType<'left' | 'mid' | 'right'>,
    default: 'mid',
  },
  animation: {
    type: String as PropType<'swipe' | 'fade-swipe'>,
    default: 'swipe',
  },
})

const curIdx = defineModel({
  type: Number,
  default: 1,
})

const hoverShowArrow = ref(false)
const hoverShowIndicator = ref(false)
const panesDisplay = ref<string[]>([])

let autoplayTimer: NodeJS.Timer | number | undefined = undefined

const panesWrapper = ref<HTMLDivElement>()
const panes = computed(() => {
  if (panesWrapper.value) {
    if (props.autoplay) {
      if (!autoplayTimer) {
        autoplayTimer = setInterval(nextPane, props.autoplayInterval)
      }
    }
    return panesWrapper.value.children
  }
  return null
})

const refreshState = () => {
  if (panes.value) {
    panesDisplay.value = []
    for (let i = 0; i < panes.value.length; i++) {
      ;(panes.value.item(i) as HTMLElement)!.style.position = 'absolute'
      ;(panes.value.item(i) as HTMLElement)!.style.top = '0'
      ;(panes.value.item(i) as HTMLElement)!.style.left = '0'
      ;(panes.value.item(i) as HTMLElement)!.style.transition =
        'all var(--mdui-motion-duration-medium4) var(--mdui-motion-easing-standard)'
      panesDisplay.value.push(
        (panes.value.item(i) as HTMLElement)!.style.display,
      )
      // (panes.value.item(i) as HTMLElement)!!.style.width = `${panesWrapper.value!!.clientWidth}px`;
      if (i + 1 == curIdx.value) {
        continue
      }
      ;(panes.value.item(i) as HTMLElement)!.style.transform =
        `translateX(${panesWrapper.value?.clientWidth}px)`
      ;(panes.value.item(i) as HTMLElement)!.style.display = 'none'
    }
  }
}

const nextPane = () => {
  if (curIdx.value == panes.value!.length) {
    curIdx.value = 1
  } else {
    curIdx.value++
  }
}

const prevPane = () => {
  if (curIdx.value == 1) {
    curIdx.value = panes.value!.length
  } else {
    curIdx.value--
  }
}

const setPane = (idx: number) => {
  if (!panes.value || idx < 0 || idx >= panes.value?.length) {
    return
  }
  curIdx.value = idx + 1
}

const onMouseEnter = () => {
  hoverShowArrow.value = true
  hoverShowIndicator.value = true

  if (autoplayTimer) {
    clearInterval(autoplayTimer as number)
    autoplayTimer = undefined
  }
}

const onMouseLeave = () => {
  hoverShowArrow.value = false
  hoverShowIndicator.value = false

  if (props.autoplay && !autoplayTimer) {
    autoplayTimer = setInterval(nextPane, props.autoplayInterval)
  }
}

watch(curIdx, (newId: number, oldId: number) => {
  const newItem = panes.value?.item(newId - 1) as HTMLElement
  const oldItem = panes.value?.item(oldId - 1) as HTMLElement

  if (!panes.value || curIdx.value < 1 || curIdx.value > panes.value?.length) {
    if (oldItem) {
      oldItem.style.display = 'none'
      oldItem.style.transform = `translateX(-${panesWrapper.value?.clientWidth}px)`
    }
    return
  }

  if (panes.value) {
    newItem.style.transition = 'none'
    newItem.style.display = panesDisplay.value[newId - 1]

    if (props.animation === 'swipe') {
      if (newId > oldId) {
        newItem.style.transform = `translateX(${panesWrapper.value?.clientWidth}px)`
      } else {
        newItem.style.transform = `translateX(-${panesWrapper.value?.clientWidth}px)`
      }

      setTimeout(() => {
        if (newId > oldId) {
          if (oldItem) {
            oldItem.style.transform = `translateX(-${panesWrapper.value?.clientWidth}px)`
          }
        } else {
          if (oldItem) {
            oldItem.style.transform = `translateX(${panesWrapper.value?.clientWidth}px)`
          }
        }

        newItem.style.transition =
          'all var(--mdui-motion-duration-medium4) var(--mdui-motion-easing-standard)'
        newItem.style.transform = 'translateX(0)'
      }, 10)

      useTimeout(() => {
        if (oldItem) {
          oldItem.style.display = 'none'
        }
      }, 410).start()
    } else if (props.animation === 'fade-swipe') {
      if (newId > oldId) {
        newItem.style.transform = `translateX(25%)`
        newItem.style.opacity = '0'
      } else {
        newItem.style.transform = `translateX(-25%)`
        newItem.style.opacity = '0'
      }

      setTimeout(() => {
        if (newId > oldId) {
          oldItem.style.transform = `translateX(-25%)`
          oldItem.style.opacity = '0'
        } else {
          oldItem.style.transform = `translateX(25%)`
          oldItem.style.opacity = '0'
        }

        newItem.style.transition =
          'all var(--mdui-motion-duration-medium4) var(--mdui-motion-easing-standard)'
        newItem.style.opacity = '1'
        newItem.style.transform = 'translateX(0)'
      }, 10)

      useTimeout(() => {
        oldItem.style.display = 'none'
      }, 410).start()
    }
  }
})

onMounted(() => {
  refreshState()
})

defineExpose({
  nextPane,
  prevPane,
  setPane,
})
</script>

<template>
  <div
    class="main-wrapper"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <div ref="panesWrapper" class="panes-wrapper">
      <slot />
    </div>

    <!-- INDICATORS -->
    <Transition name="slide-up">
      <div
        v-if="
          panes &&
          panes.length > 1 &&
          showIndicator !== 'never' &&
          (showIndicator === 'always' || hoverShowIndicator)
        "
        class="indicator-area-wrapper"
        :class="{
          left: indicatorPlacement === 'left',
          right: indicatorPlacement === 'right',
        }"
      >
        <div
          class="indicator-area"
          :class="{ 'bg backdrop-blur-md': indicatorBg }"
        >
          <div
            v-for="idx in panes.length"
            class="indicators-wrapper"
            :class="indicatorStyle === 'bar' ? 'bar' : 'circle'"
            @mouseenter="curIdx = idx"
            :key="idx"
          >
            <div
              class="indicator"
              :class="[
                indicatorStyle === 'bar' ? 'bar' : 'circle',
                { selected: curIdx == idx },
              ]"
            />
          </div>
        </div>
      </div>
    </Transition>

    <!-- PAGE ARROWS -->
    <Transition name="slide-right">
      <div
        v-if="
          panes &&
          panes.length > 1 &&
          showArrow !== 'never' &&
          (showArrow === 'always' || hoverShowArrow)
        "
        class="arrow-wrapper left"
        @click="prevPane"
      >
        <i class="bi bi-chevron-left text-white" />
      </div>
    </Transition>
    <Transition name="slide-left">
      <div
        v-if="
          panes &&
          panes.length > 1 &&
          showArrow !== 'never' &&
          (showArrow === 'always' || hoverShowArrow)
        "
        class="arrow-wrapper right"
        @click="nextPane"
      >
        <i class="bi bi-chevron-right text-white" />
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.main-wrapper {
  overflow: hidden;
}

.panes-wrapper {
  overflow: hidden;
  width: 100%;
  height: 100%;
  position: relative;
}

.indicator-area-wrapper {
  position: absolute;
  bottom: 0.25rem;
  left: 0;
  right: 0;
  width: 100%;
  display: flex;
  flex-direction: row;
  justify-content: center;

  &.left {
    left: 0.5rem;
    justify-content: start;
  }
  &.right {
    right: 0.5rem;
    justify-content: end;
  }
}

.indicator-area {
  padding: 0 0.25rem;
  border-radius: 9999px;
  display: flex;
  flex-direction: row;

  &.bg {
    background: rgba(54, 65, 83, 0.3);
  }
}

.indicators-wrapper {
  margin: 0 0.25rem;

  &.bar {
    margin: 0.5rem 0;
  }
  &.circle {
    margin: 0.25rem 0;
  }
}

.indicator {
  background: rgba(153, 161, 175, 0.9);
  border-radius: 999px;
  transition: all var(--mdui-motion-duration-short4)
    var(--mdui-motion-easing-standard);

  &.bar {
    height: 0.25rem;
    width: 1.25rem;
    &.selected {
      width: 1.75rem;
      background: white;
    }
  }

  &.circle {
    height: 0.5rem;
    width: 0.5rem;

    &.selected {
      width: 1.25rem;
      background: white;
    }
  }
}

.arrow-wrapper {
  position: absolute;
  top: 0;
  bottom: 0;
  padding: 0 0.25rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: rgba(74, 85, 101, 0.3);
  cursor: pointer;
  transition: all var(--mdui-motion-duration-short4)
    var(--mdui-motion-easing-standard);

  &:hover {
    background: rgba(74, 85, 101, 0.6);
  }

  &.left {
    @apply left-0;
    left: 0;
  }
  &.right {
    right: 0;
  }
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}

.slide-right-enter-from,
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(-0.25rem);
}

.slide-left-enter-from,
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(0.25rem);
}

.slide-up-enter-active,
.slide-up-leave-active,
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all var(--mdui-motion-duration-short4)
    var(--mdui-motion-easing-standard);
}
</style>
