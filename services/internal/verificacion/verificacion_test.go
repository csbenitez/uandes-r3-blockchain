package verificacion

import (
	"context"
	"errors"
	"testing"

	"taller/internal/almacen"
	"taller/internal/huella"
)

const idPrueba = "FAC-2026-10-0000001"

type cadenaFalsa struct {
	huellas map[string]string
	falla   error
}

func (c *cadenaFalsa) HuellaDe(_ context.Context, id string) (string, error) {
	return c.huellas[id], c.falla
}

func (c *cadenaFalsa) TxDe(context.Context, string) (string, error) { return "0xabc", nil }

type documentosFalsos map[string][]byte

func (d documentosFalsos) Leer(id, extension string) ([]byte, error) {
	if b, ok := d[extension]; ok {
		return b, nil
	}
	return nil, almacen.ErrAusente
}

func escenario(t *testing.T) (*Verificador, documentosFalsos) {
	t.Helper()
	pdf := []byte("%PDF sintetico")
	texto := []byte(`{"idNegocio":"` + idPrueba + `","pdfSha256":"` + huella.Sha256Hex(pdf) + `","total":100}`)
	h, err := huella.HuellaDeFactura(texto)
	if err != nil {
		t.Fatal(err)
	}
	docs := documentosFalsos{"json": texto, "pdf": pdf}
	cadena := &cadenaFalsa{huellas: map[string]string{huella.IDDeFactura(idPrueba): h}}
	return &Verificador{Consulta: cadena, Documentos: docs}, docs
}

func comprobar(t *testing.T, v *Verificador, resultado, motivo string) {
	t.Helper()
	r, err := v.Verificar(context.Background(), idPrueba)
	if err != nil {
		t.Fatal(err)
	}
	if r.Resultado != resultado || r.Motivo != motivo {
		t.Fatalf("obtuve %s/%s, esperaba %s/%s", r.Resultado, r.Motivo, resultado, motivo)
	}
}

func TestIntegra(t *testing.T) {
	v, _ := escenario(t)
	comprobar(t, v, Integra, "coincide")
}

func TestVarianteEquivalenteSigueIntegra(t *testing.T) {
	v, docs := escenario(t)
	var valor = string(docs["json"])
	docs["json"] = []byte("{\n  " + valor[1:len(valor)-1] + "\n}")
	comprobar(t, v, Integra, "coincide")
}

func TestNoAnclada(t *testing.T) {
	v, _ := escenario(t)
	v.Consulta = &cadenaFalsa{}
	comprobar(t, v, NoAnclada, "sin_registro_en_cadena")
}

func TestHuellaDistinta(t *testing.T) {
	v, docs := escenario(t)
	docs["json"] = []byte(`{"total":101}`)
	comprobar(t, v, Alterada, "huella_distinta")
}

func TestNoCanonicalizable(t *testing.T) {
	v, docs := escenario(t)
	docs["json"] = []byte(`{"total":1.5}`)
	comprobar(t, v, Alterada, "json_no_canonicalizable")
}

func TestDocumentoAusente(t *testing.T) {
	v, docs := escenario(t)
	delete(docs, "json")
	comprobar(t, v, Alterada, "documento_ausente")
}

func TestPdfDistinto(t *testing.T) {
	v, docs := escenario(t)
	docs["pdf"] = []byte("otro")
	comprobar(t, v, Alterada, "pdf_distinto")
}

func TestPdfAusente(t *testing.T) {
	v, docs := escenario(t)
	delete(docs, "pdf")
	comprobar(t, v, Alterada, "pdf_documento_ausente")
}

func TestCadenaCaidaEsError(t *testing.T) {
	v, _ := escenario(t)
	v.Consulta = &cadenaFalsa{falla: errors.New("sin conexión")}
	if _, err := v.Verificar(context.Background(), idPrueba); err == nil {
		t.Fatal("se esperaba error")
	}
}
