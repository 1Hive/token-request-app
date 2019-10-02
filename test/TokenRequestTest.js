const { encodeCallScript } = require('@aragon/test-helpers/evmScript')
const getBalanceFn = require('@aragon/test-helpers/balance')
import DaoDeployment from './helpers/DaoDeployment'
import { deployedContract, assertRevert } from './helpers/helpers'
import { BN } from 'bn.js'

const ForwarderMock = artifacts.require('ForwarderMock')
const MiniMeToken = artifacts.require('MiniMeToken')
const MiniMeTokenFactory = artifacts.require('MiniMeTokenFactory')
const MockErc20 = artifacts.require('TokenMock')
const TokenManager = artifacts.require('TokenManager')
const TokenRequest = artifacts.require('TokenRequest')
const Vault = artifacts.require('Vault')

contract('TokenRequest', ([rootAccount, ...accounts]) => {
  let daoDeployment = new DaoDeployment()
  let requestableToken, tokenRequestBase, tokenRequest, tokenManager, tokenManagerBase, mockErc20, vaultBase, vault

  let FINALISE_TOKEN_REQUEST_ROLE, MINT_ROLE, SET_TOKEN_MANAGER_ROLE, SET_VAULT_ROLE, MODIFY_TOKENS_ROLE
  const ETH_ADDRESS = '0x0000000000000000000000000000000000000000'
  let MOCK_TOKEN_BALANCE, ROOT_TOKEN_AMOUNT, ROOT_ETHER_AMOUNT

  const getBalance = getBalanceFn(web3)

  before(async () => {
    await daoDeployment.deployBefore()

    tokenRequestBase = await TokenRequest.new()
    FINALISE_TOKEN_REQUEST_ROLE = await tokenRequestBase.FINALISE_TOKEN_REQUEST_ROLE()
    SET_TOKEN_MANAGER_ROLE = await tokenRequestBase.SET_TOKEN_MANAGER_ROLE()
    SET_VAULT_ROLE = await tokenRequestBase.SET_VAULT_ROLE()
    MODIFY_TOKENS_ROLE = await tokenRequestBase.MODIFY_TOKENS_ROLE()

    tokenManagerBase = await TokenManager.new()
    MINT_ROLE = await tokenManagerBase.MINT_ROLE()

    vaultBase = await Vault.new()
  })

  beforeEach(async () => {
    ROOT_ETHER_AMOUNT = 2000
    ROOT_TOKEN_AMOUNT = 100
    MOCK_TOKEN_BALANCE = 100000

    await daoDeployment.deployBeforeEach(rootAccount)
    const miniMeTokenFactory = await MiniMeTokenFactory.new()
    requestableToken = await MiniMeToken.new(
      miniMeTokenFactory.address,
      ETH_ADDRESS,
      0,
      'RequestableToken',
      18,
      'RQT',
      true
    )

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
    tokenManager = await TokenManager.at(deployedContract(newTokenManagerAppReceipt))
    await requestableToken.changeController(tokenManager.address)

    const newVaultAppReceipt = await daoDeployment.kernel.newAppInstance('0x7878', vaultBase.address, '0x', false, {
      from: rootAccount,
    })
    vault = await Vault.at(deployedContract(newVaultAppReceipt))

    await vault.initialize()
    await tokenManager.initialize(requestableToken.address, false, 0)

    mockErc20 = await MockErc20.new(rootAccount, MOCK_TOKEN_BALANCE)
  })

  describe('initialize(address _tokenManager, address _vault, address[] _acceptedDepositTokens)', async () => {
    it("reverts when passed non-contract address as token manager", async () => {
      await assertRevert(tokenRequest.initialize(rootAccount, vault.address, []),
        "TOKEN_REQUEST_ADDRESS_NOT_CONTRACT")
    })

    it("reverts when passed non-contract address as vault", async () => {
      await assertRevert(tokenRequest.initialize(tokenManager.address, rootAccount, []),
        "TOKEN_REQUEST_ADDRESS_NOT_CONTRACT")
    })

    it("reverts when passed non-contract address in accepted deposit tokens", async () => {
      await assertRevert(tokenRequest.initialize(tokenManager.address, vault.address, [ETH_ADDRESS, rootAccount]),
        "TOKEN_REQUEST_ADDRESS_NOT_CONTRACT")
    })
  })

  describe('initialize(address _tokenManager, address _vault, address[] _acceptedDepositTokens)', () => {
    let acceptedDepositTokens

    beforeEach(async () => {
      acceptedDepositTokens = [mockErc20.address, ETH_ADDRESS]
      await tokenRequest.initialize(tokenManager.address, vault.address, acceptedDepositTokens)
    })

    it('sets correct variables', async () => {
      const actualTokenManager = await tokenRequest.tokenManager()
      const actualVault = await tokenRequest.vault()

      assert.strictEqual(actualTokenManager, tokenManager.address)
      assert.strictEqual(actualVault, vault.address)
    })

    describe('setTokenManager(address _tokenManager)', () => {
      beforeEach(async () => {
        await daoDeployment.acl.createPermission(accounts[1], tokenRequest.address, SET_TOKEN_MANAGER_ROLE, rootAccount)
      })

      it('sets a token manager', async () => {
        const expectedTokenManagerAddress = tokenManager.address
        await tokenRequest.setTokenManager(expectedTokenManagerAddress, { from: accounts[1] })

        const actualTokenManager = await tokenRequest.tokenManager()
        assert.strictEqual(actualTokenManager, expectedTokenManagerAddress)
      })

      it('reverts when setting non-contract address', async () => {
        await assertRevert(tokenRequest.setTokenManager(rootAccount, { from: accounts[1] }),
          'TOKEN_REQUEST_ADDRESS_NOT_CONTRACT')
      })
    })

    describe('setVault(address _vault)', () => {
      beforeEach(async () => {
        await daoDeployment.acl.createPermission(accounts[1], tokenRequest.address, SET_VAULT_ROLE, rootAccount)
      })

      it('sets a vault', async () => {
        const expectedVaultAddress = vault.address
        await tokenRequest.setVault(expectedVaultAddress, { from: accounts[1] })

        const actualVault = await tokenRequest.vault()
        assert.strictEqual(actualVault, expectedVaultAddress)
      })

      it('reverts when setting non-contract address', async () => {
        await assertRevert(tokenRequest.setVault(rootAccount, { from: accounts[1] }),
          'TOKEN_REQUEST_ADDRESS_NOT_CONTRACT')
      })
    })

    describe('addToken(address _token)', async () => {
      beforeEach(async () => {
        await daoDeployment.acl.createPermission(accounts[1], tokenRequest.address, MODIFY_TOKENS_ROLE, rootAccount)
      })

      it('adds a token', async () => {
        const newToken = await MockErc20.new(rootAccount, MOCK_TOKEN_BALANCE)
        const expectedTokens = [...acceptedDepositTokens, newToken.address]

        await tokenRequest.addToken(newToken.address, { from: accounts[1] })

        const actualTokens = await tokenRequest.getAcceptedDepositTokens()
        assert.deepStrictEqual(actualTokens, expectedTokens)
      })

      it('cannot add more than max tokens', async () => {
        const maxTokens = await tokenRequest.MAX_ACCEPTED_DEPOSIT_TOKENS();
        for (let i = 0; i < maxTokens - 2; i++) {
          const token = await MockErc20.new(rootAccount, MOCK_TOKEN_BALANCE)
          await tokenRequest.addToken(token.address, { from: accounts[1] })
        }

        const overflowToken = await MockErc20.new(rootAccount, MOCK_TOKEN_BALANCE)
        await assertRevert(tokenRequest.addToken(overflowToken.address, { from: accounts[1] }),
          'TOKEN_REQUEST_TOO_MANY_ACCEPTED_TOKENS')
      })

      it('reverts when adding non-contract address', async () => {
        await assertRevert(tokenRequest.addToken(rootAccount, { from: accounts[1] }),
          'TOKEN_REQUEST_ADDRESS_NOT_CONTRACT')
      })

      it('reverts when adding already added token', async () => {
        await assertRevert(tokenRequest.addToken(ETH_ADDRESS, { from: accounts[1] }),
          'TOKEN_REQUEST_TOKEN_ALREADY_ACCEPTED')
      })
    })

    describe('removeToken(address _token)', async () => {
      beforeEach(async () => {
        await daoDeployment.acl.createPermission(accounts[1], tokenRequest.address, MODIFY_TOKENS_ROLE, rootAccount)
      })

      it('removes a token', async () => {
        const expectedTokens = [ETH_ADDRESS]

        await tokenRequest.removeToken(mockErc20.address, { from: accounts[1] })

        const actualTokens = await tokenRequest.getAcceptedDepositTokens()
        assert.deepStrictEqual(actualTokens, expectedTokens)
      })

      it('reverts when removing unaccepted token', async () => {
        await assertRevert(tokenRequest.removeToken(rootAccount, { from: accounts[1] }),
          'TOKEN_REQUEST_TOKEN_NOT_ACCEPTED')
      })

    })

    describe('createTokenRequest(address _depositToken, uint256 _depositAmount, uint256 _requestAmount)', () => {
      it('creates a new token request in exchange for Ether', async () => {
        const expectedEtherBalance = 2000
        const expectedNextTokenRequestId = 1

        await tokenRequest.createTokenRequest(ETH_ADDRESS, ROOT_ETHER_AMOUNT, 1, {
          value: ROOT_ETHER_AMOUNT,
        })

        const actualEtherBalance = (await getBalance(tokenRequest.address)).valueOf()
        const actualNextTokenRequestId = await tokenRequest.nextTokenRequestId()

        assert.equal(actualEtherBalance, expectedEtherBalance)
        assert.equal(actualNextTokenRequestId, expectedNextTokenRequestId)
      })

      it('should not create a new request for 0 Ether', async () => {
        await assertRevert(
          tokenRequest.createTokenRequest(ETH_ADDRESS, 0, 1, {
            value: 0,
          }),
          'TOKEN_REQUEST_NO_AMOUNT'
        )
      })

      it('should not create a new request with different _depositAmount and value', async () => {
        await assertRevert(
          tokenRequest.createTokenRequest(ETH_ADDRESS, 100, 1, {
            value: 50,
          }),
          'TOKEN_REQUEST_ETH_VALUE_MISMATCH'
        )
      })

      it('creates a new token request in exchange for TokenMock', async () => {
        const expectedTokenRequestBalance = ROOT_TOKEN_AMOUNT
        const expectedNextTokenRequestId = 1

        await mockErc20.approve(tokenRequest.address, ROOT_TOKEN_AMOUNT, {
          from: rootAccount,
        })

        await tokenRequest.createTokenRequest(mockErc20.address, ROOT_TOKEN_AMOUNT, 300)

        const actualTokenRequestBalance = await mockErc20.balanceOf(tokenRequest.address)

        const actualNextTokenRequestId = await tokenRequest.nextTokenRequestId()

        assert.equal(actualTokenRequestBalance, expectedTokenRequestBalance)
        assert.equal(actualNextTokenRequestId, expectedNextTokenRequestId)
      })

      it('should not create a new request without token approve', async () => {
        await assertRevert(
          tokenRequest.createTokenRequest(mockErc20.address, 100, 1),
          'TOKEN_REQUEST_TOKEN_TRANSFER_REVERTED'
        )
      })
    })

    describe('finaliseTokenRequest(uint256 _tokenRequestId)', () => {
      let script, forwarderMock, forwarderMockBase
      beforeEach(async () => {
        forwarderMockBase = await ForwarderMock.new()
        const newForwarderMockReceipt = await daoDeployment.kernel.newAppInstance(
          '0x9876',
          forwarderMockBase.address,
          '0x',
          false,
          { from: rootAccount }
        )
        forwarderMock = await ForwarderMock.at(deployedContract(newForwarderMockReceipt))

        await forwarderMock.initialize()

        await daoDeployment.acl.createPermission(tokenRequest.address, tokenManager.address, MINT_ROLE, rootAccount)
        await daoDeployment.acl.createPermission(
          forwarderMock.address,
          tokenRequest.address,
          FINALISE_TOKEN_REQUEST_ROLE,
          rootAccount
        )

        const action = {
          to: tokenRequest.address,
          calldata: tokenRequest.contract.methods.finaliseTokenRequest(0).encodeABI(),
        }
        script = encodeCallScript([action])
      })

      it('finalise token request (ERC20)', async () => {
        const expectedUserMiniMeBalance = 300
        const expectedVaultBalance = ROOT_TOKEN_AMOUNT

        await mockErc20.approve(tokenRequest.address, ROOT_TOKEN_AMOUNT, {
          from: rootAccount,
        })
        await tokenRequest.createTokenRequest(mockErc20.address, expectedVaultBalance, expectedUserMiniMeBalance, {
          from: rootAccount,
        })

        await forwarderMock.forward(script, { from: rootAccount })

        const actualUserMiniMeBalance = await tokenManager.spendableBalanceOf(rootAccount)
        const actualVaultBalance = await vault.balance(mockErc20.address)

        assert.equal(actualUserMiniMeBalance, expectedUserMiniMeBalance)
        assert.equal(actualVaultBalance, expectedVaultBalance)
      })

      it('finalise token request (ETH)', async () => {
        const expectedUserMiniMeBalance = 300
        const expectedVaultBalance = 200

        await tokenRequest.createTokenRequest(ETH_ADDRESS, expectedVaultBalance, expectedUserMiniMeBalance, {
          from: rootAccount,
          value: expectedVaultBalance,
        })

        await forwarderMock.forward(script, { from: rootAccount })

        const actualUserMiniMeBalance = await tokenManager.spendableBalanceOf(rootAccount)
        const actualVaultBalance = await vault.balance(ETH_ADDRESS)

        assert.equal(actualUserMiniMeBalance, expectedUserMiniMeBalance)
        assert.equal(actualVaultBalance, expectedVaultBalance)
      })
      it('it should not finalise the same request twice', async () => {
        const expectedUserMiniMeBalance = 300
        const expectedVaultBalance = 200

        await tokenRequest.createTokenRequest(ETH_ADDRESS, expectedVaultBalance, expectedUserMiniMeBalance, {
          from: rootAccount,
          value: expectedVaultBalance,
        })

        await tokenRequest.createTokenRequest(ETH_ADDRESS, expectedVaultBalance, expectedUserMiniMeBalance, {
          from: rootAccount,
          value: expectedVaultBalance,
        })

        await forwarderMock.forward(script, { from: rootAccount })

        await assertRevert(forwarderMock.forward(script, { from: rootAccount }), 'TOKEN_REQUEST_NO_DEPOSIT')
      })
    })

    describe('refundTokenRequest(uint256 _tokenRequestId) ', () => {
      const refundEthAccount = accounts[2]
      it('refund token (ERC20)', async () => {
        const refundAmount = 100
        const expectedUserBalance = await mockErc20.balanceOf(rootAccount)

        await mockErc20.approve(tokenRequest.address, refundAmount, {
          from: rootAccount,
        })
        await tokenRequest.createTokenRequest(mockErc20.address, refundAmount, 1, {
          from: rootAccount,
        })

        await tokenRequest.refundTokenRequest(0, { from: rootAccount })

        const actualUserBalance = await mockErc20.balanceOf(rootAccount)
        assert.equal(Number(actualUserBalance), Number(expectedUserBalance))
      })

      it('refund ETH', async () => {
        const weiValue = 3000000000000000
        const expectedETHBalance = await web3.eth.getBalance(refundEthAccount)

        const request = await tokenRequest.createTokenRequest(ETH_ADDRESS, weiValue, 1, {
          value: weiValue,
          from: refundEthAccount,
        })

        const requestTransaction = await web3.eth.getTransaction(request.tx)
        const requestGasUsed = new BN(request.receipt.gasUsed)
        const requestTransactionGasPrice = new BN(requestTransaction.gasPrice)
        const requestPrice = new BN(requestGasUsed.mul(requestTransactionGasPrice))

        const refund = await tokenRequest.refundTokenRequest(0, { from: refundEthAccount })
        const refundTransaction = await web3.eth.getTransaction(refund.tx)

        const refundGasUsed = new BN(refund.receipt.gasUsed)
        const refundGasPrice = new BN(refundTransaction.gasPrice)
        const refundPrice = new BN(refundGasUsed.mul(refundGasPrice))

        let actualBalance = new BN(await web3.eth.getBalance(refundEthAccount))
        const actualETHBalance = actualBalance.add(refundPrice).add(requestPrice)

        assert.equal(actualETHBalance, expectedETHBalance)
      })

      it('should not refund a a token request from other user', async () => {
        await mockErc20.approve(tokenRequest.address, ROOT_TOKEN_AMOUNT, {
          from: rootAccount,
        })
        await tokenRequest.createTokenRequest(mockErc20.address, ROOT_TOKEN_AMOUNT, 1, {
          from: rootAccount,
        })

        await assertRevert(tokenRequest.refundTokenRequest(0, { from: accounts[1] }), 'TOKEN_REQUEST_NOT_OWNER')
      })

      it('should not refund the same request twice', async () => {
        const weiValue = 1000000000000000
        await tokenRequest.createTokenRequest(ETH_ADDRESS, weiValue, 1, {
          value: weiValue,
          from: refundEthAccount,
        })

        await tokenRequest.refundTokenRequest(0, { from: refundEthAccount })

        await assertRevert(tokenRequest.refundTokenRequest(0, { from: refundEthAccount }), 'TOKEN_REQUEST_NOT_OWNER')
      })
    })
  })
})
