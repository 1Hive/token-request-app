import Aragon from '@aragon/client'

const app = new Aragon()

const initialState = {
  dummyValue: 0
}

app.store((state, event) => {
  if (state === null) state = initialState

  switch (event.event) {
    case 'DummyEvent':
      return { dummyValue: 1 }
    default:
      return state
  }
})
