// Indexador: escucha EventRegistered en la red Besu, lo guarda en SQLite y lo expone por REST.
// También ofrece POST /register, que firma con el KMS (el servicio nunca ve una llave privada).
package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"taller/internal/httpx"
	"taller/internal/store"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

type deployment struct {
	DeployBlock   uint64 `json:"deployBlock"`
	EventRegistry struct {
		Address string          `json:"address"`
		ABI     json.RawMessage `json:"abi"`
	} `json:"EventRegistry"`
}

type app struct {
	db       *store.Store
	httpURL  string
	wsURLs   []string
	kmsURL   string
	chainID  *big.Int
	contract common.Address
	abi      abi.ABI
	from     uint64
	status   struct {
		ws        string
		lastBlock uint64
	}
}

func main() {
	chain, _ := strconv.ParseInt(env("CHAIN_ID", "20261"), 10, 64)
	db, err := store.Open(env("DB_PATH", "./events.db"))
	if err != nil {
		log.Fatal(err)
	}
	a := &app{
		db:      db,
		httpURL: env("RPC_HTTP_URL", "http://localhost:8545"),
		wsURLs:  strings.Split(env("RPC_WS_URLS", "ws://localhost:8546"), ","),
		kmsURL:  env("KMS_URL", "http://localhost:7070"),
		chainID: big.NewInt(chain),
	}

	a.waitDeployment(env("DEPLOYMENT_FILE", "../deployments/besu.json"))
	go a.run()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", a.health)
	mux.HandleFunc("GET /events", func(w http.ResponseWriter, r *http.Request) {
		ev, err := db.List(200)
		reply(w, ev, err)
	})
	mux.HandleFunc("GET /events/{hash}", func(w http.ResponseWriter, r *http.Request) {
		ev, err := db.ByHash(strings.ToLower(r.PathValue("hash")))
		reply(w, ev, err)
	})
	mux.HandleFunc("POST /register", a.register)
	log.Println("Indexador escuchando en :8081")
	log.Fatal(http.ListenAndServe(":8081", httpx.CORS(mux)))
}

// waitDeployment espera a que `hardhat run deploy.js` escriba deployments/besu.json.
func (a *app) waitDeployment(path string) {
	for {
		b, err := os.ReadFile(path)
		if err == nil {
			var d deployment
			if json.Unmarshal(b, &d) == nil && d.EventRegistry.Address != "" {
				a.contract = common.HexToAddress(d.EventRegistry.Address)
				a.abi, err = abi.JSON(bytes.NewReader(d.EventRegistry.ABI))
				if err != nil {
					log.Fatal(err)
				}
				a.from = d.DeployBlock
				log.Println("contrato:", a.contract.Hex(), "desde bloque", a.from)
				return
			}
		}
		log.Println("esperando", path, "(ejecuta el deploy)...")
		time.Sleep(3 * time.Second)
	}
}

// run: backfill por HTTP y luego suscripción WS; si falla rota al siguiente nodo (failover).
func (a *app) run() {
	for i := 0; ; i++ {
		url := a.wsURLs[i%len(a.wsURLs)]
		if err := a.session(url); err != nil {
			log.Println("sesión terminó:", err, "- reintento en 3s")
		}
		a.status.ws = "desconectado"
		time.Sleep(3 * time.Second)
	}
}

func (a *app) session(wsURL string) error {
	ctx := context.Background()
	c, err := ethclient.DialContext(ctx, wsURL)
	if err != nil {
		return err
	}
	defer c.Close()

	// Retomar desde el último bloque guardado (con 1 de margen; Insert es idempotente).
	start := a.from
	if lb := a.db.LastBlock(); lb > start {
		start = lb - 1
	}
	q := ethereum.FilterQuery{Addresses: []common.Address{a.contract}, FromBlock: new(big.Int).SetUint64(start)}
	past, err := c.FilterLogs(ctx, q)
	if err != nil {
		return err
	}
	for _, l := range past {
		a.handle(l)
	}

	logs := make(chan types.Log, 64)
	sub, err := c.SubscribeFilterLogs(ctx, ethereum.FilterQuery{Addresses: q.Addresses}, logs)
	if err != nil {
		return err
	}
	defer sub.Unsubscribe()
	a.status.ws = wsURL
	log.Println("suscrito a", wsURL, "- backfill:", len(past), "eventos")
	for {
		select {
		case l := <-logs:
			a.handle(l)
		case err := <-sub.Err():
			return err
		}
	}
}

