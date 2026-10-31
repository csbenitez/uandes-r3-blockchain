"""Reimplementa la especificación en Python, sin usar el código Node, y la contrasta con vectores.json.

Uso: python experimentos/e1-integridad/vectores/verificar.py
"""
import hashlib
import hmac
import json
import pathlib
import re
import sys
import unicodedata

ENTERO = re.compile(r"-?(0|[1-9][0-9]*)")
MAXIMO = 2**53 - 1


class Invalido(Exception):
    pass


def nfc(texto):
    return unicodedata.normalize("NFC", texto)


def sin_duplicados(pares):
    salida = {}
    for clave, valor in pares:
        clave = nfc(clave)
        if clave in salida:
            raise Invalido(f"clave duplicada {clave}")
        salida[clave] = valor
    return salida


def entero(lexema):
    if not ENTERO.fullmatch(lexema) or lexema == "-0":
        raise Invalido(lexema)
    numero = int(lexema)
    if abs(numero) > MAXIMO:
        raise Invalido(lexema)
    return numero


def rechazar(lexema):
    raise Invalido(lexema)


def serializar(valor):
    if valor is None or isinstance(valor, bool):
        return json.dumps(valor)
    if isinstance(valor, int):
        return str(valor)
    if isinstance(valor, str):
        return json.dumps(nfc(valor), ensure_ascii=False)
    if isinstance(valor, list):
        return "[" + ",".join(serializar(v) for v in valor) + "]"
    claves = sorted(valor, key=lambda k: k.encode("utf-16-be"))
    return "{" + ",".join(f"{json.dumps(k, ensure_ascii=False)}:{serializar(valor[k])}" for k in claves) + "}"


def canonicalizar(texto):
    if texto.startswith("﻿"):
        raise Invalido("BOM")
    try:
        valor = json.loads(texto, object_pairs_hook=sin_duplicados, parse_int=entero, parse_float=rechazar, parse_constant=rechazar)
    except json.JSONDecodeError as e:
        raise Invalido(str(e)) from e
    return serializar(valor)


def sha256(datos):
    return "0x" + hashlib.sha256(datos).hexdigest()


def main():
    ruta = pathlib.Path(__file__).with_name("vectores.json")
    vectores = json.loads(ruta.read_text(encoding="utf-8"))
    fallos = 0

    for v in vectores["validos"]:
        canonico = canonicalizar(v["entrada"])
        if canonico != v["canonico"] or sha256(canonico.encode("utf-8")) != v["huella"]:
            print("FALLA", v["nombre"], canonico)
            fallos += 1

    for v in vectores["invalidos"]:
        try:
            canonicalizar(v["entrada"])
            print("DEBIÓ RECHAZARSE", v["nombre"])
            fallos += 1
        except Invalido:
            pass

    for v in vectores["identificadores"]:
        if sha256(v["entrada"].encode("utf-8")) != v["facturaId"]:
            print("FALLA identificador", v["entrada"])
            fallos += 1

    for v in vectores["cuentas"]:
        calculado = "0x" + hmac.new(v["sal"].encode("utf-8"), v["nic"].encode("utf-8"), hashlib.sha256).hexdigest()
        if calculado != v["cuenta"]:
            print("FALLA cuenta", v["nic"])
            fallos += 1

    total = len(vectores["validos"]) + len(vectores["invalidos"]) + len(vectores["identificadores"]) + len(vectores["cuentas"])
    print(f"{total - fallos} de {total} vectores coinciden")
    sys.exit(1 if fallos else 0)


if __name__ == "__main__":
    main()
