package main

import (
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"taller/internal/httpx"
	"taller/internal/kms"

	"github.com/ethereum/go-ethereum/crypto"
)

func main() {
	chainID, _ := strconv.ParseInt(env("CHAIN_ID", "20261"), 10, 64)
	store, err := kms.New(env("KMS_DATA_DIR", "./kms-data"), os.Getenv("KMS_MASTER_KEY"), chainID)
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		httpx.JSON(w, 200, map[string]any{"status": "ok", "chainId": chainID})
	})

	mux.HandleFunc("GET /keys", func(w http.ResponseWriter, r *http.Request) {
		l, _ := store.List()
		httpx.JSON(w, 200, l)
	})

	mux.HandleFunc("POST /keys", func(w http.ResponseWriter, r *http.Request) {
		info, err := store.Create()
		if err != nil {
			httpx.Err(w, 500, err.Error())
			return
		}
		httpx.JSON(w, 201, info)
	})

	// Solo para el taller: cargar una cuenta prefinanciada del genesis. Un HSM real NO permite importar.
	mux.HandleFunc("POST /keys/import", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			PrivateKey string `json:"privateKey"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			httpx.Err(w, 400, "JSON inválido")
			return
		}
		info, err := store.Import(in.PrivateKey)
		if err != nil {
			httpx.Err(w, 400, err.Error())
			return
		}
		httpx.JSON(w, 201, info)
	})

	mux.HandleFunc("GET /keys/{id}", func(w http.ResponseWriter, r *http.Request) {
		info, err := store.Get(r.PathValue("id"))
		if err != nil {
			httpx.Err(w, 404, err.Error())
			return
		}
		httpx.JSON(w, 200, info)
	})

	// Firma un digest de 32 bytes, o un "message" (se le aplica el prefijo EIP-191 como personal_sign).
	mux.HandleFunc("POST /keys/{id}/sign", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Digest  string `json:"digest"`
			Message string `json:"message"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			httpx.Err(w, 400, "JSON inválido")
			return
		}
		digest, err := digestOf(in.Digest, in.Message)
		if err != nil {
			httpx.Err(w, 400, err.Error())
			return
		}
		sig, err := store.SignDigest(r.PathValue("id"), digest)
		if err != nil {
			httpx.Err(w, 400, err.Error())
			return
		}
		httpx.JSON(w, 200, map[string]any{"digest": "0x" + hex.EncodeToString(digest), "signature": sig})
	})

	mux.HandleFunc("POST /keys/{id}/sign-tx", func(w http.ResponseWriter, r *http.Request) {
		var in kms.TxRequest
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			httpx.Err(w, 400, "JSON inválido")
			return
		}
		raw, hash, err := store.SignTx(r.PathValue("id"), in)
		if err != nil {
			httpx.Err(w, 400, err.Error())
			return
		}
		httpx.JSON(w, 200, map[string]string{"rawTransaction": raw, "txHash": hash})
	})

	// Recupera quién firmó (ecrecover). Sirve igual para firmas del KMS que de Metamask.
	mux.HandleFunc("POST /verify", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Digest    string `json:"digest"`
			Message   string `json:"message"`
			Signature string `json:"signature"`
			Address   string `json:"address"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			httpx.Err(w, 400, "JSON inválido")
			return
		}
		digest, err := digestOf(in.Digest, in.Message)
		if err != nil {
			httpx.Err(w, 400, err.Error())
			return
		}
		sig, err := hex.DecodeString(strings.TrimPrefix(in.Signature, "0x"))
		if err != nil {
			httpx.Err(w, 400, "firma no es hex")
			return
		}
		addr, err := kms.Recover(digest, sig)
		if err != nil {
			httpx.Err(w, 400, err.Error())
			return
		}
		httpx.JSON(w, 200, map[string]any{
			"recovered": addr.Hex(),
			"valid":     in.Address == "" || strings.EqualFold(in.Address, addr.Hex()),
		})
	})

	log.Println("KMS simulado escuchando en :7070 (chainId", chainID, ")")
	log.Fatal(http.ListenAndServe(":7070", httpx.CORS(mux)))
}

func digestOf(digestHex, msg string) ([]byte, error) {
	if msg != "" {
		return kms.PersonalHash([]byte(msg)), nil
	}
	d, err := hex.DecodeString(strings.TrimPrefix(digestHex, "0x"))
	if err != nil || len(d) != 32 {
		return nil, errBadDigest
	}
	return d, nil
}

type strErr string

func (e strErr) Error() string { return string(e) }

const errBadDigest = strErr("envía 'message' o un 'digest' de 32 bytes en hex")

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

var _ = crypto.Keccak256
