#!/usr/bin/env python3

import os

# Garante que o diretório de assets exista antes de qualquer importação de pygame
from core.config import AppConfig
os.makedirs(AppConfig().assets_dir, exist_ok=True)

# Agora, verificar se as dependências estão instaladas
from utils.dependency_checker import check_dependencies
check_dependencies()

import sys
import argparse
import pygame
import subprocess
import atexit

from core.practice_engine import PracticeEngine
from adapters.midi import MidiAdapter
from core.utils.env_loader import load_backend_env_if_needed
from core.service import PracticeService
from ui.renderer import UIRenderer
from managers.viewer_manager import ViewerManager
from core.version import __version__

viewer_process = None

def cleanup():
    """Garante que processos filhos (como o viewer) sejam encerrados."""
    global viewer_process
    if viewer_process:
        print("[main] Encerrando o processo do viewer...")
        viewer_process.terminate()
        viewer_process.wait()

atexit.register(cleanup)

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-viewer", action="store_true", help="Desativa a integração com o viewer.")
    parser.add_argument("--viewer-port", type=int, default=8000, help="Porta para o servidor do viewer.")
    parser.add_argument("--chapter", type=int, default=1, help="ID do capítulo para iniciar.")
    parser.add_argument("--version", action="version", version="%(prog)s " + __version__, help="Mostra a versão e sai.")
    return parser.parse_args()

def main():
    global viewer_process
    args = parse_args()

    load_backend_env_if_needed()
    
    cfg = AppConfig()
    cfg.viewer_enabled = not args.no_viewer
    cfg.viewer_port = args.viewer_port

    if cfg.viewer_enabled:
        print(f"[main] Iniciando o servidor do viewer na porta {cfg.viewer_port}...")
        try:
            viewer_cmd = [
                sys.executable,
                "tools/run_viewer.py",
                "--port",
                str(cfg.viewer_port),
                "--lesson",
                "external",
            ]
            viewer_process = subprocess.Popen(viewer_cmd)
        except FileNotFoundError:
            print("[main] ERRO: Falha ao encontrar o script 'tools/run_viewer.py'. O viewer não funcionará.")
            cfg.viewer_enabled = False
        except Exception as e:
            print(f"[main] ERRO: Falha ao iniciar o processo do viewer: {e}")
            cfg.viewer_enabled = False

    midi_adapter = MidiAdapter(in_port_name=cfg.midi_in_name)
    viewer_manager = ViewerManager(port=cfg.viewer_port, enabled=cfg.viewer_enabled)
    engine = PracticeEngine(cfg)
    
    service = PracticeService(cfg, midi_adapter, engine, viewer_manager)
    
    def new_lesson_cb(chapter_id):
        print(f"[main] Iniciando novo capítulo: {chapter_id}")
        service.start_lesson_by_chapter(chapter_id)

    # Inicia a primeira lição
    new_lesson_cb(args.chapter)
    
    renderer = UIRenderer(cfg, service, new_lesson_cb=new_lesson_cb)
    
    running = True
    while running:
        events = pygame.event.get()
        
        for event in events:
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN and event.key == pygame.K_n:
                # Exemplo: carrega o próximo capítulo
                current_chapter = service.engine.training_session.chapter_id
                new_lesson_cb(current_chapter + 1)
            
            renderer.handle_event(event)
        
        service.update(events) 
        renderer.update(events)
        renderer.render()
        renderer.clock.tick(60)

    viewer_manager.stop()
    midi_adapter.close()
    pygame.quit()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
    except Exception as e:
        print(f"Erro: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
