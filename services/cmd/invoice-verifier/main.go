// invoice-verifier: dada una factura, recalcula su huella y la compara con la anclada en la cadena.
// Solo lee: no firma ni escribe transacciones.
package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"taller/internal/almacen"
	"taller/internal/httpx"
	"taller/internal/verificacion"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
)

const bloquesPorPagina = 1000

var idValido = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)

type despliegue struct {
	DeployBlock      uint64 `json:"deployBlock"`
	RegistroFacturas struct {
		Address string          `json:"address"`
		ABI     json.RawMessage `json:"abi"`
	} `json:"RegistroFacturas"`
}

func main() {
	llave, err := hex.DecodeString(strings.TrimPrefix(os.Getenv("LLAVE_DOCUMENTOS_HEX"), "0x"))
	if err != nil {
		log.Fatal("LLAVE_DOCUMENTOS_HEX inválida: ", err)
	}
	docs, err := almacen.Abrir(env("DATOS_DIR", "./datos"), llave)
	if err != nil {
		log.Fatal(err)
	}
	cadena, err := conectar(env("RPC_HTTP_URL", "http://localhost:8545"), env("DEPLOYMENT_FILE", "../deployments/e1.json"))
	if err != nil {
		log.Fatal(err)
	}

	m := newMetricas()
	verificador := &verificacion.Verificador{Consulta: cadena, Documentos: docs}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		bloque, err := cadena.cliente.BlockNumber(r.Context())
		if err != nil {
			httpx.Err(w, 503, "cadena: "+err.Error())
			return
		}
		httpx.JSON(w, 200, map[string]any{"status": "ok", "contrato": cadena.contrato.Hex(), "bloque": bloque})
	})
	mux.HandleFunc("GET /facturas/{id}/verificacion", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !idValido.MatchString(id) {
			httpx.Err(w, 400, "identificador inválido")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		inicio := time.Now()
		resultado, err := verificador.Verificar(ctx, id)
		if err != nil {
			m.falla()
			httpx.Err(w, 503, "cadena: "+err.Error())
			return
		}
		m.observar(resultado.Resultado, resultado.Motivo, time.Since(inicio))
		httpx.JSON(w, 200, resultado)
	})
	mux.HandleFunc("GET /metrics", m.exponer)

	puerto := env("PUERTO", "8090")
	log.Println("invoice-verifier escuchando en :" + puerto + ", contrato " + cadena.contrato.Hex())
	log.Fatal(http.ListenAndServe(":"+puerto, httpx.CORS(mux)))
}

// cadenaContrato implementa verificacion.ConsultaAnclaje. La huella se lee del contrato en cada
// consulta porque decide el resultado. El txHash solo es evidencia, así que sale de un índice
// incremental: un eth_getLogs por verificación agota el tiempo de espera de Besu a volumen real.
type cadenaContrato struct {
	cliente  *ethclient.Client
	contrato common.Address
	abi      abi.ABI

	mu        sync.Mutex
	siguiente uint64
	txs       map[string]string
}

func conectar(rpc, archivo string) (*cadenaContrato, error) {
	datos, err := os.ReadFile(archivo)
	if err != nil {
		return nil, err
	}
	var d despliegue
	if err := json.Unmarshal(datos, &d); err != nil {
		return nil, err
	}
	interfaz, err := abi.JSON(strings.NewReader(string(d.RegistroFacturas.ABI)))
	if err != nil {
		return nil, err
	}
	cliente, err := ethclient.Dial(rpc)
	if err != nil {
		return nil, err
	}
	return &cadenaContrato{
		cliente:   cliente,
		contrato:  common.HexToAddress(d.RegistroFacturas.Address),
		abi:       interfaz,
		siguiente: d.DeployBlock,
		txs:       map[string]string{},
	}, nil
}

func (c *cadenaContrato) HuellaDe(ctx context.Context, facturaID string) (string, error) {
	datos, err := c.abi.Pack("huellaDe", common.HexToHash(facturaID))
	if err != nil {
		return "", err
	}
	salida, err := c.cliente.CallContract(ctx, ethereum.CallMsg{To: &c.contrato, Data: datos}, nil)
	if err != nil {
		return "", err
	}
	if h := common.BytesToHash(salida); h != (common.Hash{}) {
		return strings.ToLower(h.Hex()), nil
	}
	return "", nil
}

