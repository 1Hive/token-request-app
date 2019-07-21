const TokenRequest = artifacts.require('TokenRequest')
const TokenManager = artifacts.require('TokenManager')

import DaoDeployment from './helpers/DaoDeployment'
import { deployedContract } from './helpers/helpers'

// TODO: Create a forwarder, eg a Voting app, give it FINALISE_TOKEN_REQUEST_ROLE and test whole user flow.
//       Also don't forget to set the MINT_ROLE on the tokenRequest app before trying to call finaliseTokenRequest()

contract('TokenRequest', ([rootAccount, vault, ...accounts]) => {
    let daoDeployment = new DaoDeployment()
    let tokenRequestBase, tokenRequest, tokenManagerBase, tokenManager
    let FINALISE_TOKEN_REQUEST_ROLE, MINT_ROLE

    before(async () => {
        await daoDeployment.deployBefore()

        tokenRequestBase = await TokenRequest.new()
        FINALISE_TOKEN_REQUEST_ROLE = await tokenRequestBase.FINALISE_TOKEN_REQUEST_ROLE()

        tokenManagerBase = await TokenManager.new()
        MINT_ROLE = await tokenManagerBase.MINT_ROLE()
    })

    beforeEach(async () => {
        await daoDeployment.deployBeforeEach(rootAccount)
        const newTokenRequestAppReceipt = await daoDeployment.kernel
            .newAppInstance('0x1234', tokenRequestBase.address, '0x', false, {from: rootAccount})
        tokenRequest = await TokenRequest.at(deployedContract(newTokenRequestAppReceipt))

        const newTokenManagerAppReceipt = await daoDeployment.kernel
            .newAppInstance('0x5678', tokenManagerBase.address, '0x', false, {from: rootAccount})
        tokenManager = await TokenManager.at(deployedContract(newTokenManagerAppReceipt))
    })

    describe('initialize(address _tokenManager, address _vault)', () => {

        beforeEach(async () => {
            await tokenRequest.initialize(tokenManager.address, vault)
        })

        it('sets correct variables', async () => {
            const actualTokenManager = await tokenRequest.tokenManager()
            const actualVault = await tokenRequest.vault()

            assert.strictEqual(actualTokenManager, tokenManager.address)
            assert.strictEqual(actualVault, vault)
        })
    })

})