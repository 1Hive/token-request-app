const tokenRequestSettings = [['timeToExpiry', 'timeToExpiry']]

export function hasLoadedtokenRequestSettings(state) {
  state = state || {}
  return tokenRequestSettings.reduce((loaded, [_, key]) => loaded && !!state[key], true)
}

export default tokenRequestSettings
