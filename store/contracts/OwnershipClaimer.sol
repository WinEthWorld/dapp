pragma solidity ^0.4.23;


import '../../ethereum-api/oraclizeAPI_0.5.sol';
import 'openzeppelin-solidity/contracts/ownership/HasNoEther.sol';
import './Oraclized.sol';


contract ManagerInterface {

  function getAppId(
    string _appNickname
  )
  external
  constant returns (uint);


  function setIdentity(
    uint _appId,
    address _address,
    string _uid
  )
  external;

}



/**
 * @title OwnershipClaimer
 * @author Francesco Sullo <francesco@sullo.co>
 * @dev It allow user to self claim ownership of a supported web app account
 */



contract OwnershipClaimer
is Oraclized, HasNoEther
{

  string public fromVersion = "1.1.0";

  string public apiUrl = "https://api.tweedentity.net/";

  struct TempData {
    address sender;
    uint appId;
  }

  mapping(bytes32 => TempData) internal __tempData;

  ManagerInterface public manager;
  address public managerAddress;



  //events


  event ManagerSet(
    address indexed manager
  );


  event VerificationStarted(
    bytes32 oraclizeId,
    address indexed addr,
    string appNickname,
    string postId
  );


  event VerificatioFailed(
    bytes32 indexed oraclizeId
  );

  event NotEnoughValue(
    uint provided,
    uint requested
  );

  // modifiers


  modifier whenAppSet(
    string _appNickname
  ) {
    require(manager.getAppId(_appNickname) > 0);
    _;
  }



  // config


  function setManager(
    address _address
  )
  public
  onlyOwner
  {
    require(_address != address(0));
    managerAddress = _address;
    manager = ManagerInterface(_address);
    emit ManagerSet(_address);
  }



  // primary methods


  /**
   * @dev Allow a wallet to claim ownership of an account
   * @param _appNickname Identifies the web app for the account
   * @param _postId Id id of the post contains the signature
   * @param _gasPrice The gas price for Oraclize
   * @param _gasLimit The gas limit for Oraclize
   */
  function claimAccountOwnership(
    string _appNickname,
    string _postId,
    uint _gasPrice,
    uint _gasLimit
  )
  public
  payable
  {

    require(bytes(_postId).length > 0);

    oraclize_setCustomGasPrice(_gasPrice);
    uint oraclePrice = oraclize_getPrice("URL", _gasLimit);

    if (oraclePrice > 0 && msg.value < oraclePrice) {

      emit NotEnoughValue(msg.value, oraclePrice);

    } else {

      string[6] memory str;
      str[0] = apiUrl;
      str[1] = _appNickname;
      str[2] = "/";
      str[3] = _postId;
      str[4] = "/0x";
      str[5] = __addressToString(msg.sender);
      string memory url = __concat(str);

      bytes32 oraclizeID = oraclize_query(
        "URL",
        url,
        _gasLimit
      );
      emit VerificationStarted(oraclizeID, msg.sender, _appNickname, _postId);
      __tempData[oraclizeID] = TempData(msg.sender, manager.getAppId(_appNickname));
    }
  }



  /**
   * @dev Receive the call from Oraclize
   * @param _oraclizeID The oraclize id
   * @param _result The text resulting from requesting the url
   */
  function __callback(
    bytes32 _oraclizeID,
    string _result
  )
  public
  {
    require(msg.sender == oraclize_cbAddress());
    if (bytes(_result).length > 0) {
      manager.setIdentity(__tempData[_oraclizeID].appId, __tempData[_oraclizeID].sender, _result);
    } else {
      emit VerificatioFailed(_oraclizeID);
    }
  }


  // private methods


  function __addressToString(
    address _address
  )
  internal
  pure
  returns (string)
  {
    bytes memory s = new bytes(40);
    for (uint i = 0; i < 20; i++) {
      byte b = byte(uint8(uint(_address) / (2 ** (8 * (19 - i)))));
      byte hi = byte(uint8(b) / 16);
      byte lo = byte(uint8(b) - 16 * uint8(hi));
      s[2 * i] = __char(hi);
      s[2 * i + 1] = __char(lo);
    }
    return string(s);
  }


  function __char(
    byte b
  )
  internal
  pure
  returns (byte c)
  {
    if (b < 10) return byte(uint8(b) + 0x30);
    else return byte(uint8(b) + 0x57);
  }


  function __concat(
    string[6] _strings
  )
  internal
  pure
  returns (string)
  {
    uint len = 0;
    uint i;
    for (i = 0; i < _strings.length; i++) {
      len = len + bytes(_strings[i]).length;
    }
    string memory str = new string(len);
    bytes memory bstr = bytes(str);
    uint k = 0;
    uint j;
    bytes memory b;
    for (i = 0; i < _strings.length; i++) {
      b = bytes(_strings[i]);
      for (j = 0; j < b.length; j++) bstr[k++] = b[j];
    }
    return string(bstr);
  }

}
