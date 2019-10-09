import { hasLoadedtokenRequestSettings } from './lib/token-request-settings'
import { compareDesc } from 'date-fns'

function appStateReducer(state) {
  const ready = hasLoadedtokenRequestSettings(state)

  if (!ready) {
    return { ...state, ready }
  }

  const { requests } = state

  return {
    ...state,
    ready,
    requests: requests.sort(({ date: dateLeft }, { date: dateRight }) =>
      // Sort by date descending
      compareDesc(dateLeft, dateRight)
    ),
  }
}

export default appStateReducer
