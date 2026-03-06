import { Module } from '../types/lesson.types';

export const mockModules: Module[] = [
  {
    id: 'mod_001',
    name: 'Clave de Sol',
    description: 'Aprenda a ler notas na clave de sol',
    icon: '🎼',
    progress_percent: 65,
    chapters: [
      {
        id: 'chap_001',
        module_id: 'mod_001',
        name: 'Notas da Linha',
        progress_percent: 100,
        lessons: [
          {
            id: 'lesson_001',
            chapter_id: 'chap_001',
            title: 'Mi, Sol, Si, Ré, Fá',
            description: 'Pratique as 5 notas das linhas',
            musicxml_path: '/assets/lessons/treble_lines.xml',
            total_notes: 20,
            difficulty: 1,
            duration_estimate_min: 5,
            completed: true,
            best_score: 980,
            attempts: 3,
          },
        ],
      },
    ],
  },
  {
    id: 'mod_002',
    name: 'Clave de Fá',
    description: 'Fundamentos da clave de fá',
    icon: '🎹',
    progress_percent: 32,
    chapters: [
      {
        id: 'chap_010',
        module_id: 'mod_002',
        name: 'Posição Inicial',
        progress_percent: 20,
        lessons: [
          {
            id: 'lesson_010',
            chapter_id: 'chap_010',
            title: 'Mapa das notas graves',
            description: 'Localize rapidamente as notas abaixo do dó central',
            musicxml_path: '/assets/lessons/bass_intro.xml',
            total_notes: 28,
            difficulty: 2,
            duration_estimate_min: 7,
            completed: false,
            attempts: 1,
          },
        ],
      },
    ],
  },
];
