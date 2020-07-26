let tokens, vault, testToken, accounts

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

module.exports = {
  postDao: async function({ _experimentalAppInstaller, log }, bre) {
    const bigExp = (x, y) => bre.web3.utils.toBN(x).mul(bre.web3.utils.toBN(10).pow(web3.utils.toBN(y)))
    const pct16 = x => bigExp(x, 16)

    // Retrieve accounts.
    accounts = await bre.web3.eth.getAccounts()

    // Deploy a minime token an generate tokens to root account
    testToken = await _deployMinimeToken(bre, 'Test token', 18, 'TST')
    await testToken.generateTokens(accounts[1], pct16(30000))
    log(`> Tests token deployed: ${testToken.address}`)

    vault = await _experimentalAppInstaller('vault')
    log(`> Vault app installed: ${vault.address}`)

    // Deploy a minime token an generate tokens to root account
    const minime = await _deployMinimeToken(bre, 'Requestable token', 18, 'REQ')
    await minime.generateTokens(accounts[1], pct16(1000))
    log(`> Minime token deployed: ${minime.address}`)

    tokens = await _experimentalAppInstaller('token-manager', {
      skipInitialize: true,
    })

    await minime.changeController(tokens.address)
    log(`> Change minime controller to tokens app`)
    await tokens.initialize([minime.address, true, 0])
    log(`> Tokens app installed: ${tokens.address}`)

    const voting = await _experimentalAppInstaller('voting', {
      initializeArgs: [
        tokens.address,
        pct16(50), // support 50%
        pct16(20), // quorum 20%
        86400, // 1 days
      ],
    })
    log(`> Voting app installed: ${voting.address}`)

    await tokens.createPermission('MINT_ROLE', voting.address)
    await voting.createPermission('CREATE_VOTES_ROLE', tokens.address)
    await vault.createPermission('TRANSFER_ROLE', voting.address)
  },
  getInitParams: async function({}, bre) {
    const tokenList = [ZERO_ADDRESS, testToken.address]

    return [tokens.address, vault.address, tokenList]
  },
  postInit: async function({ proxy, _experimentalAppInstaller, log }, bre) {},
}

async function _deployMinimeToken(bre, name, decimals, symbol) {
  const MiniMeTokenFactory = await bre.artifacts.require('MiniMeTokenFactory')
  const MiniMeToken = await bre.artifacts.require('MiniMeToken')
  const factory = await MiniMeTokenFactory.new()
  const token = await MiniMeToken.new(factory.address, ZERO_ADDRESS, 0, name, decimals, symbol, true)
  return token
}
