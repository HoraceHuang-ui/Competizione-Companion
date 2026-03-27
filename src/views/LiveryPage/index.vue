<script setup lang="ts">
import { useStore } from '@/store'
import { snackbar } from 'mdui'
import { computed, ref } from 'vue'
import { useSetupImport } from '../SetupMgmtPage/composables/useSetupImport'
import carData from '@/utils/carData'
import '@mdui/icons/add--rounded.js'
import '@mdui/icons/file-upload--rounded.js'
import '@mdui/icons/loop--rounded.js'
import { translate } from '@/i18n'
import router from '@/router'

interface LiveryForm {
  raceName: string // 赛事名称
  raceNumber: number // 车号
  driverName: string
  teamName: string
}
const store = useStore()
const { collectDropEntries } = useSetupImport()

const formData = ref<LiveryForm>({
  raceName: '',
  raceNumber: 0,
  driverName: '',
  teamName: '',
})
const isTeam = ref(false)
const carName = ref<
  { id: number; hipoleName?: string; name?: string } | undefined
>(undefined)

const isDragging = ref(false)
const droppedFiles = ref<
  Array<{
    path: string
    name: string
    file?: File
    content?: string
    arrayBuffer?: ArrayBuffer
  }>
>([])
const droppedCustomJson = ref<any>(null)

const handleDragEnter = () => {
  isDragging.value = true
}
const handleDragLeave = () => {
  isDragging.value = false
}

const requiredLiveryFields = [
  'carGuid',
  'teamGuid',
  'raceNumber',
  'raceNumberPadding',
  'auxLightKey',
  'auxLightColor',
  'skinTemplateKey',
  'skinColor1Id',
  'skinColor2Id',
  'skinColor3Id',
  'sponsorId',
  'skinMaterialType1',
  'skinMaterialType2',
  'skinMaterialType3',
  'rimColor1Id',
  'rimColor2Id',
  'rimMaterialType1',
  'rimMaterialType2',
  'teamName',
  'nationality',
  'displayName',
  'competitorName',
  'competitorNationality',
  'teamTemplateKey',
  'carModelType',
  'cupCategory',
  'licenseType',
  'useEnduranceKit',
  'customSkinName',
  'bannerTemplateKey',
]

const toImportFiles = ref({
  'cars/*.json': false,
  'decals.json': false,
  'decals.png': false,
  'sponsors.json': false,
  'sponsors.png': false,
})
const filesValid = computed(() => {
  return (
    toImportFiles.value['cars/*.json'] &&
    toImportFiles.value['decals.json'] &&
    toImportFiles.value['sponsors.json'] &&
    (toImportFiles.value['decals.png'] ||
      toImportFiles.value['sponsors.png']) &&
    formData.value.raceName &&
    formData.value.raceNumber !== undefined &&
    formData.value.driverName &&
    (!isTeam.value || (isTeam.value && formData.value.teamName))
  )
})

const normalizePath = (path: string) => {
  return path.replace(/\\/g, '/').replace(/^\/+/g, '')
}

const isValidLiveryJson = (json: any) => {
  if (!json || typeof json !== 'object') return false
  return requiredLiveryFields.every(
    field =>
      Object.prototype.hasOwnProperty.call(json, field) &&
      json[field] !== null &&
      json[field] !== undefined,
  )
}

const collectZipEntryFiles = async (
  file: File,
  basePath = '',
): Promise<
  Array<{
    path: string
    name: string
    content?: string
    arrayBuffer?: ArrayBuffer
  }>
