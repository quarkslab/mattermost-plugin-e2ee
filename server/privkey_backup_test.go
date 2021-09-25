package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func Test_backup_firstNotRevoked(t *testing.T) {
	tassert := assert.New(t)
	resp := `
info:1:3
pub:79885E33920840DA65EEE2013F3519E42C47C59D:1:2048:1567427747::r
uid:Roger <roger@quarkslab.com>
pub:F407961CACD217A1C246F0C286B4406B454ABAC4:1:4096:1611760459::
uid:Roger <roger@quarkslab.com>
pub:AD353BC4362B6F73870660B1F59254FCF963F61C:1:3072:1611758351::r
uid:Roger <roger@quarkslab.com>
`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, err := w.Write([]byte(resp))
		tassert.Nil(err)
	}))

	keyid, err := GpgServerExtractFirstNotRevokedID(ts.URL, "roger@quarkslab.com")
	tassert.Nil(err)
	tassert.Equal("F407961CACD217A1C246F0C286B4406B454ABAC4", keyid)
}

func Test_backup_firstNotRevokedInvalid(t *testing.T) {
	tassert := assert.New(t)
	resp := `
info:1:3
pub:1:2048:1567427747::r
uid:Roger <roger@quarkslab.com>
`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, err := w.Write([]byte(resp))
		tassert.Nil(err)
	}))

	keyid, err := GpgServerExtractFirstNotRevokedID(ts.URL, "roger@quarkslab.com")
	tassert.NotNil(err)
	tassert.Equal("", keyid)
}
