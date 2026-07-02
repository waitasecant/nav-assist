// Package adb manages the adb reverse tunnel automatically.
// It polls for connected devices and re-establishes the tunnel on reconnect.
// All operations are best-effort: if adb is not on PATH the package does nothing.
package adb

import (
	"context"
	"log/slog"
	"os/exec"
	"strings"
	"time"
)

const pollInterval = 3 * time.Second

// WatchAndReverse starts a goroutine that maintains an adb reverse tunnel for
// the given port. It returns immediately if adb is not on PATH. The goroutine
// runs until ctx is cancelled.
func WatchAndReverse(ctx context.Context, port string) {
	if _, err := exec.LookPath("adb"); err != nil {
		slog.Info("adb not found on PATH, USB tunnel auto-setup skipped")
		return
	}

	// Attempt once at startup in case a device is already connected.
	if hasDevice() {
		reverse(port)
	}

	go func() {
		ticker := time.NewTicker(pollInterval)
		defer ticker.Stop()
		wasConnected := hasDevice()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				connected := hasDevice()
				if connected && !wasConnected {
					slog.Info("adb device connected, establishing reverse tunnel", "port", port)
					reverse(port)
				}
				wasConnected = connected
			}
		}
	}()
}

// hasDevice returns true if at least one device is in "device" state.
func hasDevice() bool {
	out, err := exec.Command("adb", "devices").Output()
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasSuffix(line, "\tdevice") {
			return true
		}
	}
	return false
}

// reverse runs adb reverse tcp:<port> tcp:<port>.
func reverse(port string) {
	spec := "tcp:" + port
	out, err := exec.Command("adb", "reverse", spec, spec).CombinedOutput()
	if err != nil {
		slog.Warn("adb reverse failed", "err", err, "output", strings.TrimSpace(string(out)))
		return
	}
	slog.Info("adb reverse established", "port", port)
}
