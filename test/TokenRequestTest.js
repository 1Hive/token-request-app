const { encodeCallScript } = require("@aragon/test-helpers/evmScript");

const TokenRequest = artifacts.require("TokenRequest");
const TokenManager = artifacts.require("TokenManager");
const ForwarderMock = artifacts.require("ForwarderMock");
const MockErc20 = artifacts.require("TokenMock");
const MiniMeTokenFactory = artifacts.require("MiniMeTokenFactory");
const MiniMeToken = artifacts.require("MiniMeToken");

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
    mockErc20,
    requestableToken;

  let FINALISE_TOKEN_REQUEST_ROLE, MINT_ROLE;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  let MOCK_TOKEN_BALANCE, ROOT_TOKEN_AMOUNT;

  const getBalance = getBalanceFn(web3);

  before(async () => {
    await daoDeployment.deployBefore();

    tokenRequestBase = await TokenRequest.new();
    FINALISE_TOKEN_REQUEST_ROLE = await tokenRequestBase.FINALISE_TOKEN_REQUEST_ROLE();

    tokenManagerBase = await TokenManager.new();
    MINT_ROLE = await tokenManagerBase.MINT_ROLE();
  });

  beforeEach(async () => {
    ROOT_TOKEN_AMOUNT = 100;
    MOCK_TOKEN_BALANCE = 100;

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

    it("creates a new token request on exchange for TokenMock", async () => {
      const expectedTRBalance = ROOT_TOKEN_AMOUNT;
      const expectedNextTokenRequestId = 1;

      await mockErc20.approve(tokenRequest.address, ROOT_TOKEN_AMOUNT, {
        from: rootAccount
      });

      await tokenRequest.createTokenRequest(
        mockErc20.address,
        ROOT_TOKEN_AMOUNT,
        300
      );

      const actualTRBalance = await mockErc20.balanceOf(tokenRequest.address);

      const actualNextTokenRequestId = await tokenRequest.nextTokenRequestId();

      assert.equal(actualTRBalance, expectedTRBalance);
      assert.equal(actualNextTokenRequestId, expectedNextTokenRequestId);
    });
  });

  describe("finaliseTokenRequest(uint256 _tokenRequestId)", () => {
    let script, forwarderMock;
    beforeEach("assign roles and create token request", async () => {
      forwarderMock = await ForwarderMock.new();

      await forwarderMock.initialize();

      await daoDeployment.acl.createPermission(
        rootAccount,
        forwarderMock.address,
        FINALISE_TOKEN_REQUEST_ROLE,
        rootAccount
      );
      await daoDeployment.acl.createPermission(
        rootAccount,
        tokenRequest.address,
        MINT_ROLE,
        rootAccount
      );

      const miniMeTokenFactory = await MiniMeTokenFactory.new();
      requestableToken = await MiniMeToken.new(
        miniMeTokenFactory.address,
        ZERO_ADDRESS,
        0,
        "RequestableToken",
        18,
        "RQT",
        true
      );

      await requestableToken.changeController(tokenManager.address);
      await tokenManager.initialize(requestableToken.address, false, 0);

      await mockErc20.approve(tokenRequest.address, ROOT_TOKEN_AMOUNT, {
        from: rootAccount
      });

      await tokenRequest.createTokenRequest(
        mockErc20.address,
        ROOT_TOKEN_AMOUNT,
        300
      );

      const action = {
        to: tokenRequest.address,
        calldata: tokenRequest.contract.methods
          .finaliseTokenRequest(0)
          .encodeABI()
      };
      script = encodeCallScript([action]);
    });

    it("finalise token request", async () => {
      const expectedUserMiniMeBalance = 300;

      await forwarderMock.forward(script, { from: rootAccount });

      //   tokenRequest.finaliseTokenRequest(0, { from: voting.address });

      const actualUserMiniMeBalance = await requestableToken.balanceOf(
        rootAccount
      );
      assert.equal(actualUserMiniMeBalance, expectedUserMiniMeBalance);
    });
  });
});
