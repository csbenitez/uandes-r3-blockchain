package huella

import (
	"encoding/json"
	"errors"
	"os"
	"testing"
)

type vectores struct {
	Validos []struct {
		Nombre   string `json:"nombre"`
		Entrada  string `json:"entrada"`
		Canonico string `json:"canonico"`
		Huella   string `json:"huella"`
	} `json:"validos"`
	Invalidos []struct {
		Nombre  string `json:"nombre"`
		Entrada string `json:"entrada"`
	} `json:"invalidos"`
	Identificadores []struct {
		Entrada   string `json:"entrada"`
		FacturaID string `json:"facturaId"`
	} `json:"identificadores"`
	Cuentas []struct {
		Nic    string `json:"nic"`
		Sal    string `json:"sal"`
		Cuenta string `json:"cuenta"`
	} `json:"cuentas"`
}

func cargar(t *testing.T) vectores {
	t.Helper()
	datos, err := os.ReadFile("../../../experimentos/e1-integridad/vectores/vectores.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectores
	if err := json.Unmarshal(datos, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestVectoresValidos(t *testing.T) {
	for _, v := range cargar(t).Validos {
		t.Run(v.Nombre, func(t *testing.T) {
			canonico, err := Canonicalizar([]byte(v.Entrada))
			if err != nil {
				t.Fatal(err)
			}
			if string(canonico) != v.Canonico {
				t.Fatalf("canónico %s, esperado %s", canonico, v.Canonico)
			}
			huella, err := HuellaDeFactura([]byte(v.Entrada))
			if err != nil {
				t.Fatal(err)
			}
			if huella != v.Huella {
				t.Fatalf("huella %s, esperada %s", huella, v.Huella)
			}
		})
	}
}

func TestVectoresInvalidos(t *testing.T) {
	for _, v := range cargar(t).Invalidos {
		t.Run(v.Nombre, func(t *testing.T) {
			if _, err := Canonicalizar([]byte(v.Entrada)); !errors.Is(err, ErrInvalido) {
				t.Fatalf("se esperaba ErrInvalido, se obtuvo %v", err)
			}
		})
	}
}

func TestIdentificadoresYCuentas(t *testing.T) {
	v := cargar(t)
	for _, c := range v.Identificadores {
		if got := IDDeFactura(c.Entrada); got != c.FacturaID {
			t.Fatalf("facturaId %s, esperado %s", got, c.FacturaID)
		}
	}
	for _, c := range v.Cuentas {
		if got := CuentaSeudonima(c.Nic, c.Sal); got != c.Cuenta {
			t.Fatalf("cuenta %s, esperada %s", got, c.Cuenta)
		}
	}
}
