// Package httpx agrupa utilidades HTTP mínimas compartidas por los servicios.
package httpx

import (
	"encoding/json"
	"net/http"
)

func JSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func Err(w http.ResponseWriter, code int, msg string) {
	JSON(w, code, map[string]string{"error": msg})
}

// CORS permite que la dApp (otro origen, localhost:3000) llame a la API desde el navegador.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
