// Package almacen lee documentos off-chain cifrados con AES-256-GCM.
// Formato de cada archivo: nonce (12 bytes) + etiqueta (16 bytes) + texto cifrado.
package almacen

import (
	"crypto/aes"
	"crypto/cipher"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

const (
	largoNonce    = 12
	largoEtiqueta = 16
)

var (
	// ErrAusente indica que el documento no está en el almacén.
	ErrAusente = errors.New("documento_ausente")
	// ErrCifrado indica que el archivo no pasa la autenticación de AES-GCM.
	ErrCifrado = errors.New("cifrado_invalido")
)

type Almacen struct {
	directorio string
	aead       cipher.AEAD
}

func Abrir(directorio string, llave []byte) (*Almacen, error) {
	bloque, err := aes.NewCipher(llave)
	if err != nil {
		return nil, fmt.Errorf("llave inválida: %w", err)
	}
	aead, err := cipher.NewGCM(bloque)
	if err != nil {
		return nil, err
	}
	return &Almacen{directorio: directorio, aead: aead}, nil
}

// Leer devuelve el documento en claro.
func (a *Almacen) Leer(id, extension string) ([]byte, error) {
	crudo, err := os.ReadFile(filepath.Join(a.directorio, id+"."+extension+".enc"))
	if err != nil {
		return nil, ErrAusente
	}
	if len(crudo) < largoNonce+largoEtiqueta {
		return nil, ErrCifrado
	}
	nonce, etiqueta, cuerpo := crudo[:largoNonce], crudo[largoNonce:largoNonce+largoEtiqueta], crudo[largoNonce+largoEtiqueta:]
	claro, err := a.aead.Open(nil, nonce, append(append([]byte{}, cuerpo...), etiqueta...), nil)
	if err != nil {
		return nil, ErrCifrado
	}
	return claro, nil
}
