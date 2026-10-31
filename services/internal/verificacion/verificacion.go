// Package verificacion es el núcleo de invoice-verifier: compara el documento off-chain con la huella anclada.
package verificacion

import (
	"context"
	"encoding/json"
	"errors"

	"taller/internal/almacen"
	"taller/internal/huella"
)

const (
	Integra   = "ÍNTEGRA"
	Alterada  = "ALTERADA"
	NoAnclada = "NO ANCLADA"
)

// ConsultaAnclaje es el puerto hacia la cadena. Hoy lo implementa el contrato;
// cuando exista settlement-ledger basta otra implementación con estos métodos.
type ConsultaAnclaje interface {
	// HuellaDe devuelve la huella vigente con prefijo 0x, o "" si no hay registro.
	HuellaDe(ctx context.Context, facturaID string) (string, error)
	// TxDe devuelve la transacción de anclaje.
	TxDe(ctx context.Context, facturaID string) (string, error)
}

// Documentos es el puerto hacia el almacenamiento off-chain.
type Documentos interface {
	Leer(id, extension string) ([]byte, error)
}

type Evidencia struct {
	FacturaID     string `json:"facturaId"`
	HashCalculado string `json:"hashCalculado"`
	HashCadena    string `json:"hashCadena"`
	TxHash        string `json:"txHash"`
}

type Verificacion struct {
	IDNegocio string    `json:"idNegocio"`
	Resultado string    `json:"resultado"`
	Motivo    string    `json:"motivo"`
	Evidencia Evidencia `json:"evidencia"`
}

type Verificador struct {
	Consulta   ConsultaAnclaje
	Documentos Documentos
}

// Verificar devuelve error solo si la cadena no responde: sin ella no hay contra qué comparar.
func (v *Verificador) Verificar(ctx context.Context, idNegocio string) (*Verificacion, error) {
	facturaID := huella.IDDeFactura(idNegocio)
	r := &Verificacion{IDNegocio: idNegocio, Evidencia: Evidencia{FacturaID: facturaID}}

	enCadena, err := v.Consulta.HuellaDe(ctx, facturaID)
	if err != nil {
		return nil, err
	}
	if enCadena == "" {
		r.Resultado, r.Motivo = NoAnclada, "sin_registro_en_cadena"
		return r, nil
	}
	r.Evidencia.HashCadena = enCadena
	if r.Evidencia.TxHash, err = v.Consulta.TxDe(ctx, facturaID); err != nil {
		return nil, err
	}

	r.Resultado, r.Motivo = v.comparar(idNegocio, r)
	return r, nil
}

func (v *Verificador) comparar(idNegocio string, r *Verificacion) (string, string) {
	texto, err := v.Documentos.Leer(idNegocio, "json")
	if err != nil {
		return Alterada, motivoLectura(err, "")
	}
	r.Evidencia.HashCalculado, err = huella.HuellaDeFactura(texto)
	if err != nil {
		return Alterada, "json_no_canonicalizable"
	}
	if r.Evidencia.HashCalculado != r.Evidencia.HashCadena {
		return Alterada, "huella_distinta"
	}

	// La huella ya validó el JSON y, con él, el pdfSha256 esperado.
	var factura struct {
		PdfSha256 string `json:"pdfSha256"`
	}
	if err := json.Unmarshal(texto, &factura); err != nil {
		return Alterada, "json_no_canonicalizable"
	}
	pdf, err := v.Documentos.Leer(idNegocio, "pdf")
	if err != nil {
		return Alterada, motivoLectura(err, "pdf_")
	}
	if huella.Sha256Hex(pdf) != factura.PdfSha256 {
		return Alterada, "pdf_distinto"
	}
	return Integra, "coincide"
}

func motivoLectura(err error, prefijo string) string {
	if errors.Is(err, almacen.ErrCifrado) {
		return prefijo + almacen.ErrCifrado.Error()
	}
	return prefijo + almacen.ErrAusente.Error()
}
