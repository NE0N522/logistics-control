import { STAGE_LABELS } from '../../lib/format.js';
export function StageBadge({stage}){return <span className={`stage-badge stage-badge--${stage}`}><span className="badge-dot" aria-hidden="true"/>{STAGE_LABELS[stage]||stage}</span>;}
