import React, { useCallback, useMemo } from 'react'
import styled from 'styled-components'
import { DataView, Text, ContextMenu, ContextMenuItem, IconCoin, theme, IconVote } from '@aragon/ui'
import { useConnectedAccount } from '@aragon/api-react'
import { formatTokenAmountSymbol } from '../lib/token-utils'
import { format, compareDesc } from 'date-fns'
import { requestStatus } from '../lib/constants'
import LocalIdentityBadge from './LocalIdentityBadge/LocalIdentityBadge'
import { addressesEqual } from '../lib/web3-utils'

const PAGINATION = 10

function RequestTable({ requests, token, onSubmit, onWithdraw, ownRequests }) {
  const connectedAccount = useConnectedAccount()
  const handleSubmit = useCallback(
    requestId => {
      onSubmit(requestId)
    },
    [onSubmit]
  )

  const handleWithdraw = useCallback(
    requestId => {
      onWithdraw(requestId)
    },
    [onWithdraw]
  )

  const getEntries = useMemo(() => {
    console.log('ownRequests ', ownRequests)
    return !ownRequests
      ? requests
          .sort(({ date: dateLeft }, { date: dateRight }) =>
            // Sort by date descending
            compareDesc(dateLeft, dateRight)
          )
          .map(r => [
            r.requestId,
            r.date,
            r.requesterAddress,
            r.depositAmount,
            r.depositSymbol,
            r.depositToken,
            r.depositName,
            r.depositDecimals,
            r.requestAmount,
            r.status,
            token.symbol,
            token.decimals,
          ])
      : requests
          .sort(({ date: dateLeft }, { date: dateRight }) =>
            // Sort by date descending
            compareDesc(dateLeft, dateRight)
          )
          .map(r => [
            r.requestId,
            r.date,
            r.depositAmount,
            r.depositSymbol,
            r.depositToken,
            r.depositName,
            r.depositDecimals,
            r.requestAmount,
            r.status,
            token.symbol,
            token.decimals,
          ])
  }, [requests, compareDesc, ownRequests])

  const getRow = (
    requestId,
    date,
    requesterAddress,
    depositAmount,
    depositSymbol,
    depositTokenAddress,
    depositName,
    depositDecimals,
    requestedAmount,
    status,
    requestedSymbol,
    requestedDecimals
  ) => {
    const timeColumn = [<time key={requestId}>{format(date, 'dd/MM/yy')}</time>]
    const commonColumns = [
      <Text>{`${formatTokenAmountSymbol(depositSymbol, depositAmount, false, depositDecimals)} `}</Text>,
      <Text>{`${formatTokenAmountSymbol(requestedSymbol, requestedAmount, false, requestedDecimals)} `}</Text>,
      <Status status={status}>{`${status}`}</Status>,
      <ContextMenu disabled={status != requestStatus.PENDING}>
        {status === requestStatus.PENDING && (
          <ContextMenuItem onClick={() => handleSubmit(requestId)}>
            <IconWrapper>
              <IconVote />
            </IconWrapper>
            <div css="margin-left: 15px">Submit</div>
          </ContextMenuItem>
        )}
        {status === requestStatus.PENDING && (
          <ContextMenuItem onClick={() => handleWithdraw(requestId)}>
            <IconWrapper>
              <IconCoin />
            </IconWrapper>
            <div css="margin-left: 15px">Withdraw</div>
          </ContextMenuItem>
        )}
      </ContextMenu>,
    ]
    return !ownRequests
      ? [
          timeColumn,
          <div
            css={`
              display: flex;
              align-items: flex-start;
            `}
          >
            <LocalIdentityBadge
              connectedAccount={addressesEqual(requesterAddress, connectedAccount)}
              entity={requesterAddress}
            />
          </div>,
          ...commonColumns,
        ]
      : [timeColumn, ...commonColumns]
  }
  return (
    <>
      {requests && requests.length > 0 && (
        <DataView
          fields={
            ownRequests
              ? ['Request Date', 'Deposited', 'Requested', 'Status', 'Actions']
              : ['Request Date', 'Requester', 'Deposited', 'Requested', 'Status', 'Actions']
          }
          entries={getEntries}
          renderEntry={
            !ownRequests
              ? ([
                  requestId,
                  date,
                  requesterAddress,
                  depositAmount,
                  depositSymbol,
                  depositTokenAddress,
                  depositName,
                  depositDecimals,
                  requestedAmount,
                  status,
                  requestedSymbol,
                  requestedDecimals,
                ]) =>
                  getRow(
                    requestId,
                    date,
                    requesterAddress,
                    depositAmount,
                    depositSymbol,
                    depositTokenAddress,
                    depositName,
                    depositDecimals,
                    requestedAmount,
                    status,
                    requestedSymbol,
                    requestedDecimals
                  )
              : ([
                  requestId,
                  date,
                  depositAmount,
                  depositSymbol,
                  depositTokenAddress,
                  depositName,
                  depositDecimals,
                  requestedAmount,
                  status,
                  requestedSymbol,
                  requestedDecimals,
                ]) =>
                  getRow(
                    requestId,
                    date,
                    '',
                    depositAmount,
                    depositSymbol,
                    depositTokenAddress,
                    depositName,
                    depositDecimals,
                    requestedAmount,
                    status,
                    requestedSymbol,
                    requestedDecimals
                  )
          }
          mode="table"
          entriesPerPage={PAGINATION}
        />
      )}
    </>
  )
}
const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: ${theme.textSecondary};
`
const Status = styled(Text)`
  font-weight: 600;
  color: ${({ status }) => {
    switch (status) {
      case requestStatus.PENDING:
        return theme.infoPermissionsIcon
      case requestStatus.REJECTED:
        return theme.negative
      case requestStatus.APPROVED:
        return theme.positive
      case requestStatus.EXPIRED:
        return theme.negative
      default:
        return theme.positive
    }
  }};
`

export default RequestTable
