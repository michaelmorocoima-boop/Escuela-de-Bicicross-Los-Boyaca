#!/usr/bin/env bash
# ==============================================================================
# Script de Respaldo Automatizado — Escuela de Bicicross Los Boyacá
# Genera copias de seguridad comprimidas con timestamp y rotación automática.
# ==============================================================================

set -euo pipefail

PROYECTO_DIR="/Users/macos/proyectos/escuela-bicicross-los-boyaca"
DESTINO_DIR="/Users/macos/backups/escuela-bicicross-los-boyaca"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ARCHIVO_BACKUP="backup_boyaca_bmx_${TIMESTAMP}.tar.gz"

mkdir -p "${DESTINO_DIR}"

echo "🚲 [BMX BACKUP] Iniciando respaldo de la Escuela de Bicicross Los Boyacá..."
echo "📁 Directorio origen:  ${PROYECTO_DIR}"
echo "📦 Archivo de destino: ${DESTINO_DIR}/${ARCHIVO_BACKUP}"

# Crear respaldo excluyendo archivos innecesarios
tar --exclude='.git' \
    --exclude='.DS_Store' \
    --exclude='node_modules' \
    --exclude='backups' \
    -czf "${DESTINO_DIR}/${ARCHIVO_BACKUP}" \
    -C "${PROYECTO_DIR}" .

PESO=$(ls -lh "${DESTINO_DIR}/${ARCHIVO_BACKUP}" | awk '{print $5}')
TOTAL_ARCHIVOS=$(tar -tzf "${DESTINO_DIR}/${ARCHIVO_BACKUP}" | wc -l | tr -d ' ')

echo "✅ [BMX BACKUP] Respaldo completado exitosamente!"
echo "   • Tamaño:   ${PESO}"
echo "   • Archivos: ${TOTAL_ARCHIVOS}"
echo "   • Ubicación: ${DESTINO_DIR}/${ARCHIVO_BACKUP}"

# Rotación de respaldos: conservar los últimos 15 respaldos
cd "${DESTINO_DIR}"
BACKUPS_COUNT=$(ls -1t backup_boyaca_bmx_*.tar.gz 2>/dev/null | wc -l | tr -d ' ')
if [ "${BACKUPS_COUNT}" -gt 15 ]; then
  echo "🧹 Rotando respaldos antiguos (conservando los 15 más recientes)..."
  ls -1t backup_boyaca_bmx_*.tar.gz | tail -n +16 | xargs rm -f
fi

echo "🏁 Total de respaldos almacenados: $(ls -1 backup_boyaca_bmx_*.tar.gz 2>/dev/null | wc -l | tr -d ' ')"
