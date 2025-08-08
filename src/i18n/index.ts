import { createI18n } from 'vue-i18n'
import zhCN from './zh_CN.json'
import enUS from './en_US.json'

type MessageSchema = typeof enUS
export type Lang = 'en_US' | 'zh_CN'
const i18n = createI18n<[MessageSchema], Lang>({
  // default locale
  locale: localStorage.lang || 'en_US',
  fallbackLocale: 'en_US',
  legacy: true,
  globalInjection: true,
  // translations
  messages: {
    en_US: enUS,
    zh_CN: zhCN,
  },
})

export default i18n

export const availableLangCodes: Lang[] = ['en_US', 'zh_CN']
export const availableLangNames: string[] = ['English', '简体中文']
export const langMap: Record<Lang, string> = {
  en_US: 'English',
  zh_CN: '简体中文',
}

export const currentLocale = () => {
  return i18n.global.locale
}

export const translate = (key: string, bindings?: Record<string, any>) => {
  if (!key || key === '') {
    return ''
  }
  return bindings ? i18n.global.t(key, bindings) : i18n.global.t(key)
}

export const translateMultiple = (keys: string[]) => {
  const res: string[] = []

  if (!keys || keys.length == 0) {
    return res
  }

  for (let i = 0; i < keys.length; i++) {
    res.push(translate(keys[i]))
  }

  return res
}

export const translateWithLocale = (
  key: string,
  locale: Lang,
  bindings?: any,
) => {
  if (!key) {
    return ''
  }
  console.log('asad', locale)
  return i18n.global.t(key, locale, bindings)
}

export const switchLang = (language: Lang) => {
  localStorage.lang = language
  // store.settings.general.lang = language
  i18n.global.locale = language
}

export const str2Lang = (str: string | null): Lang | null => {
  switch (str) {
    case 'en_US':
      return 'en_US'
    case 'zh_CN':
      return 'zh_CN'
    default:
      return null
  }
}
