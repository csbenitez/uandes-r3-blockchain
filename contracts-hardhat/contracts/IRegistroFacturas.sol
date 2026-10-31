// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IRegistroFacturas
/// @notice Interfaz que comparten el contrato mínimo de E1 y LiquidacionFacturas del rol 4.
interface IRegistroFacturas {
    struct Item {
        bytes32 facturaId; // SHA-256 del identificador de negocio
        bytes32 huella; // SHA-256 del JSON canónico
        bytes32 cuenta; // cuenta seudonimizada
        uint32 periodo; // AAAAMM
        uint96 wh; // total de energía en Wh
        uint96 cop; // total en COP
    }

    event FacturaAnclada(
        bytes32 indexed facturaId,
        bytes32 huella,
        bytes32 cuenta,
        uint32 periodo,
        uint96 wh,
        uint96 cop
    );

    error NoAutorizado(address cuenta);
    error LoteInvalido(uint256 tamano);
    error ItemInvalido(bytes32 facturaId);
    error HuellaDistinta(bytes32 facturaId);

    /// @notice Registra hasta 100 facturas. Reintentar una factura con la misma huella no tiene efecto.
    function registrarLote(Item[] calldata items) external;

    /// @notice Devuelve la huella vigente; bytes32(0) significa que la factura no está anclada.
    function huellaDe(bytes32 facturaId) external view returns (bytes32);
}
