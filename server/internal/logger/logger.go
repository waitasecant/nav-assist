package logger

import (
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// Logger writes hazard events to a local SQLite database.
type Logger struct {
	db   *sql.DB
	stmt *sql.Stmt
}

func New(path string) (*Logger, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS events (
		id    INTEGER PRIMARY KEY AUTOINCREMENT,
		ts    INTEGER NOT NULL,
		tier  TEXT    NOT NULL,
		label TEXT    NOT NULL,
		depth REAL    NOT NULL
	)`)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("create table: %w", err)
	}

	stmt, err := db.Prepare(`INSERT INTO events(ts,tier,label,depth) VALUES(?,?,?,?)`)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("prepare insert: %w", err)
	}

	return &Logger{db: db, stmt: stmt}, nil
}

// LogEvent records a hazard detection. Errors are intentionally silenced to
// keep the hot path clean.
func (l *Logger) LogEvent(tier, label string, depth float32) {
	_, _ = l.stmt.Exec(time.Now().UnixMilli(), tier, label, depth)
}

func (l *Logger) Close() {
	_ = l.stmt.Close()
	_ = l.db.Close()
}
