pragma solidity ^0.4.23;


import '../Datastore.sol';


// This contract is for testing the Store's methods
// which are callable from other contracts

contract DatastoreCaller {

  Datastore public store;

  function setStore(address _storeAddress) public {
    store = Datastore(_storeAddress);
  }

  // callable methods
  // There is no need to test them because the
  // compiler with produce an error when calling any getter that
  // returns not-allowed dynamic data

  function getAddress(string _uid) public constant returns (address){
    return store.getAddress(_uid);
  }

  function getAddressLastUpdate(address _address) public constant returns (uint) {
    return store.getAddressLastUpdate(_address);
  }

  function getUidLastUpdate(string _uid) public constant returns (uint) {
    return store.getUidLastUpdate(_uid);
  }

  function isUpgradable(address _address, string _uid) public constant returns (bool) {
    return store.isUpgradable(_address, _uid);
  }


}
