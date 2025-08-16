<script setup lang="ts">
import '@mdui/icons/help-outline--rounded.js'

const props = defineProps({
  paramKey: {
    type: String,
    required: true,
  },
})
</script>

<template>
  <mdui-tooltip>
    <div class="ml-2">
      <mdui-icon-help-outline--rounded
        class="cursor-default opacity-50 text-2xl"
      ></mdui-icon-help-outline--rounded>
    </div>

    <div
      slot="content"
      class="text-base text-[rgb(var(--mdui-color-surface-dim-light))]"
    >
      <div
        class="p-3 w-[400px] bg-[rgb(var(--mdui-color-on-surface-variant-light))] rounded-2xl"
      >
        <!--      <mdui-tabs value="adjust">-->
        <!--        <mdui-tab value="adjust">{{ $t('setup.adjust') }}</mdui-tab>-->
        <!--        <mdui-tab value="theory">{{ $t('setup.theory') }}</mdui-tab>-->

        <!--        <mdui-tab-panel slot="panel" value="adjust" class="text-left mt-2">-->
        <div class="text-left">
          <div>{{ $t(`setup.params.${props.paramKey}.sum`) }}</div>

          <div
            v-if="$t(`setup.params.${props.paramKey}.inc`) !== ''"
            class="bg-[rgb(var(--mdui-color-primary-dark))] text-[rgb(var(--mdui-color-primary-container-dark))] rounded-full px-2 py-1 w-max font-bold mt-2 mb-1 title"
          >
            {{ $t(`setup.increase`) }}
          </div>
          <div>
            {{ $t(`setup.params.${props.paramKey}.inc`) }}
          </div>

          <div
            v-if="$t(`setup.params.${props.paramKey}.dec`) !== ''"
            class="bg-[rgb(var(--mdui-color-primary-dark))] text-[rgb(var(--mdui-color-primary-container-dark))] rounded-full px-2 py-1 w-max font-bold mt-2 mb-1 title"
          >
            {{ $t('setup.decrease') }}
          </div>
          <div>
            {{ $t(`setup.params.${props.paramKey}.dec`) }}
          </div>

          <div
            v-if="$t(`setup.params.${props.paramKey}.notes`) !== ''"
            class="bg-[rgb(var(--mdui-color-primary-dark))] text-[rgb(var(--mdui-color-primary-container-dark))] rounded-full px-2 py-1 w-max font-bold mt-2 mb-1 title"
          >
            {{ $t('setup.notes') }}
          </div>
          <div>
            {{ $t(`setup.params.${props.paramKey}.notes`) }}
          </div>
        </div>
        <!--        </mdui-tab-panel>-->

        <!--        <mdui-tab-panel slot="panel" value="theory">-->
        <!--          <div>ACC遥测数据的圈速记录原理：</div>-->
        <!--          <ul class="list-disc ml-6 mt-2">-->
        <!--            <li>ACC会在每次完成一圈后记录该圈的圈速。</li>-->
        <!--            <li>如果圈速超过102%，则不会记录该圈。</li>-->
        <!--            <li>如果圈速低于102%，则会记录该圈。</li>-->
        <!--            <li>ACC会自动保存最近的若干个有效圈速数据。</li>-->
        <!--          </ul>-->
        <!--        </mdui-tab-panel>-->
        <!--      </mdui-tabs>-->
      </div>
    </div>
  </mdui-tooltip>
</template>

<style scoped lang="scss">
::part(popup) {
  background: none;
  border-radius: var(--mdui-shape-corner-large);
}
</style>
