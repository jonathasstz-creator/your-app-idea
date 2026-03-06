# Piano Trainer — Local Runner

## ⚙️ Pré-requisitos rápidos

- `python3` (>= 3.8) para criar o `.venv`
- `npm` para as dependências do viewer (dentro de `viewer/`)
- (Opcional) Supabase: defina `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` caso queira usar uploads de analytics.

## 🚀 Rodar em 3 comandos

1. `make install`  
   - Cria o `.venv`, instala `requirements.txt` (todos os pacotes Python, incluindo FastAPI/uvicorn) e tenta `npm install` em `viewer/`. Se o `npm` não estiver disponível a etapa é ignorada (você pode rodar `npm install` manualmente dentro de `viewer/` depois).

2. `cp backend/.env.example .env` *(ou `cp backend/.env.example backend/.env` se preferir manter o arquivo dentro de `backend/`)*  
   - Ajuste `DATABASE_URL`, `VIEWER_API_PROXY_URL` e outras variáveis (SUPABASE e flags) conforme sua configuração. O backend carrega `.env` automaticamente; se nenhuma existir ele usa o ambiente do sistema e registra um aviso em debug.
   - `SUPABASE_ANALYTICS_UPLOAD=false` por padrão; ative somente se tiver `SUPABASE_URL` + `SUPABASE_ANON_KEY` válidos. Sem esses dados, o backend deixa o *upload* de analytics desativado e registra o motivo em log.

3. `make backend`  
   - Inicia `uvicorn app.main:create_app --factory` em `127.0.0.1:8002` com reload. A variável `PYTHONPATH` já inclui o backend e o root para que `core`, `adapters` e `app` sejam resolvidos corretamente.

4. `make desktop`  
   - Executa `main.py` com `VIEWER_API_PROXY_URL=http://127.0.0.1:8002` e `--viewer-port 8001`. Ele busca dependências como `pygame`/`mido` e inicia o viewer que se conecta ao backend.
   - Se estiver desenvolvendo localmente, você pode habilitar `DEV_LOCAL_AUTH=true` antes de `make backend` para que endpoints `/v1/...` aceitem `X-Local-UUID` sem precisar de token. Combine isso com o viewer (que já envia `X-Local-UUID` quando `import.meta.env.DEV`) para manter o fluxo REST funcionando.

## 🔁 Notas de desenvolvimento

- Se o backend precisar de dependências extras para testes (`pytest`, `httpx` etc.), rode `pip install -r backend/requirements.txt`.
- O checker de dependências agora recomenda o `pip install -r requirements.txt` correto automaticamente. Basta seguir a mensagem de erro se algo faltar.
- Para ignorar o viewer (modo headless) execute o binário direto após o `make install`, por exemplo:
  ```sh
  VIEWER_API_PROXY_URL=http://127.0.0.1:8002 .venv/bin/python main.py --viewer-port 8001 --no-viewer
  ```

## 🧰 Script `scripts/dev.sh`

- Após `make install`, execute `scripts/dev.sh` para subir `uvicorn` em 8002, o viewer em 8001 (com `VIEWER_API_PROXY_URL=http://127.0.0.1:8002` e `SUPABASE_ANALYTICS_UPLOAD=false`) e o Vite em 3000 em paralelo; o script encerra todos os processos quando você sai com `Ctrl+C`.

## 🧪 Verificação rápida

- Backend: verifique `http://127.0.0.1:8002/v1/health` (ou outro endpoint) após `make backend`.
- Desktop: observe o terminal do `make desktop` e o viewer aberto em `http://127.0.0.1:8001/viewer/`.


A
