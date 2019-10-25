import { useCallback, useState, useMemo } from 'react'
import { useAppState, useAragonApi } from '@aragon/api-react'
import { useSidePanel } from './utils-hooks'

// Get the request currently selected, or null otherwise.
export function useSelectedRequest(requests) {
  const [selectedRequestId, setSelectedRequestId] = useState('-1')
  const { ready } = useAppState()

  // The memoized request currently selected.
  const selectedRequest = useMemo(() => {
    // The `ready` check prevents a request to be selected
    // until the app state is fully ready.
    if (!ready || selectedRequestId === '-1') {
      return null
    }
    return requests.find(request => request.requestId === selectedRequestId) || null
  }, [selectedRequestId, requests, ready])

  return [
    selectedRequest,

    // setSelectedRequestId() is exported directly: since `selectedRequestId` is
    // set in the `selectedRequest` dependencies, it means that the useMemo()
    // will be updated every time `selectedRequestId` changes.
    setSelectedRequestId,
  ]
}

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
  const [selectedRequest, selectRequest] = useSelectedRequest(requests)
  const panelState = useSidePanel()

  const actions = {
    request: useRequestAction(panelState.requestClose),
    submit: useSubmitAction(panelState.requestClose),
    withdraw: useWithdrawAction(panelState.requestClose),
  }

  return {
    panelState,
    isSyncing: isSyncing || !ready,
    selectedRequest,
    selectRequest,
    acceptedTokens,
    account,
    token,
    actions,
    requests,
  }
}
