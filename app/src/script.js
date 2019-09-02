import 'core-js/stable'
import 'regenerator-runtime/runtime'
import Aragon, { events } from '@aragon/api'
import { first } from 'rxjs/operators'
import tokenDecimalsAbi from './abi/token-decimals.json'
import tokenNameAbi from './abi/token-name.json'
import tokenSymbolAbi from './abi/token-symbol.json'
import tmAbi from './abi/tokenManager.json'
import { requestStatus } from './lib/constants'
import {
  ETHER_TOKEN_FAKE_ADDRESS,
  tokenDataFallback,
  getTokenSymbol,
  getTokenName,
  getTokenDecimals,
} from './lib/token-utils'

const tokenAbi = [].concat(tokenDecimalsAbi, tokenNameAbi, tokenSymbolAbi)

const app = new Aragon()

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

app
  .call('tokenManager')
  .subscribe(initialize, err =>
    console.error(`Could not start background script execution due to the contract not loading token: ${err}`)
  )

async function initialize(tokenManagerAddress) {
  let tokens
  const network = await app
    .network()
    .pipe(first())
    .toPromise()
  const tmContract = app.external(tokenManagerAddress, tmAbi)
  tokens = await app.call('getAcceptedTokenList').toPromise()
  tokens.unshift(ETHER_TOKEN_FAKE_ADDRESS)

  const settings = {
    network,
  }
  return createStore(tmContract, tokens, settings)
}

async function createStore(tokenManagerContract, tokens, settings) {
  return app.store(
    (state, { event, returnValues }) => {
      let nextState = {
        ...state,
      }

      switch (event) {
        case events.ACCOUNTS_TRIGGER:
          return updateConnectedAccount(nextState, returnValues)
        case events.SYNC_STATUS_SYNCING:
          return { ...nextState, isSyncing: true }
        case events.SYNC_STATUS_SYNCED:
          return { ...nextState, isSyncing: false }
        case 'TokenRequestCreated':
          return newTokenRequest(nextState, returnValues, settings)
        case 'TokenRequestRefunded':
          return requestRefunded(nextState, returnValues)
        case 'TokenRequestFinalised':
          return requestFinalised(nextState, returnValues)
        default:
          return state
      }
    },
    {
      init: initializeState({}, tokenManagerContract, tokens, settings),
    }
  )
}

/***********************
 *                     *
 *   Event Handlers    *
 *                     *
 ***********************/

function initializeState(state, tokenManagerContract, tokens, settings) {
  return async () => {
    try {
      const minimeAddress = await tokenManagerContract.token().toPromise()
      const token = await getTokenData(minimeAddress, settings)
      const acceptedTokens = await getAcceptedTokens(tokens, settings)
      const timeToExpiry = await app.call('timeToExpiry').toPromise()

      token && app.indentify(`token-request ${token.symbol}`)

      return {
        ...state,
        isSyncing: true,
        token,
        acceptedTokens: acceptedTokens,
        requests: [],
        timeToExpiry,
      }
    } catch (error) {
      console.error('Error initializing state: ', error)
    }
  }
}

const getAcceptedTokens = async (tokens, settings) => {
  const promises = tokens.map(async tokenAddress => {
    const token = await getTokenData(tokenAddress, settings)
    return token
  })
  return Promise.all(promises)
}

async function updateConnectedAccount(state, { account }) {
  return {
    ...state,
    account,
  }
}

async function newTokenRequest(
  state,
  { requestId, requesterAddress, depositToken, depositAmount, requestAmount, date },
  settings
) {
  const { account, requests } = state
  let status
  if (!account) return state

  const { decimals, name, symbol } = await getTokenData(depositToken, settings)

  const tokenRequestList = await app.call('getTokenRequest', requestId).toPromise()
  if (tokenRequestList.requesterAddress != ZERO_ADDRESS) {
    status = requestStatus.PENDING
  }

  return {
    ...state,
    requests: [
      ...requests,
      {
        requestId,
        requesterAddress,
        depositToken,
        depositDecimals: decimals,
        depositName: name,
        depositSymbol: symbol,
        depositAmount,
        requestAmount,
        status,
        date: marshallDate(date),
        actionDate: null,
      },
    ],
  }
}

async function requestRefunded(state, { requestId, refundedDate }) {
  const { requests } = state
  const nextStatus = requestStatus.WITHDRAWED
  return {
    ...state,
    requests: await updateRequestStatus(requests, requestId, nextStatus, refundedDate),
  }
}
async function requestFinalised(state, { requestId, finalizedDate }) {
  const { requests } = state
  const nextStatus = requestStatus.APPROVED

  return {
    ...state,
    requests: await updateRequestStatus(requests, requestId, nextStatus, finalizedDate),
  }
}

/***********************
 *                     *
 *       Helpers       *
 *                     *
 ***********************/

async function getTokenData(tokenAddress, settings) {
  const [decimals, name, symbol] = await Promise.all([
    loadTokenDecimals(tokenAddress, settings),
    loadTokenName(tokenAddress, settings),
    loadTokenSymbol(tokenAddress, settings),
  ])
  return {
    decimals,
    name,
    symbol,
    address: tokenAddress,
  }
}

async function updateRequestStatus(requests, requestId, nextStatus, actionDate) {
  const requestIndex = requests.findIndex(request => request.requestId === requestId)

  if (requestIndex !== -1) {
    const nextRequests = Array.from(requests)
    nextRequests[requestIndex] = {
      ...nextRequests[requestIndex],
      status: nextStatus,
      actionDate: marshallDate(actionDate),
    }
    return nextRequests
  } else {
    console.error(`Tried to update request #${requestId} that shouldn't exist!`)
  }
}

async function loadTokenName(tokenAddress, { network }) {
  const fallback = tokenDataFallback(tokenAddress, 'name', network.type) || ''
  let name
  try {
    name = (await getTokenName(app, tokenAddress)) || fallback
  } catch (err) {
    // name is optional
    name = fallback
  }
  return name
}

async function loadTokenSymbol(tokenAddress, { network }) {
  const fallback = tokenDataFallback(tokenAddress, 'symbol', network.type) || ''

  let symbol
  try {
    symbol = (await getTokenSymbol(app, tokenAddress)) || fallback
  } catch (err) {
    // symbol is optional
    symbol = fallback
  }
  return symbol
}

async function loadTokenDecimals(tokenAddress, { network }) {
  const fallback = tokenDataFallback(tokenAddress, 'decimals', network.type) || '0'

  let decimals
  try {
    decimals = (await getTokenDecimals(app, tokenAddress)) || fallback
  } catch (err) {
    // decimals is optional
    decimals = fallback
  }
  return decimals
}

function marshallDate(date) {
  // Represent dates as real numbers, as it's very unlikely they'll hit the limit...
  // Adjust for js time (in ms vs s)
  return parseInt(date, 10) * 1000
}
