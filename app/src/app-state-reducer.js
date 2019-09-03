import { hasLoadedtokenRequestSettings } from './lib/token-request-settings'

function appStateReducer(state) {
  const ready = hasLoadedtokenRequestSettings(state)
  return { ...state, ready }
}

export default appStateReducer