func (c *cadenaContrato) TxDe(ctx context.Context, facturaID string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	clave := strings.ToLower(facturaID)
	if tx, ok := c.txs[clave]; ok {
		return tx, nil
	}
	if err := c.sincronizar(ctx); err != nil {
		return "", err
	}
	if tx, ok := c.txs[clave]; ok {
		return tx, nil
	}
	return "", errors.New("huella sin evento FacturaAnclada")
}

// sincronizar indexa los eventos nuevos por páginas, dentro del rango máximo que admite Besu.
// QBFT no reorganiza bloques, así que lo indexado no cambia. Requiere tener c.mu.
func (c *cadenaContrato) sincronizar(ctx context.Context) error {
	ultimo, err := c.cliente.BlockNumber(ctx)
	if err != nil {
		return err
	}
	for c.siguiente <= ultimo {
		hasta := min(c.siguiente+bloquesPorPagina-1, ultimo)
		logs, err := c.cliente.FilterLogs(ctx, ethereum.FilterQuery{
			FromBlock: new(big.Int).SetUint64(c.siguiente),
			ToBlock:   new(big.Int).SetUint64(hasta),
			Addresses: []common.Address{c.contrato},
			Topics:    [][]common.Hash{{c.abi.Events["FacturaAnclada"].ID}},
		})
		if err != nil {
			return err
		}
		for _, l := range logs {
			c.txs[strings.ToLower(l.Topics[1].Hex())] = l.TxHash.Hex()
		}
		c.siguiente = hasta + 1
	}
	return nil
}

// metricas expone contadores en el formato de texto de Prometheus, sin dependencias nuevas.
type metricas struct {
	mu          sync.Mutex
	resultados  map[string]uint64
	cubetas     []float64
	acumulado   []uint64
	sumaMs      float64
	observadas  uint64
	fallasDeRed uint64
}

func newMetricas() *metricas {
	cubetas := []float64{1, 2, 5, 10, 20, 50, 100, 200, 500, 1000}
	return &metricas{resultados: map[string]uint64{}, cubetas: cubetas, acumulado: make([]uint64, len(cubetas))}
}

func (m *metricas) observar(resultado, motivo string, d time.Duration) {
	ms := float64(d.Microseconds()) / 1000
	m.mu.Lock()
	defer m.mu.Unlock()
	m.resultados[fmt.Sprintf(`resultado=%q,motivo=%q`, resultado, motivo)]++
	m.observadas++
	m.sumaMs += ms
	for i, limite := range m.cubetas {
		if ms <= limite {
			m.acumulado[i]++
		}
	}
}

func (m *metricas) falla() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.fallasDeRed++
}

func (m *metricas) exponer(w http.ResponseWriter, _ *http.Request) {
	m.mu.Lock()
	defer m.mu.Unlock()
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")

	fmt.Fprintln(w, "# HELP invoice_verifier_verificaciones_total Verificaciones por resultado y motivo.")
	fmt.Fprintln(w, "# TYPE invoice_verifier_verificaciones_total counter")
	etiquetas := make([]string, 0, len(m.resultados))
	for e := range m.resultados {
		etiquetas = append(etiquetas, e)
	}
	sort.Strings(etiquetas)
	for _, e := range etiquetas {
		fmt.Fprintf(w, "invoice_verifier_verificaciones_total{%s} %d\n", e, m.resultados[e])
	}

	fmt.Fprintln(w, "# HELP invoice_verifier_fallas_cadena_total Verificaciones que no pudieron consultar la cadena.")
	fmt.Fprintln(w, "# TYPE invoice_verifier_fallas_cadena_total counter")
	fmt.Fprintf(w, "invoice_verifier_fallas_cadena_total %d\n", m.fallasDeRed)

	fmt.Fprintln(w, "# HELP invoice_verifier_duracion_ms Duración de cada verificación en milisegundos.")
	fmt.Fprintln(w, "# TYPE invoice_verifier_duracion_ms histogram")
	for i, limite := range m.cubetas {
		fmt.Fprintf(w, "invoice_verifier_duracion_ms_bucket{le=\"%g\"} %d\n", limite, m.acumulado[i])
	}
	fmt.Fprintf(w, "invoice_verifier_duracion_ms_bucket{le=\"+Inf\"} %d\n", m.observadas)
	fmt.Fprintf(w, "invoice_verifier_duracion_ms_sum %f\n", m.sumaMs)
	fmt.Fprintf(w, "invoice_verifier_duracion_ms_count %d\n", m.observadas)
}

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
