// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRegistroFacturas} from "./IRegistroFacturas.sol";

/// @title RegistroFacturasMinimo
/// @notice Contrato mínimo para el experimento E1. No reemplaza a LiquidacionFacturas:
///         no separa lógica y datos, ni maneja ajustes o doble firma.
contract RegistroFacturasMinimo is IRegistroFacturas {
    uint256 public constant MAX_LOTE = 100;

    address public immutable registrador;
    mapping(bytes32 facturaId => bytes32) private _huellas;

    constructor(address registrador_) {
        registrador = registrador_;
    }

    function registrarLote(Item[] calldata items) external {
        if (msg.sender != registrador) revert NoAutorizado(msg.sender);
        if (items.length == 0 || items.length > MAX_LOTE) revert LoteInvalido(items.length);

        for (uint256 i = 0; i < items.length; i++) {
            Item calldata item = items[i];
            if (item.facturaId == bytes32(0) || item.huella == bytes32(0)) revert ItemInvalido(item.facturaId);

            bytes32 actual = _huellas[item.facturaId];
            if (actual == item.huella) continue;
            if (actual != bytes32(0)) revert HuellaDistinta(item.facturaId);

            _huellas[item.facturaId] = item.huella;
            emit FacturaAnclada(item.facturaId, item.huella, item.cuenta, item.periodo, item.wh, item.cop);
        }
    }

    function huellaDe(bytes32 facturaId) external view returns (bytes32) {
        return _huellas[facturaId];
    }
}