> => {
  const result: Array<{
    path: string
    name: string
    content?: string
    arrayBuffer?: ArrayBuffer
  }> = []
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file)

  const entries = Object.values(zip.files)

  for (const entry of entries) {
    if (entry.dir) continue

    const normalized = normalizePath(entry.name)
    const fullPath = basePath ? `${basePath}/${normalized}` : normalized
    const name = normalized.split('/').pop() || normalized

    if (name.toLowerCase().endsWith('.zip')) {
      const data = await entry.async('arraybuffer')
      const nestedFile = new File([data], name, {
        type: 'application/zip',
      })
      result.push(...(await collectZipEntryFiles(nestedFile, fullPath)))
      continue
    }

    if (name.toLowerCase().endsWith('.json')) {
      let content: string
      if (
        name.toLowerCase() === 'decals.json' ||
        name.toLowerCase() === 'sponsors.json'
      ) {
        content = await entry.async('string') // UTF-8
      } else {
        const uint8Array = await entry.async('uint8array')
        content = new TextDecoder('utf-16le').decode(uint8Array) // UTF-16 LE for cars.json etc.
      }
      result.push({
        path: fullPath,
        name,
        content: content.replace(/^\uFEFF/, ''),
      })
      continue
    }

    const buffer = await entry.async('arraybuffer')
    result.push({ path: fullPath, name, arrayBuffer: buffer })
  }

  return result
}

const handleDrop = async (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = false

  let entries = await collectDropEntries(event)

  if (!entries.length) {
    snackbar({ message: translate('livery.invalidFile'), autoCloseDelay: 3000 })
    return
  }

  const allFiles: Array<{
    path: string
    name: string
    file?: File
    content?: string
    arrayBuffer?: ArrayBuffer
  }> = []

  for (const entry of entries) {
    const name = entry.file.name
    const normalizedPath = normalizePath(entry.path || name)

    if (name.toLowerCase().endsWith('.zip')) {
      allFiles.push(...(await collectZipEntryFiles(entry.file, normalizedPath)))
      continue
    }

    if (name.toLowerCase().endsWith('.json')) {
      const text = await entry.file.text()
      allFiles.push({
        path: normalizedPath,
        name,
        file: entry.file,
        content: text.replace(/^\uFEFF/, ''),
      })
      continue
    }

    if (name.toLowerCase().endsWith('.png')) {
      const buffer = await entry.file.arrayBuffer()
      allFiles.push({
        path: normalizedPath,
        name,
        file: entry.file,
        arrayBuffer: buffer,
      })
      continue
    }

    // 其它文件先存储(可能无用)
    const buffer = await entry.file.arrayBuffer()
    allFiles.push({
      path: normalizedPath,
      name,
      file: entry.file,
      arrayBuffer: buffer,
    })
  }

  const firstDecalsJson = allFiles.find(
    f => f.name.toLowerCase() === 'decals.json',
  )
  const firstDecalsPng = allFiles.find(
    f => f.name.toLowerCase() === 'decals.png',
  )
  const firstSponsorsJson = allFiles.find(
    f => f.name.toLowerCase() === 'sponsors.json',
  )
  const firstSponsorsPng = allFiles.find(
    f => f.name.toLowerCase() === 'sponsors.png',
  )

  const customJsonCandidate = allFiles.find(f => {
    if (!f.name.toLowerCase().endsWith('.json')) return false
    if (f.name.toLowerCase() === 'decals.json') return false
    if (f.name.toLowerCase() === 'sponsors.json') return false
    if (!f.content) return false

    try {
      const parsed = JSON.parse(f.content)
      return isValidLiveryJson(parsed)
    } catch {
      return false
    }
  })

  let matchedModel: any = null

  if (customJsonCandidate?.content) {
    droppedCustomJson.value = JSON.parse(customJsonCandidate.content)

    if (typeof droppedCustomJson.value.carModelType === 'number') {
      for (const series of Object.values(carData)) {
        for (const model of Object.values(series as any)) {
          if ((model as any).id === droppedCustomJson.value.carModelType) {
            matchedModel = model
            break
          }
        }
        if (matchedModel) break
      }
    }

    if (matchedModel) {
      if (!matchedModel.hipoleName) {
        snackbar({
          message: translate('livery.unsupportedCar'),
          autoCloseDelay: 3000,
        })
        return
      }
      carName.value = {
        id: matchedModel.id,
        hipoleName: matchedModel.hipoleName,
        name: matchedModel.name,
      }
    }
  }

  const targetFileNames: string[] = []

  const saveFile = async (
    name: string,
    data: string | ArrayBuffer | Uint8Array,
  ) => {
    if (!window.fs?.saveUserDataFile) {
      throw new Error('fs API not initialized')
    }
    await window.fs.saveUserDataFile(name, data)
    targetFileNames.push(name)
  }

  const writeConversion = async (
    fileObj: {
      name: string
      content?: string
      arrayBuffer?: ArrayBuffer
      file?: File
    },
    outputName?: string,
  ) => {
    const finalName = outputName || fileObj.name
    if (fileObj.arrayBuffer) {
      await saveFile(finalName, fileObj.arrayBuffer)
    } else if (fileObj.file) {
      const buffer = await fileObj.file.arrayBuffer()
      await saveFile(finalName, buffer)
    } else if (fileObj.content !== undefined) {
      // fallback for text data not tied to original binary
      const encoder = new TextEncoder()
      await saveFile(finalName, encoder.encode(fileObj.content))
    }
  }

  if (firstDecalsJson) {
    toImportFiles.value['decals.json'] = true
    await writeConversion(firstDecalsJson)
  }
  if (firstDecalsPng) {
    toImportFiles.value['decals.png'] = true
    await writeConversion(firstDecalsPng)
  }
  if (firstSponsorsJson) {
    toImportFiles.value['sponsors.json'] = true
    await writeConversion(firstSponsorsJson)
  }
  if (firstSponsorsPng) {
    toImportFiles.value['sponsors.png'] = true
    await writeConversion(firstSponsorsPng)
  }

  if (customJsonCandidate) {
    toImportFiles.value['cars/*.json'] = true
    await writeConversion(customJsonCandidate, 'cars.json')
  }

  droppedFiles.value = allFiles

  return targetFileNames
}

