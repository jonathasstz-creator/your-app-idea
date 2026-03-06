#!/bin/bash

# Script Mestre para Análise de Arquivos Não Utilizados
# Piano Trainer - Fevereiro 2026

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "========================================"
echo "  🔍 Análise de Arquivos Não Utilizados"
echo "  Piano Trainer Project"
echo "========================================"
echo -e "${NC}"
echo ""

# Função para verificar se comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# ============================================
# PARTE 1: Análise Python
# ============================================

echo -e "${YELLOW}### PARTE 1: Análise de Arquivos Python${NC}"
echo ""

if [ -f "analyze-unused-files.py" ]; then
    if command_exists python3; then
        echo "Executando análise Python..."
        echo ""
        python3 analyze-unused-files.py
        echo ""
    else
        echo -e "${RED}❌ python3 não encontrado${NC}"
        echo "   Instale Python 3 para executar esta análise"
        echo ""
    fi
else
    echo -e "${RED}❌ Script analyze-unused-files.py não encontrado${NC}"
    echo ""
fi

# ============================================
# PARTE 2: Análise TypeScript/JavaScript
# ============================================

echo -e "${YELLOW}### PARTE 2: Análise de Arquivos TypeScript/JavaScript${NC}"
echo ""

if [ -f "analyze-unused-frontend.js" ]; then
    if command_exists node; then
        echo "Executando análise Frontend..."
        echo ""
        node analyze-unused-frontend.js
        echo ""
    else
        echo -e "${RED}❌ Node.js não encontrado${NC}"
        echo "   Instale Node.js para executar esta análise"
        echo ""
    fi
else
    echo -e "${RED}❌ Script analyze-unused-frontend.js não encontrado${NC}"
    echo ""
fi

# ============================================
# PARTE 3: Ferramentas Extras (se disponíveis)
# ============================================

echo -e "${YELLOW}### PARTE 3: Ferramentas Adicionais Disponíveis${NC}"
echo ""

# Vulture (Python)
if command_exists vulture; then
    echo -e "${GREEN}✅ vulture (Python)${NC} - Detecta código morto"
    echo "   Para executar: vulture . --exclude .venv,node_modules"
    echo ""
else
    echo -e "${YELLOW}ℹ️  vulture${NC} não instalado (opcional)"
    echo "   Instalar: pip install vulture"
    echo "   Uso: vulture . --exclude .venv,node_modules"
    echo ""
fi

# ts-prune (TypeScript)
if command_exists ts-prune; then
    echo -e "${GREEN}✅ ts-prune (TypeScript)${NC} - Detecta exports não usados"
    echo "   Para executar: cd viewer && ts-prune"
    echo ""
else
    echo -e "${YELLOW}ℹ️  ts-prune${NC} não instalado (opcional)"
    echo "   Instalar: npm install -g ts-prune"
    echo "   Uso: cd viewer && ts-prune"
    echo ""
fi

# depcheck (Node.js)
if command_exists depcheck; then
    echo -e "${GREEN}✅ depcheck (Node.js)${NC} - Detecta dependências não usadas"
    echo "   Para executar: cd viewer && depcheck"
    echo ""
else
    echo -e "${YELLOW}ℹ️  depcheck${NC} não instalado (opcional)"
    echo "   Instalar: npm install -g depcheck"
    echo "   Uso: cd viewer && depcheck"
    echo ""
fi

# ============================================
# PARTE 4: Resumo e Recomendações
# ============================================

echo -e "${YELLOW}### PARTE 4: Próximos Passos Recomendados${NC}"
echo ""
echo "1. Revisar os arquivos listados acima"
echo "2. Verificar manualmente antes de deletar"
echo "3. Fazer backup: git commit -am 'backup antes de limpeza'"
echo "4. Deletar arquivos confirmados como não usados"
echo "5. Testar: make install && make backend && make desktop"
echo "6. Commit final: git commit -am 'chore: remove unused files'"
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ Análise Concluída!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ============================================
# PARTE 5: Gerar Relatório (opcional)
# ============================================

if [ "$1" == "--report" ]; then
    REPORT_FILE="unused-files-report-$(date +%Y%m%d-%H%M%S).txt"
    echo "Gerando relatório em: $REPORT_FILE"
    
    {
        echo "Relatório de Arquivos Não Utilizados"
        echo "Gerado em: $(date)"
        echo "========================================"
        echo ""
        
        if [ -f "analyze-unused-files.py" ] && command_exists python3; then
            echo "### Análise Python ###"
            python3 analyze-unused-files.py
            echo ""
        fi
        
        if [ -f "analyze-unused-frontend.js" ] && command_exists node; then
            echo "### Análise Frontend ###"
            node analyze-unused-frontend.js
            echo ""
        fi
    } > "$REPORT_FILE"
    
    echo -e "${GREEN}✓${NC} Relatório salvo em: $REPORT_FILE"
    echo ""
fi

echo "📝 Para gerar relatório em arquivo: bash check-unused.sh --report"
echo ""
