import 'core-js/stable'
import 'regenerator-runtime/runtime'
import Aragon, { events } from '@aragon/api'
import { first } from 'rxjs/operators'
import tmAbi from './abi/tokenManager.json'
import { requestStatus } from './lib/constants'
import {
  tokenDataFallback,
  getTokenSymbol,
  getTokenName,
  getTokenDecimals,
  ETHER_TOKEN_FAKE_ADDRESS,
} from './lib/token-utils'
import {ipfsGet} from './utils/ipfs-helpers'

const app = new Aragon()

const ETHER_DATA = {
  decimals: 18,
  name: 'Ether',
  symbol: 'ETH',
}

app
  .call('tokenManager')
  .subscribe(initialize, err =>
    console.error(`Could not start background script execution due to the contract not loading token: ${err}`)
  )

async function initialize(tokenManagerAddress) {
  let tokens = []
  const network = await app
    .network()
    .pipe(first())
    .toPromise()
  const tmContract = app.external(tokenManagerAddress, tmAbi)
  tokens = await app.call('getAcceptedDepositTokens').toPromise()

  const settings = {
    network,
  }
  return createStore(tmContract, tokens, settings)
}

async function createStore(tokenManagerContract, tokens, settings) {
  return app.store(
    async (state, event) => {
      const { event: eventName, returnValues, blockNumber } = event
      let nextState = {
        ...state,
      }
      console.log('TR EVENT ', eventName)
      switch (eventName) {
        case events.ACCOUNTS_TRIGGER:
          return updateConnectedAccount(nextState, returnValues)
        case events.SYNC_STATUS_SYNCING:
          return { ...nextState, isSyncing: true }
        case events.SYNC_STATUS_SYNCED:
          return { ...nextState, isSyncing: false }
        case 'TokenRequestCreated':
          nextState = await newTokenRequest(nextState, returnValues, settings, blockNumber)
          break
        case 'TokenRequestRefunded':
          nextState = await requestRefunded(nextState, returnValues)
          break
        case 'TokenRequestFinalised':
          nextState = await requestFinalised(nextState, returnValues)
          break
        case 'ForwardedActions':
          const offchainActions = await onForwardedActions(returnValues)
          if (offchainActions){
            console.log('offchainActions ', offchainActions.failedActions.length)
            console.log(' state.failedForwardedActionLength ',  state.failedForwardedActionLength)
            if(offchainActions.failedActions.length > state.failedForwardedActionLength){
              nextState = await requestRejected(state, offchainActions.failedActions)
            }
        }
          
          // console.log('OFFCHAINACTIONS ', nextState.offchainActions)
          // if(nextState.offchainActions.failedActions.length > 0){
          //   const transformed = await app.describeScript(nextState.offchainActions.failedActions[0].script).toPromise()
          // // const transformed2 = await app.describeScript("0xbf6eec160000000000000000000000000000000000000000000000000000000000000002").toPromise()
          //   console.log('TRANSFORMED ', transformed)
          //   //console.log('Transformed 2 ',  transformed2)
          //   const transformed2 = await app.describeTransaction({data: transformed[0].data, to:transformed[0].to}).toPromise()

          //   console.log('TRANSFORMED 2', transformed2)
          // }
          break
        default:
          break
      }
      return nextState
    },
    {
      init: initializeState(tokenManagerContract, tokens, settings),
    }
  )
}

/***********************
 *                     *
 *   Event Handlers    *
 *                     *
 ***********************/

function initializeState(tokenManagerContract, tokens, settings) {
  return async cachedState => {
    try {
      const minimeAddress = await tokenManagerContract.token().toPromise()
      const token = await getTokenData(minimeAddress, settings)
      const acceptedTokens = await getAcceptedTokens(tokens, settings)

      tokens.includes(ETHER_TOKEN_FAKE_ADDRESS) &&
        acceptedTokens.unshift({
          ...ETHER_DATA,
          address: ETHER_TOKEN_FAKE_ADDRESS,
        })
      token && app.indentify(`token-request ${token.symbol}`)
      return {
        ...cachedState,
        isSyncing: true,
        token,
        acceptedTokens,
        failedForwardedActionLength: 0
      }
    } catch (error) {
      console.error('Error initializing state: ', error)
    }
  }
}

