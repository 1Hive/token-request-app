<br />

## Overview

1Hive's Token Request app allows users to create a vote which requests an Organization's tokens in exchange for payment. For example a user may request minting 100 organization tokens in exchange for 100 DAI. The request would require a vote to to approve, if the vote is rejected the user would receive their payment back and if it is approved the payment would be deposited in the organization's vault.

The Token Request App should be granted the `Create Votes` permission on an instance of the Aragon `Voting` app. When a user makes a request they should transfer the payment to the token request app which will hold them in escrow while the vote is created and executed. If the vote duration passes and the payment is still in the token request app, the user should be able to claim **their** tokens. If the vote passes then executing the vote should transfer the users tokens from the token request app to the organizations vault, and mint tokens from the token manager for the user.

<br />

## Hard Coded Global Parameters

We have these hard maximums to prevent griefing attacks. Since we iterate over arrays, there is risk that if these arrays reach a size that is too big to iterate over within the gas limit, however unlikely, the contract will become locked.
- `MAX_ACCEPTED_DEPOSIT_TOKENS` is the maximum amount of tokens that can be added to the `_acceptedDepositTokens` array. This array defines which tokens are and are not accepted for token deposits by the DAO.
- `MAX_ADDRESS_TOKEN_REQUEST_IDS` is the maximum amount of tokenRequestIds that a user's account can have open at a given time. This essentially means that it is the maximum number of token requests a user can have open at a given time.
```
uint256 public constant MAX_ACCEPTED_DEPOSIT_TOKENS = 100;
uint256 public constant MAX_ADDRESS_TOKEN_REQUEST_IDS = 100;
```

<br />

## Token Request Struct

This is the format of token requests.
```
struct TokenRequest {
		address requesterAddress;
		address depositToken;
		uint256 depositAmount;
		uint256 requestAmount;
}
```

<br />

## User Defined Global Variables

