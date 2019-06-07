pragma solidity ^0.4.24;

import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/apps-token-manager/contracts/TokenManager.sol";
import "@aragon/apps-vault/contracts/Vault.sol";
import "@aragon/apps-voting/contracts/Voting.sol";
import "@aragon/os/contracts/common/SafeERC20.sol";
import "@aragon/os/contracts/lib/token/ERC20.sol";
import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "./lib/ArrayUtils.sol";


contract TokenRequest is AragonApp {
    using SafeMath for uint256;

    bytes32 constant public TOKEN_REQUEST_ROLE = keccak256("TOKEN_REQUEST_ROLE");
    bytes32 constant public REFOUND_ROLE = keccak256("REFOUND_ROLE");
    bytes32 constant public VOTING_TOKEN_REQUEST_ROLE = keccak256("VOTING_TOKEN_REQUEST_ROLE");

    string private constant ERROR_VAULT_NOT_CONTRACT = "TOKENREQUEST_VAULT_NOT_CONTRACT";
    string private constant ERROR_TOKEN_MANAGER_NOT_CONTRACT = "TOKENREQUEST_TOKEN_MANAGER_NOT_CONTRACT";
    string private constant ERROR_TOKEN_NOT_CONTRACT = "TOKENREQUEST_TOKEN_NOT_CONTRACT";
    string private constant ERROR_CANNOT_MINT_ZERO = "TOKENREQUEST_CANNOT_MINT_ZERO";
    string private constant ERROR_ETH_VALUE_MISMATCH = "TOKENREQUEST_ETH_VALUE_MISMATCH";
    string private constant ERROR_DEPOSIT_VALUE_MISMATCH = "TOKENREQUEST_DEPOSIT_VALUE_MISMATCH";
    string private constant ERROR_DEPOSIT_TOKEN_MISMATCH = "TOKENREQUEST_DEPOSIT_TOKEN_MISMATCH";
    string private constant ERROR_MINT_VALUE_MISMATCH = "TOKENREQUEST_MINT_VALUE_MISMATCH";
    string private constant ERROR_DEPOSIT_NOT_ACTIVE = "TOKENREQUEST_DEPOSIT_NOT_ACTIVE";
    string private constant ERROR_TOKEN_TRANSFER_REVERTED = "TOKENREQUEST_TOKEN_TRANSFER_REVERT";
    string private constant ERROR_TOKEN_APPROVE_FAILED = "TOKENREQUEST_TKN_APPROVE_FAILED";

     struct Request {
        uint256 depositAmount;
        address token;
        uint256 mintAmount;
        bool active;
    }

    Vault public vault;
    TokenManager public tokenManager;
    Voting public voting;

    // In case of refound how can we know which pending refound to do?
    mapping (address => mapping (uint256 => Request)) internal requests;
    mapping (address => uint256) public requestsLengths;

    event Request(address indexed receiver, address depositToken, uint256 depositAmount, uint256 mintAmount, uint256 voteId, uint256 requestId);
    event ApprovedRequest(
        address indexed receiver,
        address depositToken,
        uint256 depositAmount,
        uint256 mintAmount,
        uint256 voteId,
        uint256 requestId
        );

     /**
    * @notice Initialize TokenRequest app contract
    * @param _vault Address of the vault
    * @param _tokenManager TokenManager address
    */
    function initialize(Vault _vault, TokenManager _tokenManager) external onlyInit {
        initialized();

        require(isContract(_vault), ERROR_VAULT_NOT_CONTRACT);
        require(isContract(_tokenManager), ERROR_TOKEN_MANAGER_NOT_CONTRACT);

        vault = _vault;
        tokenManager = _tokenManager;
    }

    function request(
        address _depositToken,
        uint256 _depositAmount,
        uint256 _mintAmount,
        bytes _evmScript,
        string _metadata
    )
        external
        payable
        auth(TOKEN_REQUEST_ROLE)
    {
        require(_mintAmount > 0, ERROR_CANNOT_MINT_ZERO);
        if (_depositToken == ETH) {
            // Ensure that the ETH sent with the transaction equals the amount in the deposit
            require(msg.value == _depositAmount, ERROR_ETH_VALUE_MISMATCH);
        } else {
             require(
                    ERC20(_depositToken).safeTransferFrom(msg.sender, address(this), _depositAmount),
                    ERROR_TOKEN_TRANSFER_REVERTED
                );
        }

        //Save the deposit amount into the mapping
        uint256 requestId = requestsLengths[msg.sender]++;
        Request storage request_ = requests[msg.sender] [requestId];
        request_.token = _depositToken;
        request_.depositAmount = _depositAmount;
        request_.mintAmount = _mintAmount;
        request_.active = true;

        uint256 voteId = voting.newVote(_evmScript,_metadata);
        emit Request(msg.sender, _depositToken, _depositAmount, _mintAmount, voteId, requestId);

    }

    function _request(
        address _receiver,
        address _depositToken,
        uint256 _depositAmount,
        uint256 _mintAmount,
        uint256 _requestId
    )
        external
        auth(VOTING_TOKEN_REQUEST_ROLE)
    {

        Request storage request_ = requests[_receiver][_requestId];
        require(request_.active = true, ERROR_DEPOSIT_NOT_ACTIVE);
        require(request_.token = _depositToken, ERROR_DEPOSIT_TOKEN_MISMATCH);
        require(request_.depositAmount = _depositAmount, ERROR_DEPOSIT_VALUE_MISMATCH);
        require(request_.mintAmount = _mintAmount, ERROR_MINT_VALUE_MISMATCH);

        request_.active = false;
        if (_depositToken == ETH) {
             vault.deposit.value(_depositAmount)(ETH, _depositAmount);
        }

        require(ERC20(_depositToken).safeApprove(vault, _depositAmount), ERROR_TOKEN_APPROVE_FAILED);
        vault.deposit(_depositToken, _depositAmount);
        tokenManager.mint(_receiver, _mintAmount);

        emit ApprovedRequest(_receiver, _depositToken, _depositAmount, _mintAmount, voteId, requestId);

    }
}
