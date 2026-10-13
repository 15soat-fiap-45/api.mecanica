#!/bin/bash

# Script para exportar diagramas PlantUML para PNG e SVG
# Uso: ./export-diagrams.sh [png|svg|all]

FORMAT=${1:-all}
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
OUTPUT_DIR="$SCRIPT_DIR/generated"

# Criar diretório de saída
mkdir -p "$OUTPUT_DIR"

echo "🎨 Exportando diagramas PlantUML..."
echo "📁 Destino: $OUTPUT_DIR"
echo ""

# Verificar se plantuml-cli está instalado
if ! command -v npx &> /dev/null; then
    echo "❌ npx não encontrado. Instale com: npm install -D @planttext/plantuml-cli"
    exit 1
fi

# Função para exportar um arquivo
export_file() {
    local file="$1"
    local format="$2"
    local filename=$(basename "$file" .puml)

    if [ "$format" = "png" ] || [ "$format" = "all" ]; then
        echo "  📝 → 🖼️  PNG: $filename"
        npx plantuml -tpng "$file" -o "$OUTPUT_DIR" 2>/dev/null || echo "    ⚠️  Erro ao exportar PNG"
    fi

    if [ "$format" = "svg" ] || [ "$format" = "all" ]; then
        echo "  📝 → 🌐 SVG: $filename"
        npx plantuml -tsvg "$file" -o "$OUTPUT_DIR" 2>/dev/null || echo "    ⚠️  Erro ao exportar SVG"
    fi
}

# Exportar diagramas principais
echo "🌐 Diagramas C4:"
export_file "$SCRIPT_DIR/c4-context.puml" "$FORMAT"
export_file "$SCRIPT_DIR/c4-containers.puml" "$FORMAT"
export_file "$SCRIPT_DIR/c4-components.puml" "$FORMAT"

echo ""
echo "🗄️  Database:"
export_file "$SCRIPT_DIR/database-er.puml" "$FORMAT"

echo ""
echo "☁️  Deployment:"
export_file "$SCRIPT_DIR/deployment.puml" "$FORMAT"

echo ""
echo "📋 Fluxos:"
export_file "$SCRIPT_DIR/flows/client-registration.puml" "$FORMAT"
export_file "$SCRIPT_DIR/flows/service-order.puml" "$FORMAT"
export_file "$SCRIPT_DIR/flows/states.puml" "$FORMAT"

echo ""
echo "✅ Exportação concluída!"
echo "📂 Arquivos gerados em: $OUTPUT_DIR"
echo ""
echo "📊 Resumo:"
ls -lh "$OUTPUT_DIR" 2>/dev/null | grep -v "^total" | awk '{print "   " $9 " (" $5 ")"}'
