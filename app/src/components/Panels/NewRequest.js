import React, { useState, useEffect, useCallback } from 'react'
import styled from 'styled-components'
import { Button, Field, Text, TextInput, theme, GU, IconCross, useTheme, textStyle, Info, Link } from '@aragon/ui'
import { useAppState } from '@aragon/api-react'
import { useAragonApi, useApi } from '@aragon/api-react'
import TokenSelector from '../TokenSelector'
import { addressesEqual, isAddress } from '../../lib/web3-utils'
import { fromDecimals, toDecimals } from '../../lib/math-utils'
import { ETHER_TOKEN_FAKE_ADDRESS, tokenDataFallback, getTokenSymbol } from '../../lib/token-utils'
import tokenBalanceOfAbi from '../../abi/token-balanceof.json'
import tokenDecimalsAbi from '../../abi/token-decimals.json'
import tokenSymbolAbi from '../../abi/token-symbol.json'
import { BN } from 'bn.js'

const TOKEN_ALLOWANCE_WEBSITE = 'https://tokenallowance.io/'
const NO_ERROR = Symbol('NO_ERROR')
const BALANCE_NOT_ENOUGH_ERROR = Symbol('BALANCE_NOT_ENOUGH_ERROR')
const DECIMALS_TOO_MANY_ERROR = Symbol('DECIMALS_TOO_MANY_ERROR')

const tokenAbi = [].concat(tokenBalanceOfAbi, tokenDecimalsAbi, tokenSymbolAbi)

const initialState = {
  amount: {
    error: NO_ERROR,
    value: '',
  },
  selectedToken: {
    coerced: false, // whether the token was coerced from a symbol to an address
    error: NO_ERROR,
    index: -1,
    value: '',
  },
  selectedTokenData: {
    loading: false,
  },
  depositErrorMessage: '',
  submitButtonDisabled: false,
  isTokenSelected: false,
}

