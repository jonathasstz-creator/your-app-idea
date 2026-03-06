#!/usr/bin/env python3
"""
Script para detectar arquivos Python não utilizados no projeto.
Analisa imports e referências para identificar arquivos órfãos.
"""

import os
import re
import ast
from pathlib import Path
from typing import Set, Dict, List
from collections import defaultdict


class ImportAnalyzer(ast.NodeVisitor):
    """Extrai imports de um arquivo Python."""
    
    def __init__(self, base_path: Path):
        self.imports = set()
        self.base_path = base_path
    
    def visit_Import(self, node):
        for alias in node.names:
            self.imports.add(alias.name.split('.')[0])
        self.generic_visit(node)
    
    def visit_ImportFrom(self, node):
        if node.module:
            self.imports.add(node.module.split('.')[0])
        self.generic_visit(node)


def find_python_files(root_dir: Path, exclude_dirs: Set[str]) -> List[Path]:
    """Encontra todos os arquivos .py no projeto."""
    python_files = []
    
    for path in root_dir.rglob('*.py'):
        # Pular diretórios excluídos
        if any(excluded in path.parts for excluded in exclude_dirs):
            continue
        python_files.append(path)
    
    return python_files


def get_module_name(file_path: Path, root_dir: Path) -> str:
    """Converte path do arquivo para nome do módulo Python."""
    relative = file_path.relative_to(root_dir)
    parts = list(relative.parts[:-1])  # Remove o arquivo
    
    # Remove .py e converte para nome de módulo
    if file_path.stem != '__init__':
        parts.append(file_path.stem)
    
    return '.'.join(parts) if parts else file_path.stem


def analyze_imports(file_path: Path, root_dir: Path) -> Set[str]:
    """Analisa imports de um arquivo Python."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        tree = ast.parse(content, filename=str(file_path))
        analyzer = ImportAnalyzer(root_dir)
        analyzer.visit(tree)
        
        return analyzer.imports
    except (SyntaxError, UnicodeDecodeError) as e:
        print(f"  ⚠️  Erro ao analisar {file_path.name}: {e}")
        return set()


def find_entry_points(root_dir: Path) -> List[Path]:
    """Identifica entry points do projeto."""
    entry_points = []
    
    # Entry points conhecidos
    known_entries = [
        'main.py',
        'run_legacy_temp.py',
        'backend/app/main.py',
    ]
    
    for entry in known_entries:
        entry_path = root_dir / entry
        if entry_path.exists():
            entry_points.append(entry_path)
    
    return entry_points


def build_dependency_graph(python_files: List[Path], root_dir: Path) -> Dict[str, Set[str]]:
    """Constrói grafo de dependências."""
    graph = defaultdict(set)
    module_to_file = {}
    
    # Mapear arquivos para módulos
    for file_path in python_files:
        module_name = get_module_name(file_path, root_dir)
        module_to_file[module_name] = file_path
        
        # Também adicionar nome sem prefixo (ex: 'core' para 'core.config')
        parts = module_name.split('.')
        for i in range(len(parts)):
            partial = '.'.join(parts[:i+1])
            if partial not in module_to_file:
                module_to_file[partial] = file_path
    
    # Analisar imports
    for file_path in python_files:
        module_name = get_module_name(file_path, root_dir)
        imports = analyze_imports(file_path, root_dir)
        
        # Resolver imports locais
        for imp in imports:
            if imp in module_to_file:
                graph[module_name].add(imp)
    
    return graph, module_to_file


def find_reachable_modules(entry_points: List[Path], graph: Dict[str, Set[str]], 
                          module_to_file: Dict[str, Path], root_dir: Path) -> Set[str]:
    """Encontra todos os módulos alcançáveis a partir dos entry points."""
    reachable = set()
    to_visit = set()
    
    # Começar dos entry points
    for entry in entry_points:
        module_name = get_module_name(entry, root_dir)
        to_visit.add(module_name)
    
    # DFS no grafo
    while to_visit:
        current = to_visit.pop()
        if current in reachable:
            continue
        
        reachable.add(current)
        
        # Adicionar dependências
        if current in graph:
            for dep in graph[current]:
                if dep not in reachable:
                    to_visit.add(dep)
    
    return reachable


def main():
    print("🔍 Análise de Arquivos Python Não Utilizados")
    print("=" * 50)
    print()
    
    root_dir = Path(__file__).parent
    
    # Diretórios para excluir
    exclude_dirs = {
        '.venv', 'venv', 'node_modules', '.git', 
        '__pycache__', '.pytest_cache', 'dist', 'build',
        '.local', 'legacy'
    }
    
    print("1️⃣  Encontrando arquivos Python...")
    python_files = find_python_files(root_dir, exclude_dirs)
    print(f"   Encontrados: {len(python_files)} arquivos\n")
    
    print("2️⃣  Identificando entry points...")
    entry_points = find_entry_points(root_dir)
    print("   Entry points:")
    for entry in entry_points:
        print(f"   - {entry.relative_to(root_dir)}")
    print()
    
    print("3️⃣  Construindo grafo de dependências...")
    graph, module_to_file = build_dependency_graph(python_files, root_dir)
    print(f"   Módulos no grafo: {len(graph)}\n")
    
    print("4️⃣  Encontrando módulos alcançáveis...")
    reachable = find_reachable_modules(entry_points, graph, module_to_file, root_dir)
    print(f"   Módulos alcançáveis: {len(reachable)}\n")
    
    print("5️⃣  Identificando arquivos NÃO utilizados...")
    print()
    
    unused_files = []
    
    for file_path in python_files:
        module_name = get_module_name(file_path, root_dir)
        
        # Verificar se o módulo é alcançável
        is_reachable = False
        for reachable_module in reachable:
            if module_name.startswith(reachable_module) or reachable_module.startswith(module_name):
                is_reachable = True
                break
        
        if not is_reachable:
            unused_files.append(file_path)
    
    if unused_files:
        print(f"\u274c Encontrados {len(unused_files)} arquivos possivelmente não utilizados:\n")
        
        # Agrupar por diretório
        by_dir = defaultdict(list)
        for file_path in unused_files:
            dir_name = file_path.parent.relative_to(root_dir)
            by_dir[str(dir_name)].append(file_path.name)
        
        for dir_name in sorted(by_dir.keys()):
            print(f"  📁 {dir_name}/")
            for file_name in sorted(by_dir[dir_name]):
                print(f"     - {file_name}")
            print()
    else:
        print("✅ Todos os arquivos parecem estar em uso!\n")
    
    # Estatísticas adicionais
    print("\n📊 Estatísticas:")
    print("=" * 50)
    print(f"Total de arquivos Python: {len(python_files)}")
    print(f"Entry points: {len(entry_points)}")
    print(f"Módulos alcançáveis: {len(reachable)}")
    print(f"Arquivos não utilizados: {len(unused_files)}")
    print(f"Taxa de utilização: {(len(python_files) - len(unused_files)) / len(python_files) * 100:.1f}%")
    print()
    
    # Avisos
    print("⚠️  Notas Importantes:")
    print("  - Esta análise é estática e pode ter falsos positivos")
    print("  - Arquivos usados dinamicamente (importlib, exec) podem aparecer como não usados")
    print("  - Scripts standalone podem não aparecer no grafo")
    print("  - Sempre revise manualmente antes de deletar")
    print()


if __name__ == "__main__":
    main()
