const TokenRequest = artifacts.require("TokenRequest");
const TokenManager = artifacts.require("TokenManager");
const VotingApp = artifacts.require("Voting");
const MockErc20 = artifacts.require("TokenMock");

import DaoDeployment from "./helpers/DaoDeployment";
import { deployedContract } from "./helpers/helpers";

const getBalanceFn = require("@aragon/test-helpers/balance");

// TODO: Create a forwarder, eg a Voting app, give it FINALISE_TOKEN_REQUEST_ROLE and test whole user flow.
//       Also don't forget to set the MINT_ROLE on the tokenRequest app before trying to call finaliseTokenRequest()

contract("TokenRequest", ([rootAccount, vault, ...accounts]) => {
  let daoDeployment = new DaoDeployment();
  let tokenRequestBase,
    tokenRequest,
    tokenManagerBase,
    tokenManager,
    votingBase,
    mockErc20;
  let FINALISE_TOKEN_REQUEST_ROLE, MINT_ROLE;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const MOCK_TOKEN_BALANCE = 1000;

  const getBalance = getBalanceFn(web3);

  before(async () => {
    await daoDeployment.deployBefore();

    tokenRequestBase = await TokenRequest.new();
    FINALISE_TOKEN_REQUEST_ROLE = await tokenRequestBase.FINALISE_TOKEN_REQUEST_ROLE();

    tokenManagerBase = await TokenManager.new();
    MINT_ROLE = await tokenManagerBase.MINT_ROLE();

    votingBase = await VotingApp.new();
  });

  beforeEach(async () => {
    const ROOT_TOKEN_AMOUNT = 100;

    await daoDeployment.deployBeforeEach(rootAccount);
    const newTokenRequestAppReceipt = await daoDeployment.kernel.newAppInstance(
      "0x1234",
      tokenRequestBase.address,
      "0x",
      false,
      { from: rootAccount }
    );
    tokenRequest = await TokenRequest.at(
      deployedContract(newTokenRequestAppReceipt)
    );

    const newTokenManagerAppReceipt = await daoDeployment.kernel.newAppInstance(
      "0x5678",
      tokenManagerBase.address,
      "0x",
      false,
      { from: rootAccount }
    );
    tokenManager = await TokenManager.at(
      deployedContract(newTokenManagerAppReceipt)
    );

    mockErc20 = await MockErc20.new(rootAccount, MOCK_TOKEN_BALANCE);
    await mockErc20.transfer(rootAccount, ROOT_TOKEN_AMOUNT);
  });

  describe("initialize(address _tokenManager, address _vault)", () => {
    beforeEach(async () => {
      await tokenRequest.initialize(tokenManager.address, vault);
    });

    it("sets correct variables", async () => {
      const actualTokenManager = await tokenRequest.tokenManager();
      const actualVault = await tokenRequest.vault();

      assert.strictEqual(actualTokenManager, tokenManager.address);
      assert.strictEqual(actualVault, vault);
    });
  });

  describe("createTokenRequest(address _depositToken, uint256 _depositAmount, uint256 _requestAmount)", () => {
    it("creates a new token request on exchange for Ether", async () => {
      const expectedTRBalance = 2000;
      const expectedNextTokenRequestId = 1;
      const expectedTokenRequestIdInPosition = 1;

      await tokenRequest.createTokenRequest(ZERO_ADDRESS, 2000, 1, {
        value: 2000
      });

      const actualTRBalance = (await getBalance(
        tokenRequest.address
      )).valueOf();
      const actualNextTokenRequestId = await tokenRequest.nextTokenRequestId();

      assert.equal(actualTRBalance, expectedTRBalance);
      assert.equal(actualNextTokenRequestId, expectedNextTokenRequestId);
    });
  });
});