These variables are available in the global scope of the contract, but can be changed via the contract's functions.
- `tokenManager` is an Aragon [Token Manager](https://wiki.aragon.org/dev/apps/token-manager/)
- `vault` is an Aragon [Vault](https://wiki.aragon.org/dev/apps/vault/)
- `acceptedDepositTokens` is a dynamically sized array that holds the addresses of token contracts
- `nextTokenRequestId` is TBD
- `tokenRequests` is a mapping between a `uint256` and a `TokenRequest` struct
- `addressesTokenRequestIds` is a mapping of a user's address to a dynamically sized array of `uint256`. Each `uint256` is mapped to a TokenRequest. This enables us to change the TokenRequest struct structure when the contract is upgraded without overwriting data.
```
TokenManager public tokenManager;
address public vault;

address[] public acceptedDepositTokens;

uint256 public nextTokenRequestId;
mapping(uint256 => TokenRequest) public tokenRequests; // ID => TokenRequest
mapping(address => uint256[]) public addressesTokenRequestIds; // Sender address => List of ID's
```

<br />

## Initialization

The token request app is initialized by passing the address of a `token manager` instance, the address of a `_vault` instance, and an array of addresses `_acceptedDepositTokens`. The `_acceptedDepositTokens` array must be less than the `MAX_ACCEPTED_DEPOSIT_TOKENS` variable which is set to 100.
```
function initialize(address _tokenManager, address _vault, address[] _acceptedDepositTokens) external onlyInit {
		// requite that the amount of token contract addresses in `_acceptedDepositTokens` is less than `MAX_ACCEPTED_DEPOSIT_TOKENS`
		require(_acceptedDepositTokens.length <= MAX_ACCEPTED_DEPOSIT_TOKENS, ERROR_TOO_MANY_ACCEPTED_TOKENS);

		// initialize parameters
		tokenManager = TokenManager(_tokenManager);
		vault = _vault;
		acceptedDepositTokens = _acceptedDepositTokens;

		// call `initialized()` so that the function cannot be called again
		initialized();
}
```

<br />

## Setters

The initialization parameters can be changed with the following functions:
```
/**
* @notice Set the Token Manager to `_tokenManager`.
* @param _tokenManager The new token manager address
*/
function setTokenManager(address _tokenManager) external auth(SET_TOKEN_MANAGER_ROLE) {
		tokenManager = TokenManager(_tokenManager);
		emit SetTokenManager(_tokenManager);
}

/**
* @notice Set the Vault to `_vault`.
* @param _vault The new vault address
*/
function setVault(address _vault) external auth(SET_VAULT_ROLE) {
		vault = _vault;
		emit SetVault(_vault);
}

/**
* @notice Add `_token.symbol(): string` to the accepted deposit token request tokens
* @param _token token address
*/
function addToken(address _token) external auth(MODIFY_TOKENS_ROLE) {
		require(isContract(_token), ERROR_ADDRESS_NOT_CONTRACT);
		require(!acceptedDepositTokens.contains(_token), ERROR_TOKEN_ALREADY_ACCEPTED);

		acceptedDepositTokens.push(_token);
		require(acceptedDepositTokens.length <= MAX_ACCEPTED_DEPOSIT_TOKENS, ERROR_TOO_MANY_ACCEPTED_TOKENS);

		emit TokenAdded(_token);
}

/**
* @notice Remove `_token.symbol(): string` from the accepted deposit token request tokens
* @param _token token address
*/
function removeToken(address _token) external auth(MODIFY_TOKENS_ROLE) {
		require(acceptedDepositTokens.deleteItem(_token), ERROR_TOKEN_NOT_ACCEPTED);

		emit TokenRemoved(_token);
}
```

< br />

## Creating a Token Request

When a user creates a new token request they can choose the deposit token, the amount of that token they want to deposit, and how much of they DAO's native token they'd like to request in exchange. The deposit token must be an address in the `acceptedDepositTokens` array. The user must have less than `MAX_ADDRESS_TOKEN_REQUEST_IDS` open token requests.

> note: the user can deposit as many tokens as they want. A user can also request as many of the DAO's native token as they want. `MAX_ACCEPTED_DEPOSIT_TOKENS` is a parameter that controls the maximum amount of tokens the DAO can accept for requests, not the amount of tokens a user can deposit or request.

```
/**
* @notice Create a token request depositing `@tokenAmount(_depositToken, _depositAmount, true, _depositToken.decimals(): uint256)` in exchange for `@tokenAmount(self.getToken(): address, _requestAmount, true, 18)`
* @dev Note the above radspec string seems to need to be on a single line. When split compile errors occur.
* @param _depositToken Address of the token being deposited
* @param _depositAmount Amount of the token being deposited
* @param _requestAmount Amount of the token being requested
*/
function createTokenRequest(address _depositToken, uint256 _depositAmount, uint256 _requestAmount)
external
payable
returns (uint256)
{
		// require that the deposit token is accepted by the DAO
		require(acceptedDepositTokens.contains(_depositToken), ERROR_TOKEN_NOT_ACCEPTED);
		// require that the user has less than the maximum amount of token requests open
		require(addressesTokenRequestIds[msg.sender].length < MAX_ADDRESS_TOKEN_REQUEST_IDS, ERROR_TOO_MANY_TOKEN_REQUESTS);
		// require that the user is depositing a non-zero amount of tokens
		require(_depositAmount > 0, ERROR_NO_AMOUNT);

		// logic to accept ETH or an ERC-20 token
		if (_depositToken == ETH) {
				require(msg.value == _depositAmount, ERROR_ETH_VALUE_MISMATCH);
		} else {
				require(ERC20(_depositToken).safeTransferFrom(msg.sender, address(this), _depositAmount), ERROR_TOKEN_TRANSFER_REVERTED);
		}

		// if all the checks pass...

		// create a new tokenRequestId
		uint256 tokenRequestId = nextTokenRequestId;
		// iterate the tokenRequestId nonce
		nextTokenRequestId++;

		// encode a new TokenRequest in the tokenRequestId variable and add it to the tokenRequests array
		tokenRequests[tokenRequestId] = TokenRequest(msg.sender, _depositToken, _depositAmount, _requestAmount);
		// add the tokenRequestId (a number that maps to the token request) to the users's address in the addressesTokenRequestIds array
		addressesTokenRequestIds[msg.sender].push(tokenRequestId);

		// emit an event
		emit TokenRequestCreated(tokenRequestId, msg.sender, _depositToken, _depositAmount, _requestAmount);

		// return the tokenRequestId
		return tokenRequestId;
}
```

<br />


## Refund Token Request

Allows a user to request a refund for a rejected token request. The user must supply the `tokenRequestId` of the TokenRequest they wish to have refunded. The user must then be the owner of this TokenRequest.
```
/**
* @notice Refund the deposit for token request with id `_tokenRequestId` to the creators account.
* @param _tokenRequestId ID of the Token Request
*/
function refundTokenRequest(uint256 _tokenRequestId) external {
		// copy the TokenRequest to memory for use within this function
		TokenRequest memory tokenRequestCopy = tokenRequests[_tokenRequestId];
		// delete the TokenRequest from the  contract
		delete tokenRequests[_tokenRequestId];

		// require that the user is the owner of the token request
		require(tokenRequestCopy.requesterAddress == msg.sender, ERROR_TOKEN_REQUEST_NOT_OWNER);

		// initialize parameters from the copied token request
		address refundToAddress = tokenRequestCopy.requesterAddress;
		address refundToken = tokenRequestCopy.depositToken;
		uint256 refundAmount = tokenRequestCopy.depositAmount;

		// logic to handle refunding ETH vs ERC-20 tokens
		if (refundToken == ETH) {
				refundToAddress.transfer(refundAmount);
		} else {
				require(ERC20(refundToken).safeTransfer(refundToAddress, refundAmount), ERROR_TOKEN_TRANSFER_REVERTED);
		}

		// delete the `tokenRequestId` from the user in the `addressesTokenRequestIds` array
		addressesTokenRequestIds[msg.sender].deleteItem(_tokenRequestId);

		// emit an event that the token request has been refunded
		emit TokenRequestRefunded(_tokenRequestId, refundToAddress, refundToken, refundAmount);
}
```

<br />

## Finalize Token Request

To accept a token request `finalizeTokenRequest()` needs to be called by passing in the `tokenRequstId` of the token request to finalize. This deletes the TokenRequest from the contract, moves the token deposit to the DAO's vault, and transfers the requested amount of the DAO's tokens to the token requester.
```
/**
* @notice Finalise the token request with id `_tokenRequestId`, minting the requester funds and moving payment
					to the vault.
* @dev This function's FINALISE_TOKEN_REQUEST_ROLE permission is typically given exclusively to a forwarder.
*      This contract also requires the MINT_ROLE on the TokenManager specified.
*      It is recommended the forwarder is granted the FINALISE_TOKEN_REQUEST_ROLE permission to call this function
*      before the MINT_ROLE permission on the TokenManager to prevent calling of this function before it has been
*      restricted appropriately.
* @param _tokenRequestId ID of the Token Request
*/
function finaliseTokenRequest(uint256 _tokenRequestId) external auth(FINALISE_TOKEN_REQUEST_ROLE) {
		// copy the token request to memory for use within this function
		TokenRequest memory tokenRequestCopy = tokenRequests[_tokenRequestId];
		// delete the `tokenRequestId` from the `tokenRequests[]` array
		delete tokenRequests[_tokenRequestId];

		// require that the deposit amount of the token request is greater than 0
		require(tokenRequestCopy.depositAmount > 0, ERROR_NO_DEPOSIT);

		// initialize parameters from the token request
		address requesterAddress = tokenRequestCopy.requesterAddress;
		address depositToken = tokenRequestCopy.depositToken;
		uint256 depositAmount = tokenRequestCopy.depositAmount;
		uint256 requestAmount = tokenRequestCopy.requestAmount;

		// logic to handle depositing the ETH or ERC-20 tokens into the DAO's vault
		if (depositToken == ETH) {
				vault.transfer(depositAmount);
		} else {
				require(ERC20(depositToken).safeTransfer(vault, depositAmount), ERROR_TOKEN_TRANSFER_REVERTED);
		}

		// mint the requested amount of the DAO's native tokens for the token requestee
		tokenManager.mint(requesterAddress, requestAmount);

		// delete the token request from the array of the token requestee's array of token requests in `addressTokenRequestIds`
		addressesTokenRequestIds[requesterAddress].deleteItem(_tokenRequestId);

		// emit an event that the token request is finalized
		emit TokenRequestFinalised(_tokenRequestId, requesterAddress, depositToken, depositAmount, requestAmount);
}
```

<br />

## Getters

These get various values from the contract.
```
function getAcceptedDepositTokens() public view returns (address[]) {
		return acceptedDepositTokens;
}

function getTokenRequest(uint256 _tokenRequestId) public view
returns (
		address requesterAddress,
		address depositToken,
		uint256 depositAmount,
		uint256 requestAmount
)
{
		TokenRequest storage tokenRequest = tokenRequests[_tokenRequestId];

		requesterAddress = tokenRequest.requesterAddress;
		depositToken = tokenRequest.depositToken;
		depositAmount = tokenRequest.depositAmount;
		requestAmount = tokenRequest.requestAmount;
}

/**
* @dev convenience function for getting the token request token in a radspec string
*/
function getToken() internal returns (address) {
		return tokenManager.token();
}
```

<br />

## Libraries

TokenRequest.sol depends on two external libraries that have been developed by 1Hive for the purpose of this app.

### AddressArrayLib

`AddressArrayLib` allows us to extend an array of addresses with functionality to easily delete and look up items.
```
pragma solidity ^0.4.24;


library AddressArrayLib {
    function deleteItem(address[] storage self, address item) internal returns (bool) {
        uint256 length = self.length;
        for (uint256 i = 0; i < length; i++) {
            if (self[i] == item) {
                uint256 newLength = self.length - 1;
                if (i != newLength) {
                    self[i] = self[newLength];
                }

                delete self[newLength];
                self.length = newLength;

                return true;
            }
        }
        return false;
    }

    function contains(address[] storage self, address item) internal returns (bool) {
        for (uint256 i = 0; i < self.length; i++) {
            if (self[i] == item) {
                return true;
            }
        }
        return false;
    }
}
```

### UintArrayLib

`UintArrayLib` allows us to extend an array of uint256 with functionality to easily delete items.
```
pragma solidity ^0.4.24;


library UintArrayLib {

   function deleteItem(uint256[] storage self, uint256 item) internal returns (bool) {
        uint256 length = self.length;
        for (uint256 i = 0; i < length; i++) {
            if (self[i] == item) {
                uint256 newLength = self.length - 1;
                if (i != newLength) {
                    self[i] = self[newLength];
                }

                delete self[newLength];
                self.length = newLength;

                return true;
            }
        }
       return false;
    }
}
```

<br />
