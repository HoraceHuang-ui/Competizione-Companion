const presetTemplate = {
  SETTINGS: {
    serverName: 'ACC Server (please edit settings.json)',
    adminPassword: '',
    password: '',
    spectatorPassword: '',
    centralEntryListPath: '',
    carGroup: 'FreeForAll',
    trackMedalsRequirement: 0,
    safetyRatingRequirement: -1,
    racecraftRatingRequirement: -1,
    maxCarSlots: 30,
    isRaceLocked: 0,
    isLockedPrepPhase: 0,
    shortFormationLap: 0,
    dumpLeaderboards: 0,
    dumpEntryList: 0,
    randomizeTrackWhenEmpty: 0,
    allowAutoDQ: 0,
    ignorePrematureDisconnects: 0,
    formationLapType: 0,
    configVersion: 1,
  },

  ASSIST: {
    disableIdealLine: 0,
    disableAutosteer: 0,
    stabilityControlLevelMax: 100,
    disableAutoPitLimiter: 0,
    disableAutoGear: 0,
    disableAutoClutch: 0,
    disableAutoEngineStart: 0,
    disableAutoWiper: 0,
    disableAutoLights: 0,
  },

  EVENT: {
    ambientTemp: 22,
    cloudLevel: 0.1,
    configVersion: 1,
    isFixedConditionQualification: 0,
    postQualySeconds: 0,
    postRaceSeconds: 0,
    preRaceWaitingTimeSeconds: 80,
    rain: 0.0,
    sessionOverTimeSeconds: 120,
    sessions: [
      {
        dayOfWeekend: 2,
        hourOfDay: 6,
        sessionDurationMinutes: 10,
        sessionType: 'P',
        timeMultiplier: 1,
      },
      {
        dayOfWeekend: 2,
        hourOfDay: 12,
        sessionDurationMinutes: 10,
        sessionType: 'Q',
        timeMultiplier: 1,
      },
      {
        dayOfWeekend: 3,
        hourOfDay: 18,
        sessionDurationMinutes: 20,
        sessionType: 'R',
        timeMultiplier: 2,
      },
    ],
    simracerWeatherConditions: 0,
    track: 'barcelona',
    weatherRandomness: 1,
  },

  EVENTRULES: {
    qualifyStandingType: 1,
    pitWindowLengthSec: -1,
    driverStintTimeSec: -1,
    mandatoryPitstopCount: 0,
    maxTotalDrivingTime: -1,
    maxDriversCount: 1,
    tyreSetCount: 50,
    isRefuellingAllowedInRace: false,
    isRefuellingTimeFixed: false,
    isMandatoryPitstopRefuellingRequired: false,
    isMandatoryPitstopTyreChangeRequired: false,
    isMandatoryPitstopSwapDriverRequired: false,
  },

  CONFIGURATION: {
    udpPort: 9231,
    tcpPort: 9232,
    maxConnections: 85,
    lanDiscovery: 0,
    registerToLobby: 0,
    configVersion: 1,
  },

  ENTRYLIST: {
    entries: [],
    forceEntryList: 0,
  },

  BOP: {
    entries: [],
  },
}

export default presetTemplate
