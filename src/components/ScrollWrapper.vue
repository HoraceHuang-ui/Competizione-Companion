<script setup lang="ts">
import { computed, onMounted, PropType, ref, watch } from 'vue'

const props = defineProps({
  height: {
    type: String,
    default: '100%',
  },
  width: {
    type: String,
    default: '100%',
  },
  showBar: {
    type: String as PropType<'always' | 'hover' | 'never'>,
    default: 'hover',
  },
  scrollPadding: {
    type: Number,
    default: 5,
  },
  stickBottom: {
    type: Boolean,
    default: false,
  },
  noResize: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['scroll'])
const scrollModel = defineModel({
  type: Number,
  default: 0,
})

const outerRef = ref()
const innerRef = ref()
const hoverShowBar = ref(false)

const trackHeight = ref(0)
const wrapContentHeight = ref(0)
const trackWidth = ref(0)
const wrapContentWidth = ref(0)

const translateX = ref(0)
const translateY = ref(0)
const moveClientX = ref(0)
const moveClientY = ref(0)
const vMovingState = ref(false)
const hMovingState = ref(false)

const heightPre = computed(() => {
  return trackHeight.value / wrapContentHeight.value
})
const widthPre = computed(() => {
  return trackWidth.value / wrapContentWidth.value
})
const barHeight = computed(() => {
  return heightPre.value * trackHeight.value
})
const barWidth = computed(() => {
  return widthPre.value * trackWidth.value
})

watch(
  scrollModel,
  (newVal: number) => {
    if (outerRef.value) {
      outerRef.value.scrollTop = newVal
    }
  },
  { immediate: true },
)

const onScroll = (e: Event) => {
  translateX.value = (e.target as HTMLDivElement).scrollLeft * widthPre.value
  translateY.value = (e.target as HTMLDivElement).scrollTop * heightPre.value

  scrollModel.value = (e.target as HTMLDivElement).scrollTop
  emit('scroll', {
    left: (e.target as HTMLDivElement).scrollLeft,
    top: (e.target as HTMLDivElement).scrollTop,
  })
}

// 鼠标开始移动
const vMoveStart = (e: MouseEvent) => {
  vMovingState.value = true
  // 开始移动时鼠标距离thumb顶部的位置
  moveClientY.value = e.clientY - translateY.value
  moveTo()
  moveEnd()
}

const hMoveStart = (e: MouseEvent) => {
  hMovingState.value = true
  moveClientX.value = e.clientX - translateX.value
  moveTo()
  moveEnd()
}
const moveTo = () => {
  document.onmousemove = e => {
    if (vMovingState.value) {
      if (e.clientY - moveClientY.value > trackHeight.value - barHeight.value) {
        translateY.value = trackHeight.value - barHeight.value
      } else if (e.clientY - moveClientY.value < 0) {
        translateY.value = 0
      } else {
        translateY.value = e.clientY - moveClientY.value
      }
      outerRef.value.scrollTop = translateY.value / heightPre.value
    }
    if (hMovingState.value) {
      if (e.clientX - moveClientX.value > trackWidth.value - barWidth.value) {
        translateX.value = trackWidth.value - barWidth.value
      } else if (e.clientX - moveClientX.value < 0) {
        translateX.value = 0
      } else {
        translateX.value = e.clientX - moveClientX.value
      }
      outerRef.value.scrollLeft = translateX.value / widthPre.value
    }
  }
}
// 鼠标移动结束
const moveEnd = () => {
  document.onmouseup = () => {
    if (vMovingState.value) {
      vMovingState.value = false
    }
    if (hMovingState.value) {
      hMovingState.value = false
    }
  }
}

const innerResizeObserver = new ResizeObserver(() => {
  if (innerRef.value) {
    wrapContentWidth.value = innerRef.value.scrollWidth
    wrapContentHeight.value = innerRef.value.scrollHeight
  }
  if (outerRef.value) {
    if (props.stickBottom) {
      outerRef.value.scrollTo({
        top: wrapContentHeight.value,
        behavior: 'smooth',
      })
      translateY.value = wrapContentHeight.value
    }
  }
})
const outerResizeObserver = new ResizeObserver(() => {
  if (outerRef.value) {
    trackWidth.value = outerRef.value.clientWidth
    trackHeight.value = outerRef.value.clientHeight
    if (props.stickBottom) {
      outerRef.value.scrollTo({
        top: wrapContentHeight.value,
        behavior: 'smooth',
      })
      translateY.value = wrapContentHeight.value
    }
  }
})

const onMouseEnter = () => {
  if (props.showBar === 'hover') {
    hoverShowBar.value = true
  }
}
const onMouseLeave = () => {
  if (props.showBar === 'hover') {
    hoverShowBar.value = false
  }
}

onMounted(() => {
  wrapContentWidth.value = innerRef.value.scrollWidth
  wrapContentHeight.value = innerRef.value.scrollHeight
  trackWidth.value = outerRef.value.clientWidth
  trackHeight.value = outerRef.value.clientHeight

  if (!props.noResize) {
    innerResizeObserver.observe(innerRef.value)
    outerResizeObserver.observe(outerRef.value)
  }
})

const scrollTo = (scrollProps: {
  top: number
  left: number
  behavior: string
}) => {
  outerRef.value.scrollTo(scrollProps.left, scrollProps.top)
}

defineExpose({
  scrollTo,
})
</script>

<template>
  <div class="overflow-hidden" :style="{ height: height, width: width }">
    <div
      class="main-wrapper"
      @mouseenter="onMouseEnter"
      @mouseleave="onMouseLeave"
    >
      <div ref="outerRef" class="content-wrapper" @scroll="onScroll">
        <div ref="innerRef">
          <slot />
        </div>
      </div>
      <div class="track vertical">
        <Transition name="fade">
          <div
            v-if="
              heightPre < 1 &&
              (showBar === 'always' || hoverShowBar || vMovingState)
            "
            :style="{
              height: barHeight + 'px',
              transform: `translate(0, ${scrollPadding + translateY - (translateY / (trackHeight - barHeight)) * 2 * scrollPadding}px)`,
            }"
            class="bar vertical"
            :class="{ moving: vMovingState }"
            @mousedown.stop.prevent="vMoveStart"
          />
        </Transition>
      </div>
      <div class="track horizontal">
        <Transition name="fade">
          <div
            v-if="
              widthPre < 1 &&
              (showBar === 'always' || hoverShowBar || hMovingState)
            "
            :style="{
              width: barWidth + 'px',
              transform: `translate(${scrollPadding + translateX - (translateX / (trackWidth - barWidth)) * 2 * scrollPadding}px, 0)`,
            }"
            class="bar horizontal"
            :class="{ moving: hMovingState }"
            @mousedown.stop.prevent="hMoveStart"
          />
        </Transition>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.main-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.content-wrapper {
  width: 100%;
  height: 100%;
  overflow: scroll;
}

.track {
  position: absolute;
  bottom: 0;
  border-radius: 999px;
  z-index: 50;

  &.vertical {
    top: 0;
    right: 0.125rem;
    width: 0.375rem;
  }
  &.horizontal {
    left: 0;
    right: 0;
    height: 0.375rem;
  }
}

.bar {
  border-radius: 999px;
  background: rgb(var(--mdui-color-secondary));
  opacity: 0.3;

  transition-property: height, width;
  transition-duration: 0.2s;

  &:hover {
    opacity: 0.8;
  }

  &.horizontal {
    height: 0.25rem;

    &:hover {
      height: 0.375rem;
    }

    &.moving {
      opacity: 0.8;
      height: 0.375rem;
    }
  }
  &.vertical {
    width: 0.25rem;
    &:hover {
      width: 0.375rem;
    }
    &.moving {
      opacity: 0.8;
      width: 0.375rem;
    }
  }
}

::-webkit-scrollbar {
  width: 0 !important;
}

::-webkit-scrollbar {
  width: 0 !important;
  height: 0;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
</style>
