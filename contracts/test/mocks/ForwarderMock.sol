pragma solidity 0.4.24;

import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/os/contracts/common/IForwarder.sol";

contract ForwarderMock is IForwarder, AragonApp { 

    function initialize() external onlyInit {
        initialized();
    }

    function forward(bytes _evmScript) public {
        bytes memory input = new bytes(0); 
        runScript(_evmScript, input, new address[](0));
    }

     function canForward(address _sender, bytes) public view returns (bool) {
        // Note that `canPerform()` implicitly does an initialization check itself
        return hasInitialized();
    }

     function isForwarder() external pure returns (bool) {
        return true;
    }
}