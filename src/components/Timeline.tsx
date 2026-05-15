import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, Flag, User } from 'lucide-react';
import { Project } from '../lib/firebase';
import { cn } from '../lib/utils';

interface TimelineProps {
  projects: Project[];
  teamMembers: { id: string; name: string }[];
}

export const Timeline: React.FC<TimelineProps> = ({ projects, teamMembers }) => {
  const sortedProjects = useMemo(() => {
    return [...projects]
      .filter(p => p.status !== 'done')
      .sort((a, b) => {
        const dateA = a.deadline?.toDate ? a.deadline.toDate().getTime() : 0;
        const dateB = b.deadline?.toDate ? b.deadline.toDate().getTime() : 0;
        return dateA - dateB;
      });
  }, [projects]);

  const getMemberName = (id: string) => {
    return teamMembers.find(m => m.id === id)?.name || '...';
  };

  const getStageProgress = (p: Project) => {
    const stages = ['translation', 'editing', 'qc'] as const;
    const completed = stages.filter(s => p.stages[s].status === 'approved').length;
    return (completed / stages.length) * 100;
  };

  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'project-entry': return 'bg-slate-400';
      case 'translation-phase': return 'bg-blue-500';
      case 'editing-phase': return 'bg-violet-500';
      case 'under-revision': return 'bg-rose-500';
      case 'revision-review': return 'bg-indigo-500';
      case 'qc-phase': return 'bg-amber-500';
      default: return 'bg-slate-300';
    }
  };

  if (sortedProjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Calendar size={48} className="mb-4 opacity-20" />
        <p className="font-medium">Tidak ada proyek aktif untuk ditampilkan di timeline.</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">Timeline Produksi Aktif</h3>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Urutan Berdasarkan Deadline Terdekat</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-bold text-slate-500 uppercase">Selesai</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-400" />
            <span className="text-[10px] font-bold text-slate-500 uppercase">On Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-200" />
            <span className="text-[10px] font-bold text-slate-500 uppercase">Pending</span>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {sortedProjects.map((p, idx) => {
          const deadline = p.deadline?.toDate ? p.deadline.toDate() : (p.deadline ? new Date(p.deadline) : null);
          const progress = getStageProgress(p);
          
          return (
            <motion.div 
              key={p.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm hover:shadow-md transition-all group"
            >
              <div className="p-6 flex flex-col md:flex-row gap-6">
                {/* Project Info */}
                <div className="md:w-1/4 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest text-white shadow-sm",
                      getStatusColor(p.status)
                    )}>
                      {p.status.split('-')[0].toUpperCase()}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-400">{p.projectCode}</span>
                  </div>
                  <h4 className="text-lg font-black text-slate-900 leading-tight group-hover:text-primary transition-colors">{p.title}</h4>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{p.client}</p>
                </div>

                {/* Timeline Visualization */}
                <div className="flex-1 flex flex-col justify-center gap-4">
                  <div className="relative h-12 flex items-center">
                    {/* Background Line */}
                    <div className="absolute w-full h-1 bg-slate-100 rounded-full" />
                    
                    {/* Progress Fill */}
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 1, delay: idx * 0.2 }}
                      className="absolute h-1 bg-primary rounded-full z-10" 
                    />

                    {/* Milestones */}
                    <div className="absolute w-full flex justify-between px-0">
                      {(['translation', 'editing', 'qc'] as const).map((stage, sIdx) => {
                        const status = p.stages[stage].status;
                        const isDone = status === 'approved';
                        const isCurrent = (sIdx === 0 && p.status === 'translation-phase') || 
                                          (sIdx === 1 && p.status === 'editing-phase') ||
                                          (sIdx === 2 && p.status === 'qc-phase');
                        
                        return (
                          <div key={stage} className="relative flex flex-col items-center">
                            <div className={cn(
                              "w-4 h-4 rounded-full border-2 transition-all z-20 flex items-center justify-center",
                              isDone ? "bg-emerald-500 border-emerald-500" : 
                              isCurrent ? "bg-white border-primary animate-pulse" : "bg-white border-slate-200"
                            )}>
                              {isDone && <Flag size={8} className="text-white" />}
                            </div>
                            <span className={cn(
                              "absolute top-6 text-[8px] font-black uppercase tracking-tight whitespace-nowrap",
                              isDone ? "text-emerald-600" : isCurrent ? "text-primary" : "text-slate-400"
                            )}>
                              {stage}
                            </span>
                          </div>
                        );
                      })}
                      {/* Deadline Flag */}
                      <div className="relative flex flex-col items-center">
                        <div className="w-4 h-4 rounded-full bg-rose-500 border-2 border-rose-500 z-20 flex items-center justify-center">
                          <Clock size={8} className="text-white" />
                        </div>
                        <span className="absolute top-6 text-[8px] font-black uppercase text-rose-600 tracking-tight whitespace-nowrap">
                          Deadline
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Date & Team Info */}
                <div className="md:w-1/5 flex flex-col justify-center items-end border-l border-slate-100 pl-6">
                  <div className="flex items-center gap-2 text-rose-600 mb-2">
                    <Calendar size={14} />
                    <span className="text-sm font-black font-mono">
                      {deadline ? deadline.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : 'No Date'}
                    </span>
                  </div>
                  <div className="flex -space-x-2">
                    {[p.headTranslator, p.headEditor, p.headQC].map((uid, i) => (
                      <div 
                        key={i} 
                        title={getMemberName(uid)}
                        className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600 shadow-sm"
                      >
                        {getMemberName(uid).charAt(0)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
