import { useCallback } from 'react'
import { useAppState, useAragonApi } from '@aragon/api-react'
import { useSidePanel } from './utils-hooks'

export function useRequestAction(onDone) {
  const { api } = useAragonApi()

  return useCallback(
    (depositTokenAddress, depositAmount, requestAmount, intentParams) => {
      try {
        api.createTokenRequest(depositTokenAddress, depositAmount, requestAmount, intentParams).toPromise()

        onDone()
      } catch (error) {
        console.error(error)
      }
    },
    [api, onDone]
  )
}

export function useSubmitAction(onDone) {
  const { api } = useAragonApi()

  return useCallback(
    requestId => {
      try {
        api.finaliseTokenRequest(requestId).toPromise()

        onDone()
      } catch (error) {
        console.error(error)
      }
    },
    [api, onDone]
  )
}

export function useWithdrawAction(onDone) {
  const { api } = useAragonApi()

  return useCallback(
    requestId => {
      try {
        api.refundTokenRequest(requestId).toPromise()

        onDone()
      } catch (error) {
        console.error(error)
      }
    },
    [api, onDone]
  )
}

export function useAppLogic() {
  const { acceptedTokens, account, token, isSyncing, ready, requests } = useAppState()
  const panelState = useSidePanel()

  const actions = {
    request: useRequestAction(panelState.requestClose),
    submit: useSubmitAction(panelState.requestClose),
    withdraw: useWithdrawAction(panelState.requestClose),
  }

  return {
    panelState,
    isSyncing: isSyncing || !ready,
    acceptedTokens,
    account,
    token,
    actions,
    requests,
  }
}