function NewRequest({ network, panelOpened, onRequest }) {
  const { acceptedTokens, account, token } = useAppState()
  const api = useApi()
  const isMainnet = network.type === 'main'

  const [selectedToken, setSelectedToken] = useState({ ...initialState.selectedToken })
  const [depositedAmount, setDepositedAmount] = useState({ ...initialState.amount })
  const [selectedTokenData, setSelectedTokenData] = useState({ ...initialState.selectedTokenData })
  const [requestedAmount, setRequestedAmount] = useState('')
  const [tokenBalanceMessage, setTokenBalanceMessage] = useState('')
  const [depositErrorMessage, setDepositErrorMessage] = useState(initialState.depositErrorMessage)
  const [submitButtonDisabled, setSubmitButtonDisabled] = useState(initialState.submitButtonDisabled)
  const [isTokenSelected, setIsTokenSelected] = useState(initialState.isTokenSelected)

  useEffect(() => {
    async function getSelectedTokenData() {
      const tokenData = await loadTokenData(selectedToken.value)
      setSelectedTokenData(tokenData)
      setTokenBalanceMessage(renderBalanceForSelectedToken(tokenData))
    }
    if (selectedToken.index != -1) {
      getSelectedTokenData()
      const ethSelected =
        isAddress(selectedToken.value) && addressesEqual(selectedToken.value, ETHER_TOKEN_FAKE_ADDRESS)
      const tokenSelected = selectedToken.value && !ethSelected
      setIsTokenSelected(tokenSelected)
    }
  }, [selectedToken.index])

  useEffect(() => {
    if (!panelOpened) {
      setSelectedToken({ ...initialState.selectedToken })
      setDepositedAmount({ ...initialState.amount })
      setRequestedAmount('')
      setTokenBalanceMessage('')
    }
  }, [panelOpened])

  useEffect(() => {
    let errorMessage
    if (depositedAmount.error === BALANCE_NOT_ENOUGH_ERROR) {
      errorMessage = 'Amount is greater than balance held'
    } else if (depositedAmount.error === DECIMALS_TOO_MANY_ERROR) {
      errorMessage = 'Amount contains too many decimal places'
    }
    const disabled = !!errorMessage || !(selectedToken.value && !selectedTokenData.loading)
    setDepositErrorMessage(errorMessage)
    setSubmitButtonDisabled(disabled)
  }, [depositedAmount, selectedToken, selectedTokenData])

  const renderBalanceForSelectedToken = selectedToken => {
    const { decimals, loading, symbol, userBalance } = selectedToken

    if (loading || !userBalance) {
      return ''
    }
    return userBalance === '-1'
      ? `Your balance could not be found for ${symbol}`
      : `You have ${userBalance === '0' ? 'no' : fromDecimals(userBalance, decimals)} ${symbol} available`
  }

  const handleFormSubmit = useCallback(
    e => {
      e.preventDefault()
      const depositAmount = toDecimals(depositedAmount.value, selectedTokenData.decimals)
      const requested = toDecimals(requestedAmount, Number(token.decimals))

      onRequest(selectedToken.value, depositAmount, requested)
    },
    [onRequest, token, selectedTokenData, depositedAmount, requestedAmount]
  )

  const handleRequestedAmountUpdate = useCallback(e => {
    setRequestedAmount(e.target.value)
  })

  const handleAmountUpdate = useCallback(
    e => {
      validateInputs({
        amount: {
          value: e.target.value,
        },
      })
      // setAmount({ value: e.target.value, error: NO_ERROR })
    },
    [depositedAmount]
  )

  const handleSelectedToken = useCallback(({ address, index, value }) => {
    const tokenIsAddress = isAddress(address)
    const token = {
      index,
      coerced: tokenIsAddress && address !== value,
      value: address,
    }
    if (!tokenIsAddress) {
      return
    }
    setSelectedToken(token)
  })

  const loadTokenData = async address => {
    // ETH
    if (addressesEqual(address, ETHER_TOKEN_FAKE_ADDRESS)) {
      const userBalance = await api
        .web3Eth('getBalance', account)
        .toPromise()
        .catch(() => '-1')

      return {
        decimals: 18,
        loading: false,
        symbol: 'ETH',
        userBalance,
      }
    }

    // Tokens
    const token = api.external(address, tokenAbi)

    const userBalance = await token
      .balanceOf(account)
      .toPromise()
      .catch(() => '-1')

    const decimalsFallback = tokenDataFallback(address, 'decimals', network.type) || '0'
    const symbolFallback = tokenDataFallback(address, 'symbol', network.type) || ''

    const tokenData = {
      userBalance,
      decimals: parseInt(decimalsFallback, 10),
      loading: false,
      symbol: symbolFallback,
    }

    const [tokenSymbol, tokenDecimals] = await Promise.all([
      getTokenSymbol(api, address).catch(() => ''),
      token
        .decimals()
        .toPromise()
        .then(decimals => parseInt(decimals, 10))
        .catch(() => ''),
    ])

    // If symbol or decimals are resolved, overwrite the fallbacks
    if (tokenSymbol) {
      tokenData.symbol = tokenSymbol
    }
    if (tokenDecimals) {
      tokenData.decimals = tokenDecimals
    }

    return tokenData
  }

  const validateInputs = ({ amount, selectedToken } = {}) => {
    amount = amount || depositedAmount
    selectedToken = selectedToken || selectedTokenData
    console.log('AMOUUUU ', amount)
    if (selectedToken) {
      if (amount.value && selectedToken.decimals) {
        // Adjust but without truncation in case the user entered a value with more
        // decimals than possible
        const adjustedAmount = toDecimals(amount.value, selectedToken.decimals, {
          truncate: false,
        })

        if (adjustedAmount.indexOf('.') !== -1) {
          setDepositedAmount({ ...amount, error: DECIMALS_TOO_MANY_ERROR })
          return false
        }

        if (selectedToken.userBalance && new BN(adjustedAmount).gt(new BN(selectedToken.userBalance))) {
          setDepositedAmount({ ...amount, error: BALANCE_NOT_ENOUGH_ERROR })
          return false
        }
      }
    }

    setDepositedAmount({ ...amount, error: NO_ERROR })
    return true
  }

  console.log('AMOUNTTTTT ', depositedAmount)
  return (
    <form
      onSubmit={handleFormSubmit}
      css={`
        margin-top: ${3 * GU}px;
      `}
    >
      <TokenSelector activeIndex={selectedToken.index} onChange={handleSelectedToken} tokens={acceptedTokens} wide />
      <TokenBalance>
        <Text size="small" color={theme.textSecondary}>
          {tokenBalanceMessage}
        </Text>
      </TokenBalance>
      <Field label="Amount">
        <TextInput.Number
          value={depositedAmount.value}
          onChange={handleAmountUpdate}
          min={0}
          step="any"
          required
          wide
        />
      </Field>
      <Field label="Requested Amount">
        <TextInput.Number
          value={requestedAmount}
          onChange={handleRequestedAmountUpdate}
          min={0}
          step="any"
          required
          wide
        />
      </Field>
      <ButtonWrapper>
        <Button wide mode="strong" type="submit" disabled={submitButtonDisabled}>
          Submit request
        </Button>
      </ButtonWrapper>
      {depositErrorMessage && <ValidationError message={depositErrorMessage} />}
      <VSpace size={3} />
      <Info>
        {isMainnet && (
          <p>
            Remember, Mainnet organizations use <strong>real tokens</strong>.
          </p>
        )}
        <p>
          Configure your request above, and sign the transaction with your wallet after clicking “Submit Transfer”. It
          will then show up in your Token request app once processed.
        </p>
        {isTokenSelected && (
          <React.Fragment>
            <p
              css={`
                margin-top: ${1 * GU}px;
              `}
            >
              Tokens may require a pretransaction to approve the Token request app for your deposit.{' '}
              <Link href={TOKEN_ALLOWANCE_WEBSITE} target="_blank">
                Find out why.
              </Link>{' '}
            </p>
          </React.Fragment>
        )}
      </Info>
    </form>
  )
}

const ButtonWrapper = styled.div`
  padding-top: 10px;
`

const TokenBalance = styled.div`
  margin: 10px 0 20px;
`

const VSpace = styled.div`
  height: ${p => (p.size || 1) * 5}px;
`

const ValidationError = ({ message }) => {
  const theme = useTheme()
  return (
    <div>
      <VSpace size={2} />
      <div
        css={`
          display: flex;
          align-items: center;
        `}
      >
        <IconCross
          size="tiny"
          css={`
            color: ${theme.negative};
            margin-right: ${1 * GU}px;
          `}
        />
        <span
          css={`
            ${textStyle('body3')}
          `}
        >
          {message}
        </span>
      </div>
    </div>
  )
}

export default props => {
  const { api, connectedAccount, network } = useAragonApi()
  return network && api ? (
    <NewRequest api={api} connectedAccount={connectedAccount} network={network} {...props} />
  ) : null
}
