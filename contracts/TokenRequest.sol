pragma solidity ^0.4.24;

import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/os/contracts/common/EtherTokenConstant.sol";
import "@aragon/os/contracts/common/SafeERC20.sol";
import "@aragon/os/contracts/lib/token/ERC20.sol";
import "@aragon/apps-token-manager/contracts/TokenManager.sol";
import "./lib/UintArrayLib.sol";
import "./lib/ArrayUtils.sol";

/**
* Expected use requires the FINALISE_TOKEN_REQUEST_ROLE permission be given exclusively to a forwarder. A user can then
* request tokens by calling createTokenRequest() to deposit funds and then calling finaliseTokenRequest() which will be called
* via the forwarder if forwarding is successful, minting the user tokens.
*/
  contract TokenRequest is EtherTokenConstant, AragonApp {

    using SafeERC20 for ERC20;
    using UintArrayLib for uint256[];
    using ArrayUtils for address[];

    bytes32 constant public SET_TOKEN_MANAGER_ROLE = keccak256("SET_TOKEN_MANAGER_ROLE");
    bytes32 constant public SET_VAULT_ROLE = keccak256("SET_VAULT_ROLE");
    bytes32 constant public FINALISE_TOKEN_REQUEST_ROLE = keccak256("FINALISE_TOKEN_REQUEST_ROLE");
    bytes32 constant public ADD_TOKEN_ROLE = keccak256("ADD_TOKEN_ROLE");
    bytes32 constant public REMOVE_TOKEN_ROLE = keccak256("REMOVE_TOKEN_ROLE");
    bytes32 constant public SUBMIT_TOKEN_REQUEST_ROLE = keccak256("SUBMIT_TOKEN_REQUEST_ROLE");
    bytes32 constant public SET_TIME_TO_EXPIRY_ROLE = keccak256("SET_TIME_TO_EXPIRY_ROLE");

    string private constant ERROR_NO_AMOUNT = "TOKEN_REQUEST_NO_AMOUNT";
    string private constant ERROR_NOT_OWNER = "TOKEN_REQUEST_NOT_OWNER";
    string private constant ERROR_NO_DEPOSIT = "TOKEN_REQUEST_NO_DEPOSIT";
    string private constant ERROR_ETH_VALUE_MISMATCH = "TOKEN_REQUEST_ETH_VALUE_MISMATCH";
    string private constant ERROR_TOKEN_TRANSFER_REVERTED = "TOKEN_REQUEST_TOKEN_TRANSFER_REVERTED";
    string private constant ERROR_CANNOT_ADD_TOKEN_MANAGER = "TOKEN_REQUEST_CANNOT_ADD_TOKEN_MANAGER";
    string private constant ERROR_TOKEN_ALREADY_ADDED = "TOKEN_REQUEST_TOKEN_ALREADY_ADDED";
    string private constant ERROR_TOKEN_NOT_CONTRACT = "TOKEN_REQUEST_TOKEN_NOT_CONTRACT";
    string private constant ERROR_TOKEN_NOT_EXIST = "TOKEN_REQUEST_ERROR_TOKEN_NOT_EXIST";

    struct TokenRequest {
        address requesterAddress;
        address depositToken;
        uint256 depositAmount;
        uint256 requestAmount;
        uint64 date;
    }

    TokenManager public tokenManager;
    address public vault;

    mapping(address => bool) public tokenAdded;
    address[] public acceptedTokenList;

    uint256 public timeToExpiry;
    uint256 public nextTokenRequestId;

    mapping(uint256 => TokenRequest) public tokenRequests; // ID => TokenRequest
    mapping(address => uint256[]) public addressesTokenRequestIds; // Sender address => List of ID's

    event TokenRequestCreated(uint256 requestId, address requesterAddress, address depositToken, uint256 depositAmount, uint256 requestAmount, uint64 date);
    event TokenRequestRefunded(uint256 requestId,address refundToAddress, address refundToken, uint256 refundAmount, uint64 refundedDate);
    event TokenRequestFinalised(uint256 requestId, address requester, address depositToken, uint256 depositAmount, uint256 requestAmount, uint64 finalizedDate);
    event AddToken(address indexed token);
    event RemoveToken(address indexed token);
    event SetTimeToExpiry(uint256 timeToExpiry);

    function initialize(address _tokenManager, address _vault, uint256 _timeToExpiry) external onlyInit {
        tokenManager = TokenManager(_tokenManager);
        vault = _vault;
        timeToExpiry = _timeToExpiry;
        initialized();
        //tokens.push(0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359);
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
    * @notice Sets timeToExpiry to `_lockAmount`
    * @param _timeToExpiry The new timeToExpiry
    */
    function setTimeToExpiry(uint256 _timeToExpiry) external auth(SET_TIME_TO_EXPIRY_ROLE) {
        timeToExpiry = _timeToExpiry;
        emit SetTimeToExpiry(timeToExpiry);
    }
    /**
    * @notice Add `_token.symbol()` token to redemption list
    * @param _token token address
    */
    function addToken(address _token) external auth(ADD_TOKEN_ROLE) {
        require(_token != address(tokenManager), ERROR_CANNOT_ADD_TOKEN_MANAGER);
        require(!tokenAdded[_token], ERROR_TOKEN_ALREADY_ADDED);

        if (_token != ETH) {
            require(isContract(_token), ERROR_TOKEN_NOT_CONTRACT);
        }

        tokenAdded[_token] = true;
        acceptedTokenList.push(_token);

        emit AddToken(_token);
    }

    /**
    * @notice Remove `_token.symbol()` token from redemption list
    * @param _token token address
    */
    function removeToken(address _token) external auth(REMOVE_TOKEN_ROLE) {
        require(tokenAdded[_token], ERROR_TOKEN_NOT_EXIST);

        tokenAdded[_token] = false;
        acceptedTokenList.deleteItem(_token);
        

        emit RemoveToken(_token);
    }

    /**
    * 
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

        uint64 date = getTimestamp64();
        tokenRequests[tokenRequestId] = TokenRequest(msg.sender, _depositToken, _depositAmount, _requestAmount, date);
        addressesTokenRequestIds[msg.sender].push(tokenRequestId);

        emit TokenRequestCreated(tokenRequestId, msg.sender, _depositToken, _depositAmount, _requestAmount, date);
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
        uint64 refundedDate = getTimestamp64();

        emit TokenRequestRefunded(_tokenRequestId, refundToAddress, refundToken, refundAmount, refundedDate);
    }

    // function submitTokenRequest(uint256 _tokenRequestId) external auth(SUBMIT_TOKEN_REQUEST_ROLE) {
    //     finaliseTokenRequest(_tokenRequestId);
    // }

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
        uint64 finalizedDate = getTimestamp64();

        emit TokenRequestFinalised(_tokenRequestId, requesterAddress, depositToken, depositAmount, requestAmount, finalizedDate);
    }

    function getAcceptedTokenList()
        public
        view
        returns (address[])
    {
        return acceptedTokenList;
    }

    function getTokenRequest(uint256 _tokenRequestId) 
    public 
    view 
    returns (address requesterAddress, address depositToken, uint256 depositAmount, uint256 requestAmount, uint64 date) {
        TokenRequest storage tokenRequest = tokenRequests[_tokenRequestId];

        requesterAddress = tokenRequest.requesterAddress;
        depositToken = tokenRequest.depositToken;
        depositAmount = tokenRequest.depositAmount;
        requestAmount = tokenRequest.requestAmount;
    }
    
}
