// Package kms simula un KMS/HSM: las llaves privadas secp256k1 se guardan cifradas
// (AES-256-GCM con una llave maestra) y NUNCA salen por la API; solo se expone firmar.
package kms

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdsa"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

var ErrNotFound = errors.New("llave no encontrada")

type KeyInfo struct {
	ID        string `json:"id"`
	Address   string `json:"address"`
	PublicKey string `json:"publicKey"`
	CreatedAt string `json:"createdAt"`
}

type stored struct {
	KeyInfo
	Nonce      string `json:"nonce"`
	Ciphertext string `json:"ciphertext"`
}

type Signature struct {
	R         string `json:"r"`
	S         string `json:"s"`
	V         int    `json:"v"` // 27/28, formato Ethereum
	Signature string `json:"signature"`
}

type Store struct {
	dir    string
	aead   cipher.AEAD
	mu     sync.Mutex
	signer types.Signer
}

// New abre (o crea) un almacén. masterKeyHex debe ser de 32 bytes en hex.
func New(dir, masterKeyHex string, chainID int64) (*Store, error) {
	mk, err := hex.DecodeString(masterKeyHex)
	if err != nil || len(mk) != 32 {
		return nil, errors.New("KMS_MASTER_KEY debe ser 32 bytes en hex (64 caracteres)")
	}
	block, err := aes.NewCipher(mk)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	return &Store{dir: dir, aead: aead, signer: types.NewEIP155Signer(big.NewInt(chainID))}, nil
}

func (s *Store) Create() (KeyInfo, error) {
	priv, err := crypto.GenerateKey()
	if err != nil {
		return KeyInfo{}, err
	}
	return s.save(priv)
}

// Import existe solo para el taller (cargar una cuenta prefinanciada). Un HSM real no lo permite.
func (s *Store) Import(privHex string) (KeyInfo, error) {
	priv, err := crypto.HexToECDSA(trim0x(privHex))
	if err != nil {
		return KeyInfo{}, err
	}
	return s.save(priv)
}

func (s *Store) save(priv *ecdsa.PrivateKey) (KeyInfo, error) {
	addr := crypto.PubkeyToAddress(priv.PublicKey)
	info := KeyInfo{
		ID:        hex.EncodeToString(addr.Bytes()[:8]),
		Address:   addr.Hex(),
		PublicKey: "0x" + hex.EncodeToString(crypto.FromECDSAPub(&priv.PublicKey)),
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return KeyInfo{}, err
	}
	ct := s.aead.Seal(nil, nonce, crypto.FromECDSA(priv), []byte(info.ID))
	b, _ := json.MarshalIndent(stored{info, hex.EncodeToString(nonce), hex.EncodeToString(ct)}, "", "  ")
	if err := os.WriteFile(s.path(info.ID), b, 0o600); err != nil {
		return KeyInfo{}, err
	}
	s.audit("create", info.ID, "")
	return info, nil
}

func (s *Store) Get(id string) (KeyInfo, error) {
	st, err := s.load(id)
	return st.KeyInfo, err
}

func (s *Store) List() ([]KeyInfo, error) {
	files, _ := filepath.Glob(filepath.Join(s.dir, "*.key.json"))
	out := []KeyInfo{}
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		var st stored
		if json.Unmarshal(b, &st) == nil {
			out = append(out, st.KeyInfo)
		}
	}
	return out, nil
}

// SignDigest firma un hash de 32 bytes (ECDSA secp256k1, v=27/28).
func (s *Store) SignDigest(id string, digest []byte) (Signature, error) {
	if len(digest) != 32 {
		return Signature{}, errors.New("el digest debe tener 32 bytes")
	}
	priv, err := s.privateKey(id)
	if err != nil {
		return Signature{}, err
	}
	sig, err := crypto.Sign(digest, priv)
	if err != nil {
		return Signature{}, err
	}
	s.audit("sign", id, "0x"+hex.EncodeToString(digest))
	return encodeSig(sig), nil
}

