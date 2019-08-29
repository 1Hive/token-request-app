import React from 'react'
import styled from 'styled-components'
import { Button, ButtonIcon, Viewport } from '@aragon/ui'

function MainButton({ label, icon, onClick }) {
  return (
    <Viewport>
      {({ below }) =>
        below('medium') ? (
          <Icon
            onClick={onClick}
            label={label}
            css={`
              width: auto;
              height: 100%;
              padding: 0 20px 0 10px;
              margin-left: 8px;
            `}
          >
            {icon}
          </Icon>
        ) : (
          <Button mode="strong" onClick={onClick}>
            {label}
          </Button>
        )
      }
    </Viewport>
  )
}

const Icon = styled(ButtonIcon)`
  padding: 0 !important;
`

export default MainButton
