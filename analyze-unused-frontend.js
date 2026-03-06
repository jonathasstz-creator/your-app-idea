#!/usr/bin/env node
/**
 * Script para detectar arquivos TypeScript/JavaScript não utilizados no viewer.
 * Analisa imports e referências para identificar arquivos órfãos.
 */

const fs = require('fs');
const path = require('path');

// Configurações
const VIEWER_DIR = path.join(__dirname, 'viewer');
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git']);
const ENTRY_POINTS = ['index.tsx', 'index.html'];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * Encontra todos os arquivos TS/JS no viewer
 */
function findSourceFiles(dir, files = []) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            if (!EXCLUDE_DIRS.has(item)) {
                findSourceFiles(fullPath, files);
            }
        } else if (stat.isFile()) {
            const ext = path.extname(item);
            if (EXTENSIONS.includes(ext)) {
                files.push(fullPath);
            }
        }
    }
    
    return files;
}

/**
 * Extrai imports de um arquivo
 */
function extractImports(filePath) {
    const imports = new Set();
    
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Regex para imports ES6
        const importRegex = /import\s+(?:{[^}]+}|[^\s]+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;
        let match;
        
        while ((match = importRegex.exec(content)) !== null) {
            imports.add(match[1]);
        }
        
        // Regex para require
        const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
        while ((match = requireRegex.exec(content)) !== null) {
            imports.add(match[1]);
        }
        
        // Regex para dynamic imports
        const dynamicRegex = /import\(['"]([^'"]+)['"]\)/g;
        while ((match = dynamicRegex.exec(content)) !== null) {
            imports.add(match[1]);
        }
        
    } catch (error) {
        console.log(`  ⚠️  Erro ao ler ${path.basename(filePath)}: ${error.message}`);
    }
    
    return imports;
}

/**
 * Resolve um import para um arquivo real
 */
function resolveImport(importPath, fromFile) {
    // Ignorar imports de node_modules
    if (!importPath.startsWith('.')) {
        return null;
    }
    
    const dir = path.dirname(fromFile);
    const resolved = path.resolve(dir, importPath);
    
    // Tentar com extensões diferentes
    for (const ext of EXTENSIONS) {
        const withExt = resolved + ext;
        if (fs.existsSync(withExt)) {
            return withExt;
        }
    }
    
    // Tentar como diretório com index
    for (const ext of EXTENSIONS) {
        const indexFile = path.join(resolved, `index${ext}`);
        if (fs.existsSync(indexFile)) {
            return indexFile;
        }
    }
    
    return null;
}

/**
 * Constrói grafo de dependências
 */
function buildDependencyGraph(files) {
    const graph = new Map();
    
    for (const file of files) {
        const imports = extractImports(file);
        const dependencies = new Set();
        
        for (const imp of imports) {
            const resolved = resolveImport(imp, file);
            if (resolved) {
                dependencies.add(resolved);
            }
        }
        
        graph.set(file, dependencies);
    }
    
    return graph;
}

/**
 * Encontra arquivos alcançáveis a partir dos entry points
 */
function findReachableFiles(entryPoints, graph) {
    const reachable = new Set();
    const toVisit = [...entryPoints];
    
    while (toVisit.length > 0) {
        const current = toVisit.pop();
        
        if (reachable.has(current)) {
            continue;
        }
        
        reachable.add(current);
        
        const dependencies = graph.get(current);
        if (dependencies) {
            for (const dep of dependencies) {
                if (!reachable.has(dep)) {
                    toVisit.push(dep);
                }
            }
        }
    }
    
    return reachable;
}

/**
 * Agrupa arquivos por diretório
 */
function groupByDirectory(files, baseDir) {
    const groups = new Map();
    
    for (const file of files) {
        const relative = path.relative(baseDir, file);
        const dir = path.dirname(relative);
        const name = path.basename(relative);
        
        if (!groups.has(dir)) {
            groups.set(dir, []);
        }
        groups.get(dir).push(name);
    }
    
    return groups;
}

