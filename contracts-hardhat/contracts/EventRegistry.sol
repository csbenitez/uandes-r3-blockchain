// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title EventRegistry
/// @notice Registro inmutable de eventos de negocio. On-chain solo se guarda el HASH
///         del documento; el contenido real vive off-chain (patrón "hash anclado").
contract EventRegistry is AccessControl, Pausable {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    struct Record {
        address issuer;
        uint64 timestamp;
        uint64 blockNumber;
        string kind; // p. ej. "FACTURA", "ENTREGA"
        string uri; // dónde está el documento off-chain
    }

    uint256 public totalEvents;
    mapping(bytes32 docHash => Record) private _records;

    event EventRegistered(
        uint256 indexed id,
        bytes32 indexed docHash,
        address indexed issuer,
        string kind,
        string uri,
        uint64 timestamp
    );

    error AlreadyRegistered(bytes32 docHash);
    error EmptyHash();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
    }

    function registerEvent(bytes32 docHash, string calldata kind, string calldata uri)
        external
        onlyRole(REGISTRAR_ROLE)
        whenNotPaused
        returns (uint256 id)
    {
        if (docHash == bytes32(0)) revert EmptyHash();
        if (_records[docHash].timestamp != 0) revert AlreadyRegistered(docHash);

        id = ++totalEvents;
        _records[docHash] = Record({
            issuer: msg.sender,
            timestamp: uint64(block.timestamp),
            blockNumber: uint64(block.number),
            kind: kind,
            uri: uri
        });
        emit EventRegistered(id, docHash, msg.sender, kind, uri, uint64(block.timestamp));
    }

    function verify(bytes32 docHash) external view returns (bool exists, Record memory record) {
        record = _records[docHash];
        exists = record.timestamp != 0;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
