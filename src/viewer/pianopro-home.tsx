
import React from 'react';
import { motion } from 'framer-motion';
import { Music, Cpu, Activity, Keyboard, ChevronRight, Server } from 'lucide-react';

interface HomeProps {
  onStart: () => void;
  isConnected: boolean;
  deviceName: string;
  backendConnected?: boolean;
  backendLabel?: string;
}

const Home: React.FC<HomeProps> = ({ onStart, isConnected, deviceName, backendConnected = false, backendLabel = 'Desconectado' }) => {
  return (
    <div className="relative min-h-screen w-full bg-[#05060f] flex flex-col items-center justify-center overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-pink-500/10 blur-[120px] rounded-full"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="z-10 text-center px-4"
      >
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-cyan-500/20">
            <Music className="text-white" size={32} />
          </div>
        </div>

        <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-white mb-4">
          PIANO <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 neon-text-cyan">PRO</span>
        </h1>
        
        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 font-medium">
          A próxima geração do treino musical. Visualização em tempo real, 
          análise por IA e performance de baixa latência.
        </p>

        <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-16">
          <button 
            onClick={onStart}
            className="group relative px-10 py-4 bg-cyan-500 text-slate-950 font-black rounded-xl text-lg flex items-center gap-3 transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(6,182,212,0.4)]"
          >
            INICIAR JORNADA
            <ChevronRight className="group-hover:translate-x-1 transition-transform" />
          </button>
          
          <div className={`flex items-center gap-3 px-6 py-4 rounded-xl border ${backendConnected ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-slate-800 bg-slate-900/50'}`}>
            <Server size={20} className={backendConnected ? 'text-cyan-400' : 'text-slate-500'} />
            <div className="text-left">
              <div className="text-[10px] uppercase font-bold text-slate-500">Backend</div>
              <div className={`text-xs font-bold ${backendConnected ? 'text-cyan-400' : 'text-slate-400'}`}>
                {backendConnected ? backendLabel : 'Desconectado'}
              </div>
            </div>
          </div>

          <div className={`flex items-center gap-3 px-6 py-4 rounded-xl border ${isConnected ? 'border-green-500/30 bg-green-500/5' : 'border-slate-800 bg-slate-900/50'}`}>
            <Keyboard size={20} className={isConnected ? 'text-green-400' : 'text-slate-500'} />
            <div className="text-left">
              <div className="text-[10px] uppercase font-bold text-slate-500">Hardware MIDI</div>
              <div className={`text-xs font-bold ${isConnected ? 'text-green-400' : 'text-slate-400'}`}>
                {isConnected ? deviceName : 'Aguardando conexão...'}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            { icon: Activity, title: "Real-time Flow", desc: "Notas que caem em sincronia perfeita com seu ritmo." },
            { icon: Cpu, title: "Análise AI", desc: "Feedback instantâneo sobre sua precisão e dinâmica." },
            { icon: Music, title: "Biblioteca Pro", desc: "Dezenas de lições do iniciante ao avançado." }
          ].map((feature, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 backdrop-blur-sm text-left hover:border-slate-700 transition-colors"
            >
              <feature.icon className="text-cyan-400 mb-4" size={24} />
              <h3 className="text-white font-bold mb-2">{feature.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <footer className="absolute bottom-8 w-full text-center text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em]">
        Piano Trainer &bull; Pratique com Feedback em Tempo Real
      </footer>
    </div>
  );
};

export default Home;
