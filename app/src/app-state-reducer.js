import { hasLoadedtokenRequestSettings } from './lib/token-request-settings'

function appStateReducer(state) {
  const ready = hasLoadedtokenRequestSettings(state)

  console.log('newstate', state)
  return { ...state, ready }
}

export default appStateReducer
