// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IRegistroFacturas} from "./IRegistroFacturas.sol";

/// @title LiquidacionFacturas
/// @notice Registro de facturas y ajustes gobernados por doble autorización.
///         Implementa IRegistroFacturas para mantener compatibilidad con E1.
contract LiquidacionFacturas is IRegistroFacturas, AccessControl {

    uint256 public constant MAX_LOTE = 100;

    bytes32 public constant REGISTRAR_ROLE =
        keccak256("REGISTRAR_ROLE");

    bytes32 public constant VOLTERA_ROLE =
        keccak256("VOLTERA_ROLE");

    bytes32 public constant SSPD_ROLE =
        keccak256("SSPD_ROLE");

    mapping(bytes32 facturaId => bytes32) private _huellas;

    struct Ajuste {
        bytes32 facturaId;
        bytes32 huellaAnterior;
        bytes32 huellaNueva;

        address firmanteVoltera;
        address firmanteSSPD;

        bool ejecutado;
    }

    mapping(bytes32 ajusteId => Ajuste) private _ajustes;

    event AjustePropuesto(
        bytes32 indexed ajusteId,
        bytes32 indexed facturaId,
        bytes32 huellaAnterior,
        bytes32 huellaNueva
    );

    event AjusteAprobadoVoltera(
        bytes32 indexed ajusteId,
        address indexed firmante
    );

    event AjusteAprobadoSSPD(
        bytes32 indexed ajusteId,
        address indexed firmante
    );

    event AjusteAnclado(
        bytes32 indexed ajusteId,
        bytes32 indexed facturaId,
        bytes32 huellaAnterior,
        bytes32 huellaNueva
    );

    error AjusteYaExiste(bytes32 ajusteId);
    error AjusteNoExiste(bytes32 ajusteId);
    error FacturaNoAnclada(bytes32 facturaId);
    error HuellaInvalida();
    error FirmaDuplicada();
    error DobleFirmaRequerida();
    error AjusteYaEjecutado(bytes32 ajusteId);

    constructor(address registrador_) {

        _grantRole(
            DEFAULT_ADMIN_ROLE,
            registrador_
        );

        _grantRole(
            REGISTRAR_ROLE,
            registrador_
        );
    }

    // ----------------------------------------------------
    // REGISTRO DE FACTURAS
    // ----------------------------------------------------

    function registrarLote(
    Item[] calldata items
)
    external
{
    if (!hasRole(REGISTRAR_ROLE, msg.sender)) {
        revert NoAutorizado(msg.sender);
    }
        if (
            items.length == 0 ||
            items.length > MAX_LOTE
        ) {
            revert LoteInvalido(items.length);
        }

        for (
            uint256 i = 0;
            i < items.length;
            i++
        ) {
            Item calldata item = items[i];

            if (
                item.facturaId == bytes32(0) ||
                item.huella == bytes32(0)
            ) {
                revert ItemInvalido(
                    item.facturaId
                );
            }

            bytes32 actual =
                _huellas[item.facturaId];

            // Reintento idempotente.
            if (actual == item.huella) {
                continue;
            }

            if (actual != bytes32(0)) {
                revert HuellaDistinta(
                    item.facturaId
                );
            }

            _huellas[item.facturaId] =
                item.huella;

            emit FacturaAnclada(
                item.facturaId,
                item.huella,
                item.cuenta,
                item.periodo,
                item.wh,
                item.cop
            );
        }
    }

    function huellaDe(
        bytes32 facturaId
    )
        external
        view
        returns (bytes32)
    {
        return _huellas[facturaId];
    }

    // ----------------------------------------------------
    // AJUSTES
    // ----------------------------------------------------

    function proponerAjuste(
        bytes32 ajusteId,
        bytes32 facturaId,
        bytes32 nuevaHuella
    )
        external
        onlyRole(REGISTRAR_ROLE)
    {
        if (
            _ajustes[ajusteId].facturaId
                != bytes32(0)
        ) {
            revert AjusteYaExiste(
                ajusteId
            );
        }

        bytes32 actual =
            _huellas[facturaId];

        if (actual == bytes32(0)) {
            revert FacturaNoAnclada(
                facturaId
            );
        }

        if (
            nuevaHuella == bytes32(0) ||
            nuevaHuella == actual
        ) {
            revert HuellaInvalida();
        }

        _ajustes[ajusteId] = Ajuste({
            facturaId: facturaId,
            huellaAnterior: actual,
            huellaNueva: nuevaHuella,
            firmanteVoltera: address(0),
            firmanteSSPD: address(0),
            ejecutado: false
        });

        emit AjustePropuesto(
            ajusteId,
            facturaId,
            actual,
            nuevaHuella
        );
    }

    function aprobarComoVoltera(
        bytes32 ajusteId
    )
        external
        onlyRole(VOLTERA_ROLE)
    {
        Ajuste storage ajuste =
            _obtenerAjuste(ajusteId);

        if (ajuste.ejecutado) {
            revert AjusteYaEjecutado(
                ajusteId
            );
        }

        if (
            ajuste.firmanteVoltera
                != address(0)
        ) {
            revert FirmaDuplicada();
        }

        // Evita que la misma identidad
        // actúe como Voltera y SSPD.
        if (
            ajuste.firmanteSSPD
                == msg.sender
        ) {
            revert FirmaDuplicada();
        }

        ajuste.firmanteVoltera =
            msg.sender;

        emit AjusteAprobadoVoltera(
            ajusteId,
            msg.sender
        );
    }

    function aprobarComoSSPD(
        bytes32 ajusteId
    )
        external
        onlyRole(SSPD_ROLE)
    {
        Ajuste storage ajuste =
            _obtenerAjuste(ajusteId);

        if (ajuste.ejecutado) {
            revert AjusteYaEjecutado(
                ajusteId
            );
        }

        if (
            ajuste.firmanteSSPD
                != address(0)
        ) {
            revert FirmaDuplicada();
        }

        if (
            ajuste.firmanteVoltera
                == msg.sender
        ) {
            revert FirmaDuplicada();
        }

        ajuste.firmanteSSPD =
            msg.sender;

        emit AjusteAprobadoSSPD(
            ajusteId,
            msg.sender
        );
    }

    function anclarAjuste(
        bytes32 ajusteId
    )
        external
        onlyRole(REGISTRAR_ROLE)
    {
        Ajuste storage ajuste =
            _obtenerAjuste(ajusteId);

        if (ajuste.ejecutado) {
            revert AjusteYaEjecutado(
                ajusteId
            );
        }

        if (
            ajuste.firmanteVoltera
                == address(0) ||
            ajuste.firmanteSSPD
                == address(0)
        ) {
            revert DobleFirmaRequerida();
        }

        _huellas[ajuste.facturaId] =
            ajuste.huellaNueva;

        ajuste.ejecutado = true;

        emit AjusteAnclado(
            ajusteId,
            ajuste.facturaId,
            ajuste.huellaAnterior,
            ajuste.huellaNueva
        );
    }

    function obtenerAjuste(
        bytes32 ajusteId
    )
        external
        view
        returns (Ajuste memory)
    {
        Ajuste memory ajuste =
            _ajustes[ajusteId];

        if (
            ajuste.facturaId
                == bytes32(0)
        ) {
            revert AjusteNoExiste(
                ajusteId
            );
        }

        return ajuste;
    }

    function _obtenerAjuste(
        bytes32 ajusteId
    )
        internal
        view
        returns (Ajuste storage)
    {
        Ajuste storage ajuste =
            _ajustes[ajusteId];

        if (
            ajuste.facturaId
                == bytes32(0)
        ) {
            revert AjusteNoExiste(
                ajusteId
            );
        }

        return ajuste;
    }
}