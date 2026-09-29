<script setup lang="ts">
import { ref, watch } from 'vue'
import { useStore } from '@/store'
import '@mdui/icons/keyboard-double-arrow-right--rounded.js'

const open = defineModel<boolean>('open', { default: false })

const store = useStore()

const name = ref('')
const ip = ref('')
const port = ref('')

// 校验错误存的是 i18n key（而不是已翻译文本），这样切换语言时提示也会跟着变；
// 空串表示该字段没有错误
const nameError = ref('')
const ipError = ref('')
const portError = ref('')

const reset = () => {
  name.value = ''
  ip.value = ''
  port.value = ''
  nameError.value = ''
  ipError.value = ''
  portError.value = ''
}

// 取消：不做任何操作，只关掉本弹窗，回到下方的直连弹窗
const cancel = () => {
  reset()
  open.value = false
}

// 输入时清掉该字段的错误，避免提示一直挂着
const onInput = (field: 'name' | 'ip' | 'port', value: string) => {
  if (field === 'name') {
    name.value = value
    nameError.value = ''
  } else if (field === 'ip') {
    ip.value = value
    ipError.value = ''
  } else {
    port.value = value
    portError.value = ''
  }
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
// 可打印 ASCII（含空格）：字母、数字、符号
const ASCII_RE = /^[\x20-\x7E]+$/

const isValidIp = (value: string) => {
  const m = IPV4_RE.exec(value)
  return (
    !!m && m.slice(1).every(part => Number(part) >= 0 && Number(part) <= 255)
  )
}

// 逐项校验，把错误挂到对应字段下方；三项都通过才返回 ok
const validate = () => {
  const serverName = name.value.trim()
  const host = ip.value.trim()
  const portText = port.value.trim()
  const portNum = Number(portText)

  nameError.value = !serverName
    ? 'servers.addServerNameRequired'
    : !ASCII_RE.test(serverName)
      ? // 名称限制为 ASCII：钩子侧的 name_len 用的是 UTF-16 码元数，而名称按 UTF-32
        // 码点写出，非 ASCII（中日韩、emoji）会让两者不一致，ACC 里就会显示成乱码
        'servers.addServerNameAscii'
      : ''

  ipError.value = !host
    ? 'servers.addServerIpRequired'
    : !isValidIp(host)
      ? 'servers.addServerInvalidIp'
      : ''

  portError.value = !portText
    ? 'servers.addServerTcpPortRequired'
    : !/^\d+$/.test(portText) || portNum < 1 || portNum > 65535
      ? 'servers.addServerInvalidPort'
      : ''

  return {
    ok: !nameError.value && !ipError.value && !portError.value,
    serverName,
    host,
    portNum,
  }
}

const submit = () => {
  const { ok, serverName, host, portNum } = validate()
  if (!ok) return

  store.addServerHistory({ name: serverName, hostname: host, port: portNum })
  reset()
  open.value = false
}

// 关闭（含 Esc、点遮罩）时清空，避免下次打开残留上次输入与错误提示
watch(open, val => {
  if (!val) reset()
})
</script>

<template>
  <mdui-dialog
    :open="open"
    @close="open = false"
    close-on-esc
    close-on-overlay-click
    :headline="$t('servers.addServer')"
  >
    <div class="flex flex-col gap-3" style="width: 360px">
      <div class="flex flex-col">
        <mdui-text-field
          class="cursor-text mt-2"
          variant="outlined"
          :label="$t('servers.serverName')"
          :value="name"
          @input="onInput('name', $event.target.value)"
        ></mdui-text-field>
        <div
          v-if="nameError"
          class="text-xs mt-1 text-red-500 dark:text-red-400"
        >
          {{ $t(nameError) }}
        </div>
      </div>

      <div class="flex flex-col">
        <mdui-text-field
          class="cursor-text"
          variant="outlined"
          :label="$t('servers.ipAddress')"
          :value="ip"
          @input="onInput('ip', $event.target.value)"
        ></mdui-text-field>
        <div v-if="ipError" class="text-xs mt-1 text-red-500 dark:text-red-400">
          {{ $t(ipError) }}
        </div>
      </div>

      <div class="flex flex-col">
        <mdui-text-field
          class="cursor-text"
          variant="outlined"
          :label="$t('servers.tcpPort')"
          :value="port"
          @input="onInput('port', $event.target.value)"
        ></mdui-text-field>
        <div
          v-if="portError"
          class="text-xs mt-1 text-red-500 dark:text-red-400"
        >
          {{ $t(portError) }}
        </div>
      </div>
    </div>

    <mdui-button slot="action" variant="text" @click="cancel">
      {{ $t('general.cancel') }}
    </mdui-button>
    <mdui-button slot="action" @click="submit">
      <mdui-icon-keyboard-double-arrow-right--rounded></mdui-icon-keyboard-double-arrow-right--rounded>
    </mdui-button>
  </mdui-dialog>
</template>