const onForwardedActions = async ({ failedActionKeys = [], pendingActionKeys = [], actions }) => {
  const offchainActions = { pendingActions: [], failedActions: [] }

  const getDataFromKey = async key => {
    const action = actions[key]
    const data = await app.queryAppMetadata(action.currentApp, action.actionId).toPromise()
    if (!data) return
    let metadata = await ipfsGet(data.cid)
    if (!metadata) return
    return { ...action, ...metadata }
  }

  let getFailedActionData = failedActionKeys.map(getDataFromKey)

  let getPendingActionData = pendingActionKeys.map(getDataFromKey)

  offchainActions.failedActions = (await Promise.all(getFailedActionData))
    .filter(action => action !== undefined)
    .map(action => ({
      ...action,
      startTime: new Date(action.startDate),
      description: action.metadata,
      amount: String(action.balance),
      distSet: false,
      pending: false
    }))

  offchainActions.pendingActions = (await Promise.all(getPendingActionData))
    .filter(action => action !== undefined)
    .map(action => ({
      ...action,
      startTime: new Date(action.startDate),
      description: action.metadata,
      amount: String(action.balance),
      distSet: false,
      pending: true
    }))

  return offchainActions
}

const getAcceptedTokens = async (tokens, settings) => {
  const promises = tokens
    .filter(token => token != ETHER_TOKEN_FAKE_ADDRESS)
    .map(tokenAddress => getTokenData(tokenAddress, settings))
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
  { requestId, requesterAddress, depositToken, depositAmount, requestAmount, reference },
  settings,
  blockNumber
) {
  try {
    const { requests = [] } = state
    const { decimals, name, symbol } =
      depositToken === ETHER_TOKEN_FAKE_ADDRESS ? ETHER_DATA : await getTokenData(depositToken, settings)

    const { timestamp } = await app.web3Eth('getBlock', blockNumber).toPromise()

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
          reference,
          status: requestStatus.PENDING,
          date: marshallDate(timestamp),
        },
      ],
    }
  } catch (err) {
    console.log(err)
  }
}

async function requestRejected(state, failedActions) {
  const { requests } = state
  const nextStatus = requestStatus.REJECTED
  const failedAction = failedActions[failedActions.length - 1]
  console.log('REJECT FAILED ACTION ', failedAction)
  const {evmScript} = failedAction
  const scriptDescription = await app.describeScript(evmScript).toPromise()
  const voteDescription = scriptDescription[0].description
  console.log('DESCRIPTION ', voteDescription)
  const tokenRequestId = voteDescription.substr(0, voteDescription.indexOf('-')); 
  console.log('tokenRequestId ', Number(tokenRequestId))

  return {
    ...state,
    requests: await updateRequestStatus(requests,  Number(tokenRequestId), nextStatus),
    failedForwardedActionLength: failedActions.length
  }
}

async function requestRefunded(state, { requestId }) {
  const { requests } = state
  const nextStatus = requestStatus.WITHDRAWN
  return {
    ...state,
    requests: await updateRequestStatus(requests, requestId, nextStatus),
  }
}
async function requestFinalised(state, { requestId }) {
  const { requests } = state
  const nextStatus = requestStatus.APPROVED

  return {
    ...state,
    requests: await updateRequestStatus(requests, requestId, nextStatus),
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

async function updateRequestStatus(requests, requestId, nextStatus) {
  console.log('update requests ', requests)
  console.log('update requestId ', requestId)
  const requestIndex = requests.findIndex(request => request.requestId == requestId)
  console.log('update requestIndex ', requestIndex)
  if (requestIndex !== -1) {
    const nextRequests = Array.from(requests)
    nextRequests[requestIndex] = {
      ...nextRequests[requestIndex],
      status: nextStatus,
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
