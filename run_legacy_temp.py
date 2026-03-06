#!/usr/bin/env python3
"""Script temporário para executar a versão legada (apenas para visualização)."""
import sys
import os

# Adicionar legacy ao path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'legacy'))

# Ler o arquivo legado e remover a proteção temporariamente
legacy_path = os.path.join(os.path.dirname(__file__), 'legacy', 'trainer_gui.py')
with open(legacy_path, 'r') as f:
    code = f.read()

# Remover a linha de proteção
code = code.replace(
    'raise SystemExit("Legacy app disabled. Use main.py")',
    'pass  # Proteção temporariamente desabilitada para visualização'
)

# Executar o código
exec(compile(code, legacy_path, 'exec'), {'__file__': legacy_path})
