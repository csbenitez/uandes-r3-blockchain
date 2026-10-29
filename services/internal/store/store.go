// Package store persiste los eventos indexados en SQLite (driver Go puro, sin CGO).
package store

import (
	"database/sql"

	_ "modernc.org/sqlite"
)

type Event struct {
	ID          uint64 `json:"id"`
	DocHash     string `json:"docHash"`
	Issuer      string `json:"issuer"`
	Kind        string `json:"kind"`
	URI         string `json:"uri"`
	Timestamp   uint64 `json:"timestamp"`
	BlockNumber uint64 `json:"blockNumber"`
	TxHash      string `json:"txHash"`
	LogIndex    uint   `json:"logIndex"`
}

type Store struct{ db *sql.DB }

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS events (
		tx_hash TEXT NOT NULL, log_index INTEGER NOT NULL,
		id INTEGER, doc_hash TEXT, issuer TEXT, kind TEXT, uri TEXT,
		timestamp INTEGER, block_number INTEGER,
		PRIMARY KEY (tx_hash, log_index));
		CREATE INDEX IF NOT EXISTS idx_doc ON events(doc_hash);
		CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER);`)
	return &Store{db}, err
}

// Insert es idempotente: la reconexión o un backfill repetido no duplican filas.
func (s *Store) Insert(e Event) error {
	_, err := s.db.Exec(`INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?,?,?)`,
		e.TxHash, e.LogIndex, e.ID, e.DocHash, e.Issuer, e.Kind, e.URI, e.Timestamp, e.BlockNumber)
	return err
}

func (s *Store) List(limit int) ([]Event, error) {
	return s.query(`SELECT id,doc_hash,issuer,kind,uri,timestamp,block_number,tx_hash,log_index FROM events ORDER BY block_number DESC, log_index DESC LIMIT ?`, limit)
}

func (s *Store) ByHash(h string) ([]Event, error) {
	return s.query(`SELECT id,doc_hash,issuer,kind,uri,timestamp,block_number,tx_hash,log_index FROM events WHERE doc_hash=? ORDER BY block_number`, h)
}

// LastBlock devuelve el último bloque procesado (0 si no hay).
func (s *Store) LastBlock() uint64 {
	var v sql.NullInt64
	_ = s.db.QueryRow(`SELECT MAX(block_number) FROM events`).Scan(&v)
	return uint64(v.Int64)
}

func (s *Store) query(q string, args ...any) ([]Event, error) {
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Event{}
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.DocHash, &e.Issuer, &e.Kind, &e.URI, &e.Timestamp, &e.BlockNumber, &e.TxHash, &e.LogIndex); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
