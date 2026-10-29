package kms

import (
	"encoding/hex"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

const mk = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func TestSignAndRecover(t *testing.T) {
	s, err := New(t.TempDir(), mk, 20261)
	if err != nil {
		t.Fatal(err)
	}
	info, _ := s.Create()
	digest := PersonalHash([]byte("hola consorcio"))
	sig, err := s.SignDigest(info.ID, digest)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := hex.DecodeString(strings.TrimPrefix(sig.Signature, "0x"))
	addr, err := Recover(digest, raw)
	if err != nil || addr.Hex() != info.Address {
		t.Fatalf("recuperó %s, esperaba %s (%v)", addr.Hex(), info.Address, err)
	}
}

func TestEncryptionRoundTripAndWrongKey(t *testing.T) {
	dir := t.TempDir()
	s, _ := New(dir, mk, 1)
	info, _ := s.Import("8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63")
	if !strings.EqualFold(info.Address, "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73") {
		t.Fatalf("dirección inesperada %s", info.Address)
	}
	other, _ := New(dir, strings.Repeat("ab", 32), 1)
	if _, err := other.SignDigest(info.ID, make([]byte, 32)); err == nil {
		t.Fatal("una llave maestra distinta no debería poder firmar")
	}
}

func TestSignTx(t *testing.T) {
	s, _ := New(t.TempDir(), mk, 20261)
	info, _ := s.Create()
	raw, _, err := s.SignTx(info.ID, TxRequest{Nonce: 1, To: "0x000000000000000000000000000000000000dead", Gas: 21000})
	if err != nil {
		t.Fatal(err)
	}
	var tx types.Transaction
	b, _ := hex.DecodeString(strings.TrimPrefix(raw, "0x"))
	if err := tx.UnmarshalBinary(b); err != nil {
		t.Fatal(err)
	}
	from, _ := types.Sender(types.NewEIP155Signer(tx.ChainId()), &tx)
	if from != common.HexToAddress(info.Address) || tx.ChainId().Int64() != 20261 {
		t.Fatalf("from=%s chain=%v", from, tx.ChainId())
	}
	_ = crypto.Keccak256
}