func (a *app) handle(l types.Log) {
	if len(l.Topics) < 4 || l.Topics[0] != a.abi.Events["EventRegistered"].ID {
		return
	}
	vals, err := a.abi.Unpack("EventRegistered", l.Data)
	if err != nil || len(vals) < 3 {
		log.Println("decodificando log:", err)
		return
	}
	e := store.Event{
		ID:          new(big.Int).SetBytes(l.Topics[1].Bytes()).Uint64(),
		DocHash:     strings.ToLower(l.Topics[2].Hex()),
		Issuer:      common.BytesToAddress(l.Topics[3].Bytes()).Hex(),
		Kind:        vals[0].(string),
		URI:         vals[1].(string),
		Timestamp:   vals[2].(uint64),
		BlockNumber: l.BlockNumber,
		TxHash:      l.TxHash.Hex(),
		LogIndex:    l.Index,
	}
	if err := a.db.Insert(e); err != nil {
		log.Println("guardando:", err)
		return
	}
	a.status.lastBlock = l.BlockNumber
	log.Printf("evento #%d %s (bloque %d)", e.ID, e.DocHash, e.BlockNumber)
}

func (a *app) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	out := map[string]any{"ws": a.status.ws, "contract": a.contract.Hex(), "lastIndexedBlock": a.db.LastBlock()}
	if c, err := ethclient.DialContext(ctx, a.httpURL); err == nil {
		defer c.Close()
		if n, err := c.BlockNumber(ctx); err == nil {
			out["chainBlock"] = n
		}
		var peers string
		if c.Client().CallContext(ctx, &peers, "net_peerCount") == nil {
			out["peers"] = peers
		}
	}
	httpx.JSON(w, 200, out)
}

// register arma la tx, la firma en el KMS y la envía. Flujo: backend -> KMS -> cadena.
func (a *app) register(w http.ResponseWriter, r *http.Request) {
	var in struct {
		KeyID   string `json:"keyId"`
		Content string `json:"content"` // se hashea aquí; o bien envía docHash ya calculado
		DocHash string `json:"docHash"`
		Kind    string `json:"kind"`
		URI     string `json:"uri"`
	}
	if json.NewDecoder(r.Body).Decode(&in) != nil || in.KeyID == "" {
		httpx.Err(w, 400, "se requiere keyId y content o docHash")
		return
	}
	var h common.Hash
	if in.DocHash != "" {
		h = common.HexToHash(in.DocHash)
	} else {
		h = crypto.Keccak256Hash([]byte(in.Content))
	}
	ctx := r.Context()

	var key struct{ Address string }
	if err := getJSON(a.kmsURL+"/keys/"+in.KeyID, &key); err != nil {
		httpx.Err(w, 502, "KMS: "+err.Error())
		return
	}
	c, err := ethclient.DialContext(ctx, a.httpURL)
	if err != nil {
		httpx.Err(w, 502, err.Error())
		return
	}
	defer c.Close()
	nonce, err := c.PendingNonceAt(ctx, common.HexToAddress(key.Address))
	if err != nil {
		httpx.Err(w, 502, err.Error())
		return
	}
	data, err := a.abi.Pack("registerEvent", h, in.Kind, in.URI)
	if err != nil {
		httpx.Err(w, 400, err.Error())
		return
	}
	var signed struct {
		RawTransaction string `json:"rawTransaction"`
		TxHash         string `json:"txHash"`
	}
	req := map[string]any{"nonce": nonce, "to": a.contract.Hex(), "gas": 500000, "gasPrice": "0", "data": "0x" + hex.EncodeToString(data)}
	if err := postJSON(a.kmsURL+"/keys/"+in.KeyID+"/sign-tx", req, &signed); err != nil {
		httpx.Err(w, 502, "KMS: "+err.Error())
		return
	}
	var tx types.Transaction
	raw, _ := hex.DecodeString(strings.TrimPrefix(signed.RawTransaction, "0x"))
	if err := tx.UnmarshalBinary(raw); err != nil {
		httpx.Err(w, 500, err.Error())
		return
	}
	if err := c.SendTransaction(ctx, &tx); err != nil {
		httpx.Err(w, 502, "nodo rechazó la tx: "+err.Error())
		return
	}
	httpx.JSON(w, 202, map[string]string{"txHash": tx.Hash().Hex(), "docHash": h.Hex(), "signer": key.Address})
}

func reply(w http.ResponseWriter, v any, err error) {
	if err != nil {
		httpx.Err(w, 500, err.Error())
		return
	}
	httpx.JSON(w, 200, v)
}

func getJSON(url string, out any) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func postJSON(url string, body, out any) error {
	b, _ := json.Marshal(body)
	resp, err := http.Post(url, "application/json", bytes.NewReader(b))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