const exportLivery = async () => {
  if (!droppedCustomJson.value) {
    snackbar({ message: translate('livery.invalidFile'), autoCloseDelay: 3000 })
    return
  }

  // 1. 修改 cars.json 内容
  const modifiedCarsJson = {
    ...droppedCustomJson.value,
    customSkinName: skinName.value,
    raceNumber: formData.value.raceNumber,
    teamName: isTeam.value
      ? formData.value.teamName
      : formData.value.driverName,
  }
  const carsJsonText = JSON.stringify(modifiedCarsJson, null, 2)

  // Helper to encode string to UTF-16 LE with BOM
  const stringToUTF16LE = (text: string): Uint8Array => {
    const bomText = '\uFEFF' + text
    const utf16Array = new Uint16Array(bomText.length)
    for (let i = 0; i < bomText.length; i++) {
      utf16Array[i] = bomText.charCodeAt(i)
    }
    return new Uint8Array(utf16Array.buffer)
  }

  // 2-4. 清空并写入文件
  await window.fs?.clearUserDataDirectory('Cars')
  await window.fs?.clearUserDataDirectory('Liveries')

  await window.fs?.saveUserDataFile(
    `Cars/${skinName.value}.json`,
    stringToUTF16LE(carsJsonText),
  )

  const liveryNames = [
    'decals.json',
    'decals.png',
    'sponsors.json',
    'sponsors.png',
  ]

  const liveryEntries = liveryNames
    .map(name => droppedFiles.value.find(f => f.name.toLowerCase() === name))
    .filter(Boolean) as typeof droppedFiles.value

  for (const entry of liveryEntries) {
    let data: string | ArrayBuffer | Uint8Array
    if (entry.arrayBuffer) {
      data = entry.arrayBuffer
    } else if (entry.file) {
      data = await entry.file.arrayBuffer()
    } else if (entry.content !== undefined) {
      data = new TextEncoder().encode(entry.content)
    } else {
      continue
    }
    await window.fs?.saveUserDataFile(
      `Liveries/${skinName.value}/${entry.name}`,
      data,
    )
  }

  // 5. 生成 zip
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const carsFolder = zip.folder('Cars')
  const liveriesFolder = zip.folder('Liveries')
  const skinFolder = liveriesFolder?.folder(skinName.value)

  const carsData = stringToUTF16LE(carsJsonText)
  carsFolder?.file(`${skinName.value}.json`, carsData)

  for (const entry of liveryEntries) {
    let blobData: string | Uint8Array
    if (entry.arrayBuffer) {
      blobData = new Uint8Array(entry.arrayBuffer)
    } else if (entry.file) {
      const buf = await entry.file.arrayBuffer()
      blobData = new Uint8Array(buf)
    } else {
      blobData = entry.content || ''
    }
    skinFolder?.file(entry.name, blobData)
  }

  const zipData = await zip.generateAsync({ type: 'uint8array' })

  // 6. 让用户选择保存目录，并将zip写出
  const selectedDirs = await window.dialog?.show({
    properties: ['openDirectory'],
    title: translate('livery.selectExpPath'),
  })

  if (!selectedDirs || selectedDirs.length === 0) {
    return
  }

  const targetDir = selectedDirs[0]
  const outputPath = `${targetDir}/${skinName.value}.zip`
  await window.fs?.saveFileToPath(outputPath, zipData)

  // 8. 打开目标目录（可选）
  await window.shell?.openDirectory(targetDir)
}

