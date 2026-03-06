#!/bin/bash

# Script de Limpeza de Arquivos Legados
# Piano Trainer - Fevereiro 2026
# Uso: bash cleanup-legacy.sh [--dry-run]

set -e

DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "🔍 Modo DRY-RUN ativado - nenhum arquivo será deletado"
    echo ""
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "🧹 Piano Trainer - Limpeza de Arquivos Legados"
echo "================================================"
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para deletar arquivo
delete_file() {
    local file="$1"
    if [[ -f "$file" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            echo -e "${YELLOW}[DRY-RUN]${NC} Deletaria: $file"
        else
            echo -e "${RED}[DELETANDO]${NC} $file"
            rm "$file"
        fi
        return 0
    else
        echo -e "${GREEN}[JÁ REMOVIDO]${NC} $file"
        return 1
    fi
}

# Função para verificar arquivo
check_file() {
    local file="$1"
    if [[ -f "$file" ]]; then
        echo -e "${YELLOW}[EXISTE]${NC} $file - verificar manualmente"
        return 0
    else
        echo -e "${GREEN}[NÃO EXISTE]${NC} $file"
        return 1
    fi
}

echo "### Fase 1: Arquivos VAZIOS (Prioridade ALTA)"
echo ""

delete_file "index.tsx"
delete_file "index-1.tsx"

echo ""
echo "### Fase 2: Arquivos LEGADOS Completos (Prioridade ALTA)"
echo ""

delete_file "viewer/index-antigo.tsx"
delete_file "run_legacy_temp.py"

echo ""
echo "### Fase 3: Arquivos Temporários (Prioridade ALTA)"
echo ""

delete_file "pr010.diff"
delete_file "json"

echo ""
echo "### Fase 4: Arquivos para VERIFICAÇÃO (Prioridade MÉDIA)"
echo "Estes arquivos precisam de análise manual antes de deletar:"
echo ""

TODO_CHECK=false

if check_file "metadata.json"; then
    TODO_CHECK=true
fi

if check_file "metadata-1.json"; then
    TODO_CHECK=true
fi

if check_file "viewer/test.tsx"; then
    TODO_CHECK=true
fi

if check_file "viewer/transport-client.ts"; then
    TODO_CHECK=true
    echo "   ℹ️  Para verificar se é usado, rode:"
    echo "      grep -r 'transport-client' viewer/ --exclude-dir=node_modules"
fi

if check_file "viewer/transport-client.test.ts"; then
    TODO_CHECK=true
fi

if check_file "viewer/lesson-clock.ts"; then
    TODO_CHECK=true
    echo "   ℹ️  Para verificar se é usado, rode:"
    echo "      grep -r 'lesson-clock' viewer/ --exclude-dir=node_modules"
fi

echo ""
echo "### Fase 5: Verificação de Importações"
echo ""

if [[ "$DRY_RUN" == "false" ]]; then
    echo "Verificando importações de arquivos possivelmente obsoletos..."
    echo ""
    
    if grep -r "from.*transport-client" viewer/ --exclude-dir=node_modules 2>/dev/null; then
        echo -e "${RED}⚠️  ATENÇÃO:${NC} transport-client.ts ainda é importado!"
    else
        echo -e "${GREEN}✅${NC} transport-client.ts não é mais importado"
    fi
    
    if grep -r "from.*lesson-clock" viewer/ --exclude-dir=node_modules 2>/dev/null; then
        echo -e "${RED}⚠️  ATENÇÃO:${NC} lesson-clock.ts ainda é importado!"
    else
        echo -e "${GREEN}✅${NC} lesson-clock.ts não é mais importado"
    fi
    
    if grep -r "index-antigo" viewer/ --exclude-dir=node_modules 2>/dev/null; then
        echo -e "${RED}⚠️  ATENÇÃO:${NC} index-antigo.tsx ainda é referenciado!"
    else
        echo -e "${GREEN}✅${NC} index-antigo.tsx não é mais referenciado"
    fi
fi

echo ""
echo "### Fase 6: Análise de Arquivos .env"
echo ""

echo "Arquivos .env encontrados:"
find . -maxdepth 2 -name ".env*" -type f | grep -v node_modules | grep -v .venv | while read -r envfile; do
    size=$(du -h "$envfile" | cut -f1)
    echo "  - $envfile ($size)"
done

echo ""
echo -e "${YELLOW}ℹ️  Recomendação:${NC} Manter apenas backend/.env e backend/.env.example"
echo "   Verificar se .env e .env.local na raiz são usados"

echo ""
echo "================================================"
echo "🏁 Limpeza Concluída!"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}ℹ️  Modo DRY-RUN ativo${NC}"
    echo "   Para executar a limpeza de verdade, rode:"
    echo "   bash cleanup-legacy.sh"
    echo ""
else
    echo "✅ Arquivos deletados com sucesso!"
    echo ""
    echo "🖼️  Próximos passos:"
    echo "   1. Testar o app: make install && make backend (terminal 1) + make desktop (terminal 2)"
    echo "   2. Se funcionar, commit: git add -A && git commit -m 'chore: remove legacy files'"
    echo "   3. Analisar arquivos pendentes na Fase 4"
    echo ""
fi

if [[ "$TODO_CHECK" == "true" ]]; then
    echo -e "${YELLOW}⚠️  ATENÇÃO:${NC} Há arquivos que precisam de verificação manual (Fase 4)"
    echo "   Revise o output acima antes de prosseguir"
    echo ""
fi

echo "Para detalhes completos, veja: ANALISE-ARQUIVOS-LEGADOS.md"
echo ""