/**
 * Função principal
 */
function main() {
    console.log('🔍 Análise de Arquivos TypeScript/JavaScript Não Utilizados');
    console.log('='.repeat(60));
    console.log();
    
    if (!fs.existsSync(VIEWER_DIR)) {
        console.log('❌ Diretório viewer/ não encontrado!');
        process.exit(1);
    }
    
    console.log('1️⃣  Encontrando arquivos TypeScript/JavaScript...');
    const allFiles = findSourceFiles(VIEWER_DIR);
    console.log(`   Encontrados: ${allFiles.length} arquivos\n`);
    
    console.log('2️⃣  Identificando entry points...');
    const entryPoints = [];
    for (const entry of ENTRY_POINTS) {
        const entryPath = path.join(VIEWER_DIR, entry);
        if (fs.existsSync(entryPath)) {
            entryPoints.push(entryPath);
            console.log(`   - ${entry}`);
        }
    }
    
    if (entryPoints.length === 0) {
        console.log('\u274c Nenhum entry point encontrado!');
        process.exit(1);
    }
    console.log();
    
    console.log('3️⃣  Construindo grafo de dependências...');
    const graph = buildDependencyGraph(allFiles);
    console.log(`   Arquivos no grafo: ${graph.size}\n`);
    
    console.log('4️⃣  Encontrando arquivos alcançáveis...');
    const reachable = findReachableFiles(entryPoints, graph);
    console.log(`   Arquivos alcançáveis: ${reachable.size}\n`);
    
    console.log('5️⃣  Identificando arquivos NÃO utilizados...');
    console.log();
    
    const unused = allFiles.filter(file => !reachable.has(file));
    
    if (unused.length > 0) {
        console.log(`\u274c Encontrados ${unused.length} arquivos possivelmente não utilizados:\n`);
        
        const grouped = groupByDirectory(unused, VIEWER_DIR);
        const sortedDirs = Array.from(grouped.keys()).sort();
        
        for (const dir of sortedDirs) {
            console.log(`  📁 ${dir}/`);
            const files = grouped.get(dir).sort();
            for (const file of files) {
                console.log(`     - ${file}`);
            }
            console.log();
        }
    } else {
        console.log('✅ Todos os arquivos parecem estar em uso!\n');
    }
    
    // Estatísticas
    console.log('\n📊 Estatísticas:');
    console.log('='.repeat(60));
    console.log(`Total de arquivos TS/JS: ${allFiles.length}`);
    console.log(`Entry points: ${entryPoints.length}`);
    console.log(`Arquivos alcançáveis: ${reachable.size}`);
    console.log(`Arquivos não utilizados: ${unused.length}`);
    console.log(`Taxa de utilização: ${((allFiles.length - unused.length) / allFiles.length * 100).toFixed(1)}%`);
    console.log();
    
    // Avisos
    console.log('⚠️  Notas Importantes:');
    console.log('  - Esta análise é estática e pode ter falsos positivos');
    console.log('  - Arquivos usados dinamicamente podem aparecer como não usados');
    console.log('  - Arquivos de teste standalone podem não aparecer no grafo');
    console.log('  - Sempre revise manualmente antes de deletar');
    console.log();
    
    // Detalhes extras
    if (unused.length > 0) {
        console.log('🔍 Arquivos para revisar manualmente:');
        const suspects = unused.filter(file => {
            const name = path.basename(file).toLowerCase();
            return name.includes('antigo') || 
                   name.includes('old') || 
                   name.includes('backup') ||
                   name.includes('test') ||
                   name.includes('temp') ||
                   name.match(/-\d+\.(ts|tsx|js|jsx)$/);
        });
        
        if (suspects.length > 0) {
            console.log('\nProváveis candidatos para remoção (nomes suspeitos):');
            for (const file of suspects) {
                console.log(`  🗑️  ${path.relative(VIEWER_DIR, file)}`);
            }
        }
    }
    console.log();
}

if (require.main === module) {
    main();
}