const skinName = computed(
  () =>
    `${formData.value.raceName || '**'}_${carName.value?.hipoleName || '**'}_${formData.value.raceNumber ?? '**'}_${formData.value.driverName || '**'}`,
)

const reset = () => {
  toImportFiles.value = {
    'cars/*.json': false,
    'decals.json': false,
    'decals.png': false,
    'sponsors.json': false,
    'sponsors.png': false,
  }
  formData.value = {
    raceName: '',
    raceNumber: 0,
    driverName: '',
    teamName: '',
  }
}
</script>
<template>
  <div class="h-full flex flex-col justify-center items-center relative w-full">
    <mdui-card
      variant="outlined"
      class="size-full transition-all border border-[rgb(var(--mdui-color-inverse-primary-dark))] mx-4 mb-4 pl-4 relative"
      :style="{
        background: `rgba(var(--mdui-color-surface-container-lowest), ${(0.65 * (store.settings.general.bgOpacity || 0.75)) / 0.75})`,
      }"
    >
      <div class="absolute right-4 top-2 flex flex-row items-center">
        <mdui-radio-group
          :value="isTeam"
          @change="isTeam = $event.target.value"
        >
          <mdui-radio :value="false">{{ $t('livery.personal') }}</mdui-radio>
          <mdui-radio :value="true">{{ $t('livery.team') }}</mdui-radio>
        </mdui-radio-group>
        <mdui-button variant="text" class="mb-1.5 ml-2" @click="reset">
          <mdui-icon-loop--rounded slot="icon"></mdui-icon-loop--rounded>
          {{ $t('servers.resetFilter') }}
        </mdui-button>
      </div>
      <div class="font-bold title mt-4 flex flex-row items-center">
        {{ skinName }}
      </div>

      <div class="flex flex-row gap-2 items-center mt-3">
        <div class="flex flex-row w-1/3 items-center">
          <div>
            {{ $t('livery.racePrefix') }}
            <span class="text-red-500">&nbsp*</span>
          </div>
          <mdui-text-field
            variant="outlined"
            class="flex-1 text-field mr-4 ml-2"
            :value="formData.raceName"
            @input="formData.raceName = $event.target.value"
          >
          </mdui-text-field>
        </div>
        <div class="flex flex-row w-1/3 items-center">
          <div>
            {{ $t('livery.raceNumber') }}
            <span class="text-red-500">&nbsp*</span>
          </div>
          <mdui-text-field
            variant="outlined"
            class="flex-1 text-field mr-4 ml-2"
            :value="formData.raceNumber"
            @input="formData.raceNumber = Number($event.target.value)"
          >
          </mdui-text-field>
        </div>
        <div class="flex flex-row w-1/3 items-center">
          <div>
            {{ isTeam ? $t('livery.teamShortName') : $t('livery.driverName') }}
            <span class="text-red-500">&nbsp*</span>
          </div>
          <mdui-text-field
            variant="outlined"
            class="flex-1 text-field mr-4 ml-2"
            :value="formData.driverName"
            @input="formData.driverName = $event.target.value"
          >
          </mdui-text-field>
        </div>
      </div>
      <div v-if="isTeam" class="flex flex-row gap-2 items-center mt-3">
        <mdui-text-field
          variant="outlined"
          class="flex-1 text-field mr-4"
          :value="formData.teamName"
          @input="formData.teamName = $event.target.value"
          :placeholder="$t('livery.teamFullName')"
        />
      </div>
      <div
        class="relative rounded-2xl mt-4 mr-4 h-46 flex flex-col items-center justify-center opacity-80"
        :class="
          isDragging
            ? 'bg-[rgb(var(--mdui-color-primary-container))]'
            : 'border border-dashed'
        "
        @dragenter.prevent="handleDragEnter"
        @dragleave.prevent="handleDragLeave"
        @dragover.prevent
        @drop.prevent="handleDrop($event)"
      >
        <mdui-icon-add--rounded
          class="text-4xl text-[rgb(var(--mdui-color-primary))]"
          v-if="!isDragging"
        ></mdui-icon-add--rounded>
        <mdui-icon-file-upload--rounded
          v-else
          class="pointer-events-none mb-2 text-4xl text-[rgb(var(--mdui-color-primary))]"
        ></mdui-icon-file-upload--rounded>
        <p class="text-sm text-gray-500 pointer-events-none mb-8">
          {{
            isDragging ? $t('setup.releaseToLoad') : $t('livery.dragAndDrop')
          }}
        </p>

        <div class="absolute bottom-2" v-if="!isDragging">
          <div class="w-full text-center text-sm mb-1 text-gray-500">
            {{ carName?.name }}
          </div>
          <div class="flex flex-row justify-center gap-2">
            <mdui-chip
              v-for="[file, imported] in Object.entries(toImportFiles)"
              class="pointer-events-none border border-[rgb(var(--mdui-color-outline-variant))]"
              :class="{
                'bg-[rgb(var(--mdui-color-primary-container))] border-none':
                  imported,
              }"
              style="--mdui-state-layer-hover: 0; --mdui-state-layer-pressed: 0"
            >
              {{ file }}
            </mdui-chip>
          </div>
        </div>
      </div>

      <div class="mt-4 opacity-70">
        <div>{{ $t('livery.tipDesc') }}</div>
        <ul class="list-disc list-inside">
          <li>{{ $t('livery.tip1', { fileName: skinName }) }}{{ skinName }}</li>
          <li>
            {{ $t('livery.tip2', { fileName: skinName })
            }}{{ isTeam ? formData.teamName : formData.driverName }}
          </li>
          <li>
            {{ $t('livery.tip3', { fileName: skinName })
            }}{{ formData.raceNumber }}
          </li>
          <li>{{ $t('livery.tip4', { fileName: skinName }) }}</li>
        </ul>
        <div>
          {{ $t('livery.hipoleMail') }}
          <a href="mailto:tz@hipole.com">tz@hipole.com</a>
        </div>
      </div>

      <div
        class="absolute bottom-2 left-0 right-0 text-center text-gray-400 text-sm flex flex-col items-center"
      >
        <mdui-button
          class="w-max mb-3 font-bold"
          :disabled="!filesValid"
          @click="exportLivery"
          >{{ $t('livery.export') }}</mdui-button
        >
      </div>
    </mdui-card>
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
::part(text-field__container) {
  border-radius: 999px;
  background: rgb(var(--mdui-color-background));
  height: 36px;
}
</style>
