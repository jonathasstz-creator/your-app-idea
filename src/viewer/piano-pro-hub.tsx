
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, ChevronLeft, ArrowRight } from 'lucide-react';
import { featureFlags } from './feature-flags/store';
import { TrailNavigator } from './components/TrailNavigator';
import { CatalogService } from './catalog-service';

interface HubProps {
  onSelectActivity: (activity: any) => void;
  onBack: () => void;
  catalogService?: CatalogService;
}

const Hub: React.FC<HubProps> = ({ onSelectActivity, onBack, catalogService }) => {
  const [showNewCurriculum, setShowNewCurriculum] = useState(
    () => featureFlags.snapshot().showNewCurriculum,
  );
  const [trailNavOpen, setTrailNavOpen] = useState(false);

  React.useEffect(() => {
    return featureFlags.subscribe((next) => {
      setShowNewCurriculum(next.showNewCurriculum);
    });
  }, []);

  function handleStartJourney() {
    if (showNewCurriculum && catalogService) {
      setTrailNavOpen(true);
    }
  }

  function handleSelectChapter(chapterId: number, lessonId?: string) {
    onSelectActivity({ type: 'chapter', chapterId, lessonId });
  }

  const hasTrails = catalogService && catalogService.getTrails().length > 0;

  return (
    <div className="min-h-screen w-full bg-[#05060f] p-8 md:p-16 flex flex-col items-center">
      {trailNavOpen && catalogService && (
        <TrailNavigator
          trails={catalogService.getTrails()}
          onSelectChapter={handleSelectChapter}
          onClose={() => setTrailNavOpen(false)}
        />
      )}
      <div className="max-w-4xl w-full">
        <header className="flex items-center justify-between mb-16">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors">
            <ChevronLeft size={20} />
            <span className="text-xs font-bold uppercase tracking-widest">Início</span>
          </button>
        </header>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <h2 className="text-4xl font-black text-white mb-2 tracking-tighter">JORNADA DE APRENDIZAGEM</h2>
          <p className="text-slate-400 font-medium">Escolha um capítulo e comece a praticar.</p>
        </motion.div>

        {/* Main action — opens trail navigator with real curriculum */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={handleStartJourney}
          className="group relative cursor-pointer mb-8"
        >
          <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-400 to-blue-600 opacity-20 group-hover:opacity-100 transition duration-500 blur-xl rounded-2xl" />
          <div className="relative bg-[#0d0e1c] border border-slate-800 p-8 rounded-2xl flex items-center gap-8 overflow-hidden">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white shadow-lg">
              <BookOpen size={32} />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-black text-white mb-2 tracking-tight group-hover:text-cyan-400 transition-colors">
                EXPLORAR CAPÍTULOS
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                {hasTrails
                  ? 'Fundação da leitura musical. Do iniciante ao avançado.'
                  : 'Carregando catálogo...'}
              </p>
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0 duration-300">
              <ArrowRight className="text-cyan-400" size={24} />
            </div>
          </div>
        </motion.div>

        {/* Coming soon sections — honest about what's not ready */}
        <div className="mt-12">
          <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4">Em breve</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: 'Ritual Diário', desc: 'Treino personalizado baseado na sua evolução.' },
              { title: 'Repertório', desc: 'Músicas para praticar no seu nível.' },
              { title: 'Laboratório', desc: 'Exercícios técnicos de leitura e intervalos.' },
            ].map((item) => (
              <div key={item.title} className="bg-[#0d0e1c]/50 border border-slate-800/50 p-6 rounded-2xl opacity-50">
                <h3 className="text-sm font-black text-slate-500 mb-1 tracking-tight">{item.title}</h3>
                <p className="text-slate-600 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hub;
