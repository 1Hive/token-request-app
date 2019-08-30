pragma solidity ^0.4.24;

import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/os/contracts/common/EtherTokenConstant.sol";
import "@aragon/os/contracts/common/SafeERC20.sol";
import "@aragon/os/contracts/lib/token/ERC20.sol";
import "@aragon/apps-token-manager/contracts/TokenManager.sol";
import "./lib/UintArrayLib.sol";
import "./lib/AddressArrayLib.sol";

/**
* Expected use requires the FINALISE_TOKEN_REQUEST_ROLE permission be given exclusively to a forwarder. A user can then
* request tokens by calling createTokenRequest() to deposit funds and then calling finaliseTokenRequest() which will be called
* via the forwarder if forwarding is successful, minting the user tokens.
*/
contract TokenRequest is AragonApp {

    using SafeERC20 for ERC20;
    using UintArrayLib for uint256[];
    using AddressArrayLib for address[];

    bytes32 constant public SET_TOKEN_MANAGER_ROLE = keccak256("SET_TOKEN_MANAGER_ROLE");
    bytes32 constant public SET_VAULT_ROLE = keccak256("SET_VAULT_ROLE");
    bytes32 constant public FINALISE_TOKEN_REQUEST_ROLE = keccak256("FINALISE_TOKEN_REQUEST_ROLE");
    bytes32 constant public MODIFY_TOKENS_ROLE = keccak256("MODIFY_TOKENS_ROLE");
    bytes32 constant public SET_EXPIRY_TIME_ROLE = keccak256("SET_EXPIRY_TIME_ROLE");

    string private constant ERROR_NO_AMOUNT = "TOKEN_REQUEST_NO_AMOUNT";
    string private constant ERROR_NOT_OWNER = "TOKEN_REQUEST_NOT_OWNER";
    string private constant ERROR_NO_DEPOSIT = "TOKEN_REQUEST_NO_DEPOSIT";
    string private constant ERROR_ETH_VALUE_MISMATCH = "TOKEN_REQUEST_ETH_VALUE_MISMATCH";
    string private constant ERROR_TOKEN_TRANSFER_REVERTED = "TOKEN_REQUEST_TOKEN_TRANSFER_REVERTED";
    string private constant ERROR_TOKEN_ALREADY_ADDED = "TOKEN_REQUEST_TOKEN_ALREADY_ADDED";
    string private constant ERROR_TOKEN_DOES_NOT_EXIST = "TOKEN_REQUEST_TOKEN_DOES_NOT_EXIST";

    struct TokenRequest {
        address requesterAddress;
        address depositToken;
        uint256 depositAmount;
        uint256 requestAmount;
        uint64 timeCreated;
    }

    TokenManager public tokenManager;
    address public vault;

    mapping(address => bool) public tokenAdded;
    address[] public acceptedTokens;

    uint256 public expiryTime;

    uint256 public nextTokenRequestId;
    mapping(uint256 => TokenRequest) public tokenRequests; // ID => TokenRequest
    mapping(address => uint256[]) public addressesTokenRequestIds; // Sender address => List of ID's

    event TokenRequestCreated(uint256 requestId, address requesterAddress, address depositToken, uint256 depositAmount, uint256 requestAmount);
    event TokenRequestRefunded(uint256 requestId, address refundToAddress, address refundToken, uint256 refundAmount);
    event TokenRequestFinalised(uint256 requestId, address requester, address depositToken, uint256 depositAmount, uint256 requestAmount);
    event AddToken(address indexed token);
    event RemoveToken(address indexed token);
    event SetTimeToExpiry(uint256 timeToExpiry);

    function initialize(address _tokenManager, address _vault, uint256 _expiryTime, address[] _acceptedTokens) external onlyInit {
        tokenManager = TokenManager(_tokenManager);
        vault = _vault;
        expiryTime = _expiryTime;
        acceptedTokens = _acceptedTokens;

        initialized();
    }

    /**
    * @notice Set the Token Manager to `_tokenManager`.
    * @param _tokenManager The new token manager address
    */
    function setTokenManager(address _tokenManager) external auth(SET_TOKEN_MANAGER_ROLE) {
        tokenManager = TokenManager(_tokenManager);
    }

    /**
    * @notice Set the Vault to `_vault`.
    * @param _vault The new vault address
    */
    function setVault(address _vault) external auth(SET_VAULT_ROLE) {
        vault = _vault;
    }

    /**
    * @notice Set Token Request expiry time to `@transformTime(_expiryTime, 'seconds')`
    * @param _expiryTime The new expiry time in seconds
    */
    function setExpiryTime(uint256 _expiryTime) external auth(SET_EXPIRY_TIME_ROLE) {
        expiryTime = _expiryTime;
        emit SetTimeToExpiry(expiryTime);
    }

    /**
    * @notice Add `_token.symbol(): string` to the accepted token request tokens
    * @param _token token address
    */
    function addToken(address _token) external auth(MODIFY_TOKENS_ROLE) {
        require(!tokenAdded[_token], ERROR_TOKEN_ALREADY_ADDED);

        tokenAdded[_token] = true;
        acceptedTokens.push(_token);

        emit AddToken(_token);
    }

    /**
    * @notice Remove `_token.symbol(): string` from the accepted token request tokens
    * @param _token token address
    */
    function removeToken(address _token) external auth(MODIFY_TOKENS_ROLE) {
        require(tokenAdded[_token], ERROR_TOKEN_DOES_NOT_EXIST);

        tokenAdded[_token] = false;
        acceptedTokens.deleteItem(_token);

        emit RemoveToken(_token);
    }

    /**
    * @notice Create a token request depositing `@tokenAmount(_depositToken, _depositAmount, true, _depositToken.decimals(): uint256)` in exchange for `@tokenAmount(self.tokenManager().token(): address, _requestAmount, true, self.tokenManager().token().decimals(): uint256)`
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
        require(_depositAmount > 0, ERROR_NO_AMOUNT);

        if (_depositToken == ETH) {
            require(msg.value == _depositAmount, ERROR_ETH_VALUE_MISMATCH);
        } else {
            require(ERC20(_depositToken).safeTransferFrom(msg.sender, address(this), _depositAmount), ERROR_TOKEN_TRANSFER_REVERTED);
        }

        uint256 tokenRequestId = nextTokenRequestId;
        nextTokenRequestId++;

        tokenRequests[tokenRequestId] = TokenRequest(msg.sender, _depositToken, _depositAmount, _requestAmount, getTimestamp64());
        addressesTokenRequestIds[msg.sender].push(tokenRequestId);

        emit TokenRequestCreated(tokenRequestId, msg.sender, _depositToken, _depositAmount, _requestAmount);

        return tokenRequestId;
    }

    /**
    * @notice Refund the deposit for token request with id `_tokenRequestId` to the creators account.
    * @param _tokenRequestId ID of the Token Request
    */
    function refundTokenRequest(uint256 _tokenRequestId) external {
        TokenRequest memory tokenRequestCopy = tokenRequests[_tokenRequestId];
        delete tokenRequests[_tokenRequestId];

        require(tokenRequestCopy.requesterAddress == msg.sender, ERROR_NOT_OWNER);
        require(tokenRequestCopy.depositAmount > 0, ERROR_NO_DEPOSIT);

        address refundToAddress = tokenRequestCopy.requesterAddress;
        address refundToken = tokenRequestCopy.depositToken;
        uint256 refundAmount = tokenRequestCopy.depositAmount;

        if (refundToken == ETH) {
            refundToAddress.transfer(refundAmount);
        } else {
            require(ERC20(refundToken).safeTransfer(refundToAddress, refundAmount), ERROR_TOKEN_TRANSFER_REVERTED);
        }

        addressesTokenRequestIds[msg.sender].deleteItem(_tokenRequestId);

        emit TokenRequestRefunded(_tokenRequestId, refundToAddress, refundToken, refundAmount);
    }

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
        TokenRequest memory tokenRequestCopy = tokenRequests[_tokenRequestId];
        delete tokenRequests[_tokenRequestId];

        require(tokenRequestCopy.depositAmount > 0, ERROR_NO_DEPOSIT);

        address requesterAddress = tokenRequestCopy.requesterAddress;
        address depositToken = tokenRequestCopy.depositToken;
        uint256 depositAmount = tokenRequestCopy.depositAmount;
        uint256 requestAmount = tokenRequestCopy.requestAmount;

        if (depositToken == ETH) {
            vault.transfer(depositAmount);
        } else {
            require(ERC20(depositToken).safeTransfer(vault, depositAmount), ERROR_TOKEN_TRANSFER_REVERTED);
        }

        tokenManager.mint(requesterAddress, requestAmount);

        emit TokenRequestFinalised(_tokenRequestId, requesterAddress, depositToken, depositAmount, requestAmount);
    }

    function getAcceptedTokens() public view returns (address[]) {
        return acceptedTokens;
    }

    function getTokenRequest(uint256 _tokenRequestId) public view
    returns (
        address requesterAddress,
        address depositToken,
        uint256 depositAmount,
        uint256 requestAmount,
        uint64 timeCreated )
    {
        TokenRequest storage tokenRequest = tokenRequests[_tokenRequestId];

        requesterAddress = tokenRequest.requesterAddress;
        depositToken = tokenRequest.depositToken;
        depositAmount = tokenRequest.depositAmount;
        requestAmount = tokenRequest.requestAmount;
        timeCreated = tokenRequest.timeCreated;
    }

}
