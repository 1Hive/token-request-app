pragma solidity ^0.4.24;

import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/apps-token-manager/contracts/TokenManager.sol";
import "@aragon/apps-vault/contracts/Vault.sol";
import "@aragon/apps-voting/contracts/Voting.sol";
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
    string private constant ERROR_TOKEN_TRANSFER_REVERTED = "TOKENREQUEST_TOKEN_TRANSFER_REVERT";

    Vault public vault;
    TokenManager public tokenManager;
    Voting public voting;

    // In case of refound how can we know which pending refound to do?
    mapping (address => mapping (uint256 => uint256)) internal deposits;
    mapping (address => uint256) public depositsLengths;

    event Request(address indexed receiver, address depositToken, uint256 depositAmount, uint256 mintAmount, uint256 voteId, uint256 depositId);

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
        uint256 depositId = depositsLengths[msg.sender]++;
        deposits[msg.sender][depositId] = _depositAmount;

        uint256 voteId = voting.newVote(_evmScript,_metadata);
        emit Request(msg.sender, _depositToken, _depositAmount, _mintAmount, voteId, depositId);

    }

    // Internal fns
    function _request(
        address _receiver,
        address _depositToken,
        uint256 _depositAmount,
        uint256 _tokenAmount,
        uint256 _depositId
    )
        external
    {

        if (_depositAmount > 0){
            require(deposits[_receiver][depositId] = _depositAmount, ERROR_DEPOSIT_VALUE_MISMATCH);
                vault.deposit(_depositToken, _depositAmount);
        }

        tokenManager.mint(_receiver, 10e18);

    }
}
