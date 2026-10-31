// Package huella implementa docs/voltera/especificacion-huella.md.
package huella

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"

	"golang.org/x/text/unicode/norm"
)

// ErrInvalido indica que el documento no cumple la forma canónica.
var ErrInvalido = errors.New("documento inválido")

const maximoEntero = int64(1)<<53 - 1

var entero = regexp.MustCompile(`^-?(0|[1-9][0-9]*)$`)

func invalido(formato string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalido, fmt.Sprintf(formato, args...))
}

// Canonicalizar devuelve la forma canónica del JSON recibido.
func Canonicalizar(texto []byte) ([]byte, error) {
	if !json.Valid(texto) {
		return nil, invalido("JSON mal formado")
	}
	dec := json.NewDecoder(bytes.NewReader(texto))
	dec.UseNumber()
	var salida strings.Builder
	if err := copiarValor(dec, &salida); err != nil {
		return nil, err
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return nil, invalido("contenido después del documento")
	}
	return []byte(salida.String()), nil
}

// HuellaDeFactura devuelve el SHA-256 de la forma canónica con prefijo 0x.
func HuellaDeFactura(texto []byte) (string, error) {
	canonico, err := Canonicalizar(texto)
	if err != nil {
		return "", err
	}
	return Sha256Hex(canonico), nil
}

// IDDeFactura deriva el facturaId del identificador de negocio.
func IDDeFactura(idNegocio string) string {
	return Sha256Hex([]byte(idNegocio))
}

// CuentaSeudonima calcula el HMAC-SHA256 del NIC con la sal off-chain.
func CuentaSeudonima(nic, sal string) string {
	m := hmac.New(sha256.New, []byte(sal))
	m.Write([]byte(nic))
	return "0x" + hex.EncodeToString(m.Sum(nil))
}

// Sha256Hex devuelve el SHA-256 con prefijo 0x.
func Sha256Hex(datos []byte) string {
	suma := sha256.Sum256(datos)
	return "0x" + hex.EncodeToString(suma[:])
}

func copiarValor(dec *json.Decoder, salida *strings.Builder) error {
	token, err := dec.Token()
	if err != nil {
		return invalido("%v", err)
	}
	return copiarToken(dec, token, salida)
}

func copiarToken(dec *json.Decoder, token json.Token, salida *strings.Builder) error {
	switch v := token.(type) {
	case nil:
		salida.WriteString("null")
	case bool:
		salida.WriteString(strconv.FormatBool(v))
	case string:
		escribirCadena(salida, norm.NFC.String(v))
	case json.Number:
		return escribirNumero(salida, v.String())
	case json.Delim:
		if v == '[' {
			return copiarArreglo(dec, salida)
		}
		return copiarObjeto(dec, salida)
	}
	return nil
}

func copiarArreglo(dec *json.Decoder, salida *strings.Builder) error {
	salida.WriteByte('[')
	for primero := true; dec.More(); primero = false {
		if !primero {
			salida.WriteByte(',')
		}
		if err := copiarValor(dec, salida); err != nil {
			return err
		}
	}
	if _, err := dec.Token(); err != nil {
		return invalido("%v", err)
	}
	salida.WriteByte(']')
	return nil
}

func copiarObjeto(dec *json.Decoder, salida *strings.Builder) error {
	valores := map[string]string{}
	for dec.More() {
		token, err := dec.Token()
		if err != nil {
			return invalido("%v", err)
		}
		clave := norm.NFC.String(token.(string))
		if _, repetida := valores[clave]; repetida {
			return invalido("clave duplicada %q", clave)
		}
		var valor strings.Builder
		if err := copiarValor(dec, &valor); err != nil {
			return err
		}
		valores[clave] = valor.String()
	}
	if _, err := dec.Token(); err != nil {
		return invalido("%v", err)
	}

	claves := make([]string, 0, len(valores))
	for clave := range valores {
		claves = append(claves, clave)
	}
	sort.Slice(claves, func(i, j int) bool {
		return slices.Compare(utf16.Encode([]rune(claves[i])), utf16.Encode([]rune(claves[j]))) < 0
	})

	salida.WriteByte('{')
	for i, clave := range claves {
		if i > 0 {
			salida.WriteByte(',')
		}
		escribirCadena(salida, clave)
		salida.WriteByte(':')
		salida.WriteString(valores[clave])
	}
	salida.WriteByte('}')
	return nil
}

func escribirNumero(salida *strings.Builder, lexema string) error {
	if !entero.MatchString(lexema) || lexema == "-0" {
		return invalido("número no canónico %s", lexema)
	}
	n, err := strconv.ParseInt(lexema, 10, 64)
	if err != nil || n > maximoEntero || n < -maximoEntero {
		return invalido("entero fuera de rango %s", lexema)
	}
	salida.WriteString(lexema)
	return nil
}

// escribirCadena reproduce JSON.stringify: encoding/json no sirve porque escapa <, > y &.
func escribirCadena(salida *strings.Builder, s string) {
	salida.WriteByte('"')
	for _, r := range s {
		switch {
		case r == '"':
			salida.WriteString(`\"`)
		case r == '\\':
			salida.WriteString(`\\`)
		case r == '\b':
			salida.WriteString(`\b`)
		case r == '\f':
			salida.WriteString(`\f`)
		case r == '\n':
			salida.WriteString(`\n`)
		case r == '\r':
			salida.WriteString(`\r`)
		case r == '\t':
			salida.WriteString(`\t`)
		case r < 0x20:
			fmt.Fprintf(salida, `\u%04x`, r)
		default:
			salida.WriteRune(r)
		}
	}
	salida.WriteByte('"')
}
