import { useState, useMemo, useCallback } from 'react'
import { useAppState, useAragonApi } from '@aragon/api-react'
import { useSidePanel, useNow } from './utils-hooks'
import { hasExpired } from '../lib/token-request-utils'
import { requestStatus } from '../lib/constants'
import { hoursToMs } from '../lib/math-utils'

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

const useRequests = () => {
  const { requests } = useAppState()

  return useMemo(
    () =>
      (requests || []).map((request, index) => ({
        ...request,
      })),
    [requests]
  )
}

export function useAppLogic() {
  const { acceptedTokens, account, token, isSyncing, ready } = useAppState()
  const requests = useRequests()
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