// TxRequest describe una transacción legacy (EIP-155) a firmar.
type TxRequest struct {
	Nonce    uint64 `json:"nonce"`
	To       string `json:"to"`
	Value    string `json:"value"` // wei, decimal
	Gas      uint64 `json:"gas"`
	GasPrice string `json:"gasPrice"`
	Data     string `json:"data"` // hex
}

func (s *Store) SignTx(id string, r TxRequest) (rawHex, txHash string, err error) {
	priv, err := s.privateKey(id)
	if err != nil {
		return "", "", err
	}
	value, ok1 := new(big.Int).SetString(orZero(r.Value), 10)
	gp, ok2 := new(big.Int).SetString(orZero(r.GasPrice), 10)
	if !ok1 || !ok2 {
		return "", "", errors.New("value/gasPrice inválidos")
	}
	data, err := hex.DecodeString(trim0x(r.Data))
	if err != nil {
		return "", "", fmt.Errorf("data: %w", err)
	}
	var to *common.Address
	if r.To != "" {
		a := common.HexToAddress(r.To)
		to = &a
	}
	tx := types.NewTx(&types.LegacyTx{Nonce: r.Nonce, To: to, Value: value, Gas: r.Gas, GasPrice: gp, Data: data})
	signed, err := types.SignTx(tx, s.signer, priv)
	if err != nil {
		return "", "", err
	}
	raw, err := signed.MarshalBinary()
	if err != nil {
		return "", "", err
	}
	s.audit("sign-tx", id, signed.Hash().Hex())
	return "0x" + hex.EncodeToString(raw), signed.Hash().Hex(), nil
}

// PersonalHash calcula el hash EIP-191 ("\x19Ethereum Signed Message:\n"+len+msg), igual que Metamask personal_sign.
func PersonalHash(msg []byte) []byte {
	return crypto.Keccak256([]byte(fmt.Sprintf("\x19Ethereum Signed Message:\n%d", len(msg))), msg)
}

// Recover devuelve la dirección que firmó digest. sig es r||s||v (65 bytes, v=27/28 o 0/1).
func Recover(digest, sig []byte) (common.Address, error) {
	if len(sig) != 65 {
		return common.Address{}, errors.New("la firma debe tener 65 bytes")
	}
	c := append([]byte{}, sig...)
	if c[64] >= 27 {
		c[64] -= 27
	}
	pub, err := crypto.SigToPub(digest, c)
	if err != nil {
		return common.Address{}, err
	}
	return crypto.PubkeyToAddress(*pub), nil
}

func (s *Store) privateKey(id string) (*ecdsa.PrivateKey, error) {
	st, err := s.load(id)
	if err != nil {
		return nil, err
	}
	nonce, _ := hex.DecodeString(st.Nonce)
	ct, _ := hex.DecodeString(st.Ciphertext)
	pt, err := s.aead.Open(nil, nonce, ct, []byte(st.ID))
	if err != nil {
		return nil, errors.New("no se pudo descifrar (llave maestra incorrecta o archivo alterado)")
	}
	return crypto.ToECDSA(pt)
}

func (s *Store) load(id string) (stored, error) {
	var st stored
	b, err := os.ReadFile(s.path(id))
	if err != nil {
		return st, ErrNotFound
	}
	return st, json.Unmarshal(b, &st)
}

func (s *Store) path(id string) string {
	return filepath.Join(s.dir, filepath.Base(id)+".key.json")
}

func (s *Store) audit(op, id, detail string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, err := os.OpenFile(filepath.Join(s.dir, "audit.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s op=%s key=%s %s\n", time.Now().UTC().Format(time.RFC3339), op, id, detail)
}

func encodeSig(sig []byte) Signature {
	v := int(sig[64]) + 27
	out := append(append([]byte{}, sig[:64]...), byte(v))
	return Signature{
		R:         "0x" + hex.EncodeToString(sig[:32]),
		S:         "0x" + hex.EncodeToString(sig[32:64]),
		V:         v,
		Signature: "0x" + hex.EncodeToString(out),
	}
}

func trim0x(s string) string {
	if len(s) >= 2 && s[:2] == "0x" {
		return s[2:]
	}
	return s
}

func orZero(s string) string {
	if s == "" {
		return "0"
	}
	return s
}
