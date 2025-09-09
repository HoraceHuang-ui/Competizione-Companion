import tracks from '@/utils/trackData'
import { translate } from '@/i18n'
import { useStore } from '@/store'
import { trackCarDispSettings, trackIndex } from '@/utils/enums'
import carData from '@/utils/carData'
import { snackbar } from 'mdui'

export const obj2Param = (obj: Record<string, any>) => {
  const store = useStore()

  return Object.entries(obj)
    .map(([key, value]) => {
      if (value === undefined || value === null) return ''
      if (typeof value === 'object') {
        return `${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`
      }
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    })
    .filter(Boolean)
    .join('&')
}

export const getTrackDisplay = (trackId: string) => {
  const store = useStore()
  const res = tracks.find((t: []) => t[trackIndex.ID] === trackId.toLowerCase())

  if (store.settings.setup.trackDisplay == trackCarDispSettings.LOCAL) {
    return translate(`tracks.${res?.[trackIndex.ID]}`)
  } else {
    return res?.[
      [trackIndex.FULL, trackIndex.SHORT][store.settings.setup.trackDisplay - 1]
    ]
  }
}

export const getCarDisplay = (car: [string, any]) => {
  const store = useStore()

  if (store.settings.setup.carDisplay == trackCarDispSettings.LOCAL) {
    return translate(`cars.${car?.[0]}`)
  } else {
    if (car?.[1]) {
      return car[1][['name', 'shortName'][store.settings.setup.carDisplay - 1]]
    } else {
      for (const series of Object.values(carData) as any[]) {
        if (series[car[0]]) {
          return series[car[0]][
            ['name', 'shortName'][store.settings.setup.carDisplay - 1]
          ]
        }
      }
    }
  }
  return ''
}

export const getCarDisplayById = (carId: number) => {
  for (const series of Object.values(carData) as any[]) {
    for (const [key, car] of Object.entries(series) as [string, any][]) {
      if (car.id === carId) {
        return getCarDisplay([key, car])
      }
    }
  }
}

export const checkUpdate = async (
  curVersion: string = import.meta.env.VITE_APP_VERSION,
) => {
  const needsUpdate = (latestStr: string) => {
    const verCompare = (a: string, b: string) => {
      const arr1 = a.split('.')
      const arr2 = b.split('.')

      if (arr1.length != arr2.length) {
        return 114
      }

      for (let i = 0; i < arr1.length; i++) {
        if (parseInt(arr1[i]) > parseInt(arr2[i])) {
          return 1
        } else if (parseInt(arr1[i]) < parseInt(arr2[i])) {
          return -1
        }
      }
      return 0
    }
    return verCompare(latestStr.split(' ')[0], curVersion.split(' ')[0]) > 0
  }

  try {
    const res = await window.axios
      // .get('http://0.0.0.0:5005/competizione')
      .get('http://120.55.52.240:5005/competizione')
    if (res.success) {
      const resp = res.updInfo
      if (needsUpdate(resp.version)) {
        return resp
      } else {
      }
    }
  } catch (error) {
    snackbar({
      message: translate('general.checkUpdFail'),
      autoCloseDelay: 3000,
    })
    console.error(error)
  }
}
