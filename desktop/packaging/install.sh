#!/usr/bin/env bash
# SteppePlan — portable Linux installer.
# Keeps user data in ~/.steppeplan (or $STEPPEPLAN_HOME) and never touches it.
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${STEPPEPLAN_HOME:-$HOME/.steppeplan}"
XDG_DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
PREFIX="${STEPPEPLAN_INSTALL_DIR:-$XDG_DATA/steppeplan}"
MODE="install"
PURGE=0

for arg in "$@"; do
  case "$arg" in
    --update) MODE="update" ;;
    --rollback) MODE="rollback" ;;
    --uninstall) MODE="uninstall" ;;
    --purge) PURGE=1 ;;
    --prefix=*) PREFIX="${arg#*=}" ;;
    --help|-h)
      cat <<'USAGE'
SteppePlan installer

  ./install.sh                 Установить в ~/.local/share/steppeplan
  ./install.sh --update        Обновить существующую установку
  ./install.sh --rollback      Вернуть предыдущую версию
  ./install.sh --uninstall     Удалить приложение (данные сохраняются)
  ./install.sh --uninstall --purge
                               Удалить приложение и данные ~/.steppeplan
  --prefix=/path               Другой каталог установки

После установки: команда `steppeplan`, значок в меню приложений,
MCP-команда `steppeplan-mcp`, обновление `steppeplan-update`.
USAGE
      exit 0
      ;;
    *) echo "Неизвестный аргумент: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '  %s\n' "$*"; }

if [ "$MODE" = "uninstall" ]; then
  rm -f "$HOME/.local/bin/steppeplan" "$HOME/.local/bin/steppeplan-mcp" "$HOME/.local/bin/steppeplan-update" "$HOME/.local/bin/steppeplan-uninstall" "$HOME/.local/bin/steppeplan-rollback"
  rm -f "$XDG_DATA/applications/steppeplan.desktop"
  rm -rf "$PREFIX"
  if [ "$PURGE" = "1" ]; then
    echo "Удаляю данные: $DATA_DIR"
    rm -rf "$DATA_DIR"
  else
    echo "Данные сохранены в $DATA_DIR"
  fi
  echo "SteppePlan удалён."
  exit 0
fi

if [ "$MODE" = "rollback" ]; then
  if [ ! -d "$PREFIX.prev" ]; then
    echo "Нет предыдущей версии для отката." >&2
    exit 1
  fi
  rm -rf "$PREFIX.rollback"
  mv "$PREFIX" "$PREFIX.rollback"
  mv "$PREFIX.prev" "$PREFIX"
  mv "$PREFIX.rollback" "$PREFIX.prev"
  echo "Откат выполнен. Перезапустите SteppePlan."
  exit 0
fi

if [ ! -x "$SOURCE_DIR/steppeplan" ] || [ ! -d "$SOURCE_DIR/app" ]; then
  echo "Это не похоже на дистрибутив SteppePlan." >&2
  exit 1
fi

mkdir -p "$DATA_DIR/backups" "$XDG_DATA/applications" "$HOME/.local/bin"
if [ -f "$DATA_DIR/workspace.json" ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  cp "$DATA_DIR/workspace.json" "$DATA_DIR/backups/workspace-$STAMP.json"
  log "Бэкап данных: $DATA_DIR/backups/workspace-$STAMP.json"
fi

TMP="$PREFIX.new.$$"
rm -rf "$TMP"
mkdir -p "$(dirname "$PREFIX")"
cp -a "$SOURCE_DIR/." "$TMP/"

if [ -d "$PREFIX" ]; then
  rm -rf "$PREFIX.prev"
  mv "$PREFIX" "$PREFIX.prev"
fi
mv "$TMP" "$PREFIX"

ln -sf "$PREFIX/steppeplan" "$HOME/.local/bin/steppeplan"

cat > "$HOME/.local/bin/steppeplan-mcp" <<WRAPPER
#!/bin/sh
exec "$PREFIX/node" "$PREFIX/app/mcp/server.mjs" "\$@"
WRAPPER
chmod 755 "$HOME/.local/bin/steppeplan-mcp"

cat > "$HOME/.local/bin/steppeplan-update" <<WRAPPER
#!/bin/sh
exec "$PREFIX/node" "$PREFIX/app/scripts/update.mjs" "\$@"
WRAPPER
chmod 755 "$HOME/.local/bin/steppeplan-update"

cat > "$HOME/.local/bin/steppeplan-uninstall" <<WRAPPER
#!/bin/sh
exec "$PREFIX/install.sh" --uninstall "\$@"
WRAPPER
chmod 755 "$HOME/.local/bin/steppeplan-uninstall"

cat > "$HOME/.local/bin/steppeplan-rollback" <<WRAPPER
#!/bin/sh
exec "$PREFIX/install.sh" --rollback "\$@"
WRAPPER
chmod 755 "$HOME/.local/bin/steppeplan-rollback"

cat > "$XDG_DATA/applications/steppeplan.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=SteppePlan
Comment=Граф концепций для человека и ИИ-агентов
Exec="$PREFIX/steppeplan"
Icon=$PREFIX/icon.png
Terminal=false
Categories=Office;
StartupWMClass=SteppePlan
DESKTOP
chmod 644 "$XDG_DATA/applications/steppeplan.desktop"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$XDG_DATA/applications" >/dev/null 2>&1 || true
fi

if [ "$MODE" = "update" ]; then
  log "SteppePlan обновлён. Перезапустите приложение."
else
  log "SteppePlan установлен в $PREFIX"
  log "Запуск: ~/.local/bin/steppeplan или через меню приложений"
fi
log "Данные: $DATA_DIR"
log "MCP: ~/.local/bin/steppeplan-mcp"
log "Обновления: ~/.local/bin/steppeplan-update --manifest <url>"
log "Удаление:   ~/.local/bin/steppeplan-uninstall"
log "Откат:      ~/.local/bin/steppeplan-rollback"
