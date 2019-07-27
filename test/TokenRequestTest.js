const { encodeCallScript } = require('@aragon/test-helpers/evmScript')
const getBalanceFn = require('@aragon/test-helpers/balance')

import DaoDeployment from './helpers/DaoDeployment'
import { deployedContract } from './helpers/helpers'
const ForwarderMock = artifacts.require('ForwarderMock')
const MiniMeToken = artifacts.require('MiniMeToken')
const MiniMeTokenFactory = artifacts.require('MiniMeTokenFactory')
const MockErc20 = artifacts.require('TokenMock')
const TokenManager = artifacts.require('TokenManager')
const TokenRequest = artifacts.require('TokenRequest')
const Vault = artifacts.require('Vault')

// TODO: Create a forwarder, eg a Voting app, give it FINALISE_TOKEN_REQUEST_ROLE and test whole user flow.
//       Also don't forget to set the MINT_ROLE on the tokenRequest app before trying to call finaliseTokenRequest()

contract('TokenRequest', ([rootAccount, ...accounts]) => {
  let daoDeployment = new DaoDeployment()
  let requestableToken,
    tokenRequestBase,
    tokenRequest,
    tokenManager,
    tokenManager2,
    tokenManagerBase,
    mockErc20,
    vaultBase,
    vault

  let FINALISE_TOKEN_REQUEST_ROLE, MINT_ROLE, SET_TOKEN_MANAGER_ROLE, SET_VAULT_ROLE
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
  const ANY_ADDRESS = '0xffffffffffffffffffffffffffffffffffffffff'
  let MOCK_TOKEN_BALANCE, ROOT_TOKEN_AMOUNT

  const getBalance = getBalanceFn(web3)

  before(async () => {
    await daoDeployment.deployBefore()

    tokenRequestBase = await TokenRequest.new()
    FINALISE_TOKEN_REQUEST_ROLE = await tokenRequestBase.FINALISE_TOKEN_REQUEST_ROLE()
    SET_TOKEN_MANAGER_ROLE = await tokenRequestBase.SET_TOKEN_MANAGER_ROLE()
    SET_VAULT_ROLE = await tokenRequestBase.SET_VAULT_ROLE()

    tokenManagerBase = await TokenManager.new()
    MINT_ROLE = await tokenManagerBase.MINT_ROLE()

    vaultBase = await Vault.new()
  })

  beforeEach(async () => {
    ROOT_TOKEN_AMOUNT = 100
    MOCK_TOKEN_BALANCE = 100

    await daoDeployment.deployBeforeEach(rootAccount)

    const newTokenRequestAppReceipt = await daoDeployment.kernel.newAppInstance(
      '0x1234',
      tokenRequestBase.address,
      '0x',
      false,
      { from: rootAccount }
    )
    tokenRequest = await TokenRequest.at(deployedContract(newTokenRequestAppReceipt))

    const newTokenManagerAppReceipt = await daoDeployment.kernel.newAppInstance(
      '0x5678',
      tokenManagerBase.address,
      '0x',
      false,
      { from: rootAccount }
    )

    const newTokenManagerAppReceipt2 = await daoDeployment.kernel.newAppInstance(
      '0x5555',
      tokenManagerBase.address,
      '0x',
      false,
      { from: rootAccount }
    )
    tokenManager2 = await TokenManager.at(deployedContract(newTokenManagerAppReceipt2))
    tokenManager = await TokenManager.at(deployedContract(newTokenManagerAppReceipt))

    const newVaultAppReceipt = await daoDeployment.kernel.newAppInstance('0x7878', vaultBase.address, '0x', false, {
      from: rootAccount,
    })
    vault = await Vault.at(deployedContract(newVaultAppReceipt))
    await vault.initialize()

    mockErc20 = await MockErc20.new(rootAccount, MOCK_TOKEN_BALANCE)
    await mockErc20.transfer(rootAccount, ROOT_TOKEN_AMOUNT)
  })

  describe('initialize(address _tokenManager, address _vault)', () => {
    beforeEach(async () => {
      await tokenRequest.initialize(tokenManager.address, vault.address)
    })

    it('sets correct variables', async () => {
      const actualTokenManager = await tokenRequest.tokenManager()
      const actualVault = await tokenRequest.vault()

      assert.strictEqual(actualTokenManager, tokenManager.address)
      assert.strictEqual(actualVault, vault.address)
    })
  })

  describe('function setTokenManager(address _tokenManager)', () => {
    beforeEach(async () => {
      await tokenRequest.initialize(tokenManager.address, vault.address)
    })
    it('sets a token manager', async () => {
      await daoDeployment.acl.createPermission(accounts[1], tokenRequest.address, SET_TOKEN_MANAGER_ROLE, rootAccount)
      await tokenRequest.setTokenManager(tokenManager2.address, { from: accounts[1] })
      const actualTokenManager = await tokenRequest.tokenManager()
      assert.strictEqual(actualTokenManager, tokenManager2.address)
    })
  })

  describe('createTokenRequest(address _depositToken, uint256 _depositAmount, uint256 _requestAmount)', () => {
    it('creates a new token request on exchange for Ether', async () => {
      const expectedTRBalance = 2000
      const expectedNextTokenRequestId = 1

      await tokenRequest.createTokenRequest(ZERO_ADDRESS, 2000, 1, {
        value: 2000,
      })

      const actualTRBalance = (await getBalance(tokenRequest.address)).valueOf()
      const actualNextTokenRequestId = await tokenRequest.nextTokenRequestId()

      assert.equal(actualTRBalance, expectedTRBalance)
      assert.equal(actualNextTokenRequestId, expectedNextTokenRequestId)
    })

    it('creates a new token request on exchange for TokenMock', async () => {
      const expectedTRBalance = ROOT_TOKEN_AMOUNT
      const expectedNextTokenRequestId = 1

      await mockErc20.approve(tokenRequest.address, ROOT_TOKEN_AMOUNT, {
        from: rootAccount,
      })

      await tokenRequest.createTokenRequest(mockErc20.address, ROOT_TOKEN_AMOUNT, 300)

      const actualTRBalance = await mockErc20.balanceOf(tokenRequest.address)

      const actualNextTokenRequestId = await tokenRequest.nextTokenRequestId()

      assert.equal(actualTRBalance, expectedTRBalance)
      assert.equal(actualNextTokenRequestId, expectedNextTokenRequestId)
    })
  })

  describe('finaliseTokenRequest(uint256 _tokenRequestId)', () => {
    let script, forwarderMock, forwarderMockBase
    beforeEach('assign roles and create token request', async () => {
      forwarderMockBase = await ForwarderMock.new()
      const newForwarderMockReceipt = await daoDeployment.kernel.newAppInstance(
        '0x9876',
        forwarderMockBase.address,
        '0x',
        false,
        { from: rootAccount }
      )
      forwarderMock = await ForwarderMock.at(deployedContract(newForwarderMockReceipt))

      const miniMeTokenFactory = await MiniMeTokenFactory.new()
      requestableToken = await MiniMeToken.new(
        miniMeTokenFactory.address,
        ZERO_ADDRESS,
        0,
        'RequestableToken',
        18,
        'RQT',
        true
      )
      await requestableToken.changeController(tokenManager.address)

      await tokenManager.initialize(requestableToken.address, false, 0)
      await tokenRequest.initialize(tokenManager.address, vault.address)
      await forwarderMock.initialize()

      await daoDeployment.acl.createPermission(tokenRequest.address, tokenManager.address, MINT_ROLE, rootAccount)
      await daoDeployment.acl.createPermission(
        forwarderMock.address,
        tokenRequest.address,
        FINALISE_TOKEN_REQUEST_ROLE,
        rootAccount
      )
    })

    it('finalise token request (ERC20)', async () => {
      const expectedUserMiniMeBalance = 300
      const expectedVaultBalance = 100

      await mockErc20.approve(tokenRequest.address, ROOT_TOKEN_AMOUNT, {
        from: rootAccount,
      })
      await tokenRequest.createTokenRequest(mockErc20.address, expectedVaultBalance, expectedUserMiniMeBalance, {
        from: rootAccount,
      })

      const action = {
        to: tokenRequest.address,
        calldata: tokenRequest.contract.methods.finaliseTokenRequest(0).encodeABI(),
      }
      script = encodeCallScript([action])
      await forwarderMock.forward(script, { from: rootAccount })

      const actualUserMiniMeBalance = await tokenManager.spendableBalanceOf(rootAccount)
      const actualVaultBalance = await vault.balance(mockErc20.address)

      assert.equal(actualUserMiniMeBalance, expectedUserMiniMeBalance)
      assert.equal(actualVaultBalance, expectedVaultBalance)
    })

    it('finalise token request (ETH)', async () => {
      const expectedUserMiniMeBalance = 300
      const expectedVaultBalance = 200

      await tokenRequest.createTokenRequest(ZERO_ADDRESS, expectedVaultBalance, expectedUserMiniMeBalance, {
        from: rootAccount,
        value: expectedVaultBalance,
      })

      const nextid = await tokenRequest.nextTokenRequestId()
      console.log('next ', nextid)

      const action = {
        to: tokenRequest.address,
        calldata: tokenRequest.contract.methods.finaliseTokenRequest(0).encodeABI(),
      }
      script = encodeCallScript([action])
      await forwarderMock.forward(script, { from: rootAccount })

      const actualUserMiniMeBalance = await tokenManager.spendableBalanceOf(rootAccount)
      const actualVaultBalance = await vault.balance(ZERO_ADDRESS)

      assert.equal(actualUserMiniMeBalance, expectedUserMiniMeBalance)
      assert.equal(actualVaultBalance, expectedVaultBalance)
    })
  })
})
