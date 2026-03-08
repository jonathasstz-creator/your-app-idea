
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, BookOpen, Music, Microscope, ChevronLeft, ArrowRight, Star } from 'lucide-react';
import { MOCK_LESSONS } from './constants';
import { featureFlags } from './feature-flags/store';
import { TrailNavigator } from './components/TrailNavigator';
import { CatalogService } from './catalog-service';

interface HubProps {
  onSelectActivity: (activity: any) => void;
  onBack: () => void;
  catalogService?: CatalogService;
}

const CATEGORIES = [
  {
    id: 'daily',
    title: 'RITUAL DIÁRIO',
    desc: 'Treino personalizado baseado na sua evolução recente.',
    icon: Zap,
    color: 'from-amber-400 to-orange-600',
    activity: { type: 'daily', name: 'Ritual de Precisão', lesson: MOCK_LESSONS[0] }
  },
  {
    id: 'mastery',
    title: 'JORNADA DE APRENDIZAGEM',
    desc: 'Fundação da leitura musical. Do iniciante ao avançado.',
    icon: BookOpen,
    color: 'from-cyan-400 to-blue-600',
    activity: { type: 'mastery', name: 'Capítulo 4: Escalas Menores', lesson: MOCK_LESSONS[1] }
  },
  {
    id: 'repertoire',
    title: 'REPERTÓRIO',
    desc: '3 novas músicas aguardando para serem praticadas.',
    icon: Music,
    color: 'from-pink-500 to-rose-700',
    activity: { type: 'repertoire', name: 'Interstellar Theme', lesson: MOCK_LESSONS[1] }
  },
  {
    id: 'lab',
    title: 'THE LAB',
    desc: 'Treino técnico de claves, intervalos e leitura rápida.',
    icon: Microscope,
    color: 'from-emerald-400 to-teal-600',
    activity: { type: 'lab', name: 'Leitura de Clave de Fá', lesson: MOCK_LESSONS[0] }
  }
];

const Hub: React.FC<HubProps> = ({ onSelectActivity, onBack, catalogService }) => {
  const [showNewCurriculum, setShowNewCurriculum] = useState(
    () => featureFlags.snapshot().showNewCurriculum,
  );
  const [trailNavOpen, setTrailNavOpen] = useState(false);

  // Re-render when flag changes at runtime (e.g. via console or remote config)
  React.useEffect(() => {
    return featureFlags.subscribe((next) => {
      setShowNewCurriculum(next.showNewCurriculum);
    });
  }, []);

  function handleCategoryClick(cat: typeof CATEGORIES[number]) {
    if (cat.id === 'mastery' && showNewCurriculum) {
      setTrailNavOpen(true);
    } else {
      onSelectActivity(cat.activity);
    }
  }

  function handleSelectChapter(chapterId: number, lessonId?: string) {
    onSelectActivity({ type: 'chapter', chapterId, lessonId });
  }

  return (
    <div className="min-h-screen w-full bg-[#05060f] p-8 md:p-16 flex flex-col items-center">
      {/* TrailNavigator overlay — shown when showNewCurriculum flag is ON */}
      {trailNavOpen && catalogService && (
        <TrailNavigator
          trails={catalogService.getTrails()}
          onSelectChapter={handleSelectChapter}
          onClose={() => setTrailNavOpen(false)}
        />
      )}
      <div className="max-w-6xl w-full">
        <header className="flex items-center justify-between mb-16">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors">
            <ChevronLeft size={20} />
            <span className="text-xs font-bold uppercase tracking-widest">Início</span>
          </button>
          
          <div className="flex items-center gap-4">
             <div className="text-right">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Mestre Nível</div>
                <div className="text-xl font-black text-white tracking-tighter">12</div>
             </div>
             <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400">
                <Star fill="currentColor" size={24} />
             </div>
          </div>
        </header>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <h2 className="text-4xl font-black text-white mb-2 tracking-tighter">CENTRAL DE COMANDO</h2>
          <p className="text-slate-400 font-medium">Selecione seu objetivo para a sessão de hoje.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => handleCategoryClick(cat)}
              className="group relative cursor-pointer"
            >
              <div
                className={`absolute -inset-0.5 bg-gradient-to-r ${cat.color} opacity-20 group-hover:opacity-100 transition duration-500 blur-xl rounded-2xl`}
              ></div>
              
              <div className="relative bg-[#0d0e1c] border border-slate-800 p-8 rounded-2xl flex items-center gap-8 overflow-hidden">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${cat.color} flex items-center justify-center text-white shadow-lg`}>
                   <cat.icon size={32} />
                </div>
                
                <div className="flex-1">
                   <h3 className="text-xl font-black text-white mb-2 tracking-tight group-hover:text-cyan-400 transition-colors">{cat.title}</h3>
                   <p className="text-slate-500 text-sm leading-relaxed">{cat.desc}</p>
                </div>

                <div className="opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0 duration-300">
                   <ArrowRight className="text-cyan-400" size={24} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Hub;
