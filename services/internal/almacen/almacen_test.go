package almacen

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func preparar(t *testing.T) (*Almacen, string, []byte) {
	t.Helper()
	dir := t.TempDir()
	llave := bytes.Repeat([]byte{7}, 32)
	a, err := Abrir(dir, llave)
	if err != nil {
		t.Fatal(err)
	}
	return a, dir, llave
}

func escribir(t *testing.T, dir string, llave, claro []byte) string {
	t.Helper()
	bloque, _ := aes.NewCipher(llave)
	aead, _ := cipher.NewGCM(bloque)
	nonce := bytes.Repeat([]byte{1}, largoNonce)
	sellado := aead.Seal(nil, nonce, claro, nil)
	cuerpo, etiqueta := sellado[:len(sellado)-largoEtiqueta], sellado[len(sellado)-largoEtiqueta:]
	ruta := filepath.Join(dir, "FAC-1.json.enc")
	if err := os.WriteFile(ruta, bytes.Join([][]byte{nonce, etiqueta, cuerpo}, nil), 0o644); err != nil {
		t.Fatal(err)
	}
	return ruta
}

func TestLeer(t *testing.T) {
	a, dir, llave := preparar(t)
	escribir(t, dir, llave, []byte("hola"))
	claro, err := a.Leer("FAC-1", "json")
	if err != nil || string(claro) != "hola" {
		t.Fatalf("claro=%q err=%v", claro, err)
	}
}

func TestDocumentoAusente(t *testing.T) {
	a, _, _ := preparar(t)
	if _, err := a.Leer("FAC-9", "json"); !errors.Is(err, ErrAusente) {
		t.Fatalf("err=%v", err)
	}
}

func TestCifradoCorrupto(t *testing.T) {
	a, dir, llave := preparar(t)
	ruta := escribir(t, dir, llave, []byte("hola"))
	crudo, _ := os.ReadFile(ruta)
	crudo[len(crudo)-1] ^= 1
	if err := os.WriteFile(ruta, crudo, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Leer("FAC-1", "json"); !errors.Is(err, ErrCifrado) {
		t.Fatalf("err=%v", err)
	}
}
