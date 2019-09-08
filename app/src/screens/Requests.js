import React from 'react'
import { Box, Text } from '@aragon/ui'
import RequestTable from '../components/RequestTable'

const Requests = React.memo(({ requests, token, onSubmit, onWithdraw }) => {
  return requests.length > 0 ? (
    <RequestTable requests={requests} token={token} onSubmit={onSubmit} onWithdraw={onWithdraw} />
  ) : (
    <Box style={{ textAlign: 'center' }}>
      <Text>No requests</Text>
    </Box>
  )
})
export default Requests
