<script setup lang="ts">
import { ref } from 'vue'
import '@mdui/icons/attach-file--rounded.js'
import '@mdui/icons/keyboard-arrow-down--rounded.js'

const show = defineModel({
  type: Boolean,
  default: false,
})

const serverExePath = ref('')
const createFile = ref(false)

const close = () => {
  show.value = false
}

const confirm = () => {
  console.log('confirm')
  close()
}
</script>

<template>
  <mdui-dialog :open="show" :headline="'保存为预设'" @close="() => {}">
    <div slot="description">
      * 需先安装
      <a
        class="cursor-pointer"
        style="
          color: rgb(var(--mdui-color-primary));
          text-decoration: underline;
        "
      >
        ACC Dedicated Server (Steam)
      </a>
      、
      <a
        class="cursor-pointer"
        style="
          color: rgb(var(--mdui-color-primary));
          text-decoration: underline;
        "
      >
        ACC Dedicated Server GUI (Overtake.gg)
      </a>
      &nbsp;以使用本功能。
    </div>

    <div class="flex flex-col">
      <mdui-divider class="mb-2"></mdui-divider>
      <div class="flex flex-row items-center justify-between">
        <div>ACC Dedicated Server GUI.exe 路径：</div>
        <mdui-tooltip
          :content="
            serverExePath ? `当前已选择：${serverExePath}` : '点击选择文件'
          "
          placement="bottom"
        >
          <mdui-button variant="elevated">
            <mdui-icon-attach-file--rounded slot="icon">
            </mdui-icon-attach-file--rounded>
            选择
          </mdui-button>
        </mdui-tooltip>
      </div>
      <div class="flex flex-row justify-between items-center mt-2">
        <div>预设名：</div>
        <div class="flex flex-row items-center">
          <mdui-checkbox
            :checked="createFile"
            class="mr-4"
            @input="createFile = !createFile"
          >
            新建
          </mdui-checkbox>
          <mdui-text-field
            v-if="createFile"
            placeholder="请输入文件名"
            variant="outlined"
            class="h-[40px] w-[260px] cursor-text input"
          ></mdui-text-field>
          <mdui-select
            class="select w-[260px]"
            v-else
            placeholder="请选择预设文件"
            variant="outlined"
          >
            <mdui-icon-keyboard-arrow-down--rounded
              slot="end-icon"
            ></mdui-icon-keyboard-arrow-down--rounded>
          </mdui-select>
        </div>
      </div>
    </div>

    <mdui-button slot="action" variant="text" @click="close" class="mr-2"
      >取消</mdui-button
    >
    <mdui-button slot="action" @click="confirm">确认</mdui-button>
  </mdui-dialog>
</template>

<style scoped lang="scss">
.input::part(container) {
  border-radius: 999px;
}
.select::part(text-field) {
  height: 40px;
  width: 260px;
}
.select::part(text-field__container) {
  border-radius: 999px;
}
</style>
